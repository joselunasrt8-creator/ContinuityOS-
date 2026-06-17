import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const spec = JSON.parse(
  readFileSync(
    join(root, 'governance', 'preo', 'REVIEWER_LEGITIMACY_VALIDATION_SPEC.json'),
    'utf8',
  ),
);

import { sortCanonical, canonicalHash } from '../helpers/canonical-test-hash.mjs';

// ---------------------------------------------------------------------------
// Reviewer legitimacy evaluation logic
//
// Boundary contract:
//   REVIEWER_LEGITIMACY_VALID requires reviewer identity present, exact
//   head_sha binding, non-dismissed/non-stale review state, review
//   visibility, branch protection compliance, approval scope validity, and
//   reviewer lineage binding. Any missing, stale, ambiguous, or unresolvable
//   input fails closed as REVIEWER_LEGITIMACY_INVALID.
// ---------------------------------------------------------------------------

function evaluateReviewerLegitimacy({ reviewer, currentHeadSha }) {
  const required = spec.reviewer_legitimacy_valid_object.required_fields;

  // Fail-closed: any missing or null required field → INVALID
  for (const field of required) {
    if (!Object.hasOwn(reviewer, field) || reviewer[field] == null || reviewer[field] === '') {
      return {
        status: 'REVIEWER_LEGITIMACY_INVALID',
        reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
        invalid_reason: `missing_field:${field}`,
        reviewer_lineage_binding: null,
        review_head_sha_binding: null,
        reviewer_legitimacy_hash: null,
      };
    }
  }

  // reviewer_identity_missing: empty string already caught above; guard explicit null
  if (typeof reviewer.reviewer_identity !== 'string' || reviewer.reviewer_identity.trim() === '') {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'reviewer_identity_missing',
      reviewer_lineage_binding: false,
      review_head_sha_binding: null,
      reviewer_legitimacy_hash: null,
    };
  }

  // stale_review: exact_head_sha_binding is false OR review_commit_sha !== currentHeadSha
  if (!reviewer.exact_head_sha_binding || reviewer.review_commit_sha !== currentHeadSha) {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'stale_review',
      reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
      review_head_sha_binding: false,
      reviewer_legitimacy_hash: null,
    };
  }

  // head_sha_mismatch: current_head_sha field in object does not match external currentHeadSha
  if (reviewer.current_head_sha !== currentHeadSha) {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'head_sha_mismatch',
      reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
      review_head_sha_binding: false,
      reviewer_legitimacy_hash: null,
    };
  }

  // dismissed_review: review_state is DISMISSED
  if (reviewer.review_state === 'DISMISSED') {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'dismissed_review',
      reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
      review_head_sha_binding: reviewer.review_head_sha_binding,
      reviewer_legitimacy_hash: null,
    };
  }

  // missing_required_approval: review_state must be APPROVED
  if (reviewer.review_state !== 'APPROVED') {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'missing_required_approval',
      reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
      review_head_sha_binding: reviewer.review_head_sha_binding,
      reviewer_legitimacy_hash: null,
    };
  }

  // review_after_topology_drift: review_head_sha_binding is false
  if (!reviewer.review_head_sha_binding) {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'review_after_topology_drift',
      reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
      review_head_sha_binding: false,
      reviewer_legitimacy_hash: null,
    };
  }

  // review_not_visible_to_preo: current_review_visibility is false
  if (!reviewer.current_review_visibility) {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'review_not_visible_to_preo',
      reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
      review_head_sha_binding: reviewer.review_head_sha_binding,
      reviewer_legitimacy_hash: null,
    };
  }

  // branch_protection_noncompliant: branch_protection_compliance is false
  if (!reviewer.branch_protection_compliance) {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'branch_protection_noncompliant',
      reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
      review_head_sha_binding: reviewer.review_head_sha_binding,
      reviewer_legitimacy_hash: null,
    };
  }

  // approval_scope_invalid: approval_scope_validation is false
  if (!reviewer.approval_scope_validation) {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'approval_scope_invalid',
      reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
      review_head_sha_binding: reviewer.review_head_sha_binding,
      reviewer_legitimacy_hash: null,
    };
  }

  // reviewer_identity_missing via lineage: reviewer_lineage_binding is false
  if (!reviewer.reviewer_lineage_binding) {
    return {
      status: 'REVIEWER_LEGITIMACY_INVALID',
      reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_INVALID',
      invalid_reason: 'reviewer_identity_missing',
      reviewer_lineage_binding: false,
      review_head_sha_binding: reviewer.review_head_sha_binding,
      reviewer_legitimacy_hash: null,
    };
  }

  const reviewerLegitimacyHash = canonicalHash({
    pr_number: reviewer.pr_number,
    repo: reviewer.repo,
    reviewer_identity: reviewer.reviewer_identity,
    review_state: reviewer.review_state,
    review_submitted_at: reviewer.review_submitted_at,
    review_commit_sha: reviewer.review_commit_sha,
    current_head_sha: reviewer.current_head_sha,
    branch_protection_compliance: reviewer.branch_protection_compliance,
    current_review_visibility: reviewer.current_review_visibility,
  });

  return {
    status: 'REVIEWER_LEGITIMACY_VALID',
    reviewer_legitimacy_status: 'REVIEWER_LEGITIMACY_VALID',
    reviewer_lineage_binding: reviewer.reviewer_lineage_binding,
    review_head_sha_binding: reviewer.review_head_sha_binding,
    reviewer_legitimacy_hash: reviewerLegitimacyHash,
    invalid_reason: null,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEAD_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

const validReviewer = Object.freeze({
  pr_number: 1632,
  repo: 'joselunasrt8-creator/mindshift-demo',
  reviewer_identity: 'alice',
  review_state: 'APPROVED',
  review_submitted_at: '2026-05-31T10:00:00Z',
  review_commit_sha: HEAD_SHA,
  current_head_sha: HEAD_SHA,
  exact_head_sha_binding: true,
  branch_protection_compliance: true,
  current_review_visibility: true,
  approval_scope_validation: true,
  reviewer_lineage_binding: true,
  review_head_sha_binding: true,
});

// ---------------------------------------------------------------------------
// Test 1: Spec exists and closes #1632
// ---------------------------------------------------------------------------

test('REVIEWER_LEGITIMACY_VALIDATION_SPEC exists and closes #1632', () => {
  assert.ok(spec, 'spec must be loadable');
  assert.equal(spec.closes, '#1632', 'spec.closes must be #1632');
  assert.equal(spec.artifact_id, 'reviewer_legitimacy_validation_spec');
  assert.equal(spec.status, 'non_operative_governance_artifact');
});

// ---------------------------------------------------------------------------
// Test 2: REVIEWER_LEGITIMACY_VALID object is defined
// ---------------------------------------------------------------------------

test('REVIEWER_LEGITIMACY_VALID object is defined in spec', () => {
  const obj = spec.reviewer_legitimacy_valid_object;
  assert.ok(obj, 'reviewer_legitimacy_valid_object must be defined');
  assert.equal(obj.defined, true);
  assert.equal(obj.object_type, 'REVIEWER_LEGITIMACY_VALID');
});

// ---------------------------------------------------------------------------
// Test 3: All required fields are present in spec
// ---------------------------------------------------------------------------

test('REVIEWER_LEGITIMACY_VALID spec declares all required fields', () => {
  const fields = spec.reviewer_legitimacy_valid_object.required_fields;
  const expected = [
    'pr_number',
    'repo',
    'reviewer_identity',
    'review_state',
    'review_submitted_at',
    'review_commit_sha',
    'current_head_sha',
    'exact_head_sha_binding',
    'branch_protection_compliance',
    'current_review_visibility',
    'approval_scope_validation',
    'reviewer_lineage_binding',
    'review_head_sha_binding',
  ];
  for (const field of expected) {
    assert.ok(fields.includes(field), `required field missing from spec: ${field}`);
  }
});

// ---------------------------------------------------------------------------
// Test 4: Valid review returns REVIEWER_LEGITIMACY_VALID
// ---------------------------------------------------------------------------

test('PASS: fully bound valid reviewer returns REVIEWER_LEGITIMACY_VALID', () => {
  const result = evaluateReviewerLegitimacy({ reviewer: validReviewer, currentHeadSha: HEAD_SHA });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_VALID');
  assert.equal(result.reviewer_legitimacy_status, 'REVIEWER_LEGITIMACY_VALID');
  assert.equal(result.invalid_reason, null);
  assert.ok(result.reviewer_legitimacy_hash, 'reviewer_legitimacy_hash must be present');
  assert.equal(result.reviewer_lineage_binding, true);
  assert.equal(result.review_head_sha_binding, true);
});

// ---------------------------------------------------------------------------
// Test 5: stale_review → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: stale_review (exact_head_sha_binding=false) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, exact_head_sha_binding: false, review_commit_sha: OTHER_SHA },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'stale_review');
});

