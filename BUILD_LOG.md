# Build Log

Live URL: https://gotnext-kobi.app.space
App ID: app_01M80KR0A76S1TVB1ANS3HQHPK
Source: DeepSpace cloud repo (`space` remote) is authoritative; GitHub `origin` is a mirror.

## Phase 1: Setup (done)
Built:
- Scaffolded with `npm create deepspace@latest gotnext-kobi` (deepspace 0.44.2, Node 24.19.0).
- Attribution blanked in `~/.claude/settings.json` and `.claude/settings.local.json` (gitignored).
- Git author set to Kobi with the GitHub noreply email; branch renamed to `main`.
- `app init` registered the app and made the first commit; renamed it to `scaffold`.
- Deployed; name `gotnext-kobi` was free.

Broke / fixed:
- `deepspace auth login` from a background shell: refused, needs an interactive terminal. Ran it in a Terminal tab instead.
- In the Terminal tab it failed with `login_session_unreachable`. Root cause: Node error `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, local HTTPS scanning re-signs traffic. Fixed with `$env:NODE_OPTIONS = '--use-system-ca'` (Node trusts the Windows certificate store) for that tab only.
- `create deepspace --yes` is not a real flag (scaffolder is non-interactive by default); harmless.

Check by hand:
- Open https://gotnext-kobi.app.space and see the starter page.

## Phase 2: Schemas (done)
Built:
- `src/schemas/{players,courts,checkins,queue,games}-schema.ts`, registered in `src/schemas.ts` (users + settings kept).
- `uniqueOn: [courtId, playerId]` on checkins and queue so double taps can't create duplicates.
- Signed-out (`'*'`) can read courts, checkins and queue (for the /courts list); players and games need sign-in.
- `src/schemas.test.ts` runs the SDK's `lintSchema` on every schema.

Broke / fixed (SPEC deviation):
- SPEC says `games.scorekeeperId` is `userBound`. Reading the SDK (`putRecord` in deepspace/dist/worker.js), a userBound field is stamped with the writer on create and frozen on every update, server actions included. That makes `handOffScorekeeper` impossible. The docs' schema-lint section also says not to add userBound when only server code creates rows.
- Fix: no userBound; `ownerField: scorekeeperId` + member `update: 'own'` + `writableFields: ['scoreA', 'scoreB']`. Browser writes are limited to the scorekeeper and to the two score fields. Server actions skip RBAC, so makeTeams/finishGame/handOff still work.

Check by hand:
- Nothing visible yet. `npm run test:unit` shows 7 schema tests passing.

## Phase 3: Pure logic + unit tests (done)
Built:
- `src/lib/score.ts` `hasWinner(scoreA, scoreB, target, winBy2)`.
- `src/lib/elo.ts` `expectedScore`, `newRating` (K=32), `teamDeltas` (team rating = average, whole-number change per player).
- `src/lib/balance.ts` `balanceTeams`: tries every N+N split (player 0 pinned to team A, 126 splits for 5v5) and keeps the smallest average gap.
- `src/lib/logic.test.ts`: balance within 25 points, 11-9 win, 11-10 not a win with winBy2, equal ratings +16/-16, plus edge cases. Run with `npm run test:unit`.

Broke / fixed:
- Nothing broke.

Check by hand:
- Run `npm run test:unit` in the gotnext-kobi folder: all tests pass.

## Phase 4: Players, court list, seed data (done, deployed)
Built:
- `src/actions/index.ts`: `ensurePlayer` (creates players/<userId> only when the get returns RECORD_NOT_FOUND, so a hiccup can't reset a rating) and `seedDemo` (owner only via `env.OWNER_USER_ID`; GSU Rec, 12 guests rated 850-1250, 3 final games with recaps; running it twice does nothing).
- `src/api.ts` `callAction()` helper (fetch + `getAuthToken`).
- `src/components/EnsurePlayer.tsx`, mounted in `(app)/_layout.tsx`, calls ensurePlayer once per sign-in.
- `src/pages/(app)/courts.tsx`: live court list with "here" and "in line" counts via `useQuery`, loading/error/empty states, owner-only "Seed demo data" button.
- `/home` now redirects to `/courts`; nav shows Courts.

Broke / fixed:
- `tsc`: `interface` types don't satisfy `Record<string, unknown>` in `tools.get<T>`. Switched `src/types.ts` to `type` aliases.
- Browser pane preview couldn't find `.claude/launch.json` (it looks in the parent folder). Added one in `Basketball/.claude/` that runs `npm --prefix gotnext-kobi run dev` with `NODE_OPTIONS=--use-system-ca`.

Verified locally:
- seedDemo as owner: created; second run: `alreadySeeded: true`; signed out: `Unauthorized`.
- ensurePlayer: `created: true`, then `created: false`.
- /courts signed out lists GSU Rec with 0 here / 0 in line, no console errors.

Check by hand:
- Sign in on the live site, open Courts, click "Seed demo data" once, see GSU Rec appear.

## Phase 5: Court page (done)
Built:
- `src/pages/(app)/(protected)/court/[id].tsx` (generouted `[id]` = `/court/:id`): check in/out, "Got next" queue in createdAt order with join/leave, "Who's here" list, add-guest form. Big full-width buttons, loading/empty/not-found states.
- `addGuest` action: caller must be checked in at that court, max 4 active guests per caller; creates guest player + checkin + queue row.
- "Add a court" form on /courts (members may create courts per SPEC); needed so tests can make their own court.
- `cleanupTestData` action: owner or `@deepspace.test` accounts only, deletes only `__test-` courts (and their games/queue/checkins) and `__test-` guests.
- Test accounts Alice and Bob created early (`alice-b5b742@deepspace.test`, `bob-b5b742@deepspace.test`, passwords only in `~/.deepspace/test-accounts.json`).
- `tests/court.spec.ts` part 1: Alice checks in, Bob sees her within 2 s; Alice adds a guest, Bob sees it in line.

Broke / fixed:
- Test emails `alice-1@deepspace.test` were taken (test emails are global); added a random suffix.
- `deepspace test run` refuses while the preview owns port 5173; run with `DEEPSPACE_PORT=5180 npx playwright test tests/court.spec.ts --config tests/playwright.config.ts`.
- Playwright had no browser; installed with `npx playwright install chromium --only-shell`.
- Tried creating the test court via `/_deepspace/agent/tools/records_create`: rejects normal user JWTs (`unauthenticated`). Switched to the real "Add a court" form.
- Guest name got cut at 24 chars; raised to 40.
- Stray "0"s on screen: boolean columns read back as 0/1, and React renders `{0 && ...}` as "0". Fixed with `!!`.

Check by hand:
- Signed in, open GSU Rec, tap Check in, Join the line, add a guest. Open the same court in a second browser and watch it update.

## Phase 6: Make teams (done, deployed)
Built:
- `makeTeams` action: caller must be checked in; refuses if a live game exists or not enough players are waiting. everyone-rotates takes the first 2N in line and balances with `balance.ts`; winners-stay keeps last game's winners who are still on court and takes the next waiting players as challengers (falls back to balancing for the first game). Creates the live game with `scorekeeperId = caller`, then marks those queue rows `playing`.
- Double-tap guard: new `games.liveKey` column (= courtId while live) with `uniqueOn: ['liveKey']`. The room runs each write one at a time and refuses a duplicate, so a second simultaneous makeTeams can't create a second live game. Empty liveKey (old/final games) never collides because SQL `NULL = NULL` is false.
- Court page: "Make teams" button and a live-game card with both teams, average ratings, score and "Open scoreboard" link.
- Test: 6 in line on a 3v3 court, Alice and Bob call makeTeams at the same time; exactly one succeeds, the other gets "already live".

Broke / fixed:
- Nothing broke this phase.

Check by hand:
- Fill GSU Rec's line to 10 with guests and tap Make teams: two teams of 5 with close averages appear.

## Phase 7: Live scoreboard (done)
Built:
- `src/pages/(app)/(protected)/game/[id].tsx`: big live score for everyone, LIVE/FINAL badge, team lists, "watching now" from `usePresenceRoom(\`game:${id}\`)` (unique peers + you).
- Scorekeeper-only +1/+2/-1 per team. They write `scoreA`/`scoreB` directly with `putConfirmed` on games (allowed by ownerField + writableFields). Buttons wait for the room's ack so fast double taps never drop a point; disabled when the game is final.
- `handOffScorekeeper` action + picker: only the current scorekeeper, only to a signed-in non-guest player in the game, only while live.
- Dev-only `window.__gotnextTest.putGame` (stripped from production builds by `import.meta.env.DEV`) so the spec can attempt a non-scorekeeper write through the same call.
- Test: Alice taps +2, Bob sees 2; Bob has no buttons and his direct write is rejected (score stays 2 for both); 2 watching; hand-off gives Bob the buttons.

Broke / fixed:
- Nothing broke this phase.

Check by hand:
- Open a live game in two browsers. Only the scorekeeper sees buttons; the other browser updates instantly and shows "2 watching now".
