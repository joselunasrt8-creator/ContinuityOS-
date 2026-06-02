// Issue #1773: Phase 3A Agent Tool AEO Template Registry resolution tests.
// Runtime coverage is intentionally limited to deterministic lookup semantics.
// Non-goals: no authority creation, no execution, no proof, no replay mutation,
// and no predicate execution semantics.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../migrations/0068_agent_tool_aeo_template_registry.sql', import.meta.url),
  'utf8'
)
const gatewayLib = readFileSync(
  new URL('../src/lib/agent-tool-gateway.ts', import.meta.url),
  'utf8'
)
const { resolveAgentToolTemplate } = await import('../src/lib/agent-tool-gateway.ts')

function makeRegistryDB(rows) {
  return {
    prepare(sql) {
      assert.match(sql, /agent_tool_aeo_template_registry/)
      return {
        bind(...params) {
          const surfaceType = params[0]
          return {
            async all() {
              return {
                results: rows
                  .filter(r => r.surface_type === surfaceType && r.status === 'ACTIVE')
                  .sort((a, b) => `${a.template_id}:${a.schema_version}`.localeCompare(`${b.template_id}:${b.schema_version}`))
              }
            }
          }
        }
      }
    }
  }
}

function template(overrides = {}) {
  return {
    template_id: 'filesystem_read_v1',
    schema_version: '1.0',
    surface_type: 'filesystem_read',
    status: 'ACTIVE',
    risk_floor: 'P0_READ_ONLY',
    predicate_set_id: 'filesystem_read_predicates_v1',
    predicate_hash: 'sha256:filesystem-read-predicate-hash',
    lineage_version: 'lineage-v1',
    created_at: '2026-06-02T00:00:00.000Z',
    ...overrides
  }
}

test('migration 0068 creates canonical agent_tool_aeo_template_registry surface', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS agent_tool_aeo_template_registry/)
  assert.match(migration, /template_id\s+TEXT NOT NULL/)
  assert.match(migration, /schema_version\s+TEXT NOT NULL/)
  assert.match(migration, /surface_type\s+TEXT NOT NULL/)
  assert.match(migration, /status\s+TEXT NOT NULL CHECK \(status IN \('ACTIVE','INACTIVE','DEPRECATED','DRAFT'\)\)/)
  assert.match(migration, /risk_floor\s+TEXT NOT NULL/)
  assert.match(migration, /predicate_set_id\s+TEXT NOT NULL/)
  assert.match(migration, /predicate_hash\s+TEXT NOT NULL/)
  assert.match(migration, /lineage_version\s+TEXT NOT NULL/)
  assert.match(migration, /created_at\s+TEXT NOT NULL/)
})

test('migration 0068 encodes deterministic uniqueness and ACTIVE surface invariants', () => {
  assert.match(migration, /PRIMARY KEY \(template_id, schema_version\)/)
  assert.match(migration, /idx_agent_tool_aeo_template_registry_active_surface/)
  assert.match(migration, /WHERE status = 'ACTIVE'/)
  assert.match(migration, /agent_tool_aeo_template_registry_append_only_update/)
  assert.match(migration, /agent_tool_aeo_template_registry_append_only_delete/)
})

test('gateway lib exports pure resolveAgentToolTemplate lookup boundary and non-goals', () => {
  assert.match(gatewayLib, /export async function resolveAgentToolTemplate/)
  assert.match(gatewayLib, /Pure lookup boundary only/)
  assert.match(gatewayLib, /no authority creation or reservation/)
  assert.match(gatewayLib, /no tool execution/)
  assert.match(gatewayLib, /no proof generation/)
  assert.match(gatewayLib, /no replay mutation or replay enforcement/)
})

test('TC-01 unknown surface_type → NULL', async () => {
  const result = await resolveAgentToolTemplate('unknown_surface', makeRegistryDB([template()]))
  assert.equal(result, null)
})

test('TC-02 missing surface_type → NULL', async () => {
  assert.equal(await resolveAgentToolTemplate('', makeRegistryDB([template()])), null)
  assert.equal(await resolveAgentToolTemplate(undefined, makeRegistryDB([template()])), null)
})

test('TC-03 inactive template → NULL', async () => {
  const result = await resolveAgentToolTemplate('filesystem_read', makeRegistryDB([template({ status: 'INACTIVE' })]))
  assert.equal(result, null)
})

test('TC-04 deprecated template → NULL', async () => {
  const result = await resolveAgentToolTemplate('filesystem_read', makeRegistryDB([template({ status: 'DEPRECATED' })]))
  assert.equal(result, null)
})

test('TC-05 draft template → NULL', async () => {
  const result = await resolveAgentToolTemplate('filesystem_read', makeRegistryDB([template({ status: 'DRAFT' })]))
  assert.equal(result, null)
})

test('TC-06 multiple ACTIVE templates → NULL', async () => {
  const result = await resolveAgentToolTemplate('filesystem_read', makeRegistryDB([
    template({ template_id: 'filesystem_read_v1', schema_version: '1.0' }),
    template({ template_id: 'filesystem_read_v2', schema_version: '2.0' })
  ]))
  assert.equal(result, null)
})

test('TC-07 missing predicate_hash → NULL', async () => {
  const result = await resolveAgentToolTemplate('filesystem_read', makeRegistryDB([template({ predicate_hash: '' })]))
  assert.equal(result, null)
})

test('TC-08 missing lineage_version → NULL', async () => {
  const result = await resolveAgentToolTemplate('filesystem_read', makeRegistryDB([template({ lineage_version: '' })]))
  assert.equal(result, null)
})

test('TC-09 single ACTIVE template → deterministic resolution success', async () => {
  const result = await resolveAgentToolTemplate('filesystem_read', makeRegistryDB([template()]))
  assert.deepEqual(result, {
    template_id: 'filesystem_read_v1',
    schema_version: '1.0',
    surface_type: 'filesystem_read',
    risk_floor: 'P0_READ_ONLY',
    predicate_set_id: 'filesystem_read_predicates_v1',
    predicate_hash: 'sha256:filesystem-read-predicate-hash',
    lineage_version: 'lineage-v1'
  })
  assert.ok(Object.isFrozen(result))
})
