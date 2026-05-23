/**
 * tests/issue-1039-legitimacy-conflict-arbitration.test.mjs
 * Issue #1039 — Bounded Legitimacy Conflict Arbitration
 *
 * FATE tests proving deterministic evidence-only conflict arbitration for
 * distributed legitimacy disagreement.
 *
 * Verifies:
 *   1.  equivalent legitimacy states return CONFLICT_NONE
 *   2.  topology drift returns CONFLICT_REQUIRES_RECONCILIATION
 *   3.  replay ambiguity returns CONFLICT_REQUIRES_HUMAN_REVIEW
 *   4.  irreconcilable lineage divergence returns CONFLICT_UNRESOLVABLE
 *   5.  malformed conflict object returns NULL
 *   6.  missing lineage returns NULL
 *   7.  invalid conflict hash returns NULL
 *   8.  authority attempt returns NULL
 *   9.  execution attempt returns NULL
 *   10. proof attempt returns NULL
 *   11. registry mutation returns NULL
 *   12. implicit priority returns NULL
 *   13. break_glass normalization returns NULL
 *   14. arbitration output remains evidence_only
 *   15. arbitration creates_authority false
 *   16. arbitration creates_execution false
 *   17. arbitration creates_proof false
 *   18. arbitration mutates_registry false
 *   19. telemetry remains read_only/evidence_only
 *   20. telemetry cannot create authority
 *   21. telemetry cannot execute
 *   22. telemetry cannot create proof
 *   23. telemetry cannot mutate registries
 *   24. same conflict state produces same hash
 *   25. reordered arbitration_classes preserve hash stability
 *   26. reordered lineage_inputs preserve hash stability
 *   27. reordered proof_inputs preserve hash stability
 *   28. reordered surfaces preserve hash stability
 *   29. conflict hash excludes itself
 *   30. conflict arbitration cannot overwrite legitimacy state
 *   31. arbitration cannot silently resolve stale authority
 *   32. arbitration cannot normalize replay ambiguity
 *   33. arbitration cannot repair topology
 *   34. arbitration cannot rewrite lineage
 *   35. arbitration cannot imply execution permission
 *   36. arbitration cannot imply synchronization
 *   37. conflict telemetry cannot convert disagreement into authority
 *   38. fail-closed malformed inputs return NULL not throw
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no execution capability expansion, no proof behavior changes,
 * no topology repair, no registry mutation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LEGITIMACY_CONFLICT_RESULTS,
  LEGITIMACY_CONFLICT_CLASSES,
  CONFLICT_SEVERITY_LEVELS,
  classifyLegitimacyConflict,
  arbitrateLegitimacyConflict,
  computeLegitimacyConflictHash,
  computeArbitrationHash,
  validateConflictBoundary,
  readConflictTelemetry,
} from '../src/legitimacy-conflict-arbitration.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_CONFLICT = {
  conflict_id: 'conflict-test-001',
  conflict_type: 'legitimacy_state_disagreement',
  surfaces: ['deploy', 'rollback'],
  lineage_inputs: ['lineage-hash-a-001', 'lineage-hash-b-001'],
  proof_inputs: [],
  causal_inputs: [],
}

// ── Constants coverage ────────────────────────────────────────────────────────

test('LEGITIMACY_CONFLICT_RESULTS exports all required result values', () => {
  assert.equal(LEGITIMACY_CONFLICT_RESULTS.CONFLICT_NONE, 'CONFLICT_NONE')
  assert.equal(LEGITIMACY_CONFLICT_RESULTS.CONFLICT_OBSERVED, 'CONFLICT_OBSERVED')
  assert.equal(
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_RECONCILIATION,
    'CONFLICT_REQUIRES_RECONCILIATION',
  )
  assert.equal(
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_HUMAN_REVIEW,
    'CONFLICT_REQUIRES_HUMAN_REVIEW',
  )
  assert.equal(LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE, 'CONFLICT_UNRESOLVABLE')
  assert.equal(LEGITIMACY_CONFLICT_RESULTS.NULL, 'NULL')
})

test('CONFLICT_SEVERITY_LEVELS exports LOW, MEDIUM, HIGH, CRITICAL', () => {
  assert.equal(CONFLICT_SEVERITY_LEVELS.LOW, 'LOW')
  assert.equal(CONFLICT_SEVERITY_LEVELS.MEDIUM, 'MEDIUM')
  assert.equal(CONFLICT_SEVERITY_LEVELS.HIGH, 'HIGH')
  assert.equal(CONFLICT_SEVERITY_LEVELS.CRITICAL, 'CRITICAL')
})

test('LEGITIMACY_CONFLICT_CLASSES exports all 20 required class values', () => {
  const values = Object.values(LEGITIMACY_CONFLICT_CLASSES)
  const required = [
    'legitimacy_conflict_none',
    'legitimacy_conflict_observed',
    'legitimacy_conflict_reconciliation_required',
    'legitimacy_conflict_human_review_required',
    'legitimacy_conflict_unresolvable',
    'legitimacy_conflict_lineage_divergence',
    'legitimacy_conflict_proof_divergence',
    'legitimacy_conflict_registry_divergence',
    'legitimacy_conflict_replay_ambiguity',
    'legitimacy_conflict_topology_drift',
    'legitimacy_conflict_authority_attempt',
    'legitimacy_conflict_execution_attempt',
    'legitimacy_conflict_proof_attempt',
    'legitimacy_conflict_registry_mutation',
    'legitimacy_conflict_implicit_priority_forbidden',
    'legitimacy_conflict_break_glass_normalization',
    'legitimacy_conflict_boundary_violation',
    'legitimacy_conflict_hash_invalid',
    'legitimacy_conflict_missing_lineage',
    'legitimacy_conflict_causal_ambiguity',
  ]
  for (const cls of required) {
    assert.ok(values.includes(cls), `Missing class: ${cls}`)
  }
})

// ── FATE Test 1: equivalent legitimacy states return CONFLICT_NONE ────────────

test('1. equivalent legitimacy states return CONFLICT_NONE', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_NONE)
  assert.ok(
    result.arbitration_classes.includes('legitimacy_conflict_none'),
    'Must include legitimacy_conflict_none class',
  )
  assert.equal(result.severity, CONFLICT_SEVERITY_LEVELS.LOW)
  assert.equal(result.reconciliation_required, false)
  assert.equal(result.human_review_required, false)
  assert.equal(result.topology_conflict_detected, false)
  assert.equal(result.replay_sensitive, false)
  assert.equal(result.artifact, 'LEGITIMACY_CONFLICT_ARBITRATION')
})

test('1b. classifyLegitimacyConflict returns CONFLICT_NONE for clean input', () => {
  const cls = classifyLegitimacyConflict(VALID_CONFLICT)
  assert.equal(cls.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_NONE)
  assert.equal(cls.severity, CONFLICT_SEVERITY_LEVELS.LOW)
})

// ── FATE Test 2: topology drift returns CONFLICT_REQUIRES_RECONCILIATION ──────

test('2. topology drift returns CONFLICT_REQUIRES_RECONCILIATION', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    topology_drift_detected: true,
  })
  assert.equal(
    result.arbitration_result,
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_RECONCILIATION,
  )
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_topology_drift'))
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_reconciliation_required'))
  assert.equal(result.reconciliation_required, true)
  assert.equal(result.topology_conflict_detected, true)
  assert.equal(result.severity, CONFLICT_SEVERITY_LEVELS.HIGH)
})

test('2b. lineage_divergence_detected returns CONFLICT_REQUIRES_RECONCILIATION', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    lineage_divergence_detected: true,
  })
  assert.equal(
    result.arbitration_result,
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_RECONCILIATION,
  )
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_lineage_divergence'))
  assert.equal(result.reconciliation_required, true)
})

// ── FATE Test 3: replay ambiguity returns CONFLICT_REQUIRES_HUMAN_REVIEW ──────

test('3. replay ambiguity returns CONFLICT_REQUIRES_HUMAN_REVIEW', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    replay_ambiguity_detected: true,
  })
  assert.equal(
    result.arbitration_result,
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_HUMAN_REVIEW,
  )
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_replay_ambiguity'))
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_human_review_required'))
  assert.equal(result.human_review_required, true)
  assert.equal(result.replay_sensitive, true)
  assert.equal(result.severity, CONFLICT_SEVERITY_LEVELS.HIGH)
})

test('3b. causal_ambiguity_detected returns CONFLICT_REQUIRES_HUMAN_REVIEW', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    causal_ambiguity_detected: true,
  })
  assert.equal(
    result.arbitration_result,
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_HUMAN_REVIEW,
  )
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_causal_ambiguity'))
  assert.equal(result.human_review_required, true)
})

// ── FATE Test 4: irreconcilable lineage divergence returns CONFLICT_UNRESOLVABLE

test('4. irreconcilable lineage divergence returns CONFLICT_UNRESOLVABLE', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    lineage_divergence_detected: true,
    topology_reconstructable: false,
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_unresolvable'))
  assert.equal(result.severity, CONFLICT_SEVERITY_LEVELS.CRITICAL)
  assert.equal(result.reconciliation_required, true)
  assert.equal(result.human_review_required, true)
  assert.equal(result.topology_conflict_detected, true)
})

test('4b. topology_reconstructable: false alone returns CONFLICT_UNRESOLVABLE', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    topology_reconstructable: false,
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE)
  assert.equal(result.severity, CONFLICT_SEVERITY_LEVELS.CRITICAL)
})

// ── FATE Test 5: malformed conflict object returns NULL ───────────────────────

test('5. malformed conflict object returns NULL', () => {
  const malformed = [null, undefined, 42, 'string', true, [], {}]
  for (const m of malformed) {
    const result = arbitrateLegitimacyConflict(m)
    assert.equal(
      result.arbitration_result,
      LEGITIMACY_CONFLICT_RESULTS.NULL,
      `Expected NULL for ${JSON.stringify(m)}`,
    )
    assert.equal(result.artifact, 'LEGITIMACY_CONFLICT_ARBITRATION')
    assert.equal(result.evidence_only, true)
  }
})

test('5b. missing conflict_id returns NULL', () => {
  const { conflict_id: _omit, ...noId } = VALID_CONFLICT
  const result = arbitrateLegitimacyConflict(noId)
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
})

test('5c. missing conflict_type returns NULL', () => {
  const { conflict_type: _omit, ...noType } = VALID_CONFLICT
  const result = arbitrateLegitimacyConflict(noType)
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
})

test('5d. empty conflict_id returns NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, conflict_id: '' })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
})

test('5e. empty conflict_type returns NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, conflict_type: '' })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
})

// ── FATE Test 6: missing lineage returns NULL ─────────────────────────────────

test('6. missing lineage returns NULL', () => {
  const { lineage_inputs: _omit, ...noLineage } = VALID_CONFLICT
  const result = arbitrateLegitimacyConflict(noLineage)
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(
    result.arbitration_classes.includes('legitimacy_conflict_missing_lineage'),
    'Must include legitimacy_conflict_missing_lineage class',
  )
})

test('6b. null lineage_inputs returns NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, lineage_inputs: null })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_missing_lineage'))
})

test('6c. undefined lineage_inputs returns NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, lineage_inputs: undefined })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_missing_lineage'))
})

// ── FATE Test 7: invalid conflict hash returns NULL ───────────────────────────

test('7. invalid conflict hash in input returns NULL', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    conflict_hash: 'not-a-valid-sha256-hex-string',
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(
    result.arbitration_classes.includes('legitimacy_conflict_hash_invalid'),
    'Must include legitimacy_conflict_hash_invalid class',
  )
})

test('7b. empty string conflict hash returns NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, conflict_hash: '' })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_hash_invalid'))
})

test('7c. partial hex conflict hash returns NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, conflict_hash: 'abc123' })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
})

test('7d. valid sha256 hex conflict hash in input does not return NULL on that basis', () => {
  // A valid 64-char hex hash in the input should not cause NULL (passes hash validation)
  const validHash = 'a'.repeat(64)
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, conflict_hash: validHash })
  // Since no condition flags are set, result should be CONFLICT_NONE not NULL
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_NONE)
})

// ── FATE Test 8: authority attempt returns NULL ───────────────────────────────

test('8. authority attempt returns NULL (creates_authority: true)', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_authority: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_authority_attempt'))
  assert.equal(result.creates_authority, false)
})

test('8b. authority_grant field returns NULL', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    authority_grant: 'grant-id-001',
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_boundary_violation'))
})

test('8c. validateConflictBoundary detects creates_authority', () => {
  const v = validateConflictBoundary({ creates_authority: true })
  assert.equal(v, LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_AUTHORITY_ATTEMPT)
})

// ── FATE Test 9: execution attempt returns NULL ───────────────────────────────

test('9. execution attempt returns NULL (creates_execution: true)', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_execution: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_execution_attempt'))
  assert.equal(result.creates_execution, false)
})

test('9b. execution_token field returns NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, execution_token: 'tok-001' })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_boundary_violation'))
})

test('9c. validateConflictBoundary detects creates_execution', () => {
  const v = validateConflictBoundary({ creates_execution: true })
  assert.equal(v, LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_EXECUTION_ATTEMPT)
})

// ── FATE Test 10: proof attempt returns NULL ──────────────────────────────────

test('10. proof attempt returns NULL (creates_proof: true)', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_proof: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_proof_attempt'))
  assert.equal(result.creates_proof, false)
})

test('10b. proof_signature field returns NULL', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    proof_signature: 'sig-001',
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_boundary_violation'))
})

test('10c. validateConflictBoundary detects creates_proof', () => {
  const v = validateConflictBoundary({ creates_proof: true })
  assert.equal(v, LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_PROOF_ATTEMPT)
})

// ── FATE Test 11: registry mutation returns NULL ──────────────────────────────

test('11. registry mutation returns NULL (mutates_registry: true)', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, mutates_registry: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_registry_mutation'))
  assert.equal(result.mutates_registry, false)
})

test('11b. registry_mutation field returns NULL', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    registry_mutation: 'mutation-001',
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_registry_mutation'))
})

test('11c. validateConflictBoundary detects mutates_registry', () => {
  const v = validateConflictBoundary({ mutates_registry: true })
  assert.equal(v, LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_REGISTRY_MUTATION)
})

// ── FATE Test 12: implicit priority returns NULL ──────────────────────────────

test('12. implicit priority returns NULL (implicit_priority present)', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    implicit_priority: 'surface_a_wins',
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(
    result.arbitration_classes.includes('legitimacy_conflict_implicit_priority_forbidden'),
    'Must include legitimacy_conflict_implicit_priority_forbidden class',
  )
})

test('12b. validateConflictBoundary detects implicit_priority', () => {
  const v = validateConflictBoundary({ implicit_priority: 'deploy_wins' })
  assert.equal(v, LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_IMPLICIT_PRIORITY_FORBIDDEN)
})

test('12c. auto_resolve field returns NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, auto_resolve: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_boundary_violation'))
})

// ── FATE Test 13: break_glass normalization returns NULL ──────────────────────

test('13. break_glass normalization returns NULL', () => {
  for (const flag of ['break_glass', 'is_break_glass', 'break_glass_normalized']) {
    const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, [flag]: true })
    assert.equal(
      result.arbitration_result,
      LEGITIMACY_CONFLICT_RESULTS.NULL,
      `Expected NULL for ${flag}`,
    )
    assert.ok(
      result.arbitration_classes.includes('legitimacy_conflict_break_glass_normalization'),
      `Expected break_glass class for ${flag}`,
    )
  }
})

test('13b. validateConflictBoundary detects all break_glass variants', () => {
  for (const flag of ['break_glass', 'is_break_glass', 'break_glass_normalized']) {
    const v = validateConflictBoundary({ [flag]: true })
    assert.equal(
      v,
      LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BREAK_GLASS_NORMALIZATION,
      `Expected break_glass normalization class for ${flag}`,
    )
  }
})

// ── FATE Test 14: arbitration output remains evidence_only ───────────────────

test('14. arbitration output remains evidence_only (all result types)', () => {
  // CONFLICT_NONE
  assert.equal(arbitrateLegitimacyConflict(VALID_CONFLICT).evidence_only, true)
  // CONFLICT_OBSERVED
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, proof_divergence_detected: true }).evidence_only,
    true,
  )
  // CONFLICT_REQUIRES_RECONCILIATION
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_drift_detected: true }).evidence_only,
    true,
  )
  // CONFLICT_REQUIRES_HUMAN_REVIEW
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, replay_ambiguity_detected: true }).evidence_only,
    true,
  )
  // CONFLICT_UNRESOLVABLE
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_reconstructable: false }).evidence_only,
    true,
  )
  // NULL result
  assert.equal(arbitrateLegitimacyConflict(null).evidence_only, true)
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_authority: true }).evidence_only,
    true,
  )
})

// ── FATE Test 15: arbitration creates_authority false ────────────────────────

test('15. arbitration creates_authority false (all result types)', () => {
  assert.equal(arbitrateLegitimacyConflict(VALID_CONFLICT).creates_authority, false)
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_authority: true }).creates_authority,
    false,
  )
  assert.equal(arbitrateLegitimacyConflict(null).creates_authority, false)
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_reconstructable: false }).creates_authority,
    false,
  )
})

// ── FATE Test 16: arbitration creates_execution false ────────────────────────

test('16. arbitration creates_execution false (all result types)', () => {
  assert.equal(arbitrateLegitimacyConflict(VALID_CONFLICT).creates_execution, false)
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_execution: true }).creates_execution,
    false,
  )
  assert.equal(arbitrateLegitimacyConflict(null).creates_execution, false)
})

// ── FATE Test 17: arbitration creates_proof false ────────────────────────────

test('17. arbitration creates_proof false (all result types)', () => {
  assert.equal(arbitrateLegitimacyConflict(VALID_CONFLICT).creates_proof, false)
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_proof: true }).creates_proof,
    false,
  )
  assert.equal(arbitrateLegitimacyConflict(null).creates_proof, false)
})

// ── FATE Test 18: arbitration mutates_registry false ─────────────────────────

test('18. arbitration mutates_registry false (all result types)', () => {
  assert.equal(arbitrateLegitimacyConflict(VALID_CONFLICT).mutates_registry, false)
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, mutates_registry: true }).mutates_registry,
    false,
  )
  assert.equal(arbitrateLegitimacyConflict(null).mutates_registry, false)
})

// ── FATE Test 19: telemetry remains read_only/evidence_only ──────────────────

test('19. telemetry remains read_only/evidence_only', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  const telemetry = readConflictTelemetry(result)
  assert.equal(telemetry.artifact, 'LEGITIMACY_CONFLICT_TELEMETRY')
  assert.equal(telemetry.evidence_only, true)
  assert.equal(telemetry.read_only, true)
})

test('19b. telemetry on NULL result remains evidence_only and read_only', () => {
  const result = arbitrateLegitimacyConflict(null)
  const telemetry = readConflictTelemetry(result)
  assert.equal(telemetry.evidence_only, true)
  assert.equal(telemetry.read_only, true)
})

// ── FATE Test 20: telemetry cannot create authority ───────────────────────────

test('20. telemetry cannot create authority', () => {
  const telemetry = readConflictTelemetry(arbitrateLegitimacyConflict(VALID_CONFLICT))
  assert.equal(telemetry.creates_authority, false)
})

test('20b. telemetry on CONFLICT_UNRESOLVABLE cannot create authority', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    topology_reconstructable: false,
    lineage_divergence_detected: true,
  })
  const telemetry = readConflictTelemetry(result)
  assert.equal(telemetry.creates_authority, false)
})

// ── FATE Test 21: telemetry cannot execute ────────────────────────────────────

test('21. telemetry cannot execute', () => {
  const telemetry = readConflictTelemetry(arbitrateLegitimacyConflict(VALID_CONFLICT))
  assert.equal(telemetry.creates_execution, false)
})

// ── FATE Test 22: telemetry cannot create proof ───────────────────────────────

test('22. telemetry cannot create proof', () => {
  const telemetry = readConflictTelemetry(arbitrateLegitimacyConflict(VALID_CONFLICT))
  assert.equal(telemetry.creates_proof, false)
})

// ── FATE Test 23: telemetry cannot mutate registries ─────────────────────────

test('23. telemetry cannot mutate registries', () => {
  const telemetry = readConflictTelemetry(arbitrateLegitimacyConflict(VALID_CONFLICT))
  assert.equal(telemetry.mutates_registry, false)
})

// ── FATE Test 24: same conflict state produces same hash ─────────────────────

test('24. same conflict state produces same hash', () => {
  const r1 = arbitrateLegitimacyConflict(VALID_CONFLICT)
  const r2 = arbitrateLegitimacyConflict(VALID_CONFLICT)
  assert.equal(r1.conflict_hash, r2.conflict_hash)
  assert.equal(r1.conflict_hash_alg, 'sha256')
  assert.match(r1.conflict_hash, /^[0-9a-f]{64}$/)
})

test('24b. same NULL state produces same hash', () => {
  const r1 = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_authority: true })
  const r2 = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_authority: true })
  assert.equal(r1.conflict_hash, r2.conflict_hash)
})

// ── FATE Test 25: reordered arbitration_classes preserve hash stability ────────

test('25. reordered arbitration_classes preserve hash stability', () => {
  const base = {
    artifact: 'LEGITIMACY_CONFLICT_ARBITRATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    conflict_id: 'test-25',
    conflict_type: 'topology_drift',
    severity: 'HIGH',
    surfaces: ['deploy', 'rollback'],
    lineage_inputs: ['hash-a'],
    proof_inputs: [],
    causal_inputs: [],
    arbitration_result: 'CONFLICT_REQUIRES_RECONCILIATION',
    reconciliation_required: true,
    human_review_required: false,
    topology_conflict_detected: true,
    replay_sensitive: false,
    conflict_hash_alg: 'sha256',
  }

  const h1 = computeLegitimacyConflictHash({
    ...base,
    arbitration_classes: [
      'legitimacy_conflict_topology_drift',
      'legitimacy_conflict_reconciliation_required',
    ],
  })
  const h2 = computeLegitimacyConflictHash({
    ...base,
    arbitration_classes: [
      'legitimacy_conflict_reconciliation_required',
      'legitimacy_conflict_topology_drift',
    ],
  })
  assert.equal(h1, h2, 'Hash must be stable regardless of arbitration_classes order')
})

// ── FATE Test 26: reordered lineage_inputs preserve hash stability ─────────────

test('26. reordered lineage_inputs preserve hash stability', () => {
  const base = {
    artifact: 'LEGITIMACY_CONFLICT_ARBITRATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    conflict_id: 'test-26',
    conflict_type: 'lineage_divergence',
    severity: 'LOW',
    surfaces: ['deploy'],
    proof_inputs: [],
    causal_inputs: [],
    arbitration_result: 'CONFLICT_NONE',
    arbitration_classes: ['legitimacy_conflict_none'],
    reconciliation_required: false,
    human_review_required: false,
    topology_conflict_detected: false,
    replay_sensitive: false,
    conflict_hash_alg: 'sha256',
  }

  const h1 = computeLegitimacyConflictHash({
    ...base,
    lineage_inputs: ['lineage-a', 'lineage-b', 'lineage-c'],
  })
  const h2 = computeLegitimacyConflictHash({
    ...base,
    lineage_inputs: ['lineage-c', 'lineage-a', 'lineage-b'],
  })
  assert.equal(h1, h2, 'Hash must be stable regardless of lineage_inputs order')
})

// ── FATE Test 27: reordered proof_inputs preserve hash stability ───────────────

test('27. reordered proof_inputs preserve hash stability', () => {
  const base = {
    artifact: 'LEGITIMACY_CONFLICT_ARBITRATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    conflict_id: 'test-27',
    conflict_type: 'proof_divergence',
    severity: 'MEDIUM',
    surfaces: ['deploy'],
    lineage_inputs: ['hash-a'],
    causal_inputs: [],
    arbitration_result: 'CONFLICT_OBSERVED',
    arbitration_classes: ['legitimacy_conflict_observed'],
    reconciliation_required: false,
    human_review_required: false,
    topology_conflict_detected: false,
    replay_sensitive: false,
    conflict_hash_alg: 'sha256',
  }

  const h1 = computeLegitimacyConflictHash({
    ...base,
    proof_inputs: ['proof-x', 'proof-y', 'proof-z'],
  })
  const h2 = computeLegitimacyConflictHash({
    ...base,
    proof_inputs: ['proof-z', 'proof-x', 'proof-y'],
  })
  assert.equal(h1, h2, 'Hash must be stable regardless of proof_inputs order')
})

// ── FATE Test 28: reordered surfaces preserve hash stability ──────────────────

test('28. reordered surfaces preserve hash stability', () => {
  const base = {
    artifact: 'LEGITIMACY_CONFLICT_ARBITRATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    conflict_id: 'test-28',
    conflict_type: 'topology_drift',
    severity: 'HIGH',
    lineage_inputs: ['hash-a'],
    proof_inputs: [],
    causal_inputs: [],
    arbitration_result: 'CONFLICT_REQUIRES_RECONCILIATION',
    arbitration_classes: ['legitimacy_conflict_reconciliation_required'],
    reconciliation_required: true,
    human_review_required: false,
    topology_conflict_detected: true,
    replay_sensitive: false,
    conflict_hash_alg: 'sha256',
  }

  const h1 = computeLegitimacyConflictHash({
    ...base,
    surfaces: ['deploy', 'rollback', 'topology'],
  })
  const h2 = computeLegitimacyConflictHash({
    ...base,
    surfaces: ['topology', 'deploy', 'rollback'],
  })
  assert.equal(h1, h2, 'Hash must be stable regardless of surfaces order')
})

// ── FATE Test 29: conflict hash excludes itself ───────────────────────────────

test('29. conflict hash excludes itself (no circular dependency)', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)

  assert.ok(typeof result.conflict_hash === 'string')
  assert.equal(result.conflict_hash.length, 64)
  assert.match(result.conflict_hash, /^[0-9a-f]{64}$/)
  assert.equal(result.conflict_hash_alg, 'sha256')

  // Recomputing without conflict_hash field must produce the same hash
  const { conflict_hash, ...fieldsWithout } = result
  const recomputed = computeLegitimacyConflictHash(fieldsWithout)
  assert.equal(
    result.conflict_hash,
    recomputed,
    'conflict_hash must be recomputable from fields without conflict_hash itself',
  )
})

test('29b. computeArbitrationHash excludes conflict_hash and arbitration_hash', () => {
  const fields = {
    artifact: 'LEGITIMACY_CONFLICT_ARBITRATION',
    evidence_only: true,
    conflict_id: 'test-29b',
    conflict_type: 'test_type',
    arbitration_result: 'CONFLICT_NONE',
    arbitration_classes: ['legitimacy_conflict_none'],
    severity: 'LOW',
    surfaces: ['deploy'],
    lineage_inputs: ['hash-a'],
    proof_inputs: [],
    causal_inputs: [],
    reconciliation_required: false,
    human_review_required: false,
    topology_conflict_detected: false,
    replay_sensitive: false,
    conflict_hash_alg: 'sha256',
  }
  const h1 = computeArbitrationHash(fields)
  const h2 = computeArbitrationHash({ ...fields, conflict_hash: 'some-hash', arbitration_hash: 'other' })
  assert.equal(h1, h2, 'computeArbitrationHash must exclude conflict_hash and arbitration_hash')
  assert.match(h1, /^[0-9a-f]{64}$/)
})

// ── FATE Test 30: conflict arbitration cannot overwrite legitimacy state ───────

test('30. conflict arbitration cannot overwrite legitimacy state', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  // Output classifies only — does not resolve or mutate legitimacy
  assert.ok(!('legitimacy_resolved' in result), 'must not contain legitimacy_resolved')
  assert.ok(!('legitimacy_state' in result), 'must not contain legitimacy_state')
  assert.ok(!('legitimacy_override' in result), 'must not contain legitimacy_override')
  assert.ok(!('resolved_state' in result), 'must not contain resolved_state')
  assert.ok(!('legitimacy_repair' in result), 'must not contain legitimacy_repair')
  assert.equal(result.creates_authority, false)
  assert.equal(result.mutates_registry, false)
})

test('30b. NULL-result artifact also cannot overwrite legitimacy state', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, creates_authority: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(!('legitimacy_resolved' in result))
  assert.ok(!('legitimacy_state' in result))
  assert.equal(result.creates_authority, false)
})

// ── FATE Test 31: arbitration cannot silently resolve stale authority ──────────

test('31. arbitration cannot silently resolve stale authority', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  assert.equal(result.creates_authority, false)
  assert.ok(!('authority_resolved' in result))
  assert.ok(!('stale_authority_resolved' in result))
  assert.ok(!('authority_grant' in result))
  assert.ok(!('authority_repair' in result))
})

test('31b. stale_state_preferred input is rejected as boundary violation', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, stale_state_preferred: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_boundary_violation'))
})

// ── FATE Test 32: arbitration cannot normalize replay ambiguity ───────────────

test('32. arbitration cannot normalize replay ambiguity', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, replay_ambiguity_detected: true })
  // Replay ambiguity must yield HUMAN_REVIEW, not be silently resolved
  assert.equal(
    result.arbitration_result,
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_HUMAN_REVIEW,
  )
  assert.notEqual(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_NONE)
  assert.equal(result.replay_sensitive, true)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_replay_ambiguity'))
  // Must not resolve the ambiguity
  assert.ok(!('replay_resolved' in result))
  assert.ok(!('causal_order_fixed' in result))
  assert.ok(!('normalized_replay_state' in result))
})

// ── FATE Test 33: arbitration cannot repair topology ─────────────────────────

test('33. arbitration cannot repair topology', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_drift_detected: true })
  assert.equal(result.reconciliation_required, true)
  assert.ok(!('repair' in result), 'must not contain repair field')
  assert.ok(!('topology_repair' in result), 'must not contain topology_repair field')
  assert.ok(!('repaired_topology' in result))
  assert.ok(!('automatic_repair' in result))
  assert.ok(!('auto_repair' in result))
})

test('33b. CONFLICT_UNRESOLVABLE cannot repair topology either', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    topology_reconstructable: false,
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE)
  assert.ok(!('topology_repair' in result))
  assert.ok(!('repair' in result))
})

// ── FATE Test 34: arbitration cannot rewrite lineage ─────────────────────────

test('34. arbitration cannot rewrite lineage', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, lineage_divergence_detected: true })
  assert.ok(!('lineage_repair' in result), 'must not contain lineage_repair')
  assert.ok(!('repaired_lineage' in result))
  assert.ok(!('canonical_lineage' in result))
  assert.ok(!('lineage_override' in result))
})

test('34b. lineage_repair input is a boundary violation → NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, lineage_repair: 'repair-001' })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_boundary_violation'))
})

// ── FATE Test 35: arbitration cannot imply execution permission ───────────────

test('35. arbitration cannot imply execution permission', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  assert.equal(result.creates_execution, false)
  assert.ok(!('execution_token' in result))
  assert.ok(!('execution_path' in result))
  assert.ok(!('deployment_trigger' in result))
  assert.ok(!('runtime_route' in result))
  assert.ok(!('execution_permission' in result))
})

test('35b. deployment_trigger input is rejected → NULL', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, deployment_trigger: 'trigger-001' })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_boundary_violation'))
})

// ── FATE Test 36: arbitration cannot imply synchronization ───────────────────

test('36. arbitration cannot imply synchronization', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  assert.ok(!('implicit_sync' in result))
  assert.ok(!('auto_sync' in result))
  assert.ok(!('automatic_repair' in result))
  assert.ok(!('sync_trigger' in result))
})

test('36b. clean output must not trigger its own validateConflictBoundary', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  assert.equal(
    validateConflictBoundary(result),
    null,
    'Arbitration output must not self-violate boundary check',
  )
})

test('36c. automatic_repair input is rejected → NULL', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    automatic_repair: 'repair-trigger-001',
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_boundary_violation'))
})

// ── FATE Test 37: conflict telemetry cannot convert disagreement into authority

test('37. conflict telemetry cannot convert disagreement into authority', () => {
  const unresolvable = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    topology_reconstructable: false,
    lineage_divergence_detected: true,
  })
  assert.equal(unresolvable.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE)

  const telemetry = readConflictTelemetry(unresolvable)
  assert.equal(telemetry.creates_authority, false)
  assert.equal(telemetry.creates_execution, false)
  assert.equal(telemetry.creates_proof, false)
  assert.equal(telemetry.mutates_registry, false)
  assert.equal(telemetry.metrics.conflict_unresolvable_total, 1)
  // Telemetry observes but does not resolve
  assert.ok(!('authority_granted' in telemetry))
  assert.ok(!('conflict_resolved' in telemetry))
  assert.ok(!('resolution' in telemetry))
})

test('37b. telemetry on any conflict result cannot create authority', () => {
  const results = [
    arbitrateLegitimacyConflict(VALID_CONFLICT),
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, proof_divergence_detected: true }),
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_drift_detected: true }),
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, replay_ambiguity_detected: true }),
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_reconstructable: false }),
    arbitrateLegitimacyConflict(null),
  ]
  for (const r of results) {
    const t = readConflictTelemetry(r)
    assert.equal(t.creates_authority, false, `Telemetry must not create authority for result: ${r.arbitration_result}`)
  }
})

// ── FATE Test 38: fail-closed malformed inputs return NULL not throw ──────────

test('38. fail-closed malformed inputs return NULL not throw', () => {
  const malformed = [
    null,
    undefined,
    42,
    'string',
    true,
    [],
    {},
    { conflict_id: null },
    { conflict_type: null },
    { conflict_id: '', conflict_type: 'type', lineage_inputs: [] },
    { conflict_id: 'id', conflict_type: '', lineage_inputs: [] },
    { conflict_id: 123, conflict_type: 456 },
    { conflict_id: 'id', conflict_type: 'type' },
  ]
  for (const m of malformed) {
    assert.doesNotThrow(() => {
      const result = arbitrateLegitimacyConflict(m)
      assert.equal(
        result.arbitration_result,
        LEGITIMACY_CONFLICT_RESULTS.NULL,
        `Expected NULL for ${JSON.stringify(m)}`,
      )
      assert.equal(result.evidence_only, true)
      assert.equal(result.creates_authority, false)
      assert.equal(result.artifact, 'LEGITIMACY_CONFLICT_ARBITRATION')
    }, `Input ${JSON.stringify(m)} must not throw`)
  }
})

test('38b. classifyLegitimacyConflict is also fail-closed for malformed inputs', () => {
  const malformed = [null, undefined, 42, 'string', true, [], {}, { conflict_id: 'id' }]
  for (const m of malformed) {
    assert.doesNotThrow(() => {
      const cls = classifyLegitimacyConflict(m)
      assert.equal(cls.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.NULL)
    }, `classifyLegitimacyConflict(${JSON.stringify(m)}) must not throw`)
  }
})

// ── Additional coverage ───────────────────────────────────────────────────────

test('proof_divergence_detected returns CONFLICT_OBSERVED', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, proof_divergence_detected: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_OBSERVED)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_proof_divergence'))
  assert.equal(result.severity, CONFLICT_SEVERITY_LEVELS.MEDIUM)
  assert.equal(result.reconciliation_required, false)
  assert.equal(result.topology_conflict_detected, false)
})

test('registry_divergence_detected returns CONFLICT_OBSERVED', () => {
  const result = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, registry_divergence_detected: true })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_OBSERVED)
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_registry_divergence'))
})

test('severity levels match result types', () => {
  assert.equal(
    arbitrateLegitimacyConflict(VALID_CONFLICT).severity,
    CONFLICT_SEVERITY_LEVELS.LOW,
  )
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, proof_divergence_detected: true }).severity,
    CONFLICT_SEVERITY_LEVELS.MEDIUM,
  )
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_drift_detected: true }).severity,
    CONFLICT_SEVERITY_LEVELS.HIGH,
  )
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, replay_ambiguity_detected: true }).severity,
    CONFLICT_SEVERITY_LEVELS.HIGH,
  )
  assert.equal(
    arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_reconstructable: false }).severity,
    CONFLICT_SEVERITY_LEVELS.CRITICAL,
  )
})

test('validateConflictBoundary returns null for clean inputs', () => {
  assert.equal(validateConflictBoundary({}), null)
  assert.equal(validateConflictBoundary(null), null)
  assert.equal(validateConflictBoundary(undefined), null)
  assert.equal(validateConflictBoundary([]), null)
  assert.equal(validateConflictBoundary({ creates_authority: false }), null)
  assert.equal(validateConflictBoundary({ creates_execution: false }), null)
  assert.equal(validateConflictBoundary({ creates_proof: false }), null)
  assert.equal(validateConflictBoundary({ mutates_registry: false }), null)
  assert.equal(validateConflictBoundary({ topology_drift_detected: true }), null)
})

test('validateConflictBoundary detects all boundary violation types', () => {
  assert.equal(
    validateConflictBoundary({ creates_authority: true }),
    LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_AUTHORITY_ATTEMPT,
  )
  assert.equal(
    validateConflictBoundary({ creates_execution: true }),
    LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_EXECUTION_ATTEMPT,
  )
  assert.equal(
    validateConflictBoundary({ creates_proof: true }),
    LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_PROOF_ATTEMPT,
  )
  assert.equal(
    validateConflictBoundary({ mutates_registry: true }),
    LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_REGISTRY_MUTATION,
  )
  assert.equal(
    validateConflictBoundary({ registry_mutation: 'mut' }),
    LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_REGISTRY_MUTATION,
  )
  assert.equal(
    validateConflictBoundary({ implicit_priority: 'x' }),
    LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_IMPLICIT_PRIORITY_FORBIDDEN,
  )
  for (const f of ['authority_grant', 'execution_token', 'proof_signature', 'deployment_trigger', 'lineage_repair', 'auto_resolve', 'automatic_repair', 'stale_state_preferred']) {
    assert.equal(
      validateConflictBoundary({ [f]: 'value' }),
      LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_BOUNDARY_VIOLATION,
      `Expected boundary_violation for ${f}`,
    )
  }
})

test('telemetry metrics accurately count all conflict result types', () => {
  const none = arbitrateLegitimacyConflict(VALID_CONFLICT)
  assert.equal(readConflictTelemetry(none).metrics.conflict_none_total, 1)

  const observed = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, proof_divergence_detected: true })
  assert.equal(readConflictTelemetry(observed).metrics.conflict_observed_total, 1)

  const recon = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, topology_drift_detected: true })
  const t3 = readConflictTelemetry(recon)
  assert.equal(t3.metrics.conflict_reconciliation_required_total, 1)
  assert.equal(t3.metrics.topology_conflict_total, 1)

  const review = arbitrateLegitimacyConflict({ ...VALID_CONFLICT, replay_ambiguity_detected: true })
  const t4 = readConflictTelemetry(review)
  assert.equal(t4.metrics.conflict_human_review_required_total, 1)
  assert.equal(t4.metrics.replay_ambiguity_total, 1)

  const unresolvable = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    topology_reconstructable: false,
    lineage_divergence_detected: true,
  })
  const t5 = readConflictTelemetry(unresolvable)
  assert.equal(t5.metrics.conflict_unresolvable_total, 1)
  assert.equal(t5.metrics.topology_conflict_total, 1)
  assert.equal(t5.metrics.lineage_divergence_total, 1)
})

test('telemetry boundary_violation_total counts from conflict list', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  const violations = [
    { creates_authority: true },
    { implicit_priority: 'x' },
    { break_glass: true },
    { stale_state_preferred: true },
  ]
  const telemetry = readConflictTelemetry(result, violations)
  assert.equal(telemetry.metrics.boundary_violation_total, 4)
})

test('telemetry on non-artifact input returns zeroed metrics', () => {
  const telemetry = readConflictTelemetry({})
  assert.equal(telemetry.metrics.conflict_none_total, 0)
  assert.equal(telemetry.metrics.conflict_unresolvable_total, 0)
  assert.equal(telemetry.evidence_only, true)
  assert.equal(telemetry.read_only, true)
})

test('arbitration output is frozen (immutable)', () => {
  const result = arbitrateLegitimacyConflict(VALID_CONFLICT)
  assert.throws(
    () => { result.arbitration_result = 'MUTATED' },
    TypeError,
    'Frozen artifact must not allow mutation',
  )
})

test('multiple condition flags accumulate in arbitration_classes', () => {
  // Both topology_drift and lineage_divergence → RECONCILIATION with both classes
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    topology_drift_detected: true,
    lineage_divergence_detected: true,
  })
  assert.equal(
    result.arbitration_result,
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_RECONCILIATION,
  )
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_topology_drift'))
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_lineage_divergence'))
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_reconciliation_required'))
})

test('HUMAN_REVIEW escalates over RECONCILIATION conditions when both present', () => {
  // replay_ambiguity_detected + topology_drift_detected → HUMAN_REVIEW wins
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    replay_ambiguity_detected: true,
    topology_drift_detected: true,
  })
  assert.equal(
    result.arbitration_result,
    LEGITIMACY_CONFLICT_RESULTS.CONFLICT_REQUIRES_HUMAN_REVIEW,
  )
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_replay_ambiguity'))
  assert.ok(result.arbitration_classes.includes('legitimacy_conflict_topology_drift'))
})

test('UNRESOLVABLE escalates over HUMAN_REVIEW when topology_reconstructable: false', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    replay_ambiguity_detected: true,
    topology_reconstructable: false,
  })
  assert.equal(result.arbitration_result, LEGITIMACY_CONFLICT_RESULTS.CONFLICT_UNRESOLVABLE)
  assert.equal(result.severity, CONFLICT_SEVERITY_LEVELS.CRITICAL)
})

test('surfaces are sorted in arbitration output', () => {
  const result = arbitrateLegitimacyConflict({
    ...VALID_CONFLICT,
    surfaces: ['topology', 'deploy', 'rollback'],
  })
  const surfaces = result.surfaces
  assert.deepEqual(surfaces, ['deploy', 'rollback', 'topology'])
})

test('implicit_priority has higher priority than creates_authority in boundary check', () => {
  const v = validateConflictBoundary({
    implicit_priority: 'x',
    creates_authority: true,
  })
  assert.equal(v, LEGITIMACY_CONFLICT_CLASSES.LEGITIMACY_CONFLICT_IMPLICIT_PRIORITY_FORBIDDEN)
})
