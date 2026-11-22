/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO itself records executions, tracks history, and
 * pushes status to admin clients via the `/ws/cron/:roomId` WebSocket.
 *
 * Each task declares EITHER `intervalMinutes` (run every N minutes) OR
 * `schedule` + `timezone` (5-field cron expression). CronRoom validates
 * the config at construction time and throws on ambiguous declarations.
 *
 * Example:
 *
 *   import type { CronTask } from 'deepspace/worker'
 *   import { buildCronContext } from 'deepspace/worker'
 *
 *   export const tasks: CronTask[] = [
 *     { name: 'heartbeat', intervalMinutes: 1 },
 *     { name: 'daily-report', schedule: '0 9 * * *', timezone: 'America/New_York' },
 *   ]
 *
 *   export async function runTask(name: string, env: Env): Promise<void> {
 *     const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
 *     if (name === 'heartbeat') {
 *       // …
 *     }
 *   }
 */

import { buildCronContext, type CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { staleCheckins } from './lib/checkout'
import type { Checkin, Game, QueueEntry } from './types'

type Row<T> = { recordId: string; data: T }

export const tasks: CronTask[] = [{ name: 'auto-checkout', intervalMinutes: 15 }]

/** auto-checkout: removes check-ins older than 3 hours and their waiting spot in line. Skips anyone in a live game. */
export async function runTask(name: string, env: Env): Promise<void> {
  if (name !== 'auto-checkout') return
  const { records } = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)

  const checkins = (await records.query('checkins', { limit: 1000 })) as Row<Checkin>[]
  const live = (await records.query('games', { where: { status: 'live' }, limit: 200 })) as Row<Game>[]
  const playing = new Set(live.flatMap((g) => [...g.data.teamA, ...g.data.teamB]))

  const stale = staleCheckins(checkins, playing, Math.floor(Date.now() / 1000))
  for (const c of stale) {
    const spots = (await records.query('queue', { where: { courtId: c.data.courtId, playerId: c.data.playerId }, limit: 5 })) as Row<QueueEntry>[]
    for (const q of spots) if (q.data.status === 'waiting') await records.delete('queue', q.recordId)
    await records.delete('checkins', c.recordId)
  }
  console.info(`[auto-checkout] removed ${stale.length} of ${checkins.length} check-ins`)
}
