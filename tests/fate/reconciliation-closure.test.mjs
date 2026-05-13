import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0029_reconciliation_closure_registry.sql', import.meta.url), 'utf8')

async function loadWorker() {
  const { transformSync } = await import('esbuild')
  return (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
}

const closureColumns = ['closure_id', 'closure_hash', 'deterministic_reconciliation_anchor', 'recursive_checkpoint_identity', 'reconciliation_equivalence_state', 'lineage_depth', 'bounded_window', 'graph_checkpoint_hash', 'bootstrap_checkpoint_hash', 'runtime_sovereignty_checkpoint_hash', 'federation_conformance_checkpoint_hash', 'drift_classes', 'closure_object_hash', 'evidence_only', 'replay_neutral', 'mutation_capable', 'remote_authority_denied', 'read_only', 'creates_authority', 'execution_started', 'replay_consumed', 'generated_at', 'created_at']
const graphColumns = ['graph_checkpoint_id', 'graph_checkpoint_hash', 'graph_coherence_hash', 'node_count', 'edge_count', 'orphan_count', 'drift_classes', 'checkpoint_object_hash', 'cross_registry_replay_continuity', 'evidence_only', 'replay_neutral', 'mutation_capable', 'remote_authority_denied', 'read_only', 'creates_authority', 'execution_started', 'generated_at', 'created_at']

class ClosureD1 {
  constructor(tables = {}) {
    this.tables = tables
    this.closureWrites = 0
  }

  prepare(sql) {
    const self = this
    const pragma = sql.match(/PRAGMA table_info\(([^)]+)\)/i)
    const select = sql.match(/SELECT \* FROM ([a-z_]+)/i)
    return {
      bind() { return this },
      all() {
        if (pragma) {
          const table = pragma[1]
          if (table === 'reconciliation_closure_registry') return Promise.resolve({ results: closureColumns.map((name) => ({ name })) })
          if (table === 'legitimacy_graph_registry') return Promise.resolve({ results: graphColumns.map((name) => ({ name })) })
          const rows = self.tables[table] || []
          if (rows.length === 0) return Promise.resolve({ results: [] })
          return Promise.resolve({ results: Object.keys(rows[0]).map((name) => ({ name })) })
        }
        if (select) return Promise.resolve({ results: [...(self.tables[select[1]] || [])].reverse() })
        return Promise.resolve({ results: [] })
      },
      first() { return Promise.resolve(null) },
      run() {
        assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE)/i)
        if (/INSERT INTO reconciliation_closure_registry/i.test(sql)) self.closureWrites += 1
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

const stableTables = {
  session_registry: [{ session_id: 's1', identity_id: 'id1', owner: 'owner', trust_tier: 'local', continuity_status: 'ACTIVE', created_at: '1', expires_at: '9' }],
  continuity_registry: [{ continuity_id: 'c1', identity_id: 'id1', session_id: 's1', parent_continuity_id: '', continuity_hash: 'ch', canonical_continuity: '{}', status: 'ACTIVE', issued_at: '1', expires_at: '9', revoked_at: '' }],
  authority_registry: [{ authority_id: 'auth1', decision_id: 'd1', session_id: 's1', owner: 'owner', intent: 'deploy', scope: '{}', constraints: '{}', expiry: '9', status: 'ACTIVE', created_at: '2', continuity_id: 'c1', identity_id: 'id1' }],
  validation_registry: [{ validation_id: 'v1', session_id: 's1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', environment: 'test', result: 'VALID', reason: '', status: 'VALID', created_at: '3', continuity_id: 'c1' }],
  execution_registry: [{ execution_id: 'e1', session_id: 's1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', status: 'EXECUTED', created_at: '4', continuity_id: 'c1' }],
  proof_registry: [{ proof_id: 'p1', session_id: 's1', execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'h1', surface: 'test', run_id: 'r1', commit_sha: 'sha', workflow: 'governed-deploy.yml', environment: 'test', created_at: '5', continuity_id: 'c1', continuity_hash: 'ch', identity_id: 'id1', authority_lineage: 'auth1', execution_lineage: 'e1' }],
  bootstrap_sovereignty_registry: [{ checkpoint_id: 'b1', manifest_hash: 'bm', lineage_checkpoint_hash: 'bl', deployment_lineage_root: 'dr', bootstrap_trust_root_hash: 'bt', initialization_order_hash: 'io', startup_dependency_graph_hash: 'sd', startup_topology_hash: 'st', replay_neutrality_hash: 'rn', conformance_status: 'BOOTSTRAP_CONFORMANT', drift_classes: '[]', evidence_only: 'true', replay_neutral: 'true', mutation_capable: 'false', remote_authority_denied: 'true', read_only: 'true', generated_at: '6', created_at: '6' }],
  runtime_sovereignty_registry: [{ sovereignty_id: 'r1', sovereignty_hash: 'rs', runtime_surface_hash: 'surface', governance_surface_hash: 'gov', replay_surface_hash: 'rep', proof_surface_hash: 'proof', validator_surface_hash: 'val', schema_hash: 'schema', migration_chain_hash: 'mig', generated_at: '7' }],
  federation_conformance_registry: [{ conformance_id: 'f1', envelope_id: 'env', runtime_id: 'local', remote_runtime_id: 'remote', fingerprint_hash: 'fp', checkpoint_hash: 'fc', compatibility_hash: 'compat', conformance_status: 'CONFORMANT', drift_classes: '[]', evidence_only: 'true', remote_authority_denied: 'true', read_only: 'true', mutation_capable: 'false', replay_neutral: 'true', generated_at: '8', created_at: '8' }]
}

test('recursive reconciliation closure helpers and object are present', () => {
  for (const helper of ['buildRecursiveReconciliationClosureObject', 'appendReconciliationClosureObservation', 'ensureReconciliationClosureRegistry', 'reconciliationClosureFlags', 'latestCheckpointBinding']) assert.match(source, new RegExp(`function ${helper}|async function ${helper}`))
  assert.match(source, /type RecursiveReconciliationClosureObject/)
  assert.match(source, /RECONCILIATION_CLOSURE_MAX_WINDOW/)
})

test('closure drift taxonomy covers fail-closed recursive reconciliation classes', () => {
  for (const drift of ['recursive_reconciliation_divergence', 'reconciliation_equivalence_drift', 'recursive_lineage_fragmentation', 'recursive_checkpoint_instability', 'reconciliation_closure_failure', 'reconciliation_anchor_instability', 'reconciliation_graph_binding_drift', 'reconciliation_bootstrap_binding_drift', 'reconciliation_sovereignty_binding_drift', 'reconciliation_federation_binding_drift', 'reconciliation_replay_resurrection_attempt', 'reconciliation_window_overflow', 'reconciliation_closure_hash_mismatch']) assert.match(source, new RegExp(`"${drift}"`), `${drift} missing`)
})

test('reconciliation closure registry is append-only evidence-only and replay-neutral', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reconciliation_closure_registry/)
  for (const field of ['closure_hash', 'deterministic_reconciliation_anchor', 'recursive_checkpoint_identity', 'reconciliation_equivalence_state', 'lineage_depth', 'bounded_window', 'graph_checkpoint_hash', 'bootstrap_checkpoint_hash', 'runtime_sovereignty_checkpoint_hash', 'federation_conformance_checkpoint_hash', 'closure_object_hash']) assert.match(migration, new RegExp(`${field} TEXT NOT NULL`))
  for (const guard of ["CHECK (evidence_only='true')", "CHECK (replay_neutral='true')", "CHECK (mutation_capable='false')", "CHECK (remote_authority_denied='true')", "CHECK (read_only='true')", "CHECK (creates_authority='false')", "CHECK (execution_started='false')", "CHECK (replay_consumed='false')"]) assert.ok(migration.includes(guard), `${guard} missing`)
  assert.match(migration, /trg_reconciliation_closure_registry_no_update/)
  assert.match(migration, /trg_reconciliation_closure_registry_no_delete/)
})

