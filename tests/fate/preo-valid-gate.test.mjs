import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const preoValidSpec = JSON.parse(
  readFileSync(join(root, 'governance', 'preo', 'PREO_VALID_SPEC.json'), 'utf8'),
);
const evidenceSnapshotSpec = JSON.parse(
  readFileSync(join(root, 'governance', 'preo', 'EVIDENCE_SNAPSHOT_SPEC.json'), 'utf8'),
);

// ---------------------------------------------------------------------------
// Canonical hash — determinism assertion depends on stable ordering
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
// PREO_CANDIDATE → PREO_VALID | PREO_INVALID transition
//
// Boundary contract:
//   PREO_VALID can only derive from a canonical EvidenceSnapshot.
//   Workflow success, branch state, and admin approval are not substitutes.
//   Any missing, stale, ambiguous, or unresolved evidence fails closed.
// ---------------------------------------------------------------------------

function transitionPreoCandidate({ candidate, snapshot }) {
  // PREO_VALID requires a canonical EvidenceSnapshot with an anchor.
  if (!snapshot || !snapshot.anchor) {
    return { result: 'PREO_INVALID', reason: 'missing_evidence_snapshot' };
  }

  if (!snapshot.anchor.head_sha) {
    return { result: 'PREO_INVALID', reason: 'missing_head_sha' };
  }

  const headSha = snapshot.anchor.head_sha;

  if (candidate.head_sha !== headSha) {
    return { result: 'PREO_INVALID', reason: 'head_sha_mismatch' };
  }

  // Any review not bound to the exact head_sha is stale evidence.
  for (const review of snapshot.reviews ?? []) {
    if (review.commit_sha !== headSha) {
      return { result: 'PREO_INVALID', reason: 'stale_review_evidence' };
    }
  }

  // Any check not bound to the exact head_sha is stale evidence.
  for (const check of snapshot.emitted_checks ?? []) {
    if (check.head_sha !== headSha) {
      return { result: 'PREO_INVALID', reason: 'stale_check_evidence' };
    }
  }

  // Required checks must resolve via explicit alias map — no heuristics.
  const requiredChecks = snapshot.branch_protection?.required_status_checks ?? [];
  const aliasMap = snapshot.branch_protection?.required_checks_alias_map ?? {};
  const passingChecks = new Set(
    (snapshot.emitted_checks ?? [])
      .filter((c) => c.head_sha === headSha && c.status === 'COMPLETED' && c.conclusion === 'SUCCESS')
      .map((c) => c.name),
  );

  for (const required of requiredChecks) {
    const aliases = aliasMap[required] ?? [];
    const matched = aliases.filter((alias) => passingChecks.has(alias));

    if (matched.length === 0) {
      return { result: 'PREO_INVALID', reason: 'required_check_missing' };
    }
    if (matched.length > 1) {
      return { result: 'PREO_INVALID', reason: 'ambiguous_required_check_alias' };
    }
  }

  // All required approvals must be present and bound to the exact head_sha.
  const requiredApprovals = snapshot.branch_protection?.required_approving_review_count ?? 1;
  const approvals = (snapshot.reviews ?? []).filter(
    (r) => r.state === 'APPROVED' && r.commit_sha === headSha,
  );
  if (approvals.length < requiredApprovals) {
    return { result: 'PREO_INVALID', reason: 'review_requirements_not_satisfied' };
  }

  return { result: 'PREO_VALID', reason: null };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEAD_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

const canonicalSnapshot = Object.freeze({
  anchor: {
    repository: 'example/mindshift-demo',
    pull_request_id: 7,
    head_sha: HEAD_SHA,
    base_branch: 'main',
    head_branch: 'governance/preo-valid',
  },
  reviews: [
    {
      reviewer_login: 'approver',
      reviewer_id: 1,
      state: 'APPROVED',
      submitted_at: '2026-05-30T00:00:00Z',
      commit_sha: HEAD_SHA,
    },
  ],
  emitted_checks: [
    { name: 'merge-governance-check', head_sha: HEAD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
    { name: 'generate-preo-candidate', head_sha: HEAD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
    { name: 'generate-sco-candidate', head_sha: HEAD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
  ],
  branch_protection: {
    required_status_checks: [
      'merge-governance-check',
      'generate-preo-candidate',
      'generate-sco-candidate',
    ],
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    required_checks_alias_map: {
      'merge-governance-check': ['merge-governance-check'],
      'generate-preo-candidate': ['generate-preo-candidate'],
      'generate-sco-candidate': ['generate-sco-candidate'],
    },
  },
  provider_metadata: { provider: 'github', api_version: '2022-11-28', normalized_at: '2026-05-30T00:00:00Z' },
  capture_timestamp: '2026-05-30T00:00:00Z',
});

const candidateBase = Object.freeze({
  preo_id: 'PREO-7-aaa',
  pr_number: 7,
  repo: 'example/mindshift-demo',
  base_branch: 'main',
  head_branch: 'governance/preo-valid',
  head_sha: HEAD_SHA,
  changed_files: ['governance/preo/PREO_VALID_SPEC.json'],
  review_status: 'APPROVED_FOR_HEAD_SHA',
  checks_status: 'REQUIRED_CHECKS_PASSING_FOR_HEAD_SHA',
  risk_class: 'P2',
  created_at: '2026-05-30T00:00:00Z',
  status: 'PREO_CANDIDATE',
});

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('PREO_VALID spec defines merge legitimacy gate', () => {
  assert.equal(
    preoValidSpec.merge_legitimacy_gate.merge_legitimacy_without_preo_valid,
    'NULL',
    'merge legitimacy without PREO_VALID must be NULL',
  );
  assert.equal(
    preoValidSpec.merge_legitimacy_gate.workflow_success_as_substitute_for_preo_valid,
    'forbidden',
    'workflow success must not substitute for PREO_VALID',
  );
  assert.equal(
    preoValidSpec.merge_legitimacy_gate.admin_bypass_as_substitute_for_preo_valid,
    'forbidden',
    'admin bypass must not substitute for PREO_VALID',
  );
});

test('PREO_VALID spec declares non-operative boundaries', () => {
  const { non_operability } = preoValidSpec;
  assert.equal(non_operability.merge_operations, false, 'PREO_VALID must not perform merge operations');
  assert.equal(non_operability.deploy_mutation, false, 'PREO_VALID must not mutate deployments');
  assert.equal(non_operability.proof_generation, false, 'PREO_VALID must not generate proof');
  assert.equal(non_operability.authority_creation, false, 'PREO_VALID must not create authority');
});

test('EvidenceSnapshot spec requires deterministic normalization pipeline', () => {
  const stages = evidenceSnapshotSpec.normalization_pipeline.stages.map((s) => s.name);
  assert.ok(stages.includes('raw_provider_response'), 'pipeline must include raw_provider_response');
  assert.ok(stages.includes('canonical_evidence_snapshot'), 'pipeline must include canonical_evidence_snapshot');
  assert.ok(stages.includes('preo_valid_or_preo_invalid'), 'pipeline must include preo_valid_or_preo_invalid');
  assert.equal(
    evidenceSnapshotSpec.canonical_snapshot_requirements.identical_inputs_produce_identical_snapshots,
    true,
  );
  assert.equal(
    evidenceSnapshotSpec.canonical_snapshot_requirements.missing_or_ambiguous_normalization_fails_closed,
    true,
  );
});

// ---------------------------------------------------------------------------
// Transition boundary tests
// ---------------------------------------------------------------------------

test('PASS: canonical EvidenceSnapshot with exact bindings produces PREO_VALID', () => {
  const result = transitionPreoCandidate({ candidate: candidateBase, snapshot: canonicalSnapshot });
  assert.equal(result.result, 'PREO_VALID');
  assert.equal(result.reason, null);
});

test('FAIL: PREO_CANDIDATE alone without EvidenceSnapshot produces PREO_INVALID', () => {
  const result = transitionPreoCandidate({ candidate: candidateBase, snapshot: null });
  assert.equal(result.result, 'PREO_INVALID');
});

test('FAIL: workflow_success only (non-canonical snapshot) produces PREO_INVALID', () => {
  // workflow_success is not a canonical EvidenceSnapshot and must not satisfy PREO_VALID.
  const result = transitionPreoCandidate({
    candidate: candidateBase,
    snapshot: { workflow_success: true },
  });
  assert.equal(result.result, 'PREO_INVALID');
});

test('FAIL: missing head_sha in snapshot anchor produces PREO_INVALID: missing_head_sha', () => {
  const snapshot = {
    ...canonicalSnapshot,
    anchor: { ...canonicalSnapshot.anchor, head_sha: undefined },
  };
  const result = transitionPreoCandidate({ candidate: candidateBase, snapshot });
  assert.equal(result.result, 'PREO_INVALID');
  assert.equal(result.reason, 'missing_head_sha');
});

test('FAIL: review commit_sha !== head_sha produces PREO_INVALID: stale_review_evidence', () => {
  const snapshot = {
    ...canonicalSnapshot,
    reviews: [{ ...canonicalSnapshot.reviews[0], commit_sha: OTHER_SHA }],
  };
  const result = transitionPreoCandidate({ candidate: candidateBase, snapshot });
  assert.equal(result.result, 'PREO_INVALID');
  assert.equal(result.reason, 'stale_review_evidence');
});

test('FAIL: check head_sha !== head_sha produces PREO_INVALID: stale_check_evidence', () => {
  const snapshot = {
    ...canonicalSnapshot,
    emitted_checks: [
      { ...canonicalSnapshot.emitted_checks[0], head_sha: OTHER_SHA },
      ...canonicalSnapshot.emitted_checks.slice(1),
    ],
  };
  const result = transitionPreoCandidate({ candidate: candidateBase, snapshot });
  assert.equal(result.result, 'PREO_INVALID');
  assert.equal(result.reason, 'stale_check_evidence');
});

test('FAIL: required check absent from emitted checks produces PREO_INVALID: required_check_missing', () => {
  const snapshot = {
    ...canonicalSnapshot,
    branch_protection: {
      ...canonicalSnapshot.branch_protection,
      required_status_checks: [
        ...canonicalSnapshot.branch_protection.required_status_checks,
        'preo-valid-gate',
      ],
      required_checks_alias_map: {
        ...canonicalSnapshot.branch_protection.required_checks_alias_map,
        'preo-valid-gate': ['preo-valid-gate'],
      },
    },
  };
  const result = transitionPreoCandidate({ candidate: candidateBase, snapshot });
  assert.equal(result.result, 'PREO_INVALID');
  assert.equal(result.reason, 'required_check_missing');
});

test('FAIL: ambiguous check alias produces PREO_INVALID: ambiguous_required_check_alias', () => {
  const snapshot = {
    ...canonicalSnapshot,
    emitted_checks: [
      ...canonicalSnapshot.emitted_checks,
      { name: 'merge-governance-check-alt', head_sha: HEAD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
    ],
    branch_protection: {
      ...canonicalSnapshot.branch_protection,
      required_checks_alias_map: {
        ...canonicalSnapshot.branch_protection.required_checks_alias_map,
        'merge-governance-check': ['merge-governance-check', 'merge-governance-check-alt'],
      },
    },
  };
  const result = transitionPreoCandidate({ candidate: candidateBase, snapshot });
  assert.equal(result.result, 'PREO_INVALID');
  assert.equal(result.reason, 'ambiguous_required_check_alias');
});

// ---------------------------------------------------------------------------
// Determinism: identical EvidenceSnapshot inputs produce identical results
// ---------------------------------------------------------------------------

test('PREO_VALID result is deterministic from canonical EvidenceSnapshot', () => {
  const first = transitionPreoCandidate({ candidate: candidateBase, snapshot: canonicalSnapshot });
  const second = transitionPreoCandidate({
    candidate: candidateBase,
    snapshot: structuredClone(canonicalSnapshot),
  });

  assert.equal(first.result, 'PREO_VALID');
  assert.equal(first.result, second.result, 'identical snapshot inputs must produce identical result');
  assert.equal(
    canonicalHash(canonicalSnapshot),
    canonicalHash(structuredClone(canonicalSnapshot)),
    'snapshot hash must be deterministic',
  );
});

test('different head_sha produces different snapshot hash', () => {
  const altSnapshot = {
    ...canonicalSnapshot,
    anchor: { ...canonicalSnapshot.anchor, head_sha: OTHER_SHA },
    reviews: [{ ...canonicalSnapshot.reviews[0], commit_sha: OTHER_SHA }],
    emitted_checks: canonicalSnapshot.emitted_checks.map((c) => ({ ...c, head_sha: OTHER_SHA })),
  };

  assert.notEqual(
    canonicalHash(altSnapshot),
    canonicalHash(canonicalSnapshot),
    'changed head_sha must change snapshot hash',
  );
});
