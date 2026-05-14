import { createHash } from 'node:crypto'

export const ROOT_AUTHORITY_EVIDENCE_FLAGS = Object.freeze({
  evidence_only: true,
  append_only: true,
  replay_neutral: true,
  non_authoritative: true,
  executable: false,
  deployment_capable: false,
  creates_authority: false,
  secret_values_inspected: false,
  secret_material_persisted: false,
  fail_closed_on_ambiguity: true,
})

export const ROOT_AUTHORITY_CLASSIFICATIONS = Object.freeze([
  'ROOT_DEPLOY_AUTHORITY',
  'ROOT_REPOSITORY_AUTHORITY',
  'ROOT_ENVIRONMENT_AUTHORITY',
  'ROOT_WORKFLOW_AUTHORITY',
  'ROOT_BRANCH_POLICY_AUTHORITY',
  'ROOT_RUNTIME_CONFIGURATION_AUTHORITY',
  'ROOT_FEDERATION_AUTHORITY',
  'ROOT_LOCAL_EXECUTION_AUTHORITY',
  'ROOT_PACKAGE_EXECUTION_AUTHORITY',
  'ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY',
  'UNDECLARED_ROOT_SURFACE',
  'SOVEREIGNTY_DRIFT_DETECTED',
  'ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE',
  'ROOT_AUTHORITY_BOUNDARY_OVERFLOW',
])

const CANONICAL_PATH = Object.freeze(['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof'])

export const ROOT_AUTHORITY_BASELINE_SURFACES = Object.freeze([
  { surface_id: 'cloudflare_account_authority', authority_origin: 'cloudflare_account', declared_boundary: '/session→/continuity→/authority→/compile→/validate→/execute→/proof', classifications: ['ROOT_DEPLOY_AUTHORITY', 'ROOT_RUNTIME_CONFIGURATION_AUTHORITY', 'ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY'] },
  { surface_id: 'github_admin_authority', authority_origin: 'github_repository', declared_boundary: '/session→/continuity→/authority→/compile→/validate→/execute→/proof', classifications: ['ROOT_REPOSITORY_AUTHORITY', 'ROOT_BRANCH_POLICY_AUTHORITY', 'ROOT_WORKFLOW_AUTHORITY'] },
  { surface_id: 'github_actions_workflow_dispatch', authority_origin: 'github_actions', declared_boundary: '/authority→/compile→/validate→/execute→/proof', classifications: ['ROOT_WORKFLOW_AUTHORITY'] },
  { surface_id: 'github_environment_and_secrets_configuration', authority_origin: 'github_environment', declared_boundary: 'declared-not-inspected', classifications: ['ROOT_ENVIRONMENT_AUTHORITY'] },
  { surface_id: 'wrangler_deploy_capability', authority_origin: 'cloudflare_wrangler', declared_boundary: 'governed-deploy-workflow-only', classifications: ['ROOT_DEPLOY_AUTHORITY', 'ROOT_LOCAL_EXECUTION_AUTHORITY'] },
  { surface_id: 'package_script_deploy_guard', authority_origin: 'package_scripts', declared_boundary: 'disabled-direct-deploy', classifications: ['ROOT_PACKAGE_EXECUTION_AUTHORITY'] },
  { surface_id: 'local_deploy_credentials_presence', authority_origin: 'local_environment', declared_boundary: 'not-inspected-observability-only', classifications: ['ROOT_LOCAL_EXECUTION_AUTHORITY', 'ROOT_ENVIRONMENT_AUTHORITY'] },
  { surface_id: 'ci_token_permissions', authority_origin: 'github_actions_token', declared_boundary: 'least-privilege-assumption', classifications: ['ROOT_REPOSITORY_AUTHORITY', 'ROOT_WORKFLOW_AUTHORITY'] },
  { surface_id: 'federated_runtime_authority', authority_origin: 'remote_runtime', declared_boundary: 'remote-authority-denied', classifications: ['ROOT_FEDERATION_AUTHORITY'] },
].sort((a, b) => a.surface_id.localeCompare(b.surface_id)))

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
  if (value === undefined) return null
  return value
}

export function canonicalize(value) {
  return JSON.stringify(normalize(value))
}

export function hashCanonical(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex')
}

export function classifyRootAuthoritySurface(surface = {}) {
  const material = `${surface.surface_id ?? ''} ${surface.authority_origin ?? ''} ${surface.declared_boundary ?? ''}`.toLowerCase()
  const classes = new Set(Array.isArray(surface.classifications) ? surface.classifications : [])
  if (/deploy|wrangler|cloudflare/.test(material)) classes.add('ROOT_DEPLOY_AUTHORITY')
  if (/repo|github_admin|settings|admin/.test(material)) classes.add('ROOT_REPOSITORY_AUTHORITY')
  if (/env|secret|variable|credential|token/.test(material)) classes.add('ROOT_ENVIRONMENT_AUTHORITY')
  if (/workflow|dispatch|actions/.test(material)) classes.add('ROOT_WORKFLOW_AUTHORITY')
  if (/branch|protection/.test(material)) classes.add('ROOT_BRANCH_POLICY_AUTHORITY')
  if (/runtime|configuration|config/.test(material)) classes.add('ROOT_RUNTIME_CONFIGURATION_AUTHORITY')
  if (/federat|remote/.test(material)) classes.add('ROOT_FEDERATION_AUTHORITY')
  if (/local/.test(material)) classes.add('ROOT_LOCAL_EXECUTION_AUTHORITY')
  if (/package|npm|script/.test(material)) classes.add('ROOT_PACKAGE_EXECUTION_AUTHORITY')
  if (/mutation|infrastructure|account|cloudflare/.test(material)) classes.add('ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY')
  if (surface.declared === false || material.includes('undeclared')) classes.add('UNDECLARED_ROOT_SURFACE')
  return [...classes].filter((c) => ROOT_AUTHORITY_CLASSIFICATIONS.includes(c)).sort()
}

