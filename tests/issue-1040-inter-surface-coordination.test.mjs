/**
 * tests/issue-1040-inter-surface-coordination.test.mjs
 * Issue #1040 — Inter-Surface Legitimacy Coordination Rules
 *
 * FATE tests proving deterministic inter-surface coordination classification.
 *
 * Verifies:
 *   1.  valid deploy → proof interaction returns COORDINATION_ALLOWED
 *   2.  missing surface_a returns NULL
 *   3.  missing surface_b returns NULL
 *   4.  unknown surface returns NULL
 *   5.  missing interaction_type returns NULL
 *   6.  unknown interaction_type returns NULL
 *   7.  proof required but absent returns COORDINATION_FORBIDDEN
 *   8.  lineage required but absent returns COORDINATION_FORBIDDEN
 *   9.  ordering required but absent returns COORDINATION_FORBIDDEN
 *   10. implicit_sync returns NULL
 *   11. authority attempt returns NULL
 *   12. execution attempt returns NULL
 *   13. proof attempt returns NULL
 *   14. registry mutation returns NULL
 *   15. output remains evidence_only
 *   16. output creates_authority false
 *   17. output creates_execution false
 *   18. output creates_proof false
 *   19. output mutates_registry false
 *   20. same coordination state produces same hash
 *   21. reordered classes preserve hash stability
 *   22. reordered forbidden_conditions preserve hash stability
 *   23. coordination hash excludes coordination_hash itself
 *   24. malformed inputs return NULL, not throw
 *   25. coordination does not create runtime routes
 *   26. coordination does not change validator behavior
 *   27. coordination does not imply synchronization
 *   28. local validity without required cross-surface proof returns COORDINATION_FORBIDDEN
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no execution capability expansion, no proof behavior changes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INTER_SURFACE_COORDINATION_RESULTS,
  INTER_SURFACE_COORDINATION_CLASSES,
  SURFACE_TYPES,
  INTERACTION_TYPES,
  classifySurfaceInteraction,
  evaluateInterSurfaceCoordination,
  validateInterSurfaceCoordinationBoundary,
  computeInterSurfaceCoordinationHash,
} from '../src/inter-surface-coordination.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_COORDINATION = {
  surface_a: 'deploy',
  surface_b: 'proof',
  interaction_type: 'proves',
  requires_proof: true,
  proof_present: true,
  requires_lineage: true,
  lineage_present: true,
  requires_ordering: true,
  ordering_present: true,
}

// ── Class and result constant coverage ───────────────────────────────────────

test('INTER_SURFACE_COORDINATION_RESULTS exports COORDINATION_ALLOWED, COORDINATION_FORBIDDEN, NULL', () => {
  assert.equal(INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_ALLOWED, 'COORDINATION_ALLOWED')
  assert.equal(INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_FORBIDDEN, 'COORDINATION_FORBIDDEN')
  assert.equal(INTER_SURFACE_COORDINATION_RESULTS.NULL, 'NULL')
})

test('INTER_SURFACE_COORDINATION_CLASSES exports all required class values', () => {
  const values = Object.values(INTER_SURFACE_COORDINATION_CLASSES)
  const required = [
    'inter_surface_coordination_allowed',
    'inter_surface_coordination_forbidden',
    'inter_surface_missing_surface',
    'inter_surface_unknown_surface',
    'inter_surface_missing_interaction',
    'inter_surface_unknown_interaction',
    'inter_surface_proof_required',
    'inter_surface_lineage_required',
    'inter_surface_ordering_required',
    'inter_surface_implicit_sync_forbidden',
    'inter_surface_boundary_violation',
    'inter_surface_authority_attempt',
    'inter_surface_execution_attempt',
    'inter_surface_proof_attempt',
    'inter_surface_registry_mutation',
  ]
  for (const cls of required) {
    assert.ok(values.includes(cls), `Missing class: ${cls}`)
  }
})

test('SURFACE_TYPES exports all required surface values', () => {
  const values = Object.values(SURFACE_TYPES)
  const required = [
    'deploy', 'rollback', 'proof', 'telemetry', 'continuity',
    'topology', 'cto', 'agent', 'reconciliation',
  ]
  for (const s of required) {
    assert.ok(values.includes(s), `Missing surface: ${s}`)
  }
})

test('INTERACTION_TYPES exports all required interaction values', () => {
  const values = Object.values(INTERACTION_TYPES)
  const required = [
    'triggers', 'depends_on', 'observes', 'reconciles', 'rolls_back',
    'proves', 'invalidates', 'propagates', 'reports',
  ]
  for (const i of required) {
    assert.ok(values.includes(i), `Missing interaction: ${i}`)
  }
})

// ── Test 1: valid interaction with all constraints satisfied → COORDINATION_ALLOWED ──

test('1. valid deploy → proof interaction with proof/lineage/ordering present returns COORDINATION_ALLOWED', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_ALLOWED)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_COORDINATION_ALLOWED,
    ),
  )
  assert.equal(result.artifact, 'INTER_SURFACE_COORDINATION_RULESET')
  assert.equal(result.allowed, true)
})

// ── Test 2: missing surface_a returns NULL ────────────────────────────────────

test('2. missing surface_a returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_b: 'proof',
    interaction_type: 'proves',
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_MISSING_SURFACE,
    ),
  )
  assert.equal(result.allowed, false)
})

// ── Test 3: missing surface_b returns NULL ────────────────────────────────────

test('3. missing surface_b returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    interaction_type: 'proves',
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_MISSING_SURFACE,
    ),
  )
})

// ── Test 4: unknown surface returns NULL ──────────────────────────────────────

test('4. unknown surface returns NULL (surface_a unknown)', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'unknown_surface_xyz',
    surface_b: 'proof',
    interaction_type: 'proves',
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_UNKNOWN_SURFACE,
    ),
  )
})

test('4b. unknown surface returns NULL (surface_b unknown)', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'unknown_surface_xyz',
    interaction_type: 'proves',
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_UNKNOWN_SURFACE,
    ),
  )
})

// ── Test 5: missing interaction_type returns NULL ─────────────────────────────

test('5. missing interaction_type returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_MISSING_INTERACTION,
    ),
  )
})

// ── Test 6: unknown interaction_type returns NULL ─────────────────────────────

test('6. unknown interaction_type returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'unknown_action_xyz',
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_UNKNOWN_INTERACTION,
    ),
  )
})

// ── Test 7: proof required but absent returns COORDINATION_FORBIDDEN ──────────

test('7. proof required but absent returns COORDINATION_FORBIDDEN', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    requires_proof: true,
    proof_present: false,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_FORBIDDEN)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_PROOF_REQUIRED,
    ),
  )
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_COORDINATION_FORBIDDEN,
    ),
  )
})

// ── Test 8: lineage required but absent returns COORDINATION_FORBIDDEN ─────────

test('8. lineage required but absent returns COORDINATION_FORBIDDEN', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'topology',
    interaction_type: 'depends_on',
    requires_lineage: true,
    lineage_present: false,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_FORBIDDEN)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_LINEAGE_REQUIRED,
    ),
  )
})

// ── Test 9: ordering required but absent returns COORDINATION_FORBIDDEN ────────

test('9. ordering required but absent returns COORDINATION_FORBIDDEN', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'rollback',
    surface_b: 'deploy',
    interaction_type: 'rolls_back',
    requires_ordering: true,
    ordering_present: false,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_FORBIDDEN)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_ORDERING_REQUIRED,
    ),
  )
})

// ── Test 10: implicit_sync returns NULL ───────────────────────────────────────

test('10. implicit_sync returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    implicit_sync: true,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_IMPLICIT_SYNC_FORBIDDEN,
    ),
  )
})

test('10b. auto_sync returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    auto_sync: true,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_IMPLICIT_SYNC_FORBIDDEN,
    ),
  )
})

test('10c. validateInterSurfaceCoordinationBoundary detects implicit_sync', () => {
  const violation = validateInterSurfaceCoordinationBoundary({ implicit_sync: true })
  assert.equal(violation, INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_IMPLICIT_SYNC_FORBIDDEN)
})

// ── Test 11: authority attempt returns NULL ───────────────────────────────────

test('11. authority attempt returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    creates_authority: true,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_AUTHORITY_ATTEMPT,
    ),
  )
  assert.equal(result.creates_authority, false)
})

test('11b. validateInterSurfaceCoordinationBoundary detects authority attempt', () => {
  const violation = validateInterSurfaceCoordinationBoundary({ creates_authority: true })
  assert.equal(violation, INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_AUTHORITY_ATTEMPT)
})

test('11c. authority_grant field returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    authority_grant: 'grant-id-001',
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION,
    ),
  )
})

// ── Test 12: execution attempt returns NULL ───────────────────────────────────

test('12. execution attempt returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    creates_execution: true,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_EXECUTION_ATTEMPT,
    ),
  )
  assert.equal(result.creates_execution, false)
})

test('12b. validateInterSurfaceCoordinationBoundary detects execution attempt', () => {
  const violation = validateInterSurfaceCoordinationBoundary({ creates_execution: true })
  assert.equal(violation, INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_EXECUTION_ATTEMPT)
})

test('12c. execution_token field returns NULL', () => {
  const violation = validateInterSurfaceCoordinationBoundary({ execution_token: 'tok-001' })
  assert.equal(violation, INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION)
})

// ── Test 13: proof attempt returns NULL ───────────────────────────────────────

test('13. proof attempt returns NULL', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    creates_proof: true,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_PROOF_ATTEMPT,
    ),
  )
  assert.equal(result.creates_proof, false)
})

test('13b. validateInterSurfaceCoordinationBoundary detects proof attempt', () => {
  const violation = validateInterSurfaceCoordinationBoundary({ creates_proof: true })
  assert.equal(violation, INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_PROOF_ATTEMPT)
})

test('13c. proof_signature field returns NULL', () => {
  const violation = validateInterSurfaceCoordinationBoundary({ proof_signature: 'sig-001' })
  assert.equal(violation, INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION)
})

// ── Test 14: registry mutation returns NULL ───────────────────────────────────

test('14. registry mutation returns NULL (mutates_registry: true)', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    mutates_registry: true,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_REGISTRY_MUTATION,
    ),
  )
  assert.equal(result.mutates_registry, false)
})

test('14b. registry_mutation field returns NULL', () => {
  const violation = validateInterSurfaceCoordinationBoundary({ registry_mutation: 'mut-001' })
  assert.equal(violation, INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_REGISTRY_MUTATION)
})

test('14c. validateInterSurfaceCoordinationBoundary detects mutates_registry', () => {
  const violation = validateInterSurfaceCoordinationBoundary({ mutates_registry: true })
  assert.equal(violation, INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_REGISTRY_MUTATION)
})

// ── Test 15: output remains evidence_only ─────────────────────────────────────

test('15. output remains evidence_only (allowed result)', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result.evidence_only, true)
})

test('15b. output remains evidence_only (null result)', () => {
  const result = evaluateInterSurfaceCoordination({ surface_b: 'proof', interaction_type: 'proves' })
  assert.equal(result.evidence_only, true)
})

test('15c. output remains evidence_only (forbidden result)', () => {
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    requires_proof: true,
    proof_present: false,
  })
  assert.equal(result.evidence_only, true)
})

// ── Test 16: output creates_authority false ───────────────────────────────────

test('16. output creates_authority false', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result.creates_authority, false)
})

// ── Test 17: output creates_execution false ───────────────────────────────────

test('17. output creates_execution false', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result.creates_execution, false)
})

// ── Test 18: output creates_proof false ───────────────────────────────────────

test('18. output creates_proof false', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result.creates_proof, false)
})

// ── Test 19: output mutates_registry false ────────────────────────────────────

test('19. output mutates_registry false', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result.mutates_registry, false)
})

// ── Test 20: same coordination state produces same hash ───────────────────────

test('20. same coordination state produces same hash', () => {
  const result1 = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  const result2 = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result1.coordination_hash, result2.coordination_hash)
  assert.equal(result1.coordination_hash_alg, 'sha256')
})

test('20b. same NULL state produces same hash', () => {
  const input = { surface_b: 'proof', interaction_type: 'proves' }
  const r1 = evaluateInterSurfaceCoordination(input)
  const r2 = evaluateInterSurfaceCoordination(input)
  assert.equal(r1.coordination_hash, r2.coordination_hash)
})

// ── Test 21: reordered classes preserve hash stability ────────────────────────

test('21. reordered classes preserve hash stability', () => {
  const base = {
    artifact: 'INTER_SURFACE_COORDINATION_RULESET',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    requires_proof: false,
    requires_lineage: false,
    requires_ordering: false,
    proof_present: false,
    lineage_present: false,
    ordering_present: false,
    allowed: false,
    forbidden_conditions: [],
    coordination_result: 'NULL',
    coordination_hash_alg: 'sha256',
  }

  const fields1 = {
    ...base,
    coordination_classes: [
      'inter_surface_coordination_forbidden',
      'inter_surface_proof_required',
    ],
  }

  const fields2 = {
    ...base,
    coordination_classes: [
      'inter_surface_proof_required',
      'inter_surface_coordination_forbidden',
    ],
  }

  const hash1 = computeInterSurfaceCoordinationHash(fields1)
  const hash2 = computeInterSurfaceCoordinationHash(fields2)
  assert.equal(hash1, hash2, 'Hash must be stable regardless of coordination_classes order')
})

// ── Test 22: reordered forbidden_conditions preserve hash stability ────────────

test('22. reordered forbidden_conditions preserve hash stability', () => {
  const base = {
    artifact: 'INTER_SURFACE_COORDINATION_RULESET',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    requires_proof: true,
    requires_lineage: true,
    requires_ordering: false,
    proof_present: false,
    lineage_present: false,
    ordering_present: false,
    allowed: false,
    coordination_classes: ['inter_surface_coordination_forbidden'],
    coordination_result: 'COORDINATION_FORBIDDEN',
    coordination_hash_alg: 'sha256',
  }

  const fields1 = {
    ...base,
    forbidden_conditions: ['proof_required_but_absent', 'lineage_required_but_absent'],
  }

  const fields2 = {
    ...base,
    forbidden_conditions: ['lineage_required_but_absent', 'proof_required_but_absent'],
  }

  const hash1 = computeInterSurfaceCoordinationHash(fields1)
  const hash2 = computeInterSurfaceCoordinationHash(fields2)
  assert.equal(hash1, hash2, 'Hash must be stable regardless of forbidden_conditions order')
})

// ── Test 23: coordination hash excludes coordination_hash itself ──────────────

test('23. coordination hash excludes coordination_hash itself (no circular dependency)', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)

  assert.ok(typeof result.coordination_hash === 'string')
  assert.equal((result.coordination_hash).length, 64)
  assert.match(result.coordination_hash, /^[0-9a-f]{64}$/)

  // Recomputing with the same inputs (no coordination_hash field) produces the same hash
  const recomputed = computeInterSurfaceCoordinationHash({
    artifact: result.artifact,
    evidence_only: result.evidence_only,
    creates_authority: result.creates_authority,
    creates_execution: result.creates_execution,
    creates_proof: result.creates_proof,
    mutates_registry: result.mutates_registry,
    surface_a: result.surface_a,
    surface_b: result.surface_b,
    interaction_type: result.interaction_type,
    requires_proof: result.requires_proof,
    requires_lineage: result.requires_lineage,
    requires_ordering: result.requires_ordering,
    proof_present: result.proof_present,
    lineage_present: result.lineage_present,
    ordering_present: result.ordering_present,
    allowed: result.allowed,
    forbidden_conditions: result.forbidden_conditions,
    coordination_result: result.coordination_result,
    coordination_classes: result.coordination_classes,
    coordination_hash_alg: result.coordination_hash_alg,
  })
  assert.equal(result.coordination_hash, recomputed)
})

// ── Test 24: malformed inputs return NULL, not throw ──────────────────────────

test('24. malformed inputs return NULL, not throw', () => {
  const malformedInputs = [null, undefined, 'string-input', 42, true, [], {}]

  for (const input of malformedInputs) {
    assert.doesNotThrow(() => {
      const result = evaluateInterSurfaceCoordination(input)
      assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
      assert.equal(result.evidence_only, true)
      assert.equal(result.creates_authority, false)
    }, `Input ${JSON.stringify(input)} must not throw`)
  }
})

test('24b. partially malformed inputs return NULL, not throw', () => {
  const partials = [
    { surface_a: null, surface_b: 'proof', interaction_type: 'proves' },
    { surface_a: 42, surface_b: 'proof', interaction_type: 'proves' },
    { surface_a: 'deploy', surface_b: null, interaction_type: 'proves' },
    { surface_a: 'deploy', surface_b: 'proof', interaction_type: null },
  ]
  for (const input of partials) {
    assert.doesNotThrow(() => {
      const result = evaluateInterSurfaceCoordination(input)
      assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
    }, `Partial input ${JSON.stringify(input)} must not throw`)
  }
})

// ── Test 25: coordination does not create runtime routes ──────────────────────

test('25. coordination does not create runtime routes', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result.creates_execution, false)
  assert.ok(!('runtime_route' in result), 'result must not contain runtime_route')
  assert.ok(!('execution_path' in result), 'result must not contain execution_path')
  assert.ok(!('deployment_trigger' in result), 'result must not contain deployment_trigger')
})

// ── Test 26: coordination does not change validator behavior ──────────────────

test('26. coordination does not change validator behavior', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.equal(result.creates_authority, false)
  assert.ok(!('validates_objects' in result), 'result must not contain validates_objects')
  assert.ok(!('validator_update' in result), 'result must not contain validator_update')
  assert.ok(!('validation_override' in result), 'result must not contain validation_override')
  // validateInterSurfaceCoordinationBoundary returns null for clean result (no self-violation)
  const selfViolation = validateInterSurfaceCoordinationBoundary(result)
  assert.equal(selfViolation, null, 'Coordination output must not trigger its own boundary guard')
})

// ── Test 27: coordination does not imply synchronization ─────────────────────

test('27. coordination does not imply synchronization', () => {
  const result = evaluateInterSurfaceCoordination(VALID_COORDINATION)
  assert.ok(!('implicit_sync' in result), 'result must not contain implicit_sync')
  assert.ok(!('auto_sync' in result), 'result must not contain auto_sync')
  assert.ok(!('automatic_repair' in result), 'result must not contain automatic_repair')

  // Confirm that an attempt to use implicit_sync in input is blocked
  const syncAttempt = evaluateInterSurfaceCoordination({
    ...VALID_COORDINATION,
    implicit_sync: true,
  })
  assert.equal(syncAttempt.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.NULL)
  assert.ok(
    (syncAttempt.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_IMPLICIT_SYNC_FORBIDDEN,
    ),
  )
})

// ── Test 28: local validity without required cross-surface proof → COORDINATION_FORBIDDEN ─

test('28. local validity without required cross-surface proof returns COORDINATION_FORBIDDEN', () => {
  // Surfaces and interaction are valid (locally ok), but cross-surface proof is required and absent
  const result = evaluateInterSurfaceCoordination({
    surface_a: 'deploy',
    surface_b: 'topology',
    interaction_type: 'depends_on',
    requires_proof: true,
    proof_present: false,   // cross-surface proof not present
    requires_lineage: false,
    lineage_present: false,
    requires_ordering: false,
    ordering_present: false,
  })
  assert.equal(result.coordination_result, INTER_SURFACE_COORDINATION_RESULTS.COORDINATION_FORBIDDEN)
  assert.ok(
    (result.coordination_classes).includes(
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_PROOF_REQUIRED,
    ),
    'Must classify as proof_required when cross-surface proof is absent',
  )
  assert.equal(result.allowed, false)
  // Confirms the core invariant: locally valid ≠ topology valid
})

// ── classifySurfaceInteraction coverage ──────────────────────────────────────

test('classifySurfaceInteraction returns canonical string for valid inputs', () => {
  const result = classifySurfaceInteraction('deploy', 'proof', 'proves')
  assert.equal(result, 'deploy:proves:proof')
})

test('classifySurfaceInteraction returns null for invalid surfaces', () => {
  assert.equal(classifySurfaceInteraction('unknown', 'proof', 'proves'), null)
  assert.equal(classifySurfaceInteraction('deploy', 'unknown', 'proves'), null)
  assert.equal(classifySurfaceInteraction(null, 'proof', 'proves'), null)
  assert.equal(classifySurfaceInteraction('deploy', null, 'proves'), null)
  assert.equal(classifySurfaceInteraction(undefined, 'proof', 'proves'), null)
  assert.equal(classifySurfaceInteraction(42, 'proof', 'proves'), null)
})

test('classifySurfaceInteraction returns null for invalid interaction_type', () => {
  assert.equal(classifySurfaceInteraction('deploy', 'proof', 'unknown_action'), null)
  assert.equal(classifySurfaceInteraction('deploy', 'proof', null), null)
  assert.equal(classifySurfaceInteraction('deploy', 'proof', ''), null)
})

// ── validateInterSurfaceCoordinationBoundary clean inputs ─────────────────────

test('validateInterSurfaceCoordinationBoundary returns null for clean inputs', () => {
  assert.equal(validateInterSurfaceCoordinationBoundary({}), null)
  assert.equal(validateInterSurfaceCoordinationBoundary({ surface_a: 'deploy' }), null)
  assert.equal(validateInterSurfaceCoordinationBoundary(null), null)
  assert.equal(validateInterSurfaceCoordinationBoundary(undefined), null)
  assert.equal(validateInterSurfaceCoordinationBoundary([]), null)
  assert.equal(validateInterSurfaceCoordinationBoundary({ creates_authority: false }), null)
  assert.equal(validateInterSurfaceCoordinationBoundary({ creates_execution: false }), null)
  assert.equal(validateInterSurfaceCoordinationBoundary({ creates_proof: false }), null)
  assert.equal(validateInterSurfaceCoordinationBoundary({ mutates_registry: false }), null)
})

test('validateInterSurfaceCoordinationBoundary detects all break_glass variants', () => {
  for (const flag of ['break_glass', 'is_break_glass', 'break_glass_normalized']) {
    const violation = validateInterSurfaceCoordinationBoundary({ [flag]: true })
    assert.equal(
      violation,
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION,
      `Expected boundary_violation for ${flag}`,
    )
  }
})

test('validateInterSurfaceCoordinationBoundary detects deployment_trigger and lineage_repair', () => {
  for (const flag of ['deployment_trigger', 'lineage_repair', 'automatic_repair']) {
    const violation = validateInterSurfaceCoordinationBoundary({ [flag]: 'some-value' })
    assert.equal(
      violation,
      INTER_SURFACE_COORDINATION_CLASSES.INTER_SURFACE_BOUNDARY_VIOLATION,
      `Expected boundary_violation for ${flag}`,
    )
  }
})
