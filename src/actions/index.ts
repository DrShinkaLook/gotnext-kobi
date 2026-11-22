import { RECORD_NOT_FOUND, createDeepSpaceAI, isTestAccountEmail, type ActionHandler, type ActionResult, type ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { generateText } from 'ai'
import { balanceTeams } from '../lib/balance'
import { teamDeltas } from '../lib/elo'
import { isTone, recapPrompt, type Tone } from '../lib/recap'
import { hasWinner } from '../lib/score'
import type { Checkin, Court, Game, Player, QueueEntry } from '../types'

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

function fail(error: string) {
  return { success: false as const, error }
}

/** Asks the cheapest Claude model for a short recap, billed to the caller. Returns '' on any failure. */
async function writeRecap(env: Env, callerJwt: string, game: Game, ratingChanges: { A: number; B: number }, tone: Tone) {
  try {
    const ai = createDeepSpaceAI(env, 'anthropic', { authToken: callerJwt })
    const { system, prompt } = recapPrompt(game.scoreA, game.scoreB, ratingChanges.A, ratingChanges.B, tone)
    const { text: recap } = await generateText({ model: ai('claude-haiku-5-5'), system, prompt, maxOutputTokens: 200 })
    return recap.trim()
  } catch (e) {
    console.warn('[recap] AI call failed:', e instanceof Error ? e.message : String(e))
    return ''
  }
}

/** Current rating for each player id (1000 if the row is missing). */
async function ratingsOf(tools: ActionTools, ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const id of ids) {
    const r = await tools.get<Player>('players', id)
    map.set(id, r.success ? Number(r.data.record.data.rating) : 1000)
  }
  return map
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

  /** Adds a guest who's checked in and in line. Caller must be checked in here; max 4 active guests each. */
  addGuest: action(async ({ userId, params, tools }) => {
    const courtId = text(params.courtId, 64)
    const name = text(params.name, 40)
    if (!courtId || !name) return { success: false, error: 'Court and guest name are required' }

    const checkins = must(await tools.query<Checkin>('checkins', { where: { courtId }, limit: 500 })).records
    if (!checkins.some((c) => c.data.playerId === userId)) {
      return { success: false, error: 'Check in at this court before adding guests' }
    }
    const myGuests = must(await tools.query<Player>('players', { where: { addedBy: userId }, limit: 500 })).records
    const myGuestIds = new Set(myGuests.filter((p) => p.data.isGuest).map((p) => p.recordId))
    if (checkins.filter((c) => myGuestIds.has(c.data.playerId)).length >= 4) {
      return { success: false, error: 'You can have at most 4 guests here' }
    }

    const playerId = await create(tools, 'players', { name, isGuest: true, addedBy: userId, rating: 1000, wins: 0, losses: 0 } satisfies Player)
    await create(tools, 'checkins', { courtId, playerId, checkedInAt: Math.floor(Date.now() / 1000) } satisfies Checkin)
    await create(tools, 'queue', { courtId, playerId, status: 'waiting' } satisfies QueueEntry)
    return { success: true, data: { playerId } }
  }),

  /**
   * Starts a live game from the line. everyone-rotates: first 2N waiting,
   * balanced by rating. winners-stay: last winners who are still here keep
   * their team; the next waiting players are the challengers.
   */
  makeTeams: action(async ({ userId, params, tools }) => {
    const courtId = text(params.courtId, 64)
    const court = must(await tools.get<Court>('courts', courtId)).record.data
    const n = Number(court.teamSize)

    const checkins = must(await tools.query<Checkin>('checkins', { where: { courtId }, limit: 500 })).records
    const here = new Set(checkins.map((c) => c.data.playerId))
    if (!here.has(userId)) return fail('Check in at this court first')

    const live = must(await tools.query<Game>('games', { where: { courtId, status: 'live' }, limit: 1 })).records
    if (live.length > 0) return fail('A game is already live on this court')

    const queue = must(
      await tools.query<QueueEntry>('queue', { where: { courtId }, orderBy: 'createdAt', orderDir: 'asc', limit: 500 }),
    ).records
    const waiting = queue.filter((q) => q.data.status === 'waiting' && here.has(q.data.playerId))

    let stayers: string[] = []
    if (court.rotation === 'winners-stay') {
      const finals = must(
        await tools.query<Game>('games', { where: { courtId, status: 'final' }, orderBy: 'updatedAt', orderDir: 'desc', limit: 1 }),
      ).records
      const last = finals[0]?.data
      if (last?.winner) {
        const onCourt = new Set(queue.filter((q) => q.data.status === 'playing').map((q) => q.data.playerId))
        const winners = last.winner === 'A' ? last.teamA : last.teamB
        stayers = winners.filter((id) => here.has(id) && onCourt.has(id)).slice(0, n)
      }
    }

    const needed = 2 * n - stayers.length
    if (waiting.length < needed) return fail(`Need ${needed} players waiting in line, have ${waiting.length}`)
    const picked = waiting.slice(0, needed).map((q) => q.data.playerId)

    let teamA: string[]
    let teamB: string[]
    if (stayers.length > 0) {
      const fill = n - stayers.length // fill any winner who left from the front of the line
      teamA = [...stayers, ...picked.slice(0, fill)]
      teamB = picked.slice(fill)
    } else {
      const ratings = await ratingsOf(tools, picked)
      const split = balanceTeams(picked.map((id) => ({ id, rating: ratings.get(id) ?? 1000 })))
      teamA = split.teamA.map((p) => p.id)
      teamB = split.teamB.map((p) => p.id)
    }

    // liveKey + uniqueOn: if two makeTeams calls race, the room accepts only
    // the first create, so the loser stops here before touching the queue.
    const game: Game = { courtId, teamA, teamB, scoreA: 0, scoreB: 0, status: 'live', scorekeeperId: userId, recapTone: 'espn', liveKey: courtId }
    const created = await tools.create('games', game)
    if (!created.success) {
      return fail(created.error.startsWith('Duplicate') ? 'A game is already live on this court' : created.error)
    }

    const pickedSet = new Set(picked)
    for (const q of waiting) {
      if (pickedSet.has(q.data.playerId)) must(await tools.update('queue', q.recordId, { status: 'playing' }))
    }
    return { success: true, data: { gameId: created.data.recordId } }
  }),

  /** The current scorekeeper hands the score buttons to a signed-in (non-guest) player in the game. */
  handOffScorekeeper: action(async ({ userId, params, tools }) => {
    const gameId = text(params.gameId, 64)
    const toUserId = text(params.toUserId, 64)
    const game = must(await tools.get<Game>('games', gameId)).record.data
    if (game.scorekeeperId !== userId) return fail('Only the scorekeeper can hand off')
    if (game.status !== 'live') return fail('This game is already over')
    if (![...game.teamA, ...game.teamB].includes(toUserId)) return fail('Pick a player in this game')
    const target = await tools.get<Player>('players', toUserId)
    if (!target.success || target.data.record.data.isGuest) return fail("Guests can't keep score")
    must(await tools.update('games', gameId, { scorekeeperId: toUserId }))
    return { success: true, data: { scorekeeperId: toUserId } }
  }),

  /**
   * Scorekeeper ends a live game once score.ts confirms a winner. Updates
   * ratings (Elo, K=32, team = average), wins/losses, requeues players who are
   * still here, then writes the AI recap. A failed recap never blocks finishing.
   */
  finishGame: action(async ({ userId, params, tools, env, callerJwt }) => {
    const gameId = text(params.gameId, 64)
    const game = must(await tools.get<Game>('games', gameId)).record.data
    if (game.scorekeeperId !== userId) return fail('Only the scorekeeper can finish the game')
    if (game.status !== 'live') return fail('This game is already over')
    const court = must(await tools.get<Court>('courts', game.courtId)).record.data
    const winner = hasWinner(game.scoreA, game.scoreB, Number(court.targetScore), !!court.winBy2)
    if (!winner) {
      return fail(`No winner yet: play to ${court.targetScore}${court.winBy2 ? ' and win by 2' : ''}`)
    }

    const ratings = await ratingsOf(tools, [...game.teamA, ...game.teamB])
    const rated = (ids: string[]) => ids.map((id) => ratings.get(id) ?? 1000)
    const { a, b } = teamDeltas(rated(game.teamA), rated(game.teamB), winner)
    const ratingChanges = { A: a, B: b }

    // Final first, so a second finish attempt is refused right away.
    must(await tools.update('games', gameId, { status: 'final', winner, ratingChanges, liveKey: `final:${gameId}` }))

    for (const [ids, delta, won] of [[game.teamA, a, winner === 'A'], [game.teamB, b, winner === 'B']] as const) {
      for (const id of ids) {
        const p = await tools.get<Player>('players', id)
        if (!p.success) continue
        const cur = p.data.record.data
        must(await tools.update('players', id, {
          rating: Number(cur.rating) + delta,
          wins: Number(cur.wins) + (won ? 1 : 0),
          losses: Number(cur.losses) + (won ? 0 : 1),
        }))
      }
    }

    // Requeue: anyone who left is removed from the line; everyone else goes to
    // the back (losers first). With winners-stay, winners stay on court.
    const here = new Set(
      must(await tools.query<Checkin>('checkins', { where: { courtId: game.courtId }, limit: 500 })).records.map((c) => c.data.playerId),
    )
    const queue = must(await tools.query<QueueEntry>('queue', { where: { courtId: game.courtId }, limit: 500 })).records
    const winners = winner === 'A' ? game.teamA : game.teamB
    const losers = winner === 'A' ? game.teamB : game.teamA
    const stay = court.rotation === 'winners-stay' ? new Set(winners) : new Set<string>()
    for (const id of [...losers, ...winners]) {
      if (stay.has(id) && here.has(id)) continue
      const row = queue.find((q) => q.data.playerId === id)
      if (row) must(await tools.remove('queue', row.recordId))
      if (here.has(id)) await create(tools, 'queue', { courtId: game.courtId, playerId: id, status: 'waiting' } satisfies QueueEntry)
    }

    const recap = await writeRecap(env, callerJwt, { ...game, winner }, ratingChanges, isTone(game.recapTone) ? game.recapTone : 'espn')
    if (recap) must(await tools.update('games', gameId, { recap }))
    return { success: true, data: { winner, ratingChanges, recap } }
  }),

  /** Any player in a finished game (or its scorekeeper) can ask for a new recap, optionally in a new tone. */
  regenerateRecap: action(async ({ userId, params, tools, env, callerJwt }) => {
    const gameId = text(params.gameId, 64)
    const game = must(await tools.get<Game>('games', gameId)).record.data
    if (![...game.teamA, ...game.teamB, game.scorekeeperId].includes(userId)) {
      return fail('Only players in this game can change the recap')
    }
    if (game.status !== 'final' || !game.ratingChanges) return fail('The game has to be finished first')
    const tone = isTone(params.tone) ? params.tone : isTone(game.recapTone) ? game.recapTone : 'espn'
    const recap = await writeRecap(env, callerJwt, game, game.ratingChanges, tone)
    if (!recap) return fail("The recap writer didn't answer. Try again in a moment.")
    must(await tools.update('games', gameId, { recap, recapTone: tone }))
    return { success: true, data: { recap } }
  }),

  /** Owner only, for checking auto-checkout: adds a guest who "checked in" 4 hours ago and is waiting in line. */
  addStaleCheckin: action(async ({ userId, env, params, tools }) => {
    if (userId !== env.OWNER_USER_ID) return fail('Only the app owner can do this')
    const courtId = text(params.courtId, 64)
    must(await tools.get<Court>('courts', courtId))
    const name = `__test-${Date.now()}__ Old timer`
    const playerId = await create(tools, 'players', { name, isGuest: true, addedBy: userId, rating: 1000, wins: 0, losses: 0 } satisfies Player)
    const checkedInAt = Math.floor(Date.now() / 1000) - 4 * 60 * 60
    await create(tools, 'checkins', { courtId, playerId, checkedInAt } satisfies Checkin)
    await create(tools, 'queue', { courtId, playerId, status: 'waiting' } satisfies QueueEntry)
    return { success: true, data: { playerId, name } }
  }),

  /** Test cleanup: owner or @deepspace.test accounts only, and only rows named with the __test- prefix. */
  cleanupTestData: action(async ({ userId, env, tools }) => {
    const user = await tools.get<{ email?: string }>('users', userId)
    const email = user.success ? user.data.record.data.email ?? '' : ''
    if (userId !== env.OWNER_USER_ID && !isTestAccountEmail(email)) {
      return { success: false, error: 'Only the owner or test accounts can clean up test data' }
    }
    let removed = 0
    const remove = async (collection: string, ids: string[]) => {
      for (const id of ids) if ((await tools.remove(collection, id)).success) removed++
    }
    const courts = must(await tools.query<Court>('courts', { limit: 500 })).records
    for (const court of courts.filter((c) => c.data.name.startsWith('__test-'))) {
      const where = { courtId: court.recordId }
      for (const collection of ['games', 'queue', 'checkins']) {
        await remove(collection, must(await tools.query(collection, { where, limit: 500 })).records.map((r) => r.recordId))
      }
      await remove('courts', [court.recordId])
    }
    const players = must(await tools.query<Player>('players', { limit: 1000 })).records
    await remove('players', players.filter((p) => p.data.isGuest && p.data.name.startsWith('__test-')).map((p) => p.recordId))
    return { success: true, data: { removed } }
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
    const seedRatings = names.map((_, i) => Math.round(850 + (i * 400) / (names.length - 1))) // 850 to 1250
    for (const [i, name] of names.entries()) {
      ids.push(await create(tools, 'players', { name, isGuest: true, addedBy: userId, rating: seedRatings[i], ...record[i] } satisfies Player))
    }

    const gameIds: string[] = []
    for (const g of games) {
      const { a, b } = teamDeltas(g.a.map((i) => seedRatings[i]), g.b.map((i) => seedRatings[i]), g.scoreA > g.scoreB ? 'A' : 'B')
      gameIds.push(await create(tools, 'games', {
        ratingChanges: { A: a, B: b },
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
      } satisfies Game))
    }

    return { success: true, data: { courtId, gameIds, alreadySeeded: false } }
  }),
}
