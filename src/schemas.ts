/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { playersSchema } from './schemas/players-schema'
import { courtsSchema } from './schemas/courts-schema'
import { checkinsSchema } from './schemas/checkins-schema'
import { queueSchema } from './schemas/queue-schema'
import { gamesSchema } from './schemas/games-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  playersSchema,
  courtsSchema,
  checkinsSchema,
  queueSchema,
  gamesSchema,
]
