import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const mergeProofSpec = JSON.parse(
  readFileSync(join(root, 'governance', 'preo', 'MERGE_PROOF_SPEC.json'), 'utf8'),
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
// Merge proof generation logic
//
// Boundary contract:
//   MERGE_PROOF_VALID binds the merge event to the full validated
//   merge-legitimacy chain via hashes: preo_valid_hash, sco_valid_hash (when
//   required), approval_lineage_hash, branch_protection_enforcement_hash,
//   validated_head_sha, and the resulting merge_commit_sha. The validator
//   signature over the canonical_proof_hash is the trust anchor. The merge
//   actor is evidence, not the trust anchor. Any missing or invalid input
//   fails closed to MERGE_LEGITIMACY_NULL.
//
//   MERGE_PROOF_VALID = recorded finality evidence, not merge authorization.
// ---------------------------------------------------------------------------

const VALIDATOR_KEY_ID = 'governance-validator-v1';

function simulateValidatorSignature(proofHash, keyId) {
  return canonicalHash({ proof_hash: proofHash, key_id: keyId });
}

function generateMergeProof({
  preoValidHash,
  scoValidHash,
  scoRequired,
  approvalLineageHash,
  branchProtectionEnforcementHash,
  validatedHeadSha,
  mergeCommitSha,
  mergeMethod,
  mergedBy,
  mergedAt,
}) {
  if (!preoValidHash) {
    return { result: 'MERGE_LEGITIMACY_NULL', reason: 'missing_preo_valid_hash' };
  }

  if (scoRequired && !scoValidHash) {
    return { result: 'MERGE_LEGITIMACY_NULL', reason: 'missing_sco_valid_hash' };
  }

  if (!approvalLineageHash) {
    return { result: 'MERGE_LEGITIMACY_NULL', reason: 'missing_approval_lineage_hash' };
  }

  if (!branchProtectionEnforcementHash) {
    return { result: 'MERGE_LEGITIMACY_NULL', reason: 'missing_branch_protection_enforcement_hash' };
  }

  if (!mergeCommitSha) {
    return { result: 'MERGE_LEGITIMACY_NULL', reason: 'missing_merge_commit_sha' };
  }

  if (!mergedBy) {
    return { result: 'MERGE_LEGITIMACY_NULL', reason: 'missing_merge_actor' };
  }

  if (!mergedAt) {
    return { result: 'MERGE_LEGITIMACY_NULL', reason: 'missing_merge_timestamp' };
  }

  // Build the canonical proof binding — all fields are flat at the top level.
  const proofFields = sortCanonical({
    preo_valid_hash: preoValidHash,
    sco_valid_hash: scoRequired ? scoValidHash : null,
    approval_lineage_hash: approvalLineageHash,
    branch_protection_enforcement_hash: branchProtectionEnforcementHash,
    validated_head_sha: validatedHeadSha,
    merge_commit_sha: mergeCommitSha,
    merge_method: mergeMethod,
    merged_by: mergedBy,
    merged_at: mergedAt,
  });

  const canonicalProofHash = canonicalHash(proofFields);
  const validatorSignature = simulateValidatorSignature(canonicalProofHash, VALIDATOR_KEY_ID);

  return {
    result: 'MERGE_PROOF_VALID',
    proof: {
      preo_valid_hash: preoValidHash,
      sco_valid_hash: scoRequired ? scoValidHash : null,
      approval_lineage_hash: approvalLineageHash,
      branch_protection_enforcement_hash: branchProtectionEnforcementHash,
      validated_head_sha: validatedHeadSha,
      merge_commit_sha: mergeCommitSha,
      merge_method: mergeMethod,
      merged_by: mergedBy,
      merged_at: mergedAt,
      validator_key_id: VALIDATOR_KEY_ID,
      validator_signature: validatorSignature,
      canonical_proof_hash: canonicalProofHash,
    },
  };
}

function verifyMergeProof(proof) {
  if (!proof.canonical_proof_hash) {
    return { valid: false, reason: 'proof_hash_mismatch' };
  }
  if (!proof.validator_key_id) {
    return { valid: false, reason: 'missing_validator_key_id' };
  }
  if (!proof.validator_signature) {
    return { valid: false, reason: 'missing_validator_signature' };
  }

  const expectedSignature = simulateValidatorSignature(proof.canonical_proof_hash, proof.validator_key_id);
  if (proof.validator_signature !== expectedSignature) {
    return { valid: false, reason: 'proof_hash_mismatch' };
  }

  return { valid: true, reason: null };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEAD_SHA = 'a'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);

const PREO_VALID_HASH = canonicalHash({ gate: 'PREO_VALID', head_sha: HEAD_SHA });
const SCO_VALID_HASH = canonicalHash({ gate: 'SCO_VALID', head_sha: HEAD_SHA });
const APPROVAL_LINEAGE_HASH = canonicalHash({ gate: 'APPROVAL_LINEAGE', head_sha: HEAD_SHA });
const BRANCH_PROTECTION_HASH = canonicalHash({ gate: 'BRANCH_PROTECTION', head_sha: HEAD_SHA });

const baseProofInput = Object.freeze({
  preoValidHash: PREO_VALID_HASH,
  scoValidHash: SCO_VALID_HASH,
  scoRequired: false,
  approvalLineageHash: APPROVAL_LINEAGE_HASH,
  branchProtectionEnforcementHash: BRANCH_PROTECTION_HASH,
  validatedHeadSha: HEAD_SHA,
  mergeCommitSha: MERGE_SHA,
  mergeMethod: 'merge',
  mergedBy: 'bot-governor',
  mergedAt: '2026-05-30T12:00:00Z',
});

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('MERGE_PROOF_SPEC defines non-operative governance boundaries', () => {
  const { non_operability } = mergeProofSpec;
  assert.equal(non_operability.merge_operations, false);
  assert.equal(non_operability.authority_creation, false);
  assert.equal(non_operability.deploy_mutation, false);
  assert.equal(non_operability.proof_generation, false);
  assert.equal(non_operability.runtime_mutation, false);
  assert.equal(non_operability.registry_mutation, false);
});

test('MERGE_PROOF_SPEC non_goals forbid authority, execution, deployment, and merge permission creation', () => {
  const { non_goals } = mergeProofSpec;
  assert.equal(non_goals.creates_authority, false);
  assert.equal(non_goals.creates_execution, false);
  assert.equal(non_goals.creates_deployment, false);
  assert.equal(non_goals.creates_merge_permission, false);
});

test('MERGE_PROOF_SPEC declares the minimum binding set of required fields', () => {
  const fields = mergeProofSpec.merge_proof_object.required_fields;
  assert.ok(fields.includes('preo_valid_hash'));
  assert.ok(fields.includes('sco_valid_hash'));
  assert.ok(fields.includes('approval_lineage_hash'));
  assert.ok(fields.includes('branch_protection_enforcement_hash'));
  assert.ok(fields.includes('validated_head_sha'));
  assert.ok(fields.includes('merge_commit_sha'));
  assert.ok(fields.includes('merge_method'));
  assert.ok(fields.includes('merged_by'));
  assert.ok(fields.includes('merged_at'));
  assert.ok(fields.includes('validator_key_id'));
  assert.ok(fields.includes('validator_signature'));
  assert.ok(fields.includes('canonical_proof_hash'));
});

test('MERGE_PROOF_SPEC required_fields use hashes not IDs as binding artifacts', () => {
  const fields = mergeProofSpec.merge_proof_object.required_fields;
  assert.ok(!fields.includes('preo_valid_id'), 'preo_valid_id must not be in required_fields');
  assert.ok(!fields.includes('sco_valid_id'), 'sco_valid_id must not be in required_fields');
  assert.ok(!fields.includes('sco_valid_id_when_required'), 'sco_valid_id_when_required must not be in required_fields');
  assert.ok(fields.includes('preo_valid_hash'), 'preo_valid_hash must be the binding artifact');
  assert.ok(fields.includes('sco_valid_hash'), 'sco_valid_hash must be the binding artifact');
});

test('MERGE_PROOF_SPEC object_type is MERGE_PROOF_VALID', () => {
  assert.equal(mergeProofSpec.merge_proof_object.object_type, 'MERGE_PROOF_VALID');
});

test('MERGE_PROOF_SPEC default_result is MERGE_LEGITIMACY_NULL (fail closed)', () => {
  assert.equal(mergeProofSpec.merge_proof_object.default_result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(mergeProofSpec.merge_proof_object.failure_result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(mergeProofSpec.fail_closed_semantics.default_result, 'MERGE_LEGITIMACY_NULL');
});

test('MERGE_PROOF_SPEC declares all core invalid conditions', () => {
  const ic = mergeProofSpec.invalid_conditions;
  assert.ok(ic.missing_preo_valid_hash);
  assert.ok(ic.missing_sco_valid_hash);
  assert.ok(ic.missing_approval_lineage_hash);
  assert.ok(ic.missing_branch_protection_enforcement_hash);
  assert.ok(ic.missing_merge_commit_sha);
  assert.ok(ic.merge_commit_not_bound_to_validated_head_sha);
  assert.ok(ic.stale_validated_head_sha);
  assert.ok(ic.missing_validator_signature);
  assert.ok(ic.proof_hash_mismatch);
});

test('MERGE_PROOF_SPEC trust_anchor declares validator as attestation, merge actor as evidence', () => {
  const ta = mergeProofSpec.trust_anchor;
  assert.ok(ta.merge_actor_is_evidence);
  assert.ok(ta.validator_is_attestation);
  assert.ok(ta.rule.includes('trust anchor'));
});

test('MERGE_PROOF_SPEC canonical_compression declares finality evidence not authorization', () => {
  const cc = mergeProofSpec.canonical_compression;
  assert.ok(cc.rule_5.includes('finality evidence'));
  assert.ok(cc.rule_5.includes('not merge authorization'));
});

test('MERGE_PROOF_SPEC requires deterministic artifact', () => {
  assert.equal(mergeProofSpec.deterministic_artifact.required, true);
  assert.equal(mergeProofSpec.deterministic_artifact.proof_hash_must_be_deterministic, true);
});

// ---------------------------------------------------------------------------
// Proof generation: valid path
// ---------------------------------------------------------------------------

test('PASS: fully bound merge event produces MERGE_PROOF_VALID', () => {
  const result = generateMergeProof(baseProofInput);
  assert.equal(result.result, 'MERGE_PROOF_VALID');
  assert.ok(result.proof.canonical_proof_hash, 'canonical_proof_hash must be present');
  assert.ok(result.proof.validator_signature, 'validator_signature must be present');
  assert.equal(result.proof.validator_key_id, VALIDATOR_KEY_ID);
  assert.equal(result.proof.merge_commit_sha, MERGE_SHA);
  assert.equal(result.proof.validated_head_sha, HEAD_SHA);
  assert.equal(result.proof.preo_valid_hash, PREO_VALID_HASH);
  assert.equal(result.proof.merged_by, 'bot-governor');
});

test('PASS: proof with SCO required binds sco_valid_hash in the flat binding set', () => {
  const result = generateMergeProof({ ...baseProofInput, scoRequired: true });
  assert.equal(result.result, 'MERGE_PROOF_VALID');
  assert.equal(result.proof.sco_valid_hash, SCO_VALID_HASH);
});

test('PASS: proof without SCO required records sco_valid_hash as null', () => {
  const result = generateMergeProof({ ...baseProofInput, scoRequired: false });
  assert.equal(result.result, 'MERGE_PROOF_VALID');
  assert.equal(result.proof.sco_valid_hash, null);
});

// ---------------------------------------------------------------------------
// Invalid conditions: missing gate hashes
// ---------------------------------------------------------------------------

test('FAIL: missing preo_valid_hash → missing_preo_valid_hash → MERGE_LEGITIMACY_NULL', () => {
  const result = generateMergeProof({ ...baseProofInput, preoValidHash: null });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(result.reason, 'missing_preo_valid_hash');
});

test('FAIL: sco_required with missing sco_valid_hash → missing_sco_valid_hash', () => {
  const result = generateMergeProof({ ...baseProofInput, scoRequired: true, scoValidHash: null });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(result.reason, 'missing_sco_valid_hash');
});

test('FAIL: missing approval_lineage_hash → missing_approval_lineage_hash', () => {
  const result = generateMergeProof({ ...baseProofInput, approvalLineageHash: null });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(result.reason, 'missing_approval_lineage_hash');
});

test('FAIL: missing branch_protection_enforcement_hash → missing_branch_protection_enforcement_hash', () => {
  const result = generateMergeProof({ ...baseProofInput, branchProtectionEnforcementHash: null });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(result.reason, 'missing_branch_protection_enforcement_hash');
});

// ---------------------------------------------------------------------------
// Invalid conditions: missing merge event fields
// ---------------------------------------------------------------------------

test('FAIL: missing merge_commit_sha → missing_merge_commit_sha → MERGE_LEGITIMACY_NULL', () => {
  const result = generateMergeProof({ ...baseProofInput, mergeCommitSha: null });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(result.reason, 'missing_merge_commit_sha');
});

test('FAIL: missing merged_by → missing_merge_actor → MERGE_LEGITIMACY_NULL', () => {
  const result = generateMergeProof({ ...baseProofInput, mergedBy: null });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(result.reason, 'missing_merge_actor');
});

test('FAIL: missing merged_at → missing_merge_timestamp → MERGE_LEGITIMACY_NULL', () => {
  const result = generateMergeProof({ ...baseProofInput, mergedAt: null });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(result.reason, 'missing_merge_timestamp');
});

// ---------------------------------------------------------------------------
// Proof verification: canonical_proof_hash and validator_signature
// ---------------------------------------------------------------------------

test('PASS: valid proof verifies successfully', () => {
  const { proof } = generateMergeProof(baseProofInput);
  const verification = verifyMergeProof(proof);
  assert.equal(verification.valid, true);
  assert.equal(verification.reason, null);
});

test('FAIL: tampered canonical_proof_hash → proof_hash_mismatch', () => {
  const { proof } = generateMergeProof(baseProofInput);
  const tampered = { ...proof, canonical_proof_hash: 'tampered_hash_value' };
  const verification = verifyMergeProof(tampered);
  assert.equal(verification.valid, false);
  assert.equal(verification.reason, 'proof_hash_mismatch');
});

test('FAIL: missing canonical_proof_hash → proof_hash_mismatch', () => {
  const { proof } = generateMergeProof(baseProofInput);
  const { canonical_proof_hash: _dropped, ...tampered } = proof;
  const verification = verifyMergeProof(tampered);
  assert.equal(verification.valid, false);
  assert.equal(verification.reason, 'proof_hash_mismatch');
});

test('FAIL: missing validator_key_id → missing_validator_key_id', () => {
  const { proof } = generateMergeProof(baseProofInput);
  const { validator_key_id: _dropped, ...tampered } = proof;
  const verification = verifyMergeProof(tampered);
  assert.equal(verification.valid, false);
  assert.equal(verification.reason, 'missing_validator_key_id');
});

test('FAIL: missing validator_signature → missing_validator_signature', () => {
  const { proof } = generateMergeProof(baseProofInput);
  const { validator_signature: _dropped, ...tampered } = proof;
  const verification = verifyMergeProof(tampered);
  assert.equal(verification.valid, false);
  assert.equal(verification.reason, 'missing_validator_signature');
});

test('FAIL: forged validator_signature → proof_hash_mismatch', () => {
  const { proof } = generateMergeProof(baseProofInput);
  const tampered = { ...proof, validator_signature: 'forged_signature' };
  const verification = verifyMergeProof(tampered);
  assert.equal(verification.valid, false);
  assert.equal(verification.reason, 'proof_hash_mismatch');
});

// ---------------------------------------------------------------------------
// Lineage binding: all gate hashes are flat and bound to validated_head_sha
// ---------------------------------------------------------------------------

test('proof fields are flat — no nested gate_hashes object', () => {
  const { proof } = generateMergeProof(baseProofInput);
  assert.ok(!('gate_hashes' in proof), 'proof must not contain nested gate_hashes');
  assert.ok('preo_valid_hash' in proof);
  assert.ok('approval_lineage_hash' in proof);
  assert.ok('branch_protection_enforcement_hash' in proof);
});

test('all gate hashes in proof bind to the same validated_head_sha', () => {
  const { proof } = generateMergeProof({ ...baseProofInput, scoRequired: true });
  assert.equal(proof.validated_head_sha, HEAD_SHA);
  assert.equal(proof.preo_valid_hash, PREO_VALID_HASH);
  assert.equal(proof.sco_valid_hash, SCO_VALID_HASH);
  assert.equal(proof.approval_lineage_hash, APPROVAL_LINEAGE_HASH);
  assert.equal(proof.branch_protection_enforcement_hash, BRANCH_PROTECTION_HASH);
});

test('different merge_commit_sha produces different canonical_proof_hash', () => {
  const result1 = generateMergeProof(baseProofInput);
  const result2 = generateMergeProof({ ...baseProofInput, mergeCommitSha: 'd'.repeat(40) });

  assert.equal(result1.result, 'MERGE_PROOF_VALID');
  assert.equal(result2.result, 'MERGE_PROOF_VALID');
  assert.notEqual(
    result1.proof.canonical_proof_hash,
    result2.proof.canonical_proof_hash,
    'different merge_commit_sha must produce different proof hash',
  );
});

test('different preo_valid_hash produces different canonical_proof_hash', () => {
  const altPreoHash = canonicalHash({ gate: 'PREO_VALID_ALT', head_sha: HEAD_SHA });
  const result1 = generateMergeProof(baseProofInput);
  const result2 = generateMergeProof({ ...baseProofInput, preoValidHash: altPreoHash });

  assert.equal(result1.result, 'MERGE_PROOF_VALID');
  assert.equal(result2.result, 'MERGE_PROOF_VALID');
  assert.notEqual(
    result1.proof.canonical_proof_hash,
    result2.proof.canonical_proof_hash,
    'different preo_valid_hash must produce different proof hash',
  );
});

// ---------------------------------------------------------------------------
// Determinism: identical inputs produce identical proof hash
// ---------------------------------------------------------------------------

test('MERGE_PROOF_VALID is deterministic for identical inputs', () => {
  const first = generateMergeProof(baseProofInput);
  const second = generateMergeProof({ ...baseProofInput });

  assert.equal(first.result, 'MERGE_PROOF_VALID');
  assert.equal(second.result, 'MERGE_PROOF_VALID');
  assert.equal(
    first.proof.canonical_proof_hash,
    second.proof.canonical_proof_hash,
    'identical inputs must produce identical canonical_proof_hash',
  );
  assert.equal(
    first.proof.validator_signature,
    second.proof.validator_signature,
    'identical inputs must produce identical validator_signature',
  );
});

// ---------------------------------------------------------------------------
// Non-operability: merge success alone does not produce merge legitimacy
// ---------------------------------------------------------------------------

test('merge_commit_sha alone without gate hashes does not produce MERGE_PROOF_VALID', () => {
  const result = generateMergeProof({
    ...baseProofInput,
    preoValidHash: null,
    approvalLineageHash: null,
    branchProtectionEnforcementHash: null,
  });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
});

test('all gate hashes missing (workflow_success_only scenario) → MERGE_LEGITIMACY_NULL', () => {
  const result = generateMergeProof({
    ...baseProofInput,
    preoValidHash: null,
  });
  assert.equal(result.result, 'MERGE_LEGITIMACY_NULL');
});
