import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0027_bootstrap_sovereignty_registry.sql', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')

class BootstrapD1 {
  constructor() { this.bootstrapWrites = 0 }
  prepare(sql) {
    const self = this
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        if (/bootstrap_sovereignty_registry/i.test(sql)) {
          assert.match(sql, /^\s*(CREATE|INSERT OR IGNORE|CREATE INDEX|CREATE TRIGGER)/i)
          assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE)/i)
          if (/INSERT OR IGNORE INTO bootstrap_sovereignty_registry/i.test(sql)) self.bootstrapWrites += 1
        }
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

async function loadWorker() {
  return (await importWorker()).default
}

test('bootstrap sovereignty registry is append-only replay-neutral evidence', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS bootstrap_sovereignty_registry/)
  assert.match(migration, /checkpoint_id TEXT PRIMARY KEY/)
  for (const field of ['manifest_hash', 'lineage_checkpoint_hash', 'deployment_lineage_root', 'bootstrap_trust_root_hash', 'initialization_order_hash', 'startup_dependency_graph_hash', 'startup_topology_hash', 'replay_neutrality_hash']) {
    assert.match(migration, new RegExp(`${field} TEXT NOT NULL`), `${field} must be persisted`)
    assert.match(schema, new RegExp(`${field} TEXT NOT NULL`), `${field} must be in root schema`)
  }
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /CHECK \(replay_neutral='true'\)/)
  assert.match(migration, /CHECK \(mutation_capable='false'\)/)
  assert.match(migration, /CHECK \(remote_authority_denied='true'\)/)
  assert.match(migration, /CHECK \(read_only='true'\)/)
  assert.match(migration, /trg_bootstrap_sovereignty_registry_no_update/)
  assert.match(migration, /trg_bootstrap_sovereignty_registry_no_delete/)
})

test('bootstrap drift taxonomy covers fail-closed initialization fate classes', () => {
  for (const drift of ['bootstrap_order_divergence', 'undeclared_bootstrap_dependency', 'bootstrap_authority_inheritance', 'initialization_surface_expansion', 'startup_topology_instability', 'deployment_root_divergence', 'runtime_bootstrap_corruption', 'recursive_bootstrap_instability', 'bootstrap_replay_instability', 'initialization_lineage_fragmentation']) {
    assert.match(source, new RegExp(`"${drift}"`), `${drift} must be classified`)
  }
  assert.match(source, /classifyBootstrapSovereigntyDrift/)
  assert.match(source, /BOOTSTRAP_INITIALIZATION_ORDER/)
  assert.match(source, /canonicalBootstrapDependencies/)
})

test('bootstrap routes are GET-only observability routes and not executable runtime paths', () => {
  for (const route of ['/runtime/bootstrap/verify', '/runtime/bootstrap/topology', '/runtime/bootstrap/checkpoint']) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/')), `${route} must exist`)
  }
  assert.match(source, /reason: "get_only"[\s\S]*remote_authority_denied: true/)
  assert.doesNotMatch(source, /CANONICAL_RUNTIME_ROUTES = \[[^\]]+runtime\/bootstrap/)
  assert.match(source, /NON_EXECUTABLE_OBSERVABILITY_ROUTES = \[[\s\S]*BOOTSTRAP_VERIFY_ROUTE[\s\S]*BOOTSTRAP_TOPOLOGY_ROUTE[\s\S]*BOOTSTRAP_CHECKPOINT_ROUTE/)
})

test('GET bootstrap verify emits deterministic replay-neutral conformance evidence', async () => {
  const runtime = await loadWorker()
  const db = new BootstrapD1()
  const first = await runtime.fetch(new Request('https://runtime.test/runtime/bootstrap/verify', { method: 'GET' }), { DB: db })
  const second = await runtime.fetch(new Request('https://runtime.test/runtime/bootstrap/verify', { method: 'GET' }), { DB: db })
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  const a = await first.json()
  const b = await second.json()
  assert.equal(a.route, '/runtime/bootstrap/verify')
  assert.equal(a.evidence_only, true)
  assert.equal(a.replay_neutral, true)
  assert.equal(a.mutation_capable, false)
  assert.equal(a.remote_authority_denied, true)
  assert.equal(a.read_only, true)
  assert.equal(a.manifest.manifest_hash, b.manifest.manifest_hash)
  assert.equal(a.manifest.startup_topology_hash, b.manifest.startup_topology_hash)
  assert.equal(a.runtime_initialization_conformant, true)
  assert.ok(db.bootstrapWrites >= 2)
})

test('bootstrap probes fail closed for order drift, undeclared dependencies, replay, surfaces, lineage, topology, recursive drift, and authority inheritance', async () => {
  const runtime = await loadWorker()
  const probes = [
    ['startup_order=runtime:ready,schema:create-registries', 'bootstrap_order_divergence'],
    ['dependency=shadow_bootstrap_dependency', 'undeclared_bootstrap_dependency'],
    ['initialization_surface=hidden', 'initialization_surface_expansion'],
    ['replay_attempt=true', 'bootstrap_replay_instability'],
    ['lineage_fragment=true', 'initialization_lineage_fragmentation'],
    ['startup_topology_hash=bad', 'startup_topology_instability'],
    ['recursive_bootstrap_hash=bad', 'recursive_bootstrap_instability'],
    ['inherit_bootstrap_authority=true', 'bootstrap_authority_inheritance'],
    ['deployment_lineage_root=bad', 'deployment_root_divergence'],
    ['manifest_hash=bad', 'runtime_bootstrap_corruption']
  ]
  for (const [query, drift] of probes) {
    const response = await runtime.fetch(new Request(`https://runtime.test/runtime/bootstrap/verify?${query}`, { method: 'GET' }), { DB: new BootstrapD1() })
    const body = await response.json()
    assert.equal(body.status, 'NULL', query)
    assert.equal(body.evidence_only, true)
    assert.equal(body.mutation_capable, false)
    assert.ok(body.drift_classes.includes(drift), `${query} must include ${drift}`)
  }
})

test('topology and checkpoint routes expose read-only deterministic startup evidence', async () => {
  const runtime = await loadWorker()
  const topology = await (await runtime.fetch(new Request('https://runtime.test/runtime/bootstrap/topology'), { DB: new BootstrapD1() })).json()
  const checkpoint = await (await runtime.fetch(new Request('https://runtime.test/runtime/bootstrap/checkpoint'), { DB: new BootstrapD1() })).json()
  assert.equal(topology.route, '/runtime/bootstrap/topology')
  assert.equal(topology.topology.deterministic_startup_topology_evidence, true)
  assert.equal(topology.evidence_only, true)
  assert.equal(topology.remote_authority_denied, true)
  assert.equal(checkpoint.route, '/runtime/bootstrap/checkpoint')
  assert.equal(checkpoint.checkpoint.checkpoint_type, 'bootstrap_lineage_checkpoint')
  assert.equal(checkpoint.read_only, true)
  assert.equal(checkpoint.replay_neutral, true)
})
