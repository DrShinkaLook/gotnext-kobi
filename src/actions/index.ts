import { RECORD_NOT_FOUND, type ActionHandler, type ActionResult, type ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { Court, Game, Player } from '../types'

// Server actions run as the app with RBAC off, so every action checks the
// caller (ctx.userId) itself before writing anything.

class ActionError extends Error {}

/** Unwraps a tools result or stops the action with its error. */
function must<T>(result: ActionResult<T>): T {
  if (!result.success) throw new ActionError(result.error)
  return result.data
}

/** Turns thrown ActionErrors into { success: false, error } responses. */
function action(fn: ActionHandler<Env>): ActionHandler<Env> {
  return async (ctx) => {
    try {
      return await fn(ctx)
    } catch (e) {
      if (e instanceof ActionError) return { success: false, error: e.message }
      throw e
    }
  }
}

function text(value: unknown, max = 40): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function create(tools: ActionTools, collection: string, data: object, id?: string): Promise<string> {
  return must(await tools.create(collection, data as Record<string, unknown>, id)).recordId
}

export const actions: Record<string, ActionHandler<Env>> = {
  /** Creates the caller's players row (recordId = userId) if it's missing. */
  ensurePlayer: action(async ({ userId, params, tools }) => {
    const existing = await tools.get<Player>('players', userId)
    if (existing.success) return { success: true, data: { created: false } }
    if (existing.error !== RECORD_NOT_FOUND) return existing

    const user = await tools.get<{ name?: string }>('users', userId)
    const name = (user.success && text(user.data.record.data.name)) || text(params.name) || 'Player'
    const player: Player = { name, isGuest: false, addedBy: userId, rating: 1000, wins: 0, losses: 0 }
    await create(tools, 'players', player, userId)
    return { success: true, data: { created: true } }
  }),

  /** Owner only: GSU Rec court, 12 rated guests and 3 finished games. Safe to run twice. */
  seedDemo: action(async ({ userId, env, tools }) => {
    if (userId !== env.OWNER_USER_ID) return { success: false, error: 'Only the app owner can seed demo data' }

    const found = must(await tools.query<Court>('courts', { where: { name: 'GSU Rec' }, limit: 1 }))
    if (found.records.length > 0) {
      return { success: true, data: { courtId: found.records[0].recordId, alreadySeeded: true } }
    }

    const courtId = await create(tools, 'courts', {
      name: 'GSU Rec',
      location: 'Georgia State Rec Center, Atlanta',
      teamSize: '5',
      targetScore: 11,
      winBy2: true,
      rotation: 'everyone-rotates',
    } satisfies Court)

    const names = ['Dre', 'Tasha', 'Marcus', 'Jaylen', 'Keisha', 'Big Mike', 'Priya', 'Coop', 'Nia', 'Tre', 'Sam', 'Lou']
    const games = [
      { a: [0, 3, 4, 7, 8], b: [1, 2, 5, 6, 9], scoreA: 11, scoreB: 7, recap: 'Team A ran away with it, closing on a 5-0 burst to win 11-7.' },
      { a: [2, 5, 8, 10, 11], b: [0, 1, 4, 7, 9], scoreA: 10, scoreB: 12, recap: 'A deuce game that went the distance. Team B survived 12-10 after trading buckets late.' },
      { a: [1, 4, 6, 9, 11], b: [0, 3, 5, 8, 10], scoreA: 11, scoreB: 9, recap: 'Team A held off a late push and won it 11-9 on a corner jumper.' },
    ]

    // Count each guest's wins and losses from the games above.
    const record = names.map(() => ({ wins: 0, losses: 0 }))
    for (const g of games) {
      const winners = g.scoreA > g.scoreB ? g.a : g.b
      const losers = g.scoreA > g.scoreB ? g.b : g.a
      winners.forEach((i) => record[i].wins++)
      losers.forEach((i) => record[i].losses++)
    }

    const ids: string[] = []
    for (const [i, name] of names.entries()) {
      const rating = Math.round(850 + (i * 400) / (names.length - 1)) // 850 to 1250
      ids.push(await create(tools, 'players', { name, isGuest: true, addedBy: userId, rating, ...record[i] } satisfies Player))
    }

    for (const g of games) {
      await create(tools, 'games', {
        courtId,
        teamA: g.a.map((i) => ids[i]),
        teamB: g.b.map((i) => ids[i]),
        scoreA: g.scoreA,
        scoreB: g.scoreB,
        status: 'final',
        scorekeeperId: userId,
        winner: g.scoreA > g.scoreB ? 'A' : 'B',
        recap: g.recap,
        recapTone: 'espn',
      } satisfies Game)
    }

    return { success: true, data: { courtId, alreadySeeded: false } }
  }),
}
