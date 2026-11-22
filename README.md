# Got Next

**Live:** https://gotnext-kobi.app.space

Check in at a pickup basketball court, claim a spot in line, get teams balanced by rating, keep a live score everyone can see, and get a short recap after every game.

Built on [DeepSpace](https://docs.deep.space): auth, real-time records, server actions, a cron job and the AI proxy.

## Try it alone

You need two different accounts, so use two browser windows:

1. **Window 1 (normal):** open the live URL, tap **Find a court**, then **Sign in** with Google.
2. **Window 2 (private/incognito):** open the same URL and sign in with GitHub (a different account).
3. Both windows: open **GSU Rec**, tap **Check in**, then **Join the line**.
4. Fill the line with guests: in each window type a name under **Add a guest** and tap **Add** (up to 4 guests per person). 2 players + 8 guests = 10, a full 5v5.
5. Tap **Make teams**. You land on the scoreboard and you are the scorekeeper.
6. Tap **+2** in one window and watch the other window update. The other window has no score buttons.
7. Play to 11-9 and tap **Finish game**: ratings change and a recap appears in both windows.

## Run it locally

Requires Node 22.15+, 24 or 26.

```bash
npm install
npx deepspace auth login     # sign in once (opens a browser)
npm run dev                  # http://localhost:5173
```

On Windows with antivirus HTTPS scanning, if login fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, run `$env:NODE_OPTIONS = '--use-system-ca'` in that terminal first.

The app owner sees a **Seed demo data** button on `/courts` and a **Cron** page for the auto-checkout job.

## Run the tests

```bash
npm run test:unit            # Elo, team balancing, scoring, recap prompt, auto-checkout, schema lint
```

The multi-user browser tests need two test accounts named Alice and Bob (emails must end in `@deepspace.test`):

```bash
npx deepspace test accounts create --email alice-<something>@deepspace.test --name "Alice" --password-stdin
npx deepspace test accounts create --email bob-<something>@deepspace.test --name "Bob" --password-stdin
npx deepspace test run e2e   # smoke, api, collab and tests/court.spec.ts
```

`tests/court.spec.ts` names everything it creates `__test-<timestamp>__ …` and removes it at the end.

## Where things live

| Path | What |
| --- | --- |
| `src/schemas/` | Collections and their permissions |
| `src/actions/index.ts` | Server actions (teams, finishing, ratings, recaps, guests, seed) |
| `src/lib/` | Pure logic with no SDK imports: `elo.ts`, `balance.ts`, `score.ts`, `recap.ts`, `checkout.ts` |
| `src/cron.ts` | `auto-checkout` every 15 minutes |
| `src/pages/` | `/` landing, `/courts`, `/court/:id`, `/game/:id`, `/cron` |

More detail: [SPEC.md](SPEC.md), [EXPLAIN.md](EXPLAIN.md), [WRITEUP.md](WRITEUP.md), [BUILD_LOG.md](BUILD_LOG.md).
