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

## Phase 8: Finish, Elo, AI recap (done, deployed)
Built:
- `finishGame` action: scorekeeper only, game must be live, `hasWinner` must confirm a winner (11-10 with winBy2 is refused). Marks final + winner first, updates every player's rating with `teamDeltas` (K=32, team = average) plus wins/losses, stores `ratingChanges {A, B}` on the game, then requeues: players who left are removed from the line; everyone still here goes to the back (losers first); with winners-stay the winners stay on court.
- AI recap: `createDeepSpaceAI(env, 'anthropic', { authToken: ctx.callerJwt })` + `generateText` from `ai`, model `claude-haiku-5-5` (cheapest Claude in the DeepSpace AI docs), `maxOutputTokens: 200`. `src/lib/recap.ts` builds the prompt from team names, score and rating changes only (no player names); system prompt asks for clean language. Any AI error is logged and the recap stays empty.
- `regenerateRecap({gameId, tone})`: any player in the game (or its scorekeeper), final games only.
- Game page: Finish button for the scorekeeper, per-team rating change, recap card with tone picker (ESPN / Trash talk / Stats) and Regenerate.
- seedDemo now stores ratingChanges on the demo games and returns their ids.
- Tests: 11-10 finish refused with "win by 2"; 11-9 finishes, both browsers see FINAL, rating changes and the recap card; all 6 players back in line.

Broke / fixed:
- Score test was flaky (Bob sometimes saw 10 instead of 11). Cause: `putConfirmed` resolves a moment before the live update re-renders, so a fast next tap added to the old score. Fix: remember the last value sent per team for 3 s and build on it.
- A test run died with "Response has been disposed": the 30 s Playwright default ran out mid-cleanup. Set this spec's timeout to 90 s.
- Recap in tests: `[recap] AI call failed: Payment Required`. Expected: AI is billed to the caller and test accounts have no credits. Proves AI failure doesn't block finishing.
- Known limit: two finishGame calls by the same scorekeeper at the exact same instant could both pass the "live" check. The button is disabled while finishing; makeTeams has the hard room-level guard.

Check by hand:
- Finish a real game at 11-9 with your own account: ratings change and a recap appears in both browsers. Try 11-10: refused.

## Phase 9: Auto check-out cron (done)
Built:
- `src/cron.ts`: task `auto-checkout`, `intervalMinutes: 15`, using `buildCronContext(env, env.OWNER_USER_ID, 'app:<APP_ID>')`. Deletes check-ins older than 3 hours plus that player's waiting queue row; skips anyone in a live game. Logs `[auto-checkout] removed X of Y check-ins`.
- `src/lib/checkout.ts` `staleCheckins()` (pure) with unit tests: old removed, fresh kept, old-but-playing kept, exactly-3h kept.
- `npx deepspace add cron` added a 1-minute heartbeat and a `/cron-log` page; replaced both. New owner-only `/cron` page (`(protected)/cron.tsx`): task status, "Run now" (`useCronMonitor().trigger`), last 10 runs, and an "Add old check-in" helper (`addStaleCheckin` action, owner only) for acceptance check 6. Nav link shows only for admins.
- Security: the docs say members can trigger cron by default. Changed `/ws/cron/:roomId` in `src/server/realtime-routes.ts` so only `OWNER_USER_ID` gets a writer role; everyone else is a read-only viewer at the CronRoom.

Broke / fixed:
- No CLI way to trigger a cron task, and test accounts can't (owner-only by design). Verified on the live app via logs instead (see Phase 10).

Check by hand:
- Signed in as owner, open Cron, tap "Add old check-in", see "Old timer" on GSU Rec, tap "Run now", and it disappears.

## Phase 10: Polish + multi-user test (done, deployed)
Built:
- Landing page `/` (static, no auth/data): design-direction block, headline "Know who's got next.", one-line pitch, big "Find a court" button, a scoreboard + line preview built from theme tokens. Anti-AI grep gate from docs.deep.space/design/anti-ai-gate: no hits (no hard-coded colors, no emoji, no stock phrases).
- Own theme `court` (`src/themes.css`, `src/themes.ts`, `index.html` first paint): blue-black floor, chalk text, basketball orange. Display name "Got Next" in `src/constants.ts` and `wrangler.toml`; SEO description updated.
- Empty/loading/error states on courts, court, game and cron pages (done in earlier phases, re-checked at 375 px wide).
- `tests/court.spec.ts` now has 5 tests: check-in sync (<2 s), make-teams race, +2 live / Bob rejected / hand-off, finish 11-10 refused & 11-9 final, signed-out landing + every action returns 401. All `__test-<timestamp>__` data removed by `cleanupTestData`.
- Live app seeded with seedDemo (GSU Rec, 12 guests, 3 games). A real recap regenerated on live in trash-talk tone with your account.
- Live cron verified: added a 4-hour-old check-in at 03:54 UTC; at 04:09 UTC the logs show `[auto-checkout] removed 1 of 1 check-ins` and `[cron] auto-checkout ok 299ms`. Test guest then removed with cleanupTestData.

Broke / fixed:
- First full `npx deepspace test run e2e`: 7 failed (page.goto timeouts, "frame was detached", "context closed"). Cause: Playwright ran specs in parallel against one local server, and the multi-user specs share Alice/Bob. Fix: `workers: 1` in `tests/playwright.config.ts`.
- Then 2 failed on a cold server (first visit compiles the route; 5 s expect timeout too short). Fix: `expect: { timeout: 15_000 }`. Result: 16/16 pass; unit tests 22/22.

Check by hand:
- Open https://gotnext-kobi.app.space signed out: landing page, "Find a court" shows GSU Rec, no "Add a court" button.