test('closure routes are GET-only observability routes and canonical runtime routes are unchanged', () => {
  for (const route of ['/reconcile/closure', '/reconcile/closure/checkpoint', '/reconcile/closure/equivalence', '/reconcile/closure/drift']) assert.match(source, new RegExp(route.replaceAll('/', '\\/')))
  assert.doesNotMatch(source, /CANONICAL_RUNTIME_ROUTES = \[[^\]]+reconcile\/closure/)
  assert.match(source, /RECONCILIATION_CLOSURE_ROUTES\.includes[\s\S]*reason: "get_only"[\s\S]*reconciliationClosureFlags/)
})

test('GET closure emits deterministic hash and stable equivalence for same state with immutable flags', async () => {
  const runtime = await loadWorker()
  const db = new ClosureD1(stableTables)
  const first = await (await runtime.fetch(new Request('https://runtime.test/reconcile/closure'), { DB: db })).json()
  const second = await (await runtime.fetch(new Request('https://runtime.test/reconcile/closure'), { DB: db })).json()
  assert.equal(first.route, '/reconcile/closure')
  assert.equal(first.evidence_only, true)
  assert.equal(first.replay_neutral, true)
  assert.equal(first.mutation_capable, false)
  assert.equal(first.remote_authority_denied, true)
  assert.equal(first.read_only, true)
  assert.equal(first.creates_authority, false)
  assert.equal(first.execution_started, false)
  assert.equal(first.replay_consumed, false)
  assert.equal(first.closure.closure_hash, second.closure.closure_hash)
  assert.equal(first.closure.reconciliation_equivalence_state, second.closure.reconciliation_equivalence_state)
  assert.ok(first.closure.deterministic_reconciliation_anchor)
  assert.ok(first.closure.recursive_checkpoint_identity)
  assert.ok(db.closureWrites >= 2)
})