// ---------------------------------------------------------------------------
// Test 6: head_sha_mismatch → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: head_sha_mismatch (current_head_sha field !== currentHeadSha) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, current_head_sha: OTHER_SHA },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'head_sha_mismatch');
});

// ---------------------------------------------------------------------------
// Test 7: dismissed_review → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: dismissed_review (review_state=DISMISSED) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, review_state: 'DISMISSED' },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'dismissed_review');
});

// ---------------------------------------------------------------------------
// Test 8: missing_required_approval → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: missing_required_approval (review_state=PENDING) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, review_state: 'PENDING' },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'missing_required_approval');
});

// ---------------------------------------------------------------------------
// Test 9: review_after_topology_drift → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: review_after_topology_drift (review_head_sha_binding=false) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, review_head_sha_binding: false },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'review_after_topology_drift');
});

// ---------------------------------------------------------------------------
// Test 10: reviewer_identity_missing → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: reviewer_identity_missing (reviewer_lineage_binding=false) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, reviewer_lineage_binding: false },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'reviewer_identity_missing');
});

// ---------------------------------------------------------------------------
// Test 11: review_not_visible_to_preo → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: review_not_visible_to_preo (current_review_visibility=false) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, current_review_visibility: false },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'review_not_visible_to_preo');
});

// ---------------------------------------------------------------------------
// Test 12: branch_protection_noncompliant → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: branch_protection_noncompliant (branch_protection_compliance=false) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, branch_protection_compliance: false },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'branch_protection_noncompliant');
});

