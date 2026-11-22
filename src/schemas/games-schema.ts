import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const readOnly: RolePermissions = { read: true, create: false, update: false, delete: false }

// Games are created by the makeTeams action. From the browser, only the
// scorekeeper (ownerField) may write, and only the two score fields.
// scorekeeperId is not userBound: the SDK freezes userBound fields on every
// update, which would make handOffScorekeeper impossible.
const scorekeeper: RolePermissions = {
  read: true,
  create: false,
  update: 'own',
  delete: false,
  writableFields: ['scoreA', 'scoreB'],
}

export const gamesSchema: CollectionSchema = {
  name: 'games',
  columns: [
    { name: 'courtId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'teamA', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'teamB', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'scoreA', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'scoreB', storage: 'number', interpretation: 'plain', default: 0 },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['live', 'final'] },
      default: 'live',
    },
    { name: 'scorekeeperId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'winner', storage: 'text', interpretation: { kind: 'select', options: ['A', 'B'] } },
    { name: 'recap', storage: 'text', interpretation: 'plain' },
    {
      name: 'recapTone',
      storage: 'text',
      interpretation: { kind: 'select', options: ['espn', 'trash-talk', 'stats'] },
      default: 'espn',
    },
    // { A, B }: rating change each player on that team got when the game finished.
    { name: 'ratingChanges', storage: 'text', interpretation: { kind: 'json' } },
    // = courtId while live, `final:<gameId>` after. uniqueOn makes the room
    // refuse a second live game on the same court, even if two people tap
    // "Make teams" at the same moment.
    { name: 'liveKey', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['liveKey'],
  ownerField: 'scorekeeperId',
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: readOnly,
    member: scorekeeper,
    admin: scorekeeper,
  },
}
