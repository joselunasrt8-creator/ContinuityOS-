import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0024_runtime_sovereignty_registry.sql', import.meta.url), 'utf8')

class D1 {
  constructor() { this.statements = [] }
  prepare(sql) {
    this.statements.push(sql)
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() { return Promise.resolve({ meta: { changes: 1 } }) }
    }
  }
}

async function worker() {
  return (await importWorker()).default
}

test('Runtime Sovereignty Manifest contains deterministic identity fields and excludes generated_at from sovereignty hash', () => {
  for (const field of ['runtime_id', 'runtime_version', 'canonical_routes', 'observability_routes', 'governance_routes', 'validator_surface_hash', 'schema_hash', 'migration_chain_hash', 'replay_topology_hash', 'proof_topology_hash', 'governance_registry_hash', 'runtime_surface_hash', 'sovereignty_hash', 'generated_at']) {
    assert.match(source, new RegExp(field), `manifest must include ${field}`)
  }
  assert.match(source, /runtimeSovereigntyIdentityMaterial\(manifest: Omit<RuntimeSovereigntyManifest, "sovereignty_hash" \| "generated_at">\)/)
  assert.match(source, /const sovereignty_hash = await sha256Hex\(canonicalize\(runtimeSovereigntyIdentityMaterial\(identity\)\)\)/)
})

test('runtime sovereignty registry is append-only in schema and migration', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS runtime_sovereignty_registry[\s\S]*sovereignty_id TEXT PRIMARY KEY[\s\S]*migration_chain_hash TEXT NOT NULL[\s\S]*generated_at TEXT NOT NULL/)
  assert.match(source, /trg_runtime_sovereignty_registry_no_update[\s\S]*runtime_sovereignty_registry is append-only/)
  assert.match(source, /trg_runtime_sovereignty_registry_no_delete[\s\S]*runtime_sovereignty_registry is append-only/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_sovereignty_registry/)
  assert.match(migration, /BEFORE UPDATE ON runtime_sovereignty_registry/)
  assert.match(migration, /BEFORE DELETE ON runtime_sovereignty_registry/)
})

test('startup order freezes sovereignty before append-only activation and readiness', () => {
  const order = [
    'BOOTSTRAP_SCHEMA_INITIALIZED',
    'BOOTSTRAP_MIGRATIONS_VALIDATED',
    'BOOTSTRAP_REGISTRY_STABILIZED',
    'BOOTSTRAP_RECURSIVE_GOVERNANCE_VERIFIED',
    'BOOTSTRAP_RUNTIME_SOVEREIGNTY_FROZEN',
    'BOOTSTRAP_SOVEREIGNTY_CHECKPOINT_GENERATED',
    'BOOTSTRAP_APPEND_ONLY_TRIGGERS_ACTIVATED',
    'BOOTSTRAP_RUNTIME_READY'
  ].map((marker) => source.indexOf(marker))
  assert.ok(order.every((index) => index !== -1), 'all bootstrap markers must exist')
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'bootstrap markers must be emitted in canonical order')
})

test('drift coverage classifies topology, validator, schema, replay, proof, observability, hidden surface, and authority expansion drift', () => {
  for (const drift of ['route_mutation', 'validator_mutation', 'schema_mutation', 'replay_topology_mutation', 'governance_topology_mutation', 'proof_topology_mutation', 'hidden_executable_surface_introduction', 'observability_route_mutation', 'authority_inheritance_expansion', 'runtime_surface_instability']) {
    assert.match(source, new RegExp(`"${drift}"`), `${drift} must be classified`)
  }
  assert.match(source, /RUNTIME_SOVEREIGNTY_VIOLATION/)
})

test('GET /runtime/sovereignty is read-only, replay-neutral, non-authoritative, and deterministic across restarts except generated_at', async () => {
  const runtime = await worker()
  const oneDb = new D1()
  const twoDb = new D1()
  const one = await (await runtime.fetch(new Request('https://runtime.test/runtime/sovereignty'), { DB: oneDb })).json()
  const two = await (await runtime.fetch(new Request('https://runtime.test/runtime/sovereignty'), { DB: twoDb })).json()

  assert.equal(one.status, 'RUNTIME_SOVEREIGNTY_CANONICAL')
  assert.equal(one.evidence_only, true)
  assert.equal(one.read_only, true)
  assert.equal(one.mutation_capable, false)
  assert.equal(one.replay_neutral, true)
  assert.equal(one.authoritative, false)
  assert.equal(one.creates_authority, false)
  assert.equal(one.bypass_governance, false)
  assert.equal(one.manifest.sovereignty_hash, two.manifest.sovereignty_hash)
  assert.equal(one.manifest.runtime_surface_hash, two.manifest.runtime_surface_hash)
  assert.notEqual(one.manifest.generated_at.length, 0)
  assert.ok(oneDb.statements.some((sql) => sql.includes('INSERT OR IGNORE INTO runtime_sovereignty_registry')))
})
