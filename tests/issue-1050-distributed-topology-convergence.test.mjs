/**
 * tests/issue-1050-distributed-topology-convergence.test.mjs
 * Issue #1050 — Distributed Topology Convergence and Quorum Legitimacy
 *
 * FATE tests proving deterministic evidence-only distributed topology
 * convergence and quorum legitimacy semantics.
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no execution capability expansion, no proof behavior changes,
 * no topology repair, no registry mutation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  DISTRIBUTED_TOPOLOGY_RESULTS,
  DISTRIBUTED_TOPOLOGY_CLASSES,
  QUORUM_LEGITIMACY_RESULTS,
  TOPOLOGY_PARTICIPANT_STATES,
  buildTopologyParticipantView,
  evaluateTopologyQuorum,
  evaluateDistributedTopologyConvergence,
  computeTopologyParticipantHash,
  computeDistributedTopologyHash,
  validateDistributedTopologyBoundary,
  readDistributedTopologyTelemetry,
} from '../src/distributed-topology-convergence.ts'

import { arbitrateLegitimacyConflict } from '../src/legitimacy-conflict-arbitration.ts'

// ── Test fixtures ──────────────────────────────────────────────────────────────

const HASH_A = createHash('sha256').update('surface-graph-a').digest('hex')
const HASH_B = createHash('sha256').update('surface-graph-b').digest('hex')
const HASH_ARB = createHash('sha256').update('arbitration-ref').digest('hex')

function makeParticipantInput(overrides = {}) {
  return {
    participant_id: 'node-1',
    topology_epoch: 'epoch-42',
    surface_graph_hash: HASH_A,
    arbitration_hash: null,
    participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_CURRENT,
    observed_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeView(overrides = {}) {
  return buildTopologyParticipantView(makeParticipantInput(overrides))
}

function makeConvergenceInput(viewsData, threshold = 2, arbitration_evidence = null) {
  const views = viewsData.map((d) => (typeof d === 'function' ? d() : makeView(d)))
  return {
    participant_views: views,
    quorum_threshold: threshold,
    arbitration_evidence,
  }
}

function runConvergence(viewsData, threshold = 2, arbitration_evidence = null) {
  return evaluateDistributedTopologyConvergence(
    makeConvergenceInput(viewsData, threshold, arbitration_evidence),
  )
}

// ── 1. Matching current participant views satisfy quorum and converge ───────────

test('matching current participant views satisfy quorum and converge topology', () => {
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n3', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
  )
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED)
  assert.equal(result.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED)
  assert.equal(result.topology_epoch, 'epoch-1')
  assert.equal(result.participant_count, 3)
  assert.equal(result.current_count, 3)
})

// ── 2. Below quorum threshold returns QUORUM_COLLAPSED/QUORUM_NOT_SATISFIED ────

test('same topology hash but below quorum threshold returns QUORUM_COLLAPSED or QUORUM_NOT_SATISFIED deterministically', () => {
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    5, // threshold higher than participant count
  )
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.QUORUM_COLLAPSED)
  assert.equal(result.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_NOT_SATISFIED)
})

// ── 3. Mismatched topology hash returns TOPOLOGY_DIVERGED ──────────────────────

test('mismatched topology hash returns TOPOLOGY_DIVERGED', () => {
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_B },
      { participant_id: 'n3', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
  )
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED)
  assert.equal(result.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_MISMATCH),
  )
})

// ── 4. Mismatched topology_epoch returns TOPOLOGY_DIVERGED ────────────────────

test('mismatched topology_epoch returns TOPOLOGY_DIVERGED', () => {
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-2', surface_graph_hash: HASH_A },
      { participant_id: 'n3', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
  )
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_EPOCH_MISMATCH),
  )
})

// ── 5. Stale participant contributes to stale_count and can collapse quorum ────

test('stale participant contributes to stale_count and can collapse quorum', () => {
  const result = runConvergence(
    [
      {
        participant_id: 'n1',
        topology_epoch: 'epoch-1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_STALE,
      },
    ],
    1, // threshold = 1 but no CURRENT participants
  )
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.QUORUM_COLLAPSED)
  assert.equal(result.stale_count, 1)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_STALE),
  )
})

// ── 6. Divergent participant contributes to divergent_count ───────────────────

test('divergent participant contributes to divergent_count', () => {
  const result = runConvergence(
    [
      {
        participant_id: 'n1',
        topology_epoch: 'epoch-1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_DIVERGENT,
      },
    ],
    1,
  )
  assert.equal(result.divergent_count, 1)
  assert.ok(
    (result.convergence_classes).includes(
      DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_DIVERGENT,
    ),
  )
})

// ── 7. Untrusted participant contributes to untrusted_count ───────────────────

test('untrusted participant contributes to untrusted_count', () => {
  const result = runConvergence(
    [
      {
        participant_id: 'n1',
        topology_epoch: 'epoch-1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_UNTRUSTED,
      },
    ],
    1,
  )
  assert.equal(result.untrusted_count, 1)
  assert.ok(
    (result.convergence_classes).includes(
      DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PARTICIPANT_UNTRUSTED,
    ),
  )
})

// ── 8. NULL participant view returns NULL ─────────────────────────────────────

test('NULL participant view returns NULL', () => {
  const nullView = buildTopologyParticipantView({}) // missing required fields → PARTICIPANT_NULL
  assert.equal(nullView.participant_state, TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_NULL)

  const result = evaluateDistributedTopologyConvergence({
    participant_views: [nullView],
    quorum_threshold: 1,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
})

// ── 9. Malformed participant view returns NULL not throw ───────────────────────

test('malformed participant view returns NULL not throw', () => {
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [{ artifact: 'TOPOLOGY_PARTICIPANT_VIEW', evidence_only: true, participant_state: 'PARTICIPANT_CURRENT', participant_hash: 'bad' }],
    quorum_threshold: 1,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
})

// ── 10. Invalid participant_hash returns NULL ──────────────────────────────────

test('invalid participant_hash returns NULL', () => {
  const fakeView = {
    artifact: 'TOPOLOGY_PARTICIPANT_VIEW',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    creates_proof: false,
    mutates_registry: false,
    participant_id: 'n1',
    topology_epoch: 'epoch-1',
    surface_graph_hash: HASH_A,
    arbitration_hash: null,
    participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_CURRENT,
    observed_at: '2026-01-01T00:00:00Z',
    participant_hash_alg: 'sha256',
    participant_hash: 'not-valid-sha256-hex',
  }
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [fakeView],
    quorum_threshold: 1,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_INVALID),
  )
})

// ── 11. Invalid distributed_topology_hash returns zero telemetry ───────────────

test('invalid distributed_topology_hash returns NULL telemetry metrics', () => {
  const badArtifact = {
    artifact: 'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
    convergence_result: DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED,
    quorum_result: QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED,
    stale_count: 0,
    divergent_count: 0,
    untrusted_count: 0,
    convergence_classes: [DISTRIBUTED_TOPOLOGY_CLASSES.DISTRIBUTED_TOPOLOGY_CONVERGED],
    distributed_topology_hash: 'invalid-hash-not-hex',
  }
  const telem = readDistributedTopologyTelemetry(badArtifact)
  assert.equal(telem.metrics.topology_converged_total, 0)
  assert.equal(telem.evidence_only, true)
  assert.equal(telem.read_only, true)
})

// ── 12. Conflict arbitration unresolved escalates conflict ────────────────────

test('conflict arbitration unresolved escalates conflict', () => {
  const arb = arbitrateLegitimacyConflict({
    conflict_id: 'c1',
    conflict_type: 'topology',
    lineage_inputs: ['a'],
    topology_reconstructable: false,
  })
  assert.equal(arb.arbitration_result, 'CONFLICT_UNRESOLVABLE')

  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
    arb,
  )
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.CONFLICT_ESCALATED)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.CONFLICT_ESCALATED),
  )
})

// ── 13. Human-review conflict escalates conflict ──────────────────────────────

test('human-review conflict escalates conflict', () => {
  const arb = arbitrateLegitimacyConflict({
    conflict_id: 'c2',
    conflict_type: 'topology',
    lineage_inputs: ['a'],
    replay_ambiguity_detected: true,
  })
  assert.equal(arb.arbitration_result, 'CONFLICT_REQUIRES_HUMAN_REVIEW')

  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
    arb,
  )
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.CONFLICT_ESCALATED)
})

// ── 14. Authority attempt returns NULL ────────────────────────────────────────

test('authority attempt returns NULL', () => {
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    creates_authority: true,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT),
  )
})

// ── 15. Execution attempt returns NULL ────────────────────────────────────────

test('execution attempt returns NULL', () => {
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    creates_execution: true,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_EXECUTION_ATTEMPT),
  )
})

// ── 16. Proof attempt returns NULL ────────────────────────────────────────────

test('proof attempt returns NULL', () => {
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    creates_proof: true,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_PROOF_ATTEMPT),
  )
})

// ── 17. Registry mutation returns NULL ────────────────────────────────────────

test('registry mutation returns NULL', () => {
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    mutates_registry: true,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_REGISTRY_MUTATION),
  )
})

// ── 18. Implicit consensus returns NULL ───────────────────────────────────────

test('implicit consensus returns NULL', () => {
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    implicit_consensus: true,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (result.convergence_classes).includes(
      DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_IMPLICIT_CONSENSUS_FORBIDDEN,
    ),
  )
})

// ── 19. majority_as_authority returns NULL ────────────────────────────────────

test('majority_as_authority returns NULL', () => {
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    majority_as_authority: true,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT),
  )
})

// ── 20. stale_state_preferred returns NULL ────────────────────────────────────

test('stale_state_preferred returns NULL', () => {
  const result = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    stale_state_preferred: true,
  })
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (result.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_BOUNDARY_VIOLATION),
  )
})

// ── 21. BREAK_GLASS normalization returns NULL ────────────────────────────────

test('BREAK_GLASS normalization returns NULL', () => {
  const r1 = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    break_glass: true,
  })
  assert.equal(r1.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)

  const r2 = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    break_glass_normalized: true,
  })
  assert.equal(r2.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
})

// ── 22. Convergence output remains evidence_only ──────────────────────────────

test('convergence output remains evidence_only', () => {
  const result = runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  )
  assert.equal(result.evidence_only, true)
})

// ── 23. Convergence creates_authority false ───────────────────────────────────

test('convergence creates_authority false', () => {
  const result = runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  )
  assert.equal(result.creates_authority, false)
})

// ── 24. Convergence creates_execution false ───────────────────────────────────

test('convergence creates_execution false', () => {
  const result = runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  )
  assert.equal(result.creates_execution, false)
})

// ── 25. Convergence creates_proof false ───────────────────────────────────────

test('convergence creates_proof false', () => {
  const result = runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  )
  assert.equal(result.creates_proof, false)
})

// ── 26. Convergence mutates_registry false ────────────────────────────────────

test('convergence mutates_registry false', () => {
  const result = runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  )
  assert.equal(result.mutates_registry, false)
})

// ── 27. Telemetry remains read_only/evidence_only ─────────────────────────────

test('telemetry remains read_only and evidence_only', () => {
  const convergence = runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  )
  const telem = readDistributedTopologyTelemetry(convergence)
  assert.equal(telem.read_only, true)
  assert.equal(telem.evidence_only, true)
})

// ── 28. Telemetry cannot create authority ─────────────────────────────────────

test('telemetry cannot create authority', () => {
  const convergence = runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  )
  const telem = readDistributedTopologyTelemetry(convergence)
  assert.equal(telem.creates_authority, false)
})

// ── 29. Telemetry cannot execute ──────────────────────────────────────────────

test('telemetry cannot execute', () => {
  const telem = readDistributedTopologyTelemetry(runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  ))
  assert.equal(telem.creates_execution, false)
})

// ── 30. Telemetry cannot create proof ────────────────────────────────────────

test('telemetry cannot create proof', () => {
  const telem = readDistributedTopologyTelemetry(runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  ))
  assert.equal(telem.creates_proof, false)
})

// ── 31. Telemetry cannot mutate registries ────────────────────────────────────

test('telemetry cannot mutate registries', () => {
  const telem = readDistributedTopologyTelemetry(runConvergence(
    [{ participant_id: 'n1' }, { participant_id: 'n2' }],
    2,
  ))
  assert.equal(telem.mutates_registry, false)
})

// ── 32. Same distributed topology state produces same hash ────────────────────

test('same distributed topology state produces same hash', () => {
  const input = {
    participant_views: [
      makeView({ participant_id: 'n1' }),
      makeView({ participant_id: 'n2' }),
    ],
    quorum_threshold: 2,
  }
  const r1 = evaluateDistributedTopologyConvergence(input)
  const r2 = evaluateDistributedTopologyConvergence(input)
  assert.equal(r1.distributed_topology_hash, r2.distributed_topology_hash)
})

// ── 33. Reordered participant views preserve distributed hash ─────────────────

test('reordered participant views preserve hash', () => {
  const v1 = makeView({ participant_id: 'n1' })
  const v2 = makeView({ participant_id: 'n2' })
  const v3 = makeView({ participant_id: 'n3' })

  const r1 = evaluateDistributedTopologyConvergence({
    participant_views: [v1, v2, v3],
    quorum_threshold: 2,
  })
  const r2 = evaluateDistributedTopologyConvergence({
    participant_views: [v3, v1, v2],
    quorum_threshold: 2,
  })
  assert.equal(r1.distributed_topology_hash, r2.distributed_topology_hash)
})

// ── 34. Reordered convergence_classes preserve hash ──────────────────────────

test('reordered convergence_classes preserve hash', () => {
  const classesA = ['distributed_topology_converged', 'quorum_satisfied']
  const classesB = ['quorum_satisfied', 'distributed_topology_converged']

  const fields = {
    artifact: 'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
    convergence_result: 'TOPOLOGY_CONVERGED',
    quorum_result: 'QUORUM_SATISFIED',
    participant_count: 2,
    current_count: 2,
    stale_count: 0,
    divergent_count: 0,
    untrusted_count: 0,
    quorum_threshold: 2,
    topology_epoch: 'epoch-1',
    surface_graph_hashes: [HASH_A],
    participant_hashes: [HASH_A, HASH_B],
    distributed_topology_hash_alg: 'sha256',
  }

  const h1 = computeDistributedTopologyHash({ ...fields, convergence_classes: classesA })
  const h2 = computeDistributedTopologyHash({ ...fields, convergence_classes: classesB })
  assert.equal(h1, h2)
})

// ── 35. Participant hash excludes participant_hash itself ─────────────────────

test('participant hash excludes participant_hash itself', () => {
  const fields = {
    artifact: 'TOPOLOGY_PARTICIPANT_VIEW',
    evidence_only: true,
    participant_id: 'n1',
    topology_epoch: 'epoch-1',
    surface_graph_hash: HASH_A,
    arbitration_hash: null,
    participant_state: 'PARTICIPANT_CURRENT',
    observed_at: '2026-01-01T00:00:00Z',
    participant_hash_alg: 'sha256',
  }
  // Hash should be the same whether participant_hash is absent, null, or any value
  const h1 = computeTopologyParticipantHash({ ...fields })
  const h2 = computeTopologyParticipantHash({ ...fields, participant_hash: 'ignored-value' })
  const h3 = computeTopologyParticipantHash({ ...fields, participant_hash: h1 })
  assert.equal(h1, h2)
  assert.equal(h1, h3)
})

// ── 36. Distributed topology hash excludes distributed_topology_hash itself ───

test('distributed topology hash excludes distributed_topology_hash itself', () => {
  const fields = {
    artifact: 'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
    convergence_result: 'TOPOLOGY_CONVERGED',
    convergence_classes: ['distributed_topology_converged', 'quorum_satisfied'],
    participant_count: 2,
    current_count: 2,
    stale_count: 0,
    divergent_count: 0,
    untrusted_count: 0,
    quorum_threshold: 2,
    topology_epoch: 'epoch-1',
    surface_graph_hashes: [HASH_A],
    participant_hashes: [HASH_A],
    distributed_topology_hash_alg: 'sha256',
  }
  const h1 = computeDistributedTopologyHash({ ...fields })
  const h2 = computeDistributedTopologyHash({ ...fields, distributed_topology_hash: 'some-value' })
  const h3 = computeDistributedTopologyHash({ ...fields, distributed_topology_hash: h1 })
  assert.equal(h1, h2)
  assert.equal(h1, h3)
})

// ── 37. Quorum cannot upgrade divergence into convergence ─────────────────────

test('quorum cannot upgrade divergence into convergence', () => {
  // Quorum satisfied (3 >= 2) but participants disagree on hash
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_B },
      { participant_id: 'n3', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
  )
  assert.equal(result.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED)
  assert.notEqual(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED)
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED)
})

// ── 38. Quorum cannot treat majority as authority ─────────────────────────────

test('quorum cannot treat majority as authority', () => {
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n3', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
  )
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED)
  // Quorum satisfied but does not create authority
  assert.equal(result.creates_authority, false)
  assert.equal(result.evidence_only, true)
})

// ── 39. Convergence cannot repair topology ────────────────────────────────────

test('convergence cannot repair topology', () => {
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_B },
    ],
    2,
  )
  // Diverged — no repair fields present
  assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED)
  assert.ok(!('topology_repair' in result))
  assert.ok(!('auto_repair' in result))
  assert.ok(!('lineage_repair' in result))
})

// ── 40. Convergence cannot rewrite lineage ────────────────────────────────────

test('convergence cannot rewrite lineage', () => {
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
  )
  assert.ok(!('lineage_repair' in result))
  assert.ok(!('lineage_rewrite' in result))
})

// ── 41. Convergence cannot imply execution permission ─────────────────────────

test('convergence cannot imply execution permission', () => {
  const result = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    ],
    2,
  )
  assert.equal(result.creates_execution, false)
  assert.ok(!('execution_token' in result))
})

// ── 42. Telemetry cannot convert divergence into convergence ──────────────────

test('telemetry cannot convert divergence into convergence', () => {
  const diverged = runConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_B },
    ],
    2,
  )
  assert.equal(diverged.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED)

  const telem = readDistributedTopologyTelemetry(diverged)
  assert.equal(telem.metrics.topology_diverged_total, 1)
  assert.equal(telem.metrics.topology_converged_total, 0)
  assert.equal(telem.metrics.split_brain_detected_total, 1)
})

// ── 43. Malformed inputs fail closed to NULL not throw ────────────────────────

test('malformed inputs fail closed to NULL not throw', () => {
  const malformed = [null, undefined, 42, '', [], {}, { participant_views: null }]

  for (const input of malformed) {
    assert.doesNotThrow(() => {
      const result = evaluateDistributedTopologyConvergence(input)
      assert.equal(result.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
    }, `should not throw for input: ${JSON.stringify(input)}`)
  }

  // buildTopologyParticipantView also fails closed
  for (const input of malformed) {
    assert.doesNotThrow(() => {
      const view = buildTopologyParticipantView(input)
      assert.equal(view.participant_state, TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_NULL)
    })
  }

  // readDistributedTopologyTelemetry also fails closed
  for (const input of malformed) {
    assert.doesNotThrow(() => {
      const telem = readDistributedTopologyTelemetry(input)
      assert.equal(telem.artifact, 'DISTRIBUTED_TOPOLOGY_TELEMETRY')
    })
  }
})
