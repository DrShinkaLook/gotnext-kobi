export const K = 32

export function average(ratings: number[]): number {
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length
}

/** Chance that a player rated `ra` beats one rated `rb`. */
export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + 10 ** ((rb - ra) / 400))
}

/** New rating after a game: result is 1 for a win, 0 for a loss. */
export function newRating(r: number, opponent: number, result: 0 | 1, k = K): number {
  return r + k * (result - expectedScore(r, opponent))
}

/**
 * Rating change for every player on each team. Team rating = average rating.
 * Everyone on a team gets the same whole-number change.
 */
export function teamDeltas(teamA: number[], teamB: number[], winner: 'A' | 'B', k = K): { a: number; b: number } {
  const ra = average(teamA)
  const rb = average(teamB)
  const a = Math.round(newRating(ra, rb, winner === 'A' ? 1 : 0, k) - ra)
  const b = Math.round(newRating(rb, ra, winner === 'B' ? 1 : 0, k) - rb)
  return { a, b }
}
