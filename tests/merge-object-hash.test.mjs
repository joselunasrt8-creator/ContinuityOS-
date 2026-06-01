import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkExactObjectAdmission,
  computeApprovedObjectHash,
  computeMergedObjectHash,
  computeReviewedObjectHash,
} from '../runtime/merge-object-hash.mjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SHA_HEAD = 'abc123def456abc123def456abc123def456abc1';
const SHA_STALE = 'stalestalestalestalestalestalestalesta1e';
const SHA_MERGE = 'fff000fff000fff000fff000fff000fff000fff0';

const BASE = {
  pr_number: 42,
  repo: 'owner/repo',
  reviewed_head_sha: SHA_HEAD,
  head_sha: SHA_HEAD,
  merge_commit_sha: SHA_MERGE,
  changed_files: ['src/foo.ts', 'governance/bar.json'],
  review_status: 'APPROVED',
  risk_class: 'P3',
  merge_method: 'merge',
};

// ── computeReviewedObjectHash ─────────────────────────────────────────────────

test('computeReviewedObjectHash: returns 64-char hex string', () => {
  const h = computeReviewedObjectHash(BASE);
  assert.equal(typeof h, 'string');
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('computeReviewedObjectHash: deterministic for same input', () => {
  assert.equal(computeReviewedObjectHash(BASE), computeReviewedObjectHash(BASE));
});

test('computeReviewedObjectHash: changed_files order does not affect hash', () => {
  const a = computeReviewedObjectHash({ ...BASE, changed_files: ['b.ts', 'a.ts'] });
  const b = computeReviewedObjectHash({ ...BASE, changed_files: ['a.ts', 'b.ts'] });
  assert.equal(a, b);
});

test('computeReviewedObjectHash: different reviewed_head_sha produces different hash', () => {
  const a = computeReviewedObjectHash({ ...BASE, reviewed_head_sha: SHA_HEAD });
  const b = computeReviewedObjectHash({ ...BASE, reviewed_head_sha: SHA_STALE });
  assert.notEqual(a, b);
});

test('computeReviewedObjectHash: different repo produces different hash', () => {
  const a = computeReviewedObjectHash({ ...BASE, repo: 'owner/repo-a' });
  const b = computeReviewedObjectHash({ ...BASE, repo: 'owner/repo-b' });
  assert.notEqual(a, b);
});

test('computeReviewedObjectHash: different pr_number produces different hash', () => {
  const a = computeReviewedObjectHash({ ...BASE, pr_number: 1 });
  const b = computeReviewedObjectHash({ ...BASE, pr_number: 2 });
  assert.notEqual(a, b);
});

test('computeReviewedObjectHash: different changed_files set produces different hash', () => {
  const a = computeReviewedObjectHash({ ...BASE, changed_files: ['src/a.ts'] });
  const b = computeReviewedObjectHash({ ...BASE, changed_files: ['src/b.ts'] });
  assert.notEqual(a, b);
});

// ── computeApprovedObjectHash ─────────────────────────────────────────────────

test('computeApprovedObjectHash: returns 64-char hex string', () => {
  const h = computeApprovedObjectHash(BASE);
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('computeApprovedObjectHash: deterministic for same input', () => {
  assert.equal(computeApprovedObjectHash(BASE), computeApprovedObjectHash(BASE));
});

test('computeApprovedObjectHash: when head_sha == reviewed_head_sha, reviewed and approved hashes differ (different canonical keys)', () => {
  // reviewed uses key "reviewed_head_sha"; approved uses key "approved_head_sha"
  // so they deliberately differ even when the SHA value is the same
  const reviewed = computeReviewedObjectHash(BASE);
  const approved = computeApprovedObjectHash(BASE);
  assert.notEqual(reviewed, approved);
});

test('computeApprovedObjectHash: different head_sha produces different hash', () => {
  const a = computeApprovedObjectHash({ ...BASE, head_sha: SHA_HEAD });
  const b = computeApprovedObjectHash({ ...BASE, head_sha: SHA_STALE });
  assert.notEqual(a, b);
});

// ── computeMergedObjectHash ───────────────────────────────────────────────────

test('computeMergedObjectHash: returns 64-char hex string', () => {
  const h = computeMergedObjectHash(BASE);
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('computeMergedObjectHash: deterministic for same input', () => {
  assert.equal(computeMergedObjectHash(BASE), computeMergedObjectHash(BASE));
});

test('computeMergedObjectHash: different merge_commit_sha produces different hash', () => {
  const a = computeMergedObjectHash({ ...BASE, merge_commit_sha: SHA_MERGE });
  const b = computeMergedObjectHash({ ...BASE, merge_commit_sha: SHA_STALE });
  assert.notEqual(a, b);
});

test('computeMergedObjectHash: different merge_method produces different hash', () => {
  const a = computeMergedObjectHash({ ...BASE, merge_method: 'merge' });
  const b = computeMergedObjectHash({ ...BASE, merge_method: 'squash' });
  assert.notEqual(a, b);
});

// ── checkExactObjectAdmission — MERGE_LEGITIMACY_VALID ────────────────────────

test('exact match: reviewed_head_sha == head_sha → MERGE_LEGITIMACY_VALID', () => {
  const result = checkExactObjectAdmission(BASE);
  assert.equal(result.merge_legitimacy_status, 'MERGE_LEGITIMACY_VALID');
  assert.equal(result.exact_object_match, true);
  assert.equal(result.failure_reason, null);
});

test('MERGE_LEGITIMACY_VALID: all three hash fields are 64-char hex strings', () => {
  const result = checkExactObjectAdmission(BASE);
  for (const field of ['reviewed_object_hash', 'approved_object_hash', 'merged_object_hash']) {
    assert.equal(typeof result[field], 'string', `${field} must be a string`);
    assert.equal(result[field].length, 64, `${field} must be 64 chars`);
    assert.match(result[field], /^[0-9a-f]{64}$/, `${field} must be hex`);
  }
});

test('MERGE_LEGITIMACY_VALID: sha fields are echoed correctly', () => {
  const result = checkExactObjectAdmission(BASE);
  assert.equal(result.reviewed_head_sha, SHA_HEAD);
  assert.equal(result.head_sha, SHA_HEAD);
  assert.equal(result.merge_commit_sha, SHA_MERGE);
});

test('OWNER_SELF_CERTIFIED: exact SHA match → MERGE_LEGITIMACY_VALID', () => {
  const result = checkExactObjectAdmission({
    ...BASE,
    review_status: 'OWNER_SELF_CERTIFIED',
    risk_class: 'P1',
  });
  assert.equal(result.merge_legitimacy_status, 'MERGE_LEGITIMACY_VALID');
  assert.equal(result.exact_object_match, true);
});

// ── checkExactObjectAdmission — LEGITIMACY_NULL ────────────────────────────────

test('stale review: reviewed_head_sha != head_sha → LEGITIMACY_NULL', () => {
  const result = checkExactObjectAdmission({ ...BASE, reviewed_head_sha: SHA_STALE });
  assert.equal(result.merge_legitimacy_status, 'LEGITIMACY_NULL');
  assert.equal(result.exact_object_match, false);
  assert.equal(result.failure_reason, 'reviewed_object_differs_from_merged_object');
});

test('LEGITIMACY_NULL: still computes all three hashes (for audit)', () => {
  const result = checkExactObjectAdmission({ ...BASE, reviewed_head_sha: SHA_STALE });
  for (const field of ['reviewed_object_hash', 'approved_object_hash', 'merged_object_hash']) {
    assert.equal(typeof result[field], 'string', `${field} must be computed even on null`);
    assert.equal(result[field].length, 64);
  }
});

test('LEGITIMACY_NULL: reviewed_object_hash differs from approved when SHAs differ', () => {
  const result = checkExactObjectAdmission({ ...BASE, reviewed_head_sha: SHA_STALE });
  assert.notEqual(result.reviewed_object_hash, result.approved_object_hash);
});

// ── checkExactObjectAdmission — UNKNOWN ────────────────────────────────────────

test('missing reviewed_head_sha → UNKNOWN', () => {
  const result = checkExactObjectAdmission({ ...BASE, reviewed_head_sha: '' });
  assert.equal(result.merge_legitimacy_status, 'UNKNOWN');
  assert.equal(result.failure_reason, 'missing_required_sha');
});

test('missing head_sha → UNKNOWN', () => {
  const result = checkExactObjectAdmission({ ...BASE, head_sha: '' });
  assert.equal(result.merge_legitimacy_status, 'UNKNOWN');
  assert.equal(result.failure_reason, 'missing_required_sha');
});

test('missing merge_commit_sha → UNKNOWN', () => {
  const result = checkExactObjectAdmission({ ...BASE, merge_commit_sha: '' });
  assert.equal(result.merge_legitimacy_status, 'UNKNOWN');
  assert.equal(result.failure_reason, 'missing_required_sha');
});

test('UNKNOWN: all hash fields are null', () => {
  const result = checkExactObjectAdmission({ ...BASE, reviewed_head_sha: '' });
  assert.equal(result.reviewed_object_hash, null);
  assert.equal(result.approved_object_hash, null);
  assert.equal(result.merged_object_hash, null);
});

test('UNKNOWN: exact_object_match is false', () => {
  const result = checkExactObjectAdmission({ ...BASE, merge_commit_sha: '' });
  assert.equal(result.exact_object_match, false);
});

// ── Hash determinism across statuses ─────────────────────────────────────────

test('same changed_files set produces same reviewed hash regardless of admission status', () => {
  const valid = checkExactObjectAdmission(BASE);
  const stale = checkExactObjectAdmission({ ...BASE, reviewed_head_sha: SHA_STALE });
  // reviewed_object_hash differs because reviewed_head_sha differs
  assert.notEqual(valid.reviewed_object_hash, stale.reviewed_object_hash);
  // approved_object_hash is the same (head_sha unchanged)
  assert.equal(valid.approved_object_hash, stale.approved_object_hash);
  // merged_object_hash is the same (merge_commit_sha unchanged)
  assert.equal(valid.merged_object_hash, stale.merged_object_hash);
});

test('null merge_method falls back to unknown in merged hash', () => {
  const a = checkExactObjectAdmission({ ...BASE, merge_method: undefined });
  const b = checkExactObjectAdmission({ ...BASE, merge_method: 'unknown' });
  assert.equal(a.merge_legitimacy_status, 'MERGE_LEGITIMACY_VALID');
  assert.equal(a.merged_object_hash, b.merged_object_hash);
});
