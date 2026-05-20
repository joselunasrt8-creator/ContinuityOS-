import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readJson(path) {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
}

const surfaces = readJson('runtime/delegation_authority_surfaces.json')
const expiryRules = readJson('runtime/delegation_expiry_rules.json')
const authorityGraph = readJson('runtime/multi_agent_authority_graph.json')
const bypassPaths = readJson('runtime/delegation_bypass_paths.json')

const validFixture = readJson('tests/fixtures/delegation-lineage/valid_canonical_delegation.json')
const expiredFixture = readJson('tests/fixtures/delegation-lineage/expired_delegation.json')
const replayedFixture = readJson('tests/fixtures/delegation-lineage/replayed_delegation.json')
const orphanFixture = readJson('tests/fixtures/delegation-lineage/orphan_worker_execution.json')
const quorumFixture = readJson('tests/fixtures/delegation-lineage/quorum_without_authority.json')
const chainedFixture = readJson('tests/fixtures/delegation-lineage/chained_delegation_escalation.json')

test('distributed delegation governance closure: gate and canonical path remain bounded', () => {
  assert.equal(surfaces.required_execution_gate, 'VALID && AUTHORIZED && UNUSED && POLICY_VALID && CANONICAL_LINEAGE_CONTINUITY')
  assert.equal(surfaces.else_result, 'NULL')
  assert.deepEqual(surfaces.canonical_delegation_path, [
    '/session',
    '/continuity',
    '/authority',
    '/compile',
    '/validate',
    'delegation_boundary',
    '/execute',
    '/proof',
  ])
})

test('distributed delegation governance closure: invalid delegation states fail closed', () => {
  assert.equal(expiredFixture.expected_result, 'NULL')
  assert.equal(replayedFixture.expected_result, 'NULL')
  assert.equal(orphanFixture.expected_result, 'NULL')
  assert.equal(quorumFixture.expected_result, 'NULL')
  assert.equal(chainedFixture.expected_result, 'NULL')
})

test('distributed delegation governance closure: expiry and replay rules are deterministic NULL', () => {
  assert.equal(expiryRules.rules.expired_delegation, 'NULL')
  assert.equal(expiryRules.rules.used_delegation_replay, 'NULL')
  assert.equal(expiryRules.deterministic, true)
})

test('distributed delegation governance closure: cross-agent authority aggregation without binding fails closed', () => {
  assert.equal(authorityGraph.forbidden.cross_agent_authority_aggregation_without_binding, 'NULL')
  assert.equal(authorityGraph.forbidden.multi_agent_authority_synthesis, 'NULL')
  assert.equal(authorityGraph.forbidden.orphan_orchestration_continuation, 'NULL')
  assert.equal(authorityGraph.lineage_requirements.canonical_lineage_continuity_required, true)
})

test('distributed delegation governance closure: only bounded canonical delegation path reaches VALID', () => {
  assert.equal(validFixture.expected_result, 'VALID')
  const ids = new Set(bypassPaths.bypass_paths.map((entry) => entry.bypass_id))
  for (const id of [
    'delegated_authority_replay',
    'stale_authority_continuation',
    'quorum_emergent_legitimacy',
    'detached_worker_execution',
    'chained_delegation_escalation',
    'multi_agent_authority_synthesis',
    'orphan_orchestration_continuation',
  ]) assert.equal(ids.has(id), true)

  assert.equal(bypassPaths.fail_closed_response, 'NULL')
})
