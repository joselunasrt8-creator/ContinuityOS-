/**
 * tests/issue-1041-governance-routing.test.mjs
 * Issue #1041 — Hierarchical Governance Routing for Authority Resolution
 *
 * FATE tests proving deterministic governance routing classification.
 *
 * Canonical placement:
 *   Cognition → Input Shaping → ATAO → Governance Routing → Authority Binding
 *   → AEO → Ω Validator → Execution Boundary → Proof
 *
 * Verifies:
 *   1.  valid route resolves to ROUTE_RESOLVED
 *   2.  missing route returns NULL
 *   3.  ambiguous route returns NULL
 *   4.  unknown surface returns NULL
 *   5.  scope mismatch returns NULL
 *   6.  expired authority returns NULL
 *   7.  revoked authority returns NULL
 *   8.  consumed authority returns NULL
 *   9.  routing cannot create authority
 *   10. routing cannot execute
 *   11. routing cannot validate AEOs
 *   12. routing cannot create proof
 *   13. routing cannot mutate registries
 *   14. route output remains evidence_only
 *   15. route output has creates_authority false
 *   16. route output has creates_execution false
 *   17. route output has creates_proof false
 *   18. route output has validates_objects false
 *   19. same route state produces same hash
 *   20. reordered route classes preserve hash stability
 *   21. route hash excludes route_hash itself
 *   22. routing output cannot become authority
 *   23. AEO compilation eligibility only exists after ROUTE_RESOLVED
 *   24. unresolved route cannot proceed to compilation eligibility
 *   25. malformed inputs return NULL, not throw
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no execution capability expansion, no proof behavior changes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GOVERNANCE_ROUTING_RESULTS,
  GOVERNANCE_ROUTING_CLASSES,
  classifyGovernanceDomain,
  resolveGovernanceRoute,
  validateGovernanceRouteBoundary,
  computeGovernanceRouteHash,
} from '../src/governance-routing.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTIVE_AUTHORITY = {
  authority_path_id: 'auth-path-001',
  domain: 'execution',
  surface: 'execute',
  scope: { resource: 'worker-a' },
  status: 'ACTIVE',
  expires_at: null,
}

const REGISTRY_WITH_ONE_ACTIVE = {
  entries: [ACTIVE_AUTHORITY],
}

const VALID_ACTION = {
  intent: 'deploy-worker',
  domain: 'execution',
  surface: 'execute',
  scope: { resource: 'worker-a' },
  target: { worker_id: 'worker-a' },
}

// ── Required class values ─────────────────────────────────────────────────────

const REQUIRED_ROUTING_CLASSES = [
  'governance_route_resolved',
  'governance_route_missing',
  'governance_route_ambiguous',
  'governance_route_unknown_surface',
  'governance_route_scope_mismatch',
  'governance_route_authority_expired',
  'governance_route_authority_revoked',
  'governance_route_authority_consumed',
  'governance_route_boundary_violation',
  'governance_route_authority_attempt',
  'governance_route_execution_attempt',
  'governance_route_validation_attempt',
  'governance_route_proof_attempt',
]

// ── Class and result constant coverage ───────────────────────────────────────

test('GOVERNANCE_ROUTING_CLASSES exports all required class values', () => {
  const values = Object.values(GOVERNANCE_ROUTING_CLASSES)
  for (const cls of REQUIRED_ROUTING_CLASSES) {
    assert.ok(values.includes(cls), `Missing class: ${cls}`)
  }
})

test('GOVERNANCE_ROUTING_RESULTS exports ROUTE_RESOLVED, ROUTE_REJECTED, NULL', () => {
  assert.equal(GOVERNANCE_ROUTING_RESULTS.ROUTE_RESOLVED, 'ROUTE_RESOLVED')
  assert.equal(GOVERNANCE_ROUTING_RESULTS.ROUTE_REJECTED, 'ROUTE_REJECTED')
  assert.equal(GOVERNANCE_ROUTING_RESULTS.NULL, 'NULL')
})

// ── Test 1: valid route resolves to ROUTE_RESOLVED ────────────────────────────

test('1. valid route resolves to ROUTE_RESOLVED', () => {
  const result = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.ROUTE_RESOLVED)
  assert.deepEqual(result.route_classes, [GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_RESOLVED])
  assert.equal(result.authority_path_id, 'auth-path-001')
  assert.equal(result.artifact, 'GOVERNANCE_ROUTE_RESOLUTION')
})

// ── Test 2: missing route returns NULL ────────────────────────────────────────

test('2. missing route returns NULL (no registry entries)', () => {
  const result = resolveGovernanceRoute(
    { intent: 'deploy-worker', domain: 'execution', surface: 'execute', scope: {}, target: {} },
    { entries: [] },
  )
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_MISSING))
})

test('2b. missing route returns NULL (no registry provided)', () => {
  const result = resolveGovernanceRoute(
    { intent: 'deploy-worker', domain: 'execution', surface: 'execute', scope: {}, target: {} },
  )
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_MISSING))
})

test('2c. missing route returns NULL (domain present but no matching entry)', () => {
  const result = resolveGovernanceRoute(
    { intent: 'govern', domain: 'governance', surface: 'governance', scope: {}, target: {} },
    REGISTRY_WITH_ONE_ACTIVE,
  )
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_MISSING))
})

// ── Test 3: ambiguous route returns NULL ──────────────────────────────────────

test('3. ambiguous route returns NULL (multiple matching entries)', () => {
  const registry = {
    entries: [
      {
        authority_path_id: 'auth-001',
        domain: 'execution',
        surface: 'execute',
        scope: { resource: 'worker-a' },
        status: 'ACTIVE',
        expires_at: null,
      },
      {
        authority_path_id: 'auth-002',
        domain: 'execution',
        surface: 'execute',
        scope: { resource: 'worker-a' },
        status: 'ACTIVE',
        expires_at: null,
      },
    ],
  }
  const result = resolveGovernanceRoute(VALID_ACTION, registry)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AMBIGUOUS))
  assert.equal(result.authority_path_id, null)
})

// ── Test 4: unknown surface returns NULL ──────────────────────────────────────

test('4. unknown surface returns NULL', () => {
  const result = resolveGovernanceRoute(
    { intent: 'deploy-worker', domain: 'execution', surface: 'unknown_surface_xyz', scope: {}, target: {} },
    REGISTRY_WITH_ONE_ACTIVE,
  )
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_UNKNOWN_SURFACE))
})

test('4b. empty surface returns NULL (unknown surface)', () => {
  const result = resolveGovernanceRoute(
    { intent: 'deploy-worker', domain: 'execution', surface: '', scope: {}, target: {} },
    REGISTRY_WITH_ONE_ACTIVE,
  )
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_UNKNOWN_SURFACE))
})

// ── Test 5: scope mismatch returns NULL ───────────────────────────────────────

test('5. scope mismatch returns NULL', () => {
  const result = resolveGovernanceRoute(
    {
      intent: 'deploy-worker',
      domain: 'execution',
      surface: 'execute',
      scope: { resource: 'worker-b' },
      target: {},
    },
    REGISTRY_WITH_ONE_ACTIVE,
  )
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_SCOPE_MISMATCH))
})

// ── Test 6: expired authority returns NULL ────────────────────────────────────

test('6. expired authority returns NULL', () => {
  const registry = {
    entries: [
      {
        authority_path_id: 'auth-expired',
        domain: 'execution',
        surface: 'execute',
        scope: { resource: 'worker-a' },
        status: 'ACTIVE',
        expires_at: '2020-01-01T00:00:00.000Z',
      },
    ],
  }
  const result = resolveGovernanceRoute(VALID_ACTION, registry)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_EXPIRED))
})

// ── Test 7: revoked authority returns NULL ────────────────────────────────────

test('7. revoked authority returns NULL', () => {
  const registry = {
    entries: [
      {
        authority_path_id: 'auth-revoked',
        domain: 'execution',
        surface: 'execute',
        scope: { resource: 'worker-a' },
        status: 'REVOKED',
        expires_at: null,
      },
    ],
  }
  const result = resolveGovernanceRoute(VALID_ACTION, registry)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_REVOKED))
})

// ── Test 8: consumed authority returns NULL ───────────────────────────────────

test('8. consumed authority returns NULL', () => {
  const registry = {
    entries: [
      {
        authority_path_id: 'auth-consumed',
        domain: 'execution',
        surface: 'execute',
        scope: { resource: 'worker-a' },
        status: 'CONSUMED',
        expires_at: null,
      },
    ],
  }
  const result = resolveGovernanceRoute(VALID_ACTION, registry)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_CONSUMED))
})

// ── Test 9: routing cannot create authority ───────────────────────────────────

test('9. routing cannot create authority — input with creates_authority: true returns NULL', () => {
  const action = { ...VALID_ACTION, creates_authority: true }
  const result = resolveGovernanceRoute(action, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_ATTEMPT))
  assert.equal(result.creates_authority, false)
})

test('9b. validateGovernanceRouteBoundary detects authority creation attempt', () => {
  const violation = validateGovernanceRouteBoundary({ creates_authority: true })
  assert.equal(violation, GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_AUTHORITY_ATTEMPT)
})

// ── Test 10: routing cannot execute ──────────────────────────────────────────

test('10. routing cannot execute — input with creates_execution: true returns NULL', () => {
  const action = { ...VALID_ACTION, creates_execution: true }
  const result = resolveGovernanceRoute(action, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_EXECUTION_ATTEMPT))
  assert.equal(result.creates_execution, false)
})

test('10b. validateGovernanceRouteBoundary detects execution attempt (triggers_execution)', () => {
  const violation = validateGovernanceRouteBoundary({ triggers_execution: true })
  assert.equal(violation, GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_EXECUTION_ATTEMPT)
})

// ── Test 11: routing cannot validate AEOs ────────────────────────────────────

test('11. routing cannot validate AEOs — input with validates_objects: true returns NULL', () => {
  const action = { ...VALID_ACTION, validates_objects: true }
  const result = resolveGovernanceRoute(action, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_VALIDATION_ATTEMPT))
  assert.equal(result.validates_objects, false)
})

test('11b. validateGovernanceRouteBoundary detects AEO validation attempt (validates_aeo)', () => {
  const violation = validateGovernanceRouteBoundary({ validates_aeo: true })
  assert.equal(violation, GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_VALIDATION_ATTEMPT)
})

// ── Test 12: routing cannot create proof ──────────────────────────────────────

test('12. routing cannot create proof — input with creates_proof: true returns NULL', () => {
  const action = { ...VALID_ACTION, creates_proof: true }
  const result = resolveGovernanceRoute(action, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_PROOF_ATTEMPT))
  assert.equal(result.creates_proof, false)
})

test('12b. validateGovernanceRouteBoundary detects proof creation attempt', () => {
  const violation = validateGovernanceRouteBoundary({ creates_proof: true })
  assert.equal(violation, GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_PROOF_ATTEMPT)
})

// ── Test 13: routing cannot mutate registries ─────────────────────────────────

test('13. routing cannot mutate registries — mutates_registry: true returns NULL', () => {
  const action = { ...VALID_ACTION, mutates_registry: true }
  const result = resolveGovernanceRoute(action, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_BOUNDARY_VIOLATION))
})

test('13b. routing cannot mutate registries — mutates_registries: true returns NULL', () => {
  const action = { ...VALID_ACTION, mutates_registries: true }
  const result = resolveGovernanceRoute(action, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.ok(result.route_classes.includes(GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_BOUNDARY_VIOLATION))
})

test('13c. validateGovernanceRouteBoundary detects other boundary violations', () => {
  for (const flag of ['repairs_lineage', 'expands_runtime_route', 'triggers_deployment', 'normalize_break_glass']) {
    const violation = validateGovernanceRouteBoundary({ [flag]: true })
    assert.equal(
      violation,
      GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_BOUNDARY_VIOLATION,
      `Expected boundary_violation for ${flag}`,
    )
  }
})

// ── Test 14: route output remains evidence_only ───────────────────────────────

test('14. route output remains evidence_only (resolved)', () => {
  const result = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.evidence_only, true)
})

test('14b. route output remains evidence_only (null result)', () => {
  const result = resolveGovernanceRoute({ intent: 'x', domain: 'execution', surface: 'execute', scope: {}, target: {} }, { entries: [] })
  assert.equal(result.evidence_only, true)
})

// ── Test 15: route output has creates_authority false ─────────────────────────

test('15. route output has creates_authority false', () => {
  const result = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.creates_authority, false)
})

// ── Test 16: route output has creates_execution false ────────────────────────

test('16. route output has creates_execution false', () => {
  const result = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.creates_execution, false)
})

// ── Test 17: route output has creates_proof false ────────────────────────────

test('17. route output has creates_proof false', () => {
  const result = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.creates_proof, false)
})

// ── Test 18: route output has validates_objects false ────────────────────────

test('18. route output has validates_objects false', () => {
  const result = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result.validates_objects, false)
})

// ── Test 19: same route state produces same hash ──────────────────────────────

test('19. same route state produces same hash', () => {
  const result1 = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  const result2 = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(result1.route_hash, result2.route_hash)
  assert.equal(result1.route_hash_alg, 'sha256')
})

test('19b. same NULL state produces same hash', () => {
  const action = { intent: 'x', domain: 'execution', surface: 'execute', scope: {}, target: {} }
  const r1 = resolveGovernanceRoute(action, { entries: [] })
  const r2 = resolveGovernanceRoute(action, { entries: [] })
  assert.equal(r1.route_hash, r2.route_hash)
})

// ── Test 20: reordered route classes preserve hash stability ──────────────────

test('20. reordered route classes preserve hash stability', () => {
  // computeGovernanceRouteHash sorts route_classes before hashing
  const fields = {
    route_result: GOVERNANCE_ROUTING_RESULTS.ROUTE_RESOLVED,
    route_classes: [
      GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_RESOLVED,
      GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_BOUNDARY_VIOLATION,
    ],
    intent: 'test-intent',
    domain: 'execution',
    surface: 'execute',
    authority_path_id: 'auth-001',
    scope: {},
    target: {},
  }

  const fieldsReordered = {
    ...fields,
    route_classes: [
      GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_BOUNDARY_VIOLATION,
      GOVERNANCE_ROUTING_CLASSES.GOVERNANCE_ROUTE_RESOLVED,
    ],
  }

  const hash1 = computeGovernanceRouteHash(fields)
  const hash2 = computeGovernanceRouteHash(fieldsReordered)
  assert.equal(hash1, hash2, 'Hash must be stable regardless of route_classes order')
})

// ── Test 21: route hash excludes route_hash itself ────────────────────────────

test('21. route hash excludes route_hash itself (no circular dependency)', () => {
  const result = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)

  // Hash is 64 hex chars (SHA-256)
  assert.ok(typeof result.route_hash === 'string')
  assert.equal(result.route_hash.length, 64)
  assert.match(result.route_hash, /^[0-9a-f]{64}$/)

  // Recomputing with the same inputs produces the same hash —
  // confirming it doesn't feed on itself
  const recomputed = computeGovernanceRouteHash({
    route_result: result.route_result,
    route_classes: result.route_classes,
    intent: result.intent,
    domain: result.domain,
    surface: result.surface,
    authority_path_id: result.authority_path_id,
    scope: result.scope,
    target: result.target,
  })
  assert.equal(result.route_hash, recomputed)
})

// ── Test 22: routing output cannot become authority ───────────────────────────

test('22. routing output cannot become authority', () => {
  const result = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)

  // Artifact type is GOVERNANCE_ROUTE_RESOLUTION, not an authority type
  assert.equal(result.artifact, 'GOVERNANCE_ROUTE_RESOLUTION')
  assert.equal(result.creates_authority, false)
  assert.equal(result.evidence_only, true)

  // No authority-type identity fields
  assert.ok(!('authority_id' in result))
  assert.ok(!('authority_hash' in result))
  assert.ok(!('authority_proof' in result))

  // validateGovernanceRouteBoundary returns no violation for the output
  // (output already has correct false flags — boundary guard is for inputs)
  const violation = validateGovernanceRouteBoundary(result)
  assert.equal(violation, null, 'Routing output must not trigger its own boundary guard')
})

// ── Test 23: AEO compilation eligibility only exists after ROUTE_RESOLVED ─────

test('23. AEO compilation eligibility only exists after ROUTE_RESOLVED', () => {
  const resolved = resolveGovernanceRoute(VALID_ACTION, REGISTRY_WITH_ONE_ACTIVE)
  assert.equal(resolved.route_result, GOVERNANCE_ROUTING_RESULTS.ROUTE_RESOLVED)

  // Eligibility check: only ROUTE_RESOLVED grants compilation eligibility
  const isEligibleForAEOCompilation = (r) =>
    r.route_result === GOVERNANCE_ROUTING_RESULTS.ROUTE_RESOLVED

  assert.equal(isEligibleForAEOCompilation(resolved), true)
})

// ── Test 24: unresolved route cannot proceed to compilation eligibility ────────

test('24. unresolved route cannot proceed to compilation eligibility', () => {
  const isEligibleForAEOCompilation = (r) =>
    r.route_result === GOVERNANCE_ROUTING_RESULTS.ROUTE_RESOLVED

  // Missing route
  const missing = resolveGovernanceRoute(
    { intent: 'x', domain: 'execution', surface: 'execute', scope: {}, target: {} },
    { entries: [] },
  )
  assert.equal(missing.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.equal(isEligibleForAEOCompilation(missing), false)

  // Unknown surface
  const unknownSurface = resolveGovernanceRoute(
    { intent: 'x', domain: 'execution', surface: 'unknown_surface', scope: {}, target: {} },
    REGISTRY_WITH_ONE_ACTIVE,
  )
  assert.equal(unknownSurface.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.equal(isEligibleForAEOCompilation(unknownSurface), false)

  // Revoked authority
  const revoked = resolveGovernanceRoute(VALID_ACTION, {
    entries: [{ ...ACTIVE_AUTHORITY, status: 'REVOKED' }],
  })
  assert.equal(revoked.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.equal(isEligibleForAEOCompilation(revoked), false)

  // Boundary violation attempt
  const authorityAttempt = resolveGovernanceRoute(
    { ...VALID_ACTION, creates_authority: true },
    REGISTRY_WITH_ONE_ACTIVE,
  )
  assert.equal(authorityAttempt.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  assert.equal(isEligibleForAEOCompilation(authorityAttempt), false)
})

// ── Test 25: malformed inputs return NULL, not throw ──────────────────────────

test('25. malformed inputs return NULL, not throw', () => {
  const malformedInputs = [null, undefined, 'string-input', 42, true, [], {}]

  for (const input of malformedInputs) {
    assert.doesNotThrow(() => {
      const result = resolveGovernanceRoute(input)
      assert.equal(result.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
      assert.equal(result.evidence_only, true)
      assert.equal(result.creates_authority, false)
    }, `Input ${JSON.stringify(input)} must not throw`)
  }
})

test('25b. missing intent or domain returns NULL (not throw)', () => {
  assert.doesNotThrow(() => {
    const r1 = resolveGovernanceRoute({ domain: 'execution', surface: 'execute' })
    assert.equal(r1.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  })
  assert.doesNotThrow(() => {
    const r2 = resolveGovernanceRoute({ intent: 'test', surface: 'execute' })
    assert.equal(r2.route_result, GOVERNANCE_ROUTING_RESULTS.NULL)
  })
})

// ── classifyGovernanceDomain coverage ────────────────────────────────────────

test('classifyGovernanceDomain returns domain string for valid action', () => {
  assert.equal(classifyGovernanceDomain({ domain: 'execution', surface: 'execute' }), 'execution')
  assert.equal(classifyGovernanceDomain({ domain: 'governance' }), 'governance')
})

test('classifyGovernanceDomain returns null for malformed inputs', () => {
  assert.equal(classifyGovernanceDomain(null), null)
  assert.equal(classifyGovernanceDomain(undefined), null)
  assert.equal(classifyGovernanceDomain('string'), null)
  assert.equal(classifyGovernanceDomain({}), null)
  assert.equal(classifyGovernanceDomain({ domain: null }), null)
  assert.equal(classifyGovernanceDomain({ domain: '' }), null)
  assert.equal(classifyGovernanceDomain([]), null)
})

// ── validateGovernanceRouteBoundary no-violation coverage ────────────────────

test('validateGovernanceRouteBoundary returns null for clean inputs', () => {
  assert.equal(validateGovernanceRouteBoundary({}), null)
  assert.equal(validateGovernanceRouteBoundary({ intent: 'test' }), null)
  assert.equal(validateGovernanceRouteBoundary(null), null)
  assert.equal(validateGovernanceRouteBoundary(undefined), null)
  assert.equal(validateGovernanceRouteBoundary([]), null)
  assert.equal(validateGovernanceRouteBoundary({ creates_authority: false }), null)
  assert.equal(validateGovernanceRouteBoundary({ creates_execution: false }), null)
})
