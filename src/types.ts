// Field shapes for each collection (these live in record.data).

export type Player = {
  name: string
  isGuest: boolean
  addedBy: string
  rating: number
  wins: number
  losses: number
}

export type Court = {
  name: string
  location: string
  teamSize: '3' | '4' | '5'
  targetScore: number
  winBy2: boolean
  rotation: 'winners-stay' | 'everyone-rotates'
}

export type Checkin = {
  courtId: string
  playerId: string
  /** Unix seconds */
  checkedInAt: number
}

export type QueueEntry = {
  courtId: string
  playerId: string
  status: 'waiting' | 'playing'
}

export type RecapTone = 'espn' | 'trash-talk' | 'stats'

export type Game = {
  courtId: string
  teamA: string[]
  teamB: string[]
  scoreA: number
  scoreB: number
  status: 'live' | 'final'
  scorekeeperId: string
  winner?: 'A' | 'B'
  recap?: string
  recapTone: RecapTone
  liveKey?: string
}
