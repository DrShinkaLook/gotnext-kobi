/** Check-ins older than this are removed by the auto-checkout cron. */
export const MAX_CHECKIN_SECONDS = 3 * 60 * 60

type CheckinRow = { recordId: string; data: { playerId: string; checkedInAt: number } }

/** Check-ins older than 3 hours, skipping anyone who is in a live game right now. */
export function staleCheckins<T extends CheckinRow>(checkins: T[], playingIds: Set<string>, nowSeconds: number): T[] {
  return checkins.filter(
    (c) => nowSeconds - Number(c.data.checkedInAt) > MAX_CHECKIN_SECONDS && !playingIds.has(c.data.playerId),
  )
}
