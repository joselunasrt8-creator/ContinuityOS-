import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0032_runtime_surface_containment_registry.sql', import.meta.url), 'utf8')

const containmentRoutes = [
  '/runtime/containment/verify',
  '/runtime/containment/routes',
  '/runtime/containment/deploy',
  '/runtime/containment/drift',
  '/runtime/containment/checkpoint',
]
const containmentObjects = [
  'RuntimeSurfaceContainmentObject',
  'ExecutableSurfaceInventory',
  'HiddenSurfaceProbe',
  'DeploymentSurfaceHash',
  'RouteContainmentCheckpoint',
  'MutationSurfaceClassification',
  'SovereigntyContainmentEnvelope',
]
const driftClasses = [
  'hidden_execution_surface_detected',
  'undeclared_mutation_surface_detected',
  'runtime_route_containment_drift',
  'deployment_surface_hash_drift',
  'workflow_dispatch_escape_detected',
  'adapter_authority_escape_detected',
  'proofless_execution_surface_detected',
  'canonical_route_boundary_drift',
  'observability_route_execution_upgrade',
  'sovereignty_containment_failure',
]

class D1 {
  constructor() { this.statements = [] }
  prepare(sql) {
    this.statements.push(sql)
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() { return Promise.resolve({ meta: { changes: 1 } }) },
    }
  }
}

async function worker() {
  return (await importWorker()).default
}

