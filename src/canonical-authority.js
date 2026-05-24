import { normalize, canonicalize, hashCanonical } from './canonical.js'

// ── Canonical Drift Taxonomy ────────────────────────────────────────────────
export const CANONICAL_DRIFT = Object.freeze({
  SERIALIZATION_DIVERGENCE: 'SERIALIZATION_DIVERGENCE',
  HASH_SURFACE_DUPLICATION: 'HASH_SURFACE_DUPLICATION',
  REPLAY_UNSAFE_SERIALIZATION: 'REPLAY_UNSAFE_SERIALIZATION',
  TOPOLOGY_CHECKPOINT_MISMATCH: 'TOPOLOGY_CHECKPOINT_MISMATCH',
  RECONCILIATION_PARITY_FAILURE: 'RECONCILIATION_PARITY_FAILURE',
  FOREIGN_HASH_AUTHORITY: 'FOREIGN_HASH_AUTHORITY',
  PROOF_EQUIVALENCE_DRIFT: 'PROOF_EQUIVALENCE_DRIFT',
  FEDERATION_EQUIVALENCE_COLLAPSE: 'FEDERATION_EQUIVALENCE_COLLAPSE',
  MUTATION_AFTER_VALIDATION: 'MUTATION_AFTER_VALIDATION',
  CANONICAL_FORM_WIDENING: 'CANONICAL_FORM_WIDENING',
})

