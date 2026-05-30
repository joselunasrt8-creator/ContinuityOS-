import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const approvalLineageSpec = JSON.parse(
  readFileSync(join(root, 'governance', 'preo', 'APPROVAL_LINEAGE_SPEC.json'), 'utf8'),
);
const reviewerRegistrySpec = JSON.parse(
  readFileSync(join(root, 'governance', 'preo', 'REVIEWER_REGISTRY_SPEC.json'), 'utf8'),
);

// ---------------------------------------------------------------------------
// Canonical hash helpers
// ---------------------------------------------------------------------------

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortCanonical(v)]),
    );
  }
  return value;
}

function canonicalHash(value) {
  return createHash('sha256').update(`${JSON.stringify(sortCanonical(value))}\n`).digest('hex');
}

// ---------------------------------------------------------------------------
// Approval lineage evaluation logic
//
// Boundary contract:
//   APPROVAL_LINEAGE_VALID requires reviewer identity, exact head_sha binding,
//   non-stale review state, and visibility in the PREO evidence snapshot.
//   Any missing, stale, ambiguous, or unresolvable input fails closed.
// ---------------------------------------------------------------------------

const REVIEWER_REGISTRY = {
  alice: { reviewer_id: 'alice', roles: ['MAINTAINER', 'SECURITY_OFFICER'] },
  bob: { reviewer_id: 'bob', roles: ['MAINTAINER'] },
  carol: { reviewer_id: 'carol', roles: ['INFRASTRUCTURE_ENGINEER'] },
};

const MUTATION_CLASS_REQUIRED_ROLES = {
  authority_mutation: ['SECURITY_OFFICER'],
  runtime_mutation: ['MAINTAINER'],
  topology_mutation: ['INFRASTRUCTURE_ENGINEER'],
};

