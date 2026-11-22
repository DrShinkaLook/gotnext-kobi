# Got Next: SPEC
Live pickup-basketball court app. Users check in at a court, join a "got next" queue, get auto-balanced teams from Elo ratings, keep a live score, and get an AI recap after each game.

Collections:
- users: scaffold schema, keep as is.
- players: name, isGuest (bool), addedBy, rating (number, default 1000), wins, losses. recordId = userId for signed-in players. member: read true; create/update/delete false (server actions only).
- courts: name, location, teamSize (select 3|4|5, default 5), targetScore (default 11), winBy2 (bool, default true), rotation (select winners-stay|everyone-rotates, default everyone-rotates). member: read true, create true, update own, delete own.
- checkins: courtId (reference courts), playerId, checkedInAt (unix seconds). member: read true, create true, update false, delete own.
- queue: courtId, playerId, status (select waiting|playing). member: read true, create true, update false, delete own. Order by createdAt.
- games: courtId, teamA (json string[]), teamB (json string[]), scoreA, scoreB, status (select live|final), scorekeeperId (text, userBound), winner (select A|B), recap (text), recapTone (select espn|trash-talk|stats). ownerField scorekeeperId. member: read true, create false, update own, delete false.

Server actions (each checks ctx.userId itself):
- ensurePlayer: create the players row with recordId = userId if it's missing.
- addGuest({courtId, name}): caller must be checked in at that court; max 4 guests per caller. Creates the guest player (addedBy = caller), a checkin and a queue entry.
- makeTeams({courtId}): needs 2 x teamSize waiting players.
  - everyone-rotates: take the first 2N in queue order and balance them with balance.ts.
  - winners-stay: the last winners keep their team; the next N in queue are the challengers.
  - Creates a live game with scorekeeperId = caller and marks those queue rows playing. Refuses if a live game exists.
- handOffScorekeeper({gameId, toUserId}): caller must be the current scorekeeper; the target must be a signed-in, non-guest player in the game.
- finishGame({gameId}): caller is the scorekeeper, the game is live, and score.ts confirms a winner. Then:
  - Set status final and winner.
  - Update ratings with elo.ts (K=32, team rating = average) and wins/losses.
  - Requeue players who are still checked in.
  - Write the AI recap. AI failure must not block finishing.
- regenerateRecap({gameId, tone}): any player in the game can call it.
- seedDemo: owner only. GSU Rec court, 12 guest players rated 850 to 1250, 3 final games with recaps.

Pure logic in src/lib:
- balance.ts: try every split of 2N players into N+N; minimize the difference in average rating.
- elo.ts: expected = 1 / (1 + 10^((Rb - Ra)/400)); new rating = R + 32 * (result - expected).
- score.ts: hasWinner(scoreA, scoreB, target, winBy2) returns 'A', 'B' or null.

Cron: auto-checkout every 15 minutes. Delete checkins older than 3 hours and their waiting queue rows. Never touch players in a live game.

Pages:
- / landing
- /courts
- /court/:id (protected)
- /game/:id (protected), with presence "watching now"

Acceptance checks (deployed URL, two browsers):
1. A checks in; B sees it within 2 seconds.
2. Fill the queue to 10 with guests; Make teams creates balanced teams.
3. The scorekeeper taps +2 and B sees it live; B's score change is rejected.
4. Finish at 11-9: ratings change and both see the recap.
5. Finishing at 11-10 with winBy2 on is refused.
6. A check-in older than 3 hours disappears after the cron runs.
7. A signed-out visitor sees the landing page and can't write anything.
