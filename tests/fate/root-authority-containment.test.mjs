import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ROOT_AUTHORITY_CLASSIFICATIONS,
  ROOT_AUTHORITY_EVIDENCE_FLAGS,
  buildRootAuthorityContainmentEnvelope,
  canonicalizeRootAuthorityInventory,
  classifyRootAuthoritySurface,
  computeAuthorityContainmentBoundary,
  detectRootAuthorityDrift,
  hashRootAuthorityTopology,
  classifyProductionMutationCapability,
  deriveRevocationPropagation,
} from '../../runtime/sovereignty/root-authority-containment.js'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0036_root_authority_observability_registry.sql', import.meta.url), 'utf8')
const governance = JSON.parse(readFileSync(new URL('../../governance/runtime/MERGE_GOVERNANCE_RULES.json', import.meta.url), 'utf8'))
const inventoryArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_inventory.json', import.meta.url), 'utf8'))
const boundaryArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_boundaries.json', import.meta.url), 'utf8'))
const mapArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/infrastructure_authority_map.json', import.meta.url), 'utf8'))
const assumptionArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/sovereignty_assumption_registry.json', import.meta.url), 'utf8'))
const taxonomyArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_drift_taxonomy.json', import.meta.url), 'utf8'))
const rulesArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_containment_rules.json', import.meta.url), 'utf8'))
const sovereigntyGaps = JSON.parse(readFileSync(new URL('../../runtime/sovereignty_gaps.json', import.meta.url), 'utf8'))
const rootBypassArtifact = JSON.parse(readFileSync(new URL('../../BYPASS_PATHS.json', import.meta.url), 'utf8'))
const runtimeBypassArtifact = JSON.parse(readFileSync(new URL('../../runtime/bypass_paths.json', import.meta.url), 'utf8'))

const authorityGraphArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/infrastructure_authority_graph.json', import.meta.url), 'utf8'))
const breakGlassArtifact = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/break_glass_containment_semantics.json', import.meta.url), 'utf8'))

class D1 {
  constructor() {
    this.statements = []
    this.rootAuthorityRows = []
    this.rootAuthorityAppendOnly = { update: false, delete: false }
  }

  prepare(sql) {
    this.statements.push(sql)
    const db = this
    const statement = {
      bindings: [],
      bind(...args) { this.bindings = args; return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        if (/trg_root_authority_observability_registry_no_update/.test(sql)) db.rootAuthorityAppendOnly.update = true
        if (/trg_root_authority_observability_registry_no_delete/.test(sql)) db.rootAuthorityAppendOnly.delete = true
        if (/^UPDATE root_authority_observability_registry/i.test(sql) && db.rootAuthorityAppendOnly.update) return Promise.reject(new Error('root_authority_observability_registry is append-only'))
        if (/^DELETE FROM root_authority_observability_registry/i.test(sql) && db.rootAuthorityAppendOnly.delete) return Promise.reject(new Error('root_authority_observability_registry is append-only'))
        if (/^INSERT INTO root_authority_observability_registry/i.test(sql)) {
          const [observation_id, observation_hash, topology_hash, boundary_hash, drift_hash, containment_identity] = this.bindings
          db.rootAuthorityRows.push({ observation_id, observation_hash, topology_hash, boundary_hash, drift_hash, containment_identity })
        }
        return Promise.resolve({ meta: { changes: 1 } })
      },
    }
    return statement
  }
}

async function worker() {
  return (await importWorker()).default
}

test('deterministic topology hashing and containment identity are canonical-order independent', () => {
  const first = canonicalizeRootAuthorityInventory({ surfaces: [{ surface_id: 'a', authority_origin: 'github', declared_boundary: 'declared', classifications: ['ROOT_WORKFLOW_AUTHORITY'] }, { surface_id: 'b', authority_origin: 'cloudflare', declared_boundary: 'declared', classifications: ['ROOT_DEPLOY_AUTHORITY'] }] })
  const second = canonicalizeRootAuthorityInventory({ surfaces: [...first.surfaces].reverse() })
  assert.equal(hashRootAuthorityTopology(first), hashRootAuthorityTopology(second))
  assert.equal(buildRootAuthorityContainmentEnvelope(first).containment_identity, buildRootAuthorityContainmentEnvelope(second).containment_identity)
})

