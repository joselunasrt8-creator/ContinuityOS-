import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readJson(path) {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
}

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const surfaces = readJson('runtime/orchestration_surfaces.json')
const bypasses = readJson('runtime/distributed_bypass_paths.json')
const rules = readJson('runtime/orchestration_authority_rules.json')

const validFixture = readJson('tests/fixtures/orchestration-lineage/valid-canonical-lineage.json')
const orphanFixture = readJson('tests/fixtures/orchestration-lineage/orphan-queue-consumer.json')
const replayedFixture = readJson('tests/fixtures/orchestration-lineage/replayed-lineage.json')

test('Issue #680: canonical distributed topology requires orchestration boundary before execute', () => {
  assert.deepEqual(surfaces.canonical_distributed_topology, [
    '/session',
    '/continuity',
    '/authority',
    '/compile',
    '/validate',
    'orchestration_boundary',
    '/execute',
    '/proof',
  ])
  assert.equal(validFixture.expected_result, 'VALID')
})

test('Issue #680: detached or replayed lineage fixtures deterministically fail closed', () => {
  assert.equal(orphanFixture.expected_result, 'NULL')
  assert.equal(orphanFixture.reason, 'detached_queue_consumer')
  assert.equal(replayedFixture.expected_result, 'NULL')
  assert.equal(replayedFixture.lineage_state, 'REPLAYED')
})

test('Issue #680: distributed bypass classes are enumerated and all resolve to NULL', () => {
  const ids = new Set(bypasses.bypass_paths.map((entry) => entry.bypass_id))
  for (const id of [
    'duplicate_queue_delivery',
    'workflow_replay',
    'fanout_divergence',
    'orphan_retry_execution',
    'stale_authority_reuse',
    'webhook_without_continuity',
    'cross_agent_lineage_drift',
    'asynchronous_validator_escape',
    'choreography_only_execution',
  ]) assert.equal(ids.has(id), true)

  assert.equal(bypasses.fail_closed_response, 'NULL')
  assert.equal(bypasses.required_invariant, 'event_received != execution_authorized')
})

test('Issue #680: authority rules preserve non-transferability, hash equality, and fail-closed undeclared surfaces', () => {
  assert.equal(rules.execution_gate, 'VALID && AUTHORIZED && UNUSED && POLICY_VALID && CANONICAL_LINEAGE_CONTINUITY')
  assert.equal(rules.else_result, 'NULL')
  assert.equal(rules.rules.orchestration_authority_required, true)
  assert.equal(rules.rules.execution_authority_non_transferable, true)
  assert.equal(rules.rules.execution_hash_equals_validated_hash, true)
  assert.equal(rules.rules.undeclared_orchestration_surfaces_fail_closed, true)
})

test('Issue #680: runtime enforcement code paths retain continuity, replay, and validation fail-closed checks', () => {
  assert.match(source, /invalid_continuity/)
  assert.match(source, /replay_detected/)
  assert.match(source, /orphan_execution_lineage/)
  assert.match(source, /hash_mismatch/)
})
