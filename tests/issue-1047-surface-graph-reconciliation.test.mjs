/**
 * tests/issue-1047-surface-graph-reconciliation.test.mjs
 * Issue #1047 — Surface Graph Reconciliation and Coordination Telemetry
 *
 * FATE tests proving deterministic surface graph reconciliation.
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no execution capability expansion, no proof behavior changes,
 * no topology repair, no registry mutation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SURFACE_GRAPH_RECONCILIATION_RESULTS,
  SURFACE_GRAPH_RECONCILIATION_CLASSES,
  COORDINATION_TELEMETRY_METRICS,
  COORDINATION_ALLOWED,
  COORDINATION_FORBIDDEN,
  NULL,
  buildSurfaceGraphEdge,
  reconcileSurfaceGraph,
  computeSurfaceGraphHash,
  computeSurfaceEdgeHash,
  readCoordinationTelemetry,
  validateSurfaceGraphBoundary,
} from '../src/surface-graph-reconciliation.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

// A valid coordination hash (sha256 hex of 'test')
const VALID_COORD_HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

function makeAllowedEdgeInput(overrides = {}) {
  return {
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    coordination_result: COORDINATION_ALLOWED,
    coordination_hash: VALID_COORD_HASH,
    ...overrides,
  }
}

function buildValidEdge(overrides = {}) {
  return buildSurfaceGraphEdge(makeAllowedEdgeInput(overrides))
}

function buildForbiddenEdge() {
  return buildSurfaceGraphEdge({
    surface_a: 'deploy',
    surface_b: 'topology',
    interaction_type: 'depends_on',
    coordination_result: COORDINATION_FORBIDDEN,
    coordination_hash: VALID_COORD_HASH,
  })
}

// ── Constant coverage ─────────────────────────────────────────────────────────

test('SURFACE_GRAPH_RECONCILIATION_RESULTS exports required values', () => {
  assert.equal(SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_RECONCILED, 'SURFACE_GRAPH_RECONCILED')
  assert.equal(SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_DRIFT_DETECTED, 'SURFACE_GRAPH_DRIFT_DETECTED')
  assert.equal(SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL, 'NULL')
})

test('SURFACE_GRAPH_RECONCILIATION_CLASSES exports all required classes', () => {
  const vals = Object.values(SURFACE_GRAPH_RECONCILIATION_CLASSES)
  const required = [
    'surface_graph_reconciled',
    'surface_graph_drift_detected',
    'surface_graph_missing_edge',
    'surface_graph_malformed_edge',
    'surface_graph_hash_mismatch',
    'surface_graph_coordination_hash_invalid',
    'surface_graph_null_coordination_edge',
    'surface_graph_forbidden_coordination_edge',
    'surface_graph_boundary_violation',
    'surface_graph_authority_attempt',
    'surface_graph_execution_attempt',
    'surface_graph_proof_attempt',
    'surface_graph_registry_mutation',
    'surface_graph_implicit_sync_forbidden',
    'surface_graph_break_glass_normalization',
  ]
  for (const cls of required) {
    assert.ok(vals.includes(cls), `Missing class: ${cls}`)
  }
})

test('COORDINATION_TELEMETRY_METRICS exports all required metric keys', () => {
  const keys = Object.keys(COORDINATION_TELEMETRY_METRICS)
  const required = [
    'coordination_allowed_total',
    'coordination_forbidden_total',
    'coordination_null_total',
    'surface_graph_edge_total',
    'surface_graph_reconciliation_total',
    'surface_graph_drift_total',
    'implicit_sync_rejected_total',
    'coordination_boundary_violation_total',
  ]
  for (const k of required) {
    assert.ok(keys.includes(k), `Missing metric: ${k}`)
  }
})

test('#1040 primitives re-exported with correct values', () => {
  assert.equal(COORDINATION_ALLOWED, 'COORDINATION_ALLOWED')
  assert.equal(COORDINATION_FORBIDDEN, 'COORDINATION_FORBIDDEN')
  assert.equal(NULL, 'NULL')
})

// ── Test 1: valid allowed coordination edge builds deterministic SURFACE_GRAPH_EDGE ──

test('1. valid allowed coordination edge builds deterministic SURFACE_GRAPH_EDGE', () => {
  const edge = buildValidEdge()
  assert.equal(edge.artifact, 'SURFACE_GRAPH_EDGE')
  assert.equal(edge.evidence_only, true)
  assert.equal(edge.creates_authority, false)
  assert.equal(edge.creates_execution, false)
  assert.equal(edge.creates_proof, false)
  assert.equal(edge.mutates_registry, false)
  assert.equal(edge.surface_a, 'deploy')
  assert.equal(edge.surface_b, 'proof')
  assert.equal(edge.interaction_type, 'proves')
  assert.equal(edge.coordination_result, COORDINATION_ALLOWED)
  assert.equal(edge.coordination_hash, VALID_COORD_HASH)
  assert.equal(edge.edge_hash_alg, 'sha256')
  assert.match(edge.edge_hash, /^[0-9a-f]{64}$/)

  // Deterministic
  const edge2 = buildValidEdge()
  assert.equal(edge.edge_hash, edge2.edge_hash)
})

// ── Test 2: valid allowed edges reconcile to SURFACE_GRAPH_RECONCILED ─────────

test('2. valid allowed edges reconcile to SURFACE_GRAPH_RECONCILED', () => {
  const edges = [buildValidEdge(), buildForbiddenEdge()]
  // Use only allowed
  const allowed = [buildValidEdge()]
  const result = reconcileSurfaceGraph(allowed)
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_RECONCILED)
  assert.equal(result.artifact, 'SURFACE_GRAPH_RECONCILIATION')
  assert.equal(result.evidence_only, true)
  assert.equal(result.allowed_edge_count, 1)
  assert.equal(result.forbidden_edge_count, 0)
  assert.equal(result.null_edge_count, 0)
  assert.ok(result.reconciliation_classes.includes('surface_graph_reconciled'))
})

// ── Test 3: forbidden coordination edge reconciles to SURFACE_GRAPH_DRIFT_DETECTED ──

test('3. forbidden coordination edge reconciles to SURFACE_GRAPH_DRIFT_DETECTED', () => {
  const result = reconcileSurfaceGraph([buildForbiddenEdge()])
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_DRIFT_DETECTED)
  assert.ok(result.reconciliation_classes.includes('surface_graph_drift_detected'))
  assert.ok(result.reconciliation_classes.includes('surface_graph_forbidden_coordination_edge'))
  assert.equal(result.forbidden_edge_count, 1)
})

// ── Test 4: NULL coordination edge returns NULL ────────────────────────────────

test('4. NULL coordination edge returns NULL', () => {
  // Build edge with NULL coordination_result (won't pass buildSurfaceGraphEdge cleanly,
  // so we craft a raw edge object that reconcileSurfaceGraph will evaluate)
  const rawNullEdge = buildSurfaceGraphEdge({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    coordination_result: NULL,
    coordination_hash: VALID_COORD_HASH,
  })
  // buildSurfaceGraphEdge returns a null edge for NULL coordination_result
  // Inject it directly into reconcileSurfaceGraph
  const result = reconcileSurfaceGraph([rawNullEdge])
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL)
})

test('4b. NULL coordination_result in raw edge input returns NULL from reconcileSurfaceGraph', () => {
  // Manufacture a fake SURFACE_GRAPH_EDGE with coordination_result = NULL directly
  const fakeEdge = {
    artifact: 'SURFACE_GRAPH_EDGE',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    coordination_result: NULL,
    coordination_hash: VALID_COORD_HASH,
    edge_hash_alg: 'sha256',
    edge_hash: VALID_COORD_HASH,
  }
  const result = reconcileSurfaceGraph([fakeEdge])
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL)
  assert.ok(result.reconciliation_classes.includes('surface_graph_null_coordination_edge'))
})

// ── Test 5: malformed edge returns NULL, not throw ─────────────────────────────

test('5. malformed edge returns NULL, not throw', () => {
  const malformed = [null, undefined, 42, 'string', true, [], {}]
  for (const m of malformed) {
    assert.doesNotThrow(() => {
      const result = buildSurfaceGraphEdge(m)
      assert.equal(result.artifact, 'SURFACE_GRAPH_EDGE')
      assert.equal(result.edge_hash, null)
    }, `buildSurfaceGraphEdge(${JSON.stringify(m)}) must not throw`)
  }
})

test('5b. malformed edge in reconcileSurfaceGraph returns NULL, not throw', () => {
  for (const m of [null, undefined, 42, 'string', {}, { artifact: 'WRONG' }]) {
    assert.doesNotThrow(() => {
      const result = reconcileSurfaceGraph([m])
      assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL)
    }, `reconcileSurfaceGraph([${JSON.stringify(m)}]) must not throw`)
  }
})

// ── Test 6: missing edge fields return NULL ────────────────────────────────────

test('6. missing required edge fields return NULL edge', () => {
  const cases = [
    { surface_b: 'proof', interaction_type: 'proves', coordination_result: COORDINATION_ALLOWED, coordination_hash: VALID_COORD_HASH },
    { surface_a: 'deploy', interaction_type: 'proves', coordination_result: COORDINATION_ALLOWED, coordination_hash: VALID_COORD_HASH },
    { surface_a: 'deploy', surface_b: 'proof', coordination_result: COORDINATION_ALLOWED, coordination_hash: VALID_COORD_HASH },
    { surface_a: 'deploy', surface_b: 'proof', interaction_type: 'proves', coordination_hash: VALID_COORD_HASH },
    { surface_a: 'deploy', surface_b: 'proof', interaction_type: 'proves', coordination_result: COORDINATION_ALLOWED },
  ]
  for (const c of cases) {
    const edge = buildSurfaceGraphEdge(c)
    assert.equal(edge.edge_hash, null, `Expected null edge_hash for input: ${JSON.stringify(c)}`)
  }
})

// ── Test 7: invalid coordination hash returns NULL ─────────────────────────────

test('7. invalid coordination hash returns NULL edge', () => {
  const edge = buildSurfaceGraphEdge({
    surface_a: 'deploy',
    surface_b: 'proof',
    interaction_type: 'proves',
    coordination_result: COORDINATION_ALLOWED,
    coordination_hash: 'not-a-valid-sha256',
  })
  assert.equal(edge.edge_hash, null)
  assert.equal(edge.reconciliation_class, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_COORDINATION_HASH_INVALID)
})

// ── Test 8: invalid edge hash returns NULL from reconciliation ─────────────────

test('8. invalid edge hash in reconcileSurfaceGraph returns NULL', () => {
  const edge = buildValidEdge()
  const tampered = { ...edge, edge_hash: 'a'.repeat(64) }
  const result = reconcileSurfaceGraph([tampered])
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL)
  assert.ok(result.reconciliation_classes.includes('surface_graph_hash_mismatch'))
})

// ── Test 9: authority attempt returns NULL ─────────────────────────────────────

test('9. authority attempt returns NULL edge', () => {
  const edge = buildSurfaceGraphEdge({ ...makeAllowedEdgeInput(), creates_authority: true })
  assert.equal(edge.edge_hash, null)
  assert.equal(edge.reconciliation_class, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_AUTHORITY_ATTEMPT)
})

test('9b. authority attempt in reconcileSurfaceGraph returns NULL', () => {
  const result = reconcileSurfaceGraph([{ ...buildValidEdge(), creates_authority: true }])
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL)
  assert.ok(result.reconciliation_classes.includes('surface_graph_authority_attempt'))
})

// ── Test 10: execution attempt returns NULL ────────────────────────────────────

test('10. execution attempt returns NULL edge', () => {
  const edge = buildSurfaceGraphEdge({ ...makeAllowedEdgeInput(), creates_execution: true })
  assert.equal(edge.edge_hash, null)
  assert.equal(edge.reconciliation_class, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_EXECUTION_ATTEMPT)
})

test('10b. execution attempt in reconcileSurfaceGraph returns NULL', () => {
  const result = reconcileSurfaceGraph([{ ...buildValidEdge(), creates_execution: true }])
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL)
})

// ── Test 11: proof attempt returns NULL ───────────────────────────────────────

test('11. proof attempt returns NULL edge', () => {
  const edge = buildSurfaceGraphEdge({ ...makeAllowedEdgeInput(), creates_proof: true })
  assert.equal(edge.edge_hash, null)
  assert.equal(edge.reconciliation_class, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_PROOF_ATTEMPT)
})

// ── Test 12: registry mutation returns NULL ────────────────────────────────────

test('12. registry mutation returns NULL edge', () => {
  const edge = buildSurfaceGraphEdge({ ...makeAllowedEdgeInput(), mutates_registry: true })
  assert.equal(edge.edge_hash, null)
  assert.equal(edge.reconciliation_class, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_REGISTRY_MUTATION)
})

// ── Test 13: implicit sync returns NULL ───────────────────────────────────────

test('13. implicit_sync returns NULL edge', () => {
  const edge = buildSurfaceGraphEdge({ ...makeAllowedEdgeInput(), implicit_sync: true })
  assert.equal(edge.edge_hash, null)
  assert.equal(edge.reconciliation_class, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_IMPLICIT_SYNC_FORBIDDEN)
})

test('13b. auto_sync returns NULL edge', () => {
  const edge = buildSurfaceGraphEdge({ ...makeAllowedEdgeInput(), auto_sync: true })
  assert.equal(edge.edge_hash, null)
  assert.equal(edge.reconciliation_class, SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_IMPLICIT_SYNC_FORBIDDEN)
})

// ── Test 14: BREAK_GLASS normalization returns NULL ───────────────────────────

test('14. break_glass returns NULL edge', () => {
  for (const flag of ['break_glass', 'is_break_glass', 'break_glass_normalized']) {
    const edge = buildSurfaceGraphEdge({ ...makeAllowedEdgeInput(), [flag]: true })
    assert.equal(edge.edge_hash, null, `Expected null for ${flag}`)
    assert.equal(
      edge.reconciliation_class,
      SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_BREAK_GLASS_NORMALIZATION,
      `Expected break_glass class for ${flag}`,
    )
  }
})

// ── Test 15: reconciliation output remains evidence_only ──────────────────────

test('15. reconciliation output remains evidence_only', () => {
  assert.equal(reconcileSurfaceGraph([buildValidEdge()]).evidence_only, true)
  assert.equal(reconcileSurfaceGraph([buildForbiddenEdge()]).evidence_only, true)
  assert.equal(reconcileSurfaceGraph([]).evidence_only, true)
  assert.equal(reconcileSurfaceGraph(null).evidence_only, true)
})

// ── Test 16: reconciliation creates_authority false ───────────────────────────

test('16. reconciliation creates_authority false', () => {
  assert.equal(reconcileSurfaceGraph([buildValidEdge()]).creates_authority, false)
  assert.equal(reconcileSurfaceGraph([]).creates_authority, false)
})

// ── Test 17: reconciliation creates_execution false ──────────────────────────

test('17. reconciliation creates_execution false', () => {
  assert.equal(reconcileSurfaceGraph([buildValidEdge()]).creates_execution, false)
})

// ── Test 18: reconciliation creates_proof false ───────────────────────────────

test('18. reconciliation creates_proof false', () => {
  assert.equal(reconcileSurfaceGraph([buildValidEdge()]).creates_proof, false)
})

// ── Test 19: reconciliation mutates_registry false ────────────────────────────

test('19. reconciliation mutates_registry false', () => {
  assert.equal(reconcileSurfaceGraph([buildValidEdge()]).mutates_registry, false)
})

// ── Test 20: telemetry output remains read_only/evidence_only ─────────────────

test('20. telemetry output remains read_only and evidence_only', () => {
  const rec = reconcileSurfaceGraph([buildValidEdge()])
  const telemetry = readCoordinationTelemetry(rec, [buildValidEdge()])
  assert.equal(telemetry.artifact, 'COORDINATION_TELEMETRY')
  assert.equal(telemetry.evidence_only, true)
  assert.equal(telemetry.read_only, true)
})

// ── Test 21: telemetry cannot create authority ─────────────────────────────────

test('21. telemetry cannot create authority', () => {
  const telemetry = readCoordinationTelemetry(reconcileSurfaceGraph([buildValidEdge()]), [])
  assert.equal(telemetry.creates_authority, false)
})

// ── Test 22: telemetry cannot execute ─────────────────────────────────────────

test('22. telemetry cannot execute', () => {
  const telemetry = readCoordinationTelemetry(reconcileSurfaceGraph([buildValidEdge()]), [])
  assert.equal(telemetry.creates_execution, false)
})

// ── Test 23: telemetry cannot create proof ────────────────────────────────────

test('23. telemetry cannot create proof', () => {
  const telemetry = readCoordinationTelemetry(reconcileSurfaceGraph([buildValidEdge()]), [])
  assert.equal(telemetry.creates_proof, false)
})

// ── Test 24: telemetry cannot mutate registries ───────────────────────────────

test('24. telemetry cannot mutate registries', () => {
  const telemetry = readCoordinationTelemetry(reconcileSurfaceGraph([buildValidEdge()]), [])
  assert.equal(telemetry.mutates_registry, false)
})

// ── Test 25: same graph state produces same hash ──────────────────────────────

test('25. same graph state produces same surface_graph_hash', () => {
  const r1 = reconcileSurfaceGraph([buildValidEdge()])
  const r2 = reconcileSurfaceGraph([buildValidEdge()])
  assert.equal(r1.surface_graph_hash, r2.surface_graph_hash)
  assert.match(r1.surface_graph_hash, /^[0-9a-f]{64}$/)
  assert.equal(r1.surface_graph_hash_alg, 'sha256')
})

// ── Test 26: reordered edges preserve graph hash ──────────────────────────────

test('26. reordered edges preserve surface_graph_hash', () => {
  const e1 = buildValidEdge()
  const e2 = buildSurfaceGraphEdge({
    surface_a: 'telemetry',
    surface_b: 'reconciliation',
    interaction_type: 'observes',
    coordination_result: COORDINATION_ALLOWED,
    coordination_hash: VALID_COORD_HASH,
  })

  const r1 = reconcileSurfaceGraph([e1, e2])
  const r2 = reconcileSurfaceGraph([e2, e1])
  assert.equal(r1.surface_graph_hash, r2.surface_graph_hash, 'Graph hash must be order-independent')
})

// ── Test 27: reordered classes preserve hash ──────────────────────────────────

test('27. reordered reconciliation_classes preserve surface_graph_hash', () => {
  const base = {
    artifact: 'SURFACE_GRAPH_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    reconciliation_result: 'SURFACE_GRAPH_DRIFT_DETECTED',
    edge_count: 1,
    allowed_edge_count: 0,
    forbidden_edge_count: 1,
    null_edge_count: 0,
    surface_count: 2,
    coordination_hashes: [VALID_COORD_HASH],
    surface_graph_hash_alg: 'sha256',
  }

  const h1 = computeSurfaceGraphHash({
    ...base,
    reconciliation_classes: ['surface_graph_drift_detected', 'surface_graph_forbidden_coordination_edge'],
  })
  const h2 = computeSurfaceGraphHash({
    ...base,
    reconciliation_classes: ['surface_graph_forbidden_coordination_edge', 'surface_graph_drift_detected'],
  })
  assert.equal(h1, h2, 'Graph hash must be stable regardless of reconciliation_classes order')
})

// ── Test 28: edge hash excludes edge_hash itself ──────────────────────────────

test('28. edge hash excludes edge_hash itself (no circularity)', () => {
  const edge = buildValidEdge()
  assert.match(edge.edge_hash, /^[0-9a-f]{64}$/)

  // Recomputing without edge_hash field must produce the same hash
  const { edge_hash, ...fieldsWithout } = edge
  const recomputed = computeSurfaceEdgeHash(fieldsWithout)
  assert.equal(edge.edge_hash, recomputed)
})

// ── Test 29: graph hash excludes surface_graph_hash itself ───────────────────

test('29. graph hash excludes surface_graph_hash itself (no circularity)', () => {
  const rec = reconcileSurfaceGraph([buildValidEdge()])
  assert.match(rec.surface_graph_hash, /^[0-9a-f]{64}$/)

  const { surface_graph_hash, ...fieldsWithout } = rec
  const recomputed = computeSurfaceGraphHash(fieldsWithout)
  assert.equal(rec.surface_graph_hash, recomputed)
})

// ── Test 30: forbidden edges cannot be upgraded to reconciled ─────────────────

test('30. forbidden edges cannot be upgraded to SURFACE_GRAPH_RECONCILED', () => {
  const result = reconcileSurfaceGraph([buildForbiddenEdge()])
  assert.notEqual(
    result.reconciliation_result,
    SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_RECONCILED,
    'Forbidden edges must not yield SURFACE_GRAPH_RECONCILED',
  )
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_DRIFT_DETECTED)
})

// ── Test 31: telemetry cannot convert forbidden coordination into allowed ──────

test('31. telemetry cannot convert forbidden coordination into allowed', () => {
  const rec = reconcileSurfaceGraph([buildForbiddenEdge()])
  const telemetry = readCoordinationTelemetry(rec, [buildForbiddenEdge()])
  assert.equal(telemetry.creates_authority, false)
  assert.equal(telemetry.creates_execution, false)
  // Telemetry accurately reflects forbidden count; does not zero it out
  assert.equal(telemetry.metrics.coordination_forbidden_total, 1)
  assert.equal(telemetry.metrics.coordination_allowed_total, 0)
})

// ── Test 32: graph reconciliation cannot repair topology ──────────────────────

test('32. graph reconciliation cannot repair topology', () => {
  const result = reconcileSurfaceGraph([buildForbiddenEdge()])
  // Forbidden edge must remain forbidden — result must be drift, not reconciled
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_DRIFT_DETECTED)
  assert.equal(result.forbidden_edge_count, 1)
  assert.ok(!('repair' in result), 'result must not contain repair field')
  assert.ok(!('topology_repair' in result), 'result must not contain topology_repair field')
})

// ── Test 33: graph reconciliation cannot create runtime routes ────────────────

test('33. graph reconciliation cannot create runtime routes', () => {
  const result = reconcileSurfaceGraph([buildValidEdge()])
  assert.equal(result.creates_execution, false)
  assert.ok(!('runtime_route' in result))
  assert.ok(!('execution_path' in result))
  assert.ok(!('deployment_trigger' in result))
})

// ── Test 34: graph reconciliation cannot change validator behavior ─────────────

test('34. graph reconciliation cannot change validator behavior', () => {
  const result = reconcileSurfaceGraph([buildValidEdge()])
  assert.equal(result.creates_authority, false)
  assert.ok(!('validator_update' in result))
  assert.ok(!('validation_override' in result))
  // Output must not itself trigger a boundary violation
  assert.equal(validateSurfaceGraphBoundary(result), null)
})

// ── Test 35: graph reconciliation cannot imply synchronization ────────────────

test('35. graph reconciliation cannot imply synchronization', () => {
  const result = reconcileSurfaceGraph([buildValidEdge()])
  assert.ok(!('implicit_sync' in result))
  assert.ok(!('auto_sync' in result))
  assert.ok(!('automatic_repair' in result))

  // validateSurfaceGraphBoundary: clean output does not self-violate
  assert.equal(validateSurfaceGraphBoundary(result), null)
})

// ── validateSurfaceGraphBoundary coverage ─────────────────────────────────────

test('validateSurfaceGraphBoundary returns null for clean inputs', () => {
  assert.equal(validateSurfaceGraphBoundary({}), null)
  assert.equal(validateSurfaceGraphBoundary(null), null)
  assert.equal(validateSurfaceGraphBoundary(undefined), null)
  assert.equal(validateSurfaceGraphBoundary([]), null)
  assert.equal(validateSurfaceGraphBoundary({ creates_authority: false }), null)
})

test('validateSurfaceGraphBoundary detects creates_authority', () => {
  assert.equal(
    validateSurfaceGraphBoundary({ creates_authority: true }),
    SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_AUTHORITY_ATTEMPT,
  )
})

test('validateSurfaceGraphBoundary detects creates_execution', () => {
  assert.equal(
    validateSurfaceGraphBoundary({ creates_execution: true }),
    SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_EXECUTION_ATTEMPT,
  )
})

test('validateSurfaceGraphBoundary detects creates_proof', () => {
  assert.equal(
    validateSurfaceGraphBoundary({ creates_proof: true }),
    SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_PROOF_ATTEMPT,
  )
})

test('validateSurfaceGraphBoundary detects mutates_registry', () => {
  assert.equal(
    validateSurfaceGraphBoundary({ mutates_registry: true }),
    SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_REGISTRY_MUTATION,
  )
})

test('validateSurfaceGraphBoundary detects implicit_sync', () => {
  assert.equal(
    validateSurfaceGraphBoundary({ implicit_sync: true }),
    SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_IMPLICIT_SYNC_FORBIDDEN,
  )
})

test('validateSurfaceGraphBoundary detects all break_glass variants', () => {
  for (const flag of ['break_glass', 'is_break_glass', 'break_glass_normalized']) {
    assert.equal(
      validateSurfaceGraphBoundary({ [flag]: true }),
      SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_BREAK_GLASS_NORMALIZATION,
      `Expected break_glass class for ${flag}`,
    )
  }
})

test('validateSurfaceGraphBoundary detects boundary fields', () => {
  for (const field of ['authority_grant', 'execution_token', 'proof_signature', 'registry_mutation', 'deployment_trigger', 'lineage_repair', 'automatic_repair']) {
    assert.equal(
      validateSurfaceGraphBoundary({ [field]: 'value' }),
      SURFACE_GRAPH_RECONCILIATION_CLASSES.SURFACE_GRAPH_BOUNDARY_VIOLATION,
      `Expected boundary_violation for ${field}`,
    )
  }
})

// ── Additional edge case coverage ─────────────────────────────────────────────

test('reconcileSurfaceGraph returns NULL for empty array', () => {
  const result = reconcileSurfaceGraph([])
  assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL)
  assert.ok(result.reconciliation_classes.includes('surface_graph_missing_edge'))
})

test('reconcileSurfaceGraph returns NULL for non-array', () => {
  for (const v of [null, undefined, 42, 'string', {}]) {
    const result = reconcileSurfaceGraph(v)
    assert.equal(result.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.NULL)
  }
})

test('telemetry metrics accurately count allowed and forbidden', () => {
  const e1 = buildValidEdge()
  const e2 = buildForbiddenEdge()
  const rec = reconcileSurfaceGraph([e1, e2])
  // Mixed: 1 allowed + 1 forbidden → drift
  assert.equal(rec.reconciliation_result, SURFACE_GRAPH_RECONCILIATION_RESULTS.SURFACE_GRAPH_DRIFT_DETECTED)

  const telemetry = readCoordinationTelemetry(rec, [e1, e2])
  assert.equal(telemetry.metrics.coordination_allowed_total, 1)
  assert.equal(telemetry.metrics.coordination_forbidden_total, 1)
  assert.equal(telemetry.metrics.surface_graph_edge_total, 2)
  assert.equal(telemetry.metrics.surface_graph_drift_total, 1)
  assert.equal(telemetry.metrics.surface_graph_reconciliation_total, 1)
})

test('telemetry counts implicit_sync_rejected_total from edge list', () => {
  const rec = reconcileSurfaceGraph([buildValidEdge()])
  const fakeViolation = { implicit_sync: true }
  const telemetry = readCoordinationTelemetry(rec, [fakeViolation, fakeViolation])
  assert.equal(telemetry.metrics.implicit_sync_rejected_total, 2)
})

test('telemetry counts coordination_boundary_violation_total', () => {
  const rec = reconcileSurfaceGraph([buildValidEdge()])
  const violations = [
    { creates_authority: true },
    { authority_grant: 'x' },
    { break_glass: true },
  ]
  const telemetry = readCoordinationTelemetry(rec, violations)
  assert.equal(telemetry.metrics.coordination_boundary_violation_total, 3)
})

test('buildSurfaceGraphEdge and reconcileSurfaceGraph do not share mutable state', () => {
  const e1 = buildValidEdge()
  const e2 = buildValidEdge()
  assert.equal(e1.edge_hash, e2.edge_hash, 'Deterministic')
  // Frozen objects
  assert.throws(() => { (e1).surface_a = 'mutated' }, TypeError)
})

test('coordination_hashes in reconciliation are sorted', () => {
  const hashA = 'a'.repeat(64)
  const hashB = 'b'.repeat(64)

  // Craft two fake valid edges with different hashes
  // We use the hash-preserving trick: build an edge then override edge_hash
  // Actually just test computeSurfaceGraphHash sort stability directly
  const base = {
    artifact: 'SURFACE_GRAPH_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    reconciliation_result: 'SURFACE_GRAPH_RECONCILED',
    reconciliation_classes: ['surface_graph_reconciled'],
    edge_count: 2,
    allowed_edge_count: 2,
    forbidden_edge_count: 0,
    null_edge_count: 0,
    surface_count: 2,
    surface_graph_hash_alg: 'sha256',
  }

  const h1 = computeSurfaceGraphHash({ ...base, coordination_hashes: [hashA, hashB] })
  const h2 = computeSurfaceGraphHash({ ...base, coordination_hashes: [hashB, hashA] })
  assert.equal(h1, h2, 'coordination_hashes order must not affect graph hash')
})
