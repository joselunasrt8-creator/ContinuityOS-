import test from 'node:test'
import assert from 'node:assert/strict'

import { reconcileCrossRegistryLegitimacy } from '../src/cross-registry-legitimacy-reconciliation.ts'
import { reconcileCrossRegistryAuthority } from '../runtime/cross_registry_authority_reconciliation.mjs'
import {
  reconcileFederatedLegitimacy,
  classifyFederatedReconciliation,
} from '../src/runtime/federation/reconcileFederatedLegitimacy.ts'

function entry(overrides = {}) {
  return {
    object_id: 'obj-1',
    parent_object_id: null,
    lineage_hash: 'lineage-1',
    replay_hash: 'replay-1',
    revocation_hash: 'revocation-1',
    topology_hash: 'topology-1',
    observed_at: '2026-06-02T00:00:00.000Z',
    ...overrides,
  }
}

function view(registryId, overrides = {}) {
  return {
    registry_id: registryId,
    visibility_complete: true,
    registry_epoch: 1,
    entries: [entry()],
    ...overrides,
  }
}

const authorityBase = {
  decision_id: 'decision-1547',
  continuity_id: 'continuity-1547',
  lineage_parent: 'parent-1547',
  lineage_root: 'root-1547',
  authority_timestamp: '2026-06-02T00:00:00.000Z',
  replay_state: 'FRESH',
}

test('Issue #1547: deterministic classification matrix is MATCH, DRIFT, AMBIGUOUS, INSUFFICIENT_EVIDENCE', () => {
  const match = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'issue-1547-match',
    evidence_only: true,
    views: [view('registry-b'), view('registry-a')],
  })
  assert.equal(match.classification, 'MATCH')
  assert.equal(match.equivalent, true)
  assert.equal(match.legitimacy, 'NULL')
  assert.equal(match.creates_authority, false)

  const drift = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'issue-1547-drift',
    evidence_only: true,
    views: [
      view('registry-a', { entries: [entry({ object_id: 'child', parent_object_id: 'missing-parent' })] }),
      view('registry-b', { entries: [entry({ object_id: 'child', parent_object_id: 'missing-parent' })] }),
    ],
  })
  assert.equal(drift.classification, 'DRIFT')
  assert.equal(drift.equivalent, false)
  assert.equal(drift.legitimacy, 'NULL')

  const ambiguous = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'issue-1547-ambiguous',
    evidence_only: true,
    views: [view('registry-a'), view('registry-b', { entries: [entry({ lineage_hash: 'lineage-2' })] })],
  })
  assert.equal(ambiguous.classification, 'AMBIGUOUS')
  assert.equal(ambiguous.equivalent, false)
  assert.equal(ambiguous.legitimacy, 'NULL')
  assert.ok(ambiguous.drift_classes.includes('lineage_divergence'))

  const insufficient = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'issue-1547-insufficient',
    evidence_only: true,
    views: [view('registry-a')],
  })
  assert.equal(insufficient.classification, 'INSUFFICIENT_EVIDENCE')
  assert.equal(insufficient.equivalent, false)
  assert.equal(insufficient.legitimacy, 'NULL')
  assert.ok(insufficient.drift_classes.includes('single_registry_observation'))
})

test('Issue #1547: divergent authority registries are AMBIGUOUS and cannot promote legitimacy VALID', () => {
  const out = reconcileCrossRegistryAuthority({
    registries: [
      { ...authorityBase, registry_id: 'registry-a', authority_status: 'AUTHORIZED' },
      { ...authorityBase, registry_id: 'registry-b', authority_status: 'REVOKED' },
    ],
    expectedContinuityId: 'continuity-1547',
  })

  assert.equal(out.classification, 'AMBIGUOUS')
  assert.equal(out.status, 'DRIFT')
  assert.equal(out.canonical_outcome, 'NULL')
  assert.equal(out.executable_legitimacy, 'NULL')
  assert.equal(out.legitimacy, 'NULL')
  assert.equal(out.fail_closed, true)
})

test('Issue #1547: partial registry visibility is INSUFFICIENT_EVIDENCE and fail-closed', () => {
  const legitimacy = reconcileCrossRegistryLegitimacy({
    reconciliation_id: 'issue-1547-partial',
    evidence_only: true,
    views: [view('registry-a', { visibility_complete: false }), view('registry-b')],
  })
  assert.equal(legitimacy.classification, 'INSUFFICIENT_EVIDENCE')
  assert.equal(legitimacy.equivalent, false)
  assert.equal(legitimacy.legitimacy, 'NULL')

  const authority = reconcileCrossRegistryAuthority({
    registries: [{ ...authorityBase, registry_id: 'registry-a', authority_status: 'AUTHORIZED' }],
    requiredRegistryCount: 2,
  })
  assert.equal(authority.classification, 'INSUFFICIENT_EVIDENCE')
  assert.equal(authority.canonical_outcome, 'NULL')
  assert.equal(authority.executable_legitimacy, 'NULL')
  assert.equal(authority.legitimacy, 'NULL')
  assert.equal(authority.fail_closed, true)
})

