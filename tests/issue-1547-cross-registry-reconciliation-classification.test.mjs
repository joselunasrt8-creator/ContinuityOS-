import test from 'node:test'
import assert from 'node:assert/strict'

import { reconcileCrossRegistryLegitimacy } from '../src/cross-registry-legitimacy-reconciliation.ts'
import { reconcileCrossRegistryAuthority } from '../runtime/cross_registry_authority_reconciliation.mjs'

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
