import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const publicRead: RolePermissions = { read: true, create: false, update: false, delete: false }
const member: RolePermissions = { read: true, create: true, update: false, delete: 'own' }

// Queue order is the record's createdAt.
export const queueSchema: CollectionSchema = {
  name: 'queue',
  columns: [
    { name: 'courtId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'playerId', storage: 'text', interpretation: 'plain', required: true },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['waiting', 'playing'] },
      default: 'waiting',
    },
  ],
  uniqueOn: ['courtId', 'playerId'],
  permissions: {
    '*': publicRead,
    viewer: publicRead,
    member,
    admin: member,
  },
}
