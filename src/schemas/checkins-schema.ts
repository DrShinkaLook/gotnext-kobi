import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const publicRead: RolePermissions = { read: true, create: false, update: false, delete: false }
const member: RolePermissions = { read: true, create: true, update: false, delete: 'own' }

export const checkinsSchema: CollectionSchema = {
  name: 'checkins',
  columns: [
    {
      name: 'courtId',
      storage: 'text',
      interpretation: { kind: 'reference', targetTable: 'courts', displayColumn: 'name' },
      required: true,
    },
    { name: 'playerId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'checkedInAt', storage: 'number', interpretation: 'plain', required: true },
  ],
  // One check-in per player per court, even if two taps race.
  uniqueOn: ['courtId', 'playerId'],
  permissions: {
    '*': publicRead,
    viewer: publicRead,
    member,
    admin: member,
  },
}