// ---------------------------------------------------------------------------
// Test 13: approval_scope_invalid → REVIEWER_LEGITIMACY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: approval_scope_invalid (approval_scope_validation=false) → REVIEWER_LEGITIMACY_INVALID', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, approval_scope_validation: false },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(result.invalid_reason, 'approval_scope_invalid');
});

// ---------------------------------------------------------------------------
// Test 14: REVIEWER_LEGITIMACY_INVALID maps to PREO_INVALID_AND_MERGE_LEGITIMACY_NULL
// ---------------------------------------------------------------------------

test('REVIEWER_LEGITIMACY_INVALID maps to PREO_INVALID_AND_MERGE_LEGITIMACY_NULL', () => {
  const result = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, branch_protection_compliance: false },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(spec.preo_integration.failure_result, 'PREO_INVALID_AND_MERGE_LEGITIMACY_NULL');
  const preoOutcome =
    result.status === 'REVIEWER_LEGITIMACY_INVALID'
      ? spec.preo_integration.failure_result
      : 'PREO_VALID';
  assert.equal(preoOutcome, 'PREO_INVALID_AND_MERGE_LEGITIMACY_NULL');
});

// ---------------------------------------------------------------------------
// Test 15: Reviewer legitimacy alone does not create PREO_VALID
// ---------------------------------------------------------------------------

test('reviewer legitimacy alone does not create PREO_VALID', () => {
  const result = evaluateReviewerLegitimacy({ reviewer: validReviewer, currentHeadSha: HEAD_SHA });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_VALID');
  // REVIEWER_LEGITIMACY_VALID is a required INPUT to PREO_VALID, not PREO_VALID itself
  assert.notEqual(result.status, 'PREO_VALID');
  assert.equal(spec.preo_integration.reviewer_legitimacy_creates_preo_valid, false);
});

