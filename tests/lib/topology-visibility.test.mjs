import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTopologySnapshotHash,
  buildTopologySnapshotId,
  classifyTopologyVisibility,
  validateTopologySnapshot,
  topologyVisibilityToFinalityGuard,
  topologyVisibilityToFinalityClassification,
  topologyEvidenceFlags,
  creates_authority,
  creates_execution,
} from '../../src/lib/topology-visibility.ts';

test('creates_authority and creates_execution are false — evidence-only', () => {
  assert.equal(creates_authority, false);
  assert.equal(creates_execution, false);
});

test('buildTopologySnapshotHash is deterministic and order-independent', () => {
  const opts = {
    observed_nodes: ['node-b', 'node-a'],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    epoch_id: 'epoch-1',
    observed_at: '2026-01-01T00:00:00Z',
  };
  const hash1 = buildTopologySnapshotHash(opts);
  const hash2 = buildTopologySnapshotHash({ ...opts, observed_nodes: ['node-a', 'node-b'] });
  assert.equal(hash1, hash2);
  assert.equal(typeof hash1, 'string');
  assert.ok(hash1.length > 0);
});

test('buildTopologySnapshotId is deterministic', () => {
  const id1 = buildTopologySnapshotId('hash-abc', 'epoch-1');
  const id2 = buildTopologySnapshotId('hash-abc', 'epoch-1');
  assert.equal(id1, id2);
  assert.ok(id1.startsWith('tsn_'));
});

function makeSnapshot(overrides = {}) {
  return {
    topology_snapshot_id: 'tsn_test',
    topology_snapshot_hash: 'hash-test',
    observed_nodes: ['node-1', 'node-2'],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    observed_at: '2026-01-01T00:00:00Z',
    epoch_id: 'epoch-1',
    visibility_classification: 'TOPOLOGY_VISIBLE',
    creates_authority: false,
    creates_execution: false,
    raw_production_apply_path: 'DENIED',
    ...overrides,
  };
}

test('classifyTopologyVisibility — null snapshot yields TOPOLOGY_NULL + blocking', () => {
  const result = classifyTopologyVisibility(null);
  assert.equal(result.topology_visibility, 'TOPOLOGY_NULL');
  assert.equal(result.finality_guard, false);
  assert.equal(result.classification, 'BLOCKING');
  assert.equal(result.creates_authority, false);
  assert.equal(result.creates_execution, false);
});

test('classifyTopologyVisibility — TOPOLOGY_NULL classification propagates', () => {
  const snapshot = makeSnapshot({ visibility_classification: 'TOPOLOGY_NULL' });
  const result = classifyTopologyVisibility(snapshot);
  assert.equal(result.topology_visibility, 'TOPOLOGY_NULL');
  assert.equal(result.finality_guard, false);
});

test('classifyTopologyVisibility — no observed nodes yields TOPOLOGY_INVISIBLE', () => {
  const snapshot = makeSnapshot({ observed_nodes: [], visibility_classification: 'TOPOLOGY_INVISIBLE' });
  const result = classifyTopologyVisibility(snapshot);
  assert.equal(result.topology_visibility, 'TOPOLOGY_INVISIBLE');
  assert.equal(result.finality_guard, false);
  assert.equal(result.classification, 'BLOCKING');
});

test('classifyTopologyVisibility — stale nodes yields TOPOLOGY_STALE + DEGRADED', () => {
  const snapshot = makeSnapshot({ stale_nodes: ['node-3'], visibility_classification: 'TOPOLOGY_STALE' });
  const result = classifyTopologyVisibility(snapshot);
  assert.equal(result.topology_visibility, 'TOPOLOGY_STALE');
  assert.equal(result.finality_guard, false);
  assert.equal(result.classification, 'DEGRADED');
});

test('classifyTopologyVisibility — partitioned nodes yields TOPOLOGY_AMBIGUOUS', () => {
  const snapshot = makeSnapshot({ partitioned_nodes: ['node-4'], visibility_classification: 'TOPOLOGY_AMBIGUOUS' });
  const result = classifyTopologyVisibility(snapshot);
  assert.equal(result.topology_visibility, 'TOPOLOGY_AMBIGUOUS');
  assert.equal(result.finality_guard, false);
  assert.equal(result.classification, 'BLOCKING');
});

