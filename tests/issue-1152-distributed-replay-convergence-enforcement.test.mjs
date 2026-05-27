import test from 'node:test'
import assert from 'node:assert/strict'

import {
  enforceDistributedReplayConvergence,
  buildEnforcementId,
  AUTHORITATIVE_REGISTRY_TYPES,
  DISTRIBUTED_CONVERGENCE_REGISTRY_TYPES,
  RECONCILIATION_REGISTRY_TYPES,
  creates_authority,
  creates_execution,
} from '../src/lib/distributed-replay-convergence-enforcement.ts'

// Baseline safe evidence domain — all conditions satisfied
function safeEvidence(overrides = {}) {
  return {
    nonce_lineage: ['nl-1'],
    proof_ancestry: ['pa-1'],
    continuity_lineage: ['cl-1'],
    topology_visible: true,
    causal_ordering: [1, 2, 3],
    reconciliation_freshness_ms: 1000,
    partition_status: 'healed',
    ...overrides,
  }
}

function safeInput(overrides = {}) {
  return {
    enforcement_id: 'enf-1',
    nonce: 'n-1',
    evidence: safeEvidence(),
    local_consumed: false,
    remote_consumed: false,
    prior_convergence_state: null,
    execution_boundary_check: null,
    ...overrides,
  }
}

// ── Section 3: Compound predicate — golden path ───────────────────────────────

test('Issue #1152 enforcement: REPLAY_SAFE satisfies compound predicate', () => {
  const result = enforceDistributedReplayConvergence(safeInput())
  assert.equal(result.classification, 'REPLAY_SAFE')
  assert.equal(result.compound_predicate_satisfied, true)
  assert.deepEqual(result.violated_rules, [])
  assert.equal(result.topology_relative_certainty, true)
  assert.equal(result.lineage_continuity_satisfied, true)
  assert.equal(result.execution_boundary_integrity, 'NOT_CHECKED')
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.violated_rules))
})

test('Issue #1152 enforcement: REPLAY_CONSUMED classification', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ local_consumed: true, remote_consumed: true }),
  )
  assert.equal(result.classification, 'REPLAY_CONSUMED')
  assert.equal(result.compound_predicate_satisfied, false)
  assert.deepEqual(result.violated_rules, [])
  assert.equal(result.creates_authority, false)
})

// ── Rule 1: Replay ambiguity fails closed ─────────────────────────────────────

test('Issue #1152 enforcement Rule 1: local/remote divergence with topology → REPLAY_DIVERGENT', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ local_consumed: true, remote_consumed: false }),
  )
  assert.equal(result.classification, 'REPLAY_DIVERGENT')
  assert.equal(result.compound_predicate_satisfied, false)
  assert.ok(result.violated_rules.includes('rule_1_replay_ambiguity'))
})

test('Issue #1152 enforcement Rule 1: remote consumed, local not → REPLAY_DIVERGENT', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ local_consumed: false, remote_consumed: true }),
  )
  assert.equal(result.classification, 'REPLAY_DIVERGENT')
  assert.ok(result.violated_rules.includes('rule_1_replay_ambiguity'))
})

// ── Rule 2: Replay visibility is topology-relative ────────────────────────────

test('Issue #1152 enforcement Rule 2: no topology visibility → REPLAY_PARTITION_SUSPENDED', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ evidence: safeEvidence({ topology_visible: false }) }),
  )
  assert.equal(result.classification, 'REPLAY_PARTITION_SUSPENDED')
  assert.equal(result.compound_predicate_satisfied, false)
  assert.equal(result.topology_relative_certainty, false)
  assert.ok(result.violated_rules.includes('rule_2_topology_relative_visibility'))
})

test('Issue #1152 enforcement Rule 2: topology absent does not trigger Rule 1 ambiguity', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      local_consumed: true,
      remote_consumed: false,
      evidence: safeEvidence({ topology_visible: false }),
    }),
  )
  // Rule 1 only triggers on visible topology; hidden divergence is covered by Rule 2
  assert.equal(result.classification, 'REPLAY_PARTITION_SUSPENDED')
  assert.ok(!result.violated_rules.includes('rule_1_replay_ambiguity'))
  assert.ok(result.violated_rules.includes('rule_2_topology_relative_visibility'))
})

// ── Rule 3: Replay consumption is irreversible ────────────────────────────────

test('Issue #1152 enforcement Rule 3: CONSUMED → local appears unused → NULL', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      local_consumed: false,
      remote_consumed: true,
      prior_convergence_state: 'REPLAY_CONSUMED',
    }),
  )
  assert.equal(result.classification, 'NULL')
  assert.equal(result.compound_predicate_satisfied, false)
  assert.ok(result.violated_rules.includes('rule_3_consumption_irreversibility'))
})

test('Issue #1152 enforcement Rule 3: CONSUMED → both appear unused → NULL', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      local_consumed: false,
      remote_consumed: false,
      prior_convergence_state: 'REPLAY_CONSUMED',
    }),
  )
  assert.equal(result.classification, 'NULL')
  assert.ok(result.violated_rules.includes('rule_3_consumption_irreversibility'))
})

