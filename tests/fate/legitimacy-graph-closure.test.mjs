import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0028_legitimacy_graph_registry.sql', import.meta.url), 'utf8')

async function loadWorker() {
  return (await importWorker()).default
}

class GraphD1 {
  constructor(tables = {}) {
    this.tables = tables
    this.graphWrites = 0
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
          const rows = self.tables[table] || []
          if (table === 'legitimacy_graph_registry' || /CREATE TABLE IF NOT EXISTS legitimacy_graph_registry/i.test(sql)) {
            return Promise.resolve({ results: ['graph_checkpoint_id', 'graph_checkpoint_hash', 'graph_coherence_hash', 'node_count', 'edge_count', 'orphan_count', 'drift_classes', 'checkpoint_object_hash', 'cross_registry_replay_continuity', 'evidence_only', 'replay_neutral', 'mutation_capable', 'remote_authority_denied', 'read_only', 'creates_authority', 'execution_started', 'generated_at', 'created_at'].map((name) => ({ name })) })
          }
          if (rows.length === 0) return Promise.resolve({ results: [] })
          return Promise.resolve({ results: Object.keys(rows[0]).map((name) => ({ name })) })
        }
        if (select) return Promise.resolve({ results: [...(self.tables[select[1]] || [])].reverse() })
        return Promise.resolve({ results: [] })
      },
      first() { return Promise.resolve(null) },
      run() {
        assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE)/i)
        if (/INSERT OR IGNORE INTO legitimacy_graph_registry/i.test(sql)) self.graphWrites += 1
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

const validLineageTables = {
  session_registry: [{ session_id: 's1', identity_id: 'id1', owner: 'owner', trust_tier: 'local', continuity_status: 'ACTIVE', created_at: '1', expires_at: '9' }],
  continuity_registry: [{ continuity_id: 'c1', identity_id: 'id1', session_id: 's1', parent_continuity_id: '', continuity_hash: 'ch', canonical_continuity: '{}', status: 'ACTIVE', issued_at: '1', expires_at: '9', revoked_at: '' }],
  authority_registry: [{ authority_id: 'auth1', decision_id: 'd1', session_id: 's1', owner: 'owner', intent: 'deploy', scope: '{}', constraints: '{}', expiry: '9', status: 'ACTIVE', created_at: '2', continuity_id: 'c1', identity_id: 'id1' }],
  validation_registry: [{ validation_id: 'v1', session_id: 's1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', environment: 'test', result: 'VALID', reason: '', status: 'VALID', created_at: '3', continuity_id: 'c1' }],
  execution_registry: [{ execution_id: 'e1', session_id: 's1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', status: 'EXECUTED', created_at: '4', continuity_id: 'c1' }],
  proof_registry: [{ proof_id: 'p1', session_id: 's1', execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'h1', surface: 'test', run_id: 'r1', commit_sha: 'sha', workflow: 'governed-deploy.yml', environment: 'test', created_at: '5', continuity_id: 'c1', continuity_hash: 'ch', identity_id: 'id1', authority_lineage: 'auth1', execution_lineage: 'e1' }]
}

test('legitimacy graph helpers and canonical models are present', () => {
  for (const helper of ['deterministicGraphTraversalEngine', 'canonicalRegistryNodeModel', 'lineageRootResolver', 'appendGraphClosureCheckpoint', 'exactObjectCheckpointHash']) assert.match(source, new RegExp(`function ${helper}|async function ${helper}`))
  for (const model of ['LegitimacyGraphNode', 'LegitimacyGraphEdge', 'LegitimacyGraphCheckpoint']) assert.match(source, new RegExp(`type ${model}`))
  for (const registry of ['session_registry', 'continuity_registry', 'authority_registry', 'proof_quarantine_registry', 'external_authority_registry', 'federation_conformance_registry', 'runtime_evolution_consensus_registry']) assert.match(source, new RegExp(`"${registry}"`))
})

test('graph drift taxonomy covers fail-closed closure classes', () => {
  for (const drift of ['legitimacy_graph_orphan', 'graph_lineage_fragmentation', 'registry_edge_missing', 'registry_parent_missing', 'registry_child_inconsistency', 'graph_checkpoint_instability', 'cross_registry_hash_divergence', 'replay_lineage_fragmentation', 'proof_graph_discontinuity', 'authority_graph_discontinuity', 'governance_graph_discontinuity', 'federation_graph_discontinuity', 'bootstrap_graph_discontinuity', 'external_authority_graph_discontinuity', 'graph_traversal_depth_exceeded']) assert.match(source, new RegExp(`"${drift}"`), `${drift} missing`)
})

test('legitimacy graph registry is append-only evidence only', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS legitimacy_graph_registry/)
  for (const field of ['graph_checkpoint_id', 'graph_checkpoint_hash', 'graph_coherence_hash', 'node_count', 'edge_count', 'orphan_count', 'drift_classes', 'checkpoint_object_hash', 'cross_registry_replay_continuity']) assert.match(migration, new RegExp(`${field} TEXT`))
  for (const guard of ["CHECK (evidence_only='true')", "CHECK (replay_neutral='true')", "CHECK (mutation_capable='false')", "CHECK (remote_authority_denied='true')", "CHECK (creates_authority='false')", "CHECK (execution_started='false')"]) assert.ok(migration.includes(guard), `${guard} missing`)
  assert.match(migration, /trg_legitimacy_graph_registry_no_update/)
  assert.match(migration, /trg_legitimacy_graph_registry_no_delete/)
  assert.match(source, /INSERT OR IGNORE INTO legitimacy_graph_registry/)
})