test('checkpoint and equivalence routes expose graph, bootstrap, sovereignty, and federation bindings', async () => {
  const runtime = await loadWorker()
  const checkpoint = await (await runtime.fetch(new Request('https://runtime.test/reconcile/closure/checkpoint'), { DB: new ClosureD1(stableTables) })).json()
  const equivalence = await (await runtime.fetch(new Request('https://runtime.test/reconcile/closure/equivalence'), { DB: new ClosureD1(stableTables) })).json()
  assert.equal(checkpoint.route, '/reconcile/closure/checkpoint')
  assert.ok(checkpoint.checkpoint.graph_checkpoint_hash)
  assert.equal(checkpoint.checkpoint.bootstrap_checkpoint_hash, 'bl')
  assert.equal(checkpoint.checkpoint.runtime_sovereignty_checkpoint_hash, 'rs')
  assert.equal(checkpoint.checkpoint.federation_conformance_checkpoint_hash, 'compat')
  assert.equal(equivalence.route, '/reconcile/closure/equivalence')
  assert.match(equivalence.reconciliation_equivalence_state, /^RECONCILIATION_/)
})

test('recursive drift probes fail closed for instability, corruption, replay resurrection, accumulation, and window overflow', async () => {
  const runtime = await loadWorker()
  const probes = [
    ['consume_replay_state=true', 'reconciliation_replay_resurrection_attempt'],
    ['window=1', 'reconciliation_window_overflow'],
    ['anchor=bad', 'reconciliation_anchor_instability'],
    ['checkpoint_identity=bad', 'recursive_checkpoint_instability'],
    ['bootstrap_checkpoint_hash=bad', 'reconciliation_bootstrap_binding_drift'],
    ['runtime_sovereignty_checkpoint_hash=bad', 'reconciliation_sovereignty_binding_drift'],
    ['federation_conformance_checkpoint_hash=bad', 'reconciliation_federation_binding_drift'],
    ['closure_hash=bad', 'reconciliation_closure_hash_mismatch']
  ]
  for (const [query, drift] of probes) {
    const body = await (await runtime.fetch(new Request(`https://runtime.test/reconcile/closure/drift?${query}`), { DB: new ClosureD1(stableTables) })).json()
    assert.equal(body.route, '/reconcile/closure/drift')
    assert.ok(body.drift_classes.includes(drift), `${query} must include ${drift}`)
    assert.equal(body.evidence_only, true)
    assert.equal(body.replay_consumed, false)
  }
})

