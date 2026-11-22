import { average } from './elo'

export interface Rated {
  id: string
  rating: number
}

export interface Split<T extends Rated> {
  teamA: T[]
  teamB: T[]
  /** Difference between the two teams' average ratings. */
  diff: number
}

/**
 * Tries every way to split 2N players into two teams of N and returns the one
 * with the smallest gap in average rating. Player 0 is pinned to team A so
 * mirror-image splits aren't checked twice (126 splits for 5v5).
 */
export function balanceTeams<T extends Rated>(players: T[]): Split<T> {
  if (players.length < 2 || players.length % 2 !== 0) {
    throw new Error('Need an even number of players (at least 2)')
  }
  const n = players.length / 2
  let best: Split<T> | null = null

  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === n) {
      const inA = new Set(chosen)
      const teamA = players.filter((_, i) => inA.has(i))
      const teamB = players.filter((_, i) => !inA.has(i))
      const diff = Math.abs(average(teamA.map((p) => p.rating)) - average(teamB.map((p) => p.rating)))
      if (!best || diff < best.diff) best = { teamA, teamB, diff }
      return
    }
    for (let i = start; i < players.length; i++) pick(i + 1, [...chosen, i])
  }
  pick(1, [0])
  return best!
}
