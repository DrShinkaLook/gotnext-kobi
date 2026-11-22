import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useUser } from 'deepspace'
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
    </div>
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
