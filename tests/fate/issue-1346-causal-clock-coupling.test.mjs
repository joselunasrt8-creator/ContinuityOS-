import test from 'node:test'
import assert from 'node:assert/strict'

import {
  creates_authority,
  CAUSAL_OBJECT_TYPE_ORDER,
  assignCausalIndex,
  happensBefore,
  buildCausalClockJson,
  parseCausalClockJson,
  buildCausalClockEntryId,
  causalIndexFromClockResult,
  detectCausalInversions,
  verifyCausalTypeOrder,
} from '../../src/lib/causal-clock.js'

// ── Evidence-only discipline ─────────────────────────────────────────────────

test('causal-clock module is evidence-only (creates_authority is false)', () => {
  assert.equal(creates_authority, false)
})

// ── Canonical type order ─────────────────────────────────────────────────────

test('CAUSAL_OBJECT_TYPE_ORDER contains all seven canonical object types', () => {
  assert.deepEqual(CAUSAL_OBJECT_TYPE_ORDER, [
    'session', 'continuity', 'authority', 'aeo', 'validation', 'execution', 'proof',
  ])
})

// ── assignCausalIndex ────────────────────────────────────────────────────────

test('assignCausalIndex returns 1 for empty prior events (first event in scope)', () => {
  assert.equal(assignCausalIndex([]), 1)
})

test('assignCausalIndex returns max+1 for existing events', () => {
  assert.equal(assignCausalIndex([{ causal_index: 1 }, { causal_index: 3 }, { causal_index: 2 }]), 4)
})

test('assignCausalIndex is monotone — single prior event returns prior+1', () => {
  assert.equal(assignCausalIndex([{ causal_index: 7 }]), 8)
})

// ── happensBefore ────────────────────────────────────────────────────────────

const makeEntry = (id, type, idx, parent_id = null, parent_idx = null) => ({
  object_id: id,
  object_type: type,
  causal_index: idx,
  parent_object_id: parent_id,
  parent_causal_index: parent_idx,
  lineage_hash: 'abc',
  created_at: '2026-01-01T00:00:00Z',
})

test('happensBefore: direct parent-child relationship returns true', () => {
  const a = makeEntry('a', 'session', 1)
  const b = makeEntry('b', 'continuity', 2, 'a', 1)
  assert.equal(happensBefore(a, b), true)
})

test('happensBefore: lower causal_index returns true', () => {
  const a = makeEntry('a', 'session', 1)
  const b = makeEntry('b', 'continuity', 5)
  assert.equal(happensBefore(a, b), true)
})

test('happensBefore: same causal_index and no parent relationship returns false', () => {
  const a = makeEntry('a', 'session', 3)
  const b = makeEntry('b', 'session', 3)
  assert.equal(happensBefore(a, b), false)
})

test('happensBefore: higher causal_index for a returns false', () => {
  const a = makeEntry('a', 'proof', 10)
  const b = makeEntry('b', 'session', 2)
  assert.equal(happensBefore(a, b), false)
})

test('happensBefore: causal_index of a <= parent_causal_index of b returns true', () => {
  const a = makeEntry('a', 'authority', 3)
  const b = makeEntry('b', 'execution', 7, 'other', 4)
  assert.equal(happensBefore(a, b), true)
})

// ── buildCausalClockJson / parseCausalClockJson ──────────────────────────────

test('buildCausalClockJson serializes all fields to a JSON string', () => {
  const entry = makeEntry('obj-1', 'validation', 5, 'parent-1', 3)
  entry.lineage_hash = 'deadbeef'
  const json = buildCausalClockJson({ ...entry })
  const parsed = JSON.parse(json)
  assert.equal(parsed.object_id, 'obj-1')
  assert.equal(parsed.object_type, 'validation')
  assert.equal(parsed.causal_index, 5)
  assert.equal(parsed.parent_object_id, 'parent-1')
  assert.equal(parsed.parent_causal_index, 3)
  assert.equal(parsed.lineage_hash, 'deadbeef')
})

test('parseCausalClockJson round-trips a valid entry', () => {
  const entry = { object_id: 'x', object_type: 'proof', causal_index: 9, parent_object_id: null, parent_causal_index: null, lineage_hash: 'ff', created_at: '2026-01-01T00:00:00Z' }
  const json = buildCausalClockJson(entry)
  const parsed = parseCausalClockJson(json)
  assert.equal(parsed.causal_index, 9)
  assert.equal(parsed.object_id, 'x')
})

test('parseCausalClockJson returns null for null input', () => {
  assert.equal(parseCausalClockJson(null), null)
})

test('parseCausalClockJson returns null for undefined input', () => {
  assert.equal(parseCausalClockJson(undefined), null)
})

test('parseCausalClockJson returns null for malformed JSON', () => {
  assert.equal(parseCausalClockJson('{bad json'), null)
})

test('parseCausalClockJson returns null when causal_index is missing', () => {
  assert.equal(parseCausalClockJson('{"object_id":"x","object_type":"proof"}'), null)
})

test('parseCausalClockJson returns null when object_id is empty string', () => {
  assert.equal(parseCausalClockJson('{"object_id":"","object_type":"proof","causal_index":1}'), null)
})