export function canonicalizeRootAuthorityInventory(input = {}) {
  const source = Array.isArray(input.surfaces) && input.surfaces.length > 0 ? input.surfaces : ROOT_AUTHORITY_BASELINE_SURFACES
  const surfaces = source.map((surface) => ({
    surface_id: String(surface.surface_id || 'undeclared_root_surface'),
    authority_origin: String(surface.authority_origin || 'unknown'),
    declared_boundary: String(surface.declared_boundary || 'NULL'),
    classifications: classifyRootAuthoritySurface(surface),
    mutation_capability_observed: Boolean(surface.mutation_capability_observed ?? true),
    declared: surface.declared === false ? false : true,
    secret_material: 'NOT_INSPECTED',
    executable: false,
    deployment_capable: false,
    creates_authority: false,
  })).sort((a, b) => a.surface_id.localeCompare(b.surface_id) || a.authority_origin.localeCompare(b.authority_origin))
  return Object.freeze({ inventory_type: 'RootAuthorityInventory', surfaces, evidence_only: true, executable: false, deployment_capable: false, creates_authority: false, secret_values_inspected: false })
}

export function hashRootAuthorityTopology(inventory) {
  return hashCanonical({ surfaces: inventory.surfaces.map((surface) => ({ surface_id: surface.surface_id, authority_origin: surface.authority_origin, declared_boundary: surface.declared_boundary, classifications: surface.classifications, declared: surface.declared })), evidence_only: true, executable: false, deployment_capable: false, creates_authority: false })
}

export function computeAuthorityContainmentBoundary(inventory) {
  const overflow_surfaces = inventory.surfaces.filter((surface) => !surface.declared || surface.classifications.includes('UNDECLARED_ROOT_SURFACE')).map((surface) => surface.surface_id).sort()
  const contained_surfaces = inventory.surfaces.map((surface) => surface.surface_id).sort()
  const material = { allowed_canonical_path: CANONICAL_PATH, contained_surfaces, overflow_surfaces, classification_authorizes: false, evidence_authorizes_merge: false }
  return Object.freeze({ boundary_type: 'RootAuthorityContainmentBoundary', allowed_canonical_path: CANONICAL_PATH, contained_surfaces, overflow_surfaces, merge_legitimacy: overflow_surfaces.length > 0 ? 'NULL' : 'UNCHANGED', preo_validity: overflow_surfaces.length > 0 ? 'NULL' : 'UNCHANGED', classification_authorizes: false, evidence_authorizes_merge: false, boundary_hash: hashCanonical(material), evidence_only: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false })
}

export function detectRootAuthorityDrift(inventory, topology_hash = hashRootAuthorityTopology(inventory), boundary = computeAuthorityContainmentBoundary(inventory)) {
  const drift = new Set()
  if (boundary.overflow_surfaces.length > 0) {
    drift.add('UNDECLARED_ROOT_SURFACE')
    drift.add('SOVEREIGNTY_DRIFT_DETECTED')
    drift.add('ROOT_AUTHORITY_BOUNDARY_OVERFLOW')
  }
  if (inventory.surfaces.some((surface) => surface.classifications.length === 0 || surface.secret_material !== 'NOT_INSPECTED' || surface.executable !== false || surface.deployment_capable !== false || surface.creates_authority !== false)) drift.add('ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE')
  const drift_classes = [...drift].sort()
  const drift_hash = hashCanonical({ topology_hash, drift_classes, undeclared_surfaces: boundary.overflow_surfaces, merge_legitimacy: drift_classes.length > 0 ? 'NULL' : 'UNCHANGED' })
  return Object.freeze({ drift_type: 'RootAuthorityDrift', drift_classes, undeclared_surfaces: boundary.overflow_surfaces, topology_hash, drift_hash, merge_legitimacy: drift_classes.length > 0 ? 'NULL' : 'UNCHANGED', fail_closed: drift_classes.length > 0, evidence_only: true, replay_neutral: true, non_authoritative: true, secret_material_persisted: false })
}

export function buildRootAuthorityContainmentEnvelope(input = {}, generated_at = '1970-01-01T00:00:00.000Z') {
  const inventory = canonicalizeRootAuthorityInventory(input)
  const topology_hash = hashRootAuthorityTopology(inventory)
  const boundary = computeAuthorityContainmentBoundary(inventory)
  const drift = detectRootAuthorityDrift(inventory, topology_hash, boundary)
  const containment_identity = hashCanonical({ topology_hash, boundary_hash: boundary.boundary_hash, drift_hash: drift.drift_hash })
  const containment_hash = hashCanonical({ containment_identity, topology_hash, boundary_hash: boundary.boundary_hash, drift_hash: drift.drift_hash, evidence_only: true, non_authoritative: true })
  return Object.freeze({ envelope_type: 'RootAuthorityContainmentEnvelope', inventory, topology_hash, boundary, drift, containment_identity, containment_hash, generated_at, ...ROOT_AUTHORITY_EVIDENCE_FLAGS })
}
