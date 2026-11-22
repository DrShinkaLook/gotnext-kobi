import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useMutations, useQuery, useUser } from 'deepspace'
import { Button, EmptyState, useToast } from '@/components/ui'
import { callAction } from '../../api'
import type { Checkin, Court, QueueEntry } from '../../types'

function countByCourt(rows: { data: { courtId: string } }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.data.courtId, (counts.get(r.data.courtId) ?? 0) + 1)
  return counts
}

export default function CourtsPage() {
  const courts = useQuery<Court>('courts', { orderBy: 'createdAt' })
  const checkins = useQuery<Checkin>('checkins')
  const waiting = useQuery<QueueEntry>('queue', { where: { status: 'waiting' } })
  const { user } = useUser()
  const { isSignedIn } = useAuth()

  const here = countByCourt(checkins.records)
  const inLine = countByCourt(waiting.records)

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Courts</h1>
        {user?.role === 'admin' && <SeedButton />}
      </div>

      {courts.status === 'loading' && <p className="text-muted-foreground">Loading courts…</p>}
      {courts.status === 'error' && (
        <p role="alert" className="text-destructive">Couldn't load courts: {courts.error}</p>
      )}
      {courts.status === 'ready' && courts.records.length === 0 && (
        <EmptyState title="No courts yet" description="Once a court is added it shows up here with who's playing." />
      )}

      <ul className="flex flex-col gap-3">
        {courts.records.map((court) => (
          <li key={court.recordId}>
            <Link
              to={`/court/${court.recordId}`}
              data-testid="court-card"
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="text-lg font-semibold">{court.data.name}</div>
              {court.data.location && <div className="text-sm text-muted-foreground">{court.data.location}</div>}
              <div className="mt-3 flex gap-4 text-sm">
                <span><strong>{here.get(court.recordId) ?? 0}</strong> here</span>
                <span><strong>{inLine.get(court.recordId) ?? 0}</strong> in line</span>
                <span className="text-muted-foreground">{court.data.teamSize}v{court.data.teamSize} to {court.data.targetScore}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {isSignedIn && <NewCourt />}
    </div>
  )
}

function NewCourt() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { ready, createConfirmed } = useMutations<Court>('courts')
  const navigate = useNavigate()
  const toast = useToast()

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const id = await createConfirmed({
        name: String(f.get('name')).trim(),
        location: String(f.get('location')).trim(),
        teamSize: f.get('teamSize') as Court['teamSize'],
        targetScore: Number(f.get('targetScore')),
        winBy2: f.get('winBy2') === 'on',
        rotation: f.get('rotation') as Court['rotation'],
      })
      navigate(`/court/${id}`)
    } catch (err) {
      toast.error("Couldn't add court", err instanceof Error ? err.message : undefined)
      setBusy(false)
    }
  }

  if (!open) {
    return <Button variant="outline" className="mt-6 h-12 w-full" onClick={() => setOpen(true)} data-testid="new-court">Add a court</Button>
  }
  const field = 'h-11 w-full rounded-lg border border-input bg-background px-3'
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4" data-testid="new-court-form">
      <h2 className="text-lg font-semibold">Add a court</h2>
      <input name="name" required maxLength={40} placeholder="Court name" aria-label="Court name" className={field} />
      <input name="location" maxLength={80} placeholder="Where is it?" aria-label="Location" className={field} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Team size
          <select name="teamSize" defaultValue="5" className={field}>
            <option value="3">3v3</option><option value="4">4v4</option><option value="5">5v5</option>
          </select>
        </label>
        <label className="text-sm">Play to
          <input name="targetScore" type="number" min={5} max={50} defaultValue={11} className={field} />
        </label>
      </div>
      <label className="text-sm">After each game
        <select name="rotation" defaultValue="everyone-rotates" className={field}>
          <option value="everyone-rotates">Everyone rotates</option>
          <option value="winners-stay">Winners stay</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="winBy2" type="checkbox" defaultChecked className="size-5" /> Win by 2
      </label>
      <div className="flex gap-2">
        <Button type="submit" className="h-12 flex-1" loading={busy} disabled={!ready} data-testid="create-court">Create court</Button>
        <Button type="button" variant="ghost" className="h-12" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}

function SeedButton() {
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function seed() {
    setBusy(true)
    const res = await callAction<{ alreadySeeded: boolean }>('seedDemo')
    setBusy(false)
    if (!res.success) return toast.error("Couldn't seed demo data", res.error)
    toast.success(res.data.alreadySeeded ? 'Demo data was already there' : 'Demo data added')
  }

  return (
    <Button variant="outline" size="sm" loading={busy} onClick={seed}>
      Seed demo data
    </Button>
  )
}