// ── Canonicalization Authority Inventory ───────────────────────────────────
// Enumerates every module permitted to produce canonical forms or hashes.
// Only src/canonical.js carries authority: true. All others delegate to it.
export const CANONICAL_AUTHORITY_INVENTORY = Object.freeze([
  Object.freeze({ module: 'src/canonical.js', exports: Object.freeze(['normalize', 'canonicalize', 'sha256Hex', 'hashCanonical']), authority: true, delegates_to: null }),
  Object.freeze({ module: 'runtime/reconciliation/topology-reconciliation-engine.js', exports: Object.freeze(['canonicalize', 'hashCanonical']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'runtime/legitimacy/validators/schema-validator.js', exports: Object.freeze(['canonicalize', 'hashCanonicalObject']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'src/lib/legitimacy-governance.js', exports: Object.freeze(['fingerprintObject']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'src/lib/skill-provenance-revocation.js', exports: Object.freeze(['canonicalizeRevocationLineage', 'hashRevocationLineage']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'src/lib/aeo-governance.ts', exports: Object.freeze(['canonicalize']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'runtime/recursive_drift_propagation_engine.mjs', exports: Object.freeze(['canonicalize', 'hashCanonical']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'runtime/federated_sovereignty_drift_coordinator.mjs', exports: Object.freeze(['canonicalize', 'hashCanonical']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'runtime/portable_legitimacy_bundle_generator.mjs', exports: Object.freeze(['canonicalize', 'hashCanonical']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'runtime/surface_inventory_reconciler.mjs', exports: Object.freeze(['canonicalizeSurface']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'runtime/continuous_reconciliation_orchestrator.mjs', exports: Object.freeze(['deterministicCheckpoint']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'runtime/topology_lineage_registry.mjs', exports: Object.freeze(['deterministicLineageHash']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'runtime/recursive_quarantine_orchestrator.mjs', exports: Object.freeze(['deterministicQuarantineHash']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'src/continuity-lineage-closure-hardening.ts', exports: Object.freeze(['computeClosureTopologyHash', 'traverseContinuityAncestry', 'enforceLineageFreshnessBarrier', 'collapseOrphanedSubtrees', 'auditLineageEquivalence', 'computeLineageRepairDiagnostics', 'validateLineageReconstructability', 'classifyLineageDrift', 'verifyDistributedContinuityLineageClosure']), authority: false, delegates_to: 'src/canonical.js' }),
  Object.freeze({ module: 'src/recursive-revocation-propagation.ts', exports: Object.freeze(['computeRevocationTopologyHash', 'traverseDescendantRevocation', 'verifyRevocationPropagationCompleteness', 'enforceStaleLineageCollapse', 'reconstructRevocationChronology', 'auditRevocationAncestry', 'validateRevokedReplayIneligibility', 'validateRevokedProofContinuity', 'verifyDistributedRevocationConvergence', 'classifyRevocationDrift', 'computeRevocationRepairDiagnostics', 'buildRevocationPropagationAuditSurface', 'propagateRevocationLineage']), authority: false, delegates_to: 'src/canonical.js' }),
])

// ── Duplicate Serialization Surface Detection ──────────────────────────────
// Detects surfaces whose canonical hash collides — indicating identical
// canonical form from distinct inputs (a legitimacy widening risk).
export function detectDuplicateSerializationSurfaces(surfaces) {
  if (!Array.isArray(surfaces)) {
    return Object.freeze({ duplicates: Object.freeze([]), status: 'NULL', drift_class: CANONICAL_DRIFT.SERIALIZATION_DIVERGENCE, fail_closed: true, replay_safe: true })
  }
  const seen = new Map()
  const duplicates = []
  for (const surface of surfaces) {
    const key = hashCanonical(surface)
    if (seen.has(key)) {
      duplicates.push(Object.freeze({ canonical_hash: key, surfaces: Object.freeze([seen.get(key), surface]) }))
    } else {
      seen.set(key, surface)
    }
  }
  const hasDuplicates = duplicates.length > 0
  return Object.freeze({
    duplicates: Object.freeze(duplicates),
    status: hasDuplicates ? 'NULL' : 'VALID',
    drift_class: hasDuplicates ? CANONICAL_DRIFT.HASH_SURFACE_DUPLICATION : null,
    fail_closed: hasDuplicates,
    replay_safe: true,
  })
}

// ── Deterministic Serialization Parity Validation ──────────────────────────
// Validates that two values produce identical canonical strings, confirming
// that all serialization paths converge on the same representation.
export function validateSerializationParity(a, b) {
  const canonA = canonicalize(a)
  const canonB = canonicalize(b)
  const equivalent = canonA === canonB
  return Object.freeze({
    equivalent,
    canonical_a: canonA,
    canonical_b: canonB,
    drift_class: equivalent ? null : CANONICAL_DRIFT.SERIALIZATION_DIVERGENCE,
    fail_closed: !equivalent,
    replay_safe: true,
    deterministic: true,
  })
}

// ── Canonical Equivalence Verification ────────────────────────────────────
// Compares two values by canonical hash. Fail-closed: non-equivalent
// values yield a NULL legitimacy result, never a widened acceptance.
export function verifyCanonicalEquivalence(a, b) {
  const hashA = hashCanonical(a)
  const hashB = hashCanonical(b)
  const equivalent = hashA === hashB
  return Object.freeze({
    equivalent,
    hash_a: hashA,
    hash_b: hashB,
    status: equivalent ? 'VALID' : 'NULL',
    drift_class: equivalent ? null : CANONICAL_DRIFT.SERIALIZATION_DIVERGENCE,
    fail_closed: !equivalent,
    deterministic: true,
    replay_safe: true,
  })
}

// ── Centralized Hash Authority Enforcement ─────────────────────────────────
// Verifies that a value's canonical hash matches the expected hash, enforcing
// that only src/canonical.js is the authoritative hash source.
export function enforceHashAuthority(value, expectedHash) {
  if (typeof expectedHash !== 'string' || expectedHash.length !== 64) {
    return Object.freeze({ valid: false, drift_class: CANONICAL_DRIFT.FOREIGN_HASH_AUTHORITY, fail_closed: true, authority: 'src/canonical.js' })
  }
  const computed = hashCanonical(value)
  const valid = computed === expectedHash
  return Object.freeze({
    valid,
    computed_hash: computed,
    expected_hash: expectedHash,
    status: valid ? 'VALID' : 'NULL',
    drift_class: valid ? null : CANONICAL_DRIFT.SERIALIZATION_DIVERGENCE,
    fail_closed: !valid,
    authority: 'src/canonical.js',
    replay_safe: true,
  })
}

// ── Reconciliation Serialization Equivalence Auditing ─────────────────────
// Audits an array of reconciliation results to confirm they all normalize
// to the same canonical hash, preserving distributed reconciliation determinism.
export function auditReconciliationSerializationEquivalence(reconciliations) {
  if (!Array.isArray(reconciliations) || reconciliations.length === 0) {
    return Object.freeze({ equivalent: false, status: 'NULL', drift_class: CANONICAL_DRIFT.RECONCILIATION_PARITY_FAILURE, fail_closed: true, replay_safe: true })
  }
  const hashes = reconciliations.map((r) => hashCanonical(normalize(r)))
  const referenceHash = hashes[0]
  const divergentCount = hashes.filter((h) => h !== referenceHash).length
  const equivalent = divergentCount === 0
  return Object.freeze({
    equivalent,
    reference_hash: referenceHash,
    hashes: Object.freeze(hashes),
    divergent_count: divergentCount,
    status: equivalent ? 'VALID' : 'NULL',
    drift_class: equivalent ? null : CANONICAL_DRIFT.RECONCILIATION_PARITY_FAILURE,
    fail_closed: !equivalent,
    replay_safe: true,
    deterministic: true,
  })
}

// ── Topology Checkpoint Equivalence Validation ─────────────────────────────
// Validates that two topology checkpoints are canonically equivalent,
// confirming topology-visible serialization stability across reconciliation.
export function validateTopologyCheckpointEquivalence(checkpointA, checkpointB) {
  if (checkpointA == null || checkpointB == null) {
    return Object.freeze({ equivalent: false, status: 'NULL', drift_class: CANONICAL_DRIFT.TOPOLOGY_CHECKPOINT_MISMATCH, fail_closed: true, topology_visible: true, replay_safe: true })
  }
  const hashA = hashCanonical(normalize(checkpointA))
  const hashB = hashCanonical(normalize(checkpointB))
  const equivalent = hashA === hashB
  return Object.freeze({
    equivalent,
    hash_a: hashA,
    hash_b: hashB,
    status: equivalent ? 'VALID' : 'NULL',
    drift_class: equivalent ? null : CANONICAL_DRIFT.TOPOLOGY_CHECKPOINT_MISMATCH,
    fail_closed: !equivalent,
    replay_safe: true,
    topology_visible: true,
  })
}

// ── Replay Parity Validation ───────────────────────────────────────────────
// Confirms that two replay-boundary serialization surfaces produce the same
// canonical hash, preserving replay-safe hashing semantics.
export function validateReplayParity(replayA, replayB) {
  if (replayA == null || replayB == null) {
    return Object.freeze({ parity: false, status: 'NULL', drift_class: CANONICAL_DRIFT.REPLAY_UNSAFE_SERIALIZATION, fail_closed: true, replay_safe: true })
  }
  const hashA = hashCanonical(normalize(replayA))
  const hashB = hashCanonical(normalize(replayB))
  const parity = hashA === hashB
  return Object.freeze({
    parity,
    hash_a: hashA,
    hash_b: hashB,
    status: parity ? 'VALID' : 'NULL',
    drift_class: parity ? null : CANONICAL_DRIFT.REPLAY_UNSAFE_SERIALIZATION,
    fail_closed: !parity,
    replay_safe: true,
    deterministic: true,
  })
}

// ── Proof Equivalence Across Reconciliation Paths ─────────────────────────
// Verifies that all proof objects in a reconciliation set hash identically,
// preserving proof equivalence across all reconciliation paths.
export function verifyProofEquivalence(proofs) {
  if (!Array.isArray(proofs) || proofs.length < 2) {
    return Object.freeze({ equivalent: false, status: 'NULL', drift_class: CANONICAL_DRIFT.PROOF_EQUIVALENCE_DRIFT, fail_closed: true, replay_safe: true })
  }
  const hashes = proofs.map((p) => hashCanonical(normalize(p)))
  const referenceHash = hashes[0]
  const allMatch = hashes.every((h) => h === referenceHash)
  return Object.freeze({
    equivalent: allMatch,
    reference_hash: referenceHash,
    hashes: Object.freeze(hashes),
    status: allMatch ? 'VALID' : 'NULL',
    drift_class: allMatch ? null : CANONICAL_DRIFT.PROOF_EQUIVALENCE_DRIFT,
    fail_closed: !allMatch,
    replay_safe: true,
  })
}

// ── Federation Equivalence Semantics ──────────────────────────────────────
// Verifies that local and remote runtime representations are canonically
// equivalent, preserving federation equivalence semantics.
export function verifyFederationEquivalence(localRuntime, remoteRuntime) {
  if (localRuntime == null || remoteRuntime == null) {
    return Object.freeze({ equivalent: false, status: 'NULL', drift_class: CANONICAL_DRIFT.FEDERATION_EQUIVALENCE_COLLAPSE, fail_closed: true, topology_visible: true, replay_safe: true })
  }
  const localHash = hashCanonical(normalize(localRuntime))
  const remoteHash = hashCanonical(normalize(remoteRuntime))
  const equivalent = localHash === remoteHash
  return Object.freeze({
    equivalent,
    local_hash: localHash,
    remote_hash: remoteHash,
    status: equivalent ? 'VALID' : 'NULL',
    drift_class: equivalent ? null : CANONICAL_DRIFT.FEDERATION_EQUIVALENCE_COLLAPSE,
    fail_closed: !equivalent,
    replay_safe: true,
    topology_visible: true,
  })
}

// ── Authority Inventory Lookup ─────────────────────────────────────────────
// Returns the inventory entry for a given module path, or null if the module
// is not a registered canonicalization surface.
export function lookupCanonicalAuthority(modulePath) {
  return CANONICAL_AUTHORITY_INVENTORY.find((entry) => entry.module === modulePath) ?? null
}

// ── Inventory Conformance Check ────────────────────────────────────────────
// Verifies that exactly one entry in the inventory carries authority: true,
// and that all other entries delegate to it. Fail-closed on any violation.
export function verifyAuthorityInventoryConformance() {
  const authoritative = CANONICAL_AUTHORITY_INVENTORY.filter((e) => e.authority)
  if (authoritative.length !== 1 || authoritative[0].module !== 'src/canonical.js') {
    return Object.freeze({ conformant: false, status: 'NULL', drift_class: CANONICAL_DRIFT.FOREIGN_HASH_AUTHORITY, fail_closed: true })
  }
  const nonDelegating = CANONICAL_AUTHORITY_INVENTORY.filter((e) => !e.authority && e.delegates_to !== 'src/canonical.js')
  if (nonDelegating.length > 0) {
    return Object.freeze({ conformant: false, status: 'NULL', non_delegating: Object.freeze(nonDelegating.map((e) => e.module)), drift_class: CANONICAL_DRIFT.FOREIGN_HASH_AUTHORITY, fail_closed: true })
  }
  return Object.freeze({ conformant: true, status: 'VALID', authority_module: 'src/canonical.js', registered_surfaces: CANONICAL_AUTHORITY_INVENTORY.length, fail_closed: false })
}
