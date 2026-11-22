# Got Next: Write-up

## What I built
Pickup basketball, live: check in, join the "got next" line (guests too), get Elo-balanced teams, keep a scorekeeper-only live score, then see rating changes and an AI recap. Live at https://gotnext-kobi.app.space.

## DeepSpace integrations and why
- **Auth + useQuery/useMutations:** everything syncs to every phone in about a second.
- **Schema permissions:** the room rejects non-scorekeeper score writes (`ownerField` + `writableFields`); `uniqueOn` blocks a second live game per court.
- **Server actions:** teams, finishing, ratings and guests must be trusted.
- **Cron:** `auto-checkout` clears people who left.
- **createDeepSpaceAI:** recaps with no API key to manage; the caller pays.
- **usePresenceRoom:** "watching now".

## Left out and why
Leaderboard, profiles, court editing, notifications, per-player stats: not needed to prove the core loop.

## Main tradeoff
Fairness logic (teams, final result, Elo) runs in server actions so nobody can fake a rating or a win. That costs a round trip. Score taps stay direct record writes gated by `ownerField` so they feel instant.

## What the agent did
A coding agent wrote most of the code from my SPEC, logging each phase in BUILD_LOG.md. Real breakages:
- SPEC's `userBound` on `scorekeeperId` would have frozen the field and broken hand-off; switched to `writableFields`.
- Yes/no fields come back as 0/1, so React printed stray "0"s.
- Fast taps could drop a point (the ack arrives before the live update); fixed by building on the last value sent.
- Browser tests failed 7/16 in parallel; 16/16 one at a time.
- CLI login failed under HTTPS scanning; fixed with `--use-system-ca`.

## What I verified
- [ ] 1. A checks in; B sees it within 2 seconds
- [ ] 2. Line filled to 10 with guests; Make teams is balanced
- [ ] 3. Scorekeeper's +2 shows live for B; B can't change the score
- [ ] 4. Finish at 11-9: ratings change, both see the recap
- [ ] 5. Finish at 11-10 with win-by-2 is refused
- [ ] 6. A 3-hour-old check-in disappears after the cron runs
- [ ] 7. Signed-out visitor sees the landing page and can't write

## What I'd do next
Leaderboard and profiles, a K-factor that shrinks with games played, court settings, and a hard lock so a double-tapped Finish can never apply ratings twice.