test('Issue #1152 enforcement Rule 3: CONSUMED → both remain consumed → no violation', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      local_consumed: true,
      remote_consumed: true,
      prior_convergence_state: 'REPLAY_CONSUMED',
    }),
  )
  assert.equal(result.classification, 'REPLAY_CONSUMED')
  assert.ok(!result.violated_rules.includes('rule_3_consumption_irreversibility'))
})

// ── Rule 4: Replay resurrection is illegitimate ───────────────────────────────

test('Issue #1152 enforcement Rule 4: CONSUMED prior + healed partition + safe reading → NULL', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      local_consumed: false,
      remote_consumed: false,
      prior_convergence_state: 'REPLAY_CONSUMED',
      evidence: safeEvidence({ partition_status: 'healed' }),
    }),
  )
  assert.equal(result.classification, 'NULL')
  assert.ok(result.violated_rules.includes('rule_4_replay_resurrection'))
})

test('Issue #1152 enforcement Rule 4: CONSUMED prior + active partition → resurrection still blocked', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      local_consumed: true,
      remote_consumed: false,
      prior_convergence_state: 'REPLAY_CONSUMED',
      evidence: safeEvidence({ partition_status: 'active' }),
    }),
  )
  // irreversibility is violated (remote_consumed=false with prior CONSUMED)
  assert.equal(result.classification, 'NULL')
  assert.ok(result.violated_rules.includes('rule_3_consumption_irreversibility'))
})

test('Issue #1152 enforcement Rule 4: null prior state does not trigger resurrection', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      local_consumed: false,
      remote_consumed: false,
      prior_convergence_state: null,
      evidence: safeEvidence({ partition_status: 'healed' }),
    }),
  )
  assert.equal(result.classification, 'REPLAY_SAFE')
  assert.ok(!result.violated_rules.includes('rule_4_replay_resurrection'))
})

// ── Rule 5: Replay determination requires lineage continuity ──────────────────

test('Issue #1152 enforcement Rule 5: empty nonce_lineage → NULL', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ evidence: safeEvidence({ nonce_lineage: [] }) }),
  )
  assert.equal(result.classification, 'NULL')
  assert.equal(result.lineage_continuity_satisfied, false)
  assert.ok(result.violated_rules.includes('rule_5_detached_lineage'))
})

test('Issue #1152 enforcement Rule 5: empty continuity_lineage → NULL', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ evidence: safeEvidence({ continuity_lineage: [] }) }),
  )
  assert.equal(result.classification, 'NULL')
  assert.equal(result.lineage_continuity_satisfied, false)
  assert.ok(result.violated_rules.includes('rule_5_detached_lineage'))
})

test('Issue #1152 enforcement Rule 5: both lineages present → continuity satisfied', () => {
  const result = enforceDistributedReplayConvergence(safeInput())
  assert.equal(result.lineage_continuity_satisfied, true)
  assert.ok(!result.violated_rules.includes('rule_5_detached_lineage'))
})

// ── Section 6: Causal replay ordering ────────────────────────────────────────

test('Issue #1152 enforcement Section 6: empty causal_ordering is invalid', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ evidence: safeEvidence({ causal_ordering: [] }) }),
  )
  assert.ok(result.violated_rules.includes('section_6_invalid_causal_ordering'))
  assert.equal(result.compound_predicate_satisfied, false)
})

test('Issue #1152 enforcement Section 6: negative causal index is invalid', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ evidence: safeEvidence({ causal_ordering: [1, -1, 3] }) }),
  )
  assert.ok(result.violated_rules.includes('section_6_invalid_causal_ordering'))
})

test('Issue #1152 enforcement Section 6: valid causal ordering passes', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ evidence: safeEvidence({ causal_ordering: [0, 5, 10] }) }),
  )
  assert.ok(!result.violated_rules.includes('section_6_invalid_causal_ordering'))
})

// ── Section 11: Execution boundary ───────────────────────────────────────────

test('Issue #1152 enforcement Section 11: matching lineage hashes → VALID', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      execution_boundary_check: {
        validated_replay_lineage_hash: 'abc123',
        executed_replay_lineage_hash: 'abc123',
      },
    }),
  )
  assert.equal(result.execution_boundary_integrity, 'VALID')
  assert.ok(!result.violated_rules.includes('section_11_execution_boundary_mutation'))
  assert.equal(result.compound_predicate_satisfied, true)
})

test('Issue #1152 enforcement Section 11: mismatched lineage hashes → NULL', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      execution_boundary_check: {
        validated_replay_lineage_hash: 'abc123',
        executed_replay_lineage_hash: 'def456',
      },
    }),
  )
  assert.equal(result.execution_boundary_integrity, 'NULL')
  assert.equal(result.classification, 'NULL')
  assert.ok(result.violated_rules.includes('section_11_execution_boundary_mutation'))
})

