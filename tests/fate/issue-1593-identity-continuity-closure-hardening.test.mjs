/**
 * tests/fate/issue-1593-identity-continuity-closure-hardening.test.mjs
 * Issue #1593 — P0: Identity Continuity Closure Hardening
 *
 * FATE tests proving each acceptance criterion:
 *   1. Orphan lineage rejection — fail-closed admission
 *   2. Recursive revocation propagation — descendant invalidation
 *   3. Continuity replay invalidation — revocation-bound replay
 *   4. Continuity freshness validation — liveness enforcement
 *   5. Temporal continuity expiry enforcement — expiry propagation
 *   6. FATE coverage for all failure paths
 *   7. Fail-closed behavior across all surfaces
 *
 * Primary invariant:
 *   No valid continuity lineage → no valid authority → no valid execution
 *
 * Evidence only — all imported modules are evidence-only surfaces.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  verifyContinuityLineage,
} from '../../src/runtime/continuity/verifyContinuityLineage.ts'

import {
  CONTINUITY_CLOSURE_RESULTS,
  ANCESTRY_FAILURE_REASONS,
  CLOSURE_DRIFT_CLASSES,
  enforceLineageFreshnessBarrier,
  traverseContinuityAncestry,
  verifyDistributedContinuityLineageClosure,
} from '../../src/continuity-lineage-closure-hardening.ts'

import {
  REVOCATION_PROPAGATION_RESULTS,
  REVOCATION_DRIFT_CLASSES,
  enforceStaleLineageCollapse,
  propagateRevocationLineage,
} from '../../src/recursive-revocation-propagation.ts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const HASH_A = sha256('1593-hash-a')
const HASH_B = sha256('1593-hash-b')
const HASH_C = sha256('1593-hash-c')
const REG_HASH = sha256('1593-registry-hash')
const REG_HASH_2 = sha256('1593-registry-hash-2')

const FUTURE = new Date(Date.now() + 3_600_000).toISOString()
const PAST = '2020-01-01T00:00:00.000Z'
const SOON = new Date(Date.now() + 1000).toISOString()

function lineageHash(lineage) {
  return sha256(JSON.stringify(lineage.map((n) => n.continuity_id)))
}

function makeSession(overrides = {}) {
  return {
    session_id: 'sess-1593',
    identity_id: 'id-1593',
    continuity_status: 'ACTIVE',
    expires_at: FUTURE,
    ...overrides,
  }
}

function makeNode(overrides = {}) {
  return {
    continuity_id: 'cid-root-1593',
    session_id: 'sess-1593',
    identity_id: 'id-1593',
    parent_continuity_id: null,
    continuity_hash: HASH_A,
    status: 'ACTIVE',
    expires_at: FUTURE,
    revoked_at: null,
    ...overrides,
  }
}

function makeClosureEntry(overrides = {}) {
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

function makeClosureView(overrides = {}) {
  const entries = overrides.entries ?? [makeClosureEntry()]
  const { entries: _e, ...rest } = overrides
  return {
    node_id: 'node-1',
    registry_epoch: 'epoch-1',
    lineage_root_id: 'cid-1',
    entries,
    registry_hash: REG_HASH,
    ...rest,
  }
}

function runClosure(overrides = {}) {
  const views = overrides.registry_views ?? [makeClosureView()]
  return verifyDistributedContinuityLineageClosure({
    closure_id: 'closure-1593',
    evidence_only: true,
    registry_views: views,
    freshness_horizon_ms: null,
    max_ancestry_depth: null,
    ...overrides,
  })
}

function makeRevEntry(overrides = {}) {
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

function makeRevView(overrides = {}) {
  const entries = overrides.entries ?? [makeRevEntry()]
  const { entries: _e, ...rest } = overrides
  return {
    node_id: 'node-1',
    registry_epoch: 'epoch-1',
    lineage_root_id: 'cid-1',
    entries,
    registry_hash: REG_HASH,
    ...rest,
  }
}

function runPropagation(overrides = {}) {
  return propagateRevocationLineage({
    propagation_id: 'prop-1593',
    evidence_only: true,
    registry_views: overrides.registry_views ?? [makeRevView()],
    revocation_records: null,
    proof_records: null,
    replay_records: null,
    max_descent_depth: null,
    ...overrides,
  })
}

function makeRevocationRecord(overrides = {}) {
  return {
    revocation_id: 'rev-1593',
    root_continuity_id: 'cid-1',
    revoked_at: '2024-01-01T00:00:00.000Z',
    propagated_ids: [],
    ...overrides,
  }
}

function makeReplayRecord(overrides = {}) {
  return {
    replay_id: 'replay-1593',
    continuity_id: 'cid-1',
    continuity_hash: HASH_A,
    lineage_hash: HASH_B,
    ...overrides,
  }
}

function makeIndex(entries) {
  return new Map(entries.map((e) => [e.continuity_id, e]))
}

// ── AC1: Orphan Lineage Rejection ─────────────────────────────────────────────

test('AC1: orphan parent reference fails closed with orphan_continuity_lineage', () => {
  const session = makeSession()
  const node = makeNode({ parent_continuity_id: 'cid-missing-ghost' })
  const result = verifyContinuityLineage({
    session,
    continuity: node,
    continuityById: new Map(),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'orphan_continuity_lineage')
})

test('AC1: ambiguous parent reference fails closed with ambiguous_continuity_lineage', () => {
  const session = makeSession()
  const parent = makeNode({ continuity_id: 'cid-parent' })
  const node = makeNode({ continuity_id: 'cid-child', parent_continuity_id: 'cid-parent' })
  const result = verifyContinuityLineage({
    session,
    continuity: node,
    continuityById: new Map([['cid-parent', [parent, parent]]]),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'ambiguous_continuity_lineage')
})

test('AC1: closure hardening detects detached lineage and fails closed', () => {
  const orphan = makeClosureEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-ghost' })
  const result = runClosure({
    registry_views: [makeClosureView({ entries: [orphan] })],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.CLOSURE_BROKEN_DETACHED)
  assert.ok(result.detached_ids.includes('cid-orphan'))
})

test('AC1: orphan subtree collapse marks all affected descendants', () => {
  const orphan = makeClosureEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-ghost' })
  const child = makeClosureEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-orphan', continuity_hash: HASH_B })
  const grandchild = makeClosureEntry({ continuity_id: 'cid-gc', parent_continuity_id: 'cid-child', continuity_hash: HASH_C })
  const result = runClosure({
    registry_views: [makeClosureView({ entries: [orphan, child, grandchild] })],
  })
  assert.ok(result.collapsed_subtrees.length > 0)
  const subtree = result.collapsed_subtrees[0]
  assert.ok(subtree.affected_ids.includes('cid-orphan'))
  assert.ok(subtree.affected_ids.includes('cid-child'))
  assert.ok(subtree.affected_ids.includes('cid-gc'))
})

test('AC1: orphan detection is deterministic across entry orderings', () => {
  const orphan = makeClosureEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-ghost' })
  const child = makeClosureEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-orphan', continuity_hash: HASH_B })
  const r1 = runClosure({ registry_views: [makeClosureView({ entries: [orphan, child] })] })
  const r2 = runClosure({ registry_views: [makeClosureView({ entries: [child, orphan] })] })
  assert.equal(r1.collapsed_subtrees[0].subtree_hash, r2.collapsed_subtrees[0].subtree_hash)
})

test('AC1: ancestry reconstruction fails for orphan (non-reconstructable)', () => {
  const orphan = makeClosureEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-ghost' })
  const result = runClosure({ registry_views: [makeClosureView({ entries: [orphan] })] })
  const validation = result.reconstruction_validations.find((v) => v.continuity_id === 'cid-orphan')
  assert.ok(validation)
  assert.equal(validation.reconstructable, false)
  assert.equal(validation.reconstruction_hash, null)
})

// ── AC2: Recursive Revocation Propagation ────────────────────────────────────

test('AC2: revoked root with active child produces PROPAGATION_STALE', () => {
  const root = makeRevEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeRevEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = runPropagation({
    registry_views: [makeRevView({ entries: [root, child] })],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_STALE)
  assert.ok(result.stale_lineage_collapses.length > 0)
  assert.ok(result.stale_lineage_collapses[0].active_descendant_ids.includes('cid-child'))
})

test('AC2: incomplete propagation record produces PROPAGATION_INCOMPLETE', () => {
  const root = makeRevEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeRevEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = runPropagation({
    registry_views: [makeRevView({ entries: [root, child] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-root', propagated_ids: [] })],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_INCOMPLETE)
  assert.ok(result.incomplete_propagations.includes('cid-child'))
})

test('AC2: recursive revocation covers grandchildren', () => {
  const root = makeRevEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeRevEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const grandchild = makeRevEntry({ continuity_id: 'cid-gc', parent_continuity_id: 'cid-child', continuity_hash: HASH_C })
  const entries = [root, child, grandchild]
  const index = makeIndex(entries)
  const collapses = enforceStaleLineageCollapse(entries, index)
  assert.ok(collapses.length > 0)
  const affected = collapses[0].active_descendant_ids
  assert.ok(affected.includes('cid-child'))
  assert.ok(affected.includes('cid-gc'))
})

test('AC2: revocation with all descendants revoked produces PROPAGATION_COMPLETE', () => {
  const root = makeRevEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeRevEntry({
    continuity_id: 'cid-child',
    parent_continuity_id: 'cid-root',
    continuity_hash: HASH_B,
    status: 'REVOKED',
    revoked_at: '2024-01-01T00:00:00.000Z',
  })
  const result = runPropagation({
    registry_views: [makeRevView({ entries: [root, child] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-root', propagated_ids: ['cid-child'] })],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.PROPAGATION_COMPLETE)
  assert.equal(result.incomplete_propagations.length, 0)
  assert.equal(result.stale_lineage_collapses.length, 0)
})

test('AC2: STALE_LINEAGE_RESURRECTION drift observed when revoked root has active descendants', () => {
  const root = makeRevEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeRevEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = runPropagation({ registry_views: [makeRevView({ entries: [root, child] })] })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.STALE_LINEAGE_RESURRECTION,
  )
  assert.ok(obs)
  assert.equal(obs.severity, 'fatal')
})

test('AC2: ANCESTOR_REVOCATION_UNRESOLVED drift observed when active node has revoked ancestor', () => {
  const root = makeRevEntry({ continuity_id: 'cid-root', status: 'REVOKED' })
  const child = makeRevEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = runPropagation({ registry_views: [makeRevView({ entries: [root, child] })] })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.ANCESTOR_REVOCATION_UNRESOLVED,
  )
  assert.ok(obs)
  assert.equal(obs.severity, 'fatal')
})

// ── AC3: Continuity Replay Invalidation ──────────────────────────────────────

test('AC3: replay on revoked continuity is ineligible', () => {
  const entry = makeRevEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = runPropagation({
    registry_views: [makeRevView({ entries: [entry] })],
    replay_records: [makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1' })],
  })
  const eligibility = result.replay_eligibility.find((r) => r.replay_id === 'r1')
  assert.ok(eligibility)
  assert.equal(eligibility.eligible, false)
})

test('AC3: replay on continuity in revocation cascade is ineligible', () => {
  const child = makeRevEntry({ continuity_id: 'cid-child', status: 'ACTIVE' })
  const result = runPropagation({
    registry_views: [makeRevView({ entries: [child] })],
    revocation_records: [makeRevocationRecord({ root_continuity_id: 'cid-parent', propagated_ids: ['cid-child'] })],
    replay_records: [makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-child' })],
  })
  const eligibility = result.replay_eligibility.find((r) => r.replay_id === 'r1')
  assert.ok(eligibility)
  assert.equal(eligibility.eligible, false)
  assert.equal(eligibility.ineligibility_reason, 'revocation_cascade_detected')
})

test('AC3: replay with hash mismatch is ineligible', () => {
  const entry = makeRevEntry({ continuity_id: 'cid-1', continuity_hash: HASH_A, status: 'ACTIVE' })
  const result = runPropagation({
    registry_views: [makeRevView({ entries: [entry] })],
    replay_records: [makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1', continuity_hash: HASH_B })],
  })
  const eligibility = result.replay_eligibility.find((r) => r.replay_id === 'r1')
  assert.ok(eligibility)
  assert.equal(eligibility.eligible, false)
  assert.equal(eligibility.ineligibility_reason, 'continuity_hash_mismatch')
})

test('AC3: REPLAY_REVOCATION_BARRIER_VIOLATED drift observed for ineligible replay', () => {
  const entry = makeRevEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = runPropagation({
    registry_views: [makeRevView({ entries: [entry] })],
    replay_records: [makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1' })],
  })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === REVOCATION_DRIFT_CLASSES.REPLAY_REVOCATION_BARRIER_VIOLATED,
  )
  assert.ok(obs)
  assert.equal(obs.severity, 'fatal')
})

test('AC3: revoked continuity never yields eligible replay (fail-closed invariant)', () => {
  const entry = makeRevEntry({ continuity_id: 'cid-1', status: 'REVOKED' })
  const result = runPropagation({
    registry_views: [makeRevView({ entries: [entry] })],
    replay_records: [makeReplayRecord({ replay_id: 'r1', continuity_id: 'cid-1' })],
  })
  for (const re of result.replay_eligibility) {
    if (re.continuity_id === 'cid-1') {
      assert.equal(re.eligible, false)
    }
  }
})

// ── AC4: Continuity Freshness Validation ─────────────────────────────────────

test('AC4: entry expiring within freshness horizon flagged as stale', () => {
  const entry = makeClosureEntry({ continuity_id: 'cid-1', expires_at: SOON })
  const index = makeIndex([entry])
  const { compliant, stale_ids } = enforceLineageFreshnessBarrier(['cid-1'], index, 60_000)
  assert.equal(compliant, false)
  assert.ok(stale_ids.includes('cid-1'))
})

test('AC4: entry expiring beyond freshness horizon is compliant', () => {
  const entry = makeClosureEntry({ continuity_id: 'cid-1', expires_at: FUTURE })
  const index = makeIndex([entry])
  const { compliant, stale_ids } = enforceLineageFreshnessBarrier(['cid-1'], index, 60_000)
  assert.equal(compliant, true)
  assert.equal(stale_ids.length, 0)
})

test('AC4: freshness violation produces FRESHNESS_CHAIN_VIOLATION drift classification', () => {
  const entry = makeClosureEntry({ continuity_id: 'cid-1', expires_at: SOON })
  const result = runClosure({
    registry_views: [makeClosureView({ entries: [entry] })],
    freshness_horizon_ms: 60_000,
  })
  const classification = result.drift_classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.FRESHNESS_CHAIN_VIOLATION,
  )
  assert.ok(classification)
  assert.equal(classification.affected_continuity_id, 'cid-1')
  assert.equal(classification.severity, 'degraded')
})

test('AC4: freshness is checked across the full ancestry chain', () => {
  const root = makeClosureEntry({ continuity_id: 'cid-root', expires_at: SOON })
  const child = makeClosureEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B, expires_at: FUTURE })
  const result = runClosure({
    registry_views: [makeClosureView({ entries: [root, child] })],
    freshness_horizon_ms: 60_000,
  })
  const staleClassifications = result.drift_classifications.filter(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.FRESHNESS_CHAIN_VIOLATION,
  )
  assert.ok(staleClassifications.length > 0)
})

test('AC4: freshness barrier is deterministic for identical inputs', () => {
  const entry = makeClosureEntry({ continuity_id: 'cid-1', expires_at: SOON })
  const index = makeIndex([entry])
  const r1 = enforceLineageFreshnessBarrier(['cid-1'], index, 60_000)
  const r2 = enforceLineageFreshnessBarrier(['cid-1'], index, 60_000)
  assert.equal(r1.compliant, r2.compliant)
  assert.deepEqual([...r1.stale_ids], [...r2.stale_ids])
})

// ── AC5: Temporal Continuity Expiry Enforcement ───────────────────────────────

test('AC5: expired session fails closed with expired_session_lineage', () => {
  const session = makeSession({ expires_at: PAST })
  const node = makeNode()
  const result = verifyContinuityLineage({
    session,
    continuity: node,
    continuityById: new Map(),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'expired_session_lineage')
})

test('AC5: expired continuity fails closed with expired_continuity_lineage', () => {
  const session = makeSession()
  const node = makeNode({ expires_at: PAST })
  const result = verifyContinuityLineage({
    session,
    continuity: node,
    continuityById: new Map(),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'expired_continuity_lineage')
})

test('AC5: expired ancestor in chain fails traversal with expired_ancestor', () => {
  const expiredRoot = makeClosureEntry({ continuity_id: 'cid-root', expires_at: PAST })
  const child = makeClosureEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const index = makeIndex([expiredRoot, child])
  const result = traverseContinuityAncestry('cid-child', index, 32)
  assert.equal(result.ok, false)
  assert.equal(result.failure_reason, ANCESTRY_FAILURE_REASONS.EXPIRED_ANCESTOR)
})

test('AC5: expired ancestor produces freshness_chain_violation drift with degraded severity', () => {
  const expiredRoot = makeClosureEntry({ continuity_id: 'cid-root', expires_at: PAST })
  const child = makeClosureEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = runClosure({
    registry_views: [makeClosureView({ entries: [expiredRoot, child] })],
  })
  const classification = result.drift_classifications.find(
    (c) => c.drift_class === CLOSURE_DRIFT_CLASSES.FRESHNESS_CHAIN_VIOLATION,
  )
  assert.ok(classification)
  assert.equal(classification.severity, 'degraded')
})

test('AC5: expired entry with active descendants produces stale lineage collapse', () => {
  const expiredRoot = makeRevEntry({ continuity_id: 'cid-root', expires_at: PAST })
  const child = makeRevEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const entries = [expiredRoot, child]
  const index = makeIndex(entries)
  const collapses = enforceStaleLineageCollapse(entries, index)
  assert.ok(collapses.length > 0)
  assert.equal(collapses[0].revoked_root_id, 'cid-root')
  assert.ok(collapses[0].active_descendant_ids.includes('cid-child'))
})

test('AC5: expiry enforcement is fail-closed (revoked or expired → same invalidation path)', () => {
  const revokedResult = verifyContinuityLineage({
    session: makeSession(),
    continuity: makeNode({ status: 'REVOKED' }),
    continuityById: new Map(),
    computeLineageHash: lineageHash,
  })
  const expiredResult = verifyContinuityLineage({
    session: makeSession(),
    continuity: makeNode({ expires_at: PAST }),
    continuityById: new Map(),
    computeLineageHash: lineageHash,
  })
  assert.equal(revokedResult.ok, false)
  assert.equal(expiredResult.ok, false)
  assert.ok(['revoked_continuity_lineage', 'expired_continuity_lineage'].includes(revokedResult.reason))
  assert.ok(['revoked_continuity_lineage', 'expired_continuity_lineage'].includes(expiredResult.reason))
})

// ── AC6 & AC7: FATE coverage and fail-closed behavior ────────────────────────

test('fail-closed: null session rejects at admission', () => {
  const result = verifyContinuityLineage({
    session: null,
    continuity: makeNode(),
    continuityById: new Map(),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'missing_session_lineage')
})

test('fail-closed: null continuity rejects at admission', () => {
  const result = verifyContinuityLineage({
    session: makeSession(),
    continuity: null,
    continuityById: new Map(),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'missing_continuity_lineage')
})

test('fail-closed: revoked session rejects at admission', () => {
  const result = verifyContinuityLineage({
    session: makeSession({ revoked_at: '2024-01-01T00:00:00.000Z' }),
    continuity: makeNode(),
    continuityById: new Map(),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'revoked_session_lineage')
})

test('fail-closed: cycle in lineage rejects at admission', () => {
  const session = makeSession()
  const cyclic = makeNode({ continuity_id: 'cid-cyclic', parent_continuity_id: 'cid-cyclic' })
  const result = verifyContinuityLineage({
    session,
    continuity: cyclic,
    continuityById: new Map([['cid-cyclic', cyclic]]),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'continuity_cycle_detected')
})

test('fail-closed: closure hardening returns NULL for null input', () => {
  const result = verifyDistributedContinuityLineageClosure(null)
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
  assert.equal(result.evidence_only, true)
})

test('fail-closed: propagation returns NULL for null input', () => {
  const result = propagateRevocationLineage(null)
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
  assert.equal(result.evidence_only, true)
})

test('fail-closed: forbidden field break_glass in closure input returns NULL', () => {
  const result = verifyDistributedContinuityLineageClosure({
    closure_id: 'test',
    evidence_only: true,
    break_glass: true,
    registry_views: [makeClosureView()],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
})

test('fail-closed: forbidden field creates_authority in propagation input returns NULL', () => {
  const result = propagateRevocationLineage({
    propagation_id: 'test',
    evidence_only: true,
    creates_authority: true,
    registry_views: [makeRevView()],
  })
  assert.equal(result.propagation_result, REVOCATION_PROPAGATION_RESULTS.NULL)
})

test('fail-closed: evidence_only=false in closure input returns NULL', () => {
  const result = verifyDistributedContinuityLineageClosure({
    closure_id: 'test',
    evidence_only: false,
    registry_views: [makeClosureView()],
  })
  assert.equal(result.closure_result, CONTINUITY_CLOSURE_RESULTS.NULL)
})

test('no execution authority fields emitted by closure hardening', () => {
  const result = runClosure()
  assert.ok(!('creates_authority' in result))
  assert.ok(!('creates_execution' in result))
  assert.ok(!('creates_proof' in result))
  assert.ok(!('mutates_registry' in result))
  assert.ok(!('authority_grant' in result))
})

test('no execution authority fields emitted by revocation propagation', () => {
  const result = runPropagation()
  assert.ok(!('creates_authority' in result))
  assert.ok(!('creates_execution' in result))
  assert.ok(!('creates_proof' in result))
  assert.ok(!('mutates_registry' in result))
})

test('closure hardening output is always evidence_only', () => {
  assert.equal(runClosure().evidence_only, true)
})

test('revocation propagation output is always evidence_only', () => {
  assert.equal(runPropagation().evidence_only, true)
})

test('valid ancestry chain traverses to root and is reconstructable', () => {
  const session = makeSession()
  const root = makeNode({ continuity_id: 'cid-root' })
  const child = makeNode({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', continuity_hash: HASH_B })
  const result = verifyContinuityLineage({
    session,
    continuity: child,
    continuityById: new Map([['cid-root', root]]),
    computeLineageHash: lineageHash,
  })
  assert.equal(result.ok, true)
  assert.ok(result.lineage.some((n) => n.continuity_id === 'cid-child'))
  assert.ok(result.lineage.some((n) => n.continuity_id === 'cid-root'))
  assert.ok(typeof result.lineage_hash === 'string' && result.lineage_hash.length === 64)
})

test('closure results are deterministic for identical inputs', () => {
  const r1 = runClosure()
  const r2 = runClosure()
  assert.equal(r1.closure_result, r2.closure_result)
  assert.equal(r1.lineage_topology_hash, r2.lineage_topology_hash)
})

test('propagation results are deterministic for identical inputs', () => {
  const r1 = runPropagation()
  const r2 = runPropagation()
  assert.equal(r1.propagation_result, r2.propagation_result)
  assert.equal(r1.revocation_topology_hash, r2.revocation_topology_hash)
})