test('deterministic traversal ordering emits stable graph hashes', async () => {
  const worker = await loadWorker()
  const first = await worker.fetch(new Request('https://runtime.test/registry/graph/verify', { method: 'GET' }), { DB: new GraphD1(validLineageTables) })
  const second = await worker.fetch(new Request('https://runtime.test/registry/graph/verify', { method: 'GET' }), { DB: new GraphD1(validLineageTables) })
  const a = await first.json()
  const b = await second.json()
  assert.equal(first.status, 200)
  assert.equal(a.graph_checkpoint_hash, b.graph_checkpoint_hash)
  assert.equal(a.graph_coherence_hash, b.graph_coherence_hash)
  assert.deepEqual(a.checkpoint.nodes.map((node) => `${node.registry}:${node.node_id}`), [...a.checkpoint.nodes.map((node) => `${node.registry}:${node.node_id}`)].sort())
})

test('orphan authority detection fails closed on missing session and continuity parents', async () => {
  const worker = await loadWorker()
  const response = await worker.fetch(new Request('https://runtime.test/registry/graph/orphans', { method: 'GET' }), { DB: new GraphD1({ authority_registry: [{ authority_id: 'auth-orphan', decision_id: 'd', session_id: 'missing-session', owner: 'owner', intent: 'x', scope: '{}', constraints: '{}', expiry: '9', status: 'ACTIVE', created_at: '1', continuity_id: 'missing-continuity', identity_id: 'id' }] }) })
  const body = await response.json()
  assert.equal(body.status, 'GRAPH_ORPHANS_DETECTED')
  assert.equal(body.orphan_count, 1)
  assert.match(body.drift_classes.join(','), /legitimacy_graph_orphan/)
  assert.match(body.drift_classes.join(','), /authority_graph_discontinuity/)
})

test('orphan proof detection and missing parent edge detection classify proof discontinuity', async () => {
  const worker = await loadWorker()
  const response = await worker.fetch(new Request('https://runtime.test/registry/graph/verify', { method: 'GET' }), { DB: new GraphD1({ proof_registry: [{ proof_id: 'proof-orphan', session_id: 's', execution_id: 'missing-execution', decision_id: 'd', validated_object_hash: 'h', surface: 'x', run_id: 'r', commit_sha: 'sha', workflow: 'wf', environment: 'test', created_at: '1', continuity_id: 'missing-continuity' }] }) })
  const body = await response.json()
  assert.equal(body.status, 'GRAPH_CLOSURE_DRIFT')
  assert.match(body.drift_classes.join(','), /registry_parent_missing/)
  assert.match(body.drift_classes.join(','), /registry_edge_missing/)
  assert.match(body.drift_classes.join(','), /proof_graph_discontinuity/)
})

test('replay lineage fragmentation is reported for execution continuity gaps', async () => {
  const worker = await loadWorker()
  const response = await worker.fetch(new Request('https://runtime.test/registry/graph/checkpoint', { method: 'GET' }), { DB: new GraphD1({ execution_registry: [{ execution_id: 'e-orphan', session_id: 's', decision_id: 'd', validated_object_hash: 'h', invocation_nonce: 'n', status: 'EXECUTED', created_at: '1', continuity_id: 'missing-continuity' }] }) })
  const body = await response.json()
  assert.equal(body.checkpoint.cross_registry_replay_continuity, 'FRAGMENTED')
  assert.match(body.drift_classes.join(','), /replay_lineage_fragmentation/)
})

test('bootstrap, external authority, and federation graph discontinuities are classified', () => {
  assert.match(source, /bootstrap_graph_discontinuity/)
  assert.match(source, /external_authority_graph_discontinuity/)
  assert.match(source, /federation_graph_discontinuity/)
  assert.match(source, /registryDiscontinuityDrift/)
})

test('bounded traversal depth is enforced', () => {
  assert.match(source, /LEGITIMACY_GRAPH_MAX_TRAVERSAL_DEPTH = SYSTEM_MAX_CONTINUITY_DEPTH/)
  assert.match(source, /depth > depthLimit/)
  assert.match(source, /graph_traversal_depth_exceeded/)
})

test('graph routes are GET-only and observability flags are immutable', async () => {
  const worker = await loadWorker()
  const post = await worker.fetch(new Request('https://runtime.test/registry/graph/topology', { method: 'POST' }), { DB: new GraphD1(validLineageTables) })
  const blocked = await post.json()
  assert.equal(post.status, 405)
  assert.equal(blocked.mutation_capable, false)
  for (const route of ['/registry/graph/verify', '/registry/graph/topology', '/registry/graph/checkpoint', '/registry/graph/orphans']) {
    const response = await worker.fetch(new Request(`https://runtime.test${route}`, { method: 'GET' }), { DB: new GraphD1(validLineageTables) })
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.evidence_only, true)
    assert.equal(body.replay_neutral, true)
    assert.equal(body.mutation_capable, false)
    assert.equal(body.remote_authority_denied, true)
    assert.equal(body.read_only, true)
    assert.equal(body.creates_authority, false)
    assert.equal(body.execution_started, false)
  }
})

test('CANONICAL_RUNTIME_ROUTES remains unchanged by graph observability routes', () => {
  assert.match(source, /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/)
  assert.doesNotMatch(source.match(/const CANONICAL_RUNTIME_ROUTES = ([^\n]+)/)?.[1] || '', /registry\/graph/)
})
