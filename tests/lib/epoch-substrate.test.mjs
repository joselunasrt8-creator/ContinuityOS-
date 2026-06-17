import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEpochId,
  isEpochGloballyAuthoritative,
  isEpochLocallyValid,
  isEpochTerminal,
  isEpochBlocking,
  classifyEpochFinality,
  epochFinalityToEpochValidPredicate,
  isValidEpochTransition,
  creates_authority,
} from '../../src/lib/epoch-substrate.ts';

test('creates_authority is false — epoch substrate is evidence-only', () => {
  assert.equal(creates_authority, false);
});

test('buildEpochId produces deterministic content-addressed ID', () => {
  const id1 = buildEpochId('scope-a', '2026-01-01T00:00:00Z', 'BOOTSTRAP');
  const id2 = buildEpochId('scope-a', '2026-01-01T00:00:00Z', 'BOOTSTRAP');
  assert.equal(id1, id2);
  assert.ok(id1.startsWith('epoch_'));

  const id3 = buildEpochId('scope-b', '2026-01-01T00:00:00Z', 'BOOTSTRAP');
  assert.notEqual(id1, id3);
});

test('isEpochGloballyAuthoritative returns true only for EPOCH_GLOBAL_AUTHORITATIVE', () => {
  assert.equal(isEpochGloballyAuthoritative('EPOCH_GLOBAL_AUTHORITATIVE'), true);
  assert.equal(isEpochGloballyAuthoritative('EPOCH_LOCAL'), false);
  assert.equal(isEpochGloballyAuthoritative('EPOCH_GLOBAL_CANDIDATE'), false);
  assert.equal(isEpochGloballyAuthoritative('EPOCH_NULL'), false);
  assert.equal(isEpochGloballyAuthoritative('EPOCH_REVOKED'), false);
});

test('isEpochLocallyValid accepts LOCAL, GLOBAL_CANDIDATE, and GLOBAL_AUTHORITATIVE', () => {
  assert.equal(isEpochLocallyValid('EPOCH_LOCAL'), true);
  assert.equal(isEpochLocallyValid('EPOCH_GLOBAL_CANDIDATE'), true);
  assert.equal(isEpochLocallyValid('EPOCH_GLOBAL_AUTHORITATIVE'), true);
  assert.equal(isEpochLocallyValid('EPOCH_AMBIGUOUS'), false);
  assert.equal(isEpochLocallyValid('EPOCH_NULL'), false);
  assert.equal(isEpochLocallyValid('EPOCH_STALE_VISIBLE'), false);
});

test('isEpochTerminal returns true only for EPOCH_NULL', () => {
  assert.equal(isEpochTerminal('EPOCH_NULL'), true);
  assert.equal(isEpochTerminal('EPOCH_LOCAL'), false);
  assert.equal(isEpochTerminal('EPOCH_REVOKED'), false);
});

test('isEpochBlocking identifies degraded and terminal states', () => {
  assert.equal(isEpochBlocking('EPOCH_AMBIGUOUS'), true);
  assert.equal(isEpochBlocking('EPOCH_PARTITION_SUSPENDED'), true);
  assert.equal(isEpochBlocking('EPOCH_CONFLICTED'), true);
  assert.equal(isEpochBlocking('EPOCH_REVOKED'), true);
  assert.equal(isEpochBlocking('EPOCH_NULL'), true);
  assert.equal(isEpochBlocking('EPOCH_LOCAL'), false);
  assert.equal(isEpochBlocking('EPOCH_GLOBAL_CANDIDATE'), false);
  assert.equal(isEpochBlocking('EPOCH_GLOBAL_AUTHORITATIVE'), false);
  assert.equal(isEpochBlocking('EPOCH_STALE_VISIBLE'), false);
});

test('classifyEpochFinality — all evidence present yields EPOCH_GLOBAL_AUTHORITATIVE', () => {
  const result = classifyEpochFinality({
    topology_present: true,
    quorum_met: true,
    revocation_live: true,
    has_competing_head: false,
    is_revoked: false,
  });
  assert.equal(result, 'EPOCH_GLOBAL_AUTHORITATIVE');
});