test('append-only registry immutability has deterministic indexes and non-authoritative guards', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS root_authority_observability_registry/)
  for (const indexName of ['topology', 'boundary', 'drift']) assert.match(migration, new RegExp(`idx_root_authority_observability_registry_${indexName}`))
  assert.match(migration, /trg_root_authority_observability_registry_no_update/)
  assert.match(migration, /trg_root_authority_observability_registry_no_delete/)
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /CHECK \(append_only='true'\)/)
  assert.match(migration, /CHECK \(non_authoritative='true'\)/)
  assert.match(migration, /CHECK \(executable='false'\)/)
  assert.match(migration, /CHECK \(deployment_capable='false'\)/)
  assert.match(migration, /CHECK \(creates_authority='false'\)/)
  assert.match(migration, /CHECK \(secret_material_persisted='false'\)/)
})

test('undeclared authority detection fails closed to merge legitimacy NULL', () => {
  const envelope = buildRootAuthorityContainmentEnvelope({ surfaces: [{ surface_id: 'shadow_admin', authority_origin: 'github_admin', declared_boundary: 'undeclared', classifications: ['UNDECLARED_ROOT_SURFACE'], declared: false }] })
  assert.ok(envelope.drift.drift_classes.includes('UNDECLARED_ROOT_SURFACE'))
  assert.ok(envelope.drift.drift_classes.includes('SOVEREIGNTY_DRIFT_DETECTED'))
  assert.ok(envelope.drift.drift_classes.includes('ROOT_AUTHORITY_BOUNDARY_OVERFLOW'))
  assert.equal(envelope.drift.merge_legitimacy, 'NULL')
  assert.equal(envelope.boundary.preo_validity, 'NULL')
})

test('replay-neutral observability and non-authoritative evidence guarantees hold', () => {
  const envelope = buildRootAuthorityContainmentEnvelope()
  for (const [key, value] of Object.entries(ROOT_AUTHORITY_EVIDENCE_FLAGS)) assert.equal(envelope[key], value)
  assert.equal(envelope.boundary.classification_authorizes, false)
  assert.equal(envelope.boundary.evidence_authorizes_merge, false)
  assert.equal(envelope.drift.replay_neutral, true)
  assert.equal(envelope.drift.non_authoritative, true)
})

test('GET-only sovereignty routes are non-executable and do not expand route execution', async () => {
  for (const route of ['/sovereignty/root-authority', '/sovereignty/root-authority/drift', '/sovereignty/root-authority/boundary', '/sovereignty/root-authority/topology']) assert.ok(source.includes(route), `missing ${route}`)
  assert.match(source, /ROOT_AUTHORITY_OBSERVABILITY_ROUTES\.includes\(url\.pathname as any\) && request\.method !== "GET"/)
  assert.match(source, /ROOT_AUTHORITY_OBSERVABILITY_ROUTES\.includes\(url\.pathname as any\) && request\.method === "GET"/)
  assert.doesNotMatch(source, /url\.pathname === ROOT_AUTHORITY_ROUTE && request\.method === "POST"/)
  const runtime = await worker()
  const db = new D1()
  const res = await runtime.fetch(new Request('https://runtime.test/sovereignty/root-authority'), { DB: db })
  const body = await res.json()
  assert.equal(body.executable, false)
  assert.equal(body.deployment_capable, false)
  assert.equal(body.creates_authority, false)
  assert.equal(body.secret_values_inspected, false)
  assert.ok(db.statements.some((sql) => /^INSERT INTO root_authority_observability_registry/.test(sql)))
  assert.ok(!db.statements.some((sql) => sql.includes('INSERT OR IGNORE INTO root_authority_observability_registry')))
  const post = await runtime.fetch(new Request('https://runtime.test/sovereignty/root-authority', { method: 'POST' }), { DB: db })
  assert.equal(post.status, 405)
})

test('runtime-created root authority registry is append-only for updates and deletes', async () => {
  const runtime = await worker()
  const db = new D1()
  const res = await runtime.fetch(new Request('https://runtime.test/sovereignty/root-authority'), { DB: db })
  assert.equal(res.status, 200)
  assert.equal(db.rootAuthorityAppendOnly.update, false)
  assert.equal(db.rootAuthorityAppendOnly.delete, false)
  assert.ok(!db.statements.some((sql) => sql.includes('CREATE TRIGGER IF NOT EXISTS trg_root_authority_observability_registry_no_update')))
  assert.ok(!db.statements.some((sql) => sql.includes('CREATE TRIGGER IF NOT EXISTS trg_root_authority_observability_registry_no_delete')))
  assert.equal(db.rootAuthorityRows.length, 1)
})

