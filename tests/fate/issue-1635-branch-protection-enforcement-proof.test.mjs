import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const spec = JSON.parse(
  readFileSync(
    join(root, 'governance', 'preo', 'BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC.json'),
    'utf8',
  ),
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
// Branch-protection enforcement proof evaluator
//
// Boundary contract:
//   BRANCH_PROTECTION_ENFORCED requires live configuration evidence, not
//   policy declaration. Any missing, stale, bypassed, or misconfigured
//   protection condition fails closed.
// ---------------------------------------------------------------------------

function evaluateBranchProtectionProof({ config, emittedChecks = [], headSha, adminBypassUsed = false }) {
  const invalidReasons = [];

  // No config at all → branch_protection_disabled
  if (!config || !config.branch_protection_config_present) {
    return {
      enforcement_result: 'BRANCH_PROTECTION_ENFORCEMENT_INVALID',
      invalid_reasons: ['branch_protection_disabled'],
      emergency_exception_observed: false,
    };
  }

  // admin_bypass_used is always a hard failure, regardless of config
  if (adminBypassUsed) {
    return {
      enforcement_result: 'BRANCH_PROTECTION_ENFORCEMENT_INVALID',
      invalid_reasons: ['admin_bypass_used'],
      emergency_exception_observed: true,
      legitimacy_effect: 'NULL',
      requires_root_authority_containment: true,
    };
  }

  // admin_bypass_config_enabled → hard failure
  if (config.admin_bypass_config_enabled) {
    invalidReasons.push('admin_bypass_config_enabled');
  }

  // direct_push_restriction_state must be true
  if (!config.direct_push_restriction_state) {
    invalidReasons.push('direct_push_allowed');
  }

  // force_push_disabled_state must be true
  if (!config.force_push_disabled_state) {
    invalidReasons.push('force_push_allowed');
  }

  // branch_deletion_disabled_state must be true
  if (!config.branch_deletion_disabled_state) {
    invalidReasons.push('branch_deletion_allowed');
  }

  // dismiss_stale_reviews_state must be true
  if (!config.dismiss_stale_reviews_state) {
    invalidReasons.push('stale_review_dismissal_disabled');
  }

  // required_approving_review_count must be >= 1
  if (!config.required_approving_review_count || config.required_approving_review_count < 1) {
    invalidReasons.push('required_approvals_not_enforced');
  }

  // required_status_checks must each have an explicit mapping and a passing, non-stale emitted check
  const emittedCheckNamesByHeadSha = new Map();
  for (const check of emittedChecks) {
    if (!emittedCheckNamesByHeadSha.has(check.head_sha)) {
      emittedCheckNamesByHeadSha.set(check.head_sha, new Set());
    }
    if (check.status === 'COMPLETED' && check.conclusion === 'SUCCESS') {
      emittedCheckNamesByHeadSha.get(check.head_sha).add(check.name);
    }
  }

  const passingAtHead = emittedCheckNamesByHeadSha.get(headSha) ?? new Set();
  const mapping = config.emitted_check_name_mapping ?? {};

  for (const required of config.required_status_checks ?? []) {
    const aliases = mapping[required];

    if (!aliases || aliases.length === 0) {
      // No mapping entry → policy declared but not provably enforced
      invalidReasons.push('missing_required_check');
      continue;
    }

    // Check whether any alias passes at the exact head SHA
    const passingAliases = aliases.filter((alias) => passingAtHead.has(alias));
    if (passingAliases.length === 0) {
      // Alias exists but check was not emitted at this head SHA
      // Distinguish stale (emitted at a prior SHA) from not emitted at all
      const allEmittedNames = new Set(
        [...emittedCheckNamesByHeadSha.values()].flatMap((s) => [...s]),
      );
      const appearsElsewhere = aliases.some((alias) => allEmittedNames.has(alias));
      invalidReasons.push(appearsElsewhere ? 'stale_required_check' : 'required_check_not_emitted');
    }
  }

  if (invalidReasons.length > 0) {
    return {
      enforcement_result: 'BRANCH_PROTECTION_ENFORCEMENT_INVALID',
      invalid_reasons: invalidReasons,
      emergency_exception_observed: false,
    };
  }

  const proofHash = canonicalHash({
    target_branch: config.target_branch,
    repository: config.repository,
    required_status_checks: config.required_status_checks,
    emitted_check_name_mapping: config.emitted_check_name_mapping,
    required_approving_review_count: config.required_approving_review_count,
    dismiss_stale_reviews_state: config.dismiss_stale_reviews_state,
    direct_push_restriction_state: config.direct_push_restriction_state,
    force_push_disabled_state: config.force_push_disabled_state,
    branch_deletion_disabled_state: config.branch_deletion_disabled_state,
    conversation_resolution_requirement: config.conversation_resolution_requirement,
    fetched_at: config.fetched_at,
  });

  return {
    enforcement_result: 'BRANCH_PROTECTION_ENFORCED',
    invalid_reasons: [],
    emergency_exception_observed: false,
    enforcement_proof_hash: proofHash,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEAD_SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);

const PASSING_CHECKS = [
  { name: 'ci / lint', head_sha: HEAD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
  { name: 'ci / test', head_sha: HEAD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
];

const validConfig = Object.freeze({
  branch_protection_config_present: true,
  target_branch: 'main',
  repository: 'example/mindshift-demo',
  required_status_checks: ['lint', 'test'],
  emitted_check_name_mapping: {
    lint: ['ci / lint'],
    test: ['ci / test'],
  },
  required_approving_review_count: 1,
  dismiss_stale_reviews_state: true,
  direct_push_restriction_state: true,
  force_push_disabled_state: true,
  branch_deletion_disabled_state: true,
  conversation_resolution_requirement: true,
  admin_bypass_config_enabled: false,
  fetched_at: '2026-05-30T10:00:00Z',
});

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC defines non-operative governance boundaries', () => {
  const { non_operability } = spec;
  assert.equal(non_operability.merge_operations, false);
  assert.equal(non_operability.authority_creation, false);
  assert.equal(non_operability.deploy_mutation, false);
  assert.equal(non_operability.proof_generation, false);
  assert.equal(non_operability.registry_mutation, false);
  assert.equal(non_operability.enforcement_implementation, false);
});

test('BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC declares all required proof fields', () => {
  const fields = spec.enforcement_proof_object.required_fields;
  assert.ok(fields.includes('target_branch'));
  assert.ok(fields.includes('repository'));
  assert.ok(fields.includes('required_status_checks'));
  assert.ok(fields.includes('emitted_check_name_mapping'));
  assert.ok(fields.includes('required_approving_review_count'));
  assert.ok(fields.includes('dismiss_stale_reviews_state'));
  assert.ok(fields.includes('direct_push_restriction_state'));
  assert.ok(fields.includes('force_push_disabled_state'));
  assert.ok(fields.includes('branch_deletion_disabled_state'));
  assert.ok(fields.includes('conversation_resolution_requirement'));
  assert.ok(fields.includes('fetched_at'));
});

test('BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC declares PREO_INVALID_AND_MERGE_LEGITIMACY_NULL as failure result', () => {
  assert.equal(
    spec.preo_integration.failure_result,
    'PREO_INVALID_AND_MERGE_LEGITIMACY_NULL',
  );
});

test('BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC default result is BRANCH_PROTECTION_ENFORCEMENT_INVALID (fail closed)', () => {
  assert.equal(
    spec.enforcement_proof_object.default_result,
    'BRANCH_PROTECTION_ENFORCEMENT_INVALID',
  );
  assert.equal(
    spec.fail_closed_semantics.default_result,
    'BRANCH_PROTECTION_ENFORCEMENT_INVALID',
  );
});

test('BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC declares admin_bypass as hard failure', () => {
  assert.equal(
    spec.admin_bypass_determination.bypass_result,
    'BRANCH_PROTECTION_ENFORCEMENT_INVALID',
  );
  assert.equal(
    spec.admin_bypass_determination.emergency_exception_handling,
    'metadata_logging_only',
  );
  assert.equal(spec.admin_bypass_determination.legitimacy_substitution, 'forbidden');
});

test('BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC closes issue #1635', () => {
  assert.equal(spec.closes, '#1635');
});

// ---------------------------------------------------------------------------
// Valid path
// ---------------------------------------------------------------------------

test('PASS: fully enforced branch protection with all conditions satisfied produces BRANCH_PROTECTION_ENFORCED', () => {
  const result = evaluateBranchProtectionProof({
    config: validConfig,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCED');
  assert.deepEqual(result.invalid_reasons, []);
  assert.ok(result.enforcement_proof_hash, 'enforcement_proof_hash must be present');
  assert.equal(result.emergency_exception_observed, false);
});

// ---------------------------------------------------------------------------
// Invalid: policy declaration only (no live config)
// ---------------------------------------------------------------------------

test('FAIL: policy declared only (no branch_protection_config_present) → branch_protection_disabled', () => {
  const result = evaluateBranchProtectionProof({
    config: { branch_protection_config_present: false },
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('branch_protection_disabled'));
});

test('FAIL: null config → branch_protection_disabled', () => {
  const result = evaluateBranchProtectionProof({
    config: null,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('branch_protection_disabled'));
});

// ---------------------------------------------------------------------------
// Invalid: required check missing from mapping
// ---------------------------------------------------------------------------

test('FAIL: required check has no mapping entry → missing_required_check', () => {
  const config = { ...validConfig, emitted_check_name_mapping: { lint: ['ci / lint'] } };
  const result = evaluateBranchProtectionProof({
    config,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('missing_required_check'));
});

// ---------------------------------------------------------------------------
// Invalid: required check stale (emitted at prior SHA)
// ---------------------------------------------------------------------------

test('FAIL: required check emitted at prior commit SHA → stale_required_check', () => {
  const staleChecks = [
    { name: 'ci / lint', head_sha: OLD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
    { name: 'ci / test', head_sha: OLD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
  ];
  const result = evaluateBranchProtectionProof({
    config: validConfig,
    emittedChecks: staleChecks,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('stale_required_check'));
});

// ---------------------------------------------------------------------------
// Invalid: required check not passing
// ---------------------------------------------------------------------------

test('FAIL: required check emitted but not passing → required_check_not_emitted', () => {
  const failingChecks = [
    { name: 'ci / lint', head_sha: HEAD_SHA, status: 'COMPLETED', conclusion: 'FAILURE' },
    { name: 'ci / test', head_sha: HEAD_SHA, status: 'COMPLETED', conclusion: 'SUCCESS' },
  ];
  const result = evaluateBranchProtectionProof({
    config: validConfig,
    emittedChecks: failingChecks,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(
    result.invalid_reasons.includes('required_check_not_emitted') ||
    result.invalid_reasons.includes('stale_required_check'),
  );
});

// ---------------------------------------------------------------------------
// Invalid: admin_bypass_config_enabled
// ---------------------------------------------------------------------------

test('FAIL: admin_bypass_config_enabled=true → admin_bypass_config_enabled', () => {
  const config = { ...validConfig, admin_bypass_config_enabled: true };
  const result = evaluateBranchProtectionProof({
    config,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('admin_bypass_config_enabled'));
});

// ---------------------------------------------------------------------------
// Invalid: admin_bypass_used (hard failure with emergency_exception_observed)
// ---------------------------------------------------------------------------

test('FAIL: admin_bypass_used=true → INVALID + emergency_exception_observed', () => {
  const result = evaluateBranchProtectionProof({
    config: validConfig,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
    adminBypassUsed: true,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('admin_bypass_used'));
  assert.equal(result.emergency_exception_observed, true);
  assert.equal(result.legitimacy_effect, 'NULL');
});

test('FAIL: admin_bypass_used overrides otherwise-valid config → INVALID', () => {
  const result = evaluateBranchProtectionProof({
    config: validConfig,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
    adminBypassUsed: true,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('admin_bypass_used'));
});

// ---------------------------------------------------------------------------
// Invalid: required approvals not enforced
// ---------------------------------------------------------------------------

test('FAIL: required_approving_review_count=0 → required_approvals_not_enforced', () => {
  const config = { ...validConfig, required_approving_review_count: 0 };
  const result = evaluateBranchProtectionProof({
    config,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('required_approvals_not_enforced'));
});

// ---------------------------------------------------------------------------
// Invalid: stale review dismissal disabled
// ---------------------------------------------------------------------------

test('FAIL: dismiss_stale_reviews_state=false → stale_review_dismissal_disabled', () => {
  const config = { ...validConfig, dismiss_stale_reviews_state: false };
  const result = evaluateBranchProtectionProof({
    config,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('stale_review_dismissal_disabled'));
});

// ---------------------------------------------------------------------------
// Invalid: direct push allowed
// ---------------------------------------------------------------------------

test('FAIL: direct_push_restriction_state=false → direct_push_allowed', () => {
  const config = { ...validConfig, direct_push_restriction_state: false };
  const result = evaluateBranchProtectionProof({
    config,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('direct_push_allowed'));
});

// ---------------------------------------------------------------------------
// Invalid: force push allowed
// ---------------------------------------------------------------------------

test('FAIL: force_push_disabled_state=false → force_push_allowed', () => {
  const config = { ...validConfig, force_push_disabled_state: false };
  const result = evaluateBranchProtectionProof({
    config,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('force_push_allowed'));
});

// ---------------------------------------------------------------------------
// Invalid: branch deletion allowed
// ---------------------------------------------------------------------------

test('FAIL: branch_deletion_disabled_state=false → branch_deletion_allowed', () => {
  const config = { ...validConfig, branch_deletion_disabled_state: false };
  const result = evaluateBranchProtectionProof({
    config,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('branch_deletion_allowed'));
});

// ---------------------------------------------------------------------------
// Multiple simultaneous failures accumulate
// ---------------------------------------------------------------------------

test('FAIL: multiple invalid conditions accumulate in invalid_reasons', () => {
  const config = {
    ...validConfig,
    force_push_disabled_state: false,
    direct_push_restriction_state: false,
    dismiss_stale_reviews_state: false,
  };
  const result = evaluateBranchProtectionProof({
    config,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  assert.equal(result.enforcement_result, 'BRANCH_PROTECTION_ENFORCEMENT_INVALID');
  assert.ok(result.invalid_reasons.includes('force_push_allowed'));
  assert.ok(result.invalid_reasons.includes('direct_push_allowed'));
  assert.ok(result.invalid_reasons.includes('stale_review_dismissal_disabled'));
});

// ---------------------------------------------------------------------------
// Boundary: enforcement proof is not merge legitimacy
// ---------------------------------------------------------------------------

test('BRANCH_PROTECTION_ENFORCED does not claim merge legitimacy', () => {
  assert.ok(
    spec.preo_integration.enforcement_proof_is_not_merge_legitimacy
      .toLowerCase()
      .includes('does not by itself establish merge legitimacy'),
  );
});

test('BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC positions enforcement in gate chain', () => {
  assert.ok(spec.preo_integration.gate_chain.includes('BRANCH_PROTECTION_ENFORCED'));
  assert.ok(spec.preo_integration.gate_chain.includes('PREO_VALID'));
  assert.ok(spec.preo_integration.gate_chain.includes('SCO_VALID'));
  assert.ok(spec.preo_integration.gate_chain.includes('APPROVAL_LINEAGE_VALID'));
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('Enforcement proof result is deterministic for identical inputs', () => {
  const first = evaluateBranchProtectionProof({
    config: validConfig,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  const second = evaluateBranchProtectionProof({
    config: structuredClone(validConfig),
    emittedChecks: structuredClone(PASSING_CHECKS),
    headSha: HEAD_SHA,
  });

  assert.equal(first.enforcement_result, 'BRANCH_PROTECTION_ENFORCED');
  assert.equal(first.enforcement_proof_hash, second.enforcement_proof_hash);
});

test('Different target_branch produces different enforcement_proof_hash', () => {
  const altConfig = { ...validConfig, target_branch: 'release' };
  const first = evaluateBranchProtectionProof({
    config: validConfig,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });
  const second = evaluateBranchProtectionProof({
    config: altConfig,
    emittedChecks: PASSING_CHECKS,
    headSha: HEAD_SHA,
  });

  assert.equal(first.enforcement_result, 'BRANCH_PROTECTION_ENFORCED');
  assert.equal(second.enforcement_result, 'BRANCH_PROTECTION_ENFORCED');
  assert.notEqual(
    first.enforcement_proof_hash,
    second.enforcement_proof_hash,
    'different target_branch must produce different enforcement proof hash',
  );
});
