import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../../migrations/0023_recursive_governance_enforcement_boundary.sql', import.meta.url), 'utf8')
const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('recursive governance replay registry consumes approvals once', () => {
  assert.match(migration, /recursive_governance_replay_registry/)
  assert.match(migration, /UNIQUE\(governance_id\)/)
  assert.match(source, /INSERT INTO recursive_governance_replay_registry/)
  assert.match(source, /replay_blocked: true/)
})
