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
