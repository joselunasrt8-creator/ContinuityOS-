/**
 * Mutation Surface Exhaustiveness — Issue #358
 *
 * Required invariant:
 *   INSERT / UPDATE / DELETE + undeclared execution surface → NULL
 *
 * Every mutation-capable code path must map to exactly one declared governance
 * surface classification:
 *   AUTHORITATIVE  — canonical runtime routes that create binding state
 *   EVIDENCE_ONLY  — append-only observability surfaces, cannot create authority
 *   NON_EXECUTABLE — read-only, non-mutation-capable routes
 */

export const MUTATION_CLASSIFICATIONS = ['AUTHORITATIVE', 'EVIDENCE_ONLY', 'NON_EXECUTABLE'] as const
export type MutationClassification = (typeof MUTATION_CLASSIFICATIONS)[number]

export const CANONICAL_RUNTIME_ROUTES = [
  '/session',
  '/continuity',
  '/authority',
  '/compile',
  '/validate',
  '/execute',
  '/proof',
] as const

export const AUTHORITATIVE_MUTATION_TABLES: readonly string[] = [
  'session_registry',
  'continuity_registry',
  'authority_registry',
  'aeo_registry',
  'validation_registry',
  'execution_registry',
  'proof_registry',
  'invocation_registry',
] as const

export const EVIDENCE_ONLY_MUTATION_TABLES: readonly string[] = [
  'preo_registry',
  'observability_registry',
  'drift_registry',
  'attestation_registry',
  'bootstrap_sovereignty_registry',
  'external_authority_registry',
  'legitimacy_drift_propagation_registry',
  'legitimacy_quarantine_registry',
  'cross_registry_reconciliation_registry',
  'unauthorized_mutation_closure_registry',
  'install_base_telemetry_registry',
  'proof_registry_duplicate_archive',
  'proof_quarantine_registry',
  'proof_propagation_outbox',
  'continuous_fate_registry',
  'reconciliation_closure_registry',
  'recursive_governance_containment_registry',
  'recursive_governance_registry',
  'recursive_governance_replay_registry',
  'runtime_governance_lock_registry',
  'runtime_sovereignty_registry',
  'runtime_surface_containment_registry',
  'runtime_topology_registry',
  'runtime_evolution_consensus_registry',
  'revocation_topology_registry',
  'federated_reconciliation_registry',
  'federated_sovereignty_registry',
  'federated_trust_registry',
  'federation_conformance_registry',
  'governance_compression_registry',
  'legitimacy_graph_registry',
  'root_authority_observability_registry',
  'topology_reconciliation_registry',
  'external_conformance_verification_registry',
  'observer_attestation_registry',
  'portable_governance_checkpoint_registry',
  'semantic_equivalence_registry',
  'delegated_authority_registry',
  'execution_snapshot_registry',
  'federated_checkpoint_registry',
  'federation_conformance_registry',
  'distributed_legitimacy_registry',
  'recursive_governance_replay_registry',
  'deployment_provenance_registry',
  'deployment_proof_registry',
  'deployment_rollback_registry',
  'migration_governance_registry',
] as const

export const MUTATION_DRIFT_TAXONOMY = [
  'UNDECLARED_MUTATION_SURFACE',
  'UNCLASSIFIED_EXECUTION_SURFACE',
  'UNBOUND_DATABASE_WRITE',
  'OBSERVABILITY_MUTATION_ESCALATION',
  'AUTHORITYLESS_MUTATION_PATH',
  'PROOFLESS_MUTATION_PATH',
  'DUPLICATE_SURFACE_OWNERSHIP',
  'CLOSURE_INCOMPLETE',
] as const
export type MutationDriftClass = (typeof MUTATION_DRIFT_TAXONOMY)[number]

export interface MutationOperation {
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  source_line?: number
  raw?: string
}

export interface MutationSurfaceEntry {
  surface_id: string
  table: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'INSERT_OR_IGNORE'
  classification: MutationClassification
  canonical_route?: string
  creates_authority: boolean
  execution_capable: boolean
  governance_bound: boolean
  replay_safe: boolean
}

export interface ExhaustivenessResult {
  status: 'EXHAUSTIVE' | 'NULL'
  undeclared_mutations: MutationOperation[]
  drift_classes: MutationDriftClass[]
  replay_safe: boolean
  evidence_only: boolean
  non_authoritative: boolean
}

