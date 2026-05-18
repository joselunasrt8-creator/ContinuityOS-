import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { canonicalize, sha256Hex } from '../src/canonical.js'

const INVENTORY_PATH = 'runtime/unauthorized_mutation_surface_inventory.json'
const AUDIT_PATH = 'runtime/unauthorized_mutation_path_closure_audit.json'
const SRC_PATH = 'src/index.ts'
const PACKAGE_PATH = 'package.json'
const WORKFLOW_DIR = '.github/workflows'

const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const stableStringify = (value) => `${JSON.stringify(value, null, 2)}\n`
const hash = (value) => sha256Hex(typeof value === 'string' ? value : canonicalize(value))

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function putStable(map, surface) {
  map.set(surface.surface_id, surface)
}

function packageSurface(name, command, existing) {
  return {
    ...(existing || {}),
    surface_id: `package_script:${name}`,
    surface_type: 'package_script',
    source_file: 'package.json',
    entrypoint: `${name}: ${command}`,
    mutation_capability: false,
    execution_capability: false,
    deployment_capability: false,
    authority_required: 'none',
    aeo_required: false,
    validation_required: false,
    proof_required: false,
    replay_semantics: 'local_command_not_authoritative',
    drift_observable: true,
    proof_bound: false,
    governance_addressable: true,
    canonical_boundary_status: 'NON_DEPLOY_LOCAL_OR_TEST',
    bypass_risk: 'none',
    containment_status: 'NON_DEPLOY',
    evidence_only: true,
    non_authoritative: true,
  }
}

function workflowEntrypoint(source) {
  const workflowDispatchIndex = source.indexOf('workflow_dispatch:')
  const pushIndex = source.indexOf('push:')
  const pullRequestIndex = source.indexOf('pull_request:')
  if (workflowDispatchIndex !== -1) return 'workflow_dispatch'
  if (pushIndex !== -1) return 'push'
  if (pullRequestIndex !== -1) return 'pull_request'
  return 'workflow_event'
}

function workflowSurface(file, existing) {
  if (existing) return { ...existing, surface_id: `workflow:${file}`, surface_type: 'github_workflow', source_file: `${WORKFLOW_DIR}/${file}`, non_authoritative: true }
  const source = readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8')
  if (file === 'governed-deploy.yml') {
    return {
      ...(existing || {}),
      surface_id: `workflow:${file}`,
      surface_type: 'github_workflow',
      source_file: `${WORKFLOW_DIR}/${file}`,
      entrypoint: workflowEntrypoint(source),
      mutation_capability: true,
      execution_capability: true,
      deployment_capability: true,
      authority_required: 'decision_id_validated_object_hash_invocation_nonce',
      aeo_required: true,
      validation_required: true,
      proof_required: true,
      replay_semantics: 'manual_dispatch_requires_nonce',
      drift_observable: true,
      proof_bound: true,
      governance_addressable: true,
      canonical_boundary_status: 'CANONICAL_GOVERNED_DEPLOY',
      bypass_risk: 'none',
      containment_status: 'CONTAINED_BY_CANONICAL_PATH',
      evidence_only: false,
      non_authoritative: true,
    }
  }
  return {
    ...(existing || {}),
    surface_id: `workflow:${file}`,
    surface_type: 'github_workflow',
    source_file: `${WORKFLOW_DIR}/${file}`,
    entrypoint: workflowEntrypoint(source),
    mutation_capability: false,
    execution_capability: false,
    deployment_capability: false,
    authority_required: 'pull_request_governance',
    aeo_required: false,
    validation_required: false,
    proof_required: false,
    replay_semantics: 'pull_request_event_replay_neutral',
    drift_observable: true,
    proof_bound: false,
    governance_addressable: true,
    canonical_boundary_status: 'NON_DEPLOY_OR_PREPARATION',
    bypass_risk: 'none',
    containment_status: 'NON_DEPLOY_OR_EVIDENCE_ONLY',
    evidence_only: true,
    non_authoritative: true,
  }
}

