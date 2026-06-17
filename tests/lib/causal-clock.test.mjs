import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAUSAL_OBJECT_TYPE_ORDER,
  assignCausalIndex,
  happensBefore,
  buildCausalClockJson,
  parseCausalClockJson,
  buildCausalClockEntryId,
  causalIndexFromClockResult,
  detectCausalInversions,
  verifyCausalTypeOrder,
  creates_authority,
} from '../../src/lib/causal-clock.ts';

test('creates_authority is false — causal ordering is evidence-only', () => {
  assert.equal(creates_authority, false);
});

test('CAUSAL_OBJECT_TYPE_ORDER defines the canonical legitimacy chain', () => {
  assert.deepEqual(CAUSAL_OBJECT_TYPE_ORDER, [
    'session', 'continuity', 'authority', 'aeo', 'validation', 'execution', 'proof',
  ]);
});

test('assignCausalIndex — returns 1 for empty prior events', () => {
  assert.equal(assignCausalIndex([]), 1);
});

test('assignCausalIndex — returns max+1 for existing events', () => {
  const prior = [{ causal_index: 3 }, { causal_index: 7 }, { causal_index: 5 }];
  assert.equal(assignCausalIndex(prior), 8);
});

test('assignCausalIndex — single prior event', () => {
  assert.equal(assignCausalIndex([{ causal_index: 1 }]), 2);
});

test('happensBefore — direct parent relationship', () => {
  const a = {
    object_id: 'obj-a',
    object_type: 'session',
    causal_index: 1,
    parent_object_id: null,
    parent_causal_index: null,
    lineage_hash: 'hash-a',
    created_at: '2026-01-01T00:00:00Z',
  };
  const b = {
    object_id: 'obj-b',
    object_type: 'continuity',
    causal_index: 2,
    parent_object_id: 'obj-a',
    parent_causal_index: 1,
    lineage_hash: 'hash-b',
    created_at: '2026-01-01T00:00:01Z',
  };
  assert.equal(happensBefore(a, b), true);
  assert.equal(happensBefore(b, a), false);
});

test('happensBefore — causal index ordering', () => {
  const a = {
    object_id: 'obj-a',
    object_type: 'session',
    causal_index: 1,
    parent_object_id: null,
    parent_causal_index: null,
    lineage_hash: 'hash-a',
    created_at: '2026-01-01T00:00:00Z',
  };
  const b = {
    object_id: 'obj-b',
    object_type: 'authority',
    causal_index: 5,
    parent_object_id: 'obj-x',
    parent_causal_index: 3,
    lineage_hash: 'hash-b',
    created_at: '2026-01-01T00:00:05Z',
  };
  assert.equal(happensBefore(a, b), true);
});

test('buildCausalClockJson and parseCausalClockJson round-trip', () => {
  const entry = {
    object_id: 'obj-1',
    object_type: 'session',
    causal_index: 1,
    parent_object_id: null,
    parent_causal_index: null,
    lineage_hash: 'abc123',
    created_at: '2026-01-01T00:00:00Z',
  };

  const json = buildCausalClockJson(entry);
  const parsed = parseCausalClockJson(json);
  assert.equal(parsed.object_id, 'obj-1');
  assert.equal(parsed.object_type, 'session');
  assert.equal(parsed.causal_index, 1);
  assert.equal(parsed.parent_object_id, null);
});

test('parseCausalClockJson — returns null for null/undefined/empty', () => {
  assert.equal(parseCausalClockJson(null), null);
  assert.equal(parseCausalClockJson(undefined), null);
  assert.equal(parseCausalClockJson(''), null);
});

test('parseCausalClockJson — returns null for malformed JSON', () => {
  assert.equal(parseCausalClockJson('not json'), null);
  assert.equal(parseCausalClockJson('{}'), null);
  assert.equal(parseCausalClockJson('{"causal_index":"not-a-number","object_id":"x","object_type":"session"}'), null);
});