// ── Federated legitimacy reconciliation classification (Issue #1547 core) ────

// Shared snapshot builder. proof_root must equal lineage_root on the remote to
// avoid FEDERATION_ORPHAN_PROOF (which would elevate the outcome to NULL).
function node(id, trustOverrides = {}) {
  return {
    node_id: id,
    governance_version: 'v1',
    schema_version: '1.0',
    canonical_hash_algorithm: 'sha256',
    trust_classification: 'TRUSTED',
    federation_mode: 'OBSERVE_ONLY',
    ...trustOverrides,
  }
}

function snapshot(nodeId, rootOverrides = {}, trustOverrides = {}) {
  const lineage_root = rootOverrides.lineage_root ?? 'root-A'
  return {
    node: node(nodeId, trustOverrides),
    lineage_root,
    continuity_root: 'cont-A',
    proof_root: lineage_root, // self-anchored by default — avoids FEDERATION_ORPHAN_PROOF
    replay_root: 'replay-A',
    validation_root: 'val-A',
    topology_root: 'topo-A',
    ...rootOverrides,
    // Re-apply proof_root after rootOverrides so callers can override explicitly
    proof_root: rootOverrides.proof_root ?? lineage_root,
  }
}

test('Issue #1547: clean trusted nodes yield RECONCILED_DETERMINISTIC; equivalent is true', () => {
  const local = snapshot('local')
  const remote = snapshot('remote')
  const result = reconcileFederatedLegitimacy(local, remote)

  assert.equal(result.classification, 'RECONCILED_DETERMINISTIC')
  assert.equal(result.equivalent, true)
  assert.equal(result.drift_classes.length, 0)
  // Invariant: equivalent ↔ RECONCILED_DETERMINISTIC
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: proof divergence returns RECONCILIATION_REQUIRED, not RECONCILED_DETERMINISTIC', () => {
  const local = snapshot('local', { lineage_root: 'root-A' })
  // Remote has different lineage (and thus different self-anchored proof) — no orphan proof
  const remote = snapshot('remote', { lineage_root: 'root-B' })

  const result = reconcileFederatedLegitimacy(local, remote)

  assert.notEqual(result.classification, 'RECONCILED_DETERMINISTIC')
  assert.equal(result.classification, 'RECONCILIATION_REQUIRED')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('FEDERATION_PROOF_DIVERGENCE'))
  assert.ok(result.drift_classes.includes('FEDERATION_LINEAGE_DIVERGENCE'))
  // Invariant: equivalent ↔ RECONCILED_DETERMINISTIC
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: execution status divergence (replay root) returns RECONCILIATION_REQUIRED', () => {
  const local = snapshot('local')
  const remote = snapshot('remote', { replay_root: 'replay-B' })

  const result = reconcileFederatedLegitimacy(local, remote)

  assert.notEqual(result.classification, 'RECONCILED_DETERMINISTIC')
  assert.equal(result.classification, 'RECONCILIATION_REQUIRED')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('FEDERATION_REPLAY_DIVERGENCE'))
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: stale lineage returns RECONCILIATION_REQUIRED (fail-closed)', () => {
  // Stale lineage: lineage roots diverge; remote is self-consistent (proof anchored to its lineage)
  const local = snapshot('local', { lineage_root: 'root-current' })
  const remote = snapshot('remote', { lineage_root: 'root-stale' })

  const result = reconcileFederatedLegitimacy(local, remote)

  assert.notEqual(result.classification, 'RECONCILED_DETERMINISTIC')
  assert.equal(result.classification, 'RECONCILIATION_REQUIRED')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('FEDERATION_LINEAGE_DIVERGENCE'))
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: ambiguous registry state (UNKNOWN trust) returns AMBIGUOUS, cannot imply convergence', () => {
  const local = snapshot('local')
  const remote = snapshot('remote', {}, { trust_classification: 'UNKNOWN' })

  const result = reconcileFederatedLegitimacy(local, remote)

  assert.notEqual(result.classification, 'RECONCILED_DETERMINISTIC')
  assert.equal(result.classification, 'AMBIGUOUS')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('FEDERATION_UNKNOWN_NODE'))
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: partition-suspended state (UNTRUSTED node) returns PARTITION_SUSPENDED', () => {
  const local = snapshot('local')
  const remote = snapshot('remote', {}, { trust_classification: 'UNTRUSTED' })

  const result = reconcileFederatedLegitimacy(local, remote)

  assert.notEqual(result.classification, 'RECONCILED_DETERMINISTIC')
  assert.equal(result.classification, 'PARTITION_SUSPENDED')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('FEDERATION_UNTRUSTED_NODE'))
  // Partition-suspended must not produce execution eligibility
  assert.equal(result.flags.remote_execution_legitimacy, false)
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: local valid but remote divergent returns RECONCILIATION_REQUIRED', () => {
  // Local node is fully valid and trusted; remote has schema/validation divergence
  const local = snapshot('local')
  const remote = snapshot('remote', { validation_root: 'val-DIVERGENT' })

  const result = reconcileFederatedLegitimacy(local, remote)

  // Local validity does not imply global convergence
  assert.notEqual(result.classification, 'RECONCILED_DETERMINISTIC')
  assert.equal(result.classification, 'RECONCILIATION_REQUIRED')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('FEDERATION_SCHEMA_MISMATCH'))
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: non-canonical hash (irreconcilable input) returns NULL', () => {
  const local = snapshot('local')
  const remote = snapshot('remote', {}, { canonical_hash_algorithm: 'md5' })

  const result = reconcileFederatedLegitimacy(local, remote)

  assert.equal(result.classification, 'NULL')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('FEDERATION_NON_CANONICAL_HASH'))
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: orphan proof (irreconcilable proof tree) returns NULL', () => {
  // Remote proof_root differs from its own lineage_root — orphan proof
  const local = snapshot('local')
  const remote = snapshot('remote', {
    lineage_root: 'root-A',
    proof_root: 'detached-proof-X',  // does not anchor to remote lineage
  })

  const result = reconcileFederatedLegitimacy(local, remote)

  assert.equal(result.classification, 'NULL')
  assert.equal(result.equivalent, false)
  assert.ok(result.drift_classes.includes('FEDERATION_ORPHAN_PROOF'))
  assert.ok(result.orphan_proofs.includes('detached-proof-X'))
  assert.equal(result.equivalent, result.classification === 'RECONCILED_DETERMINISTIC')
})

