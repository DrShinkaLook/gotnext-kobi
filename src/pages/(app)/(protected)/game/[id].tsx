import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, useMutations, usePresenceRoom, useQuery } from 'deepspace'
import { Button, EmptyState, useToast } from '@/components/ui'
import { callAction } from '../../../../api'
import type { Court, Game, Player } from '../../../../types'
import { isTone, type Tone } from '../../../../lib/recap'

type Side = 'A' | 'B'

export default function GamePage() {
  const { id: gameId = '' } = useParams()
  const { userId } = useAuth()
  const games = useQuery<Game>('games', { orderBy: 'createdAt', orderDir: 'desc', limit: 500 })
  const courts = useQuery<Court>('courts')
  const players = useQuery<Player>('players')
  const { peers, connected } = usePresenceRoom(`game:${gameId}`)
  const { ready, putConfirmed } = useMutations<Game>('games')
  const [saving, setSaving] = useState(false)
  const lastSent = useRef<Partial<Record<'scoreA' | 'scoreB', { value: number; at: number }>>>({})
  const toast = useToast()

  // Local dev only: lets the Playwright spec try a direct score write as a
  // non-scorekeeper, through the same call the score buttons use.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __gotnextTest?: { putGame: typeof putConfirmed } }
    w.__gotnextTest = { putGame: putConfirmed }
  }, [putConfirmed])

  const record = games.records.find((g) => g.recordId === gameId)
  if (games.status === 'loading') return <Page><p className="text-muted-foreground">Loading game…</p></Page>
  if (games.status === 'error') return <Page><p role="alert" className="text-destructive">Couldn't load this game: {games.error}</p></Page>
  if (!record) {
    return (
      <Page>
        <EmptyState title="Game not found" description="It may have been removed." />
        <Link to="/courts" className="mt-4 block text-center underline">Back to courts</Link>
      </Page>
    )
  }

  const game = record.data
  const court = courts.records.find((c) => c.recordId === game.courtId)
  const playerById = new Map(players.records.map((p) => [p.recordId, p.data]))
  const nameOf = (id: string) => playerById.get(id)?.name ?? 'Player'
  const isScorekeeper = game.scorekeeperId === userId
  const isLive = game.status === 'live'
  const watching = new Set(peers.map((p) => p.userId)).size + (connected ? 1 : 0)

  async function bump(side: Side, delta: number) {
    const field = side === 'A' ? 'scoreA' : 'scoreB'
    // The room acks a write a moment before the live update re-renders this
    // page, so a quick second tap builds on the value we just sent.
    const last = lastSent.current[field]
    const base = last && Date.now() - last.at < 3000 ? last.value : game[field]
    const value = Math.max(0, base + delta)
    lastSent.current[field] = { value, at: Date.now() }
    setSaving(true)
    try {
      await putConfirmed(gameId, { [field]: value })
    } catch (err) {
      toast.error("Score didn't save", err instanceof Error ? err.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Link to={`/court/${game.courtId}`} className="text-sm text-muted-foreground">← {court?.data.name ?? 'Court'}</Link>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${isLive ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}>
              {isLive ? 'LIVE' : 'FINAL'}
            </span>
            {court && <span className="text-sm text-muted-foreground">to {court.data.targetScore}{court.data.winBy2 ? ', win by 2' : ''}</span>}
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground" data-testid="watching">
          <strong className="text-foreground">{watching}</strong> watching now
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {(['A', 'B'] as const).map((side) => {
          const score = side === 'A' ? game.scoreA : game.scoreB
          const ids = side === 'A' ? game.teamA : game.teamB
          const won = game.winner === side
          return (
            <section key={side} className={`rounded-xl border bg-card p-3 text-center ${won ? 'border-primary border-2' : 'border-border'}`}>
              <h2 className="font-semibold">Team {side}{won ? ' 🏆' : ''}</h2>
              <div className="my-2 text-7xl font-black tabular-nums" data-testid={`score-${side}`}>{score}</div>
              {game.ratingChanges && (
                <div className={`mb-2 text-sm font-semibold ${game.ratingChanges[side] >= 0 ? 'text-success' : 'text-destructive'}`} data-testid={`delta-${side}`}>
                  {game.ratingChanges[side] >= 0 ? '+' : ''}{game.ratingChanges[side]} rating
                </div>
              )}
              {isScorekeeper && (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, -1].map((d) => (
                    <Button key={d} size="lg" variant={d < 0 ? 'outline' : 'default'} className="h-14 px-0 text-lg"
                      disabled={!isLive || !ready || saving} onClick={() => bump(side, d)} data-testid={`${side}${d > 0 ? '+' : ''}${d}`}>
                      {d > 0 ? `+${d}` : d}
                    </Button>
                  ))}
                </div>
              )}
              <ul className="mt-3 text-sm text-muted-foreground">
                {ids.map((id) => <li key={id}>{nameOf(id)}</li>)}
              </ul>
            </section>
          )
        })}
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Scorekeeper: <strong className="text-foreground">{isScorekeeper ? 'you' : nameOf(game.scorekeeperId)}</strong>
      </p>

      {isScorekeeper && isLive && <FinishGame gameId={gameId} />}
      {isScorekeeper && isLive && <HandOff gameId={gameId} game={game} playerById={playerById} me={userId!} />}
      {!isLive && (
        <Recap gameId={gameId} game={game} canEdit={[...game.teamA, ...game.teamB, game.scorekeeperId].includes(userId ?? '')} />
      )}
    </Page>
  )
}

