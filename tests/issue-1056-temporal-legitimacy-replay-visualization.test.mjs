/**
 * tests/issue-1056-temporal-legitimacy-replay-visualization.test.mjs
 * Issue #1056 — Temporal Legitimacy Replay Visualization
 *
 * FATE tests proving evidence-only temporal replay visualization semantics.
 * Temporal replay may be projected.
 * No replay visualization artifact may change legitimacy state.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  TEMPORAL_REPLAY_VISUALIZATION_RESULTS,
  buildTemporalLegitimacyReplayVisualization,
  computeTemporalReplayVisualizationHash,
} from '../src/temporal-legitimacy-replay-visualization.ts'

// ── Test fixtures ──────────────────────────────────────────────────────────────

const DHASH_A = createHash('sha256').update('distributed-topology-a').digest('hex')
const DHASH_B = createHash('sha256').update('distributed-topology-b').digest('hex')
const DHASH_C = createHash('sha256').update('distributed-topology-c').digest('hex')

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
}

function computeProjectionHash(fields) {
  const { projection_hash: _ignored, ...rest } = fields
  return createHash('sha256').update(canonicalJson(rest), 'utf8').digest('hex')
}

function makeProjection(overrides = {}) {
  const { projection_hash: _ignored, ...safeOverrides } = overrides
  const base = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION',
    evidence_only: true,
    distributed_topology_hash: DHASH_A,
    projection_result: 'TOPOLOGY_CONVERGED',
    participant_count: 3,
    divergent_count: 0,
    boundary_trigger_count: 0,
    collapse_reason: null,
    ...safeOverrides,
  }
  return { ...base, projection_hash: computeProjectionHash(base) }
}

function makeInput(projections, overrides = {}) {
  return {
    evidence_only: true,
    replay_id: 'replay-test-001',
    replay_ordering: 'INPUT_ORDER',
    projections,
    ...overrides,
  }
}

function run(projections, overrides = {}) {
  return buildTemporalLegitimacyReplayVisualization(makeInput(projections, overrides))
}

// ── 1. Replay visualization is evidence-only ───────────────────────────────────

test('replay visualization is evidence-only', () => {
  const result = run([makeProjection()])
  assert.equal(result.evidence_only, true)
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)
})

// ── 2. Invalid projection hash fails closed ────────────────────────────────────

test('invalid projection hash fails closed', () => {
  const proj = makeProjection()
  const tampered = { ...proj, projection_hash: 'a'.repeat(64) }
  const result = run([tampered])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})

// ── 3. Malformed projection fails closed ──────────────────────────────────────

test('malformed projection fails closed', () => {
  const malformed = [null, undefined, 42, '', [], {}, { evidence_only: true }]
  for (const proj of malformed) {
    const result = buildTemporalLegitimacyReplayVisualization(makeInput([proj]))
    assert.equal(
      result.replay_result,
      TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL,
      `should fail closed for projection: ${JSON.stringify(proj)}`,
    )
  }
})

// ── 4. Non-evidence projection fails closed ───────────────────────────────────

test('non-evidence projection fails closed', () => {
  const base = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION',
    evidence_only: false,
    distributed_topology_hash: DHASH_A,
    projection_result: 'TOPOLOGY_CONVERGED',
    participant_count: 3,
    divergent_count: 0,
    boundary_trigger_count: 0,
    collapse_reason: null,
  }
  const proj = { ...base, projection_hash: computeProjectionHash(base) }
  const result = run([proj])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})

// ── 5. Temporal replay cannot create authority ─────────────────────────────────

test('temporal replay cannot create authority', () => {
  const result = run([makeProjection()])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)
  assert.ok(!('creates_authority' in result))
  assert.ok(!('authority' in result))
})

// ── 6. Temporal replay cannot create validation ────────────────────────────────

test('temporal replay cannot create validation', () => {
  const result = run([makeProjection()])
  assert.ok(!('creates_validation' in result))
  assert.ok(!('validation_result' in result))
})

// ── 7. Temporal replay cannot create execution ────────────────────────────────

test('temporal replay cannot create execution', () => {
  const result = run([makeProjection()])
  assert.ok(!('creates_execution' in result))
  assert.ok(!('execution_result' in result))
})

// ── 8. Temporal replay cannot create proof ────────────────────────────────────

test('temporal replay cannot create proof', () => {
  const result = run([makeProjection()])
  assert.ok(!('creates_proof' in result))
  assert.ok(!('proof' in result))
})

// ── 9. Temporal replay cannot repair reconciliation ───────────────────────────

test('temporal replay cannot repair reconciliation', () => {
  const result = run([makeProjection()])
  assert.ok(!('reconciliation_repair' in result))
  assert.ok(!('repairs_reconciliation' in result))
  assert.ok(!('automatic_repair' in result))
  assert.ok(!('mutates_runtime' in result))
  assert.ok(!('registry_write' in result))
  assert.ok(!('mutates_registry' in result))
})

// ── 10. Same ordered input produces same temporal_replay_hash ─────────────────

test('same ordered input produces same temporal_replay_hash', () => {
  const projections = [
    makeProjection({ distributed_topology_hash: DHASH_A }),
    makeProjection({ distributed_topology_hash: DHASH_B }),
  ]
  const r1 = run(projections)
  const r2 = run(projections)
  assert.equal(r1.temporal_replay_hash, r2.temporal_replay_hash)
  assert.equal(r1.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)
})

// ── 11. Different input order changes hash or fails closed ─────────────────────

test('different input order changes hash or fails closed for INPUT_ORDER', () => {
  const p1 = makeProjection({ distributed_topology_hash: DHASH_A, participant_count: 1 })
  const p2 = makeProjection({ distributed_topology_hash: DHASH_B, participant_count: 2 })

  const r1 = run([p1, p2])
  const r2 = run([p2, p1])

  assert.equal(r1.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)
  assert.equal(r2.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)
  assert.notEqual(r1.temporal_replay_hash, r2.temporal_replay_hash)
})

// ── 12. frame_hash excludes frame_hash itself ──────────────────────────────────

test('frame_hash excludes frame_hash itself', () => {
  const result = run([makeProjection()])
  assert.equal(result.frames.length, 1)
  const frame = result.frames[0]

  // Manually compute expected frame hash (without frame_hash field)
  const { frame_hash: _excluded, ...fieldsWithoutHash } = frame
  const expected = createHash('sha256')
    .update(canonicalJson(fieldsWithoutHash), 'utf8')
    .digest('hex')

  assert.equal(frame.frame_hash, expected)

  // Adding frame_hash as a field should not change the computed hash
  const withSelf = { ...fieldsWithoutHash, frame_hash: 'some-value' }
  const { frame_hash: _x, ...again } = withSelf
  const recomputed = createHash('sha256').update(canonicalJson(again), 'utf8').digest('hex')
  assert.equal(recomputed, expected)
})

// ── 13. temporal_replay_hash excludes temporal_replay_hash itself ──────────────

test('temporal_replay_hash excludes temporal_replay_hash itself', () => {
  const result = run([makeProjection()])
  const { temporal_replay_hash: _excluded, ...rest } = result

  const expected = createHash('sha256').update(canonicalJson(rest), 'utf8').digest('hex')
  assert.equal(result.temporal_replay_hash, expected)

  // computeTemporalReplayVisualizationHash is consistent with this
  const h1 = computeTemporalReplayVisualizationHash({ ...rest })
  const h2 = computeTemporalReplayVisualizationHash({ ...rest, temporal_replay_hash: 'ignored' })
  assert.equal(h1, h2)
})

// ── 14. Frame ordering is deterministic ───────────────────────────────────────

test('frame ordering is deterministic', () => {
  const projections = [
    makeProjection({ distributed_topology_hash: DHASH_A }),
    makeProjection({ distributed_topology_hash: DHASH_B }),
    makeProjection({ distributed_topology_hash: DHASH_C }),
  ]
  const r1 = run(projections)
  const r2 = run(projections)

  assert.equal(r1.frames.length, 3)
  assert.equal(r2.frames.length, 3)
  for (let i = 0; i < 3; i++) {
    assert.equal(r1.frames[i].frame_index, i)
    assert.equal(r1.frames[i].frame_hash, r2.frames[i].frame_hash)
  }
})

// ── 15. Transition ordering is deterministic ──────────────────────────────────

test('transition ordering is deterministic', () => {
  const projections = [
    makeProjection({ distributed_topology_hash: DHASH_A }),
    makeProjection({ distributed_topology_hash: DHASH_B }),
    makeProjection({ distributed_topology_hash: DHASH_C }),
  ]
  const r1 = run(projections)
  const r2 = run(projections)

  assert.equal(r1.transitions.length, 2)
  assert.equal(r2.transitions.length, 2)
  for (let i = 0; i < 2; i++) {
    assert.equal(r1.transitions[i].transition_id, r2.transitions[i].transition_id)
    assert.equal(r1.transitions[i].from_frame, i)
    assert.equal(r1.transitions[i].to_frame, i + 1)
  }
})

// ── 16. Boundary increase maps to BOUNDARY_TRIGGERED ──────────────────────────

test('boundary increase maps to BOUNDARY_TRIGGERED', () => {
  const p1 = makeProjection({ boundary_trigger_count: 0 })
  const p2 = makeProjection({ boundary_trigger_count: 1 })
  const result = run([p1, p2])
  assert.equal(result.transitions.length, 1)
  assert.equal(result.transitions[0].transition_type, 'BOUNDARY_TRIGGERED')
})

// ── 17. Collapse reason change maps to COLLAPSE_CHANGED ───────────────────────

test('collapse reason change maps to COLLAPSE_CHANGED', () => {
  const p1 = makeProjection({ collapse_reason: null, boundary_trigger_count: 0 })
  const p2 = makeProjection({ collapse_reason: 'QUORUM_LOST', boundary_trigger_count: 0 })
  const result = run([p1, p2])
  assert.equal(result.transitions.length, 1)
  assert.equal(result.transitions[0].transition_type, 'COLLAPSE_CHANGED')
})

// ── 18. Projection result change maps to QUORUM_CHANGED ───────────────────────

test('projection result change maps to QUORUM_CHANGED', () => {
  const p1 = makeProjection({
    projection_result: 'TOPOLOGY_CONVERGED',
    collapse_reason: null,
    boundary_trigger_count: 0,
  })
  const p2 = makeProjection({
    projection_result: 'TOPOLOGY_DIVERGED',
    collapse_reason: null,
    boundary_trigger_count: 0,
  })
  const result = run([p1, p2])
  assert.equal(result.transitions.length, 1)
  assert.equal(result.transitions[0].transition_type, 'QUORUM_CHANGED')
})

// ── 19. Divergence increase maps to DIVERGENCE_INCREASED ─────────────────────

test('divergence increase maps to DIVERGENCE_INCREASED', () => {
  const p1 = makeProjection({
    divergent_count: 0,
    projection_result: 'TOPOLOGY_CONVERGED',
    collapse_reason: null,
    boundary_trigger_count: 0,
  })
  const p2 = makeProjection({
    divergent_count: 2,
    projection_result: 'TOPOLOGY_CONVERGED',
    collapse_reason: null,
    boundary_trigger_count: 0,
  })
  const result = run([p1, p2])
  assert.equal(result.transitions.length, 1)
  assert.equal(result.transitions[0].transition_type, 'DIVERGENCE_INCREASED')
})

// ── 20. Divergence decrease maps to DIVERGENCE_DECREASED ─────────────────────

test('divergence decrease maps to DIVERGENCE_DECREASED', () => {
  const p1 = makeProjection({
    divergent_count: 3,
    projection_result: 'TOPOLOGY_CONVERGED',
    collapse_reason: null,
    boundary_trigger_count: 0,
  })
  const p2 = makeProjection({
    divergent_count: 1,
    projection_result: 'TOPOLOGY_CONVERGED',
    collapse_reason: null,
    boundary_trigger_count: 0,
  })
  const result = run([p1, p2])
  assert.equal(result.transitions.length, 1)
  assert.equal(result.transitions[0].transition_type, 'DIVERGENCE_DECREASED')
})

// ── 21. Stable evidence maps to STABLE ────────────────────────────────────────

test('stable evidence maps to STABLE', () => {
  const p1 = makeProjection({
    divergent_count: 0,
    projection_result: 'TOPOLOGY_CONVERGED',
    collapse_reason: null,
    boundary_trigger_count: 0,
    participant_count: 3,
  })
  const p2 = makeProjection({
    divergent_count: 0,
    projection_result: 'TOPOLOGY_CONVERGED',
    collapse_reason: null,
    boundary_trigger_count: 0,
    participant_count: 3,
  })
  const result = run([p1, p2])
  assert.equal(result.transitions.length, 1)
  assert.equal(result.transitions[0].transition_type, 'STABLE')
})

// ── 22. Empty projections fail closed ────────────────────────────────────────

test('empty projections fail closed', () => {
  const result = buildTemporalLegitimacyReplayVisualization(
    makeInput([]),
  )
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})

// ── 23. Missing replay_id fails closed ───────────────────────────────────────

test('missing replay_id fails closed', () => {
  const cases = [
    makeInput([makeProjection()], { replay_id: undefined }),
    makeInput([makeProjection()], { replay_id: '' }),
    makeInput([makeProjection()], { replay_id: null }),
    makeInput([makeProjection()], { replay_id: 42 }),
  ]
  for (const input of cases) {
    const result = buildTemporalLegitimacyReplayVisualization(input)
    assert.equal(
      result.replay_result,
      TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL,
      `should fail closed for replay_id: ${JSON.stringify(input.replay_id)}`,
    )
  }
})

// ── 24. Malformed distributed_topology_hash fails closed ──────────────────────

test('malformed distributed_topology_hash fails closed', () => {
  const base = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION',
    evidence_only: true,
    distributed_topology_hash: 'not-a-valid-sha256-hex',
    projection_result: 'TOPOLOGY_CONVERGED',
    participant_count: 3,
    divergent_count: 0,
    boundary_trigger_count: 0,
    collapse_reason: null,
  }
  const proj = { ...base, projection_hash: computeProjectionHash(base) }
  const result = run([proj])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})

// ── 25. Temporal replay output is frozen ──────────────────────────────────────

test('temporal replay output is frozen', () => {
  const result = run([makeProjection(), makeProjection({ distributed_topology_hash: DHASH_B })])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)

  // Top-level object is frozen
  assert.ok(Object.isFrozen(result))

  // Frames array is frozen
  assert.ok(Object.isFrozen(result.frames))

  // Individual frames are frozen
  for (const frame of result.frames) {
    assert.ok(Object.isFrozen(frame))
  }

  // Transitions array is frozen
  assert.ok(Object.isFrozen(result.transitions))

  // Individual transitions are frozen
  for (const transition of result.transitions) {
    assert.ok(Object.isFrozen(transition))
  }

  // Mutations throw in strict mode
  assert.throws(() => {
    'use strict'
    ;(result).replay_id = 'mutated'
  }, TypeError)
})

// ── Regression: boundary fields in projections fail closed ────────────────────

test('projection with creates_authority fails closed', () => {
  const base = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION',
    evidence_only: true,
    distributed_topology_hash: DHASH_A,
    projection_result: 'TOPOLOGY_CONVERGED',
    participant_count: 3,
    divergent_count: 0,
    boundary_trigger_count: 0,
    collapse_reason: null,
    creates_authority: true,
  }
  const proj = { ...base, projection_hash: computeProjectionHash(base) }
  const result = run([proj])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})

test('projection with mutates_registry fails closed', () => {
  const base = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION',
    evidence_only: true,
    distributed_topology_hash: DHASH_A,
    projection_result: 'TOPOLOGY_CONVERGED',
    participant_count: 3,
    divergent_count: 0,
    boundary_trigger_count: 0,
    collapse_reason: null,
    mutates_registry: true,
  }
  const proj = { ...base, projection_hash: computeProjectionHash(base) }
  const result = run([proj])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})

test('projection with automatic_repair fails closed', () => {
  const base = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION',
    evidence_only: true,
    distributed_topology_hash: DHASH_A,
    projection_result: 'TOPOLOGY_CONVERGED',
    participant_count: 3,
    divergent_count: 0,
    boundary_trigger_count: 0,
    collapse_reason: null,
    automatic_repair: true,
  }
  const proj = { ...base, projection_hash: computeProjectionHash(base) }
  const result = run([proj])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})

test('null replay artifact is itself consistent', () => {
  const result = buildTemporalLegitimacyReplayVisualization(null)
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
  assert.equal(result.artifact_type, 'TEMPORAL_LEGITIMACY_REPLAY_VISUALIZATION')
  assert.equal(result.evidence_only, true)
  assert.equal(result.frame_count, 0)
  assert.equal(result.frames.length, 0)
  assert.equal(result.transitions.length, 0)
  assert.ok(typeof result.temporal_replay_hash === 'string' && result.temporal_replay_hash.length === 64)
})

test('OBSERVED_SEQUENCE ordering is deterministic regardless of input order', () => {
  const p1 = makeProjection({ distributed_topology_hash: DHASH_A, participant_count: 1 })
  const p2 = makeProjection({ distributed_topology_hash: DHASH_B, participant_count: 2 })

  const r1 = buildTemporalLegitimacyReplayVisualization(
    makeInput([p1, p2], { replay_ordering: 'OBSERVED_SEQUENCE' }),
  )
  const r2 = buildTemporalLegitimacyReplayVisualization(
    makeInput([p2, p1], { replay_ordering: 'OBSERVED_SEQUENCE' }),
  )

  assert.equal(r1.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)
  assert.equal(r2.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)
  assert.equal(r1.temporal_replay_hash, r2.temporal_replay_hash)
})

test('BOUNDARY_TRIGGERED takes priority over COLLAPSE_CHANGED', () => {
  const p1 = makeProjection({ boundary_trigger_count: 0, collapse_reason: null })
  const p2 = makeProjection({ boundary_trigger_count: 1, collapse_reason: 'QUORUM_LOST' })
  const result = run([p1, p2])
  assert.equal(result.transitions[0].transition_type, 'BOUNDARY_TRIGGERED')
})

test('transition from_hash and to_hash match frame hashes', () => {
  const projections = [
    makeProjection({ distributed_topology_hash: DHASH_A }),
    makeProjection({ distributed_topology_hash: DHASH_B }),
  ]
  const result = run(projections)
  assert.equal(result.transitions.length, 1)
  assert.equal(result.transitions[0].from_hash, result.frames[0].frame_hash)
  assert.equal(result.transitions[0].to_hash, result.frames[1].frame_hash)
})

test('single projection produces zero transitions', () => {
  const result = run([makeProjection()])
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED)
  assert.equal(result.frame_count, 1)
  assert.equal(result.transitions.length, 0)
})

test('missing evidence_only in top-level input fails closed', () => {
  const result = buildTemporalLegitimacyReplayVisualization({
    replay_id: 'r1',
    replay_ordering: 'INPUT_ORDER',
    projections: [makeProjection()],
  })
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})

test('evidence_only false in top-level input fails closed', () => {
  const result = buildTemporalLegitimacyReplayVisualization(
    makeInput([makeProjection()], { evidence_only: false }),
  )
  assert.equal(result.replay_result, TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL)
})