// ── buildCausalClockEntryId ──────────────────────────────────────────────────

test('buildCausalClockEntryId returns ccl_-prefixed sha256 hex string', () => {
  const entry = { object_id: 'e1', object_type: 'execution', causal_index: 4, parent_object_id: null, parent_causal_index: null, lineage_hash: 'abc', created_at: '2026-01-01T00:00:00Z' }
  const id = buildCausalClockEntryId(entry)
  assert.match(id, /^ccl_[0-9a-f]{64}$/)
})

test('buildCausalClockEntryId is deterministic', () => {
  const entry = { object_id: 'e1', object_type: 'execution', causal_index: 4, parent_object_id: null, parent_causal_index: null, lineage_hash: 'abc', created_at: '2026-01-01T00:00:00Z' }
  assert.equal(buildCausalClockEntryId(entry), buildCausalClockEntryId(entry))
})

test('buildCausalClockEntryId differs for different causal_index values', () => {
  const a = { object_id: 'e1', object_type: 'execution', causal_index: 1, parent_object_id: null, parent_causal_index: null, lineage_hash: 'abc', created_at: '2026-01-01T00:00:00Z' }
  const b = { ...a, causal_index: 2 }
  assert.notEqual(buildCausalClockEntryId(a), buildCausalClockEntryId(b))
})

// ── causalIndexFromClockResult ───────────────────────────────────────────────

test('causalIndexFromClockResult returns null for non-CAUSALLY_ORDERED classification', () => {
  assert.equal(causalIndexFromClockResult({ classification: 'NULL', deterministic_order: [] }), null)
  assert.equal(causalIndexFromClockResult({ classification: 'CAUSAL_DIVERGENCE', deterministic_order: ['a:b:1:0:2'] }), null)
})

test('causalIndexFromClockResult returns null for empty deterministic_order', () => {
  assert.equal(causalIndexFromClockResult({ classification: 'CAUSALLY_ORDERED', deterministic_order: [] }), null)
})

test('causalIndexFromClockResult extracts proof_step from last entry', () => {
  const result = {
    classification: 'CAUSALLY_ORDERED',
    deterministic_order: ['a:b:1:0:3', 'c:a:2:0:7'],
  }
  assert.equal(causalIndexFromClockResult(result), 7)
})

test('causalIndexFromClockResult uses proof_step at index 4 in colon-delimited format', () => {
  const result = {
    classification: 'CAUSALLY_ORDERED',
    deterministic_order: ['obj1:obj0:5:2:42'],
  }
  assert.equal(causalIndexFromClockResult(result), 42)
})

// ── detectCausalInversions ───────────────────────────────────────────────────

test('detectCausalInversions returns empty array when no inversions exist', () => {
  const events = [
    makeEntry('a', 'session', 1),
    makeEntry('b', 'continuity', 2, 'a', 1),
    makeEntry('c', 'authority', 3, 'b', 2),
  ]
  assert.deepEqual(detectCausalInversions(events), [])
})

test('detectCausalInversions detects inversion when parent.causal_index >= child.causal_index', () => {
  const events = [
    makeEntry('parent', 'session', 5),
    makeEntry('child', 'continuity', 3, 'parent', 5),
  ]
  const inversions = detectCausalInversions(events)
  assert.equal(inversions.length, 1)
  assert.match(inversions[0], /inversion:parent\(5\)→child\(3\)/)
})

test('detectCausalInversions detects equal causal_index as inversion', () => {
  const events = [
    makeEntry('parent', 'authority', 4),
    makeEntry('child', 'aeo', 4, 'parent', 4),
  ]
  const inversions = detectCausalInversions(events)
  assert.equal(inversions.length, 1)
})

test('detectCausalInversions ignores events with null parent', () => {
  const events = [makeEntry('root', 'session', 10)]
  assert.deepEqual(detectCausalInversions(events), [])
})

// ── verifyCausalTypeOrder ────────────────────────────────────────────────────

test('verifyCausalTypeOrder returns true for correct canonical chain order', () => {
  const events = [
    makeEntry('s', 'session', 1),
    makeEntry('c', 'continuity', 2, 's', 1),
    makeEntry('a', 'authority', 3, 'c', 2),
    makeEntry('e', 'execution', 4, 'a', 3),
  ]
  assert.equal(verifyCausalTypeOrder(events), true)
})

test('verifyCausalTypeOrder returns false when child type precedes parent type', () => {
  const events = [
    makeEntry('e', 'execution', 1),
    makeEntry('s', 'session', 2, 'e', 1),
  ]
  assert.equal(verifyCausalTypeOrder(events), false)
})

test('verifyCausalTypeOrder returns true for events with same rank (same type)', () => {
  const events = [
    makeEntry('p1', 'proof', 1),
    makeEntry('p2', 'proof', 2, 'p1', 1),
  ]
  assert.equal(verifyCausalTypeOrder(events), true)
})

test('verifyCausalTypeOrder ignores events with no parent', () => {
  const events = [makeEntry('root', 'proof', 1)]
  assert.equal(verifyCausalTypeOrder(events), true)
})
