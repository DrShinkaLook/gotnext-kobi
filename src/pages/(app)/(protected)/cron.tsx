import { useState } from 'react'
import { useCronMonitor, useQuery, useUser } from 'deepspace'
import { Button, EmptyState, useToast } from '@/components/ui'
import { callAction } from '../../../api'
import { SCOPE_ID } from '../../../constants'
import type { Court } from '../../../types'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : '—')

/** Owner-only cron admin: task status, "Run now", run history and a stale check-in helper. */
export default function CronAdminPage() {
  const { user, isLoading } = useUser()
  if (isLoading) return <Page><p className="text-muted-foreground">Loading…</p></Page>
  if (user?.role !== 'admin') {
    return <Page><EmptyState title="Owner only" description="This page is only for the app owner." /></Page>
  }
  return <CronAdmin />
}

function CronAdmin() {
  const { tasks, history, connected, canWrite, lastError, trigger } = useCronMonitor(SCOPE_ID)
  const [running, setRunning] = useState<string | null>(null)
  const toast = useToast()

  async function runNow(name: string) {
    setRunning(name)
    const res = await trigger(name)
    setRunning(null)
    if (res.ok) toast.success(`${name} started`)
    else toast.error(`Couldn't run ${name}`, res.error ?? res.reason)
  }

  return (
    <Page>
      <h1 className="text-2xl font-bold">Scheduled tasks</h1>
      <p className="mb-4 text-sm text-muted-foreground">{connected ? 'Connected' : 'Connecting…'}</p>
      {lastError && <p role="alert" className="mb-3 text-destructive">{lastError}</p>}

      {tasks.length === 0 && connected && <p className="text-muted-foreground">No tasks found.</p>}
      <ul className="flex flex-col gap-3">
        {tasks.map((t) => (
          <li key={t.name} className="rounded-xl border border-border bg-card p-4" data-testid={`task-${t.name}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-sm text-muted-foreground">
                  Every {t.intervalMinutes} min{t.paused ? ' · paused' : ''} · last {when(t.lastRunAt)} · next {when(t.nextRunAt)}
                </div>
              </div>
              <Button size="lg" disabled={!canWrite} loading={running === t.name} onClick={() => runNow(t.name)} data-testid="run-now">
                Run now
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <StaleCheckin />

      <h2 className="mt-8 mb-2 text-lg font-semibold">Recent runs</h2>
      {history.length === 0 ? (
        <p className="text-muted-foreground">No runs yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {history.slice(0, 10).map((h) => (
            <li key={`${h.taskName}-${h.startedAt}`} className="flex justify-between rounded-lg bg-card px-3 py-2">
              <span>{h.taskName} · {when(h.startedAt)}</span>
              <span className={h.success ? 'text-success' : 'text-destructive'}>
                {h.completedAt === null ? 'running' : h.success ? `ok · ${h.durationMs} ms` : h.error ?? 'failed'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

/** Adds a guest checked in 4 hours ago so you can watch auto-checkout remove them. */
function StaleCheckin() {
  const courts = useQuery<Court>('courts', { orderBy: 'createdAt' })
  const [courtId, setCourtId] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const target = courtId || courts.records[0]?.recordId || ''

  async function add() {
    setBusy(true)
    const res = await callAction<{ name: string }>('addStaleCheckin', { courtId: target })
    setBusy(false)
    if (!res.success) return toast.error("Couldn't add test check-in", res.error)
    toast.success('Added a 4-hour-old check-in', 'Tap "Run now" on auto-checkout to remove it.')
  }

  return (
    <section className="mt-6 rounded-xl border border-dashed border-border p-4">
      <h2 className="font-semibold">Test auto-checkout</h2>
      <p className="mb-3 text-sm text-muted-foreground">Adds a guest who checked in 4 hours ago, so the next run removes them.</p>
      <div className="flex gap-2">
        <select value={target} onChange={(e) => setCourtId(e.target.value)} aria-label="Court"
          className="h-12 flex-1 rounded-lg border border-input bg-background px-3">
          {courts.records.map((c) => <option key={c.recordId} value={c.recordId}>{c.data.name}</option>)}
        </select>
        <Button size="lg" variant="outline" className="h-12" disabled={!target} loading={busy} onClick={add} data-testid="add-stale">
          Add old check-in
        </Button>
      </div>
    </section>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl px-4 py-6">{children}</div>
}