test('same-topology root authority GET observations append distinct records with stable containment identity', async () => {
  const runtime = await worker()
  const db = new D1()
  await runtime.fetch(new Request('https://runtime.test/sovereignty/root-authority'), { DB: db })
  await runtime.fetch(new Request('https://runtime.test/sovereignty/root-authority'), { DB: db })
  assert.equal(db.rootAuthorityRows.length, 2)
  assert.equal(db.rootAuthorityRows[0].containment_identity, db.rootAuthorityRows[1].containment_identity)
  assert.equal(db.rootAuthorityRows[0].topology_hash, db.rootAuthorityRows[1].topology_hash)
  assert.equal(db.rootAuthorityRows[0].boundary_hash, db.rootAuthorityRows[1].boundary_hash)
  assert.equal(db.rootAuthorityRows[0].drift_hash, db.rootAuthorityRows[1].drift_hash)
  assert.notEqual(db.rootAuthorityRows[0].observation_id, db.rootAuthorityRows[1].observation_id)
  assert.notEqual(db.rootAuthorityRows[0].observation_hash, db.rootAuthorityRows[1].observation_hash)
})

test('deterministic boundary equivalence and authority topology drift detection', () => {
  const inventory = canonicalizeRootAuthorityInventory({ surfaces: [{ surface_id: 'workflow', authority_origin: 'github_actions', declared_boundary: 'declared', classifications: ['ROOT_WORKFLOW_AUTHORITY'] }] })
  const boundaryA = computeAuthorityContainmentBoundary(inventory)
  const boundaryB = computeAuthorityContainmentBoundary(canonicalizeRootAuthorityInventory({ surfaces: [...inventory.surfaces].reverse() }))
  assert.equal(boundaryA.boundary_hash, boundaryB.boundary_hash)
  const drift = detectRootAuthorityDrift(canonicalizeRootAuthorityInventory({ surfaces: [{ surface_id: 'ambiguous', authority_origin: 'unknown', declared_boundary: 'declared', classifications: [] }] }))
  assert.ok(drift.drift_classes.includes('ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE'))
})

test('unsafe observed root authority flags are preserved for fail-closed drift', () => {
  const envelope = buildRootAuthorityContainmentEnvelope({ surfaces: [{
    surface_id: 'unsafe_observed_surface',
    authority_origin: 'github_actions',
    declared_boundary: 'declared',
    classifications: ['ROOT_WORKFLOW_AUTHORITY'],
    executable: true,
    deployment_capable: true,
    creates_authority: true,
    secret_values_inspected: true,
    secret_material_persisted: true,
    secret_material: 'OBSERVED_SECRET_VALUE',
  }] })
  const [surface] = envelope.inventory.surfaces
  assert.equal(surface.observed_executable, true)
  assert.equal(surface.observed_deployment_capable, true)
  assert.equal(surface.observed_creates_authority, true)
  assert.equal(surface.observed_secret_values_inspected, true)
  assert.equal(surface.observed_secret_material_persisted, true)
  assert.equal(surface.observed_secret_material, 'OBSERVED_SECRET_VALUE')
  assert.equal(surface.executable, false)
  assert.equal(surface.deployment_capable, false)
  assert.equal(surface.creates_authority, false)
  assert.equal(surface.secret_material, 'NOT_INSPECTED')
  assert.ok(envelope.drift.drift_classes.includes('ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE'))
  assert.ok(envelope.drift.drift_classes.includes('SOVEREIGNTY_DRIFT_DETECTED'))
  assert.equal(envelope.drift.fail_closed, true)
  assert.equal(envelope.drift.merge_legitimacy, 'NULL')
})

test('no secret material persistence and no deployment capability introduction', () => {
  const envelope = buildRootAuthorityContainmentEnvelope()
  assert.equal(envelope.secret_values_inspected, false)
  assert.equal(envelope.secret_material_persisted, false)
  for (const surface of envelope.inventory.surfaces) {
    assert.equal(surface.secret_material, 'NOT_INSPECTED')
    assert.equal(surface.executable, false)
    assert.equal(surface.deployment_capable, false)
    assert.equal(surface.creates_authority, false)
  }
  assert.equal(envelope.inventory.surfaces.every((surface) => surface.deployment_capable === false), true)
  assert.match(source, /rootAuthorityFlags\(\)/)
})

