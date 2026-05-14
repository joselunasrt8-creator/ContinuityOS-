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
  'ROOT_AUTHORITY_BYPASS_RISK',
  'ROOT_AUTHORITY_CONTAINMENT_REQUIRED',
])

const CANONICAL_PATH = Object.freeze(['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof'])

const WORKFLOW_DISPATCH_BOUNDARY = 'trigger-only-no-secret-inspection'
const OBSERVABILITY_ONLY_BOUNDARY = 'observability-only-no-secret-inspection'

export const ROOT_AUTHORITY_BASELINE_SURFACES = Object.freeze([
  { surface_id: 'cloudflare_account_authority', authority_origin: 'cloudflare_account', declared_boundary: '/session→/continuity→/authority→/compile→/validate→/execute→/proof', classifications: ['ROOT_DEPLOY_AUTHORITY', 'ROOT_RUNTIME_CONFIGURATION_AUTHORITY', 'ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY', 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED'] },
  { surface_id: 'cloudflare_deployment_token_authority', authority_origin: 'cloudflare_api_token', declared_boundary: OBSERVABILITY_ONLY_BOUNDARY, classifications: ['ROOT_DEPLOY_AUTHORITY', 'ROOT_ENVIRONMENT_AUTHORITY', 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED'] },
  { surface_id: 'github_admin_authority', authority_origin: 'github_repository_admin', declared_boundary: '/session→/continuity→/authority→/compile→/validate→/execute→/proof', classifications: ['ROOT_REPOSITORY_AUTHORITY', 'ROOT_BRANCH_POLICY_AUTHORITY', 'ROOT_WORKFLOW_AUTHORITY', 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED'] },
  { surface_id: 'github_actions_token_authority', authority_origin: 'github_actions_token', declared_boundary: 'least-privilege-observability-only', classifications: ['ROOT_REPOSITORY_AUTHORITY', 'ROOT_WORKFLOW_AUTHORITY', 'ROOT_ENVIRONMENT_AUTHORITY'] },
  { surface_id: 'github_actions_workflow_dispatch', authority_origin: 'github_actions_workflow_dispatch', declared_boundary: WORKFLOW_DISPATCH_BOUNDARY, classifications: ['ROOT_WORKFLOW_AUTHORITY'] },
  { surface_id: 'github_workflow_file_mutation', authority_origin: 'github_repository_workflows', declared_boundary: 'workflow-file-mutation-containment-required', classifications: ['ROOT_REPOSITORY_AUTHORITY', 'ROOT_WORKFLOW_AUTHORITY', 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED'] },
  { surface_id: 'github_environment_and_secrets_configuration', authority_origin: 'github_environment', declared_boundary: 'declared-not-inspected', classifications: ['ROOT_ENVIRONMENT_AUTHORITY', 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED'] },
  { surface_id: 'repository_secret_mutation_authority', authority_origin: 'github_repository_secrets', declared_boundary: OBSERVABILITY_ONLY_BOUNDARY, classifications: ['ROOT_REPOSITORY_AUTHORITY', 'ROOT_ENVIRONMENT_AUTHORITY', 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED'] },
  { surface_id: 'wrangler_deploy_capability', authority_origin: 'cloudflare_wrangler', declared_boundary: 'governed-deploy-workflow-only', classifications: ['ROOT_DEPLOY_AUTHORITY', 'ROOT_LOCAL_EXECUTION_AUTHORITY'] },
  { surface_id: 'wrangler_local_deploy_authority', authority_origin: 'local_wrangler_cli', declared_boundary: 'local-deploy-denied-observability-only', classifications: ['ROOT_DEPLOY_AUTHORITY', 'ROOT_LOCAL_EXECUTION_AUTHORITY', 'ROOT_AUTHORITY_BYPASS_RISK'] },
  { surface_id: 'package_script_deploy_guard', authority_origin: 'package_scripts', declared_boundary: 'disabled-direct-deploy', classifications: ['ROOT_PACKAGE_EXECUTION_AUTHORITY', 'ROOT_AUTHORITY_BYPASS_RISK'] },
  { surface_id: 'local_deploy_credentials_presence', authority_origin: 'local_environment', declared_boundary: OBSERVABILITY_ONLY_BOUNDARY, classifications: ['ROOT_LOCAL_EXECUTION_AUTHORITY', 'ROOT_ENVIRONMENT_AUTHORITY', 'ROOT_AUTHORITY_BYPASS_RISK'] },
  { surface_id: 'ci_token_permissions', authority_origin: 'github_actions_token', declared_boundary: 'least-privilege-assumption', classifications: ['ROOT_REPOSITORY_AUTHORITY', 'ROOT_WORKFLOW_AUTHORITY', 'ROOT_ENVIRONMENT_AUTHORITY'] },
  { surface_id: 'federated_runtime_authority', authority_origin: 'remote_runtime', declared_boundary: 'remote-authority-denied', classifications: ['ROOT_FEDERATION_AUTHORITY', 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED'] },
  { surface_id: 'root_runtime_authority_assumption', authority_origin: 'runtime_root', declared_boundary: 'runtime-authority-assumption-observability-only', classifications: ['ROOT_FEDERATION_AUTHORITY', 'ROOT_RUNTIME_CONFIGURATION_AUTHORITY', 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED'] },
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
  if (/deploy|wrangler|cloudflare|deployment_token|api_token/.test(material)) classes.add('ROOT_DEPLOY_AUTHORITY')
  if (/repo|repository|github_admin|settings|admin/.test(material)) classes.add('ROOT_REPOSITORY_AUTHORITY')
  if (/env|environment|secret|variable|credential|token/.test(material)) classes.add('ROOT_ENVIRONMENT_AUTHORITY')
  if (/workflow|dispatch|actions/.test(material)) classes.add('ROOT_WORKFLOW_AUTHORITY')
  if (/branch|protection/.test(material)) classes.add('ROOT_BRANCH_POLICY_AUTHORITY')
  if (/runtime|configuration|config/.test(material)) classes.add('ROOT_RUNTIME_CONFIGURATION_AUTHORITY')
  if (/federat|remote|runtime_root/.test(material)) classes.add('ROOT_FEDERATION_AUTHORITY')
  if (/local|cli/.test(material)) classes.add('ROOT_LOCAL_EXECUTION_AUTHORITY')
  if (/package|npm|script/.test(material)) classes.add('ROOT_PACKAGE_EXECUTION_AUTHORITY')
  if (/mutation|infrastructure|account|cloudflare|settings/.test(material)) classes.add('ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY')
  if (/bypass|direct|local-deploy|disabled-direct-deploy/.test(material)) classes.add('ROOT_AUTHORITY_BYPASS_RISK')
  if (/containment-required|account|admin|secret|environment|federat|runtime_root/.test(material)) classes.add('ROOT_AUTHORITY_CONTAINMENT_REQUIRED')
  if (surface.declared === false || material.includes('undeclared')) classes.add('UNDECLARED_ROOT_SURFACE')
  return [...classes].filter((c) => ROOT_AUTHORITY_CLASSIFICATIONS.includes(c)).sort()
}

export function canonicalizeRootAuthorityInventory(input = {}) {
  const source = Array.isArray(input.surfaces) && input.surfaces.length > 0 ? input.surfaces : ROOT_AUTHORITY_BASELINE_SURFACES
  const surfaces = source.map((surface) => {
    const observed_secret_material = String(surface.observed_secret_material ?? surface.secret_material ?? 'NOT_INSPECTED')
    return {
      surface_id: String(surface.surface_id || 'undeclared_root_surface'),
      authority_origin: String(surface.authority_origin || 'unknown'),
      declared_boundary: String(surface.declared_boundary || 'NULL'),
      classifications: classifyRootAuthoritySurface(surface),
      workflow_dispatch_semantics: /workflow_dispatch|dispatch/.test(`${surface.surface_id || ''} ${surface.authority_origin || ''}`.toLowerCase()) ? 'TRIGGER_ONLY' : 'NOT_APPLICABLE',
      deployment_token_observability: /token/.test(`${surface.surface_id || ''} ${surface.authority_origin || ''}`.toLowerCase()) ? 'OBSERVABILITY_ONLY_NO_SECRET_INSPECTION' : 'NOT_APPLICABLE',
      mutation_capability_observed: Boolean(surface.mutation_capability_observed ?? true),
      declared: surface.declared === false ? false : true,
      observed_executable: Boolean(surface.observed_executable ?? surface.executable ?? false),
      observed_deployment_capable: Boolean(surface.observed_deployment_capable ?? surface.deployment_capable ?? false),
      observed_creates_authority: Boolean(surface.observed_creates_authority ?? surface.creates_authority ?? false),
      observed_secret_values_inspected: Boolean(surface.observed_secret_values_inspected ?? surface.secret_values_inspected ?? false),
      observed_secret_material_persisted: Boolean(surface.observed_secret_material_persisted ?? surface.secret_material_persisted ?? false),
      observed_secret_material,
      normalized_secret_material: 'NOT_INSPECTED',
      normalized_executable: false,
      normalized_deployment_capable: false,
      normalized_creates_authority: false,
      secret_material: 'NOT_INSPECTED',
      executable: false,
      deployment_capable: false,
      creates_authority: false,
    }
  }).sort((a, b) => a.surface_id.localeCompare(b.surface_id) || a.authority_origin.localeCompare(b.authority_origin))
  const declared_root_surfaces = surfaces.filter((surface) => surface.declared).map((surface) => surface.surface_id).sort()
  const undeclared_root_surfaces = surfaces.filter((surface) => !surface.declared || surface.classifications.includes('UNDECLARED_ROOT_SURFACE')).map((surface) => surface.surface_id).sort()
  return Object.freeze({ inventory_type: 'RootAuthorityInventory', surfaces, declared_root_surfaces, undeclared_root_surfaces, evidence_only: true, executable: false, deployment_capable: false, creates_authority: false, secret_values_inspected: false })
}

export function hashRootAuthorityTopology(inventory) {
  return hashCanonical({ surfaces: inventory.surfaces.map((surface) => ({ surface_id: surface.surface_id, authority_origin: surface.authority_origin, declared_boundary: surface.declared_boundary, classifications: surface.classifications, declared: surface.declared })), evidence_only: true, executable: false, deployment_capable: false, creates_authority: false })
}

export function computeAuthorityContainmentBoundary(inventory) {
  const overflow_surfaces = inventory.surfaces.filter((surface) => !surface.declared || surface.classifications.includes('UNDECLARED_ROOT_SURFACE')).map((surface) => surface.surface_id).sort()
  const contained_surfaces = inventory.surfaces.map((surface) => surface.surface_id).sort()
  const containment_status = overflow_surfaces.length > 0 ? 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED' : 'ROOT_AUTHORITY_CONTAINED'
  const material = { allowed_canonical_path: CANONICAL_PATH, contained_surfaces, overflow_surfaces, containment_status, classification_authorizes: false, evidence_authorizes_merge: false }
  return Object.freeze({ boundary_type: 'RootAuthorityContainmentBoundary', allowed_canonical_path: CANONICAL_PATH, contained_surfaces, overflow_surfaces, declared_root_surfaces: inventory.surfaces.filter((surface) => surface.declared).map((surface) => surface.surface_id).sort(), undeclared_root_surfaces: overflow_surfaces, containment_status, merge_legitimacy: overflow_surfaces.length > 0 ? 'NULL' : 'UNCHANGED', preo_validity: overflow_surfaces.length > 0 ? 'NULL' : 'UNCHANGED', classification_authorizes: false, evidence_authorizes_merge: false, boundary_hash: hashCanonical(material), evidence_only: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false })
}

export function detectRootAuthorityDrift(inventory, topology_hash = hashRootAuthorityTopology(inventory), boundary = computeAuthorityContainmentBoundary(inventory)) {
  const drift = new Set()
  if (boundary.overflow_surfaces.length > 0) {
    drift.add('UNDECLARED_ROOT_SURFACE')
    drift.add('SOVEREIGNTY_DRIFT_DETECTED')
    drift.add('ROOT_AUTHORITY_BOUNDARY_OVERFLOW')
    drift.add('ROOT_AUTHORITY_CONTAINMENT_REQUIRED')
  }
  const unsafeObservedSurface = inventory.surfaces.some((surface) => surface.observed_executable === true || surface.observed_deployment_capable === true || surface.observed_creates_authority === true || surface.observed_secret_values_inspected === true || surface.observed_secret_material_persisted === true || surface.observed_secret_material !== 'NOT_INSPECTED')
  if (inventory.surfaces.some((surface) => surface.classifications.length === 0 || surface.secret_material !== 'NOT_INSPECTED' || surface.executable !== false || surface.deployment_capable !== false || surface.creates_authority !== false) || unsafeObservedSurface) drift.add('ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE')
  if (unsafeObservedSurface) {
    drift.add('SOVEREIGNTY_DRIFT_DETECTED')
    drift.add('ROOT_AUTHORITY_BYPASS_RISK')
    drift.add('ROOT_AUTHORITY_CONTAINMENT_REQUIRED')
  }
  if (inventory.surfaces.some((surface) => surface.classifications.includes('ROOT_AUTHORITY_BYPASS_RISK'))) drift.add('ROOT_AUTHORITY_BYPASS_RISK')
  const drift_classes = [...drift].sort()
  const drift_hash = hashCanonical({ topology_hash, drift_classes, undeclared_surfaces: boundary.overflow_surfaces, merge_legitimacy: drift_classes.length > 0 ? 'NULL' : 'UNCHANGED' })
  return Object.freeze({ drift_type: 'RootAuthorityDrift', drift_classes, containment_status: drift_classes.length > 0 ? 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED' : 'ROOT_AUTHORITY_CONTAINED', declared_root_surfaces: inventory.surfaces.filter((surface) => surface.declared).map((surface) => surface.surface_id).sort(), undeclared_root_surfaces: boundary.overflow_surfaces, undeclared_surfaces: boundary.overflow_surfaces, topology_hash, drift_hash, merge_legitimacy: drift_classes.length > 0 ? 'NULL' : 'UNCHANGED', fail_closed: drift_classes.length > 0, evidence_only: true, replay_neutral: true, non_authoritative: true, secret_material_persisted: false })
}

export function buildRootAuthorityContainmentEnvelope(input = {}, generated_at = '1970-01-01T00:00:00.000Z') {
  const inventory = canonicalizeRootAuthorityInventory(input)
  const topology_hash = hashRootAuthorityTopology(inventory)
  const boundary = computeAuthorityContainmentBoundary(inventory)
  const drift = detectRootAuthorityDrift(inventory, topology_hash, boundary)
  const containment_identity = hashCanonical({ topology_hash, boundary_hash: boundary.boundary_hash, drift_hash: drift.drift_hash })
  const containment_status = drift.drift_classes.length > 0 ? 'ROOT_AUTHORITY_CONTAINMENT_REQUIRED' : 'ROOT_AUTHORITY_CONTAINED'
  const containment_hash = hashCanonical({ containment_identity, topology_hash, boundary_hash: boundary.boundary_hash, drift_hash: drift.drift_hash, containment_status, evidence_only: true, non_authoritative: true })
  return Object.freeze({ envelope_type: 'RootAuthorityContainmentEnvelope', inventory, topology_hash, boundary, drift, containment_status, declared_root_surfaces: inventory.declared_root_surfaces, undeclared_root_surfaces: inventory.undeclared_root_surfaces, drift_classes: drift.drift_classes, containment_identity, containment_hash, generated_at, ...ROOT_AUTHORITY_EVIDENCE_FLAGS })
}
