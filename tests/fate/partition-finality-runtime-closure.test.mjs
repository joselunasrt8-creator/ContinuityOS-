import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPartitionFinalityAdmission } from '../../src/lib/finality-classification.js'
import { sha256Hex, canonicalize } from '../../src/canonical.js'

const mk = (overrides = {}) => {
  const partition_epoch = 7
  const canonical_lineage_hash = 'ab'.repeat(32)
  return {
    partition_finality_state: 'PARTITION_SETTLED',
    partition_epoch,
    canonical_lineage_hash,
    partition_lineage_hash: canonical_lineage_hash,
    partition_closure_hash: sha256Hex(canonicalize({ partition_epoch, canonical_lineage_hash })),
    topology_visible: true,
    reconciliation_deterministic: true,
    reconciliation_ordering_deterministic: true,
    settlement_observed_at: new Date().toISOString(),
    freshness_window_ms: 60_000,
    ...overrides,
  }
}

test('partition unsettled + execute attempt -> NULL', () => {
  const r = classifyPartitionFinalityAdmission(mk({ partition_finality_state: 'PARTITION_PENDING_SETTLEMENT' }))
  assert.deepEqual(r, { ok: false, reason: 'partition_unsettled' })
})

test('divergent finality across partitions -> detached lineage + NULL', () => {
  const r = classifyPartitionFinalityAdmission(mk({ partition_lineage_hash: 'cd'.repeat(32) }))
  assert.deepEqual(r, { ok: false, reason: 'detached_lineage' })
})

test('settled partition with matching lineage hash -> VALID path', () => {
  const r = classifyPartitionFinalityAdmission(mk())
  assert.equal(r.ok, true)
})

test('stale partition settlement evidence -> NULL', () => {
  const stale = new Date(Date.now() - 120_000).toISOString()
  const r = classifyPartitionFinalityAdmission(mk({ settlement_observed_at: stale }))
  assert.deepEqual(r, { ok: false, reason: 'stale_partition_settlement_evidence' })
})

test('ambiguous reconciliation ordering -> NULL', () => {
  const r = classifyPartitionFinalityAdmission(mk({ reconciliation_ordering_deterministic: false }))
  assert.deepEqual(r, { ok: false, reason: 'ambiguous_partition_ordering' })
})

test('partition drift after validation -> NULL', () => {
  const r = classifyPartitionFinalityAdmission(mk({ partition_finality_state: 'PARTITION_DRIFT' }))
  assert.deepEqual(r, { ok: false, reason: 'partition_drift' })
})

test('detached partition lineage -> NULL', () => {
  const r = classifyPartitionFinalityAdmission(mk({ partition_lineage_hash: 'ef'.repeat(32) }))
  assert.deepEqual(r, { ok: false, reason: 'detached_lineage' })
})

test('proof admission with reconciled partition -> VALID path', () => {
  const r = classifyPartitionFinalityAdmission(mk({ partition_finality_state: 'PARTITION_RECONCILED' }))
  assert.deepEqual(r, { ok: true, state: 'PARTITION_RECONCILED' })
})