// ---------------------------------------------------------------------------
// Test 16: Reviewer legitimacy alone does not create merge permission
// ---------------------------------------------------------------------------

test('reviewer legitimacy alone does not create merge permission', () => {
  const result = evaluateReviewerLegitimacy({ reviewer: validReviewer, currentHeadSha: HEAD_SHA });
  assert.equal(result.status, 'REVIEWER_LEGITIMACY_VALID');
  assert.equal(spec.non_operability.creates_merge_permission, false);
  assert.equal(spec.non_operability.creates_authority, false);
  assert.equal(spec.preo_integration.reviewer_legitimacy_creates_merge_permission, false);
});

// ---------------------------------------------------------------------------
// Test 17: Deterministic hash — identical inputs produce identical hash
// ---------------------------------------------------------------------------

test('DETERMINISM: identical inputs produce identical reviewer_legitimacy_hash', () => {
  const first = evaluateReviewerLegitimacy({ reviewer: validReviewer, currentHeadSha: HEAD_SHA });
  const second = evaluateReviewerLegitimacy({
    reviewer: structuredClone(validReviewer),
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(first.status, 'REVIEWER_LEGITIMACY_VALID');
  assert.equal(second.status, 'REVIEWER_LEGITIMACY_VALID');
  assert.equal(
    first.reviewer_legitimacy_hash,
    second.reviewer_legitimacy_hash,
    'identical inputs must produce identical reviewer_legitimacy_hash',
  );
});

// ---------------------------------------------------------------------------
// Test 18: Deterministic hash — changed review_commit_sha changes hash/classification
// ---------------------------------------------------------------------------

test('DETERMINISM: changed review_commit_sha changes reviewer_legitimacy_hash', () => {
  const altReviewer = {
    ...validReviewer,
    review_commit_sha: OTHER_SHA,
    current_head_sha: OTHER_SHA,
  };
  const first = evaluateReviewerLegitimacy({ reviewer: validReviewer, currentHeadSha: HEAD_SHA });
  const second = evaluateReviewerLegitimacy({ reviewer: altReviewer, currentHeadSha: OTHER_SHA });
  assert.equal(first.status, 'REVIEWER_LEGITIMACY_VALID');
  assert.equal(second.status, 'REVIEWER_LEGITIMACY_VALID');
  assert.notEqual(
    first.reviewer_legitimacy_hash,
    second.reviewer_legitimacy_hash,
    'different review_commit_sha must produce different reviewer_legitimacy_hash',
  );
});

// ---------------------------------------------------------------------------
// Test 19: Deterministic hash — changed current_head_sha changes classification
// ---------------------------------------------------------------------------

test('DETERMINISM: changed current_head_sha in object changes classification to REVIEWER_LEGITIMACY_INVALID', () => {
  const first = evaluateReviewerLegitimacy({ reviewer: validReviewer, currentHeadSha: HEAD_SHA });
  const second = evaluateReviewerLegitimacy({
    reviewer: { ...validReviewer, current_head_sha: OTHER_SHA },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(first.status, 'REVIEWER_LEGITIMACY_VALID');
  assert.equal(second.status, 'REVIEWER_LEGITIMACY_INVALID');
  assert.equal(second.invalid_reason, 'head_sha_mismatch');
  assert.notEqual(first.status, second.status, 'changed current_head_sha must change classification');
});

// ---------------------------------------------------------------------------
// Test 20: Non-operability — all operative flags are false
// ---------------------------------------------------------------------------

test('non-operability: all operative flags are false', () => {
  const nop = spec.non_operability;
  assert.equal(nop.creates_authority, false);
  assert.equal(nop.creates_execution, false);
  assert.equal(nop.creates_deployment, false);
  assert.equal(nop.creates_merge_permission, false);
  assert.equal(nop.creates_proof, false);
  assert.equal(nop.mutates_registry, false);
  assert.equal(nop.mutates_runtime, false);
  assert.equal(nop.triggers_merge, false);
});
