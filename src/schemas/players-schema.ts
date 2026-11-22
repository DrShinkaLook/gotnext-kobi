import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

// Players are written only by server actions, so ratings can't be faked.
const readOnly: RolePermissions = { read: true, create: false, update: false, delete: false }

export const playersSchema: CollectionSchema = {
  name: 'players',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'isGuest', storage: 'number', interpretation: 'boolean', default: false },
    { name: 'addedBy', storage: 'text', interpretation: 'plain' },
    { name: 'rating', storage: 'number', interpretation: 'plain', default: 1000 },
    { name: 'wins', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'losses', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: readOnly,
    member: readOnly,
    admin: readOnly,
  },
}
