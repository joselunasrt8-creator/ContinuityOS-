import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

const targetedRoutes = [
  '/reconcile/closure', '/reconcile/impact', '/reconcile/verdict', '/reconcile/propagation', '/reconcile/topology-delta',
  '/runtime/sovereignty', '/runtime/bootstrap/verify', '/runtime/bootstrap/topology', '/runtime/bootstrap/checkpoint',
  '/registry/graph/verify', '/registry/graph/topology', '/registry/graph/checkpoint', '/registry/graph/orphans',
  '/topology/reconcile', '/topology/drift', '/topology/fingerprint', '/topology/equivalence',
  '/federation/reconcile', '/federation/reconcile/report', '/federation/reconcile/drift', '/federation/reconcile/checkpoint', '/federation/reconcile/topology', '/federation/reconcile/distributed', '/federation/conformance',
  '/governance/evolution/consensus'
]

const requiredEvidenceColumns = [
  ['observability_registry', ['event_id']],
  ['drift_registry', ['drift_id']],
  ['topology_reconciliation_registry', ['evidence_only', 'replay_neutral', 'remote_authority_denied']],
  ['root_authority_observability_registry', ['CREATE TABLE IF NOT EXISTS root_authority_observability_registry','evidence_only','replay_neutral','non_authoritative']],
  ['cross_registry_reconciliation_registry', ['evidence_only', 'replay_neutral', 'non_authoritative']],
]

test('issue #474 target observability routes are constrained to GET/fail-closed mutation handling', () => {
  assert.match(source, /request\.method !== "GET"[\s\S]*405/, 'missing generic get-only fail-closed handling')
  for (const route of targetedRoutes) assert.ok(source.includes(route), `${route} missing from source`) 
})

test('issue #474 target observability registries include evidence-only / replay-neutral / non-authoritative shape', () => {
  for (const [registry, columns] of requiredEvidenceColumns) {
    const listedInRequiredColumns = source.includes(`${registry}:`)
    const hasCreateTable = source.includes(`CREATE TABLE IF NOT EXISTS ${registry}`)
    assert.ok(listedInRequiredColumns || hasCreateTable, `${registry} schema missing`)
    for (const col of columns) assert.ok(source.includes(col), `${registry} missing ${col}`)
  }
})

test('issue #474 observability surfaces remain non-authoritative in policy objects', () => {
  assert.match(source, /reconciliation evidence cannot authorize merge or proof|proof_generating: false/)
  assert.match(source, /remote_authority_denied: true/)
  assert.match(source, /creates_authority: false/)
  assert.match(source, /execution_started: false|executable: false/)
  assert.match(source, /append_only: true|read_only: true/)
})

test('issue #474 governance regeneration determinism test exists', () => {
  const determinism = readFileSync(new URL('./governance-regeneration-determinism.test.mjs', import.meta.url), 'utf8')
  assert.match(determinism, /governance:regenerate/)
  assert.match(determinism, /drifted across repeated governance regeneration/)
})
