import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { canonicalize, sha256Hex } from '../../src/canonical.js'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const inventory = JSON.parse(readFileSync(new URL('../../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url), 'utf8'))
const audit = JSON.parse(readFileSync(new URL('../../runtime/unauthorized_mutation_path_closure_audit.json', import.meta.url), 'utf8'))
const bypass = JSON.parse(readFileSync(new URL('../../runtime/bypass_paths.json', import.meta.url), 'utf8'))
const executionSurfaces = JSON.parse(readFileSync(new URL('../../runtime/execution_surfaces.json', import.meta.url), 'utf8'))
const rootAuthority = JSON.parse(readFileSync(new URL('../../runtime/sovereignty/root_authority_inventory.json', import.meta.url), 'utf8'))

const hash = (value) => sha256Hex(typeof value === 'string' ? value : canonicalize(value))
const byId = new Map(inventory.surfaces.map((surface) => [surface.surface_id, surface]))
const requiredFields = ['surface_id','surface_type','source_file','entrypoint','mutation_capability','execution_capability','deployment_capability','authority_required','aeo_required','validation_required','proof_required','replay_semantics','drift_observable','proof_bound','governance_addressable','canonical_boundary_status','bypass_risk','containment_status','evidence_only','non_authoritative']
const driftTaxonomy = ['UNDECLARED_MUTATION_SURFACE','UNCLASSIFIED_EXECUTION_SURFACE','UNBOUND_DATABASE_WRITE','UNBOUND_DEPLOYMENT_SURFACE','OBSERVABILITY_MUTATION_ESCALATION','GOVERNANCE_MUTATION_WITHOUT_SCO','AGENT_TOOL_MUTATION_UNCLASSIFIED','EXTERNAL_API_MUTATION_UNCLASSIFIED','RECONCILIATION_MUTATION_ESCAPE','PROOFLESS_MUTATION_PATH','AUTHORITYLESS_MUTATION_PATH','CLOSURE_INCOMPLETE']
const canonicalRoutes = ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof']
const executableRoutes = canonicalRoutes.filter((route) => route !== '/session')

function classifyCandidateSurface(surface) {
  const declared = byId.has(surface.surface_id)
  const drift = []
  if (!declared && surface.mutation_capability) drift.push('UNDECLARED_MUTATION_SURFACE')
  if (!declared && surface.execution_capability) drift.push('UNCLASSIFIED_EXECUTION_SURFACE')
  if (surface.surface_type === 'database_write_surface' && (!declared || !surface.proof_bound)) drift.push('UNBOUND_DATABASE_WRITE')
  if (surface.deployment_capability && (!declared || !surface.proof_bound)) drift.push('UNBOUND_DEPLOYMENT_SURFACE')
  if (surface.surface_type === 'observability_route' && surface.mutation_capability) drift.push('OBSERVABILITY_MUTATION_ESCALATION')
  if (drift.length > 0) drift.push('CLOSURE_INCOMPLETE')
  return { status: drift.length > 0 ? 'NULL' : 'CLASSIFIED', drift_classes: [...new Set(drift)].sort() }
}

test('closure inventory is machine-readable and every surface carries required classification fields', () => {
  assert.equal(inventory.artifact, 'UNAUTHORIZED_MUTATION_SURFACE_INVENTORY')
  assert.deepEqual(inventory.fail_closed_response, { drift_class: 'UNDECLARED_MUTATION_SURFACE', status: 'NULL' })
  assert.deepEqual(inventory.drift_taxonomy, driftTaxonomy)
  assert.ok(inventory.surfaces.length > 0)
  for (const surface of inventory.surfaces) {
    for (const field of requiredFields) assert.ok(Object.hasOwn(surface, field), `${surface.surface_id} missing ${field}`)
    assert.equal(surface.non_authoritative, true, `${surface.surface_id} must not grant authority`)
  }
})

test('every executable and mutation-capable runtime route is inventoried and canonical routes are unchanged', () => {
  assert.match(source, /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/)
  assert.doesNotMatch(source, /url\.pathname === "\/proof\/propagate" && request\.method === "POST"/)
  for (const route of canonicalRoutes) {
    const surface = byId.get(`route:${route}`)
    assert.ok(surface, `${route} missing from closure inventory`)
    assert.equal(surface.mutation_capability, true)
    assert.equal(surface.validation_required, !['/session', '/continuity', '/authority', '/compile'].includes(route))
  }
  for (const route of executableRoutes) assert.ok(byId.get(`route:${route}`), `${route} executable route is undeclared`)
})

test('proof propagation outbox write is classified as evidence-only and non-authoritative', () => {
  const outbox = byId.get('db_write:proof_propagation_outbox')
  assert.ok(outbox, 'proof_propagation_outbox DB write missing from closure inventory')
  assert.equal(outbox.surface_type, 'database_write_surface')
  assert.equal(outbox.mutation_capability, true)
  assert.equal(outbox.execution_capability, false)
  assert.equal(outbox.deployment_capability, false)
  assert.equal(outbox.authority_required, 'append_only_proof_outbox')
  assert.equal(outbox.proof_required, true)
  assert.equal(outbox.proof_bound, true)
  assert.equal(outbox.replay_semantics, 'replay_neutral_proof_publication_marker')
  assert.equal(outbox.canonical_boundary_status, 'PROOF_EVIDENCE_OUTBOX')
  assert.equal(outbox.containment_status, 'EVIDENCE_ONLY_PROOF_LINEAGE_BOUND')
  assert.equal(outbox.evidence_only, true)
  assert.equal(outbox.non_authoritative, true)
})

test('every DB write surface in src/index.ts is classified', () => {
  const dbWriteTables = new Set([...source.matchAll(/(?:INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM)\s+(\w+)/g)].map((match) => match[1]).filter((table) => table !== 'ON'))
  assert.ok(dbWriteTables.size > 0)
  for (const table of dbWriteTables) {
    const surface = byId.get(`db_write:${table}`)
    assert.ok(surface, `${table} DB write missing from closure inventory`)
    assert.equal(surface.surface_type, 'database_write_surface')
    assert.equal(surface.mutation_capability, true)
  }
})

test('every workflow and package deploy surface is classified and reconciled against canonical inventories', () => {
  for (const file of readdirSync(new URL('../../.github/workflows/', import.meta.url)).filter((name) => name.endsWith('.yml'))) {
    assert.ok(byId.has(`workflow:${file}`), `${file} workflow missing from inventory`)
  }
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  for (const script of Object.keys(packageJson.scripts)) assert.ok(byId.has(`package_script:${script}`), `${script} package script missing from inventory`)
  assert.equal(executionSurfaces.closure_verification.unclassified_mutation_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  assert.equal(bypass.closure_verification.missing_mutation_surface_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
})

test('observability, reconciliation, and root-authority evidence remain non-executable and non-authoritative', () => {
  for (const surface of inventory.surfaces.filter((entry) => entry.surface_type === 'observability_route')) {
    assert.equal(surface.execution_capability, false, surface.surface_id)
    assert.equal(surface.deployment_capability, false, surface.surface_id)
    assert.equal(surface.evidence_only, true, surface.surface_id)
    assert.equal(surface.non_authoritative, true, surface.surface_id)
  }
  for (const id of ['route:/reconcile/closure', 'route:/reconcile/containment', 'route:/sovereignty/root-authority']) {
    const surface = byId.get(id)
    assert.ok(surface, `${id} missing`)
    assert.equal(surface.execution_capability, false)
    assert.equal(surface.evidence_only, true)
  }
  assert.equal(rootAuthority.unauthorized_mutation_path_closure.classification_authorizes_execution, false)
  assert.equal(rootAuthority.unauthorized_mutation_path_closure.classification_authorizes_merge, false)
})

test('undeclared mutation surfaces fail closed and fake mutation routes produce CLOSURE_INCOMPLETE / NULL', () => {
  const fake = classifyCandidateSurface({ surface_id: 'route:/fake/mutate', surface_type: 'runtime_executable_route', mutation_capability: true, execution_capability: true, deployment_capability: false, proof_bound: false })
  assert.equal(fake.status, 'NULL')
  assert.ok(fake.drift_classes.includes('UNDECLARED_MUTATION_SURFACE'))
  assert.ok(fake.drift_classes.includes('UNCLASSIFIED_EXECUTION_SURFACE'))
  assert.ok(fake.drift_classes.includes('CLOSURE_INCOMPLETE'))
})

test('closure audit hash is deterministic and evidence-only', () => {
  assert.equal(audit.audit_id, 'issue-342-unauthorized-mutation-path-closure-v1')
  assert.equal(audit.inventory_hash, hash(inventory))
  assert.equal(audit.bypass_hash, hash(bypass))
  assert.equal(audit.route_hash, hash(inventory.surfaces.filter((surface) => surface.surface_type.includes('route'))))
  assert.equal(audit.workflow_hash, hash(inventory.surfaces.filter((surface) => surface.surface_type === 'github_workflow' || surface.surface_type === 'package_script')))
  assert.equal(audit.registry_hash, hash(inventory.surfaces.filter((surface) => surface.surface_type === 'database_write_surface')))
  assert.deepEqual(audit.unresolved_surfaces, [])
  assert.equal(audit.evidence_only, true)
  assert.equal(audit.non_authoritative, true)
  assert.equal(audit.replay_neutral, true)
})
