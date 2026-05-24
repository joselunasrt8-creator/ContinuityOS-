/**
 * tests/issue-1156-continuity-lineage-closure-hardening.test.mjs
 * Issue #1156 — Distributed Continuity Lineage Closure Hardening
 *
 * FATE tests proving recursive closure verification for distributed continuity
 * lineage, including under partial visibility conditions.
 *
 * Primary invariant:
 *   No valid continuity lineage → no valid authority → no valid execution
 *
 * Closure invariant:
 *   All lineage-dependent registries must remain recursively reconcilable
 *   across all reconciliation boundaries.
 *
 * Evidence only — no execution authority changes, no mutation surface widening,
 * no probabilistic lineage validation, no replay bypass paths,
 * no legitimacy semantic weakening.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  CONTINUITY_CLOSURE_RESULTS,
  ANCESTRY_FAILURE_REASONS,
  CLOSURE_DRIFT_CLASSES,
  REPAIR_CLASSES,
  computeClosureTopologyHash,
  traverseContinuityAncestry,
  detectDetachedContinuities,
  enforceLineageFreshnessBarrier,
  collapseOrphanedSubtrees,
  auditLineageEquivalence,
  computeLineageRepairDiagnostics,
  validateLineageReconstructability,
  classifyLineageDrift,
  verifyDistributedContinuityLineageClosure,
} from '../src/continuity-lineage-closure-hardening.ts'

// ── Test fixtures ─────────────────────────────────────────────────────────────

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const HASH_A = sha256('continuity-hash-a')
const HASH_B = sha256('continuity-hash-b')
const HASH_C = sha256('continuity-hash-c')
const REG_HASH = sha256('registry-hash-valid')

function makeEntry(overrides = {}) {
  return {
    continuity_id: 'cid-1',
    session_id: 'sess-1',
    identity_id: 'user-1',
    parent_continuity_id: null,
    continuity_hash: HASH_A,
    status: 'ACTIVE',
    expires_at: null,
    revoked_at: null,
    ...overrides,
  }
}

function makeView(overrides = {}) {
  const entries = overrides.entries ?? [makeEntry()]
  const { entries: _ignored, ...rest } = overrides
  return {
    node_id: 'node-1',
    registry_epoch: 'epoch-1',
    lineage_root_id: 'cid-1',
    entries,
    registry_hash: REG_HASH,
    ...rest,
  }
}

function makeInput(overrides = {}) {
  const views = overrides.registry_views ?? [makeView()]
  return {
    closure_id: 'closure-test-001',
    evidence_only: true,
    registry_views: views,
    freshness_horizon_ms: null,
    max_ancestry_depth: null,
    ...overrides,
  }
}

function run(overrides = {}) {
  return verifyDistributedContinuityLineageClosure(makeInput(overrides))
}

function makeIndex(entries) {
  return new Map(entries.map((e) => [e.continuity_id, e]))
}

// ── 1. Evidence-only output ───────────────────────────────────────────────────

test('output is always evidence_only with correct artifact_type', () => {
  const result = run()
  assert.equal(result.evidence_only, true)
  assert.equal(result.artifact_type, 'CONTINUITY_LINEAGE_CLOSURE_HARDENING')
})

test('output never contains execution authority fields', () => {
  const result = run()
  assert.ok(!('creates_authority' in result))
  assert.ok(!('creates_execution' in result))
  assert.ok(!('creates_proof' in result))
  assert.ok(!('mutates_registry' in result))
  assert.ok(!('authority_grant' in result))
})

// ── 2. NULL result on invalid input ──────────────────────────────────────────

test('null input returns NULL result', () => {
  const result = verifyDistributedContinuityLineageClosure(null)
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
  assert.equal(result.evidence_only, true)
})

test('missing evidence_only returns NULL', () => {
  const result = verifyDistributedContinuityLineageClosure({
    closure_id: 'test',
    evidence_only: false,
    registry_views: [makeView()],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
})

test('empty registry_views returns NULL', () => {
  const result = run({ registry_views: [] })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
  assert.equal(result.entry_count, 0)
})

test('missing closure_id still returns valid NULL result with unknown id', () => {
  const result = verifyDistributedContinuityLineageClosure({
    evidence_only: true,
    registry_views: [makeView()],
  })
  assert.equal(result.closure_id, 'unknown')
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
})

// ── 3. Boundary violation detection ──────────────────────────────────────────

test('forbidden field creates_authority in input returns NULL', () => {
  const result = verifyDistributedContinuityLineageClosure({
    closure_id: 'test',
    evidence_only: true,
    creates_authority: true,
    registry_views: [makeView()],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
})

test('forbidden field in registry view entry returns NULL', () => {
  const result = run({
    registry_views: [
      makeView({
        entries: [makeEntry({ auto_repair: true })],
      }),
    ],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
})

test('forbidden field break_glass in view returns NULL', () => {
  const result = verifyDistributedContinuityLineageClosure({
    closure_id: 'test',
    evidence_only: true,
    registry_views: [{ ...makeView(), break_glass: true }],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
})

// ── 4. Clean single root lineage → CLOSURE_VERIFIED ──────────────────────────

test('single active root entry with no parent produces CLOSURE_VERIFIED', () => {
  const result = run()
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_VERIFIED)
  assert.equal(result.entry_count, 1)
  assert.equal(result.detached_ids.length, 0)
  assert.equal(result.collapsed_subtrees.length, 0)
})

test('chain of two active entries with valid parent reference produces CLOSURE_VERIFIED', () => {
  const root = makeEntry({ continuity_id: 'cid-root', parent_continuity_id: null })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
  })
  const result = run({
    registry_views: [makeView({ entries: [root, child], lineage_root_id: 'cid-root' })],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_VERIFIED)
  assert.equal(result.entry_count, 2)
  assert.equal(result.detached_ids.length, 0)
})

// ── 5. Cycle detection → CLOSURE_BROKEN_CYCLE ────────────────────────────────

test('cycle between two entries produces CLOSURE_BROKEN_CYCLE', () => {
  const a = makeEntry({ continuity_id: 'cid-a', parent_continuity_id: 'cid-b' })
  const b = makeEntry({ continuity_id: 'cid-b', parent_continuity_id: 'cid-a', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [a, b], lineage_root_id: 'cid-a' })],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_CYCLE)
})

test('cycle classification has ancestry_cycle drift class with fatal severity', () => {
  const a = makeEntry({ continuity_id: 'cid-a', parent_continuity_id: 'cid-b' })
  const b = makeEntry({ continuity_id: 'cid-b', parent_continuity_id: 'cid-a', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [a, b] })],
  })
  const cycleClass = result.drift_classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.ANCESTRY_CYCLE,
  )
  assert.ok(cycleClass, 'ancestry_cycle drift classification must exist')
  assert.equal(cycleClass.severity, 'fatal')
})

test('cycle repair diagnostic is permanently invalid and not repairable', () => {
  const a = makeEntry({ continuity_id: 'cid-a', parent_continuity_id: 'cid-b' })
  const b = makeEntry({ continuity_id: 'cid-b', parent_continuity_id: 'cid-a', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [a, b] })],
  })
  const diag = result.repair_diagnostics.find(
    (d) => d.repair_class === REPAIR_CLASSES.LINEAGE_PERMANENTLY_INVALID,
  )
  assert.ok(diag)
  assert.equal(diag.repairable, false)
})

// ── 6. Depth exceeded → CLOSURE_BROKEN_DEPTH ─────────────────────────────────

test('ancestry chain exceeding max_ancestry_depth produces CLOSURE_BROKEN_DEPTH', () => {
  const entries = []
  for (let i = 0; i < 6; i++) {
    entries.push(
      makeEntry({
        continuity_id: `cid-${i}`,
        parent_continuity_id: i === 0 ? null : `cid-${i - 1}`,
        continuity_hash: sha256(`hash-${i}`),
      }),
    )
  }
  const result = run({
    registry_views: [makeView({ entries, lineage_root_id: 'cid-0' })],
    max_ancestry_depth: 3,
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_DEPTH)
})

test('depth repair diagnostic is repairable via reduce_ancestry_depth', () => {
  const entries = []
  for (let i = 0; i < 5; i++) {
    entries.push(
      makeEntry({
        continuity_id: `cid-${i}`,
        parent_continuity_id: i === 0 ? null : `cid-${i - 1}`,
        continuity_hash: sha256(`hash-${i}`),
      }),
    )
  }
  const result = run({
    registry_views: [makeView({ entries, lineage_root_id: 'cid-0' })],
    max_ancestry_depth: 2,
  })
  const diag = result.repair_diagnostics.find(
    (d) => d.repair_class === REPAIR_CLASSES.REDUCE_ANCESTRY_DEPTH,
  )
  assert.ok(diag)
  assert.equal(diag.repairable, true)
})

// ── 7. Detached lineage → CLOSURE_BROKEN_DETACHED ────────────────────────────

test('entry referencing missing parent produces CLOSURE_BROKEN_DETACHED', () => {
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-ghost',
  })
  const result = run({
    registry_views: [makeView({ entries: [child] })],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_DETACHED)
  assert.ok(result.detached_ids.includes('cid-child'))
})

test('detached classification has detached_continuity drift class with fatal severity', () => {
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-ghost',
  })
  const result = run({
    registry_views: [makeView({ entries: [child] })],
  })
  const detachedClass = result.drift_classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.DETACHED_CONTINUITY,
  )
  assert.ok(detachedClass)
  assert.equal(detachedClass.severity, 'fatal')
  assert.equal(detachedClass.affected_continuity_id, 'cid-child')
})

test('detached repair diagnostic recommends fetch_missing_ancestor and is repairable', () => {
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-ghost',
  })
  const result = run({
    registry_views: [makeView({ entries: [child] })],
  })
  const diag = result.repair_diagnostics.find(
    (d) => d.repair_class === REPAIR_CLASSES.FETCH_MISSING_ANCESTOR,
  )
  assert.ok(diag)
  assert.equal(diag.repairable, true)
})

// ── 8. Orphan subtree collapse → CLOSURE_BROKEN_ORPHAN ───────────────────────

test('orphan with descendants produces CLOSURE_BROKEN_ORPHAN with collapsed subtree', () => {
  const orphanRoot = makeEntry({
    continuity_id: 'cid-orphan',
    parent_continuity_id: 'cid-missing',
    continuity_hash: HASH_A,
  })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-orphan',
    continuity_hash: HASH_B,
  })
  const grandchild = makeEntry({
    continuity_id: 'cid-grandchild',
    parent_continuity_id: 'cid-child',
    continuity_hash: HASH_C,
  })
  const result = run({
    registry_views: [
      makeView({ entries: [orphanRoot, child, grandchild], lineage_root_id: 'cid-orphan' }),
    ],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_DETACHED)
  assert.ok(result.collapsed_subtrees.length > 0)
  const subtree = result.collapsed_subtrees[0]
  assert.equal(subtree.orphan_root_id, 'cid-orphan')
  assert.equal(subtree.missing_parent_id, 'cid-missing')
  assert.ok(subtree.affected_ids.includes('cid-orphan'))
  assert.ok(subtree.affected_ids.includes('cid-child'))
  assert.ok(subtree.affected_ids.includes('cid-grandchild'))
})

test('collapsed subtree has deterministic subtree_hash via canonical.js', () => {
  const orphanRoot = makeEntry({
    continuity_id: 'cid-orphan',
    parent_continuity_id: 'cid-missing',
  })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-orphan',
    continuity_hash: HASH_B,
  })
  const result1 = run({
    registry_views: [makeView({ entries: [orphanRoot, child] })],
  })
  const result2 = run({
    registry_views: [makeView({ entries: [child, orphanRoot] })],
  })
  assert.equal(result1.collapsed_subtrees[0].subtree_hash, result2.collapsed_subtrees[0].subtree_hash)
})

// ── 9. Revoked ancestor → fail closed ────────────────────────────────────────

test('revoked ancestor in chain causes traversal failure with revoked_ancestor', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
  })
  const index = makeIndex([root, child])
  const result = traverseContinuityAncestry('cid-child', index, 32)
  assert.equal(result.ok, false)
  assert.equal(result.failure_reason, ANCESTRY_FAILURE_REASONS.REVOKED_ANCESTOR)
})

test('revoked ancestor produces permanently invalid repair diagnostic', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
  })
  const result = run({
    registry_views: [makeView({ entries: [root, child] })],
  })
  const diag = result.repair_diagnostics.find(
    (d) => d.affected_continuity_id === 'cid-child',
  )
  assert.ok(diag)
  assert.equal(diag.repairable, false)
  assert.equal(diag.repair_class, REPAIR_CLASSES.LINEAGE_PERMANENTLY_INVALID)
})

// ── 10. Expired ancestor → fail closed ───────────────────────────────────────

test('expired ancestor causes traversal failure with expired_ancestor', () => {
  const expiredRoot = makeEntry({
    continuity_id: 'cid-root',
    expires_at: '2020-01-01T00:00:00.000Z',
  })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
  })
  const index = makeIndex([expiredRoot, child])
  const result = traverseContinuityAncestry('cid-child', index, 32)
  assert.equal(result.ok, false)
  assert.equal(result.failure_reason, ANCESTRY_FAILURE_REASONS.EXPIRED_ANCESTOR)
})

test('expired ancestor produces freshness_chain_violation with degraded severity', () => {
  const expiredRoot = makeEntry({
    continuity_id: 'cid-root',
    expires_at: '2020-01-01T00:00:00.000Z',
  })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
  })
  const result = run({
    registry_views: [makeView({ entries: [expiredRoot, child] })],
  })
  const classification = result.drift_classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.FRESHNESS_CHAIN_VIOLATION,
  )
  assert.ok(classification)
  assert.equal(classification.severity, 'degraded')
})

// ── 11. Freshness barrier enforcement ────────────────────────────────────────

test('freshness barrier flags entry expiring within horizon', () => {
  const soonExpiry = new Date(Date.now() + 1000).toISOString()
  const entry = makeEntry({ continuity_id: 'cid-1', expires_at: soonExpiry })
  const index = makeIndex([entry])
  const { compliant, stale_ids } = enforceLineageFreshnessBarrier(['cid-1'], index, 60_000)
  assert.equal(compliant, false)
  assert.ok(stale_ids.includes('cid-1'))
})

test('freshness barrier passes entry expiring beyond horizon', () => {
  const farExpiry = new Date(Date.now() + 3_600_000).toISOString()
  const entry = makeEntry({ continuity_id: 'cid-1', expires_at: farExpiry })
  const index = makeIndex([entry])
  const { compliant, stale_ids } = enforceLineageFreshnessBarrier(['cid-1'], index, 60_000)
  assert.equal(compliant, true)
  assert.equal(stale_ids.length, 0)
})

test('freshness barrier violation in main function produces drift classification', () => {
  const soonExpiry = new Date(Date.now() + 1000).toISOString()
  const entry = makeEntry({ continuity_id: 'cid-1', expires_at: soonExpiry })
  const result = run({
    registry_views: [makeView({ entries: [entry] })],
    freshness_horizon_ms: 60_000,
  })
  const freshnessClass = result.drift_classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.FRESHNESS_CHAIN_VIOLATION,
  )
  assert.ok(freshnessClass)
  assert.equal(freshnessClass.affected_continuity_id, 'cid-1')
})

// ── 12. Equivalence audit across registry views ───────────────────────────────

test('identical registry views produce equivalent audit', () => {
  const v1 = makeView()
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2' })
  const audit = auditLineageEquivalence([v1, v2])
  assert.equal(audit.equivalent, true)
  assert.equal(audit.divergent_count, 0)
})

test('divergent entry hash across views produces non-equivalent audit', () => {
  const entry1 = makeEntry({ continuity_hash: HASH_A })
  const entry2 = makeEntry({ continuity_hash: HASH_B })
  const v1 = makeView({ entries: [entry1] })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', entries: [entry2] })
  const audit = auditLineageEquivalence([v1, v2])
  assert.equal(audit.equivalent, false)
  assert.equal(audit.divergent_count, 1)
  assert.ok(audit.divergent_entry_ids.includes('cid-1'))
})

test('cross-registry hash divergence produces CLOSURE_PARTIAL_VISIBILITY', () => {
  const entry1 = makeEntry({ continuity_hash: HASH_A })
  const entry2 = makeEntry({ continuity_hash: HASH_B })
  const v1 = makeView({ entries: [entry1] })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', entries: [entry2] })
  const result = run({ registry_views: [v1, v2] })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_PARTIAL_VISIBILITY)
  const driftClass = result.drift_classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.CROSS_REGISTRY_HASH_DIVERGENCE,
  )
  assert.ok(driftClass)
  assert.equal(driftClass.severity, 'fatal')
})

// ── 13. Reconstruction validation ────────────────────────────────────────────

test('valid lineage produces reconstructable validation with non-null reconstruction_hash', () => {
  const result = run()
  const validation = result.reconstruction_validations[0]
  assert.ok(validation)
  assert.equal(validation.reconstructable, true)
  assert.ok(typeof validation.reconstruction_hash === 'string')
  assert.ok(validation.reconstruction_hash.length === 64)
  assert.equal(validation.failure_reason, null)
})

test('detached lineage produces non-reconstructable validation', () => {
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-ghost',
  })
  const result = run({
    registry_views: [makeView({ entries: [child] })],
  })
  const validation = result.reconstruction_validations.find(
    (v) => v.continuity_id === 'cid-child',
  )
  assert.ok(validation)
  assert.equal(validation.reconstructable, false)
  assert.equal(validation.reconstruction_hash, null)
  assert.ok(validation.failure_reason !== null)
})

test('reconstruction_hash is deterministic for identical inputs', () => {
  const result1 = run()
  const result2 = run()
  assert.equal(
    result1.reconstruction_validations[0].reconstruction_hash,
    result2.reconstruction_validations[0].reconstruction_hash,
  )
})

// ── 14. traverseContinuityAncestry unit tests ─────────────────────────────────

test('root entry with no parent produces ok traversal of depth 1', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const index = makeIndex([root])
  const result = traverseContinuityAncestry('cid-root', index, 32)
  assert.equal(result.ok, true)
  assert.equal(result.depth, 1)
  assert.equal(result.root_continuity_id, 'cid-root')
  assert.equal(result.failure_reason, null)
  assert.deepEqual([...result.ancestry_chain], ['cid-root'])
})

test('two-node chain traverses both nodes and finds root', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const index = makeIndex([root, child])
  const result = traverseContinuityAncestry('cid-child', index, 32)
  assert.equal(result.ok, true)
  assert.equal(result.depth, 2)
  assert.equal(result.root_continuity_id, 'cid-root')
  assert.deepEqual([...result.ancestry_chain], ['cid-child', 'cid-root'])
})

test('self-referencing entry produces cycle_detected', () => {
  const self = makeEntry({ continuity_id: 'cid-self', parent_continuity_id: 'cid-self' })
  const index = makeIndex([self])
  const result = traverseContinuityAncestry('cid-self', index, 32)
  assert.equal(result.ok, false)
  assert.equal(result.failure_reason, ANCESTRY_FAILURE_REASONS.CYCLE_DETECTED)
})

test('entry pointing to missing parent produces detached_lineage', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', parent_continuity_id: 'cid-missing' })
  const index = makeIndex([entry])
  const result = traverseContinuityAncestry('cid-1', index, 32)
  assert.equal(result.ok, false)
  assert.equal(result.failure_reason, ANCESTRY_FAILURE_REASONS.DETACHED_LINEAGE)
})

test('traversal IDs are deterministic for identical inputs', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const index = makeIndex([root])
  const r1 = traverseContinuityAncestry('cid-root', index, 32)
  const r2 = traverseContinuityAncestry('cid-root', index, 32)
  assert.equal(r1.traversal_id, r2.traversal_id)
  assert.equal(r1.ancestry_hash, r2.ancestry_hash)
})

test('ancestry_hash changes with different ancestry chains', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const childA = makeEntry({ continuity_id: 'cid-child-a', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const childB = makeEntry({ continuity_id: 'cid-child-b', parent_continuity_id: 'cid-root', continuity_hash: HASH_C })
  const indexA = makeIndex([root, childA])
  const indexB = makeIndex([root, childB])
  const rA = traverseContinuityAncestry('cid-child-a', indexA, 32)
  const rB = traverseContinuityAncestry('cid-child-b', indexB, 32)
  assert.notEqual(rA.ancestry_hash, rB.ancestry_hash)
})

// ── 15. collapseOrphanedSubtrees unit tests ───────────────────────────────────

test('no orphans produces empty collapsed subtrees', () => {
  const root = makeEntry()
  const index = makeIndex([root])
  const subtrees = collapseOrphanedSubtrees([root], index)
  assert.equal(subtrees.length, 0)
})

test('orphan root with two children produces subtree covering all three', () => {
  const orphan = makeEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-gone' })
  const child1 = makeEntry({ continuity_id: 'cid-c1', parent_continuity_id: 'cid-orphan', continuity_hash: HASH_B })
  const child2 = makeEntry({ continuity_id: 'cid-c2', parent_continuity_id: 'cid-orphan', continuity_hash: HASH_C })
  const entries = [orphan, child1, child2]
  const index = makeIndex(entries)
  const subtrees = collapseOrphanedSubtrees(entries, index)
  assert.equal(subtrees.length, 1)
  assert.equal(subtrees[0].orphan_root_id, 'cid-orphan')
  assert.equal(subtrees[0].missing_parent_id, 'cid-gone')
  assert.equal(subtrees[0].affected_ids.length, 3)
})

test('collapsed subtree has valid sha256 subtree_hash', () => {
  const orphan = makeEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-missing' })
  const entries = [orphan]
  const index = makeIndex(entries)
  const subtrees = collapseOrphanedSubtrees(entries, index)
  assert.ok(subtrees.length > 0)
  assert.match(subtrees[0].subtree_hash, /^[0-9a-f]{64}$/)
  assert.match(subtrees[0].subtree_id, /^[0-9a-f]{64}$/)
})

// ── 16. detectDetachedContinuities ────────────────────────────────────────────

test('detectDetachedContinuities returns IDs of detached traversal results only', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const orphan = makeEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-gone' })
  const index = makeIndex([root, orphan])
  const traversals = [
    traverseContinuityAncestry('cid-root', index, 32),
    traverseContinuityAncestry('cid-orphan', index, 32),
  ]
  const detached = detectDetachedContinuities(traversals)
  assert.ok(!detached.includes('cid-root'))
  assert.ok(detached.includes('cid-orphan'))
})

// ── 17. computeLineageRepairDiagnostics ───────────────────────────────────────

test('repair diagnostics include subtree diagnostics for collapsed subtrees', () => {
  const orphan = makeEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-missing' })
  const index = makeIndex([orphan])
  const traversal = traverseContinuityAncestry('cid-orphan', index, 32)
  const subtrees = collapseOrphanedSubtrees([orphan], index)
  const diagnostics = computeLineageRepairDiagnostics([traversal], subtrees)
  const subtreeDiag = diagnostics.find((d) => d.affected_continuity_id === 'cid-orphan')
  assert.ok(subtreeDiag)
})

test('diagnostics for ok traversals are empty', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const index = makeIndex([root])
  const traversal = traverseContinuityAncestry('cid-root', index, 32)
  const diagnostics = computeLineageRepairDiagnostics([traversal], [])
  assert.equal(diagnostics.length, 0)
})

// ── 18. classifyLineageDrift ──────────────────────────────────────────────────

test('cycle drift is classified as ancestry_cycle with fatal severity', () => {
  const a = makeEntry({ continuity_id: 'a', parent_continuity_id: 'b' })
  const b = makeEntry({ continuity_id: 'b', parent_continuity_id: 'a', continuity_hash: HASH_B })
  const index = makeIndex([a, b])
  const traversals = [
    traverseContinuityAncestry('a', index, 32),
    traverseContinuityAncestry('b', index, 32),
  ]
  const subtrees = collapseOrphanedSubtrees([a, b], index)
  const audit = auditLineageEquivalence([makeView({ entries: [a, b] })])
  const classifications = classifyLineageDrift(traversals, subtrees, audit, [], 'test-closure')
  const cycleClass = classifications.find((c) => c.drift_class === CLOSURE_DRIFT_CLASSES.ANCESTRY_CYCLE)
  assert.ok(cycleClass)
  assert.equal(cycleClass.severity, 'fatal')
})

test('orphaned subtree is classified as orphaned_subtree with fatal severity', () => {
  const orphan = makeEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-gone' })
  const index = makeIndex([orphan])
  const traversals = [traverseContinuityAncestry('cid-orphan', index, 32)]
  const subtrees = collapseOrphanedSubtrees([orphan], index)
  const audit = auditLineageEquivalence([makeView({ entries: [orphan] })])
  const classifications = classifyLineageDrift(traversals, subtrees, audit, [], 'test-closure')
  const orphanClass = classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.ORPHANED_SUBTREE,
  )
  assert.ok(orphanClass)
  assert.equal(orphanClass.severity, 'fatal')
})

test('cross_registry_hash_divergence classification emitted for non-equivalent audit', () => {
  const audit = auditLineageEquivalence([
    makeView({ entries: [makeEntry({ continuity_hash: HASH_A })] }),
    makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', entries: [makeEntry({ continuity_hash: HASH_B })] }),
  ])
  const classifications = classifyLineageDrift([], [], audit, [], 'test-closure')
  const divClass = classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.CROSS_REGISTRY_HASH_DIVERGENCE,
  )
  assert.ok(divClass)
  assert.equal(divClass.severity, 'fatal')
})

// ── 19. computeClosureTopologyHash ────────────────────────────────────────────

test('topology hash is deterministic regardless of entry insertion order', () => {
  const a = makeEntry({ continuity_id: 'cid-a', continuity_hash: HASH_A })
  const b = makeEntry({ continuity_id: 'cid-b', continuity_hash: HASH_B })
  const hash1 = computeClosureTopologyHash([a, b])
  const hash2 = computeClosureTopologyHash([b, a])
  assert.equal(hash1, hash2)
})

test('topology hash is a valid sha256 hex string', () => {
  const result = computeClosureTopologyHash([makeEntry()])
  assert.match(result, /^[0-9a-f]{64}$/)
})

test('topology hash changes when entry data changes', () => {
  const a = makeEntry({ continuity_hash: HASH_A })
  const b = makeEntry({ continuity_hash: HASH_B })
  assert.notEqual(computeClosureTopologyHash([a]), computeClosureTopologyHash([b]))
})

// ── 20. Determinism ───────────────────────────────────────────────────────────

test('identical inputs always produce identical lineage_topology_hash', () => {
  const r1 = run()
  const r2 = run()
  assert.equal(r1.lineage_topology_hash, r2.lineage_topology_hash)
})

test('identical inputs always produce identical closure_result', () => {
  const entries = [
    makeEntry({ continuity_id: 'cid-1', parent_continuity_id: null }),
    makeEntry({ continuity_id: 'cid-2', parent_continuity_id: 'cid-1', continuity_hash: HASH_B }),
  ]
  const r1 = run({ registry_views: [makeView({ entries })] })
  const r2 = run({ registry_views: [makeView({ entries })] })
  assert.equal(r1.closure_result, r2.closure_result)
  assert.equal(r1.lineage_topology_hash, r2.lineage_topology_hash)
})

test('full output is deterministic for multi-node lineage', () => {
  const entries = [
    makeEntry({ continuity_id: 'cid-1' }),
    makeEntry({ continuity_id: 'cid-2', parent_continuity_id: 'cid-1', continuity_hash: HASH_B }),
    makeEntry({ continuity_id: 'cid-3', parent_continuity_id: 'cid-2', continuity_hash: HASH_C }),
  ]
  const input = makeInput({ registry_views: [makeView({ entries, lineage_root_id: 'cid-1' })] })
  const r1 = verifyDistributedContinuityLineageClosure(input)
  const r2 = verifyDistributedContinuityLineageClosure(input)
  assert.equal(r1.lineage_topology_hash, r2.lineage_topology_hash)
  assert.equal(r1.equivalence_audit.audit_id, r2.equivalence_audit.audit_id)
  assert.equal(r1.closure_result, r2.closure_result)
})

// ── 21. Frozen output ─────────────────────────────────────────────────────────

test('output object is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result))
})

test('traversal_results array is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result.traversal_results))
})

test('collapsed_subtrees array is frozen', () => {
  const orphan = makeEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-gone' })
  const result = run({
    registry_views: [makeView({ entries: [orphan] })],
  })
  assert.ok(Object.isFrozen(result.collapsed_subtrees))
})

test('equivalence_audit object is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result.equivalence_audit))
})

test('drift_classifications array is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result.drift_classifications))
})

// ── 22. Hashing routes through canonical.js ───────────────────────────────────

test('lineage_topology_hash is a valid 64-char hex sha256', () => {
  const result = run()
  assert.match(result.lineage_topology_hash, /^[0-9a-f]{64}$/)
})

test('equivalence audit_id is a valid 64-char hex sha256', () => {
  const result = run()
  assert.match(result.equivalence_audit.audit_id, /^[0-9a-f]{64}$/)
})

test('traversal ancestry_hash values are valid 64-char hex sha256', () => {
  const result = run()
  for (const traversal of result.traversal_results) {
    assert.match(traversal.ancestry_hash, /^[0-9a-f]{64}$/)
  }
})

test('subtree_hash is a valid 64-char hex sha256', () => {
  const orphan = makeEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-gone' })
  const result = run({
    registry_views: [makeView({ entries: [orphan] })],
  })
  for (const subtree of result.collapsed_subtrees) {
    assert.match(subtree.subtree_hash, /^[0-9a-f]{64}$/)
    assert.match(subtree.subtree_id, /^[0-9a-f]{64}$/)
  }
})

// ── 23. Partial visibility under distributed reconciliation ────────────────────

test('two views with same entries but one view has additional entries: deduplication applies', () => {
  const sharedEntry = makeEntry({ continuity_id: 'cid-shared' })
  const extraEntry = makeEntry({ continuity_id: 'cid-extra', continuity_hash: HASH_B })
  const v1 = makeView({ node_id: 'node-1', entries: [sharedEntry] })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', entries: [sharedEntry, extraEntry] })
  const result = run({ registry_views: [v1, v2] })
  assert.equal(result.entry_count, 2)
})

test('single-view input with valid entries always passes equivalence audit', () => {
  const result = run()
  assert.equal(result.equivalence_audit.equivalent, true)
  assert.equal(result.equivalence_audit.divergent_count, 0)
})

// ── 24. Closure result priority ordering ──────────────────────────────────────

test('cycle takes priority over depth when both present in different entries', () => {
  const entries = []
  for (let i = 0; i < 5; i++) {
    entries.push(makeEntry({ continuity_id: `d${i}`, parent_continuity_id: i === 0 ? null : `d${i - 1}`, continuity_hash: sha256(`depth-${i}`) }))
  }
  const cycleA = makeEntry({ continuity_id: 'cyc-a', parent_continuity_id: 'cyc-b', continuity_hash: sha256('ca') })
  const cycleB = makeEntry({ continuity_id: 'cyc-b', parent_continuity_id: 'cyc-a', continuity_hash: sha256('cb') })
  const result = run({
    registry_views: [makeView({ entries: [...entries, cycleA, cycleB] })],
    max_ancestry_depth: 2,
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_CYCLE)
})

// ── 25. No execution authority semantics ─────────────────────────────────────

test('CONTINUITY_CLOSURE_RESULTS contains no execution authority values', () => {
  for (const value of Object.values(CONTINUITY_CLOSURE_RESULTS)) {
    assert.ok(!String(value).includes('AUTHORITY'))
    assert.ok(!String(value).includes('EXECUTE'))
    assert.ok(!String(value).includes('PROOF'))
  }
})

test('REPAIR_CLASSES contains no mutation or authority escalation values', () => {
  for (const value of Object.values(REPAIR_CLASSES)) {
    assert.ok(!String(value).includes('mutate'))
    assert.ok(!String(value).includes('grant'))
    assert.ok(!String(value).includes('authority'))
    assert.ok(!String(value).includes('execute'))
  }
})
