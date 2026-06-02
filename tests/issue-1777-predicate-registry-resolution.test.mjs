// Issue #1777: Phase 3A Predicate Registry Surface tests.
// Runtime coverage is intentionally limited to deterministic topology lookup.
// Non-goals: no authority creation, no execution, no proof, no replay mutation,
// no predicate execution, and no Ω validator evaluation.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../migrations/0069_predicate_registry.sql', import.meta.url),
  'utf8'
)
const predicateRegistryLib = readFileSync(
  new URL('../src/lib/predicate-registry.ts', import.meta.url),
  'utf8'
)
const { resolvePredicateDefinition } = await import('../src/lib/predicate-registry.ts')

function makeRegistryDB(rows) {
  return {
    prepare(sql) {
      assert.match(sql, /predicate_registry/)
      assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|execution_registry|authority_registry|proof_registry/i)
      return {
        bind(...params) {
          const predicateSetId = params[0]
          return {
            async all() {
              return {
                results: rows
                  .filter(r => r.predicate_set_id === predicateSetId && r.status === 'ACTIVE')
                  .sort((a, b) => `${a.created_at}:${a.predicate_hash}:${a.lineage_version}`.localeCompare(`${b.created_at}:${b.predicate_hash}:${b.lineage_version}`))
              }
            }
          }
        }
      }
    }
  }
}

function predicateDefinition(overrides = {}) {
  return {
    predicate_set_id: 'agent_tool_filesystem_read_predicates_v1',
    predicate_hash: 'sha256:agent-tool-filesystem-read-predicate-set',
    lineage_version: 'lineage-v1',
    status: 'ACTIVE',
    predicate_ids: JSON.stringify([
      'check_surface_type',
      'check_read_only_scope',
      'check_exact_object_hash'
    ]),
    created_at: '2026-06-02T00:00:00.000Z',
    ...overrides
  }
}

test('migration 0069 creates canonical predicate_registry surface', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS predicate_registry/)
  assert.match(migration, /predicate_set_id\s+TEXT NOT NULL/)
  assert.match(migration, /predicate_hash\s+TEXT NOT NULL/)
  assert.match(migration, /lineage_version\s+TEXT NOT NULL/)
  assert.match(migration, /status\s+TEXT NOT NULL CHECK \(status IN \('ACTIVE','INACTIVE','DEPRECATED','DRAFT'\)\)/)
  assert.match(migration, /predicate_ids\s+TEXT NOT NULL/)
  assert.match(migration, /created_at\s+TEXT NOT NULL/)
})

test('migration 0069 is topology-only and append-only', () => {
  assert.match(migration, /idx_predicate_registry_set_status/)
  assert.match(migration, /predicate_registry_append_only_update/)
  assert.match(migration, /predicate_registry_append_only_delete/)
  assert.match(migration, /not execute predicates/i)
  assert.match(migration, /not.*create or reserve authority/i)
  assert.match(migration, /mutate replay state/i)
})

test('predicate registry lib exports pure topology lookup boundary and non-goals', () => {
  assert.match(predicateRegistryLib, /export type PredicateDefinition/)
  assert.match(predicateRegistryLib, /export async function resolvePredicateDefinition/)
  assert.match(predicateRegistryLib, /Topology-only lookup/)
  assert.match(predicateRegistryLib, /no predicate execution or evaluation/)
  assert.match(predicateRegistryLib, /no authority creation, reservation, or execution authorization/)
  assert.match(predicateRegistryLib, /no proof generation/)
  assert.match(predicateRegistryLib, /no replay mutation/)
  assert.match(predicateRegistryLib, /no Ω validator execution or evaluation/)
})

test('TC-01 missing predicate_set_id → NULL', async () => {
  assert.equal(await resolvePredicateDefinition('', makeRegistryDB([predicateDefinition()])), null)
  assert.equal(await resolvePredicateDefinition(undefined, makeRegistryDB([predicateDefinition()])), null)
})

test('TC-02 unknown predicate_set_id → NULL', async () => {
  const result = await resolvePredicateDefinition('unknown_predicates', makeRegistryDB([predicateDefinition()]))
  assert.equal(result, null)
})

test('TC-03 INACTIVE definition → NULL', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([
    predicateDefinition({ status: 'INACTIVE' })
  ]))
  assert.equal(result, null)
})

test('TC-04 DEPRECATED definition → NULL', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([
    predicateDefinition({ status: 'DEPRECATED' })
  ]))
  assert.equal(result, null)
})

test('TC-05 DRAFT definition → NULL', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([
    predicateDefinition({ status: 'DRAFT' })
  ]))
  assert.equal(result, null)
})

test('TC-06 multiple ACTIVE definitions → NULL', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([
    predicateDefinition({ predicate_hash: 'sha256:first' }),
    predicateDefinition({ predicate_hash: 'sha256:second', created_at: '2026-06-02T00:00:01.000Z' })
  ]))
  assert.equal(result, null)
})

test('TC-07 missing predicate_hash → NULL', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([
    predicateDefinition({ predicate_hash: '' })
  ]))
  assert.equal(result, null)
})

test('TC-08 missing lineage_version → NULL', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([
    predicateDefinition({ lineage_version: '' })
  ]))
  assert.equal(result, null)
})

test('TC-09 valid ACTIVE definition → deterministic success', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([predicateDefinition()]))
  assert.deepEqual(result, {
    predicate_set_id: 'agent_tool_filesystem_read_predicates_v1',
    predicate_hash: 'sha256:agent-tool-filesystem-read-predicate-set',
    lineage_version: 'lineage-v1',
    predicate_ids: [
      'check_surface_type',
      'check_read_only_scope',
      'check_exact_object_hash'
    ]
  })
})

test('TC-10 result is immutable', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([predicateDefinition()]))
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.predicate_ids))
  assert.throws(() => {
    result.predicate_hash = 'sha256:mutated'
  }, /read only|Cannot assign/)
  assert.throws(() => {
    result.predicate_ids.push('execute_predicate')
  }, /Cannot add property|not extensible/)
})

test('TC-11 resolution does not imply authority', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([predicateDefinition()]))
  assert.equal(Object.hasOwn(result, 'authority_id'), false)
  assert.equal(Object.hasOwn(result, 'decision_id'), false)
  assert.equal(Object.hasOwn(result, 'permission'), false)
  assert.doesNotMatch(predicateRegistryLib, /authority_registry|reserveAuthority|authorizeExecution/)
})

test('TC-12 resolution does not imply execution', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([predicateDefinition()]))
  assert.equal(Object.hasOwn(result, 'execution_id'), false)
  assert.equal(Object.hasOwn(result, 'execution_eligible'), false)
  assert.equal(Object.hasOwn(result, 'validator_result'), false)
  assert.doesNotMatch(predicateRegistryLib, /execution_registry|execute\(|execution_eligible\s*:\s*true/)
})

test('TC-13 resolution does not imply Ω validator execution', async () => {
  const result = await resolvePredicateDefinition('agent_tool_filesystem_read_predicates_v1', makeRegistryDB([predicateDefinition()]))
  assert.equal(Object.hasOwn(result, 'omega_validator_result'), false)
  assert.equal(Object.hasOwn(result, 'proof_id'), false)
  assert.doesNotMatch(predicateRegistryLib, /proof_registry|omegaValidator|runOmega|validateOmega/)
})
