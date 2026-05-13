import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

class ReadOnlyD1 {
  prepare(sql) {
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        assert.match(sql, /^\s*INSERT INTO federated_reconciliation_registry/i)
        assert.doesNotMatch(sql, /UPDATE|DELETE/i)
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

test('distributed reconciliation exposes only observability drift classes', () => {
  for (const drift of [
    'checkpoint_divergence',
    'federated_replay_collision',
    'authority_conflict',
    'lineage_instability',
    'topology_divergence',
    'projection_corruption',
    'cross_runtime_hash_mismatch'
  ]) {
    assert.match(source, new RegExp(`"${drift}"`))
  }
  assert.match(source, /remote disagreement = observability drift only|OBSERVABILITY_DRIFT_ONLY/)
})

test('distributed reconciliation helpers are deterministic and deny remote authority inheritance', () => {
  for (const helper of [
    'compareFederatedCheckpoints',
    'deriveCheckpointConsensus',
    'detectCheckpointInstability',
    'classifyTopologyDrift',
    'deterministicReconciliationEnvelopeHash',
    'appendFederatedReconciliationObservation'
  ]) {
    assert.match(source, new RegExp(`function ${helper}|async function ${helper}`))
  }
  assert.match(source, /type FederatedReconciliationEnvelope/)
  assert.match(source, /type DistributedCheckpointComparison/)
  assert.match(source, /type FederatedConsensusResult/)
  assert.match(source, /type FederatedTopologyDrift/)
  assert.match(source, /remote_authority_denied: true/)
  assert.match(source, /evidence_only: true/)
  assert.match(source, /read_only: true/)
  assert.match(source, /mutation_capable: false/)
  assert.match(source, /replay_neutral: true/)
  assert.match(source, /accepted_authority: false/)
  assert.doesNotMatch(source, /remote_authority_inherited:\s*true/)
  assert.doesNotMatch(source, /remote_execution_legitimacy:\s*true/)
})

test('federated reconciliation registry remains append-only and deterministic', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS federated_reconciliation_registry \(reconciliation_id TEXT PRIMARY KEY, checkpoint_hash TEXT NOT NULL, canonical_hash TEXT NOT NULL, lineage_root TEXT NOT NULL, continuity_root TEXT NOT NULL, federation_classification TEXT NOT NULL, drift_summary TEXT NOT NULL, replay_indicators TEXT NOT NULL, topology_hash TEXT NOT NULL, generated_at TEXT NOT NULL\)/)
  assert.match(source, /idx_federated_reconciliation_checkpoint_hash/)
  assert.match(source, /idx_federated_reconciliation_lineage_topology/)
  assert.match(source, /trg_federated_reconciliation_registry_no_update/)
  assert.match(source, /trg_federated_reconciliation_registry_no_delete/)
  const appendSource = source.slice(source.indexOf('async function appendFederatedReconciliationObservation'), source.indexOf('async function appendFederatedReconciliationObservation') + 900)
  assert.match(appendSource, /INSERT INTO federated_reconciliation_registry/)
  assert.doesNotMatch(appendSource, /UPDATE federated_reconciliation_registry|DELETE FROM federated_reconciliation_registry/i)
})

test('observability-only route returns a replay-neutral reconciliation envelope without expanding execution surfaces', async () => {
  const { transformSync } = await import('esbuild')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const response = await worker.fetch(new Request('https://runtime.test/federation/reconcile/distributed', { method: 'GET' }), { DB: new ReadOnlyD1() })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.route, '/federation/reconcile/distributed')
  assert.equal(body.remote_authority_denied, true)
  assert.equal(body.evidence_only, true)
  assert.equal(body.read_only, true)
  assert.equal(body.mutation_capable, false)
  assert.equal(body.replay_neutral, true)
  assert.equal(body.remote_execution_legitimacy, false)
  assert.equal(body.remote_authority_inherited, false)
  assert.ok(body.reconciliation_envelope)
  assert.equal(body.reconciliation_envelope.remote_authority_denied, true)
  assert.equal(body.reconciliation_envelope.evidence_only, true)
  assert.equal(body.reconciliation_envelope.read_only, true)
  assert.equal(body.reconciliation_envelope.mutation_capable, false)
  assert.equal(body.reconciliation_envelope.replay_neutral, true)
  assert.ok(Array.isArray(body.checkpoint_comparison_summary.drift_summary))
  assert.ok(Array.isArray(body.topology_drift_summary.drift_summary))
  assert.ok(Array.isArray(body.replay_indicators))
  assert.doesNotMatch(source, /CANONICAL_RUNTIME_ROUTES = \[[^\]]+federation\/reconcile\/distributed/)
})
