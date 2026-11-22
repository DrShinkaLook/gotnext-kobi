export type Tone = 'espn' | 'trash-talk' | 'stats'

export const TONES: Record<Tone, string> = {
  espn: 'an energetic TV highlight call',
  'trash-talk': 'playful pickup-court trash talk aimed at the losing team',
  stats: 'a dry, numbers-first stat-sheet summary',
}

export function isTone(value: unknown): value is Tone {
  return typeof value === 'string' && value in TONES
}

/**
 * The only facts sent to the model: team names, the score and rating changes.
 * No player names or user ids leave the app.
 */
export function recapPrompt(scoreA: number, scoreB: number, deltaA: number, deltaB: number, tone: Tone) {
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
  const winner = scoreA > scoreB ? 'Team A' : 'Team B'
  return {
    system:
      'You write 2-3 sentence recaps of pickup basketball games. Keep the language clean: no profanity, slurs or insults ' +
      "about anyone's identity. Use only the facts given and don't invent player names, plays or stats.",
    prompt:
      `Final score: Team A ${scoreA}, Team B ${scoreB}. ${winner} won. ` +
      `Rating change per player: Team A ${signed(deltaA)}, Team B ${signed(deltaB)}. ` +
      `Write it as ${TONES[tone]}.`,
  }
}
