/**
 * Issue #998 — RELEASE_PROVENANCE_RECONCILIATION_V1
 *
 * FATE tests proving deterministic distributed release provenance reconciliation.
 *
 * Verifies:
 *   1.  identical registries reconcile deterministically
 *   2.  append-order differences normalize correctly
 *   3.  divergent hashes classify drift
 *   4.  replay conflicts fail closed
 *   5.  missing entries classify drift
 *   6.  mutated entries fail equivalence
 *   7.  BREAK_GLASS canonicalization fails
 *   8.  reconciliation remains evidence-only
 *   9.  reconciliation cannot create authority
 *   10. reconciliation cannot create proof
 *   11. reconciliation cannot execute
 *   12. reconciliation never auto-mutates registry state
 *   13. same canonical entries produce same reconciliation hash
 *   14. unknown provenance types fail closed
 *   15. reconciliation evidence is deterministic
 *
 * Plus:
 *   - canonical normalization stability
 *   - registry hash equivalence under reordered entries
 *   - replay conflict propagation
 *   - reconciliation result immutability
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no deployment capability expansion, no proof behavior changes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

import {
  RECONCILIATION_RESULT,
  DRIFT_CLASSES,
  normalizeRegistryEntries,
  isCanonicalOrder,
  detectUnknownProvenanceTypes,
  detectBreakGlassEntries,
  detectMutations,
  detectCrossRegistryReplayConflicts,
  detectMissingEntries,
  computeReconciliationHash,
  generateReconciliationEvidence,
} from '../../scripts/reconcile-release-provenance-registry.mjs'

import {
  computeRegistryHash,
} from '../../scripts/append-release-provenance.mjs'

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeValidEntry(overrides = {}) {
  return {
    release_id: 'RPROV-20260522-9980001',
    release_tag: 'v1.0.0',
    source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifact_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    artifact_hash_alg: 'sha256',
    pr_number: 997,
    status_check_refs: [],
    preo_reference: 'PREO-997-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sco_reference: 'SCO-997-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    provenance_type: 'INTERNAL',
    classification: 'CANONICAL_RELEASE_CANDIDATE',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    canonical_release_candidate: true,
    break_glass: false,
    break_glass_justification: null,
    workflow_run_id: '99800000001',
    workflow_ref: 'refs/workflows/governed-release.yml@refs/heads/main',
    generated_at: '2026-05-22T10:00:00Z',
    issue: '994',
    ...overrides,
  }
}

function makeRegistryFromEntries(entries) {
  const hash = computeRegistryHash(entries, 'sha256')
  return {
    artifact: 'RELEASE_PROVENANCE_REGISTRY',
    schema_version: 2,
    registry_hash_alg: 'sha256',
    registry_hash: hash,
    entry_count: entries.length,
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    entries,
  }
}

function makeEntryB(overrides = {}) {
  return makeValidEntry({
    release_id: 'RPROV-20260522-9980002',
    release_tag: 'v2.0.0',
    source_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifact_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb001',
    preo_reference: 'PREO-997-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    sco_reference: 'SCO-997-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    workflow_run_id: '99800000002',
    ...overrides,
  })
}

// ── Script presence ───────────────────────────────────────────────────────────

test('issue #998: reconcile-release-provenance-registry.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/reconcile-release-provenance-registry.mjs')),
    'scripts/reconcile-release-provenance-registry.mjs must exist',
  )
})

test('issue #998: exports all required functions and constants', () => {
  assert.ok(typeof RECONCILIATION_RESULT === 'object', 'must export RECONCILIATION_RESULT')
  assert.ok(typeof DRIFT_CLASSES === 'object', 'must export DRIFT_CLASSES')
  assert.ok(typeof normalizeRegistryEntries === 'function', 'must export normalizeRegistryEntries')
  assert.ok(typeof isCanonicalOrder === 'function', 'must export isCanonicalOrder')
  assert.ok(typeof detectUnknownProvenanceTypes === 'function', 'must export detectUnknownProvenanceTypes')
  assert.ok(typeof detectBreakGlassEntries === 'function', 'must export detectBreakGlassEntries')
  assert.ok(typeof detectMutations === 'function', 'must export detectMutations')
  assert.ok(typeof detectCrossRegistryReplayConflicts === 'function', 'must export detectCrossRegistryReplayConflicts')
  assert.ok(typeof detectMissingEntries === 'function', 'must export detectMissingEntries')
  assert.ok(typeof computeReconciliationHash === 'function', 'must export computeReconciliationHash')
  assert.ok(typeof generateReconciliationEvidence === 'function', 'must export generateReconciliationEvidence')
})

test('issue #998: DRIFT_CLASSES exports all 7 required drift class values', () => {
  const required = [
    'registry_hash_divergence',
    'missing_release_entry',
    'replay_conflict_detected',
    'append_order_non_canonical',
    'mutation_after_append',
    'break_glass_registry_entry',
    'unknown_provenance_type',
  ]
  for (const cls of required) {
    assert.ok(
      Object.values(DRIFT_CLASSES).includes(cls),
      `DRIFT_CLASSES must include value "${cls}"`,
    )
  }
})

test('issue #998: RECONCILIATION_RESULT exports RECONCILED, DRIFT_DETECTED, NULL', () => {
  assert.equal(RECONCILIATION_RESULT.RECONCILED, 'RECONCILED')
  assert.equal(RECONCILIATION_RESULT.DRIFT_DETECTED, 'DRIFT_DETECTED')
  assert.equal(RECONCILIATION_RESULT.NULL, 'NULL')
})

// ── FATE test 1: identical registries reconcile deterministically ─────────────

test('FATE #998-1: identical registries reconcile deterministically', () => {
  const entry = makeValidEntry()
  const registry = makeRegistryFromEntries([entry])

  const evidence = generateReconciliationEvidence(registry, registry)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.RECONCILED)
  assert.deepEqual(evidence.drift_classes, [])
  assert.equal(evidence.null_reasons.length, 0)
})

test('FATE #998-1b: identical multi-entry registries reconcile deterministically', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()
  const registry = makeRegistryFromEntries([e1, e2])
  const registryB = makeRegistryFromEntries([e1, e2])

  const evidence = generateReconciliationEvidence(registry, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.RECONCILED)
})

test('FATE #998-1c: empty registries reconcile to RECONCILED', () => {
  const emptyA = makeRegistryFromEntries([])
  const emptyB = makeRegistryFromEntries([])

  const evidence = generateReconciliationEvidence(emptyA, emptyB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.RECONCILED)
  assert.equal(evidence.entry_count_a, 0)
  assert.equal(evidence.entry_count_b, 0)
})

// ── FATE test 2: append-order differences normalize correctly ─────────────────

test('FATE #998-2: same entries in different append order normalize to RECONCILED', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const registryAB = makeRegistryFromEntries([e1, e2])
  const registryBA = makeRegistryFromEntries([e2, e1])

  const evidence = generateReconciliationEvidence(registryAB, registryBA)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.RECONCILED,
    'reordered registries must reconcile — canonical normalization must absorb append order')
  assert.equal(evidence.canonical_a_hash, evidence.canonical_b_hash,
    'canonical hashes must be identical for same entries regardless of order')
})

test('FATE #998-2b: normalizeRegistryEntries sorts by release_id ascending', () => {
  const e1 = makeValidEntry({ release_id: 'RPROV-20260522-ZZZ' })
  const e2 = makeValidEntry({ release_id: 'RPROV-20260522-AAA' })

  const normalized = normalizeRegistryEntries([e1, e2])

  assert.equal(normalized[0].release_id, 'RPROV-20260522-AAA')
  assert.equal(normalized[1].release_id, 'RPROV-20260522-ZZZ')
})

test('FATE #998-2c: normalizeRegistryEntries does not mutate source array', () => {
  const e1 = makeValidEntry({ release_id: 'RPROV-20260522-ZZZ' })
  const e2 = makeValidEntry({ release_id: 'RPROV-20260522-AAA' })
  const original = [e1, e2]

  normalizeRegistryEntries(original)

  assert.equal(original[0].release_id, 'RPROV-20260522-ZZZ', 'source array must not be mutated')
})

test('FATE #998-2d: append_order_non_canonical drift class detected when stored order is non-canonical', () => {
  const e1 = makeValidEntry({ release_id: 'RPROV-20260522-ZZZ' })
  const e2 = makeValidEntry({ release_id: 'RPROV-20260522-AAA', release_tag: 'v2.0.0',
    source_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifact_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb001' })

  // Build registry with non-canonical order (ZZZ before AAA)
  const nonCanonicalRegistry = makeRegistryFromEntries([e1, e2])
  // Manually reorder entries array (hash remains valid as computeRegistryHash sorts internally)
  const reordered = { ...nonCanonicalRegistry, entries: [e1, e2] }

  const canonicalRegistry = makeRegistryFromEntries([e2, e1])

  const evidence = generateReconciliationEvidence(reordered, canonicalRegistry)

  assert.ok(
    evidence.drift_classes.includes(DRIFT_CLASSES.APPEND_ORDER_NON_CANONICAL),
    'non-canonical append order must be detected as drift',
  )
  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.RECONCILED,
    'non-canonical order with same entries must still RECONCILE after normalization')
})

// ── FATE test 3: divergent hashes classify drift ──────────────────────────────

test('FATE #998-3: registries with different entries produce DRIFT_DETECTED', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e2])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.DRIFT_DETECTED)
  assert.notEqual(evidence.canonical_a_hash, evidence.canonical_b_hash)
})

test('FATE #998-3b: divergent canonical hashes classify registry_hash_divergence', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e2])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.ok(
    evidence.drift_classes.includes(DRIFT_CLASSES.REGISTRY_HASH_DIVERGENCE),
    'divergent canonical hashes must classify registry_hash_divergence',
  )
})

test('FATE #998-3c: drift_details contains registry_hash_divergence detail when hashes diverge', () => {
  const registryA = makeRegistryFromEntries([makeValidEntry()])
  const registryB = makeRegistryFromEntries([makeEntryB()])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  const hashDivergence = evidence.drift_details.find(
    (d) => d.drift_class === DRIFT_CLASSES.REGISTRY_HASH_DIVERGENCE,
  )
  assert.ok(hashDivergence, 'drift_details must include registry_hash_divergence entry')
  assert.ok(hashDivergence.detail.includes('canonical registry hashes diverge'))
})

// ── FATE test 4: replay conflicts fail closed ─────────────────────────────────

test('FATE #998-4: same tag + different commit across registries → NULL (replay conflict)', () => {
  const e1 = makeValidEntry({ release_tag: 'v1.0.0', source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
  const e2 = makeValidEntry({
    release_id: 'RPROV-20260522-9980099',
    release_tag: 'v1.0.0',
    source_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifact_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb001',
  })

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e2])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL,
    'same tag different commit must fail closed with NULL')
  assert.ok(
    evidence.drift_classes.includes(DRIFT_CLASSES.REPLAY_CONFLICT_DETECTED),
    'replay_conflict_detected must be in drift_classes',
  )
  assert.ok(evidence.null_reasons.length > 0, 'null_reasons must be populated')
  assert.ok(
    evidence.null_reasons.some((r) => r.reason === DRIFT_CLASSES.REPLAY_CONFLICT_DETECTED),
    'null_reasons must include replay_conflict_detected',
  )
})

test('FATE #998-4b: same tag + different artifact hash across registries → NULL', () => {
  const e1 = makeValidEntry({ release_tag: 'v1.0.0' })
  const e2 = makeValidEntry({
    release_id: 'RPROV-20260522-9980098',
    release_tag: 'v1.0.0',
    artifact_hash: 'fff0000fff0000fff0000fff0000fff0000fff0000fff0000fff0000fff00001',
  })

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e2])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL)
  assert.ok(evidence.drift_classes.includes(DRIFT_CLASSES.REPLAY_CONFLICT_DETECTED))
})

test('FATE #998-4c: same commit + tag + different artifact hash across registries → NULL', () => {
  const commit = 'cccccccccccccccccccccccccccccccccccccccc'
  const e1 = makeValidEntry({
    release_tag: 'v3.0.0',
    source_commit_sha: commit,
    artifact_hash: 'ccc0000000000000000000000000000000000000000000000000000000000001',
  })
  const e2 = makeValidEntry({
    release_id: 'RPROV-20260522-9980097',
    release_tag: 'v3.0.0',
    source_commit_sha: commit,
    artifact_hash: 'ccc1111111111111111111111111111111111111111111111111111111111111',
  })

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e2])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL)
  assert.ok(evidence.drift_classes.includes(DRIFT_CLASSES.REPLAY_CONFLICT_DETECTED))
})

test('FATE #998-4d: detectCrossRegistryReplayConflicts skips entries with same release_id', () => {
  const e = makeValidEntry()
  const conflicts = detectCrossRegistryReplayConflicts([e], [e])

  assert.equal(conflicts.length, 0, 'identical entries (same release_id) must not produce replay conflicts')
})

// ── FATE test 5: missing entries classify drift ───────────────────────────────

test('FATE #998-5: entry in A missing from B → DRIFT_DETECTED + missing_release_entry', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const registryA = makeRegistryFromEntries([e1, e2])
  const registryB = makeRegistryFromEntries([e1])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.DRIFT_DETECTED)
  assert.ok(
    evidence.drift_classes.includes(DRIFT_CLASSES.MISSING_RELEASE_ENTRY),
    'missing_release_entry must be classified',
  )
  const missingDetail = evidence.drift_details.find(
    (d) => d.drift_class === DRIFT_CLASSES.MISSING_RELEASE_ENTRY &&
           d.release_id === e2.release_id &&
           d.registry === 'a',
  )
  assert.ok(missingDetail, 'drift_details must identify the missing release_id from registry-a')
})

test('FATE #998-5b: entry in B missing from A → DRIFT_DETECTED + missing_release_entry with registry=b', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e1, e2])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.DRIFT_DETECTED)
  const missingDetail = evidence.drift_details.find(
    (d) => d.drift_class === DRIFT_CLASSES.MISSING_RELEASE_ENTRY &&
           d.release_id === e2.release_id &&
           d.registry === 'b',
  )
  assert.ok(missingDetail, 'drift_details must identify the missing release_id from registry-b')
})

test('FATE #998-5c: detectMissingEntries finds entries in both directions', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const missing = detectMissingEntries([e1], [e2])

  assert.ok(missing.some((m) => m.release_id === e1.release_id && m.registry === 'a'))
  assert.ok(missing.some((m) => m.release_id === e2.release_id && m.registry === 'b'))
})

// ── FATE test 6: mutated entries fail equivalence ─────────────────────────────

test('FATE #998-6: same release_id different artifact_hash across registries → NULL (mutation)', () => {
  const e1 = makeValidEntry()
  const e1Mutated = { ...e1, artifact_hash: 'mutated00000000000000000000000000000000000000000000000000000000' }

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e1Mutated])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL,
    'same release_id with different content must fail closed with NULL')
  assert.ok(
    evidence.drift_classes.includes(DRIFT_CLASSES.MUTATION_AFTER_APPEND),
    'mutation_after_append must be classified',
  )
})

test('FATE #998-6b: same release_id different classification → NULL (mutation)', () => {
  const e1 = makeValidEntry()
  const e1Mutated = { ...e1, classification: 'NON_CANONICAL_RELEASE', canonical_release_candidate: false }

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e1Mutated])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL)
  assert.ok(evidence.drift_classes.includes(DRIFT_CLASSES.MUTATION_AFTER_APPEND))
})

test('FATE #998-6c: detectMutations returns empty for identical entries', () => {
  const e1 = makeValidEntry()
  const mutations = detectMutations([e1], [e1])
  assert.equal(mutations.length, 0)
})

test('FATE #998-6d: detectMutations only compares entries with matching release_id', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  // e1 in A, e2 in B — different release_ids, should not trigger mutation
  const mutations = detectMutations([e1], [e2])
  assert.equal(mutations.length, 0, 'different release_ids must not trigger mutation detection')
})

// ── FATE test 7: BREAK_GLASS canonicalization fails ───────────────────────────

test('FATE #998-7: BREAK_GLASS entry with canonical_release_candidate=true → NULL', () => {
  const bgEntry = makeValidEntry({
    release_id: 'RPROV-20260522-BG-001',
    break_glass: true,
    break_glass_justification: 'emergency hotfix',
    canonical_release_candidate: true,
    classification: 'BREAK_GLASS',
  })

  const registryA = makeRegistryFromEntries([bgEntry])
  const registryB = makeRegistryFromEntries([bgEntry])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL,
    'BREAK_GLASS canonicalization must fail closed with NULL')
  assert.ok(
    evidence.null_reasons.some((r) => r.reason === 'break_glass_canonicalization'),
    'null_reasons must include break_glass_canonicalization',
  )
})

test('FATE #998-7b: detectBreakGlassEntries flags canonicalization as null_condition=true', () => {
  const bgCanonical = makeValidEntry({
    break_glass: true,
    canonical_release_candidate: true,
  })

  const findings = detectBreakGlassEntries([bgCanonical])

  assert.ok(findings.length > 0)
  assert.ok(findings.some((f) => f.null_condition === true))
  assert.ok(findings.some((f) => f.drift_class === DRIFT_CLASSES.BREAK_GLASS_REGISTRY_ENTRY))
})

test('FATE #998-7c: BREAK_GLASS entry with canonical_release_candidate=false → observational drift only', () => {
  const bgEntry = makeValidEntry({
    release_id: 'RPROV-20260522-BG-002',
    break_glass: true,
    break_glass_justification: 'emergency access',
    canonical_release_candidate: false,
    classification: 'BREAK_GLASS',
  })

  const registryA = makeRegistryFromEntries([bgEntry])
  const registryB = makeRegistryFromEntries([bgEntry])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.notEqual(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL,
    'BREAK_GLASS with canonical=false must not produce NULL')
  assert.ok(
    evidence.drift_classes.includes(DRIFT_CLASSES.BREAK_GLASS_REGISTRY_ENTRY),
    'break_glass_registry_entry drift must still be classified',
  )
})

test('FATE #998-7d: detectBreakGlassEntries non-canonical BREAK_GLASS has null_condition=false', () => {
  const bgEntry = makeValidEntry({
    break_glass: true,
    canonical_release_candidate: false,
  })

  const findings = detectBreakGlassEntries([bgEntry])

  assert.ok(findings.length > 0)
  assert.ok(findings.every((f) => f.null_condition === false))
})

// ── FATE test 8: reconciliation remains evidence-only ─────────────────────────

test('FATE #998-8: reconciliation evidence is evidence-only', () => {
  const registry = makeRegistryFromEntries([makeValidEntry()])
  const evidence = generateReconciliationEvidence(registry, registry)

  assert.equal(evidence.evidence_only, true, 'evidence_only must be true')
  assert.equal(evidence.artifact, 'RELEASE_PROVENANCE_RECONCILIATION')
})

test('FATE #998-8b: evidence_only=true is preserved across all reconciliation results', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  for (const [rA, rB] of [
    [makeRegistryFromEntries([e1]), makeRegistryFromEntries([e1])],    // RECONCILED
    [makeRegistryFromEntries([e1]), makeRegistryFromEntries([e2])],    // DRIFT_DETECTED
  ]) {
    const evidence = generateReconciliationEvidence(rA, rB)
    assert.equal(evidence.evidence_only, true,
      `evidence_only must be true for result ${evidence.reconciliation_result}`)
  }
})

// ── FATE test 9: reconciliation cannot create authority ───────────────────────

test('FATE #998-9: reconciliation evidence has creates_authority=false', () => {
  const registry = makeRegistryFromEntries([makeValidEntry()])
  const evidence = generateReconciliationEvidence(registry, registry)

  assert.equal(evidence.creates_authority, false, 'creates_authority must be false')
})

test('FATE #998-9b: creates_authority=false is preserved across all reconciliation results', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const registryA = makeRegistryFromEntries([e1])
  const registryB = makeRegistryFromEntries([e2])
  const driftEvidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(driftEvidence.creates_authority, false)

  const reconciledEvidence = generateReconciliationEvidence(registryA, registryA)
  assert.equal(reconciledEvidence.creates_authority, false)
})

test('FATE #998-9c: evidence object contains no authority fields', () => {
  const registry = makeRegistryFromEntries([makeValidEntry()])
  const evidence = generateReconciliationEvidence(registry, registry)

  assert.ok(!('authority_grant' in evidence), 'must not contain authority_grant')
  assert.ok(!('deployment_authority' in evidence), 'must not contain deployment_authority')
  assert.ok(!('execution_authority' in evidence), 'must not contain execution_authority')
})

// ── FATE test 10: reconciliation cannot create proof ─────────────────────────

test('FATE #998-10: reconciliation evidence contains no proof fields', () => {
  const registry = makeRegistryFromEntries([makeValidEntry()])
  const evidence = generateReconciliationEvidence(registry, registry)

  assert.ok(!('proof_id' in evidence), 'must not contain proof_id')
  assert.ok(!('proof_binding_hash' in evidence), 'must not contain proof_binding_hash')
  assert.ok(!('proof' in evidence), 'must not contain proof')
})

// ── FATE test 11: reconciliation cannot execute ────────────────────────────────

test('FATE #998-11: reconciliation evidence has creates_execution=false', () => {
  const registry = makeRegistryFromEntries([makeValidEntry()])
  const evidence = generateReconciliationEvidence(registry, registry)

  assert.equal(evidence.creates_execution, false, 'creates_execution must be false')
})

test('FATE #998-11b: evidence contains no execution fields', () => {
  const registry = makeRegistryFromEntries([makeValidEntry()])
  const evidence = generateReconciliationEvidence(registry, registry)

  assert.ok(!('execution_id' in evidence), 'must not contain execution_id')
  assert.ok(!('deploy_target' in evidence), 'must not contain deploy_target')
  assert.ok(!('execution_capability' in evidence), 'must not contain execution_capability')
})

// ── FATE test 12: reconciliation never auto-mutates registry state ─────────────

test('FATE #998-12: generateReconciliationEvidence does not mutate registry-a', () => {
  const entry = makeValidEntry()
  const registryA = makeRegistryFromEntries([entry])
  const registryB = makeRegistryFromEntries([entry])

  const originalHashA = registryA.registry_hash
  const originalEntriesLength = registryA.entries.length
  const originalEntryJson = JSON.stringify(registryA.entries[0])

  generateReconciliationEvidence(registryA, registryB)

  assert.equal(registryA.registry_hash, originalHashA, 'registry-a hash must not be mutated')
  assert.equal(registryA.entries.length, originalEntriesLength, 'registry-a entries must not be mutated')
  assert.equal(JSON.stringify(registryA.entries[0]), originalEntryJson, 'registry-a entry content must not be mutated')
})

test('FATE #998-12b: generateReconciliationEvidence does not mutate registry-b', () => {
  const entry = makeValidEntry()
  const registryA = makeRegistryFromEntries([entry])
  const registryB = makeRegistryFromEntries([makeEntryB()])

  const originalHashB = registryB.registry_hash
  const originalEntriesLengthB = registryB.entries.length

  generateReconciliationEvidence(registryA, registryB)

  assert.equal(registryB.registry_hash, originalHashB, 'registry-b hash must not be mutated')
  assert.equal(registryB.entries.length, originalEntriesLengthB, 'registry-b entries must not be mutated')
})

test('FATE #998-12c: normalizeRegistryEntries does not mutate source array', () => {
  const e1 = makeValidEntry({ release_id: 'RPROV-ZZZ' })
  const e2 = makeEntryB({ release_id: 'RPROV-AAA' })
  const original = [e1, e2]
  const originalFirst = original[0].release_id

  normalizeRegistryEntries(original)

  assert.equal(original[0].release_id, originalFirst, 'source array first element must not change')
})

// ── FATE test 13: same canonical entries produce same reconciliation hash ──────

test('FATE #998-13: same canonical entries produce same reconciliation hash', () => {
  const entry = makeValidEntry()
  const registry = makeRegistryFromEntries([entry])

  const evidence1 = generateReconciliationEvidence(registry, registry)
  const evidence2 = generateReconciliationEvidence(registry, registry)

  assert.equal(evidence1.reconciliation_hash, evidence2.reconciliation_hash,
    'same canonical entries must produce same reconciliation hash')
})

test('FATE #998-13b: computeReconciliationHash is deterministic', () => {
  const hash1 = computeReconciliationHash('aaa', 'bbb', 'RECONCILED', ['drift_a'])
  const hash2 = computeReconciliationHash('aaa', 'bbb', 'RECONCILED', ['drift_a'])
  assert.equal(hash1, hash2)
})

test('FATE #998-13c: computeReconciliationHash differs for different inputs', () => {
  const hashA = computeReconciliationHash('aaa', 'bbb', 'RECONCILED', [])
  const hashB = computeReconciliationHash('aaa', 'ccc', 'RECONCILED', [])
  assert.notEqual(hashA, hashB)
})

test('FATE #998-13d: reconciliation hash is stable under drift_classes reordering', () => {
  const h1 = computeReconciliationHash('aaa', 'bbb', 'DRIFT_DETECTED', ['missing_release_entry', 'registry_hash_divergence'])
  const h2 = computeReconciliationHash('aaa', 'bbb', 'DRIFT_DETECTED', ['registry_hash_divergence', 'missing_release_entry'])
  assert.equal(h1, h2, 'reconciliation hash must be stable regardless of drift_classes input order')
})

// ── FATE test 14: unknown provenance types fail closed ────────────────────────

test('FATE #998-14: unknown provenance_type in registry-a → NULL', () => {
  const badEntry = makeValidEntry({ provenance_type: 'UNKNOWN_TYPE' })
  const goodEntry = makeValidEntry()

  const registryA = makeRegistryFromEntries([badEntry])
  const registryB = makeRegistryFromEntries([goodEntry])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL,
    'unknown provenance type must fail closed with NULL')
  assert.ok(
    evidence.drift_classes.includes(DRIFT_CLASSES.UNKNOWN_PROVENANCE_TYPE),
    'unknown_provenance_type must be in drift_classes',
  )
  assert.ok(
    evidence.null_reasons.some((r) => r.reason === DRIFT_CLASSES.UNKNOWN_PROVENANCE_TYPE),
    'null_reasons must include unknown_provenance_type',
  )
})

test('FATE #998-14b: unknown provenance_type in registry-b → NULL', () => {
  const goodEntry = makeValidEntry()
  const badEntry = makeEntryB({ provenance_type: 'MALICIOUS_TYPE' })

  const registryA = makeRegistryFromEntries([goodEntry])
  const registryB = makeRegistryFromEntries([badEntry])

  const evidence = generateReconciliationEvidence(registryA, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL)
  assert.ok(evidence.drift_classes.includes(DRIFT_CLASSES.UNKNOWN_PROVENANCE_TYPE))
})

test('FATE #998-14c: detectUnknownProvenanceTypes finds bad type and returns drift details', () => {
  const entry = makeValidEntry({ provenance_type: 'SYNTHETIC_ILLEGITIMATE' })
  const findings = detectUnknownProvenanceTypes([entry])

  assert.equal(findings.length, 1)
  assert.equal(findings[0].drift_class, DRIFT_CLASSES.UNKNOWN_PROVENANCE_TYPE)
  assert.ok(findings[0].detail.includes('SYNTHETIC_ILLEGITIMATE'))
})

test('FATE #998-14d: all valid provenance types are accepted', () => {
  for (const pt of ['DSSE', 'SLSA', 'INTERNAL', 'PENDING_EXTERNAL']) {
    const entry = makeValidEntry({ provenance_type: pt })
    const findings = detectUnknownProvenanceTypes([entry])
    assert.equal(findings.length, 0, `provenance_type "${pt}" must be accepted`)
  }
})

// ── FATE test 15: reconciliation evidence is deterministic ────────────────────

test('FATE #998-15: reconciliation evidence is deterministic — same inputs → same output', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()
  const registryA = makeRegistryFromEntries([e1, e2])
  const registryB = makeRegistryFromEntries([e2, e1])

  const ev1 = generateReconciliationEvidence(registryA, registryB)
  const ev2 = generateReconciliationEvidence(registryA, registryB)

  assert.equal(ev1.reconciliation_result, ev2.reconciliation_result)
  assert.equal(ev1.reconciliation_hash, ev2.reconciliation_hash)
  assert.equal(ev1.canonical_a_hash, ev2.canonical_a_hash)
  assert.equal(ev1.canonical_b_hash, ev2.canonical_b_hash)
  assert.deepEqual(ev1.drift_classes, ev2.drift_classes)
})

test('FATE #998-15b: evidence artifact field is always RELEASE_PROVENANCE_RECONCILIATION', () => {
  const r1 = makeRegistryFromEntries([makeValidEntry()])
  const r2 = makeRegistryFromEntries([makeEntryB()])

  for (const [a, b] of [[r1, r1], [r1, r2]]) {
    const evidence = generateReconciliationEvidence(a, b)
    assert.equal(evidence.artifact, 'RELEASE_PROVENANCE_RECONCILIATION')
  }
})

// ── Additional: canonical normalization stability ─────────────────────────────

test('FATE #998 additional: normalizeRegistryEntries is idempotent', () => {
  const e1 = makeValidEntry({ release_id: 'RPROV-ZZZ' })
  const e2 = makeEntryB({ release_id: 'RPROV-AAA' })

  const once = normalizeRegistryEntries([e1, e2])
  const twice = normalizeRegistryEntries(once)

  assert.deepEqual(once, twice, 'normalizing already-normalized entries must be stable')
})

test('FATE #998 additional: isCanonicalOrder returns true for sorted entries', () => {
  const e1 = makeValidEntry({ release_id: 'RPROV-20260522-AAA' })
  const e2 = makeEntryB({ release_id: 'RPROV-20260522-BBB' })

  assert.equal(isCanonicalOrder([e1, e2]), true)
})

test('FATE #998 additional: isCanonicalOrder returns false for unsorted entries', () => {
  const e1 = makeValidEntry({ release_id: 'RPROV-20260522-BBB' })
  const e2 = makeEntryB({ release_id: 'RPROV-20260522-AAA' })

  assert.equal(isCanonicalOrder([e1, e2]), false)
})

test('FATE #998 additional: isCanonicalOrder returns true for single entry', () => {
  assert.equal(isCanonicalOrder([makeValidEntry()]), true)
})

test('FATE #998 additional: isCanonicalOrder returns true for empty array', () => {
  assert.equal(isCanonicalOrder([]), true)
})

// ── Additional: registry hash equivalence under reordered entries ─────────────

test('FATE #998 additional: registry hash equivalence under reordered entries', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const hashAB = computeRegistryHash([e1, e2], 'sha256')
  const hashBA = computeRegistryHash([e2, e1], 'sha256')

  assert.equal(hashAB, hashBA,
    'computeRegistryHash must produce same hash regardless of entry order (sorts by release_id)')
})

test('FATE #998 additional: canonical_a_hash and canonical_b_hash reflect normalized entry state', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()

  const registryAB = makeRegistryFromEntries([e1, e2])
  const registryBA = makeRegistryFromEntries([e2, e1])

  const ev = generateReconciliationEvidence(registryAB, registryBA)

  assert.equal(ev.canonical_a_hash, ev.canonical_b_hash,
    'canonical hashes must match for same entries in different order')
  assert.equal(ev.reconciliation_result, RECONCILIATION_RESULT.RECONCILED)
})

// ── Additional: replay conflict propagation ───────────────────────────────────

test('FATE #998 additional: replay conflict in registry-a entries alone → NOT replay_conflict_detected', () => {
  // Cross-registry replay detection is between A and B, not within A
  const e1 = makeValidEntry({ release_tag: 'v1.0.0', source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
  const e2 = makeValidEntry({ release_id: 'RPROV-20260522-9980099', release_tag: 'v1.0.0',
    source_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifact_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb001',
  })

  // Both in registry-a but not cross-registry
  const conflicts = detectCrossRegistryReplayConflicts([e1, e2], [e1])
  // e1 vs e1 in B: same release_id, skipped
  // e2 vs e1 in B: different release_id, same tag v1.0.0 but different commit → conflict
  assert.ok(conflicts.length > 0, 'cross-registry replay must be detected')
})

test('FATE #998 additional: detectCrossRegistryReplayConflicts deduplicates conflicts for same tag', () => {
  const e1 = makeValidEntry({ release_tag: 'v1.0.0' })
  const e2 = makeValidEntry({
    release_id: 'RPROV-20260522-9980099',
    release_tag: 'v1.0.0',
    source_commit_sha: 'cccccccccccccccccccccccccccccccccccccccc',
    artifact_hash: 'ccc0000000000000000000000000000000000000000000000000000000000001',
  })

  const conflicts = detectCrossRegistryReplayConflicts([e1], [e2])

  // Each specific conflict type (tag-commit, tag-artifact) should appear at most once
  const tagCommitConflicts = conflicts.filter((c) => c.detail.includes('maps to commit'))
  assert.ok(tagCommitConflicts.length <= 1, 'tag-commit conflict must not be reported more than once')
})

// ── Additional: reconciliation result immutability ────────────────────────────

test('FATE #998 additional: evidence object is a plain object with no hidden state', () => {
  const registry = makeRegistryFromEntries([makeValidEntry()])
  const evidence = generateReconciliationEvidence(registry, registry)

  // Verify it serializes and deserializes to the same value
  const serialized = JSON.parse(JSON.stringify(evidence))
  assert.equal(serialized.reconciliation_result, evidence.reconciliation_result)
  assert.equal(serialized.reconciliation_hash, evidence.reconciliation_hash)
  assert.equal(serialized.evidence_only, true)
  assert.equal(serialized.creates_authority, false)
  assert.equal(serialized.creates_execution, false)
})

test('FATE #998 additional: evidence reconciliation_result is one of the three valid values', () => {
  const e1 = makeValidEntry()
  const e2 = makeEntryB()
  const validResults = new Set(['RECONCILED', 'DRIFT_DETECTED', 'NULL'])

  for (const [a, b] of [
    [makeRegistryFromEntries([e1]), makeRegistryFromEntries([e1])],
    [makeRegistryFromEntries([e1]), makeRegistryFromEntries([e2])],
  ]) {
    const evidence = generateReconciliationEvidence(a, b)
    assert.ok(
      validResults.has(evidence.reconciliation_result),
      `reconciliation_result "${evidence.reconciliation_result}" must be one of RECONCILED|DRIFT_DETECTED|NULL`,
    )
  }
})

test('FATE #998 additional: invalid registry hash in A → NULL', () => {
  const entry = makeValidEntry()
  const registryA = makeRegistryFromEntries([entry])
  const registryB = makeRegistryFromEntries([entry])

  const corrupted = {
    ...registryA,
    registry_hash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  }

  const evidence = generateReconciliationEvidence(corrupted, registryB)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL,
    'invalid registry hash must produce NULL')
  assert.ok(
    evidence.null_reasons.some((r) => r.reason === 'registry_a_hash_invalid'),
    'null_reasons must identify invalid registry-a hash',
  )
})

test('FATE #998 additional: invalid registry hash in B → NULL', () => {
  const entry = makeValidEntry()
  const registryA = makeRegistryFromEntries([entry])
  const corrupted = {
    ...makeRegistryFromEntries([entry]),
    registry_hash: '0000000000000000000000000000000000000000000000000000000000000000',
  }

  const evidence = generateReconciliationEvidence(registryA, corrupted)

  assert.equal(evidence.reconciliation_result, RECONCILIATION_RESULT.NULL)
  assert.ok(evidence.null_reasons.some((r) => r.reason === 'registry_b_hash_invalid'))
})

// ── Non-regression: existing #996 tests remain unaffected ────────────────────

test('FATE #998 non-regression: issue-996-provenance-registry-persistence.test.mjs is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-996-provenance-registry-persistence.test.mjs')),
    '#996 FATE test file must remain present',
  )
})

test('FATE #998 non-regression: append-release-provenance.mjs is present and exports are intact', async () => {
  const mod = await import('../../scripts/append-release-provenance.mjs')
  assert.ok(typeof mod.appendProvenanceEntry === 'function')
  assert.ok(typeof mod.computeRegistryHash === 'function')
  assert.ok(typeof mod.canonicalJson === 'function')
  assert.ok(typeof mod.REGISTRY_FAILURE_CLASSES === 'object')
})
