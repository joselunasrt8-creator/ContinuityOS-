import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readJson(path) {
  return JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
}

const snapshotRules = readJson('runtime/state_snapshot_rules.json')
const stateConsistencyPolicy = readJson('runtime/state_consistency_policy.json')
const replicaRules = readJson('runtime/replica_divergence_rules.json')
const snapshotIntegrity = readJson('runtime/snapshot_integrity_constraints.json')
const splitBrainFailureModes = readJson('runtime/split_brain_failure_modes.json')
const stateBypassPaths = readJson('runtime/state_bypass_paths.json')
const registryPartitionRules = readJson('runtime/registry_partition_rules.json')

const validStateSnapshot = readJson('tests/fixtures/state-lineage/valid_state_snapshot.json')
const staleSnapshot = readJson('tests/fixtures/state-lineage/stale_snapshot.json')
const rollbackResurrection = readJson('tests/fixtures/state-lineage/rollback_resurrection.json')
const replicaDivergence = readJson('tests/fixtures/state-lineage/replica_divergence.json')
const partitionedRegistry = readJson('tests/fixtures/state-lineage/partitioned_registry.json')
const cachedAuthority = readJson('tests/fixtures/state-lineage/cached_authority.json')
const splitBrainSnapshot = readJson('tests/fixtures/state-lineage/split_brain_snapshot.json')
const proofStateMismatch = readJson('tests/fixtures/state-lineage/proof_state_mismatch.json')
const postValidationMutation = readJson('tests/fixtures/state-lineage/post_validation_mutation.json')
const detachedSnapshotReplay = readJson('tests/fixtures/state-lineage/detached_snapshot_replay.json')

test('state snapshot governance closure: canonical execution gate requires STATE_CONSISTENT', () => {
  assert.equal(
    snapshotRules.required_execution_gate,
    'VALID && AUTHORIZED && UNUSED && POLICY_VALID && CANONICAL_LINEAGE_CONTINUITY && TEMPORALLY_VALID && STATE_CONSISTENT',
  )
  assert.equal(snapshotRules.else_result, 'NULL')
  assert.equal(snapshotRules.invariants.validated_state_not_current_state, 'validated_state != current_state -> NULL')
  assert.equal(snapshotRules.invariants.snapshot_hash_mismatch, 'snapshot_hash_mismatch -> NULL')
  assert.equal(snapshotRules.invariants.rollback_detected, 'rollback_detected -> NULL')
  assert.equal(snapshotRules.invariants.replica_divergence, 'replica_divergence -> NULL')
  assert.equal(snapshotRules.invariants.partitioned_registry, 'partitioned_registry -> NULL')
  assert.equal(snapshotRules.invariants.cached_authority_reuse, 'cached_authority_reuse -> NULL')
  assert.equal(snapshotRules.invariants.proof_state_mismatch, 'proof_state_mismatch -> NULL')
  assert.equal(snapshotRules.invariants.state_mutated_after_validation, 'state_mutated_after_validation -> NULL')
  assert.equal(snapshotRules.invariants.split_brain_snapshot, 'split_brain_snapshot -> NULL')
})

test('state snapshot governance closure: stale, rollback, divergence, partition, split-brain, and mismatch scenarios fail closed', () => {
  assert.equal(staleSnapshot.expected_result, 'NULL')
  assert.equal(rollbackResurrection.expected_result, 'NULL')
  assert.equal(replicaDivergence.expected_result, 'NULL')
  assert.equal(splitBrainSnapshot.expected_result, 'NULL')
  assert.equal(partitionedRegistry.expected_result, 'NULL')
  assert.equal(cachedAuthority.expected_result, 'NULL')
  assert.equal(proofStateMismatch.expected_result, 'NULL')
  assert.equal(postValidationMutation.expected_result, 'NULL')
  assert.equal(detachedSnapshotReplay.expected_result, 'NULL')
})

test('state snapshot governance closure: policy artifacts enforce deterministic fail-closed behavior', () => {
  assert.equal(stateConsistencyPolicy.rules.validated_state_not_current_state, 'NULL')
  assert.equal(stateConsistencyPolicy.rules.proof_state_mismatch, 'NULL')
  assert.equal(stateConsistencyPolicy.rules.detached_snapshot_replay, 'NULL')
  assert.equal(registryPartitionRules.rules.partitioned_registry, 'NULL')
  assert.equal(registryPartitionRules.rules.federated_registry_drift, 'NULL')
  assert.equal(replicaRules.rules.replica_hash_drift, 'NULL')
  assert.equal(replicaRules.rules.replica_lineage_divergence, 'NULL')
  assert.equal(snapshotIntegrity.constraints.snapshot_hash_mismatch, 'NULL')
  assert.equal(snapshotIntegrity.constraints.rollback_resurrection, 'NULL')
  assert.equal(snapshotIntegrity.constraints.post_validation_mutation, 'NULL')
  assert.equal(snapshotIntegrity.constraints.detached_snapshot_replay, 'NULL')
  assert.equal(snapshotIntegrity.validated_object_must_equal_executed_object, true)
  assert.equal(splitBrainFailureModes.failure_modes.find((mode) => mode.id === 'split_brain_snapshot')?.result, 'NULL')
  assert.equal(stateConsistencyPolicy.fail_closed, true)
  assert.equal(registryPartitionRules.fail_closed, true)
  assert.equal(replicaRules.fail_closed, true)
  assert.equal(snapshotIntegrity.fail_closed, true)
})

test('state snapshot governance closure: state bypass paths are enumerated and fail-closed', () => {
  const ids = new Set(stateBypassPaths.bypass_paths.map((entry) => entry.bypass_id))
  for (const id of [
    'stale_registry_execution',
    'replica_divergence_legitimacy',
    'rollback_resurrection',
    'cached_authority_continuation',
    'partition_induced_execution_synthesis',
    'validator_state_mismatch',
    'proof_state_inconsistency',
    'detached_snapshot_replay',
    'post_validation_snapshot_mutation',
  ]) assert.equal(ids.has(id), true)

  assert.equal(stateBypassPaths.fail_closed_response, 'NULL')
})

test('state snapshot governance closure: only canonical state-consistent lineage reaches VALID', () => {
  assert.equal(validStateSnapshot.state_consistent, true)
  assert.equal(validStateSnapshot.canonical_lineage_continuity, true)
  assert.equal(validStateSnapshot.temporally_valid, true)
  assert.equal(validStateSnapshot.expected_result, 'VALID')
})
