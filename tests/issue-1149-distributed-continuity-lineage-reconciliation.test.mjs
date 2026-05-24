/**
 * tests/issue-1149-distributed-continuity-lineage-reconciliation.test.mjs
 * Issue #1149 — Distributed Continuity Lineage Reconciliation Hardening
 *
 * FATE tests proving deterministic distributed continuity lineage reconciliation.
 *
 * Primary invariant:
 *   No valid continuity lineage → no valid authority → no valid execution
 *
 * Evidence only — no execution authority changes, no mutation surface widening,
 * no probabilistic replay decisions, no replay bypass paths,
 * no legitimacy semantic weakening.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  CONTINUITY_LINEAGE_RECONCILIATION_RESULTS,
  CONTINUITY_LINEAGE_DRIFT_CLASSES,
  CONTINUITY_CONVERGENCE_RESULTS,
  reconcileDistributedContinuityLineage,
  computeContinuityLineageTopologyHash,
  detectOrphanedContinuityLineage,
  verifyReplayLineageEligibility,
  verifyRevocationPropagationCompleteness,
  evaluateContinuityLineageConvergence,
  buildContinuityLineageAuditSurface,
} from '../src/distributed-continuity-lineage-reconciliation.ts'

// ── Test fixtures ──────────────────────────────────────────────────────────────

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

const REG_HASH_A = sha256('registry-view-a')
const REG_HASH_B = sha256('registry-view-b')
const CONT_HASH_1 = sha256('continuity-1')
const CONT_HASH_2 = sha256('continuity-2')
const CONT_HASH_3 = sha256('continuity-3')

function makeEntry(overrides = {}) {
  return {
    continuity_id: 'cid-1',
    session_id: 'sess-1',
    identity_id: 'user-1',
    parent_continuity_id: null,
    continuity_hash: CONT_HASH_1,
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
    registry_hash: REG_HASH_A,
    ...rest,
  }
}

function makeInput(overrides = {}) {
  const views = overrides.registry_views ?? [makeView()]
  return {
    reconciliation_id: 'recon-test-001',
    evidence_only: true,
    registry_views: views,
    replay_records: null,
    revocation_evidence: null,
    freshness_horizon_ms: null,
    ...overrides,
  }
}

function run(overrides = {}) {
  return reconcileDistributedContinuityLineage(makeInput(overrides))
}

// ── 1. Reconciliation output is evidence-only ─────────────────────────────────

test('reconciliation output is always evidence-only', () => {
  const result = run()
  assert.equal(result.evidence_only, true)
  assert.equal(result.artifact_type, 'DISTRIBUTED_CONTINUITY_LINEAGE_RECONCILIATION')
})

// ── 2. Converged views produce LINEAGE_RECONCILED ─────────────────────────────

test('converged registry views produce LINEAGE_RECONCILED', () => {
  const result = run({
    registry_views: [
      makeView({ node_id: 'n1', registry_hash: REG_HASH_A }),
      makeView({ node_id: 'n2', registry_hash: REG_HASH_A }),
      makeView({ node_id: 'n3', registry_hash: REG_HASH_A }),
    ],
  })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_RECONCILED)
  assert.equal(result.participant_count, 3)
  assert.equal(result.converged_count, 3)
  assert.equal(result.diverged_count, 0)
})

// ── 3. Missing reconciliation_id fails closed ─────────────────────────────────

test('missing reconciliation_id fails closed to NULL', () => {
  for (const id of [undefined, '', null, 42]) {
    const result = reconcileDistributedContinuityLineage({
      evidence_only: true,
      registry_views: [makeView()],
      reconciliation_id: id,
    })
    assert.equal(
      result.reconciliation_result,
      CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL,
      `should fail for reconciliation_id=${JSON.stringify(id)}`,
    )
  }
})

// ── 4. evidence_only false fails closed ───────────────────────────────────────

test('evidence_only false in input fails closed to NULL', () => {
  const result = reconcileDistributedContinuityLineage({
    reconciliation_id: 'recon-001',
    evidence_only: false,
    registry_views: [makeView()],
  })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL)
})

test('missing evidence_only fails closed to NULL', () => {
  const result = reconcileDistributedContinuityLineage({
    reconciliation_id: 'recon-001',
    registry_views: [makeView()],
  })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL)
})

// ── 5. Boundary violations in input fail closed ───────────────────────────────

test('creates_authority in input fails closed to NULL', () => {
  const result = run({ creates_authority: true })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL)
})

test('mutates_registry in input fails closed to NULL', () => {
  const result = run({ mutates_registry: true })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL)
})

test('creates_authority in registry view fails closed to NULL', () => {
  const result = reconcileDistributedContinuityLineage(
    makeInput({
      registry_views: [{ ...makeView(), creates_authority: true }],
    }),
  )
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL)
})

// ── 6. Empty registry views fails closed ──────────────────────────────────────

test('empty registry_views array fails closed to NULL', () => {
  const result = run({ registry_views: [] })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL)
})

test('null input fails closed to NULL', () => {
  const result = reconcileDistributedContinuityLineage(null)
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.NULL)
  assert.equal(result.evidence_only, true)
  assert.equal(result.artifact_type, 'DISTRIBUTED_CONTINUITY_LINEAGE_RECONCILIATION')
})

// ── 7. Orphaned lineage produces LINEAGE_ORPHANED ────────────────────────────

test('orphaned continuity parent reference produces LINEAGE_ORPHANED', () => {
  const result = run({
    registry_views: [
      makeView({
        entries: [makeEntry({ continuity_id: 'cid-2', parent_continuity_id: 'cid-missing' })],
        registry_hash: REG_HASH_A,
      }),
    ],
  })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_ORPHANED)
  assert.ok(result.orphaned_ids.includes('cid-2'))
})

// ── 8. Orphaned IDs reported with drift observations ─────────────────────────

test('orphan drift observation is emitted with correct drift class', () => {
  const result = run({
    registry_views: [
      makeView({
        entries: [makeEntry({ continuity_id: 'cid-orphan', parent_continuity_id: 'cid-ghost' })],
        registry_hash: REG_HASH_A,
      }),
    ],
  })
  const orphanObs = result.drift_observations.find(
    (d) => d.drift_class === CONTINUITY_LINEAGE_DRIFT_CLASSES.ORPHAN_LINEAGE_DETECTED,
  )
  assert.ok(orphanObs, 'orphan_lineage_detected drift observation must be emitted')
  assert.equal(orphanObs.affected_continuity_id, 'cid-orphan')
})

// ── 9. Diverged registry views produce LINEAGE_DIVERGED ──────────────────────

test('diverged registry views produce LINEAGE_DIVERGED', () => {
  const result = run({
    registry_views: [
      makeView({ node_id: 'n1', registry_hash: REG_HASH_A }),
      makeView({ node_id: 'n2', registry_hash: REG_HASH_B }),
    ],
  })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_DIVERGED)
  assert.ok(result.diverged_count > 0)
})

test('distributed_lineage_drift observation emitted on divergence', () => {
  const result = run({
    registry_views: [
      makeView({ node_id: 'n1', registry_hash: REG_HASH_A }),
      makeView({ node_id: 'n2', registry_hash: REG_HASH_B }),
    ],
  })
  const obs = result.drift_observations.find(
    (d) => d.drift_class === CONTINUITY_LINEAGE_DRIFT_CLASSES.DISTRIBUTED_LINEAGE_DRIFT,
  )
  assert.ok(obs, 'distributed_lineage_drift observation must be emitted')
  assert.equal(obs.affected_continuity_id, null)
})

// ── 10. Incomplete revocation cascade produces LINEAGE_REVOKED ───────────────

test('incomplete revocation cascade produces LINEAGE_REVOKED', () => {
  // cid-child is a child of cid-root; cid-root is being revoked but cid-child remains ACTIVE
  const result = run({
    registry_views: [
      makeView({
        entries: [
          makeEntry({ continuity_id: 'cid-root', parent_continuity_id: null, status: 'REVOKED' }),
          makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', status: 'ACTIVE' }),
        ],
        registry_hash: REG_HASH_A,
      }),
    ],
    revocation_evidence: [
      {
        revocation_id: 'rev-1',
        root_continuity_id: 'cid-root',
        revoked_at: '2026-01-01T00:00:00Z',
        propagated_to_ids: [],
      },
    ],
  })
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_REVOKED)
  assert.equal(result.revocation_propagation_complete, false)
})

// ── 11. Complete revocation propagation is accepted ──────────────────────────

test('complete revocation propagation is accepted', () => {
  const result = run({
    registry_views: [
      makeView({
        entries: [
          makeEntry({ continuity_id: 'cid-root', status: 'REVOKED' }),
          makeEntry({ continuity_id: 'cid-child', parent_continuity_id: 'cid-root', status: 'REVOKED' }),
        ],
        registry_hash: REG_HASH_A,
      }),
    ],
    revocation_evidence: [
      {
        revocation_id: 'rev-1',
        root_continuity_id: 'cid-root',
        revoked_at: '2026-01-01T00:00:00Z',
        propagated_to_ids: ['cid-child'],
      },
    ],
  })
  assert.equal(result.revocation_propagation_complete, true)
  assert.notEqual(
    result.reconciliation_result,
    CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_REVOKED,
  )
})

// ── 12. Replay with detached continuity is ineligible ────────────────────────

test('replay referencing absent continuity_id is ineligible', () => {
  const result = run({
    replay_records: [
      {
        replay_id: 'replay-1',
        continuity_id: 'cid-ghost',
        continuity_hash: CONT_HASH_1,
        lineage_hash: sha256('lineage-1'),
      },
    ],
  })
  const entry = result.replay_eligibility.find((r) => r.replay_id === 'replay-1')
  assert.ok(entry, 'replay eligibility entry must be present')
  assert.equal(entry.eligible, false)
  assert.equal(entry.ineligibility_reason, 'detached_replay_no_continuity_entry')
})

// ── 13. Replay with revoked continuity is ineligible ─────────────────────────

test('replay with revoked continuity is ineligible', () => {
  const result = run({
    registry_views: [
      makeView({
        entries: [makeEntry({ continuity_id: 'cid-1', status: 'REVOKED', revoked_at: '2026-01-01T00:00:00Z' })],
        registry_hash: REG_HASH_A,
      }),
    ],
    replay_records: [
      { replay_id: 'rp-1', continuity_id: 'cid-1', continuity_hash: CONT_HASH_1, lineage_hash: sha256('lh-1') },
    ],
  })
  const entry = result.replay_eligibility.find((r) => r.replay_id === 'rp-1')
  assert.equal(entry.eligible, false)
  assert.equal(entry.ineligibility_reason, 'replay_continuity_revoked_or_expired')
})

// ── 14. Replay with active continuity is eligible ────────────────────────────

test('replay with active continuity is eligible', () => {
  const result = run({
    replay_records: [
      { replay_id: 'rp-ok', continuity_id: 'cid-1', continuity_hash: CONT_HASH_1, lineage_hash: sha256('lh-ok') },
    ],
  })
  const entry = result.replay_eligibility.find((r) => r.replay_id === 'rp-ok')
  assert.ok(entry, 'eligibility entry must be present')
  assert.equal(entry.eligible, true)
  assert.equal(entry.ineligibility_reason, null)
})

// ── 15. Replay caught in revocation cascade is ineligible ────────────────────

test('replay caught in revocation cascade is ineligible', () => {
  const result = run({
    registry_views: [
      makeView({
        entries: [makeEntry({ continuity_id: 'cid-1', status: 'ACTIVE' })],
        registry_hash: REG_HASH_A,
      }),
    ],
    revocation_evidence: [
      {
        revocation_id: 'rev-2',
        root_continuity_id: 'cid-root',
        revoked_at: '2026-01-01T00:00:00Z',
        propagated_to_ids: ['cid-1'],
      },
    ],
    replay_records: [
      { replay_id: 'rp-cascade', continuity_id: 'cid-1', continuity_hash: CONT_HASH_1, lineage_hash: sha256('lh-c') },
    ],
  })
  const entry = result.replay_eligibility.find((r) => r.replay_id === 'rp-cascade')
  assert.equal(entry.eligible, false)
  assert.equal(entry.ineligibility_reason, 'replay_revocation_cascade_detected')
})

// ── 16. Lineage topology hash is deterministic and order-independent ──────────

test('computeContinuityLineageTopologyHash is order-independent', () => {
  const e1 = makeEntry({ continuity_id: 'aaa', continuity_hash: CONT_HASH_1 })
  const e2 = makeEntry({ continuity_id: 'bbb', continuity_hash: CONT_HASH_2 })

  const hash1 = computeContinuityLineageTopologyHash([e1, e2])
  const hash2 = computeContinuityLineageTopologyHash([e2, e1])
  assert.equal(hash1, hash2, 'hash must not depend on entry order')
  assert.match(hash1, /^[0-9a-f]{64}$/)
})

// ── 17. Lineage topology hash changes when entries change ────────────────────

test('computeContinuityLineageTopologyHash changes when entries change', () => {
  const e1 = makeEntry({ continuity_id: 'cid-x', continuity_hash: CONT_HASH_1 })
  const e2 = makeEntry({ continuity_id: 'cid-x', continuity_hash: CONT_HASH_2 })

  const hash1 = computeContinuityLineageTopologyHash([e1])
  const hash2 = computeContinuityLineageTopologyHash([e2])
  assert.notEqual(hash1, hash2)
})

// ── 18. Reconciliation is deterministic for same input ────────────────────────

test('reconciliation result is deterministic for the same input', () => {
  const input = makeInput()
  const r1 = reconcileDistributedContinuityLineage(input)
  const r2 = reconcileDistributedContinuityLineage(input)
  assert.equal(r1.reconciliation_result, r2.reconciliation_result)
  assert.equal(r1.lineage_topology_hash, r2.lineage_topology_hash)
  assert.equal(r1.audit_surface.audit_id, r2.audit_surface.audit_id)
})

// ── 19. Output is frozen ──────────────────────────────────────────────────────

test('reconciliation output is deeply frozen', () => {
  const result = run()
  assert.ok(Object.isFrozen(result), 'top-level result must be frozen')
  assert.ok(Object.isFrozen(result.orphaned_ids), 'orphaned_ids must be frozen')
  assert.ok(Object.isFrozen(result.drift_observations), 'drift_observations must be frozen')
  assert.ok(Object.isFrozen(result.replay_eligibility), 'replay_eligibility must be frozen')
  assert.ok(Object.isFrozen(result.audit_surface), 'audit_surface must be frozen')
  assert.throws(
    () => {
      'use strict'
      result.reconciliation_id = 'mutated'
    },
    TypeError,
  )
})

// ── 20. Audit surface reports correct counts ──────────────────────────────────

test('audit surface participant_count matches views count', () => {
  const result = run({
    registry_views: [
      makeView({ node_id: 'n1', registry_hash: REG_HASH_A }),
      makeView({ node_id: 'n2', registry_hash: REG_HASH_A }),
    ],
  })
  assert.equal(result.audit_surface.participant_count, 2)
  assert.equal(result.audit_surface.converged_count, 2)
})

test('audit surface orphaned_count matches orphaned_ids length', () => {
  const result = run({
    registry_views: [
      makeView({
        entries: [makeEntry({ continuity_id: 'cid-o', parent_continuity_id: 'cid-missing' })],
        registry_hash: REG_HASH_A,
      }),
    ],
  })
  assert.equal(result.audit_surface.orphaned_count, result.orphaned_ids.length)
  assert.ok(result.audit_surface.orphaned_count > 0)
})

test('audit surface drift_count matches drift_observations length', () => {
  const result = run({
    registry_views: [
      makeView({ node_id: 'n1', registry_hash: REG_HASH_A }),
      makeView({ node_id: 'n2', registry_hash: REG_HASH_B }),
    ],
  })
  assert.equal(result.audit_surface.drift_count, result.drift_observations.length)
})

// ── 21. detectOrphanedContinuityLineage unit test ────────────────────────────

test('detectOrphanedContinuityLineage identifies entries with missing parents', () => {
  const entries = [
    makeEntry({ continuity_id: 'root', parent_continuity_id: null }),
    makeEntry({ continuity_id: 'child', parent_continuity_id: 'root' }),
    makeEntry({ continuity_id: 'detached', parent_continuity_id: 'ghost' }),
  ]
  const orphans = detectOrphanedContinuityLineage(entries)
  assert.ok(orphans.includes('detached'))
  assert.ok(!orphans.includes('child'))
  assert.ok(!orphans.includes('root'))
})

// ── 22. verifyRevocationPropagationCompleteness unit test ────────────────────

test('verifyRevocationPropagationCompleteness detects unpropagated descendants', () => {
  const index = new Map([
    ['root', makeEntry({ continuity_id: 'root', parent_continuity_id: null, status: 'REVOKED' })],
    ['child', makeEntry({ continuity_id: 'child', parent_continuity_id: 'root', status: 'ACTIVE' })],
  ])
  const revocations = [
    {
      revocation_id: 'r1',
      root_continuity_id: 'root',
      revoked_at: '2026-01-01T00:00:00Z',
      propagated_to_ids: [],
    },
  ]
  const { complete, missing_propagations } = verifyRevocationPropagationCompleteness(
    revocations,
    index,
  )
  assert.equal(complete, false)
  assert.ok(missing_propagations.includes('child'))
})

// ── 23. evaluateContinuityLineageConvergence unit test ───────────────────────

test('evaluateContinuityLineageConvergence reaches convergence on matching hashes', () => {
  const views = [
    makeView({ node_id: 'n1', registry_hash: REG_HASH_A }),
    makeView({ node_id: 'n2', registry_hash: REG_HASH_A }),
  ]
  const result = evaluateContinuityLineageConvergence(views)
  assert.equal(result.convergence_result, CONTINUITY_CONVERGENCE_RESULTS.CONVERGENCE_REACHED)
  assert.equal(result.converged_count, 2)
  assert.equal(result.diverged_count, 0)
})

test('evaluateContinuityLineageConvergence detects divergence', () => {
  const views = [
    makeView({ node_id: 'n1', registry_hash: REG_HASH_A }),
    makeView({ node_id: 'n2', registry_hash: REG_HASH_B }),
  ]
  const result = evaluateContinuityLineageConvergence(views)
  assert.equal(result.convergence_result, CONTINUITY_CONVERGENCE_RESULTS.CONVERGENCE_DIVERGED)
  assert.ok(result.diverged_count > 0)
})

test('evaluateContinuityLineageConvergence collapses on empty views', () => {
  const result = evaluateContinuityLineageConvergence([])
  assert.equal(result.convergence_result, CONTINUITY_CONVERGENCE_RESULTS.CONVERGENCE_COLLAPSED)
})

// ── 24. buildContinuityLineageAuditSurface unit test ─────────────────────────

test('buildContinuityLineageAuditSurface produces deterministic audit_id', () => {
  const params = {
    reconciliation_id: 'recon-x',
    lineage_topology_hash: sha256('topology'),
    participant_count: 2,
    converged_count: 2,
    orphaned_ids: [],
    revocation_complete: true,
    drift_count: 0,
  }
  const a1 = buildContinuityLineageAuditSurface(params)
  const a2 = buildContinuityLineageAuditSurface(params)
  assert.equal(a1.audit_id, a2.audit_id)
  assert.match(a1.audit_id, /^[0-9a-f]{64}$/)
})

// ── 25. Stale replay resurrection drift classification ───────────────────────

test('detached replay drift observation uses detached_replay_detected class', () => {
  const result = run({
    replay_records: [
      {
        replay_id: 'rp-ghost',
        continuity_id: 'cid-ghost',
        continuity_hash: CONT_HASH_1,
        lineage_hash: sha256('lh-ghost'),
      },
    ],
  })
  const obs = result.drift_observations.find(
    (d) =>
      d.drift_class === CONTINUITY_LINEAGE_DRIFT_CLASSES.DETACHED_REPLAY_DETECTED &&
      d.affected_continuity_id === 'cid-ghost',
  )
  assert.ok(obs, 'detached_replay_detected observation must be emitted for ghost replay')
})

// ── 26. LINEAGE_RECONCILED lineage topology hash is a valid sha256 hex ────────

test('LINEAGE_RECONCILED result always includes a valid sha256 lineage_topology_hash', () => {
  const result = run()
  assert.equal(result.reconciliation_result, CONTINUITY_LINEAGE_RECONCILIATION_RESULTS.LINEAGE_RECONCILED)
  assert.match(result.lineage_topology_hash, /^[0-9a-f]{64}$/)
})