test('classifyTopologyVisibility — missing nodes yields TOPOLOGY_PARTIAL', () => {
  const snapshot = makeSnapshot({ missing_nodes: ['node-5'], visibility_classification: 'TOPOLOGY_PARTIAL' });
  const result = classifyTopologyVisibility(snapshot);
  assert.equal(result.topology_visibility, 'TOPOLOGY_PARTIAL');
  assert.equal(result.finality_guard, false);
  assert.equal(result.classification, 'BLOCKING');
});

test('classifyTopologyVisibility — all clear yields TOPOLOGY_VISIBLE + finality_guard=true', () => {
  const snapshot = makeSnapshot();
  const result = classifyTopologyVisibility(snapshot);
  assert.equal(result.topology_visibility, 'TOPOLOGY_VISIBLE');
  assert.equal(result.finality_guard, true);
  assert.equal(result.classification, 'VISIBLE');
});

test('validateTopologySnapshot — valid snapshot returns null', () => {
  const snapshot = {
    topology_snapshot_hash: 'hash-123',
    observed_nodes: ['node-1'],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    epoch_id: 'epoch-1',
    observed_at: '2026-01-01T00:00:00Z',
  };
  assert.equal(validateTopologySnapshot(snapshot), null);
});

test('validateTopologySnapshot — null input returns error', () => {
  assert.ok(validateTopologySnapshot(null) !== null);
  assert.ok(validateTopologySnapshot(undefined) !== null);
});

test('validateTopologySnapshot — missing topology_snapshot_hash returns error', () => {
  const snapshot = {
    observed_nodes: [],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    epoch_id: 'epoch-1',
    observed_at: '2026-01-01T00:00:00Z',
  };
  assert.ok(validateTopologySnapshot(snapshot) !== null);
});

test('validateTopologySnapshot — non-array observed_nodes returns error', () => {
  const snapshot = {
    topology_snapshot_hash: 'hash-123',
    observed_nodes: 'not-array',
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    epoch_id: 'epoch-1',
    observed_at: '2026-01-01T00:00:00Z',
  };
  assert.ok(validateTopologySnapshot(snapshot) !== null);
});

test('validateTopologySnapshot — missing epoch_id returns error', () => {
  const snapshot = {
    topology_snapshot_hash: 'hash-123',
    observed_nodes: [],
    missing_nodes: [],
    stale_nodes: [],
    partitioned_nodes: [],
    observed_at: '2026-01-01T00:00:00Z',
  };
  assert.ok(validateTopologySnapshot(snapshot) !== null);
});

test('topologyVisibilityToFinalityGuard — only TOPOLOGY_VISIBLE yields true', () => {
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_VISIBLE'), true);
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_PARTIAL'), false);
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_STALE'), false);
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_INVISIBLE'), false);
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_AMBIGUOUS'), false);
  assert.equal(topologyVisibilityToFinalityGuard('TOPOLOGY_NULL'), false);
});

test('topologyVisibilityToFinalityClassification — maps non-visible states', () => {
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_VISIBLE'), null);
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_PARTIAL'), 'PARTITION_SUSPENDED');
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_STALE'), 'STALE_VISIBLE');
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_INVISIBLE'), 'NULL');
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_AMBIGUOUS'), 'AMBIGUOUS');
  assert.equal(topologyVisibilityToFinalityClassification('TOPOLOGY_NULL'), 'NULL');
});

test('topologyEvidenceFlags — VISIBLE result yields is_topology_visible=1', () => {
  const result = {
    topology_visibility: 'TOPOLOGY_VISIBLE',
    finality_guard: true,
    classification: 'VISIBLE',
    missing_nodes: [],
    stale_nodes: [],
    creates_authority: false,
    creates_execution: false,
  };
  const flags = topologyEvidenceFlags(result);
  assert.equal(flags.is_topology_visible, 1);
  assert.equal(flags.topology_visibility, 'TOPOLOGY_VISIBLE');
  assert.equal(flags.creates_authority, false);
  assert.equal(flags.creates_execution, false);
});

test('topologyEvidenceFlags — non-VISIBLE result yields is_topology_visible=0', () => {
  const result = {
    topology_visibility: 'TOPOLOGY_PARTIAL',
    finality_guard: false,
    classification: 'BLOCKING',
    missing_nodes: ['node-x'],
    stale_nodes: [],
    creates_authority: false,
    creates_execution: false,
  };
  const flags = topologyEvidenceFlags(result);
  assert.equal(flags.is_topology_visible, 0);
});
