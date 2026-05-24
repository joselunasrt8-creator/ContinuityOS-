import { canonicalize, sha256Hex } from './canonical.js'

export const GOVERNANCE_MODULE_BOUNDARY_CLASSIFICATIONS = Object.freeze([
  'BOUNDARY_INTACT',
  'BOUNDARY_VIOLATION',
  'CIRCULAR_DEPENDENCY',
  'FORBIDDEN_DEPENDENCY_DIRECTION',
  'AUTHORITY_LEAKAGE',
  'OBSERVABILITY_AUTHORITY_LEAKAGE',
  'CANONICAL_OWNER_FRAGMENTATION',
  'MODULE_RESPONSIBILITY_DRIFT',
  'SEMANTIC_COUPLING_DRIFT',
  'UNKNOWN_MODULE_SURFACE',
  'NULL',
] as const)

type BoundaryClassification = (typeof GOVERNANCE_MODULE_BOUNDARY_CLASSIFICATIONS)[number]

export interface GovernanceModule {
  readonly module_id: string
  readonly module_surface?: string
  readonly owner_invariants?: readonly string[]
  readonly depends_on?: readonly string[]
  readonly role?: 'authority' | 'observability' | 'replay' | 'reconciliation' | 'topology' | 'semantic' | 'unknown'
  readonly allows_outbound_to?: readonly string[]
  readonly authority_scopes?: readonly string[]
  readonly semantic_tags?: readonly string[]
}

export interface GovernanceModuleBoundaryInput {
  readonly analysis_id: string
  readonly evidence_only: true
  readonly modules: readonly GovernanceModule[]
}

export interface GovernanceModuleBoundaryResult {
  readonly artifact_type: 'GOVERNANCE_MODULE_BOUNDARY_ENFORCEMENT'
  readonly analysis_id: string
  readonly classification: BoundaryClassification
  readonly module_boundary_inventory: readonly string[]
  readonly canonical_ownership_inventory: readonly string[]
  readonly dependency_direction_inventory: readonly string[]
  readonly circular_dependency_inventory: readonly string[]
  readonly boundary_violation_inventory: readonly string[]
  readonly authority_leakage_inventory: readonly string[]
  readonly observability_containment_inventory: readonly string[]
  readonly semantic_fragmentation_inventory: readonly string[]
  readonly module_responsibility_drift_inventory: readonly string[]
  readonly anti_fragmentation_audit_surface: readonly string[]
  readonly boundary_hash: string
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly validates_execution: false
}

const KNOWN_SURFACES = new Set(['authority', 'observability', 'replay', 'reconciliation', 'topology', 'semantic'])
const OBSERVABILITY_CONTAINMENT = Object.freeze([
  'evidence_only',
  'module_visibility_neq_authority',
  'observability_to_authority_forbidden',
  'topology_visibility_cannot_validate_execution',
  'boundary_analysis_cannot_create_legitimacy',
])

const sortedUnique = (values: Iterable<string>): readonly string[] =>
  Object.freeze(Array.from(new Set(values)).filter(Boolean).sort((a, b) => a.localeCompare(b)))

const normalizeModule = (m: GovernanceModule): GovernanceModule => ({
  module_id: String(m?.module_id || ''),
  module_surface: String(m?.module_surface || ''),
  owner_invariants: sortedUnique((m?.owner_invariants || []).map((v) => String(v || ''))),
  depends_on: sortedUnique((m?.depends_on || []).map((v) => String(v || ''))),
  role: (m?.role || 'unknown') as GovernanceModule['role'],
  allows_outbound_to: sortedUnique((m?.allows_outbound_to || []).map((v) => String(v || ''))),
  authority_scopes: sortedUnique((m?.authority_scopes || []).map((v) => String(v || ''))),
  semantic_tags: sortedUnique((m?.semantic_tags || []).map((v) => String(v || ''))),
})

