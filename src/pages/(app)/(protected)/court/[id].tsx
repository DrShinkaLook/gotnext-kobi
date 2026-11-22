import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth, useMutations, useQuery } from 'deepspace'
import { Button, EmptyState, Input, useToast } from '@/components/ui'
import { callAction } from '../../../../api'
import type { Checkin, Court, Game, Player, QueueEntry } from '../../../../types'
import { average } from '../../../../lib/elo'

export default function CourtPage() {
  const { id: courtId = '' } = useParams()
  const { userId } = useAuth()
  const courts = useQuery<Court>('courts')
  const players = useQuery<Player>('players')
  const checkins = useQuery<Checkin>('checkins', { where: { courtId }, orderBy: 'checkedInAt' })
  const queue = useQuery<QueueEntry>('queue', { where: { courtId }, orderBy: 'createdAt', orderDir: 'asc' })
  const liveGames = useQuery<Game>('games', { where: { courtId, status: 'live' } })
  const checkinMut = useMutations<Checkin>('checkins')
  const queueMut = useMutations<QueueEntry>('queue')

  const court = courts.records.find((c) => c.recordId === courtId)
  if (courts.status === 'loading') return <Page><p className="text-muted-foreground">Loading court…</p></Page>
  if (courts.status === 'error') return <Page><p role="alert" className="text-destructive">Couldn't load this court: {courts.error}</p></Page>
  if (!court) {
    return (
      <Page>
        <EmptyState title="Court not found" description="It may have been removed." />
        <Link to="/courts" className="mt-4 block text-center underline">Back to courts</Link>
      </Page>
    )
  }

  const playerById = new Map(players.records.map((p) => [p.recordId, p.data]))
  const nameOf = (id: string) => playerById.get(id)?.name ?? 'Player'
  const myCheckin = checkins.records.find((c) => c.data.playerId === userId)
  const waiting = queue.records.filter((q) => q.data.status === 'waiting')
  const myQueue = queue.records.find((q) => q.data.playerId === userId)
  const ready = checkinMut.ready && queueMut.ready
  const liveGame = liveGames.records[0]

  async function checkIn() {
    await checkinMut.create({ courtId, playerId: userId!, checkedInAt: Math.floor(Date.now() / 1000) })
  }
  async function checkOut() {
    if (myQueue?.data.status === 'waiting') await queueMut.remove(myQueue.recordId)
    if (myCheckin) await checkinMut.remove(myCheckin.recordId)
  }

  return (
    <Page>
      <header className="mb-5">
        <Link to="/courts" className="text-sm text-muted-foreground">← Courts</Link>
        <h1 className="mt-1 text-2xl font-bold">{court.data.name}</h1>
        <p className="text-sm text-muted-foreground">
          {court.data.teamSize}v{court.data.teamSize} · to {court.data.targetScore}
          {court.data.winBy2 ? ', win by 2' : ''} · {court.data.rotation === 'winners-stay' ? 'winners stay' : 'everyone rotates'}
        </p>
      </header>

      {myCheckin ? (
        <Button size="lg" variant="outline" className="h-14 w-full text-base" disabled={!ready} onClick={checkOut} data-testid="check-out">
          Check out
        </Button>
      ) : (
        <Button size="lg" className="h-14 w-full text-base" disabled={!ready} onClick={checkIn} data-testid="check-in">
          Check in
        </Button>
      )}

      {liveGame ? (
        <LiveGameCard gameId={liveGame.recordId} game={liveGame.data} playerById={playerById} />
      ) : (
        myCheckin && <MakeTeams courtId={courtId} waiting={waiting.length} needed={2 * Number(court.data.teamSize)} />
      )}

      <Section title={`Got next (${waiting.length})`}>
        {myCheckin && !myQueue && (
          <Button size="lg" className="mb-3 h-12 w-full" disabled={!ready} data-testid="join-queue"
            onClick={() => queueMut.create({ courtId, playerId: userId!, status: 'waiting' })}>
            Join the line
          </Button>
        )}
        {myQueue?.data.status === 'waiting' && (
          <Button size="lg" variant="outline" className="mb-3 h-12 w-full" disabled={!ready} data-testid="leave-queue"
            onClick={() => queueMut.remove(myQueue.recordId)}>
            Leave the line
          </Button>
        )}
        {queue.status === 'loading' ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : waiting.length === 0 ? (
          <p className="text-muted-foreground">Nobody's in line yet.</p>
        ) : (
          <ol className="flex flex-col gap-1" data-testid="queue-list">
            {waiting.map((q, i) => (
              <li key={q.recordId} className="flex justify-between rounded-lg bg-card px-3 py-2">
                <span>{i + 1}. {nameOf(q.data.playerId)}{q.data.playerId === userId ? ' (you)' : ''}</span>
                <span className="text-muted-foreground">{Math.round(playerById.get(q.data.playerId)?.rating ?? 1000)}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title={`Who's here (${checkins.records.length})`}>
        {checkins.status === 'loading' ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : checkins.records.length === 0 ? (
          <p className="text-muted-foreground">Nobody's checked in. Be the first.</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="here-list">
            {checkins.records.map((c) => {
              const p = playerById.get(c.data.playerId)
              const isMyGuest = !!p?.isGuest && c.createdBy === userId
              return (
                <li key={c.recordId} className="flex items-center justify-between rounded-lg bg-card px-3 py-2">
                  <span>
                    {nameOf(c.data.playerId)}
                    {!!p?.isGuest && <span className="ml-2 text-xs text-muted-foreground">guest</span>}
                  </span>
                  {isMyGuest && (
                    <Button size="sm" variant="ghost" disabled={!ready} onClick={() => checkinMut.remove(c.recordId)}>
                      Check out
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {myCheckin && <AddGuest courtId={courtId} />}
    </Page>
  )
}

function MakeTeams({ courtId, waiting, needed }: { courtId: string; waiting: number; needed: number }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  async function make() {
    setBusy(true)
    const res = await callAction<{ gameId: string }>('makeTeams', { courtId })
    setBusy(false)
    if (!res.success) return toast.error("Couldn't make teams", res.error)
    navigate(`/game/${res.data.gameId}`)
  }

  return (
    <div className="mt-4">
      <Button size="lg" variant="secondary" className="h-14 w-full text-base" loading={busy} onClick={make} data-testid="make-teams">
        Make teams
      </Button>
      {waiting < needed && (
        <p className="mt-1 text-center text-xs text-muted-foreground">{needed} in line makes a full game ({waiting} now).</p>
      )}
    </div>
  )
}

function LiveGameCard({ gameId, game, playerById }: { gameId: string; game: Game; playerById: Map<string, Player> }) {
  const team = (ids: string[]) => ids.map((id) => playerById.get(id))
  const avg = (ids: string[]) => Math.round(average(ids.map((id) => Number(playerById.get(id)?.rating ?? 1000))))
  return (
    <section className="mt-4 rounded-xl border-2 border-primary bg-card p-4" data-testid="live-game">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Live game</h2>
        <span className="text-2xl font-bold tabular-nums">{game.scoreA} – {game.scoreB}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {(['A', 'B'] as const).map((side) => {
          const ids = side === 'A' ? game.teamA : game.teamB
          return (
            <div key={side}>
              <div className="font-semibold">Team {side} · avg {avg(ids)}</div>
              <ul className="mt-1 text-muted-foreground">
                {team(ids).map((p, i) => <li key={ids[i]}>{p?.name ?? 'Player'}</li>)}
              </ul>
            </div>
          )
        })}
      </div>
      <Link to={`/game/${gameId}`} className="mt-4 flex h-12 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground" data-testid="open-game">
        Open scoreboard
      </Link>
    </section>
  )
}

function AddGuest({ courtId }: { courtId: string }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const res = await callAction('addGuest', { courtId, name })
    setBusy(false)
    if (!res.success) return toast.error("Couldn't add guest", res.error)
    setName('')
  }

  return (
    <Section title="Add a guest">
      <form onSubmit={submit} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" maxLength={40}
          className="h-12 flex-1" aria-label="Guest name" data-testid="guest-name" />
        <Button type="submit" size="lg" className="h-12" loading={busy} disabled={!name.trim()} data-testid="add-guest">
          Add
        </Button>
      </form>
      <p className="mt-1 text-xs text-muted-foreground">Guests join the line right away. Up to 4 each.</p>
    </Section>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl px-4 py-6">{children}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