function FinishGame({ gameId }: { gameId: string }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function finish() {
    setBusy(true)
    const res = await callAction('finishGame', { gameId })
    setBusy(false)
    if (!res.success) toast.error("Can't finish yet", res.error)
  }

  return (
    <Button size="lg" className="mt-6 h-14 w-full text-base" loading={busy} onClick={finish} data-testid="finish-game">
      Finish game
    </Button>
  )
}

function Recap({ gameId, game, canEdit }: { gameId: string; game: Game; canEdit: boolean }) {
  const [tone, setTone] = useState<Tone>(isTone(game.recapTone) ? game.recapTone : 'espn')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function regenerate() {
    setBusy(true)
    const res = await callAction('regenerateRecap', { gameId, tone })
    setBusy(false)
    if (!res.success) toast.error("Couldn't write a recap", res.error)
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4" data-testid="recap">
      <h2 className="mb-2 text-lg font-semibold">Recap</h2>
      {game.recap ? (
        <p className="whitespace-pre-line leading-relaxed" data-testid="recap-text">{game.recap}</p>
      ) : (
        <p className="text-muted-foreground">No recap yet.</p>
      )}
      {canEdit && (
        <div className="mt-4 flex gap-2">
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} aria-label="Recap tone"
            className="h-12 flex-1 rounded-lg border border-input bg-background px-3" data-testid="recap-tone">
            <option value="espn">ESPN</option>
            <option value="trash-talk">Trash talk</option>
            <option value="stats">Stats</option>
          </select>
          <Button size="lg" variant="outline" className="h-12" loading={busy} onClick={regenerate} data-testid="regenerate-recap">
            Regenerate
          </Button>
        </div>
      )}
    </section>
  )
}

function HandOff({ gameId, game, playerById, me }: { gameId: string; game: Game; playerById: Map<string, Player>; me: string }) {
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const options = [...game.teamA, ...game.teamB].filter((id) => id !== me && playerById.get(id) && !playerById.get(id)!.isGuest)
  if (options.length === 0) return null

  async function handOff() {
    setBusy(true)
    const res = await callAction('handOffScorekeeper', { gameId, toUserId: to })
    setBusy(false)
    if (!res.success) return toast.error("Couldn't hand off", res.error)
    toast.success('Scorekeeper handed off')
  }

  return (
    <div className="mt-4 flex gap-2">
      <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="New scorekeeper"
        className="h-12 flex-1 rounded-lg border border-input bg-background px-3" data-testid="handoff-select">
        <option value="">Hand off scoring to…</option>
        {options.map((id) => <option key={id} value={id}>{playerById.get(id)!.name}</option>)}
      </select>
      <Button size="lg" variant="outline" className="h-12" disabled={!to} loading={busy} onClick={handOff} data-testid="handoff">
        Hand off
      </Button>
    </div>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl px-4 py-6">{children}</div>
}
