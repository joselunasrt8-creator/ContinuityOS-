import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import {
  LEGITIMACY_TELEMETRY_METRICS,
  generateLegitimacyTelemetrySnapshot,
} from '../src/legitimacy-telemetry.ts'

const events = [
  { event_type: 'governed_execution', surface_id: 'execute', dependency_id: 'dep-a', authority_scope: 'authority-core' },
  { event_type: 'validated_execution', surface_id: 'validate', dependency_id: 'dep-a', authority_scope: 'authority-core' },
  { event_type: 'replay_rejection', surface_id: 'execute', dependency_id: 'dep-replay' },
  { event_type: 'proof_generated', surface_id: 'proof', dependency_id: 'dep-proof' },
  { event_type: 'continuity_revocation', surface_id: 'continuity', dependency_id: 'dep-revoke' },
  { event_type: 'reconciliation_failure', surface_id: 'compile', dependency_id: 'dep-recon' },
  { event_type: 'distributed_disagreement', surface_id: 'compile', dependency_id: 'dep-recon' },
  { event_type: 'topology_drift', surface_id: 'hidden-surface', dependency_id: 'dep-topo' },
  { event_type: 'replay_resurrection', surface_id: 'execute', dependency_id: 'dep-replay' },
  { event_type: 'causal_divergence', surface_id: 'validate', dependency_id: 'dep-temporal' },
  { event_type: 'split_brain', surface_id: 'authority', dependency_id: 'dep-authority' },
  { event_type: 'unknown_surface', surface_id: 'surface-x', dependency_id: 'dep-unknown' },
]

test('Issue #1161: deterministic metric ordering and inventories', () => {
  const snapshot = generateLegitimacyTelemetrySnapshot({ telemetry_id: 'telemetry-1161', evidence_only: true, events: [...events].reverse() })
  assert.deepEqual(snapshot.deterministic_metric_order, LEGITIMACY_TELEMETRY_METRICS)
  assert.deepEqual(snapshot.dependency_concentration_inventory, ['dep-a', 'dep-authority', 'dep-proof', 'dep-recon', 'dep-replay', 'dep-revoke', 'dep-temporal', 'dep-topo', 'dep-unknown'])
  assert.deepEqual(snapshot.governance_density_inventory, ['authority', 'compile', 'continuity', 'execute', 'hidden-surface', 'proof', 'surface-x', 'validate'])
})

test('Issue #1161: required metric fixtures are counted', () => {
  const snapshot = generateLegitimacyTelemetrySnapshot({ telemetry_id: 'telemetry-1161', evidence_only: true, events })
  assert.equal(snapshot.metric_registry.governed_execution_total, 1)
  assert.equal(snapshot.metric_registry.validated_execution_total, 1)
  assert.equal(snapshot.metric_registry.replay_rejection_total, 1)
  assert.equal(snapshot.metric_registry.proof_generated_total, 1)
  assert.equal(snapshot.metric_registry.continuity_revocation_total, 1)
  assert.equal(snapshot.metric_registry.reconciliation_failure_total, 1)
  assert.equal(snapshot.metric_registry.distributed_disagreement_total, 1)
  assert.equal(snapshot.metric_registry.topology_drift_total, 1)
  assert.equal(snapshot.metric_registry.replay_resurrection_total, 1)
  assert.equal(snapshot.metric_registry.causal_divergence_total, 1)
  assert.equal(snapshot.metric_registry.split_brain_total, 1)
  assert.equal(snapshot.metric_registry.unknown_surface_total, 1)
})

test('Issue #1161: replay/reconciliation/topology/split-brain inventories', () => {
  const snapshot = generateLegitimacyTelemetrySnapshot({ telemetry_id: 'telemetry-1161', evidence_only: true, events })
  assert.deepEqual(snapshot.replay_rejection_inventory, ['dep-replay'])
  assert.deepEqual(snapshot.reconciliation_divergence_inventory, ['dep-recon'])
  assert.deepEqual(snapshot.topology_drift_inventory, ['hidden-surface', 'surface-x'])
  assert.equal(snapshot.classification, 'UNKNOWN_SURFACE')
})

test('Issue #1161: canonical hashing verification and frozen output verification', () => {
  const snapshot = generateLegitimacyTelemetrySnapshot({ telemetry_id: 'telemetry-1161', evidence_only: true, events })
  const { canonical_hash, ...unsigned } = snapshot
  assert.equal(canonical_hash, sha256Hex(canonicalize(unsigned)))
  assert.ok(Object.isFrozen(snapshot))
  assert.ok(Object.isFrozen(snapshot.metric_registry))
})

test('Issue #1161: no authority and no mutation semantics verification', () => {
  const snapshot = generateLegitimacyTelemetrySnapshot({ telemetry_id: 'telemetry-1161', evidence_only: true, events })
  assert.equal(snapshot.evidence_only, true)
  assert.equal(snapshot.creates_authority, false)
  assert.equal(snapshot.validates_execution, false)
  assert.equal(snapshot.mutates_state, false)
})
