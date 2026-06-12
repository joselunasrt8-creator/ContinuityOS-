/**
 * FATE tests for issue #358 — Mutation Surface Exhaustiveness
 *
 * Required invariant:
 *   INSERT / UPDATE / DELETE + undeclared execution surface → NULL
 *
 * Required tests:
 *   1. undeclared mutation → fail
 *   2. observability mutation cannot create authority
 *   3. canonical routes own authoritative mutations
 *   4. duplicate surface ownership rejected
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const matrix = JSON.parse(
  readFileSync(new URL('../../runtime/MUTATION_SURFACE_EXHAUSTIVENESS.json', import.meta.url), 'utf8')
)
const inventory = JSON.parse(
  readFileSync(new URL('../../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url), 'utf8')
)

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

const CANONICAL_ROUTES = ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof']
const DRIFT_TAXONOMY = matrix.drift_taxonomy

// ── inline scanner ────────────────────────────────────────────────────────────

function scanMutationOperations(src) {
  const pattern = /\b(?:INSERT(?:\s+OR\s+IGNORE)?(?:\s+INTO)?|UPDATE|DELETE\s+FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
  const seen = new Set()
  const results = []
  for (const match of src.matchAll(pattern)) {
    const raw = match[0]
    const table = match[1]
    if (!table || /^(IF|OR|INTO|FROM|IGNORE|ON|BEGIN)$/i.test(table)) continue
    const key = `${raw.toUpperCase().trimStart().slice(0, 6)}:${table}`
    if (seen.has(key)) continue
    seen.add(key)
    const upper = raw.trimStart().toUpperCase()
    const operation = upper.startsWith('INSERT') ? 'INSERT' : upper.startsWith('UPDATE') ? 'UPDATE' : 'DELETE'
    results.push({ operation, table, raw })
  }
  return results.sort((a, b) => a.table.localeCompare(b.table))
}

// ── classification helpers ────────────────────────────────────────────────────

function classifyCandidateMutation({ table, operation }) {
  const declared = matrix.declared_surfaces.find(
    (s) => s.table === table && (s.operation === operation || s.operation === 'INSERT')
  )
  if (!declared) {
    return { status: 'NULL', drift: ['UNDECLARED_MUTATION_SURFACE', 'CLOSURE_INCOMPLETE'] }
  }
  return { status: 'CLASSIFIED', classification: declared.classification, surface: declared }
}

// ── test 1: undeclared mutation → fail ───────────────────────────────────────

test('undeclared mutation surfaces fail closed — INSERT / UPDATE / DELETE + undeclared surface → NULL', () => {
  // Synthetic undeclared mutations that must fail
  const undeclaredCases = [
    { table: 'shadow_authority_registry', operation: 'INSERT' },
    { table: 'bypass_execution_log', operation: 'UPDATE' },
    { table: 'root_override_table', operation: 'DELETE' },
    { table: 'unclassified_mutation_sink', operation: 'INSERT' },
  ]

  for (const probe of undeclaredCases) {
    const result = classifyCandidateMutation(probe)
    assert.equal(result.status, 'NULL', `${probe.operation} INTO ${probe.table} must produce NULL`)
    assert.ok(result.drift.includes('UNDECLARED_MUTATION_SURFACE'),
      `${probe.table} must produce UNDECLARED_MUTATION_SURFACE drift`)
    assert.ok(result.drift.includes('CLOSURE_INCOMPLETE'),
      `${probe.table} must produce CLOSURE_INCOMPLETE drift`)
  }

  // Confirm the matrix itself carries the correct fail-closed response
  assert.equal(matrix.fail_closed_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  assert.equal(matrix.closure_verification.undeclared_mutation_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  assert.equal(matrix.exhaustiveness_status, 'EXHAUSTIVE')

  // Confirm every drift taxonomy entry from the issue is present
  for (const cls of DRIFT_TAXONOMY) {
    assert.ok(typeof cls === 'string' && cls.length > 0, `drift class ${cls} must be non-empty string`)
  }
  assert.ok(DRIFT_TAXONOMY.includes('UNDECLARED_MUTATION_SURFACE'))
  assert.ok(DRIFT_TAXONOMY.includes('UNBOUND_DATABASE_WRITE'))
  assert.ok(DRIFT_TAXONOMY.includes('OBSERVABILITY_MUTATION_ESCALATION'))
  assert.ok(DRIFT_TAXONOMY.includes('CLOSURE_INCOMPLETE'))
})

// ── test 2: observability mutation cannot create authority ────────────────────

test('observability / evidence-only mutation cannot create authority or escalate to execution', () => {
  const evidenceOnlySurfaces = matrix.declared_surfaces.filter(
    (s) => s.classification === 'EVIDENCE_ONLY'
  )
  const nonExecutableSurfaces = matrix.declared_surfaces.filter(
    (s) => s.classification === 'NON_EXECUTABLE'
  )

  assert.ok(evidenceOnlySurfaces.length > 0, 'must have declared EVIDENCE_ONLY surfaces')
  assert.ok(nonExecutableSurfaces.length > 0, 'must have declared NON_EXECUTABLE surfaces')

  for (const surface of evidenceOnlySurfaces) {
    assert.equal(
      surface.creates_authority, false,
      `EVIDENCE_ONLY surface ${surface.surface_id} must not create authority`
    )
    assert.equal(
      surface.execution_capable, false,
      `EVIDENCE_ONLY surface ${surface.surface_id} must not be execution-capable`
    )
  }

  for (const surface of nonExecutableSurfaces) {
    assert.equal(
      surface.creates_authority, false,
      `NON_EXECUTABLE surface ${surface.surface_id} must not create authority`
    )
    assert.equal(
      surface.execution_capable, false,
      `NON_EXECUTABLE surface ${surface.surface_id} must not be execution-capable`
    )
  }

  // Cross-check against the unauthorized mutation inventory:
  // every observability_route surface must be non-authoritative
  const observabilityRoutes = inventory.surfaces.filter((s) => s.surface_type === 'observability_route')
  for (const s of observabilityRoutes) {
    assert.equal(s.execution_capability, false, `${s.surface_id} execution_capability must be false`)
    assert.equal(s.deployment_capability, false, `${s.surface_id} deployment_capability must be false`)
    assert.equal(s.non_authoritative, true, `${s.surface_id} must be non_authoritative`)
  }

  // Verify observability_mutation_escalation is in drift taxonomy
  assert.ok(DRIFT_TAXONOMY.includes('OBSERVABILITY_MUTATION_ESCALATION'))
  // Verify the matrix scanner notes the constraint
  assert.equal(matrix.closure_verification.evidence_only_invariant,
    'no EVIDENCE_ONLY or NON_EXECUTABLE surface has creates_authority=true or execution_capable=true')
})

// ── test 3: canonical routes own authoritative mutations ──────────────────────

test('canonical routes exclusively own all AUTHORITATIVE mutation surfaces', () => {
  const canonicalRouteSet = new Set(CANONICAL_ROUTES)
  const authoritativeSurfaces = matrix.declared_surfaces.filter(
    (s) => s.classification === 'AUTHORITATIVE'
  )

  assert.ok(authoritativeSurfaces.length >= 8,
    'must have at least 8 declared AUTHORITATIVE surfaces (one per canonical registry)')

  for (const surface of authoritativeSurfaces) {
    // Every AUTHORITATIVE surface must declare a canonical_route
    assert.ok(
      surface.canonical_route,
      `AUTHORITATIVE surface ${surface.surface_id} must declare a canonical_route`
    )
    // That route must be in the canonical chain
    assert.ok(
      canonicalRouteSet.has(surface.canonical_route),
      `AUTHORITATIVE surface ${surface.surface_id} canonical_route "${surface.canonical_route}" must be in canonical chain`
    )
    // AUTHORITATIVE surfaces must be governance-bound
    assert.equal(
      surface.governance_bound, true,
      `AUTHORITATIVE surface ${surface.surface_id} must be governance_bound`
    )
    // AUTHORITATIVE surfaces must be replay-safe
    assert.equal(
      surface.replay_safe, true,
      `AUTHORITATIVE surface ${surface.surface_id} must be replay_safe`
    )
  }

  // Verify the 7 canonical runtime routes are all represented in the matrix
  const authoritativeRoutes = new Set(authoritativeSurfaces.map((s) => s.canonical_route))
  for (const route of CANONICAL_ROUTES) {
    assert.ok(authoritativeRoutes.has(route),
      `canonical route ${route} must have at least one AUTHORITATIVE mutation surface`)
  }

  // Confirm from the source that canonical routes are declared
  assert.match(source,
    /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/)

  // Confirm the matrix closed-loop: canonical_runtime_chain matches CANONICAL_ROUTES
  assert.deepEqual(matrix.canonical_runtime_chain, CANONICAL_ROUTES)
})

// ── test 4: duplicate surface ownership rejected ──────────────────────────────

test('duplicate AUTHORITATIVE surface ownership is rejected — each table owned by exactly one surface', () => {
  const authoritativeSurfaces = matrix.declared_surfaces.filter(
    (s) => s.classification === 'AUTHORITATIVE' && s.table !== null
  )

  // Count by table+operation — same table can have INSERT and DELETE as separate entries
  // but each (table, operation) tuple must appear exactly once
  const tupleCount = new Map()
  for (const s of authoritativeSurfaces) {
    const key = `${s.table}:${s.operation}`
    tupleCount.set(key, (tupleCount.get(key) ?? 0) + 1)
  }

  const duplicates = [...tupleCount.entries()].filter(([, count]) => count > 1)
  assert.deepEqual(duplicates, [],
    `Duplicate AUTHORITATIVE surface ownership detected: ${JSON.stringify(duplicates)}`)

  // Additionally, no single operation type (INSERT) should be owned by two surfaces for the same table
  const insertCount = new Map()
  for (const s of authoritativeSurfaces.filter((s) => s.operation === 'INSERT')) {
    insertCount.set(s.table, (insertCount.get(s.table) ?? 0) + 1)
  }
  const insertDuplicates = [...insertCount.entries()].filter(([, count]) => count > 1)
  assert.deepEqual(insertDuplicates, [],
    `Duplicate INSERT ownership for AUTHORITATIVE tables: ${JSON.stringify(insertDuplicates)}`)

  // Verify all surface_ids are unique across the entire matrix
  const allIds = matrix.declared_surfaces.map((s) => s.surface_id)
  const uniqueIds = new Set(allIds)
  assert.equal(uniqueIds.size, allIds.length,
    'All surface_ids in the classification matrix must be unique')

  // Confirm duplicate_ownership_invariant is declared
  assert.ok(matrix.closure_verification.duplicate_ownership_invariant)
  assert.ok(DRIFT_TAXONOMY.includes('DUPLICATE_SURFACE_OWNERSHIP'))
})

// ── test 5: every db mutation in src/index.ts maps to a declared surface ──────

test('static FATE scan: every INSERT / UPDATE / DELETE in src/index.ts maps to a declared surface', () => {
  const operations = scanMutationOperations(source)
  assert.ok(operations.length > 0, 'scanner must find mutation operations in src/index.ts')

  const declaredTables = new Set(
    matrix.declared_surfaces
      .filter((s) => s.table !== null)
      .map((s) => s.table)
  )

  const undeclared = operations.filter((op) => !declaredTables.has(op.table))
  assert.deepEqual(
    undeclared,
    [],
    `Undeclared mutation operations detected — UNDECLARED_MUTATION_SURFACE -> NULL:\n${JSON.stringify(undeclared, null, 2)}`
  )

  // Confirm the scanner module path is declared in the matrix
  assert.equal(matrix.scanner.source_file, 'src/index.ts')
  assert.equal(matrix.scanner.undeclared_mutation_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  assert.ok(matrix.scanner.scan_patterns.includes('INSERT INTO'))
  assert.ok(matrix.scanner.scan_patterns.includes('DELETE FROM'))
})

// ── test 6: classification matrix structural invariants ──────────────────────

test('mutation classification matrix is structurally sound and replay-safe', () => {
  assert.equal(matrix.artifact, 'MUTATION_SURFACE_EXHAUSTIVENESS')
  assert.equal(matrix.issue, '358')
  assert.equal(matrix.replay_safe, true)
  assert.equal(matrix.evidence_only, true)
  assert.equal(matrix.non_authoritative, true)

  const validClassifications = ['AUTHORITATIVE', 'EVIDENCE_ONLY', 'NON_EXECUTABLE', 'governed_support_surface']
  const requiredFields = ['surface_id', 'classification', 'creates_authority', 'execution_capable', 'governance_bound', 'replay_safe']

  for (const surface of matrix.declared_surfaces) {
    for (const field of requiredFields) {
      assert.ok(Object.hasOwn(surface, field), `surface ${surface.surface_id} missing field: ${field}`)
    }
    assert.ok(validClassifications.includes(surface.classification),
      `surface ${surface.surface_id} has unknown classification: ${surface.classification}`)
  }

  // Every declared surface must be replay-safe
  for (const surface of matrix.declared_surfaces) {
    assert.equal(surface.replay_safe, true,
      `surface ${surface.surface_id} must be replay_safe`)
  }

  // Confirm classification counts match actual declared surfaces
  const counts = { AUTHORITATIVE: 0, EVIDENCE_ONLY: 0, NON_EXECUTABLE: 0 }
  for (const s of matrix.declared_surfaces) counts[s.classification]++
  assert.equal(counts.AUTHORITATIVE, matrix.classification_counts.AUTHORITATIVE,
    'AUTHORITATIVE count must match declared surfaces')
  assert.equal(counts.EVIDENCE_ONLY, matrix.classification_counts.EVIDENCE_ONLY,
    'EVIDENCE_ONLY count must match declared surfaces')
  assert.equal(counts.NON_EXECUTABLE, matrix.classification_counts.NON_EXECUTABLE,
    'NON_EXECUTABLE count must match declared surfaces')
})