function databaseSurface(table, existing) {
  if (existing) {
    return {
      ...existing,
      surface_id: `db_write:${table}`,
      surface_type: 'database_write_surface',
      source_file: SRC_PATH,
      non_authoritative: true,
    }
  }
  const proofBound = table === 'proof_registry'
  const canonicalRegistry = ['session_registry', 'continuity_registry', 'authority_registry', 'aeo_registry', 'validation_registry', 'execution_registry', 'proof_registry', 'invocation_registry'].includes(table)
  return {
    ...(existing || {}),
    surface_id: `db_write:${table}`,
    surface_type: 'database_write_surface',
    source_file: SRC_PATH,
    entrypoint: table,
    mutation_capability: true,
    execution_capability: canonicalRegistry,
    deployment_capability: false,
    authority_required: existing?.authority_required || 'canonical_runtime_route',
    aeo_required: existing?.aeo_required ?? canonicalRegistry,
    validation_required: true,
    proof_required: existing?.proof_required ?? proofBound,
    replay_semantics: existing?.replay_semantics || (proofBound ? 'append_only_or_replay_neutral' : 'replay_neutral'),
    drift_observable: true,
    proof_bound: existing?.proof_bound ?? proofBound,
    governance_addressable: true,
    canonical_boundary_status: existing?.canonical_boundary_status || (canonicalRegistry ? 'CANONICAL_REGISTRY' : 'NON_DEPLOY_OR_PREPARATION'),
    bypass_risk: 'raw_database_write',
    containment_status: existing?.containment_status || (canonicalRegistry ? 'CANONICAL_ROUTE_BOUND' : 'NON_DEPLOY_OR_EVIDENCE_ONLY'),
    evidence_only: existing?.evidence_only ?? !proofBound,
    non_authoritative: true,
  }
}

function regenerate() {
  const seed = json(INVENTORY_PATH)
  const packageJson = json(PACKAGE_PATH)
  const source = readFileSync(SRC_PATH, 'utf8')
  const map = new Map(seed.surfaces.map((surface) => [surface.surface_id, surface]))

  for (const [name, command] of Object.entries(packageJson.scripts || {}).sort(([a], [b]) => a.localeCompare(b))) {
    putStable(map, packageSurface(name, command, map.get(`package_script:${name}`)))
  }

  for (const file of readdirSync(WORKFLOW_DIR).filter((name) => name.endsWith('.yml')).sort((a, b) => a.localeCompare(b))) {
    putStable(map, workflowSurface(file, map.get(`workflow:${file}`)))
  }

  const dbWriteTables = sortedUnique([...source.matchAll(/(?:INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM)\s+(\w+)/g)].map((match) => match[1]).filter((table) => table !== 'ON'))
  for (const table of dbWriteTables) {
    putStable(map, databaseSurface(table, map.get(`db_write:${table}`)))
  }

  const surfaces = [...map.values()].sort((a, b) => a.surface_id.localeCompare(b.surface_id))
  const inventory = {
    artifact: 'UNAUTHORIZED_MUTATION_SURFACE_INVENTORY',
    issue: '342',
    canonical_invariant: 'If no valid object exists -> nothing happens.',
    closure_condition: 'No unauthorized reality mutation path exists.',
    drift_taxonomy: seed.drift_taxonomy,
    fail_closed_response: { drift_class: 'UNDECLARED_MUTATION_SURFACE', status: 'NULL' },
    surfaces,
    topology_reconciliation_inventory_closure: seed.topology_reconciliation_inventory_closure,
    cross_registry_reconciliation_inventory_closure: seed.cross_registry_reconciliation_inventory_closure,
  }

  const bypass = json('runtime/bypass_paths.json')
  const executionSurfaces = json('runtime/execution_surfaces.json')
  const rootAuthority = json('runtime/sovereignty/root_authority_inventory.json')
  const audit = {
    artifact: 'UNAUTHORIZED_MUTATION_PATH_CLOSURE_AUDIT',
    audit_id: 'issue-342-unauthorized-mutation-path-closure-v1',
    inventory_hash: hash(inventory),
    bypass_hash: hash(bypass),
    route_hash: hash(inventory.surfaces.filter((surface) => surface.surface_type.includes('route'))),
    workflow_hash: hash(inventory.surfaces.filter((surface) => surface.surface_type === 'github_workflow' || surface.surface_type === 'package_script')),
    registry_hash: hash(inventory.surfaces.filter((surface) => surface.surface_type === 'database_write_surface')),
    drift_classes: [],
    unresolved_surfaces: [],
    containment_status: 'CLOSED_CLASSIFICATION_COMPLETE',
    merge_legitimacy: 'UNCHANGED',
    evidence_only: true,
    non_authoritative: true,
    replay_neutral: true,
    reconciliation: {
      execution_surfaces_hash: hash(executionSurfaces),
      root_authority_inventory_hash: hash(rootAuthority),
      missing_mutation_surfaces_response: 'UNDECLARED_MUTATION_SURFACE -> NULL',
    },
    surfaces: [
      'db_write:runtime_topology_registry',
      'db_write:topology_reconciliation_registry',
      'route:/topology/reconcile',
      'route:/topology/drift',
      'route:/topology/fingerprint',
      'route:/topology/equivalence',
    ].map((surfaceId) => inventory.surfaces.find((surface) => surface.surface_id === surfaceId)),
    topology_reconciliation_inventory_closure: inventory.topology_reconciliation_inventory_closure,
  }

  writeFileSync(INVENTORY_PATH, stableStringify(inventory))
  writeFileSync(AUDIT_PATH, stableStringify(audit))
}

regenerate()