test('Issue #1547: reconciliation is read-only and non-authoritative', () => {
  const local = snapshot('local')
  const remote = snapshot('remote')
  const result = reconcileFederatedLegitimacy(local, remote)

  // All reconciliation flags must be immutable and evidence-only
  assert.equal(result.flags.evidence_only, true)
  assert.equal(result.flags.read_only, true)
  assert.equal(result.flags.mutation_capable, false)
  assert.equal(result.flags.creates_authority, false)
  assert.equal(result.flags.creates_proof, false)
  assert.equal(result.flags.remote_execution_legitimacy, false)
})

test('Issue #1547: classifyFederatedReconciliation — all five outcomes are reachable and mutually exclusive', () => {
  const FederationDriftClass = /** @type {const} */ ({
    NON_CANONICAL_HASH: 'FEDERATION_NON_CANONICAL_HASH',
    ORPHAN_PROOF: 'FEDERATION_ORPHAN_PROOF',
    UNTRUSTED_NODE: 'FEDERATION_UNTRUSTED_NODE',
    UNKNOWN_NODE: 'FEDERATION_UNKNOWN_NODE',
    PROOF_DIVERGENCE: 'FEDERATION_PROOF_DIVERGENCE',
    LINEAGE_DIVERGENCE: 'FEDERATION_LINEAGE_DIVERGENCE',
    REPLAY_DIVERGENCE: 'FEDERATION_REPLAY_DIVERGENCE',
    TOPOLOGY_MISMATCH: 'FEDERATION_TOPOLOGY_MISMATCH',
    SCHEMA_MISMATCH: 'FEDERATION_SCHEMA_MISMATCH',
  })

  assert.equal(classifyFederatedReconciliation(new Set()), 'RECONCILED_DETERMINISTIC')

  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.NON_CANONICAL_HASH])),
    'NULL',
  )
  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.ORPHAN_PROOF])),
    'NULL',
  )
  // NULL takes priority over PARTITION_SUSPENDED
  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.NON_CANONICAL_HASH, FederationDriftClass.UNTRUSTED_NODE])),
    'NULL',
  )

  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.UNTRUSTED_NODE])),
    'PARTITION_SUSPENDED',
  )
  // PARTITION_SUSPENDED takes priority over AMBIGUOUS
  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.UNTRUSTED_NODE, FederationDriftClass.UNKNOWN_NODE])),
    'PARTITION_SUSPENDED',
  )

  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.UNKNOWN_NODE])),
    'AMBIGUOUS',
  )
  // AMBIGUOUS takes priority over RECONCILIATION_REQUIRED
  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.UNKNOWN_NODE, FederationDriftClass.PROOF_DIVERGENCE])),
    'AMBIGUOUS',
  )

  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.PROOF_DIVERGENCE])),
    'RECONCILIATION_REQUIRED',
  )
  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.LINEAGE_DIVERGENCE])),
    'RECONCILIATION_REQUIRED',
  )
  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.REPLAY_DIVERGENCE])),
    'RECONCILIATION_REQUIRED',
  )
  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.TOPOLOGY_MISMATCH])),
    'RECONCILIATION_REQUIRED',
  )
  assert.equal(
    classifyFederatedReconciliation(new Set([FederationDriftClass.SCHEMA_MISMATCH])),
    'RECONCILIATION_REQUIRED',
  )
})
