# How Got Next works (plain English)

A cheat sheet for explaining the app in an interview. File paths are clickable on GitHub; line numbers are as of the final commit.

---

## 1. How a record write travels

Example: Alice is the scorekeeper and taps **+2** for Team A.

1. **Client.** The button calls `putConfirmed(gameId, { scoreA: 2 })` from `useMutations('games')` (`src/pages/(app)/(protected)/game/[id].tsx`, line 61). That sends a small message over the page's open WebSocket.
2. **Durable Object.** The message lands in the app's **RecordRoom**, one small server ("Durable Object") that owns all of this app's data. Every write for the app goes through this one room, one at a time.
3. **Permission check.** Before saving, the room checks the `games` schema (`src/schemas/games-schema.ts`):
   - What's Alice's role? A normal signed-in user is a `member`.
   - Members may update a game only if it's their **own** (`update: 'own'`, line 12). "Own" means `record.data.scorekeeperId === Alice's user id`, because of `ownerField: 'scorekeeperId'` (line 48).
   - Members may only change the fields in `writableFields: ['scoreA', 'scoreB']` (line 14).
   - If anything fails, the write is rejected and never saved.
4. **SQLite.** If allowed, the room writes the new value into its built-in SQLite database.
5. **Broadcast.** The room sends the changed record to every connected browser that can read it. Bob's `useQuery('games')` gets it, React re-renders, and his screen shows 2. The whole trip takes well under a second.

**Server actions are the other path.** For "Make teams" or "Finish game", the browser sends an HTTP request to `/api/actions/<name>` with the user's sign-in token. The worker verifies the token, then runs the action in `src/actions/index.ts`. Actions talk to the same RecordRoom, but with permission checks **turned off**, so every action checks the caller itself first ("only the scorekeeper can finish", and so on).

---

## 2. How only the scorekeeper can score (ownerField, userBound, writableFields)

- **`ownerField: 'scorekeeperId'`** tells the room "the owner of a game is whoever is in `scorekeeperId`", not whoever created it. Combined with `update: 'own'`, only that person can update the game from a browser.
- **`writableFields: ['scoreA', 'scoreB']`** limits that person to the two score numbers. They can't set `status: 'final'`, pick a `winner` or edit the teams from their browser.
- **`create: false` and `delete: false`** mean no browser can make or delete games at all. Only the `makeTeams` action creates them, and it sets `scorekeeperId` to the caller (`src/actions/index.ts`, line 158).
- **About `userBound`:** the SPEC asked for `userBound` on `scorekeeperId`. `userBound` makes the room stamp the writer's own id into a field on create and **refuse to change it on any later update, even from a server action**. That would make "hand off scorekeeper" impossible. The SDK's own schema lint also says not to use `userBound` when only server code creates the rows. `create: false` already stops anyone from creating a game with a fake scorekeeper, so `userBound` would add nothing. We kept `ownerField` and added `writableFields`, which is stricter.
- The game page also hides the buttons from everyone else (line 100). That's only for looks; the room's check is the real lock. The test suite proves it: Bob's direct write attempt is rejected.

---

## 3. Why ratings are server-only

- `players` has `create/update/delete: false` for every role (`src/schemas/players-schema.ts`, line 4). No browser can write a rating, even its own.
- Ratings change in exactly one place: `finishGame` (`src/actions/index.ts`, from line 190). It only runs if the caller is the scorekeeper, the game is live, and `hasWinner()` confirms a real result.
- So to "fake a win" you'd need to be the scorekeeper **and** enter a valid final score, in a game everyone is watching live.
- Cost: finishing takes one extra round trip to the server. Score taps stay instant because they're direct writes.

---

## 4. How Elo works (with a worked example)

Every player has a rating, starting at 1000. A team's rating is the **average** of its players.

1. **Expected score.** The chance Team A beats Team B is `1 / (1 + 10^((Rb - Ra) / 400))` (`src/lib/elo.ts`, line 8).
2. **New rating.** `R + K × (result − expected)`, with K = 32 (line 1) and result = 1 for a win, 0 for a loss (line 13).
3. Each player on a team gets the same change, rounded to a whole number (`teamDeltas`, line 21).

**Example:** Team A averages 1100 and Team B averages 1000.

- Expected for A = 1 / (1 + 10^(−100/400)) = 1 / (1 + 0.562) = **0.64**. So B's is 0.36.
- **A wins (the favorite):** A gets 32 × (1 − 0.64) = **+12**; B gets 32 × (0 − 0.36) = **−12**.
- **B wins (an upset):** B gets 32 × (1 − 0.36) = **+20**; A gets 32 × (0 − 0.64) = **−20**.
- **Equal teams:** expected 0.5, so the winner gets **+16** and the loser **−16** (this is a unit test).

Beating a stronger team earns more, and losing to a weaker one costs more.

---

## 5. Why balancing tries every split

`src/lib/balance.ts` takes the 2N players and checks **every** way to split them into two teams of N. It keeps the split with the smallest gap in average rating.

- For 5v5 that's 10 players. Player 1 is pinned to Team A so mirror-image splits aren't counted twice, which leaves **126** splits. A computer checks those in well under a millisecond.
- A shortcut like "sort by rating and alternate" is fast but can miss the fairest split. Trying all of them guarantees the best one.
- Unit test: 10 players rated 850 to 1250 always end up within 25 points of each other on average.
- It only gets slow for much bigger teams (20 players ≈ 92,000 splits), which pickup never needs.

---

## 6. Likely interview changes, and exactly where

**a) "Let any player score"**
- `src/schemas/games-schema.ts` line 12: change `update: 'own'` to `update: 'collaborator'`, add a `playerIds` json column, and set `collaboratorsField: 'playerIds'` next to `ownerField` (line 48).
- `src/actions/index.ts` line 158 (`makeTeams`): save `playerIds: [...teamA, ...teamB]` on the new game.
- `src/pages/(app)/(protected)/game/[id].tsx` line 47: change `isScorekeeper` to "my id is in `teamA` or `teamB`", so the buttons show (line 100).
- Guests aren't signed-in users, so they still can't score.

**b) "Add a leaderboard"**
- New file `src/pages/(app)/leaderboard.tsx`: `useQuery<Player>('players', { orderBy: 'rating', orderDir: 'desc', limit: 50 })`, skip rows where `isGuest`, and show name, rating and W-L.
- `src/nav.ts` line 19: add `{ path: '/leaderboard', label: 'Leaderboard' }`.
- No schema change: `players` is already readable by signed-in users.

**c) "Make K depend on games played"**
- `src/lib/elo.ts` line 1: add `export function kFor(games: number) { return games < 10 ? 40 : games < 30 ? 32 : 24 }`.
- `src/lib/elo.ts` line 21: `teamDeltas` already takes `k`. With a per-player K, compute each player's change as `Math.round(k × (result − expected))` instead.
- `src/actions/index.ts` lines 203-216 (`finishGame`): for each player, use `kFor(wins + losses)` when updating their rating.
- Add a unit test in `src/lib/logic.test.ts`.

**d) "Auto check-out after 2 hours instead of 3"**
- `src/lib/checkout.ts` line 2: `3 * 60 * 60` becomes `2 * 60 * 60`, then update the test in `src/lib/logic.test.ts`. The cron in `src/cron.ts` uses it automatically.

**e) "Hard cap: first to 15 wins, even without a 2-point lead"**
- `src/lib/score.ts` lines 4-9: add a `cap` parameter. If either score reaches `cap`, that side wins, before the win-by-2 rule on line 7.
- `src/actions/index.ts` `finishGame` (line 190 onward): pass the cap when calling `hasWinner`. Add a `cap` column to `src/schemas/courts-schema.ts` if each court should choose its own.
- Add a test: 15-14 wins with the cap, but not without it.