test('workflow, package script, and local deploy authority classification is deterministic', () => {
  assert.ok(classifyRootAuthoritySurface({ surface_id: 'github_actions_workflow_dispatch' }).includes('ROOT_WORKFLOW_AUTHORITY'))
  assert.ok(classifyRootAuthoritySurface({ surface_id: 'package_script_deploy_guard' }).includes('ROOT_PACKAGE_EXECUTION_AUTHORITY'))
  assert.ok(classifyRootAuthoritySurface({ surface_id: 'local_deploy_credentials_presence' }).includes('ROOT_LOCAL_EXECUTION_AUTHORITY'))
})

test('sovereignty assumption continuity and required artifacts are present', () => {
  assert.equal(inventoryArtifact.secret_values_inspected, false)
  assert.equal(boundaryArtifact.classification_is_authorization, false)
  assert.ok(mapArtifact.map.some((entry) => entry.classification === 'ROOT_WORKFLOW_AUTHORITY'))
  assert.ok(assumptionArtifact.assumptions.some((entry) => entry.assumption_id === 'undeclared_surface_null'))
  for (const classification of ROOT_AUTHORITY_CLASSIFICATIONS) assert.ok(taxonomyArtifact.classifications.includes(classification))
  assert.ok(rulesArtifact.rules.includes('observability != sovereignty'))
})

test('merge governance root authority rules invalidate legitimacy but never authorize merge', () => {
  for (const rule of [
    'Undeclared root authority -> merge legitimacy NULL',
    'Sovereignty drift -> PREO invalid',
    'Infrastructure mutation ambiguity -> containment required',
    'Root authority topology divergence -> governance trust isolated',
    'Root authority containment evidence may invalidate legitimacy but may NEVER authorize merge',
  ]) assert.ok(governance.rules.includes(rule))
  assert.equal(governance.root_authority_containment.may_authorize_merge, false)
  assert.equal(governance.root_authority_containment.secret_values_inspected, false)
})

