import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0020_governance_compression.sql', import.meta.url), 'utf8')

class CompressionD1 {
  prepare(sql) {
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        assert.match(sql, /^\s*INSERT INTO governance_compression_registry/i)
        assert.doesNotMatch(sql, /UPDATE|DELETE/i)
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

test('governance compression objects and deterministic helpers are present', () => {
  for (const objectName of [
    'GovernanceCompressionEnvelope',
    'FederatedGovernanceSummary',
    'DriftCompressionSummary',
    'ReplayCompressionSummary',
    'TopologyCompressionSummary'
  ]) assert.match(source, new RegExp(`type ${objectName}`))

  for (const helper of [
    'compressFederatedDrift',
    'compressReplayIndicators',
    'compressTopologyState',
    'deriveGovernanceCompression',
    'deterministicCompressionHash'
  ]) assert.match(source, new RegExp(`function ${helper}|async function ${helper}`))

  assert.match(source, /remote_authority_denied: true/)
  assert.match(source, /evidence_only: true/)
  assert.match(source, /read_only: true/)
  assert.match(source, /mutation_capable: false/)
  assert.match(source, /replay_neutral: true/)
  assert.match(source, /replay_consumed: false/)
  assert.doesNotMatch(source, /accepted_authority:\s*true/)
})

test('compression drift classification remains observable-only', () => {
  for (const drift of [
    'compression_divergence',
    'reconciliation_instability',
    'federated_summary_mismatch',
    'topology_compression_corruption',
    'replay_summary_divergence'
  ]) assert.match(source, new RegExp(`"${drift}"`))
  assert.match(source, /normalizeCompressionDriftClass/)
})

test('governance compression registry is deterministic append-only evidence', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS governance_compression_registry/)
  assert.match(migration, /compression_id TEXT PRIMARY KEY/)
  assert.match(migration, /canonical_hash TEXT NOT NULL/)
  assert.match(migration, /idx_governance_compression_registry_hash_unique/)
  assert.match(migration, /idx_governance_compression_registry_reconciliation/)
  assert.match(migration, /idx_governance_compression_registry_topology_lineage/)
  assert.match(migration, /trg_governance_compression_registry_no_update/)
  assert.match(migration, /trg_governance_compression_registry_no_delete/)
  const appendSource = source.slice(source.indexOf('async function appendGovernanceCompressionObservation'), source.indexOf('async function appendGovernanceCompressionObservation') + 900)
  assert.match(appendSource, /INSERT INTO governance_compression_registry/)
  assert.doesNotMatch(appendSource, /UPDATE governance_compression_registry|DELETE FROM governance_compression_registry/i)
})

test('compression observability route is replay-neutral and denies remote authority', async () => {
  const { transformSync } = await import('esbuild')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const response = await worker.fetch(new Request('https://runtime.test/federation/reconcile/compression', { method: 'GET' }), { DB: new CompressionD1() })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.route, '/federation/reconcile/compression')
  assert.equal(body.remote_authority_denied, true)
  assert.equal(body.evidence_only, true)
  assert.equal(body.read_only, true)
  assert.equal(body.mutation_capable, false)
  assert.equal(body.replay_neutral, true)
  assert.equal(body.remote_execution_legitimacy, false)
  assert.equal(body.remote_authority_inherited, false)
  assert.ok(body.governance_compression_envelope)
  assert.equal(body.governance_compression_envelope.remote_authority_denied, true)
  assert.equal(body.governance_compression_envelope.evidence_only, true)
  assert.ok(body.federated_governance_summary)
  assert.ok(Array.isArray(body.governance_compression_envelope.participating_runtimes))
  assert.ok(body.compressed_drift_summary)
  assert.ok(body.compressed_replay_summary)
  assert.ok(body.compressed_topology_summary)
  assert.doesNotMatch(source, /CANONICAL_RUNTIME_ROUTES = \[[^\]]+federation\/reconcile\/compression/)
})
