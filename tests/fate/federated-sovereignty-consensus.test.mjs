import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0024_federated_sovereignty_consensus.sql', import.meta.url), 'utf8')

function between(start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

const sovereigntySource = between('type FederatedSovereigntyDriftClass', 'async function detectFederatedCheckpointDrift')
const routeSource = between('url.pathname === "/federation/sovereignty/checkpoint"', 'url.pathname === "/federation/conformance"')

class SovereigntyD1 {
  constructor() { this.sovereigntyWrites = 0 }
  prepare(sql) {
    const self = this
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        if (/federated_sovereignty_registry/i.test(sql)) {
          assert.match(sql, /^\s*(CREATE|INSERT|CREATE INDEX|CREATE TRIGGER)/i)
          assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE)/i)
          if (/INSERT INTO federated_sovereignty_registry/i.test(sql)) self.sovereigntyWrites += 1
        }
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

async function loadWorker() {
  const { transformSync } = await import('esbuild')
  return (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
}

test('federated sovereignty envelope includes required deterministic fields and excludes timestamp from identity', () => {
  for (const objectName of ['FederatedSovereigntyEnvelope', 'SovereigntyEquivalenceVerification']) {
    assert.match(sovereigntySource, new RegExp(`type ${objectName}`))
  }
  for (const field of ['runtime_id', 'sovereignty_hash', 'runtime_surface_hash', 'governance_surface_hash', 'replay_surface_hash', 'validator_surface_hash', 'schema_hash', 'migration_chain_hash', 'checkpoint_hash', 'federation_tier', 'replay_neutral', 'evidence_only', 'remote_authority_denied', 'generated_at']) {
    assert.match(sovereigntySource, new RegExp(`${field}`), `${field} must be present`)
  }
  assert.match(sovereigntySource, /const identity = \{ envelope_type: "FederatedSovereigntyEnvelope", runtime_id, \.\.\.surfaces, checkpoint_hash: checkpoint\.checkpoint_id, federation_tier: "bounded_evidence", replay_neutral: true, evidence_only: true, remote_authority_denied: true \}/)
  assert.match(sovereigntySource, /sovereignty_hash = await sha256Hex\(canonicalize\(identity\)\)/)
  assert.doesNotMatch(sovereigntySource, /sha256Hex\(canonicalize\(\{[^}]*generated_at[^}]*sovereignty_hash/)
})

test('sovereignty verification classifies all requested divergence categories deterministically', () => {
  for (const drift of ['runtime_divergence', 'governance_divergence', 'replay_discontinuity', 'proof_topology_mismatch', 'validator_instability', 'schema_mismatch', 'sovereignty_corruption', 'hidden_execution_expansion', 'authority_inheritance_attempt']) {
    assert.match(sovereigntySource, new RegExp(`"${drift}"`), `${drift} must exist in sovereignty classifier`)
  }
  assert.match(sovereigntySource, /remote\.sovereignty_hash/)
  assert.match(sovereigntySource, /remote\.runtime_surface_hash/)
  assert.match(sovereigntySource, /remote\.governance_surface_hash/)
  assert.match(sovereigntySource, /remote\.replay_surface_hash/)
  assert.match(sovereigntySource, /remote\.validator_surface_hash/)
  assert.match(sovereigntySource, /remote\.schema_hash/)
  assert.match(sovereigntySource, /remote\.migration_chain_hash/)
  assert.match(sovereigntySource, /remoteRoutes\.some/)
})

test('federation remains evidence-only and denies remote authority inheritance', () => {
  assert.match(sovereigntySource, /evidence_only: true/)
  assert.match(sovereigntySource, /remote_authority_denied: true/)
  assert.match(sovereigntySource, /replay_neutral: true/)
  assert.match(sovereigntySource, /read_only: true/)
  assert.match(sovereigntySource, /mutation_capable: false/)
  assert.match(sovereigntySource, /remote_authority_inherited: false/)
  assert.match(sovereigntySource, /remote_execution_legitimacy: false/)
  assert.match(sovereigntySource, /local_governance_mutated: false/)
  assert.match(sovereigntySource, /accepted_authority/)
  assert.match(sovereigntySource, /local_execution_authority/)
})

test('federated sovereignty registry is append-only evidence', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS federated_sovereignty_registry/)
  assert.match(migration, /federation_id TEXT PRIMARY KEY/)
  assert.match(migration, /local_runtime_id TEXT NOT NULL/)
  assert.match(migration, /remote_runtime_id TEXT NOT NULL/)
  assert.match(migration, /sovereignty_hash TEXT NOT NULL/)
  assert.match(migration, /equivalence_hash TEXT NOT NULL/)
  assert.match(migration, /drift_summary TEXT NOT NULL/)
  assert.match(migration, /replay_indicators TEXT NOT NULL/)
  assert.match(migration, /verification_status TEXT NOT NULL/)
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /CHECK \(remote_authority_denied='true'\)/)
  assert.match(migration, /trg_federated_sovereignty_registry_no_update/)
  assert.match(migration, /trg_federated_sovereignty_registry_no_delete/)
  assert.match(source, /INSERT INTO federated_sovereignty_registry/)
})

test('GET /federation/sovereignty/checkpoint is deterministic, non-executable, and appends evidence only', async () => {
  const worker = await loadWorker()
  const db = new SovereigntyD1()
  const first = await worker.fetch(new Request('https://runtime.test/federation/sovereignty/checkpoint', { method: 'GET' }), { DB: db })
  const second = await worker.fetch(new Request('https://runtime.test/federation/sovereignty/checkpoint', { method: 'GET' }), { DB: db })
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  const a = await first.json()
  const b = await second.json()
  assert.equal(a.route, '/federation/sovereignty/checkpoint')
  assert.equal(a.evidence_only, true)
  assert.equal(a.remote_authority_denied, true)
  assert.equal(a.read_only, true)
  assert.equal(a.mutation_capable, false)
  assert.equal(a.replay_neutral, true)
  assert.equal(a.remote_authority_inherited, false)
  assert.equal(a.remote_execution_legitimacy, false)
  assert.equal(a.sovereignty_hash, b.sovereignty_hash)
  assert.equal(a.equivalence_hash, b.equivalence_hash)
  assert.equal(db.sovereigntyWrites, 2)
  assert.doesNotMatch(source, /CANONICAL_RUNTIME_ROUTES = \[[^\]]+federation\/sovereignty\/checkpoint/)
  assert.match(routeSource, /observability_only/)
})