test('Issue #1152 enforcement Section 11: null check → NOT_CHECKED (does not block)', () => {
  const result = enforceDistributedReplayConvergence(safeInput({ execution_boundary_check: null }))
  assert.equal(result.execution_boundary_integrity, 'NOT_CHECKED')
})

// ── Staleness detection ───────────────────────────────────────────────────────

test('Issue #1152 enforcement: stale reconciliation evidence flagged', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({ evidence: safeEvidence({ reconciliation_freshness_ms: 120_000 }) }),
  )
  assert.equal(result.reconciliation_stale, true)
  assert.ok(result.violated_rules.includes('stale_reconciliation_evidence'))
  assert.equal(result.compound_predicate_satisfied, false)
})

test('Issue #1152 enforcement: custom staleness threshold respected', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      evidence: safeEvidence({ reconciliation_freshness_ms: 5_000 }),
      staleness_threshold_ms: 3_000,
    }),
  )
  assert.equal(result.reconciliation_stale, true)
  assert.ok(result.violated_rules.includes('stale_reconciliation_evidence'))
})

test('Issue #1152 enforcement: fresh reconciliation passes threshold', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      evidence: safeEvidence({ reconciliation_freshness_ms: 1_000 }),
      staleness_threshold_ms: 60_000,
    }),
  )
  assert.equal(result.reconciliation_stale, false)
  assert.ok(!result.violated_rules.includes('stale_reconciliation_evidence'))
})

// ── Section 8: Registry taxonomy ─────────────────────────────────────────────

test('Issue #1152 enforcement: registry taxonomy constants are frozen and correct', () => {
  assert.ok(Object.isFrozen(AUTHORITATIVE_REGISTRY_TYPES))
  assert.ok(Object.isFrozen(DISTRIBUTED_CONVERGENCE_REGISTRY_TYPES))
  assert.ok(Object.isFrozen(RECONCILIATION_REGISTRY_TYPES))

  assert.ok(AUTHORITATIVE_REGISTRY_TYPES.includes('replay_registry'))
  assert.ok(AUTHORITATIVE_REGISTRY_TYPES.includes('execution_registry'))
  assert.ok(AUTHORITATIVE_REGISTRY_TYPES.includes('proof_registry'))
  assert.ok(AUTHORITATIVE_REGISTRY_TYPES.includes('continuity_registry'))

  assert.ok(DISTRIBUTED_CONVERGENCE_REGISTRY_TYPES.includes('replay_convergence_registry'))
  assert.ok(DISTRIBUTED_CONVERGENCE_REGISTRY_TYPES.includes('replay_divergence_registry'))
  assert.ok(DISTRIBUTED_CONVERGENCE_REGISTRY_TYPES.includes('partition_visibility_registry'))
  assert.ok(DISTRIBUTED_CONVERGENCE_REGISTRY_TYPES.includes('causal_order_registry'))

  assert.ok(RECONCILIATION_REGISTRY_TYPES.includes('cross_registry_reconciliation_registry'))
  assert.ok(RECONCILIATION_REGISTRY_TYPES.includes('reconciliation_closure_registry'))
})

// ── No-authority invariants ───────────────────────────────────────────────────

test('Issue #1152 enforcement: creates_authority and creates_execution are always false', () => {
  assert.equal(creates_authority, false)
  assert.equal(creates_execution, false)

  const safe = enforceDistributedReplayConvergence(safeInput())
  const consumed = enforceDistributedReplayConvergence(
    safeInput({ local_consumed: true, remote_consumed: true }),
  )
  const nullResult = enforceDistributedReplayConvergence(
    safeInput({ evidence: safeEvidence({ nonce_lineage: [] }) }),
  )
  for (const r of [safe, consumed, nullResult]) {
    assert.equal(r.creates_authority, false)
    assert.equal(r.creates_execution, false)
  }
})

// ── buildEnforcementId ────────────────────────────────────────────────────────

test('Issue #1152 enforcement: buildEnforcementId is deterministic and prefixed', () => {
  const id1 = buildEnforcementId('nonce-abc', 'enf-1')
  const id2 = buildEnforcementId('nonce-abc', 'enf-1')
  const id3 = buildEnforcementId('nonce-xyz', 'enf-1')
  assert.equal(id1, id2)
  assert.notEqual(id1, id3)
  assert.ok(id1.startsWith('drc_'))
})

// ── Violated rules are deterministically sorted ───────────────────────────────

test('Issue #1152 enforcement: violated_rules are sorted for determinism', () => {
  const result = enforceDistributedReplayConvergence(
    safeInput({
      local_consumed: false,
      remote_consumed: false,
      prior_convergence_state: 'REPLAY_CONSUMED',
      evidence: safeEvidence({ topology_visible: false, nonce_lineage: [], causal_ordering: [] }),
    }),
  )
  const rules = [...result.violated_rules]
  const sorted = [...rules].sort()
  assert.deepEqual(rules, sorted)
  assert.ok(rules.length > 1)
})
