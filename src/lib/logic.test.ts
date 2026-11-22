import { describe, expect, it } from 'vitest'
import { balanceTeams } from './balance'
import { average, expectedScore, newRating, teamDeltas } from './elo'
import { hasWinner } from './score'
import { isTone, recapPrompt } from './recap'
import { staleCheckins } from './checkout'

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

describe('recapPrompt', () => {
  it('sends only team names, score and rating changes', () => {
    const { prompt } = recapPrompt(11, 9, 14, -14, 'espn')
    expect(prompt).toContain('Team A 11, Team B 9')
    expect(prompt).toContain('Team A +14, Team B -14')
    expect(isTone('stats')).toBe(true)
    expect(isTone('rude')).toBe(false)
  })
})

describe('staleCheckins', () => {
  const now = 1_000_000
  const row = (id: string, playerId: string, ageSeconds: number) => ({ recordId: id, data: { playerId, checkedInAt: now - ageSeconds } })

  it('removes check-ins older than 3 hours but never players in a live game', () => {
    const rows = [row('old', 'p1', 4 * 3600), row('fresh', 'p2', 3600), row('playing', 'p3', 5 * 3600)]
    expect(staleCheckins(rows, new Set(['p3']), now).map((r) => r.recordId)).toEqual(['old'])
  })

  it('keeps a check-in at exactly 3 hours', () => {
    expect(staleCheckins([row('edge', 'p1', 3 * 3600)], new Set(), now)).toEqual([])
  })
})
