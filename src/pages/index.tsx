/**
 * Landing page — a STATIC page (no providers, prerendered at build).
 *
 * Design direction: Got Next is for people standing courtside at a busy rec
 * gym, phone in one hand, ball under the other arm. The page should feel like
 * the gym's scoreboard at night: dark floor, chalk-white type, one hot orange
 * for the only thing to do here, which is finding a court. No marketing
 * fluff: say what it does in plain words, show the live scoreboard and the
 * line, and get out of the way. Big type, big tap target, works one-handed.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const line = ['Dre', 'Tasha', 'Marcus']

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <main data-testid="static-landing" className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-12 px-5 py-12 md:flex-row md:items-center">
        <section className="md:w-1/2">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">Got Next</p>
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Know who's got next.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Check in at your court, claim a spot in line, and get fair teams with a live score everyone on the sideline can see.
          </p>
          <Link
            to="/courts"
            data-testid="find-court"
            className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-xl bg-primary px-8 text-lg font-bold text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
          >
            Find a court
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">Free. Sign in with Google or GitHub when you're ready to play.</p>
        </section>

        <section aria-label="Example scoreboard" className="md:w-1/2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground">GSU Rec · 5v5 to 11</span>
              <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">LIVE</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-muted py-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Team A</div>
                <div className="text-6xl font-black tabular-nums text-foreground">9</div>
              </div>
              <div className="rounded-xl bg-muted py-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Team B</div>
                <div className="text-6xl font-black tabular-nums text-primary">10</div>
              </div>
            </div>
            <div className="mt-5 text-xs uppercase tracking-widest text-muted-foreground">Got next</div>
            <ol className="mt-2 flex flex-col gap-1 text-sm">
              {line.map((name, i) => (
                <li key={name} className="flex justify-between rounded-lg bg-secondary px-3 py-2 text-secondary-foreground">
                  <span>{i + 1}. {name}</span>
                  <span className="text-muted-foreground">{['1,040', '985', '1,120'][i]}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-center text-xs text-muted-foreground">Teams are balanced by rating. Win and your number goes up.</p>
          </div>
        </section>
      </main>
    </>
  )
}
