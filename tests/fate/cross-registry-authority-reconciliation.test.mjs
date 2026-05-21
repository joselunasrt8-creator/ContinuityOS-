import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileCrossRegistryAuthority, AUTHORITY_DISAGREEMENT_CLASSES } from '../../runtime/cross_registry_authority_reconciliation.mjs'

const base = {
  decision_id: 'd1', continuity_id: 'c1', lineage_parent: 'p1', lineage_root: 'r1', authority_timestamp: '2026-01-01T00:00:00.000Z', replay_state: 'FRESH'
}

test('revoked authority in one registry only collapses to NULL', () => {
  const out = reconcileCrossRegistryAuthority({ registries: [{ ...base, authority_status: 'AUTHORIZED' }, { ...base, registry_id: 'b', authority_status: 'REVOKED' }], expectedContinuityId: 'c1' })
  assert.equal(out.status, 'DRIFT')
  assert.equal(out.canonical_outcome, 'NULL')
  assert.ok(out.issues.some((i) => i.class === AUTHORITY_DISAGREEMENT_CLASSES.STATE_DISAGREEMENT))
})

test('stale authority replay across registries is DRIFT', () => {
  const out = reconcileCrossRegistryAuthority({ registries: [{ ...base, authority_status: 'AUTHORIZED' }, { ...base, registry_id: 'b', authority_status: 'STALE', replay_state: 'REPLAYED' }] })
  assert.equal(out.status, 'DRIFT')
  assert.ok(out.issues.some((i) => i.class === AUTHORITY_DISAGREEMENT_CLASSES.STALE_REPLAY))
})

test('conflicting authority timestamps classified as temporal divergence', () => {
  const out = reconcileCrossRegistryAuthority({ registries: [{ ...base, authority_status: 'AUTHORIZED' }, { ...base, registry_id: 'b', authority_status: 'AUTHORIZED', authority_timestamp: '2026-01-01T00:00:01.000Z' }] })
  assert.ok(out.issues.some((i) => i.class === AUTHORITY_DISAGREEMENT_CLASSES.TEMPORAL_DIVERGENCE))
})

test('replay after federated revoke collapses fail-closed', () => {
  const out = reconcileCrossRegistryAuthority({ registries: [{ ...base, authority_status: 'REVOKED' }, { ...base, registry_id: 'b', authority_status: 'AUTHORIZED', replay_state: 'REPLAYED' }] })
  assert.equal(out.executable_legitimacy, 'NULL')
  assert.equal(out.fail_closed, true)
})

test('detached authority lineage classified deterministically', () => {
  const out = reconcileCrossRegistryAuthority({ registries: [{ ...base, authority_status: 'AUTHORIZED', lineage_parent: '' }, { ...base, registry_id: 'b', authority_status: 'AUTHORIZED' }] })
  assert.ok(out.issues.some((i) => i.class === AUTHORITY_DISAGREEMENT_CLASSES.DETACHED_LINEAGE))
})

test('continuity mismatch across registries collapses to NULL', () => {
  const out = reconcileCrossRegistryAuthority({ registries: [{ ...base, authority_status: 'AUTHORIZED', continuity_id: 'c1' }, { ...base, registry_id: 'b', authority_status: 'AUTHORIZED', continuity_id: 'c2' }], expectedContinuityId: 'c1' })
  assert.ok(out.issues.some((i) => i.class === AUTHORITY_DISAGREEMENT_CLASSES.CONTINUITY_MISMATCH))
  assert.equal(out.canonical_outcome, 'NULL')
})

test('authority ambiguity collapse for lineage root disagreements', () => {
  const out = reconcileCrossRegistryAuthority({ registries: [{ ...base, authority_status: 'AUTHORIZED', lineage_root: 'r1' }, { ...base, registry_id: 'b', authority_status: 'AUTHORIZED', lineage_root: 'r2' }] })
  assert.ok(out.issues.some((i) => i.class === AUTHORITY_DISAGREEMENT_CLASSES.AMBIGUOUS_LINEAGE))
})

test('canonical replay reconstruction under agreement passes', () => {
  const out = reconcileCrossRegistryAuthority({ registries: [{ ...base, authority_status: 'AUTHORIZED' }, { ...base, registry_id: 'b', authority_status: 'AUTHORIZED' }], expectedContinuityId: 'c1' })
  assert.equal(out.status, 'PASS')
  assert.equal(out.canonical_outcome, 'REGISTRY_CONSENSUS')
  assert.equal(out.executable_legitimacy, 'EXECUTABLE')
})
