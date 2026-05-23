/**
 * tests/issue-1052-distributed-topology-divergence-observer.test.mjs
 * Issue #1052 — Distributed Topology Divergence Observer and Quorum Drift Telemetry
 *
 * FATE tests proving evidence-only distributed topology divergence observer semantics.
 *
 * Observer classifies topology disagreement only.
 * Observer must not create authority, validation, execution, proof,
 * reconciliation mutation, or automatic repair.
 * No observer artifact may change legitimacy state.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS,
  observeDistributedTopologyDivergence,
  computeObservationHash,
} from '../src/distributed-topology-divergence-observer.ts'

import {
  DISTRIBUTED_TOPOLOGY_RESULTS,
  DISTRIBUTED_TOPOLOGY_CLASSES,
  QUORUM_LEGITIMACY_RESULTS,
  TOPOLOGY_PARTICIPANT_STATES,
  buildTopologyParticipantView,
  evaluateDistributedTopologyConvergence,
} from '../src/distributed-topology-convergence.ts'

// ── Test fixtures ──────────────────────────────────────────────────────────────

const HASH_A = createHash('sha256').update('surface-graph-a').digest('hex')
const HASH_B = createHash('sha256').update('surface-graph-b').digest('hex')

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

function makeConvergedTopology() {
  return evaluateDistributedTopologyConvergence({
    participant_views: [
      makeView({ participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({ participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({ participant_id: 'n3', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
    ],
    quorum_threshold: 2,
  })
}

function makeDivergedTopology() {
  return evaluateDistributedTopologyConvergence({
    participant_views: [
      makeView({ participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({ participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_B }),
      makeView({ participant_id: 'n3', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
    ],
    quorum_threshold: 2,
  })
}

function makeQuorumFailedTopology() {
  return evaluateDistributedTopologyConvergence({
    participant_views: [
      makeView({ participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({ participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
    ],
    quorum_threshold: 5,
  })
}

// ── 1. Observer cannot create authority ───────────────────────────────────────

test('observer cannot create authority', () => {
  const convergence = makeConvergedTopology()
  const obs = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs.evidence_only, true)
  assert.equal(obs.artifact_type, 'DISTRIBUTED_TOPOLOGY_DIVERGENCE_OBSERVATION')

  // Output must not include authority-creating fields
  assert.ok(!('creates_authority' in obs), 'must not contain creates_authority')
  assert.ok(!('authority_grant' in obs), 'must not contain authority_grant')
  assert.ok(!('execution_token' in obs), 'must not contain execution_token')

  // Observation result is a divergence classification, not an authority
  assert.ok(
    Object.values(TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS).includes(obs.observation_result),
    'observation_result must be a valid divergence classification',
  )
})

// ── 2. Observer cannot validate execution ─────────────────────────────────────

test('observer cannot validate execution', () => {
  const convergence = makeConvergedTopology()
  const obs = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs.evidence_only, true)
  assert.ok(!('creates_execution' in obs), 'must not contain creates_execution')
  assert.ok(!('execution_token' in obs), 'must not contain execution_token')
  assert.ok(!('validation_result' in obs), 'must not contain validation_result')
  assert.ok(!('execution_permission' in obs), 'must not contain execution_permission')
})

// ── 3. Observer cannot produce proof ──────────────────────────────────────────

test('observer cannot produce proof', () => {
  const convergence = makeConvergedTopology()
  const obs = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs.evidence_only, true)
  assert.ok(!('creates_proof' in obs), 'must not contain creates_proof')
  assert.ok(!('proof_signature' in obs), 'must not contain proof_signature')
  assert.ok(!('mutates_registry' in obs), 'must not contain mutates_registry')
  assert.ok(!('registry_mutation' in obs), 'must not contain registry_mutation')
  assert.ok(!('reconciliation_repair' in obs), 'must not contain reconciliation_repair')
})

// ── 4. Invalid topology hash fails closed ─────────────────────────────────────

test('invalid topology hash fails closed', () => {
  const convergence = makeConvergedTopology()
  assert.equal(convergence.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED)

  // Corrupt the hash — observer must fail closed
  const corrupted = { ...convergence, distributed_topology_hash: 'not-a-valid-sha256-hex' }
  const obs = observeDistributedTopologyDivergence(corrupted)

  assert.equal(obs.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NULL)
  assert.equal(obs.participant_count, 0)
  assert.equal(obs.converged_count, 0)
  assert.equal(obs.divergent_count, 0)
  assert.equal(obs.stale_count, 0)
  assert.equal(obs.missing_evidence_count, 0)
  assert.equal(obs.boundary_trigger_count, 0)
  assert.equal(obs.evidence_only, true)

  // Missing hash also fails closed
  const missing = { ...convergence }
  delete missing.distributed_topology_hash
  const obs2 = observeDistributedTopologyDivergence(missing)
  assert.equal(obs2.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NULL)

  // Tampered hash (valid hex format but wrong value) fails closed
  const tampered = {
    ...convergence,
    distributed_topology_hash: createHash('sha256').update('tampered').digest('hex'),
  }
  const obs3 = observeDistributedTopologyDivergence(tampered)
  assert.equal(obs3.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NULL)
})

// ── 5. Participant hash mismatch is evidence-only ─────────────────────────────

test('participant hash mismatch is evidence-only', () => {
  const convergence = makeDivergedTopology()
  assert.equal(convergence.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED)

  const obs = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_OBSERVED)
  assert.equal(obs.evidence_only, true)
  assert.equal(obs.artifact_type, 'DISTRIBUTED_TOPOLOGY_DIVERGENCE_OBSERVATION')

  // No boundary-violating fields
  assert.ok(!('creates_authority' in obs))
  assert.ok(!('creates_execution' in obs))
  assert.ok(!('creates_proof' in obs))
  assert.ok(!('mutates_registry' in obs))
  assert.ok(!('topology_repair' in obs))
  assert.ok(!('auto_repair' in obs))
  assert.ok(!('lineage_repair' in obs))
})

// ── 6. Quorum failure is telemetry-only ───────────────────────────────────────

test('quorum failure is telemetry-only', () => {
  const convergence = makeQuorumFailedTopology()
  assert.equal(convergence.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.QUORUM_COLLAPSED)

  const obs = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_OBSERVED)
  assert.equal(obs.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_NOT_SATISFIED)
  assert.equal(obs.evidence_only, true)

  // Telemetry only — no side effects
  assert.ok(!('creates_authority' in obs))
  assert.ok(!('execution_token' in obs))
  assert.ok(!('proof_signature' in obs))
  assert.ok(!('registry_mutation' in obs))
  assert.ok(!('reconciliation_repair' in obs))
})

// ── 7. Stale participant classification is deterministic ──────────────────────

test('stale participant classification is deterministic', () => {
  const convergence = evaluateDistributedTopologyConvergence({
    participant_views: [
      makeView({ participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({
        participant_id: 'n2',
        topology_epoch: 'epoch-1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_STALE,
      }),
    ],
    quorum_threshold: 1,
  })

  const obs1 = observeDistributedTopologyDivergence(convergence)
  const obs2 = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs1.stale_count, obs2.stale_count)
  assert.equal(obs1.stale_count, 1)
  assert.equal(obs1.observation_hash, obs2.observation_hash)
  assert.equal(obs1.evidence_only, true)
})

// ── 8. Missing evidence classification is deterministic ───────────────────────

test('missing evidence classification is deterministic', () => {
  const convergence = evaluateDistributedTopologyConvergence({
    participant_views: [
      makeView({ participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({
        participant_id: 'n2',
        topology_epoch: 'epoch-1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_UNTRUSTED,
      }),
    ],
    quorum_threshold: 1,
  })

  const obs1 = observeDistributedTopologyDivergence(convergence)
  const obs2 = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs1.missing_evidence_count, obs2.missing_evidence_count)
  assert.equal(obs1.missing_evidence_count, 1)
  assert.equal(obs1.observation_hash, obs2.observation_hash)
  assert.equal(obs1.evidence_only, true)
})

// ── 9. Boundary trigger activation produces observation only ──────────────────

test('boundary trigger activation produces observation only', () => {
  // Input with authority attempt causes convergence to return NULL with boundary class
  const convergence = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    creates_authority: true,
  })
  assert.equal(convergence.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)
  assert.ok(
    (convergence.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT),
  )

  const obs = observeDistributedTopologyDivergence(convergence)

  // Observer produces TOPOLOGY_DIVERGENCE_NULL for NULL convergence
  assert.equal(obs.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NULL)

  // Boundary trigger is counted
  assert.ok(obs.boundary_trigger_count > 0, 'boundary_trigger_count must be > 0')
  assert.equal(obs.boundary_trigger_count, 1)

  // The observation is still purely evidence — no boundary violations in output
  assert.equal(obs.evidence_only, true)
  assert.ok(!('creates_authority' in obs))
  assert.ok(!('creates_execution' in obs))
  assert.ok(!('creates_proof' in obs))
  assert.ok(!('mutates_registry' in obs))
  assert.ok(!('authority_grant' in obs))
  assert.ok(!('execution_token' in obs))
  assert.ok(!('lineage_repair' in obs))
  assert.ok(!('auto_repair' in obs))
})

// ── 10. Observation hash excludes itself before hashing ───────────────────────

test('observation hash excludes itself before hashing', () => {
  const convergence = makeConvergedTopology()
  const obs = observeDistributedTopologyDivergence(convergence)

  // The observation_hash should equal computeObservationHash({...obs}) since that function
  // excludes observation_hash from the hash input
  const recomputed = computeObservationHash({ ...obs })
  assert.equal(recomputed, obs.observation_hash)

  // Injecting a different observation_hash value must not change the computed hash
  const withDifferentHash = { ...obs, observation_hash: 'different-hash-value' }
  const recomputedWithDifferent = computeObservationHash(withDifferentHash)
  assert.equal(recomputedWithDifferent, obs.observation_hash)

  // Stripping observation_hash entirely must also match
  const { observation_hash: _stripped, ...fieldsOnly } = obs
  const recomputedStripped = computeObservationHash(fieldsOnly)
  assert.equal(recomputedStripped, obs.observation_hash)
})

// ── 11. Same input produces same observation hash ─────────────────────────────

test('same input produces same observation hash', () => {
  const convergence = makeConvergedTopology()

  const obs1 = observeDistributedTopologyDivergence(convergence)
  const obs2 = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs1.observation_hash, obs2.observation_hash)
  assert.equal(obs1.observation_result, obs2.observation_result)
})

// ── 12. Mutation after observation changes observation hash ───────────────────

test('mutation after observation changes observation hash', () => {
  const convergence1 = evaluateDistributedTopologyConvergence({
    participant_views: [
      makeView({ participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({ participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
    ],
    quorum_threshold: 2,
  })

  // convergence2 has one stale participant added
  const convergence2 = evaluateDistributedTopologyConvergence({
    participant_views: [
      makeView({ participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({ participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({
        participant_id: 'n3',
        topology_epoch: 'epoch-1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_STALE,
      }),
    ],
    quorum_threshold: 2,
  })

  const obs1 = observeDistributedTopologyDivergence(convergence1)
  const obs2 = observeDistributedTopologyDivergence(convergence2)

  // Different inputs → different observation hashes
  assert.notEqual(obs1.observation_hash, obs2.observation_hash)

  // Manually verify: if we take obs1 fields but change stale_count, hash changes
  const mutatedFields = { ...obs1, stale_count: obs1.stale_count + 1 }
  const mutatedHash = computeObservationHash(mutatedFields)
  assert.notEqual(mutatedHash, obs1.observation_hash)
})

// ── 13. No runtime state mutation occurs ──────────────────────────────────────

test('no runtime state mutation occurs', () => {
  const convergence = makeConvergedTopology()

  // Capture snapshot of convergence artifact before observation
  const snapshotBefore = JSON.stringify(convergence)

  const obs = observeDistributedTopologyDivergence(convergence)

  // Convergence artifact must be unchanged
  const snapshotAfter = JSON.stringify(convergence)
  assert.equal(snapshotBefore, snapshotAfter, 'convergence artifact must not be mutated')

  // Observation artifact is frozen
  assert.throws(
    () => {
      // @ts-ignore — intentional mutation attempt on frozen object
      obs.observation_result = 'MUTATED'
    },
    undefined,
    'frozen observation must throw on mutation',
  )

  // Observation does not include mutable state fields
  assert.ok(!('topology_repair' in obs))
  assert.ok(!('auto_repair' in obs))
  assert.ok(!('lineage_rewrite' in obs))
  assert.ok(!('registry_mutation' in obs))
})

// ── 14. Participant class distribution drift is counted ───────────────────────

test('participant class distribution drift is counted', () => {
  // Mix of CURRENT (2), STALE (1), UNTRUSTED (1), threshold 2 → TOPOLOGY_CONVERGED
  const convergence = evaluateDistributedTopologyConvergence({
    participant_views: [
      makeView({ participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({ participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A }),
      makeView({
        participant_id: 'n3',
        topology_epoch: 'epoch-1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_STALE,
      }),
      makeView({
        participant_id: 'n4',
        topology_epoch: 'epoch-1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_UNTRUSTED,
      }),
    ],
    quorum_threshold: 2,
  })

  assert.equal(convergence.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED)

  const obs = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs.participant_count, 4)
  assert.equal(obs.converged_count, 2)   // current_count (CURRENT state participants)
  assert.equal(obs.divergent_count, 0)   // no PARTICIPANT_DIVERGENT state
  assert.equal(obs.stale_count, 1)
  assert.equal(obs.missing_evidence_count, 1) // untrusted_count
  assert.equal(obs.evidence_only, true)

  // Even with drift, observation_result reflects convergence result
  assert.equal(obs.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NONE)
})

// ── 15. collapse_reason follows convergence rule priority ─────────────────────

test('collapse_reason follows convergence rule priority', () => {
  // QUORUM_COLLAPSED: classes include quorum_collapsed and quorum_not_satisfied
  // quorum_collapsed has higher priority → must be collapse_reason
  const quorumCollapsed = makeQuorumFailedTopology()
  assert.ok(
    (quorumCollapsed.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_COLLAPSED),
  )
  assert.ok(
    (quorumCollapsed.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_NOT_SATISFIED),
  )
  const obsCollapsed = observeDistributedTopologyDivergence(quorumCollapsed)
  assert.equal(obsCollapsed.collapse_reason, DISTRIBUTED_TOPOLOGY_CLASSES.QUORUM_COLLAPSED)

  // TOPOLOGY_DIVERGED with split brain: topology_split_brain_detected comes before
  // topology_hash_mismatch in priority
  const splitBrain = makeDivergedTopology()
  assert.ok(
    (splitBrain.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_SPLIT_BRAIN_DETECTED),
  )
  assert.ok(
    (splitBrain.convergence_classes).includes(DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_HASH_MISMATCH),
  )
  const obsSplitBrain = observeDistributedTopologyDivergence(splitBrain)
  assert.equal(obsSplitBrain.collapse_reason, DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_SPLIT_BRAIN_DETECTED)

  // TOPOLOGY_AUTHORITY_ATTEMPT (boundary violation) has higher priority than quorum classes
  const authorityViolation = evaluateDistributedTopologyConvergence({
    participant_views: [makeView()],
    quorum_threshold: 1,
    creates_authority: true,
  })
  const obsAuthority = observeDistributedTopologyDivergence(authorityViolation)
  assert.equal(obsAuthority.collapse_reason, DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_AUTHORITY_ATTEMPT)

  // TOPOLOGY_DIVERGENCE_NONE has collapse_reason === null
  const converged = makeConvergedTopology()
  const obsConverged = observeDistributedTopologyDivergence(converged)
  assert.equal(obsConverged.collapse_reason, null)
})

// ── 16. Valid fully converged topology returns TOPOLOGY_DIVERGENCE_NONE ───────

test('valid fully converged topology returns TOPOLOGY_DIVERGENCE_NONE', () => {
  const convergence = makeConvergedTopology()
  assert.equal(convergence.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_CONVERGED)
  assert.equal(convergence.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED)

  const obs = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NONE)
  assert.equal(obs.collapse_reason, null)
  assert.equal(obs.evidence_only, true)
  assert.equal(obs.artifact_type, 'DISTRIBUTED_TOPOLOGY_DIVERGENCE_OBSERVATION')
  assert.equal(obs.participant_count, 3)
  assert.equal(obs.converged_count, 3)
  assert.equal(obs.divergent_count, 0)
  assert.equal(obs.stale_count, 0)
  assert.equal(obs.missing_evidence_count, 0)
  assert.equal(obs.boundary_trigger_count, 0)
  assert.equal(obs.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED)

  // No boundary-violating fields
  assert.ok(!('creates_authority' in obs))
  assert.ok(!('creates_execution' in obs))
  assert.ok(!('creates_proof' in obs))
  assert.ok(!('mutates_registry' in obs))
})

// ── 17. Divergent valid topology returns TOPOLOGY_DIVERGENCE_OBSERVED ─────────

test('divergent valid topology returns TOPOLOGY_DIVERGENCE_OBSERVED', () => {
  const convergence = makeDivergedTopology()
  assert.equal(convergence.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.TOPOLOGY_DIVERGED)
  assert.equal(convergence.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED)

  const obs = observeDistributedTopologyDivergence(convergence)

  assert.equal(obs.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_OBSERVED)
  assert.equal(obs.evidence_only, true)
  assert.equal(obs.quorum_result, QUORUM_LEGITIMACY_RESULTS.QUORUM_SATISFIED)
  assert.equal(obs.participant_count, 3)
  // converged_count is 0 because convergence_result is not TOPOLOGY_CONVERGED
  assert.equal(obs.converged_count, 0)
  // collapse_reason reflects the primary cause of divergence
  assert.ok(obs.collapse_reason !== null)
  assert.equal(obs.collapse_reason, DISTRIBUTED_TOPOLOGY_CLASSES.TOPOLOGY_SPLIT_BRAIN_DETECTED)

  // No boundary-violating fields
  assert.ok(!('creates_authority' in obs))
  assert.ok(!('topology_repair' in obs))
  assert.ok(!('auto_repair' in obs))
})

// ── 18. Malformed participant view returns evidence-only divergence or NULL ────

test('malformed participant view returns evidence-only divergence or NULL per #1050 semantics', () => {
  // Build a PARTICIPANT_NULL view (malformed input)
  const malformedView = buildTopologyParticipantView({})
  assert.equal(malformedView.participant_state, TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_NULL)

  // #1050 semantics: NULL participant state causes convergence to return NULL
  const convergence = evaluateDistributedTopologyConvergence({
    participant_views: [malformedView],
    quorum_threshold: 1,
  })
  assert.equal(convergence.convergence_result, DISTRIBUTED_TOPOLOGY_RESULTS.NULL)

  const obs = observeDistributedTopologyDivergence(convergence)

  // Observer classifies this as TOPOLOGY_DIVERGENCE_NULL per fail-closed rule
  assert.equal(obs.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NULL)
  assert.equal(obs.evidence_only, true)
  assert.equal(obs.artifact_type, 'DISTRIBUTED_TOPOLOGY_DIVERGENCE_OBSERVATION')

  // Observer does not throw for any malformed convergence input
  const malformedInputs = [null, undefined, 42, '', [], {}, { artifact: 'WRONG' }]
  for (const input of malformedInputs) {
    assert.doesNotThrow(() => {
      const result = observeDistributedTopologyDivergence(input)
      assert.equal(result.observation_result, TOPOLOGY_DIVERGENCE_OBSERVATION_RESULTS.TOPOLOGY_DIVERGENCE_NULL)
      assert.equal(result.evidence_only, true)
    }, `must not throw for input: ${JSON.stringify(input)}`)
  }
})
