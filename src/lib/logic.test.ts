import { describe, expect, it } from 'vitest'
import { balanceTeams } from './balance'
import { average, expectedScore, newRating, teamDeltas } from './elo'
import { hasWinner } from './score'

describe('balanceTeams', () => {
  const ratings = [850, 900, 950, 1000, 1020, 1050, 1100, 1150, 1200, 1250]
  const players = ratings.map((rating, i) => ({ id: `p${i}`, rating }))

  it('balances 10 spread-out players to within 25 points of average', () => {
    const { teamA, teamB, diff } = balanceTeams(players)
    expect(teamA).toHaveLength(5)
    expect(teamB).toHaveLength(5)
    expect(diff).toBeLessThanOrEqual(25)
    const gap = Math.abs(average(teamA.map((p) => p.rating)) - average(teamB.map((p) => p.rating)))
    expect(gap).toBe(diff)
  })

  it('puts every player on exactly one team', () => {
    const { teamA, teamB } = balanceTeams(players)
    const ids = [...teamA, ...teamB].map((p) => p.id).sort()
    expect(ids).toEqual(players.map((p) => p.id).sort())
  })

  it('refuses an odd number of players', () => {
    expect(() => balanceTeams(players.slice(0, 9))).toThrow()
  })
})

describe('hasWinner', () => {
  it('11-9 is a win', () => {
    expect(hasWinner(11, 9, 11, true)).toBe('A')
    expect(hasWinner(9, 11, 11, true)).toBe('B')
  })

  it('11-10 is not a win with winBy2 on', () => {
    expect(hasWinner(11, 10, 11, true)).toBeNull()
    expect(hasWinner(12, 10, 11, true)).toBe('A')
  })

  it('11-10 is a win with winBy2 off', () => {
    expect(hasWinner(11, 10, 11, false)).toBe('A')
  })

  it('no winner before the target', () => {
    expect(hasWinner(10, 2, 11, true)).toBeNull()
  })
})

describe('elo', () => {
  it('equal ratings with K=32: winner +16, loser -16', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5)
    expect(newRating(1000, 1000, 1)).toBe(1016)
    expect(newRating(1000, 1000, 0)).toBe(984)
    expect(teamDeltas([1000, 1000], [1000, 1000], 'A')).toEqual({ a: 16, b: -16 })
  })

  it('an upset moves ratings more than an expected win', () => {
    const upset = teamDeltas([900], [1100], 'A')
    const expected = teamDeltas([1100], [900], 'A')
    expect(upset.a).toBeGreaterThan(expected.a)
  })
})