test('classifyEpochFinality — is_revoked takes highest priority', () => {
  const result = classifyEpochFinality({
    topology_present: true,
    quorum_met: true,
    revocation_live: true,
    has_competing_head: false,
    is_revoked: true,
  });
  assert.equal(result, 'EPOCH_REVOKED');
});

test('classifyEpochFinality — missing topology yields PARTITION_SUSPENDED', () => {
  const result = classifyEpochFinality({
    topology_present: false,
    quorum_met: true,
    revocation_live: true,
    has_competing_head: false,
    is_revoked: false,
  });
  assert.equal(result, 'EPOCH_PARTITION_SUSPENDED');
});

test('classifyEpochFinality — competing head yields CONFLICTED', () => {
  const result = classifyEpochFinality({
    topology_present: true,
    quorum_met: true,
    revocation_live: true,
    has_competing_head: true,
    is_revoked: false,
  });
  assert.equal(result, 'EPOCH_CONFLICTED');
});

test('classifyEpochFinality — quorum not met yields EPOCH_LOCAL', () => {
  const result = classifyEpochFinality({
    topology_present: true,
    quorum_met: false,
    revocation_live: true,
    has_competing_head: false,
    is_revoked: false,
  });
  assert.equal(result, 'EPOCH_LOCAL');
});

test('classifyEpochFinality — revocation not live yields STALE_VISIBLE', () => {
  const result = classifyEpochFinality({
    topology_present: true,
    quorum_met: true,
    revocation_live: false,
    has_competing_head: false,
    is_revoked: false,
  });
  assert.equal(result, 'EPOCH_STALE_VISIBLE');
});

test('epochFinalityToEpochValidPredicate — global requirement', () => {
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_GLOBAL_AUTHORITATIVE', true), true);
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_LOCAL', true), false);
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_GLOBAL_CANDIDATE', true), false);
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_NULL', true), false);
});

test('epochFinalityToEpochValidPredicate — local requirement accepts more states', () => {
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_GLOBAL_AUTHORITATIVE', false), true);
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_LOCAL', false), true);
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_GLOBAL_CANDIDATE', false), true);
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_NULL', false), false);
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_AMBIGUOUS', false), false);
});

test('isValidEpochTransition — EPOCH_NULL is terminal, no transitions out', () => {
  assert.equal(isValidEpochTransition('EPOCH_NULL', 'EPOCH_LOCAL'), false);
  assert.equal(isValidEpochTransition('EPOCH_NULL', 'EPOCH_GLOBAL_AUTHORITATIVE'), false);
});

test('isValidEpochTransition — EPOCH_LOCAL can transition to GLOBAL_CANDIDATE', () => {
  assert.equal(isValidEpochTransition('EPOCH_LOCAL', 'EPOCH_GLOBAL_CANDIDATE'), true);
  assert.equal(isValidEpochTransition('EPOCH_LOCAL', 'EPOCH_AMBIGUOUS'), true);
  assert.equal(isValidEpochTransition('EPOCH_LOCAL', 'EPOCH_NULL'), true);
  assert.equal(isValidEpochTransition('EPOCH_LOCAL', 'EPOCH_GLOBAL_AUTHORITATIVE'), false);
});

test('isValidEpochTransition — EPOCH_GLOBAL_AUTHORITATIVE degrades to STALE/CONFLICTED/REVOKED', () => {
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_STALE_VISIBLE'), true);
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_CONFLICTED'), true);
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_REVOKED'), true);
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_NULL'), true);
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_LOCAL'), false);
});

test('isValidEpochTransition — EPOCH_REVOKED can only transition to NULL', () => {
  assert.equal(isValidEpochTransition('EPOCH_REVOKED', 'EPOCH_NULL'), true);
  assert.equal(isValidEpochTransition('EPOCH_REVOKED', 'EPOCH_LOCAL'), false);
  assert.equal(isValidEpochTransition('EPOCH_REVOKED', 'EPOCH_GLOBAL_AUTHORITATIVE'), false);
});
