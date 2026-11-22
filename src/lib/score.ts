export type Side = 'A' | 'B'

/** Returns the winning side once someone reaches the target (with a 2-point lead if winBy2), else null. */
export function hasWinner(scoreA: number, scoreB: number, target: number, winBy2: boolean): Side | null {
  const lead = Math.abs(scoreA - scoreB)
  const top = Math.max(scoreA, scoreB)
  if (top < target || lead < (winBy2 ? 2 : 1)) return null
  return scoreA > scoreB ? 'A' : 'B'
}
