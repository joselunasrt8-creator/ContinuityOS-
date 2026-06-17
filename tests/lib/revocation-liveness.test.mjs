import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRevocationLivenessId,
  evaluateLiveness,
  evaluateLPredicate,
  creates_authority,
} from '../../src/lib/revocation-liveness.ts';

test('creates_authority is false — revocation liveness is evidence-only', () => {
  assert.equal(creates_authority, false);
});

test('buildRevocationLivenessId produces deterministic content-addressed ID', () => {
  const id1 = buildRevocationLivenessId('ch-1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z');
  const id2 = buildRevocationLivenessId('ch-1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z');
  assert.equal(id1, id2);
  assert.ok(id1.startsWith('rlr_'));

  const id3 = buildRevocationLivenessId('ch-2', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z');
  assert.notEqual(id1, id3);
});

test('evaluateLiveness — within SLA when silence is below threshold', () => {
  const now = Date.parse('2026-01-01T00:01:00Z');
  const result = evaluateLiveness('2026-01-01T00:00:30Z', 60000, now);
  assert.equal(result.within_sla, 1);
  assert.equal(result.observed_silence_ms, 30000);
});

test('evaluateLiveness — outside SLA when silence exceeds threshold', () => {
  const now = Date.parse('2026-01-01T00:02:00Z');
  const result = evaluateLiveness('2026-01-01T00:00:00Z', 60000, now);
  assert.equal(result.within_sla, 0);
  assert.equal(result.observed_silence_ms, 120000);
});

test('evaluateLiveness — exactly at threshold boundary is within SLA', () => {
  const now = Date.parse('2026-01-01T00:01:00Z');
  const result = evaluateLiveness('2026-01-01T00:00:00Z', 60000, now);
  assert.equal(result.within_sla, 1);
  assert.equal(result.observed_silence_ms, 60000);
});

test('evaluateLiveness — invalid date fails closed to outside SLA', () => {
  const result = evaluateLiveness('not-a-date', 60000, Date.now());
  assert.equal(result.within_sla, 0);
  assert.ok(result.observed_silence_ms > 60000);
});

test('evaluateLiveness — future observation clamps to zero silence', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const result = evaluateLiveness('2026-01-01T00:01:00Z', 60000, now);
  assert.equal(result.observed_silence_ms, 0);
  assert.equal(result.within_sla, 1);
});

test('evaluateLPredicate — true when all channels are within SLA', () => {
  const records = [
    { within_sla: 1 },
    { within_sla: 1 },
    { within_sla: 1 },
  ];
  assert.equal(evaluateLPredicate(records), true);
});

test('evaluateLPredicate — false when any channel is outside SLA', () => {
  const records = [
    { within_sla: 1 },
    { within_sla: 0 },
    { within_sla: 1 },
  ];
  assert.equal(evaluateLPredicate(records), false);
});

test('evaluateLPredicate — false for empty record set', () => {
  assert.equal(evaluateLPredicate([]), false);
});

test('evaluateLPredicate — single record within SLA returns true', () => {
  assert.equal(evaluateLPredicate([{ within_sla: 1 }]), true);
});

test('evaluateLPredicate — single record outside SLA returns false', () => {
  assert.equal(evaluateLPredicate([{ within_sla: 0 }]), false);
});