export interface EvidenceOnlyVerificationResult {
  status: 'VERIFIED' | 'ESCALATION_DETECTED' | 'NULL'
  violations: Array<{ surface_id: string; violation: string }>
  replay_safe: boolean
  non_authoritative: boolean
}

export interface DuplicateOwnershipResult {
  status: 'UNIQUE' | 'DUPLICATE_DETECTED' | 'NULL'
  duplicates: Array<{ table: string; count: number }>
  drift_classes: MutationDriftClass[]
  replay_safe: boolean
}

export interface FATETestResult {
  test_id: string
  test_name: string
  test_category: 'MUTATION_EXHAUSTIVENESS'
  status: 'PASS' | 'NULL'
  drift_classes: MutationDriftClass[]
  evidence_only: boolean
  replay_safe: boolean
  non_authoritative: boolean
}

/**
 * Scan source text for all INSERT / UPDATE / DELETE operations.
 * Returns the table name and operation type for each match.
 */
export function scanMutationOperations(source: string): MutationOperation[] {
  const pattern =
    /\b(?:INSERT(?:\s+OR\s+IGNORE)?(?:\s+INTO)?|UPDATE|DELETE\s+FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
  const seen = new Set<string>()
  const results: MutationOperation[] = []

  for (const match of source.matchAll(pattern)) {
    const raw = match[0]
    const table = match[1]
    const key = `${raw.toUpperCase().slice(0, 6)}:${table}`
    if (seen.has(key)) continue
    seen.add(key)

    const upper = raw.trimStart().toUpperCase()
    const operation: MutationOperation['operation'] = upper.startsWith('INSERT')
      ? 'INSERT'
      : upper.startsWith('UPDATE')
        ? 'UPDATE'
        : 'DELETE'

    if (table && !table.match(/^(IF|OR|INTO|FROM|IGNORE)$/i)) {
      results.push({ operation, table, raw })
    }
  }

  return results.sort((a, b) => a.table.localeCompare(b.table))
}

/**
 * Classify a single table name against the canonical surface lists.
 * Returns null if the table is not declared — this is the undeclared mutation path.
 */
export function classifyMutationTable(table: string): MutationClassification | null {
  if ((AUTHORITATIVE_MUTATION_TABLES as readonly string[]).includes(table)) return 'AUTHORITATIVE'
  if ((EVIDENCE_ONLY_MUTATION_TABLES as readonly string[]).includes(table)) return 'EVIDENCE_ONLY'
  return null
}

/**
 * Check whether every observed mutation operation maps to a declared surface.
 * Any unmapped operation produces: UNDECLARED_MUTATION_SURFACE → NULL
 */
export function checkExhaustiveness(
  operations: MutationOperation[],
  declaredSurfaces: MutationSurfaceEntry[],
): ExhaustivenessResult {
  const declaredTables = new Set(declaredSurfaces.map((s) => s.table))
  const undeclared = operations.filter((op) => !declaredTables.has(op.table))
  const drift: MutationDriftClass[] = []

  if (undeclared.length > 0) {
    drift.push('UNDECLARED_MUTATION_SURFACE')
    drift.push('CLOSURE_INCOMPLETE')
  }

  return Object.freeze({
    status: undeclared.length === 0 ? 'EXHAUSTIVE' : 'NULL',
    undeclared_mutations: undeclared,
    drift_classes: drift,
    replay_safe: true,
    evidence_only: true,
    non_authoritative: true,
  })
}

/**
 * Verify that evidence-only surfaces cannot escalate to authority-granting or
 * execution-capable status.
 *
 * Invariant: observability mutation cannot create authority.
 */
export function verifyEvidenceOnlyConstraints(
  surfaces: MutationSurfaceEntry[],
): EvidenceOnlyVerificationResult {
  const violations: Array<{ surface_id: string; violation: string }> = []

  for (const surface of surfaces) {
    if (surface.classification === 'EVIDENCE_ONLY') {
      if (surface.creates_authority) {
        violations.push({
          surface_id: surface.surface_id,
          violation: 'OBSERVABILITY_MUTATION_ESCALATION: evidence-only surface cannot create authority',
        })
      }
      if (surface.execution_capable) {
        violations.push({
          surface_id: surface.surface_id,
          violation: 'OBSERVABILITY_MUTATION_ESCALATION: evidence-only surface cannot be execution-capable',
        })
      }
    }
    if (surface.classification === 'NON_EXECUTABLE') {
      if (surface.execution_capable) {
        violations.push({
          surface_id: surface.surface_id,
          violation: 'OBSERVABILITY_MUTATION_ESCALATION: non-executable surface cannot be execution-capable',
        })
      }
      if (surface.creates_authority) {
        violations.push({
          surface_id: surface.surface_id,
          violation: 'OBSERVABILITY_MUTATION_ESCALATION: non-executable surface cannot create authority',
        })
      }
    }
  }

  if (violations.length > 0) {
    return Object.freeze({
      status: 'ESCALATION_DETECTED',
      violations,
      replay_safe: false,
      non_authoritative: false,
    })
  }

  return Object.freeze({
    status: 'VERIFIED',
    violations: [],
    replay_safe: true,
    non_authoritative: true,
  })
}

/**
 * Verify that each AUTHORITATIVE table appears at most once in the declared surfaces.
 * Duplicate authoritative ownership is a closure violation.
 */
export function verifyNoDuplicateOwnership(
  surfaces: MutationSurfaceEntry[],
): DuplicateOwnershipResult {
  const counts = new Map<string, number>()
  for (const s of surfaces.filter((s) => s.classification === 'AUTHORITATIVE')) {
    counts.set(s.table, (counts.get(s.table) ?? 0) + 1)
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([table, count]) => ({ table, count }))

  return Object.freeze({
    status: duplicates.length === 0 ? 'UNIQUE' : 'DUPLICATE_DETECTED',
    duplicates,
    drift_classes: duplicates.length > 0
      ? (['DUPLICATE_SURFACE_OWNERSHIP', 'CLOSURE_INCOMPLETE'] as MutationDriftClass[])
      : [],
    replay_safe: duplicates.length === 0,
  })
}

/**
 * Run all FATE mutation-exhaustiveness test cases and return per-test results.
 */
export function runMutationExhaustivenessTests(
  operations: MutationOperation[],
  declaredSurfaces: MutationSurfaceEntry[],
): FATETestResult[] {
  const category = 'MUTATION_EXHAUSTIVENESS' as const

  const exhaustiveness = checkExhaustiveness(operations, declaredSurfaces)
  const evidenceOnly = verifyEvidenceOnlyConstraints(declaredSurfaces)
  const canonicalRoutes = new Set<string>(CANONICAL_RUNTIME_ROUTES)
  const authoritativeSurfaces = declaredSurfaces.filter((s) => s.classification === 'AUTHORITATIVE')
  const misrouted = authoritativeSurfaces.filter(
    (s) => s.canonical_route !== undefined && !canonicalRoutes.has(s.canonical_route),
  )
  const ownership = verifyNoDuplicateOwnership(declaredSurfaces)

  return [
    {
      test_id: 'MEXT_001',
      test_name: 'All mutation-capable operations map to exactly one declared surface',
      test_category: category,
      status: exhaustiveness.status === 'EXHAUSTIVE' ? 'PASS' : 'NULL',
      drift_classes: exhaustiveness.drift_classes,
      evidence_only: true,
      replay_safe: true,
      non_authoritative: true,
    },
    {
      test_id: 'MEXT_002',
      test_name: 'Evidence-only and non-executable surfaces cannot create authority or execute',
      test_category: category,
      status: evidenceOnly.status === 'VERIFIED' ? 'PASS' : 'NULL',
      drift_classes: evidenceOnly.violations.length > 0
        ? (['OBSERVABILITY_MUTATION_ESCALATION', 'CLOSURE_INCOMPLETE'] as MutationDriftClass[])
        : [],
      evidence_only: true,
      replay_safe: evidenceOnly.replay_safe,
      non_authoritative: true,
    },
    {
      test_id: 'MEXT_003',
      test_name: 'Authoritative mutations are owned exclusively by canonical runtime routes',
      test_category: category,
      status: misrouted.length === 0 ? 'PASS' : 'NULL',
      drift_classes: misrouted.length > 0
        ? (['AUTHORITYLESS_MUTATION_PATH', 'CLOSURE_INCOMPLETE'] as MutationDriftClass[])
        : [],
      evidence_only: true,
      replay_safe: true,
      non_authoritative: true,
    },
    {
      test_id: 'MEXT_004',
      test_name: 'No duplicate authoritative surface ownership — each table owned by exactly one surface',
      test_category: category,
      status: ownership.status === 'UNIQUE' ? 'PASS' : 'NULL',
      drift_classes: ownership.drift_classes,
      evidence_only: true,
      replay_safe: ownership.replay_safe,
      non_authoritative: true,
    },
  ]
}