export function enforceGovernanceModuleBoundaries(input: GovernanceModuleBoundaryInput): GovernanceModuleBoundaryResult {
  if (!input || input.evidence_only !== true || !Array.isArray(input.modules) || input.modules.length === 0) {
    return Object.freeze({
      artifact_type: 'GOVERNANCE_MODULE_BOUNDARY_ENFORCEMENT',
      analysis_id: String(input?.analysis_id || ''),
      classification: 'NULL',
      module_boundary_inventory: Object.freeze([]),
      canonical_ownership_inventory: Object.freeze([]),
      dependency_direction_inventory: Object.freeze([]),
      circular_dependency_inventory: Object.freeze([]),
      boundary_violation_inventory: Object.freeze(['fail_closed_null']),
      authority_leakage_inventory: Object.freeze([]),
      observability_containment_inventory: OBSERVABILITY_CONTAINMENT,
      semantic_fragmentation_inventory: Object.freeze([]),
      module_responsibility_drift_inventory: Object.freeze([]),
      anti_fragmentation_audit_surface: Object.freeze([]),
      boundary_hash: sha256Hex(canonicalize([])),
      evidence_only: true,
      creates_authority: false,
      mutates_state: false,
      validates_execution: false,
    })
  }

  const modules = input.modules.map(normalizeModule).sort((a, b) => a.module_id.localeCompare(b.module_id))
  const byId = new Map(modules.map((m) => [m.module_id, m]))

  const moduleBoundaryInventory = modules.map((m) => `${m.module_id}:${m.module_surface}`)
  const canonicalOwnership: string[] = []
  const dependencyDirections: string[] = []
  const cycles = new Set<string>()
  const boundaryViolations: string[] = []
  const authorityLeakage: string[] = []
  const semanticFragmentation: string[] = []
  const responsibilityDrift: string[] = []

  const ownerMap = new Map<string, Set<string>>()
  for (const m of modules) {
    for (const inv of m.owner_invariants || []) {
      if (!ownerMap.has(inv)) ownerMap.set(inv, new Set())
      ownerMap.get(inv)?.add(m.module_id)
    }
  }

  for (const [inv, owners] of ownerMap.entries()) {
    const ordered = [...owners].sort((a, b) => a.localeCompare(b))
    canonicalOwnership.push(`${inv}:${ordered.join(',')}`)
    if (ordered.length > 1) {
      boundaryViolations.push(`canonical_owner_fragmentation:${inv}`)
      semanticFragmentation.push(`owner_fragmentation:${inv}`)
    }
  }

  for (const m of modules) {
    if (!KNOWN_SURFACES.has(m.module_surface || '')) {
      boundaryViolations.push(`unknown_module_surface:${m.module_id}`)
      responsibilityDrift.push(`unknown_module_surface:${m.module_id}`)
    }
    if (m.role === 'observability' && (m.authority_scopes || []).length > 0) {
      authorityLeakage.push(`observability_authority_leakage:${m.module_id}`)
      boundaryViolations.push(`observability_authority_leakage:${m.module_id}`)
    }

    for (const depId of m.depends_on || []) {
      const dep = byId.get(depId)
      if (!dep) {
        boundaryViolations.push(`unknown_dependency_target:${m.module_id}->${depId}`)
        continue
      }
      dependencyDirections.push(`${m.module_id}->${dep.module_id}`)
      if (m.role === 'observability' && dep.role === 'authority') {
        authorityLeakage.push(`observability_to_authority:${m.module_id}->${dep.module_id}`)
      }
      if ((m.role === 'authority' && dep.role === 'observability') || (m.allows_outbound_to || []).includes(dep.module_id) === false) {
        boundaryViolations.push(`forbidden_dependency_direction:${m.module_id}->${dep.module_id}`)
      }
      if ((m.semantic_tags || []).length > 0 && (dep.semantic_tags || []).length > 0) {
        const overlap = (m.semantic_tags || []).filter((t) => dep.semantic_tags?.includes(t))
        if (overlap.length > 0 && m.owner_invariants?.every((inv) => !(dep.owner_invariants || []).includes(inv))) {
          semanticFragmentation.push(`semantic_coupling_drift:${m.module_id}<->${dep.module_id}:${overlap.sort().join('+')}`)
        }
      }
      if (m.role === 'authority' && dep.role !== 'authority' && dep.role !== 'reconciliation') {
        responsibilityDrift.push(`module_responsibility_drift:${m.module_id}->${dep.module_id}`)
      }
    }
  }

  const edgeSet = new Set(dependencyDirections)
  for (const edge of edgeSet) {
    const [from, to] = edge.split('->')
    if (edgeSet.has(`${to}->${from}`)) cycles.add([from, to].sort((a, b) => a.localeCompare(b)).join('<->'))
  }

  for (const cycle of cycles) {
    boundaryViolations.push(`circular_dependency:${cycle}`)
    responsibilityDrift.push(`circular_responsibility:${cycle}`)
  }

  const canonicalOwnershipInventory = sortedUnique(canonicalOwnership)
  const dependencyDirectionInventory = sortedUnique(dependencyDirections)
  const circularDependencyInventory = sortedUnique(Array.from(cycles))
  const boundaryViolationInventory = sortedUnique(boundaryViolations)
  const authorityLeakageInventory = sortedUnique(authorityLeakage)
  const semanticFragmentationInventory = sortedUnique(semanticFragmentation)
  const moduleResponsibilityDriftInventory = sortedUnique(responsibilityDrift)

  let classification: BoundaryClassification = 'BOUNDARY_INTACT'
  if (boundaryViolationInventory.some((v) => v.startsWith('unknown_module_surface'))) classification = 'UNKNOWN_MODULE_SURFACE'
  else if (semanticFragmentationInventory.some((v) => v.startsWith('owner_fragmentation'))) classification = 'CANONICAL_OWNER_FRAGMENTATION'
  else if (authorityLeakageInventory.some((v) => v.startsWith('observability_authority_leakage') || v.startsWith('observability_to_authority'))) classification = 'OBSERVABILITY_AUTHORITY_LEAKAGE'
  else if (authorityLeakageInventory.length > 0) classification = 'AUTHORITY_LEAKAGE'
  else if (boundaryViolationInventory.some((v) => v.startsWith('forbidden_dependency_direction'))) classification = 'FORBIDDEN_DEPENDENCY_DIRECTION'
  else if (circularDependencyInventory.length > 0) classification = 'CIRCULAR_DEPENDENCY'
  else if (moduleResponsibilityDriftInventory.length > 0) classification = 'MODULE_RESPONSIBILITY_DRIFT'
  else if (semanticFragmentationInventory.some((v) => v.startsWith('semantic_coupling_drift'))) classification = 'SEMANTIC_COUPLING_DRIFT'
  else if (boundaryViolationInventory.length > 0) classification = 'BOUNDARY_VIOLATION'

  const antiFragmentationAuditSurface = sortedUnique([
    ...moduleBoundaryInventory,
    ...canonicalOwnershipInventory,
    ...dependencyDirectionInventory,
    ...circularDependencyInventory.map((v) => `cycle:${v}`),
    ...boundaryViolationInventory,
    ...authorityLeakageInventory,
    ...semanticFragmentationInventory,
    ...moduleResponsibilityDriftInventory,
  ])

  const payload = {
    artifact_type: 'GOVERNANCE_MODULE_BOUNDARY_ENFORCEMENT' as const,
    analysis_id: String(input.analysis_id || ''),
    classification,
    module_boundary_inventory: Object.freeze(moduleBoundaryInventory),
    canonical_ownership_inventory: canonicalOwnershipInventory,
    dependency_direction_inventory: dependencyDirectionInventory,
    circular_dependency_inventory: circularDependencyInventory,
    boundary_violation_inventory: boundaryViolationInventory,
    authority_leakage_inventory: authorityLeakageInventory,
    observability_containment_inventory: OBSERVABILITY_CONTAINMENT,
    semantic_fragmentation_inventory: semanticFragmentationInventory,
    module_responsibility_drift_inventory: moduleResponsibilityDriftInventory,
    anti_fragmentation_audit_surface: antiFragmentationAuditSurface,
    evidence_only: true as const,
    creates_authority: false as const,
    mutates_state: false as const,
    validates_execution: false as const,
  }

  return Object.freeze({ ...payload, boundary_hash: sha256Hex(canonicalize(payload)) })
}