test('runtime surface containment canonical objects and routes are present', () => {
  for (const objectName of containmentObjects) assert.match(source, new RegExp(`type ${objectName}`), `missing ${objectName}`)
  for (const route of containmentRoutes) assert.match(source, new RegExp(route.replaceAll('/', '\\/')), `missing route ${route}`)
  assert.match(source, /RUNTIME_CONTAINMENT_ROUTES = \[/)
  assert.match(source, /NON_EXECUTABLE_OBSERVABILITY_ROUTES[\s\S]*\.\.\.RUNTIME_CONTAINMENT_ROUTES/)
})

test('canonical runtime routes remain unchanged and containment compares declared handlers', () => {
  assert.match(source, /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/)
  assert.match(source, /DECLARED_RUNTIME_ROUTE_CONSTANTS = Object\.freeze\(\[\.\.\.CANONICAL_RUNTIME_ROUTES, \.\.\.NON_EXECUTABLE_OBSERVABILITY_ROUTES/)
  assert.match(source, /DECLARED_ROUTE_HANDLER_SURFACES = Object\.freeze/)
  assert.match(source, /undeclared_route_handlers/)
  assert.match(source, /canonical_route_boundary_drift/)
})

test('containment drift taxonomy covers hidden and mutation-capable escapes', () => {
  for (const drift of driftClasses) assert.match(source, new RegExp(`"${drift}"`), `missing drift class ${drift}`)
  assert.match(source, /workflow_dispatch_escape_detected/)
  assert.match(source, /deployment_surface_hash_drift/)
  assert.match(source, /adapter_authority_escape_detected/)
  assert.match(source, /proofless_execution_surface_detected/)
  assert.match(source, /observability_route_execution_upgrade/)
})

test('deployment and package surfaces are hashed and governed deploy remains the only deploy-capable path', () => {
  assert.match(source, /GOVERNED_DEPLOY_WORKFLOW_SURFACES = Object\.freeze\(\[/)
  assert.match(source, /\.github\/workflows\/governed-deploy\.yml/)
  assert.match(source, /PACKAGE_COMMAND_SURFACES = Object\.freeze\(\[/)
  assert.match(source, /deploy:disabled-direct-deploy/)
  assert.match(source, /deploymentSurfaceHash/)
  assert.match(source, /workflow_surface_hash = await sha256Hex/)
  assert.match(source, /package_surface_hash = await sha256Hex/)
})

test('runtime surface containment registry is append-only with observability-only guard fields', () => {
  assert.match(source, /runtime_surface_containment_registry: \[/)
  assert.match(source, /CREATE TABLE IF NOT EXISTS runtime_surface_containment_registry/)
  assert.match(source, /INSERT OR IGNORE INTO runtime_surface_containment_registry/)
  assert.match(source, /idx_runtime_surface_containment_registry_routes/)
  assert.match(source, /idx_runtime_surface_containment_registry_deploy/)
  assert.match(source, /idx_runtime_surface_containment_registry_sovereignty/)
  assert.match(source, /trg_runtime_surface_containment_registry_no_update/)
  assert.match(source, /trg_runtime_surface_containment_registry_no_delete/)
  assert.match(migration, /containment_hash TEXT NOT NULL UNIQUE/)
  assert.match(migration, /route_surface_hash TEXT NOT NULL/)
  assert.match(migration, /deployment_surface_hash TEXT NOT NULL/)
  assert.match(migration, /package_surface_hash TEXT NOT NULL/)
  assert.match(migration, /hidden_surface_count INTEGER NOT NULL/)
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /CHECK \(replay_neutral='true'\)/)
  assert.match(migration, /CHECK \(mutation_capable='false'\)/)
  assert.match(migration, /CHECK \(authoritative='false'\)/)
  assert.match(migration, /BEFORE UPDATE ON runtime_surface_containment_registry/)
  assert.match(migration, /BEFORE DELETE ON runtime_surface_containment_registry/)
})

test('GET-only containment routes return immutable observability flags and append checkpoint evidence', async () => {
  const runtime = await worker()
  const db = new D1()
  const res = await runtime.fetch(new Request('https://runtime.test/runtime/containment/checkpoint'), { DB: db })
  const body = await res.json()
  assert.equal(body.evidence_only, true)
  assert.equal(body.replay_neutral, true)
  assert.equal(body.mutation_capable, false)
  assert.equal(body.remote_authority_denied, true)
  assert.equal(body.read_only, true)
  assert.equal(body.creates_authority, false)
  assert.equal(body.execution_started, false)
  assert.equal(body.replay_consumed, false)
  assert.equal(body.authoritative, false)
  assert.ok(body.checkpoint.checkpoint_hash)
  assert.ok(db.statements.some((sql) => sql.includes('INSERT OR IGNORE INTO runtime_surface_containment_registry')))

  const post = await runtime.fetch(new Request('https://runtime.test/runtime/containment/checkpoint', { method: 'POST' }), { DB: db })
  assert.equal(post.status, 405)
  const postBody = await post.json()
  assert.equal(postBody.evidence_only, true)
  assert.equal(postBody.mutation_capable, false)
})

test('containment probes fail closed on hidden routes, deploy escapes, adapter mutation, and observability upgrades', async () => {
  const runtime = await worker()
  const db = new D1()
  const hidden = await (await runtime.fetch(new Request('https://runtime.test/runtime/containment/drift?route=/hidden/exec&mutation_capable=true'), { DB: db })).json()
  assert.equal(hidden.status, 'NULL')
  assert.ok(hidden.drift_classes.includes('hidden_execution_surface_detected'))
  assert.ok(hidden.drift_classes.includes('undeclared_mutation_surface_detected'))

  const deploy = await (await runtime.fetch(new Request('https://runtime.test/runtime/containment/drift?workflow=.github/workflows/escape.yml&deploy_capable=true'), { DB: db })).json()
  assert.ok(deploy.drift_classes.includes('workflow_dispatch_escape_detected'))
  assert.ok(deploy.drift_classes.includes('proofless_execution_surface_detected'))

  const pkg = await (await runtime.fetch(new Request('https://runtime.test/runtime/containment/drift?package_command=wrangler%20deploy&deploy_capable=true'), { DB: db })).json()
  assert.ok(pkg.drift_classes.includes('deployment_surface_hash_drift'))

  const adapter = await (await runtime.fetch(new Request('https://runtime.test/runtime/containment/drift?adapter=webhook-writer&mutation_capable=true'), { DB: db })).json()
  assert.ok(adapter.drift_classes.includes('adapter_authority_escape_detected'))

  const upgrade = await (await runtime.fetch(new Request('https://runtime.test/runtime/containment/drift?route=/runtime/containment/verify&method=POST&mutation_capable=true'), { DB: db })).json()
  assert.ok(upgrade.drift_classes.includes('observability_route_execution_upgrade'))
  assert.ok(upgrade.drift_classes.includes('runtime_route_containment_drift'))
})

test('containment checkpoint hash is deterministic for equivalent generated evidence', () => {
  assert.match(source, /checkpoint_hash: await sha256Hex\(canonicalize\(\{ containment_hash, route_surface_hash, deployment_surface_hash, drift_classes, hidden_surface_count \}\)\)/)
  const containmentStart = source.indexOf('containment_hash,')
  const checkpointBlock = source.slice(source.indexOf('checkpoint_hash: await sha256Hex', containmentStart), source.indexOf('return Object.freeze({', containmentStart))
  assert.doesNotMatch(checkpointBlock, /generated_at/)
})
