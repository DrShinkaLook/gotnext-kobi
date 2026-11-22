import { describe, expect, it } from 'vitest'
import { lintSchema } from 'deepspace/worker'
import { schemas } from './schemas'

describe('schemas', () => {
  for (const schema of schemas) {
    it(`${schema.name} has no lint warnings`, () => {
      expect(lintSchema(schema)).toEqual([])
    })
  }
})