test('expanded root authority closure preserves containment semantics without secret inspection', () => {
  const envelope = buildRootAuthorityContainmentEnvelope()
  const byId = new Map(envelope.inventory.surfaces.map((surface) => [surface.surface_id, surface]))
  for (const surfaceId of [
    'cloudflare_deployment_token_authority',
    'wrangler_local_deploy_authority',
    'github_actions_token_authority',
    'github_workflow_file_mutation',
    'repository_secret_mutation_authority',
    'root_runtime_authority_assumption',
  ]) assert.ok(byId.has(surfaceId), `missing expanded root authority surface ${surfaceId}`)

  assert.ok(byId.get('cloudflare_deployment_token_authority').classifications.includes('ROOT_DEPLOY_AUTHORITY'))
  assert.equal(byId.get('cloudflare_deployment_token_authority').deployment_token_observability, 'OBSERVABILITY_ONLY_NO_SECRET_INSPECTION')
  assert.equal(byId.get('cloudflare_deployment_token_authority').observed_secret_material, 'NOT_INSPECTED')
  assert.equal(byId.get('github_actions_workflow_dispatch').workflow_dispatch_semantics, 'TRIGGER_ONLY')
  assert.ok(byId.get('repository_secret_mutation_authority').classifications.includes('ROOT_ENVIRONMENT_AUTHORITY'))
  assert.ok(byId.get('wrangler_local_deploy_authority').classifications.includes('ROOT_AUTHORITY_BYPASS_RISK'))
  assert.ok(byId.get('root_runtime_authority_assumption').classifications.includes('ROOT_FEDERATION_AUTHORITY'))
  assert.equal(envelope.containment_status, 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED')
  assert.ok(envelope.declared_root_surfaces.includes('cloudflare_deployment_token_authority'))
  assert.deepEqual(envelope.undeclared_root_surfaces, [])
  assert.ok(envelope.drift_classes.includes('ROOT_AUTHORITY_BYPASS_RISK'))
  assert.equal(envelope.secret_values_inspected, false)
  assert.equal(envelope.secret_material_persisted, false)
})


test('root authority escape hatches are evidence-only bypass paths and sovereignty gaps', () => {
  const inventoryById = new Map(inventoryArtifact.surfaces.map((surface) => [surface.surface_id, surface]))
  assert.equal(inventoryById.get('github_admin_authority').declared_boundary, 'external-root-github-admin-and-branch-policy-containment-required')
  assert.equal(inventoryById.get('cloudflare_account_authority').declared_boundary, 'external-root-cloudflare-account-containment-required')
  assert.equal(inventoryById.get('github_actions_workflow_dispatch').declared_boundary, 'trigger-only-no-secret-inspection')
  assert.equal(inventoryById.get('github_actions_workflow_dispatch').workflow_dispatch_semantics, 'TRIGGER_ONLY')
  for (const surface of inventoryArtifact.surfaces) {
    assert.equal(surface.secret_material, 'NOT_INSPECTED')
    assert.equal(surface.executable, false)
    assert.equal(surface.creates_authority, false)
    if (surface.surface_id === 'wrangler_local_deploy_authority') {
      assert.equal(surface.deployment_capable, true)
      continue
    }
    assert.equal(surface.deployment_capable, false)
  }

  for (const assumptionId of [
    'root_admin_branch_policy_external_dependency',
    'repository_environment_secrets_external_dependency',
    'workflow_dispatch_full_lifecycle_required',
  ]) assert.ok(assumptionArtifact.assumptions.some((entry) => entry.assumption_id === assumptionId), `missing ${assumptionId}`)

  const rootBypassIds = new Set(rootBypassArtifact.bypass_paths.map((entry) => entry.bypass_id))
  const runtimeBypassIds = new Set(runtimeBypassArtifact.bypass_paths.map((entry) => entry.bypass_id))
  for (const bypassId of [
    'github_admin_branch_protection_root_override',
    'github_repository_environment_secret_root_override',
    'cloudflare_account_or_token_direct_deploy',
    'local_authenticated_wrangler_direct_deploy',
  ]) {
    assert.ok(rootBypassIds.has(bypassId), `root bypass artifact missing ${bypassId}`)
    assert.ok(runtimeBypassIds.has(bypassId), `runtime bypass artifact missing ${bypassId}`)
  }

  const gapIds = new Set(sovereigntyGaps.gaps.map((entry) => entry.surface_id))
  for (const gapId of [
    'github_admin_branch_protection_mutation',
    'github_repository_environment_secret_mutation',
    'cloudflare_account_or_token_direct_deploy',
    'local_wrangler_authenticated_deploy',
  ]) assert.ok(gapIds.has(gapId), `sovereignty gap missing ${gapId}`)
})


test('governed and non-governed authority graph and break-glass semantics are explicit and non-authoritative', () => {
  assert.ok(authorityGraphArtifact.governed_nodes.includes('github_actions_workflow_dispatch'))
  assert.ok(authorityGraphArtifact.non_governed_nodes.includes('wrangler_local_deploy_authority'))
  assert.equal(authorityGraphArtifact.classification_authorizes_execution, false)
  assert.equal(breakGlassArtifact.mode, 'EMERGENCY_BREAK_GLASS_CONTAINED')
  assert.equal(breakGlassArtifact.containment_result_when_unresolved, 'NULL')
  assert.equal(breakGlassArtifact.executable, false)
})

test('production mutation and revocation propagation classification are deterministic and fail-closed', () => {
  assert.equal(classifyProductionMutationCapability({ surface_id: 'wrangler_local_deploy_authority' }), 'BYPASS_CAPABLE_NON_GOVERNED')
  assert.equal(classifyProductionMutationCapability({ surface_id: 'github_actions_workflow_dispatch', declared_boundary: 'trigger-only-no-secret-inspection' }), 'GOVERNED_TRIGGER_ONLY')
  const inv = canonicalizeRootAuthorityInventory({ surfaces: [{ surface_id: 'repository_secret_mutation_authority', authority_origin: 'github_repository_secrets', declared_boundary: 'observability-only-no-secret-inspection' }] })
  const revocation = deriveRevocationPropagation(inv)
  assert.equal(revocation.fail_closed_on_missing_revocation, true)
  assert.equal(revocation.propagation[0].blocked_when_revoked, true)
  assert.deepEqual(revocation.propagation[0].propagation_scope, ['session', 'continuity', 'authority', 'compile', 'validate', 'execute', 'proof'])
})