test('buildCausalClockEntryId is deterministic', () => {
  const entry = {
    object_id: 'obj-1',
    object_type: 'session',
    causal_index: 1,
    parent_object_id: null,
    parent_causal_index: null,
    lineage_hash: 'abc123',
    created_at: '2026-01-01T00:00:00Z',
  };
  const id1 = buildCausalClockEntryId(entry);
  const id2 = buildCausalClockEntryId(entry);
  assert.equal(id1, id2);
  assert.ok(id1.startsWith('ccl_'));
});

test('causalIndexFromClockResult — returns proof_step for CAUSALLY_ORDERED', () => {
  const result = {
    classification: 'CAUSALLY_ORDERED',
    deterministic_order: ['obj1:null:1:0:5', 'obj2:obj1:2:0:10'],
  };
  assert.equal(causalIndexFromClockResult(result), 10);
});

test('causalIndexFromClockResult — returns null for non-CAUSALLY_ORDERED', () => {
  const result = {
    classification: 'AMBIGUOUS',
    deterministic_order: ['obj1:null:1:0:5'],
  };
  assert.equal(causalIndexFromClockResult(result), null);
});

test('causalIndexFromClockResult — returns null for empty deterministic_order', () => {
  const result = {
    classification: 'CAUSALLY_ORDERED',
    deterministic_order: [],
  };
  assert.equal(causalIndexFromClockResult(result), null);
});

test('detectCausalInversions — no inversions in valid chain', () => {
  const events = [
    { object_id: 'a', object_type: 'session', causal_index: 1, parent_object_id: null, parent_causal_index: null, lineage_hash: 'h1', created_at: 't1' },
    { object_id: 'b', object_type: 'continuity', causal_index: 2, parent_object_id: 'a', parent_causal_index: 1, lineage_hash: 'h2', created_at: 't2' },
    { object_id: 'c', object_type: 'authority', causal_index: 3, parent_object_id: 'b', parent_causal_index: 2, lineage_hash: 'h3', created_at: 't3' },
  ];
  assert.deepEqual(detectCausalInversions(events), []);
});

test('detectCausalInversions — detects inversion when parent index >= child index', () => {
  const events = [
    { object_id: 'a', object_type: 'session', causal_index: 5, parent_object_id: null, parent_causal_index: null, lineage_hash: 'h1', created_at: 't1' },
    { object_id: 'b', object_type: 'continuity', causal_index: 3, parent_object_id: 'a', parent_causal_index: 5, lineage_hash: 'h2', created_at: 't2' },
  ];
  const inversions = detectCausalInversions(events);
  assert.ok(inversions.length > 0);
  assert.ok(inversions[0].includes('inversion'));
});

test('verifyCausalTypeOrder — valid chain respects type ordering', () => {
  const events = [
    { object_id: 'a', object_type: 'session', causal_index: 1, parent_object_id: null, parent_causal_index: null, lineage_hash: 'h1', created_at: 't1' },
    { object_id: 'b', object_type: 'continuity', causal_index: 2, parent_object_id: 'a', parent_causal_index: 1, lineage_hash: 'h2', created_at: 't2' },
    { object_id: 'c', object_type: 'proof', causal_index: 3, parent_object_id: 'b', parent_causal_index: 2, lineage_hash: 'h3', created_at: 't3' },
  ];
  assert.equal(verifyCausalTypeOrder(events), true);
});

test('verifyCausalTypeOrder — violation when child type precedes parent type', () => {
  const events = [
    { object_id: 'a', object_type: 'proof', causal_index: 1, parent_object_id: null, parent_causal_index: null, lineage_hash: 'h1', created_at: 't1' },
    { object_id: 'b', object_type: 'session', causal_index: 2, parent_object_id: 'a', parent_causal_index: 1, lineage_hash: 'h2', created_at: 't2' },
  ];
  assert.equal(verifyCausalTypeOrder(events), false);
});

test('verifyCausalTypeOrder — empty events returns true', () => {
  assert.equal(verifyCausalTypeOrder([]), true);
});