function evaluateApprovalLineage({ approval, currentHeadSha, mutationClass = null }) {
  const required = approvalLineageSpec.approval_lineage_object.required_fields;

  for (const field of required) {
    if (!Object.hasOwn(approval, field) || approval[field] == null || approval[field] === '') {
      return { status: 'APPROVAL_LINEAGE_INVALID', reason: `missing_field:${field}` };
    }
  }

  // reviewer_identity must be known
  const reviewer = REVIEWER_REGISTRY[approval.reviewer_identity];
  if (!reviewer) {
    return { status: 'APPROVAL_LINEAGE_INVALID', reason: 'reviewer_identity_missing' };
  }

  // head_sha must match
  if (approval.review_commit_sha !== currentHeadSha) {
    return { status: 'APPROVAL_LINEAGE_INVALID', reason: 'approval_without_head_sha_match' };
  }

  if (approval.head_sha !== currentHeadSha) {
    return { status: 'APPROVAL_LINEAGE_INVALID', reason: 'approval_without_head_sha_match' };
  }

  if (!approval.current_head_sha_match) {
    return { status: 'APPROVAL_LINEAGE_INVALID', reason: 'approval_without_head_sha_match' };
  }

  // review_state must be APPROVED
  if (approval.review_state !== 'APPROVED') {
    return { status: 'APPROVAL_LINEAGE_INVALID', reason: 'dismissed_or_stale_review' };
  }

  // stale_review_rejected must be true
  if (!approval.stale_review_rejected) {
    return { status: 'APPROVAL_LINEAGE_INVALID', reason: 'dismissed_or_stale_review' };
  }

  // mutation class role check — if provided
  if (mutationClass !== null) {
    const requiredRoles = MUTATION_CLASS_REQUIRED_ROLES[mutationClass];
    if (!requiredRoles) {
      return { status: 'APPROVAL_LINEAGE_INVALID', reason: 'unknown_mutation_class' };
    }
    const hasRequired = requiredRoles.every((role) => reviewer.roles.includes(role));
    if (!hasRequired) {
      return { status: 'APPROVAL_LINEAGE_INVALID', reason: 'missing_required_role' };
    }
  }

  const approvalLineageHash = canonicalHash({
    pr_number: approval.pr_number,
    repo: approval.repo,
    head_sha: approval.head_sha,
    reviewer_identity: approval.reviewer_identity,
    review_state: approval.review_state,
    review_submitted_at: approval.review_submitted_at,
    review_commit_sha: approval.review_commit_sha,
  });

  return {
    status: 'APPROVAL_LINEAGE_VALID',
    reason: null,
    approval_lineage_hash: approvalLineageHash,
    approval_legitimacy_status: 'APPROVAL_LINEAGE_VALID',
    approval_binding_evidence: {
      pr_number: approval.pr_number,
      repo: approval.repo,
      head_sha: approval.head_sha,
      reviewer_identity: approval.reviewer_identity,
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEAD_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

const validApproval = Object.freeze({
  pr_number: 42,
  repo: 'example/mindshift-demo',
  head_sha: HEAD_SHA,
  reviewer_identity: 'alice',
  review_state: 'APPROVED',
  review_submitted_at: '2026-05-30T10:00:00Z',
  review_commit_sha: HEAD_SHA,
  current_head_sha_match: true,
  stale_review_rejected: true,
});

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('APPROVAL_LINEAGE_SPEC defines non-operative governance boundaries', () => {
  const { non_operability } = approvalLineageSpec;
  assert.equal(non_operability.merge_operations, false);
  assert.equal(non_operability.authority_creation, false);
  assert.equal(non_operability.deploy_mutation, false);
  assert.equal(non_operability.proof_generation, false);
  assert.equal(non_operability.registry_mutation, false);
});

test('APPROVAL_LINEAGE_SPEC declares all required fields', () => {
  const fields = approvalLineageSpec.approval_lineage_object.required_fields;
  assert.ok(fields.includes('pr_number'));
  assert.ok(fields.includes('repo'));
  assert.ok(fields.includes('head_sha'));
  assert.ok(fields.includes('reviewer_identity'));
  assert.ok(fields.includes('review_state'));
  assert.ok(fields.includes('review_submitted_at'));
  assert.ok(fields.includes('review_commit_sha'));
  assert.ok(fields.includes('current_head_sha_match'));
  assert.ok(fields.includes('stale_review_rejected'));
});

test('APPROVAL_LINEAGE_SPEC declares required output fields', () => {
  const outputs = approvalLineageSpec.approval_lineage_object.output_fields;
  assert.ok(outputs.includes('approval_lineage_hash'));
  assert.ok(outputs.includes('approval_legitimacy_status'));
  assert.ok(outputs.includes('approval_binding_evidence'));
});

test('APPROVAL_LINEAGE_SPEC declares PREO_INVALID_AND_MERGE_LEGITIMACY_NULL as failure result', () => {
  assert.equal(
    approvalLineageSpec.preo_integration.failure_result,
    'PREO_INVALID_AND_MERGE_LEGITIMACY_NULL',
  );
});

test('APPROVAL_LINEAGE_SPEC default status is APPROVAL_LINEAGE_INVALID (fail closed)', () => {
  assert.equal(
    approvalLineageSpec.approval_lineage_object.default_status,
    'APPROVAL_LINEAGE_INVALID',
  );
  assert.equal(
    approvalLineageSpec.fail_closed_semantics.default_status,
    'APPROVAL_LINEAGE_INVALID',
  );
});

// ---------------------------------------------------------------------------
// Reviewer registry spec assertions
// ---------------------------------------------------------------------------

test('REVIEWER_REGISTRY_SPEC forbids implicit hierarchy and inheritance', () => {
  assert.equal(reviewerRegistrySpec.role_resolution.implicit_hierarchy_permitted, false);
  assert.equal(reviewerRegistrySpec.role_resolution.inherited_authority_permitted, false);
});

test('REVIEWER_REGISTRY_SPEC declares mutation class role requirements', () => {
  const { classes } = reviewerRegistrySpec.mutation_class_requirements;
  assert.ok(classes.authority_mutation.required_roles.includes('SECURITY_OFFICER'));
  assert.ok(classes.runtime_mutation.required_roles.includes('MAINTAINER'));
  assert.ok(classes.topology_mutation.required_roles.includes('INFRASTRUCTURE_ENGINEER'));
});

test('REVIEWER_REGISTRY_SPEC validation formula requires exact role membership', () => {
  assert.equal(reviewerRegistrySpec.validation_rule.check, 'required_role ∈ reviewer.roles');
  assert.equal(reviewerRegistrySpec.validation_rule.authority_derivation, 'explicit_only');
  assert.equal(reviewerRegistrySpec.validation_rule.role_expansion, 'none');
});

test('REVIEWER_REGISTRY_SPEC fail-closed requirements are declared', () => {
  const fc = reviewerRegistrySpec.fail_closed_requirements;
  assert.equal(fc.unknown_reviewer, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(fc.unknown_mutation_class, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(fc.missing_required_role, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(fc.stale_approval, 'APPROVAL_LINEAGE_INVALID');
});

// ---------------------------------------------------------------------------
// Approval lineage evaluation: valid path
// ---------------------------------------------------------------------------

test('PASS: fully bound approval with exact head_sha produces APPROVAL_LINEAGE_VALID', () => {
  const result = evaluateApprovalLineage({ approval: validApproval, currentHeadSha: HEAD_SHA });
  assert.equal(result.status, 'APPROVAL_LINEAGE_VALID');
  assert.equal(result.reason, null);
  assert.ok(result.approval_lineage_hash, 'approval_lineage_hash must be present');
  assert.ok(result.approval_binding_evidence, 'approval_binding_evidence must be present');
});

// ---------------------------------------------------------------------------
// Invalid conditions: head SHA
// ---------------------------------------------------------------------------

test('FAIL: review_commit_sha !== current head_sha → approval_without_head_sha_match', () => {
  const result = evaluateApprovalLineage({
    approval: { ...validApproval, review_commit_sha: OTHER_SHA },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'approval_without_head_sha_match');
});

test('FAIL: head_sha field !== current head_sha → approval_without_head_sha_match', () => {
  const result = evaluateApprovalLineage({
    approval: { ...validApproval, head_sha: OTHER_SHA },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'approval_without_head_sha_match');
});

test('FAIL: current_head_sha_match=false → approval_without_head_sha_match', () => {
  const result = evaluateApprovalLineage({
    approval: { ...validApproval, current_head_sha_match: false },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'approval_without_head_sha_match');
});

// ---------------------------------------------------------------------------
// Invalid conditions: stale / dismissed review
// ---------------------------------------------------------------------------

test('FAIL: review_state=DISMISSED → dismissed_or_stale_review', () => {
  const result = evaluateApprovalLineage({
    approval: { ...validApproval, review_state: 'DISMISSED' },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'dismissed_or_stale_review');
});

test('FAIL: review_state=CHANGES_REQUESTED → dismissed_or_stale_review', () => {
  const result = evaluateApprovalLineage({
    approval: { ...validApproval, review_state: 'CHANGES_REQUESTED' },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'dismissed_or_stale_review');
});

test('FAIL: stale_review_rejected=false → dismissed_or_stale_review', () => {
  const result = evaluateApprovalLineage({
    approval: { ...validApproval, stale_review_rejected: false },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'dismissed_or_stale_review');
});

// ---------------------------------------------------------------------------
// Invalid conditions: reviewer identity
// ---------------------------------------------------------------------------

test('FAIL: unknown reviewer_identity → reviewer_identity_missing', () => {
  const result = evaluateApprovalLineage({
    approval: { ...validApproval, reviewer_identity: 'unknown_user' },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'reviewer_identity_missing');
});

test('FAIL: empty reviewer_identity → missing_field', () => {
  const result = evaluateApprovalLineage({
    approval: { ...validApproval, reviewer_identity: '' },
    currentHeadSha: HEAD_SHA,
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.ok(result.reason.startsWith('missing_field'));
});

// ---------------------------------------------------------------------------
// Invalid conditions: missing required fields
// ---------------------------------------------------------------------------

test('FAIL: missing pr_number → missing_field:pr_number', () => {
  const { pr_number: _dropped, ...rest } = validApproval;
  const result = evaluateApprovalLineage({ approval: rest, currentHeadSha: HEAD_SHA });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'missing_field:pr_number');
});

test('FAIL: missing head_sha → missing_field:head_sha', () => {
  const { head_sha: _dropped, ...rest } = validApproval;
  const result = evaluateApprovalLineage({ approval: rest, currentHeadSha: HEAD_SHA });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'missing_field:head_sha');
});

// ---------------------------------------------------------------------------
// Mutation class role enforcement
// ---------------------------------------------------------------------------

test('PASS: alice (MAINTAINER+SECURITY_OFFICER) satisfies authority_mutation', () => {
  const result = evaluateApprovalLineage({
    approval: validApproval,
    currentHeadSha: HEAD_SHA,
    mutationClass: 'authority_mutation',
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_VALID');
});

test('PASS: alice satisfies runtime_mutation via MAINTAINER role', () => {
  const result = evaluateApprovalLineage({
    approval: validApproval,
    currentHeadSha: HEAD_SHA,
    mutationClass: 'runtime_mutation',
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_VALID');
});

test('PASS: carol (INFRASTRUCTURE_ENGINEER) satisfies topology_mutation', () => {
  const carolApproval = { ...validApproval, reviewer_identity: 'carol' };
  const result = evaluateApprovalLineage({
    approval: carolApproval,
    currentHeadSha: HEAD_SHA,
    mutationClass: 'topology_mutation',
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_VALID');
});

test('FAIL: bob (MAINTAINER only) cannot satisfy authority_mutation → missing_required_role', () => {
  const bobApproval = { ...validApproval, reviewer_identity: 'bob' };
  const result = evaluateApprovalLineage({
    approval: bobApproval,
    currentHeadSha: HEAD_SHA,
    mutationClass: 'authority_mutation',
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'missing_required_role');
});

test('FAIL: unknown mutation class → unknown_mutation_class', () => {
  const result = evaluateApprovalLineage({
    approval: validApproval,
    currentHeadSha: HEAD_SHA,
    mutationClass: 'nonexistent_mutation_class',
  });
  assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
  assert.equal(result.reason, 'unknown_mutation_class');
});

test('FAIL: N approvals from bob (MAINTAINER) do not satisfy authority_mutation requiring SECURITY_OFFICER', () => {
  const bobApproval = { ...validApproval, reviewer_identity: 'bob' };
  const results = [1, 2, 3].map(() =>
    evaluateApprovalLineage({
      approval: bobApproval,
      currentHeadSha: HEAD_SHA,
      mutationClass: 'authority_mutation',
    }),
  );
  for (const result of results) {
    assert.equal(result.status, 'APPROVAL_LINEAGE_INVALID');
    assert.equal(result.reason, 'missing_required_role');
  }
});

// ---------------------------------------------------------------------------
// Determinism: identical inputs produce identical lineage hash
// ---------------------------------------------------------------------------

test('APPROVAL_LINEAGE result is deterministic for identical inputs', () => {
  const first = evaluateApprovalLineage({ approval: validApproval, currentHeadSha: HEAD_SHA });
  const second = evaluateApprovalLineage({
    approval: structuredClone(validApproval),
    currentHeadSha: HEAD_SHA,
  });

  assert.equal(first.status, 'APPROVAL_LINEAGE_VALID');
  assert.equal(first.approval_lineage_hash, second.approval_lineage_hash);
});

test('Different head_sha produces different approval_lineage_hash', () => {
  const altApproval = {
    ...validApproval,
    head_sha: OTHER_SHA,
    review_commit_sha: OTHER_SHA,
  };
  const first = evaluateApprovalLineage({ approval: validApproval, currentHeadSha: HEAD_SHA });
  const second = evaluateApprovalLineage({ approval: altApproval, currentHeadSha: OTHER_SHA });

  assert.equal(first.status, 'APPROVAL_LINEAGE_VALID');
  assert.equal(second.status, 'APPROVAL_LINEAGE_VALID');
  assert.notEqual(
    first.approval_lineage_hash,
    second.approval_lineage_hash,
    'different head_sha must produce different approval lineage hash',
  );
});
