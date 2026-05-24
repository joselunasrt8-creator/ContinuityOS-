/**
 * tests/issue-1153-recursive-revocation-propagation.test.mjs
 * Issue #1153 — Recursive Revocation Propagation and Stale Lineage Collapse Enforcement
 *
 * FATE tests proving deterministic recursive revocation propagation, stale lineage
 * collapse enforcement, revocation chronology reconstructability, distributed
 * revocation convergence, and revocation drift taxonomy.
 *
 * Primary invariant:
 *   No valid continuity lineage → no valid authority → no valid execution
 *
 * Revocation invariant:
 *   Revoked lineage must deterministically invalidate all descendant legitimacy.
 *   Revoked lineage cannot preserve authority, replay eligibility, or proof continuity.
 *
 * Evidence only — no execution authority changes, no mutation surface widening,
 * no probabilistic revocation decisions, no replay bypass paths,
 * no legitimacy semantic weakening.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  REVOCATION_PROPAGATION_RESULTS,
  REVOCATION_DESCENDANT_FAILURES,
  REVOCATION_DRIFT_CLASSES,
  REVOCATION_REPAIR_CLASSES,
  REVOCATION_CONVERGENCE_RESULTS,
  computeRevocationTopologyHash,
  traverseDescendantRevocation,
  verifyRevocationPropagationCompleteness,
  enforceStaleLineageCollapse,
  reconstructRevocationChronology,
  auditRevocationAncestry,
  validateRevokedReplayIneligibility,
  validateRevokedProofContinuity,
  verifyDistributedRevocationConvergence,
  classifyRevocationDrift,
  computeRevocationRepairDiagnostics,
  buildRevocationPropagationAuditSurface,
  propagateRevocationLineage,
} from '../src/recursive-revocation-propagation.ts'

// ── Test fixtures ─────────────────────────────────────────────────────────────

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const HASH_A = sha256('revocation-hash-a')
const HASH_B = sha256('revocation-hash-b')
const HASH_C = sha256('revocation-hash-c')
const REG_HASH = sha256('registry-hash-revocation')
const REG_HASH_2 = sha256('registry-hash-revocation-2')

function makeEntry(overrides = {}) {
  return {
    continuity_id: 'cid-1',
    session_id: 'sess-1',
    parent_continuity_id: null,
    continuity_hash: HASH_A,
    status: 'ACTIVE',
    revoked_at: null,
    expires_at: null,
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

function makeRevocationRecord(overrides = {}) {
  return {
    revocation_id: 'rev-1',
    root_continuity_id: 'cid-1',
    revoked_at: '2024-01-01T00:00:00.000Z',
    propagated_ids: [],
    ...overrides,
  }
}

function makeReplayRecord(overrides = {}) {
  return {
    replay_id: 'replay-1',
    continuity_id: 'cid-1',
    continuity_hash: HASH_A,
    lineage_hash: HASH_B,
    ...overrides,
  }
}

function makeProofRecord(overrides = {}) {
  return {
    proof_id: 'proof-1',
    continuity_id: 'cid-1',
    proof_hash: HASH_A,
    lineage_hash: HASH_B,
    ...overrides,
  }
}

function makeInput(overrides = {}) {
  const views = overrides.registry_views ?? [makeView()]
  return {
    propagation_id: 'prop-test-001',
    evidence_only: true,
    registry_views: views,
    revocation_records: null,
    proof_records: null,
    replay_records: null,
    max_descent_depth: null,
    ...overrides,
  }
}

function run(overrides = {}) {
  return propagateRevocationLineage(makeInput(overrides))
}

function makeIndex(entries) {
  return new Map(entries.map((e) => [e.continuity_id, e]))
}

// ── 1. Evidence-only output ───────────────────────────────────────────────────

test('output is always evidence_only with correct artifact_type', () => {
  const result = run()
  assert.equal(result.evidence_only, true)
  assert.equal(result.artifact_type, 'RECURSIVE_REVOCATION_PROPAGATION')
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
  const result = propagateRevocationLineage(null)
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
  assert.equal(result.evidence_only, true)
})

test('missing propagation_id returns NULL with unknown id', () => {
  const result = propagateRevocationLineage({
    evidence_only: true,
    registry_views: [makeView()],
  })
  assert.equal(result.propagation_id, 'unknown')
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
})

test('evidence_only false returns NULL', () => {
  const result = propagateRevocationLineage({
    propagation_id: 'test',
    evidence_only: false,
    registry_views: [makeView()],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
})

test('empty registry_views returns NULL', () => {
  const result = run({ registry_views: [] })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
  assert.equal(result.entry_count, 0)
})

test('forbidden field creates_authority in input returns NULL', () => {
  const result = propagateRevocationLineage({
    propagation_id: 'test',
    evidence_only: true,
    creates_authority: true,
    registry_views: [makeView()],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
})

test('forbidden field break_glass in registry view returns NULL', () => {
  const result = propagateRevocationLineage({
    propagation_id: 'test',
    evidence_only: true,
    registry_views: [{ ...makeView(), break_glass: true }],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
})

test('forbidden field auto_repair in entry returns NULL', () => {
  const result = run({
    registry_views: [makeView({ entries: [makeEntry({ auto_repair: true })] })],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
})

// ── 3. Clean propagation — no revocations → PROPAGATION_COMPLETE ──────────────

test('single active entry with no revocations produces PROPAGATION_COMPLETE', () => {
  const result = run()
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COMPLETE)
  assert.equal(result.entry_count, 1)
  assert.equal(result.incomplete_propagations.length, 0)
  assert.equal(result.stale_lineage_collapses.length, 0)
})

test('active parent and active child with no revocations produces PROPAGATION_COMPLETE', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-parent',
    continuity_hash: HASH_B,
  })
  const result = run({
    registry_views: [makeView({ entries: [parent, child], lineage_root_id: 'cid-parent' })],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COMPLETE)
  assert.equal(result.entry_count, 2)
})

// ── 4. Incomplete propagation → PROPAGATION_INCOMPLETE ───────────────────────

test('revocation record with active descendant produces PROPAGATION_INCOMPLETE', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent', status: 'REVOKED' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-parent',
    continuity_hash: HASH_B,
    status: 'ACTIVE',
  })
  const result = run({
    registry_views: [makeView({ entries: [parent, child] })],
    revocation_records: [
      makeRevocationRecord({ root_continuity_id: 'cid-parent', propagated_ids: [] }),
    ],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_INCOMPLETE)
  assert.ok(result.incomplete_propagations.includes('cid-child'))
})

test('revocation record with propagated_ids covering all descendants produces PROPAGATION_COMPLETE', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent', status: 'REVOKED' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-parent',
    continuity_hash: HASH_B,
    status: 'REVOKED',
    revoked_at: '2024-01-01T00:00:00.000Z',
  })
  const result = run({
    registry_views: [makeView({ entries: [parent, child] })],
    revocation_records: [
      makeRevocationRecord({
        root_continuity_id: 'cid-parent',
        propagated_ids: ['cid-child'],
      }),
    ],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COMPLETE)
  assert.equal(result.incomplete_propagations.length, 0)
})

// ── 5. Stale lineage collapse → PROPAGATION_STALE ────────────────────────────

test('revoked root with active descendants causes stale lineage collapse', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
    status: 'ACTIVE',
  })
  const entries = [root, child]
  const index = makeIndex(entries)
  const collapses = enforceStaleLineageCollapse(entries, index)
  assert.ok(collapses.length > 0)
  const collapse = collapses[0]
  assert.equal(collapse.revoked_root_id, 'cid-root')
  assert.ok(collapse.active_descendant_ids.includes('cid-child'))
})

test('stale lineage collapse has deterministic hash via canonical.js', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
    status: 'ACTIVE',
  })
  const entries1 = [root, child]
  const entries2 = [child, root]
  const collapses1 = enforceStaleLineageCollapse(entries1, makeIndex(entries1))
  const collapses2 = enforceStaleLineageCollapse(entries2, makeIndex(entries2))
  assert.equal(collapses1[0].collapse_hash, collapses2[0].collapse_hash)
})

test('entry with revoked_at set triggers stale lineage collapse if descendants are active', () => {
  const root = makeEntry({ continuity_id: 'cid-root', revoked_at: '2024-01-01T00:00:00.000Z' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
    status: 'ACTIVE',
  })
  const entries = [root, child]
  const index = makeIndex(entries)
  const collapses = enforceStaleLineageCollapse(entries, index)
  assert.ok(collapses.length > 0)
  assert.equal(collapses[0].revoked_root_id, 'cid-root')
})

test('fully revoked tree produces no stale lineage collapses', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
    status: 'REVOKED',
    revoked_at: '2024-01-01T00:00:00.000Z',
  })
  const entries = [root, child]
  const index = makeIndex(entries)
  const collapses = enforceStaleLineageCollapse(entries, index)
  assert.equal(collapses.length, 0)
})

test('stale lineage collapse includes all active descendants recursively', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
  })
  const grandchild = makeEntry({
    continuity_id: 'cid-grandchild',
    parent_continuity_id: 'cid-child',
    continuity_hash: HASH_C,
  })
  const entries = [root, child, grandchild]
  const index = makeIndex(entries)
  const collapses = enforceStaleLineageCollapse(entries, index)
  assert.ok(collapses.length > 0)
  const affected = collapses[0].active_descendant_ids
  assert.ok(affected.includes('cid-child'))
  assert.ok(affected.includes('cid-grandchild'))
})

// ── 6. Recursive Descendant Traversal ────────────────────────────────────────

test('traverseDescendantRevocation finds no descendants for leaf node', () => {
  const leaf = makeEntry({ continuity_id: 'cid-leaf' })
  const index = makeIndex([leaf])
  const result = traverseDescendantRevocation('cid-leaf', index, 32)
  assert.equal(result.ok, true)
  assert.equal(result.descendant_count, 0)
  assert.equal(result.root_continuity_id, 'cid-leaf')
  assert.deepEqual([...result.descendant_ids], [])
})

test('traverseDescendantRevocation finds single child', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-parent', continuity_hash: HASH_B })
  const index = makeIndex([parent, child])
  const result = traverseDescendantRevocation('cid-parent', index, 32)
  assert.equal(result.ok, true)
  assert.equal(result.descendant_count, 1)
  assert.ok(result.descendant_ids.includes('cid-child'))
})

test('traverseDescendantRevocation finds all descendants in deep chain', () => {
  const entries = []
  for (let i = 0; i < 5; i++) {
    entries.push(makeEntry({
      continuity_id: `cid-${i}`,
      parent_continuity_id: i === 0 ? null : `cid-${i - 1}`,
      continuity_hash: sha256(`hash-${i}`),
    }))
  }
  const index = makeIndex(entries)
  const result = traverseDescendantRevocation('cid-0', index, 32)
  assert.equal(result.ok, true)
  assert.equal(result.descendant_count, 4)
  for (let i = 1; i < 5; i++) {
    assert.ok(result.descendant_ids.includes(`cid-${i}`))
  }
})

test('traverseDescendantRevocation detects cycle in descendants', () => {
  const a = makeEntry({ continuity_id: 'cid-a' })
  const b = makeEntry({ continuity_id: 'cid-b', parent_continuity_id: 'cid-a', continuity_hash: HASH_B })
  const c = makeEntry({ continuity_id: 'cid-c', parent_continuity_id: 'cid-b', continuity_hash: HASH_C })
  // c → b but b → a so no cycle in this direction. Actual cycle: b has child c, c has child a
  const cycleA = makeEntry({ continuity_id: 'cid-cycle-a' })
  const cycleB = makeEntry({ continuity_id: 'cid-cycle-b', parent_continuity_id: 'cid-cycle-a', continuity_hash: HASH_B })
  // To create a cycle in the children: we need to add cid-cycle-a as child of cid-cycle-b
  // This means cid-cycle-a has parent_continuity_id = cid-cycle-b (cycle in parent direction)
  // But traverseDescendantRevocation goes DOWN (children), so to create a cycle
  // we need: cid-cycle-a is a child of cid-cycle-b AND cid-cycle-b is a child of cid-cycle-a
  const cyclic1 = makeEntry({ continuity_id: 'cyc-1', parent_continuity_id: 'cyc-2' })
  const cyclic2 = makeEntry({ continuity_id: 'cyc-2', parent_continuity_id: 'cyc-1', continuity_hash: HASH_B })
  const index = makeIndex([cyclic1, cyclic2])
  // Traversal from cyc-1: children of cyc-1 = [cyc-2] (cyc-2 has parent cyc-1)
  // children of cyc-2 = [cyc-1] (cyc-1 has parent cyc-2)
  // This creates a cycle in descendant traversal
  const result = traverseDescendantRevocation('cyc-1', index, 32)
  assert.equal(result.ok, false)
  assert.equal(result.failure_reason, REVOCATION_DESCENDANT_FAILURES.CYCLE_DETECTED)
})

test('traverseDescendantRevocation detects depth exceeded', () => {
  const entries = []
  for (let i = 0; i < 6; i++) {
    entries.push(makeEntry({
      continuity_id: `cid-${i}`,
      parent_continuity_id: i === 0 ? null : `cid-${i - 1}`,
      continuity_hash: sha256(`hash-${i}`),
    }))
  }
  const index = makeIndex(entries)
  const result = traverseDescendantRevocation('cid-0', index, 3)
  assert.equal(result.ok, false)
  assert.equal(result.failure_reason, REVOCATION_DESCENDANT_FAILURES.DEPTH_EXCEEDED)
})

test('traversal topology_hash is deterministic', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-parent', continuity_hash: HASH_B })
  const index = makeIndex([parent, child])
  const r1 = traverseDescendantRevocation('cid-parent', index, 32)
  const r2 = traverseDescendantRevocation('cid-parent', index, 32)
  assert.equal(r1.topology_hash, r2.topology_hash)
  assert.equal(r1.traversal_id, r2.traversal_id)
})

test('traversal topology_hash is a valid 64-char hex sha256', () => {
  const entry = makeEntry()
  const index = makeIndex([entry])
  const result = traverseDescendantRevocation('cid-1', index, 32)
  assert.match(result.topology_hash, /^[0-9a-f]{64}$/)
  assert.match(result.traversal_id, /^[0-9a-f]{64}$/)
})

// ── 7. Revocation Chronology Reconstruction ───────────────────────────────────

test('chronology is empty for no revocation records', () => {
  const chronology = reconstructRevocationChronology([])
  assert.equal(chronology.length, 0)
})

test('chronology sorts records by revoked_at ascending', () => {
  const records = [
    makeRevocationRecord({ revocation_id: 'rev-b', revoked_at: '2024-02-01T00:00:00.000Z', root_continuity_id: 'cid-b' }),
    makeRevocationRecord({ revocation_id: 'rev-a', revoked_at: '2024-01-01T00:00:00.000Z', root_continuity_id: 'cid-a' }),
  ]
  const chronology = reconstructRevocationChronology(records)
  assert.equal(chronology.length, 2)
  assert.equal(chronology[0].revocation_id, 'rev-a')
  assert.equal(chronology[1].revocation_id, 'rev-b')
  assert.equal(chronology[0].sequence_index, 0)
  assert.equal(chronology[1].sequence_index, 1)
})

test('chronology breaks ties by revocation_id lexicographic order', () => {
  const records = [
    makeRevocationRecord({ revocation_id: 'rev-z', revoked_at: '2024-01-01T00:00:00.000Z', root_continuity_id: 'cid-z' }),
    makeRevocationRecord({ revocation_id: 'rev-a', revoked_at: '2024-01-01T00:00:00.000Z', root_continuity_id: 'cid-a' }),
  ]
  const chronology = reconstructRevocationChronology(records)
  assert.equal(chronology[0].revocation_id, 'rev-a')
  assert.equal(chronology[1].revocation_id, 'rev-z')
})

test('chronology_hash is deterministic for the same record', () => {
  const records = [makeRevocationRecord()]
  const c1 = reconstructRevocationChronology(records)
  const c2 = reconstructRevocationChronology(records)
  assert.equal(c1[0].chronology_hash, c2[0].chronology_hash)
})

test('chronology_hash changes with different records', () => {
  const r1 = reconstructRevocationChronology([
    makeRevocationRecord({ revocation_id: 'rev-a', root_continuity_id: 'cid-a' }),
  ])
  const r2 = reconstructRevocationChronology([
    makeRevocationRecord({ revocation_id: 'rev-b', root_continuity_id: 'cid-b' }),
  ])
  assert.notEqual(r1[0].chronology_hash, r2[0].chronology_hash)
})

test('chronology_hash values are valid 64-char sha256 strings', () => {
  const records = [
    makeRevocationRecord({ revocation_id: 'rev-1', root_continuity_id: 'cid-1' }),
    makeRevocationRecord({ revocation_id: 'rev-2', root_continuity_id: 'cid-2', revoked_at: '2024-02-01T00:00:00.000Z' }),
  ]
  const chronology = reconstructRevocationChronology(records)
  for (const entry of chronology) {
    assert.match(entry.chronology_hash, /^[0-9a-f]{64}$/)
  }
})

// ── 8. Revocation Ancestry Auditing ──────────────────────────────────────────

test('auditRevocationAncestry finds no revoked ancestor for clean lineage', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const index = makeIndex([root, child])
  const audit = auditRevocationAncestry('cid-child', index, 32)
  assert.equal(audit.ancestor_revoked, false)
  assert.equal(audit.revoked_ancestor_id, null)
})

test('auditRevocationAncestry detects revoked ancestor', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const index = makeIndex([root, child])
  const audit = auditRevocationAncestry('cid-child', index, 32)
  assert.equal(audit.ancestor_revoked, true)
  assert.equal(audit.revoked_ancestor_id, 'cid-root')
})

test('auditRevocationAncestry detects ancestor with revoked_at set', () => {
  const root = makeEntry({ continuity_id: 'cid-root', revoked_at: '2024-01-01T00:00:00.000Z' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const index = makeIndex([root, child])
  const audit = auditRevocationAncestry('cid-child', index, 32)
  assert.equal(audit.ancestor_revoked, true)
  assert.equal(audit.revoked_ancestor_id, 'cid-root')
})

test('auditRevocationAncestry includes full ancestry_chain', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const index = makeIndex([root, child])
  const audit = auditRevocationAncestry('cid-child', index, 32)
  assert.ok(audit.ancestry_chain.includes('cid-child'))
  assert.ok(audit.ancestry_chain.includes('cid-root'))
})

test('auditRevocationAncestry ancestry_hash is deterministic', () => {
  const root = makeEntry({ continuity_id: 'cid-root' })
  const index = makeIndex([root])
  const a1 = auditRevocationAncestry('cid-root', index, 32)
  const a2 = auditRevocationAncestry('cid-root', index, 32)
  assert.equal(a1.ancestry_hash, a2.ancestry_hash)
  assert.equal(a1.audit_id, a2.audit_id)
})

test('auditRevocationAncestry hashes are valid 64-char sha256 strings', () => {
  const entry = makeEntry()
  const index = makeIndex([entry])
  const audit = auditRevocationAncestry('cid-1', index, 32)
  assert.match(audit.ancestry_hash, /^[0-9a-f]{64}$/)
  assert.match(audit.audit_id, /^[0-9a-f]{64}$/)
})

// ── 9. Revoked Replay Invalidation ───────────────────────────────────────────

test('replay on active continuity with no revocation is eligible', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'ACTIVE' })
  const index = makeIndex([entry])
  const replay = makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1', continuity_hash: HASH_A })
  const result = validateRevokedReplayIneligibility(replay, index, [])
  assert.equal(result.eligible, true)
  assert.equal(result.ineligibility_reason, null)
})

test('replay on revoked continuity is ineligible', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const index = makeIndex([entry])
  const replay = makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1' })
  const result = validateRevokedReplayIneligibility(replay, index, [])
  assert.equal(result.eligible, false)
  assert.equal(result.ineligibility_reason, 'continuity_revoked_or_non_active')
})

test('replay on continuity_id in revocation cascade is ineligible', () => {
  const entry = makeEntry({ continuity_id: 'cid-child', status: 'ACTIVE' })
  const index = makeIndex([entry])
  const replay = makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-child' })
  const revRecord = makeRevocationRecord({
    root_continuity_id: 'cid-parent',
    propagated_ids: ['cid-child'],
  })
  const result = validateRevokedReplayIneligibility(replay, index, [revRecord])
  assert.equal(result.eligible, false)
  assert.equal(result.ineligibility_reason, 'revocation_cascade_detected')
})

test('replay with continuity_hash mismatch is ineligible', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', continuity_hash: HASH_A, status: 'ACTIVE' })
  const index = makeIndex([entry])
  const replay = makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1', continuity_hash: HASH_B })
  const result = validateRevokedReplayIneligibility(replay, index, [])
  assert.equal(result.eligible, false)
  assert.equal(result.ineligibility_reason, 'continuity_hash_mismatch')
})

test('replay on missing continuity_id is ineligible', () => {
  const index = makeIndex([])
  const replay = makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-missing' })
  const result = validateRevokedReplayIneligibility(replay, index, [])
  assert.equal(result.eligible, false)
  assert.equal(result.ineligibility_reason, 'continuity_not_found')
})

// ── 10. Revoked Proof Continuity Invalidation ─────────────────────────────────

test('proof on active continuity with no revocation is valid', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'ACTIVE' })
  const index = makeIndex([entry])
  const proof = makeProofRecord({ proof_id: 'p1', continuity_id: 'cid-1' })
  const result = validateRevokedProofContinuity(proof, index, [])
  assert.equal(result.valid, true)
  assert.equal(result.invalidity_reason, null)
})

test('proof on revoked continuity is invalid', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const index = makeIndex([entry])
  const proof = makeProofRecord({ proof_id: 'p1', continuity_id: 'cid-1' })
  const result = validateRevokedProofContinuity(proof, index, [])
  assert.equal(result.valid, false)
  assert.equal(result.invalidity_reason, 'proof_continuity_revoked')
})

test('proof on continuity in revocation cascade is invalid', () => {
  const entry = makeEntry({ continuity_id: 'cid-child', status: 'ACTIVE' })
  const index = makeIndex([entry])
  const proof = makeProofRecord({ proof_id: 'p1', continuity_id: 'cid-child' })
  const revRecord = makeRevocationRecord({
    root_continuity_id: 'cid-parent',
    propagated_ids: ['cid-child'],
  })
  const result = validateRevokedProofContinuity(proof, index, [revRecord])
  assert.equal(result.valid, false)
  assert.equal(result.invalidity_reason, 'proof_continuity_in_revocation_cascade')
})

test('proof on missing continuity_id is invalid', () => {
  const index = makeIndex([])
  const proof = makeProofRecord({ proof_id: 'p1', continuity_id: 'cid-missing' })
  const result = validateRevokedProofContinuity(proof, index, [])
  assert.equal(result.valid, false)
  assert.equal(result.invalidity_reason, 'proof_continuity_not_found')
})

// ── 11. Distributed Revocation Convergence ───────────────────────────────────

test('single view produces CONVERGENCE_REACHED', () => {
  const result = verifyDistributedRevocationConvergence([makeView()], 'prop-1')
  assert.equal(result.convergence_result, REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_REACHED)
  assert.equal(result.converged_count, 1)
  assert.equal(result.diverged_count, 0)
})

test('two views with same registry_hash produce CONVERGENCE_REACHED', () => {
  const v1 = makeView()
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2' })
  const result = verifyDistributedRevocationConvergence([v1, v2], 'prop-1')
  assert.equal(result.convergence_result, REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_REACHED)
  assert.equal(result.converged_count, 2)
  assert.equal(result.diverged_count, 0)
})

test('two views with different registry_hash produce CONVERGENCE_FAILED', () => {
  const v1 = makeView({ registry_hash: REG_HASH })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', registry_hash: REG_HASH_2 })
  const result = verifyDistributedRevocationConvergence([v1, v2], 'prop-1')
  assert.equal(result.convergence_result, REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_FAILED)
})

test('empty views produce NULL convergence', () => {
  const result = verifyDistributedRevocationConvergence([], 'prop-1')
  assert.equal(result.convergence_result, REVOCATION_CONVERGENCE_RESULTS.NULL)
  assert.equal(result.converged_count, 0)
})

test('convergence produces valid 64-char sha256 convergence_id and topology_hash', () => {
  const result = verifyDistributedRevocationConvergence([makeView()], 'prop-1')
  assert.match(result.convergence_id, /^[0-9a-f]{64}$/)
  assert.match(result.revocation_topology_hash, /^[0-9a-f]{64}$/)
})

test('convergence is deterministic for same input', () => {
  const views = [makeView()]
  const r1 = verifyDistributedRevocationConvergence(views, 'prop-1')
  const r2 = verifyDistributedRevocationConvergence(views, 'prop-1')
  assert.equal(r1.convergence_id, r2.convergence_id)
  assert.equal(r1.revocation_topology_hash, r2.revocation_topology_hash)
})

// ── 12. Revocation Topology Hash ─────────────────────────────────────────────

test('topology hash is deterministic regardless of insertion order', () => {
  const a = makeEntry({ continuity_id: 'cid-a', continuity_hash: HASH_A })
  const b = makeEntry({ continuity_id: 'cid-b', continuity_hash: HASH_B })
  const hash1 = computeRevocationTopologyHash([a, b])
  const hash2 = computeRevocationTopologyHash([b, a])
  assert.equal(hash1, hash2)
})

test('topology hash changes when entry data changes', () => {
  const a = makeEntry({ continuity_hash: HASH_A })
  const b = makeEntry({ continuity_hash: HASH_B })
  assert.notEqual(computeRevocationTopologyHash([a]), computeRevocationTopologyHash([b]))
})

test('topology hash is a valid 64-char hex sha256', () => {
  const hash = computeRevocationTopologyHash([makeEntry()])
  assert.match(hash, /^[0-9a-f]{64}$/)
})

test('topology hash changes when revoked_at is added to entry', () => {
  const active = makeEntry({ continuity_id: 'cid-1', revoked_at: null })
  const revoked = makeEntry({ continuity_id: 'cid-1', revoked_at: '2024-01-01T00:00:00.000Z' })
  const hash1 = computeRevocationTopologyHash([active])
  const hash2 = computeRevocationTopologyHash([revoked])
  assert.notEqual(hash1, hash2)
})

// ── 13. Revocation Drift Taxonomy ─────────────────────────────────────────────

test('incomplete propagation produces DESCENDANT_PROPAGATION_INCOMPLETE drift observation', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-parent', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [parent, child] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-parent' })],
  })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.DESCENDANT_PROPAGATION_INCOMPLETE,
  )
  assert.ok(obs, 'must have descendant_propagation_incomplete observation')
  assert.equal(obs.severity, 'fatal')
  assert.equal(obs.affected_continuity_id, 'cid-child')
})

test('stale lineage produces STALE_LINEAGE_RESURRECTION drift observation', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [root, child] })],
  })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.STALE_LINEAGE_RESURRECTION,
  )
  assert.ok(obs, 'must have stale_lineage_resurrection observation')
  assert.equal(obs.severity, 'fatal')
  assert.equal(obs.affected_continuity_id, 'cid-root')
})

test('revoked ancestor produces ANCESTOR_REVOCATION_UNRESOLVED drift observation', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [root, child] })],
  })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.ANCESTOR_REVOCATION_UNRESOLVED,
  )
  assert.ok(obs, 'must have ancestor_revocation_unresolved observation')
  assert.equal(obs.severity, 'fatal')
})

test('ineligible replay produces REPLAY_REVOCATION_BARRIER_VIOLATED drift observation', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [entry] })],
    replay_records: [makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1' })],
  })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.REPLAY_REVOCATION_BARRIER_VIOLATED,
  )
  assert.ok(obs, 'must have replay_revocation_barrier_violated observation')
  assert.equal(obs.severity, 'fatal')
})

test('invalid proof continuity produces PROOF_REVOCATION_BARRIER_VIOLATED drift observation', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [entry] })],
    proof_records: [makeProofRecord({ proof_id: 'p1', continuity_id: 'cid-1' })],
  })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.PROOF_REVOCATION_BARRIER_VIOLATED,
  )
  assert.ok(obs, 'must have proof_revocation_barrier_violated observation')
  assert.equal(obs.severity, 'fatal')
})

test('divergent views produce DISTRIBUTED_REVOCATION_DRIFT drift observation', () => {
  const v1 = makeView({ registry_hash: REG_HASH })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', registry_hash: REG_HASH_2 })
  const result = run({ registry_views: [v1, v2] })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.DISTRIBUTED_REVOCATION_DRIFT,
  )
  assert.ok(obs, 'must have distributed_revocation_drift observation')
  assert.equal(obs.severity, 'fatal')
})

test('cycle in descendant traversal produces REVOCATION_LINEAGE_CYCLE drift observation', () => {
  const cyclic1 = makeEntry({ continuity_id: 'cyc-1', parent_continuity_id: 'cyc-2', status: 'REVOKED' })
  const cyclic2 = makeEntry({ continuity_id: 'cyc-2', parent_continuity_id: 'cyc-1', continuity_hash: HASH_B, status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [cyclic1, cyclic2] })],
  })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.REVOCATION_LINEAGE_CYCLE,
  )
  assert.ok(obs, 'must have revocation_lineage_cycle observation')
  assert.equal(obs.severity, 'fatal')
})

// ── 14. Revocation Repair Diagnostics ─────────────────────────────────────────

test('incomplete propagation produces PROPAGATE_REVOCATION_TO_DESCENDANTS repair', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-parent', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [parent, child] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-parent' })],
  })
  const diag = result.repair_diagnostics.find(
    (d) => d.repair_class === REVOCATION_REPAIR_CLASSES.PROPAGATE_REVOCATION_TO_DESCENDANTS,
  )
  assert.ok(diag, 'must have propagate_revocation_to_descendants repair diagnostic')
  assert.equal(diag.repairable, true)
  assert.equal(diag.affected_continuity_id, 'cid-child')
})

test('stale lineage produces PROPAGATE_REVOCATION_TO_DESCENDANTS repair diagnostic', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [root, child] })],
  })
  const diag = result.repair_diagnostics.find(
    (d) =>
      d.repair_class === REVOCATION_REPAIR_CLASSES.PROPAGATE_REVOCATION_TO_DESCENDANTS &&
      d.affected_continuity_id === 'cid-root',
  )
  assert.ok(diag)
  assert.equal(diag.repairable, true)
})

test('ineligible replay produces INVALIDATE_STALE_REPLAY repair diagnostic that is not repairable', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [entry] })],
    replay_records: [makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1' })],
  })
  const diag = result.repair_diagnostics.find(
    (d) => d.repair_class === REVOCATION_REPAIR_CLASSES.INVALIDATE_STALE_REPLAY,
  )
  assert.ok(diag)
  assert.equal(diag.repairable, false)
})

test('invalid proof produces INVALIDATE_PROOF_CONTINUITY repair diagnostic that is not repairable', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [entry] })],
    proof_records: [makeProofRecord({ proof_id: 'p1', continuity_id: 'cid-1' })],
  })
  const diag = result.repair_diagnostics.find(
    (d) => d.repair_class === REVOCATION_REPAIR_CLASSES.INVALIDATE_PROOF_CONTINUITY,
  )
  assert.ok(diag)
  assert.equal(diag.repairable, false)
})

test('divergent views produce RECONCILE_REVOCATION_VIEWS repair diagnostic that is repairable', () => {
  const v1 = makeView({ registry_hash: REG_HASH })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', registry_hash: REG_HASH_2 })
  const result = run({ registry_views: [v1, v2] })
  const diag = result.repair_diagnostics.find(
    (d) => d.repair_class === REVOCATION_REPAIR_CLASSES.RECONCILE_REVOCATION_VIEWS,
  )
  assert.ok(diag)
  assert.equal(diag.repairable, true)
})

test('cycle produces REVOCATION_PERMANENTLY_INVALID repair diagnostic', () => {
  const cyclic1 = makeEntry({ continuity_id: 'cyc-1', parent_continuity_id: 'cyc-2', status: 'REVOKED' })
  const cyclic2 = makeEntry({ continuity_id: 'cyc-2', parent_continuity_id: 'cyc-1', continuity_hash: HASH_B, status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [cyclic1, cyclic2] })],
  })
  const diag = result.repair_diagnostics.find(
    (d) => d.repair_class === REVOCATION_REPAIR_CLASSES.REVOCATION_PERMANENTLY_INVALID,
  )
  assert.ok(diag)
  assert.equal(diag.repairable, false)
})

// ── 15. Audit Surface ─────────────────────────────────────────────────────────

test('audit surface has valid audit_id sha256', () => {
  const result = run()
  assert.match(result.audit_surface.audit_id, /^[0-9a-f]{64}$/)
})

test('audit surface propagation_id matches input', () => {
  const result = run({ propagation_id: 'my-prop-id' })
  assert.equal(result.audit_surface.propagation_id, 'my-prop-id')
})

test('audit surface reflects propagation_complete correctly', () => {
  const result = run()
  assert.equal(result.audit_surface.propagation_complete, true)
})

test('audit surface reflects propagation_incomplete correctly', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-parent', continuity_hash: HASH_B })
  const result = run({
    registry_views: [makeView({ entries: [parent, child] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-parent' })],
  })
  assert.equal(result.audit_surface.propagation_complete, false)
})

test('buildRevocationPropagationAuditSurface produces deterministic audit_id', () => {
  const params = {
    propagationId: 'test-prop',
    revocationTopologyHash: HASH_A,
    totalEntryCount: 5,
    revokedCount: 2,
    propagationComplete: true,
    driftCount: 0,
    convergenceResult: REVOCATION_CONVERGENCE_RESULTS.CONVERGENCE_REACHED,
  }
  const s1 = buildRevocationPropagationAuditSurface(params)
  const s2 = buildRevocationPropagationAuditSurface(params)
  assert.equal(s1.audit_id, s2.audit_id)
})

// ── 16. Cycle → PROPAGATION_COLLAPSED ────────────────────────────────────────

test('cycle in revoked root descendants produces PROPAGATION_COLLAPSED', () => {
  const cyclic1 = makeEntry({ continuity_id: 'cyc-1', parent_continuity_id: 'cyc-2', status: 'REVOKED' })
  const cyclic2 = makeEntry({ continuity_id: 'cyc-2', parent_continuity_id: 'cyc-1', continuity_hash: HASH_B, status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [cyclic1, cyclic2] })],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COLLAPSED)
})

test('depth exceeded in revoked root descendants produces PROPAGATION_COLLAPSED', () => {
  const entries = []
  for (let i = 0; i < 6; i++) {
    entries.push(makeEntry({
      continuity_id: `cid-${i}`,
      parent_continuity_id: i === 0 ? null : `cid-${i - 1}`,
      continuity_hash: sha256(`hash-${i}`),
      status: i === 0 ? 'REVOKED' : 'ACTIVE',
    }))
  }
  const result = run({
    registry_views: [makeView({ entries, lineage_root_id: 'cid-0' })],
    max_descent_depth: 2,
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COLLAPSED)
})

// ── 17. Convergence failure → PROPAGATION_CONVERGENCE_FAILED ─────────────────

test('multiple views with divergent registry_hash produces PROPAGATION_CONVERGENCE_FAILED when no other failures', () => {
  const entry = makeEntry({ continuity_id: 'cid-1' })
  const v1 = makeView({ entries: [entry], registry_hash: REG_HASH })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', entries: [entry], registry_hash: REG_HASH_2 })
  const result = run({ registry_views: [v1, v2] })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_CONVERGENCE_FAILED)
})

// ── 18. Propagation result priority ordering ──────────────────────────────────

test('cycle takes priority over incomplete propagation', () => {
  const cyclic1 = makeEntry({ continuity_id: 'cyc-1', parent_continuity_id: 'cyc-2', status: 'REVOKED' })
  const cyclic2 = makeEntry({ continuity_id: 'cyc-2', parent_continuity_id: 'cyc-1', continuity_hash: HASH_B, status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cyc-1', continuity_hash: HASH_C })
  const result = run({
    registry_views: [makeView({ entries: [cyclic1, cyclic2, child] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cyc-1' })],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COLLAPSED)
})

test('incomplete propagation takes priority over stale collapse', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child1 = makeEntry({ continuity_id: 'cid-child1', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const child2 = makeEntry({ continuity_id: 'cid-child2', parent_continuity_id: 'cid-root', continuity_hash: HASH_C, status: 'ACTIVE' })
  const result = run({
    registry_views: [makeView({ entries: [root, child1, child2] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-root', propagated_ids: [] })],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_INCOMPLETE)
})

// ── 19. Determinism ───────────────────────────────────────────────────────────

test('identical inputs produce identical revocation_topology_hash', () => {
  const r1 = run()
  const r2 = run()
  assert.equal(r1.revocation_topology_hash, r2.revocation_topology_hash)
})

test('identical inputs produce identical propagation_result', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const input = makeInput({
    registry_views: [makeView({ entries: [root, child] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-root' })],
  })
  const r1 = propagateRevocationLineage(input)
  const r2 = propagateRevocationLineage(input)
  assert.equal(r1.propagation_result, r2.propagation_result)
  assert.equal(r1.revocation_topology_hash, r2.revocation_topology_hash)
})

test('full output is deterministic for multi-node revocation lineage', () => {
  const entries = [
    makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' }),
    makeEntry({ continuity_id: 'cid-2', parent_continuity_id: 'cid-1', continuity_hash: HASH_B }),
    makeEntry({ continuity_id: 'cid-3', parent_continuity_id: 'cid-2', continuity_hash: HASH_C }),
  ]
  const input = makeInput({
    registry_views: [makeView({ entries, lineage_root_id: 'cid-1' })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-1', propagated_ids: [] })],
  })
  const r1 = propagateRevocationLineage(input)
  const r2 = propagateRevocationLineage(input)
  assert.equal(r1.revocation_topology_hash, r2.revocation_topology_hash)
  assert.equal(r1.propagation_result, r2.propagation_result)
  assert.equal(r1.audit_surface.audit_id, r2.audit_surface.audit_id)
})

// ── 20. Frozen output ─────────────────────────────────────────────────────────

test('output object is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result))
})

test('descendant_traversal_results array is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result.descendant_traversal_results))
})

test('stale_lineage_collapses array is frozen', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = run({ registry_views: [makeView({ entries: [root, child] })] })
  assert.ok(Object.isFrozen(result.stale_lineage_collapses))
})

test('chronology array is frozen', () => {
  const result = run({ revocation_records: [makeRevocationRecord()] })
  assert.ok(Object.isFrozen(result.chronology))
})

test('drift_observations array is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result.drift_observations))
})

test('repair_diagnostics array is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result.repair_diagnostics))
})

test('convergence object is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result.convergence))
})

test('audit_surface object is frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result.audit_surface))
})

// ── 21. Canonical hashing routes through canonical.js ─────────────────────────

test('revocation_topology_hash is a valid 64-char hex sha256', () => {
  const result = run()
  assert.match(result.revocation_topology_hash, /^[0-9a-f]{64}$/)
})

test('convergence convergence_id is a valid 64-char hex sha256', () => {
  const result = run()
  assert.match(result.convergence.convergence_id, /^[0-9a-f]{64}$/)
})

test('convergence revocation_topology_hash is a valid 64-char hex sha256', () => {
  const result = run()
  assert.match(result.convergence.revocation_topology_hash, /^[0-9a-f]{64}$/)
})

test('audit_surface audit_id is a valid 64-char hex sha256', () => {
  const result = run()
  assert.match(result.audit_surface.audit_id, /^[0-9a-f]{64}$/)
})

test('descendant traversal topology_hash values are valid sha256 strings', () => {
  const revoked = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const result = run({ registry_views: [makeView({ entries: [revoked] })] })
  for (const traversal of result.descendant_traversal_results) {
    assert.match(traversal.topology_hash, /^[0-9a-f]{64}$/)
    assert.match(traversal.traversal_id, /^[0-9a-f]{64}$/)
  }
})

test('stale collapse hashes are valid 64-char sha256 strings', () => {
  const root = makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = run({ registry_views: [makeView({ entries: [root, child] })] })
  for (const collapse of result.stale_lineage_collapses) {
    assert.match(collapse.collapse_id, /^[0-9a-f]{64}$/)
    assert.match(collapse.collapse_hash, /^[0-9a-f]{64}$/)
  }
})

// ── 22. Fail-closed behavior ──────────────────────────────────────────────────

test('revoked continuity never has eligible replay', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [entry] })],
    replay_records: [makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1' })],
  })
  for (const re of result.replay_eligibility) {
    if (re.continuity_id === 'cid-1') {
      assert.equal(re.eligible, false)
    }
  }
})

test('revoked continuity never has valid proof continuity', () => {
  const entry = makeEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = run({
    registry_views: [makeView({ entries: [entry] })],
    proof_records: [makeProofRecord({ proof_id: 'p1', continuity_id: 'cid-1' })],
  })
  for (const pv of result.proof_continuity_validations) {
    if (pv.continuity_id === 'cid-1') {
      assert.equal(pv.valid, false)
    }
  }
})

// ── 23. No execution authority semantics ─────────────────────────────────────

test('REVOCATION_PROPAGATION_RESULTS contains no execution authority values', () => {
  for (const value of Object.values(REVOCATION_PROPAGATION_RESULTS)) {
    assert.ok(!String(value).includes('AUTHORITY'))
    assert.ok(!String(value).includes('EXECUTE'))
    assert.ok(!String(value).includes('PROOF'))
    assert.ok(!String(value).includes('GRANT'))
  }
})

test('REVOCATION_REPAIR_CLASSES contains no mutation or authority escalation values', () => {
  for (const value of Object.values(REVOCATION_REPAIR_CLASSES)) {
    assert.ok(!String(value).includes('grant'))
    assert.ok(!String(value).includes('execute'))
    assert.ok(!String(value).includes('mutate'))
    assert.ok(!String(value).includes('create_authority'))
  }
})

test('REVOCATION_DRIFT_CLASSES contains only observation-oriented values', () => {
  const values = Object.values(REVOCATION_DRIFT_CLASSES)
  assert.ok(values.length > 0)
  for (const value of values) {
    assert.ok(typeof value === 'string')
    assert.ok(value.length > 0)
  }
})

// ── 24. Multi-view deduplication ─────────────────────────────────────────────

test('same entry across multiple views deduplicates to single entry_count', () => {
  const entry = makeEntry({ continuity_id: 'cid-shared' })
  const v1 = makeView({ node_id: 'node-1', entries: [entry] })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', entries: [entry] })
  const result = run({ registry_views: [v1, v2] })
  assert.equal(result.entry_count, 1)
})

test('additional entries in second view are merged into entry count', () => {
  const shared = makeEntry({ continuity_id: 'cid-shared' })
  const extra = makeEntry({ continuity_id: 'cid-extra', continuity_hash: HASH_B })
  const v1 = makeView({ node_id: 'node-1', entries: [shared] })
  const v2 = makeView({ node_id: 'node-2', registry_epoch: 'epoch-2', entries: [shared, extra] })
  const result = run({ registry_views: [v1, v2] })
  assert.equal(result.entry_count, 2)
})

// ── 25. verifyRevocationPropagationCompleteness unit tests ───────────────────

test('verifyRevocationPropagationCompleteness: no revocation records → complete', () => {
  const entry = makeEntry({ continuity_id: 'cid-1' })
  const index = makeIndex([entry])
  const { complete, incomplete_ids } = verifyRevocationPropagationCompleteness([], [], index)
  assert.equal(complete, true)
  assert.equal(incomplete_ids.length, 0)
})

test('verifyRevocationPropagationCompleteness: revoked root with active child → incomplete', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-parent', continuity_hash: HASH_B })
  const index = makeIndex([parent, child])
  const traversal = traverseDescendantRevocation('cid-parent', index, 32)
  const revRecord = makeRevocationRecord({ root_continuity_id: 'cid-parent', propagated_ids: [] })
  const { complete, incomplete_ids } = verifyRevocationPropagationCompleteness([traversal], [revRecord], index)
  assert.equal(complete, false)
  assert.ok(incomplete_ids.includes('cid-child'))
})

test('verifyRevocationPropagationCompleteness: revoked root with revoked child → complete', () => {
  const parent = makeEntry({ continuity_id: 'cid-parent', status: 'REVOKED' })
  const child = makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-parent', continuity_hash: HASH_B, status: 'REVOKED', revoked_at: '2024-01-01T00:00:00.000Z' })
  const index = makeIndex([parent, child])
  const traversal = traverseDescendantRevocation('cid-parent', index, 32)
  const revRecord = makeRevocationRecord({ root_continuity_id: 'cid-parent', propagated_ids: ['cid-child'] })
  const { complete } = verifyRevocationPropagationCompleteness([traversal], [revRecord], index)
  assert.equal(complete, true)
})
