import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const publicRead: RolePermissions = { read: true, create: false, update: false, delete: false }
const member: RolePermissions = { read: true, create: true, update: 'own', delete: 'own' }

export const courtsSchema: CollectionSchema = {
  name: 'courts',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'location', storage: 'text', interpretation: 'plain' },
    { name: 'teamSize', storage: 'text', interpretation: { kind: 'select', options: ['3', '4', '5'] }, default: '5' },
    { name: 'targetScore', storage: 'number', interpretation: 'plain', default: 11 },
    { name: 'winBy2', storage: 'number', interpretation: 'boolean', default: true },
    {
      name: 'rotation',
      storage: 'text',
      interpretation: { kind: 'select', options: ['winners-stay', 'everyone-rotates'] },
      default: 'everyone-rotates',
    },
  ],
  permissions: {
    '*': publicRead,
    viewer: publicRead,
    member,
    admin: { ...member, update: true, delete: true },
  },
}
