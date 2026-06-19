import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const closureAuditSpec = JSON.parse(
  readFileSync(join(root, 'governance', 'preo', 'MERGE_LEGITIMACY_CLOSURE_AUDIT_SPEC.json'), 'utf8'),
);

import { sortCanonical, canonicalHash } from '../helpers/canonical-test-hash.mjs';

// ---------------------------------------------------------------------------
// Closure audit engine
//
// Boundary contract:
//   #1636 audits the artifact-backed chain — it does not revalidate each gate
//   from scratch. The audit confirms that the five gate artifacts exist and
//   share a consistent lineage (same validated_head_sha, same merge_commit_sha,
//   and gate hashes in the MERGE_PROOF matching the individually presented
//   gate hashes). Any missing or divergent artifact fails closed.
//
//   lineage_closure_hash = stable hash of lineage inputs only (no audited_at)
//   audit_record_hash    = hash of lineage_closure_hash + audited_at
//
//   Same lineage_closure_hash + different audit_record_hash
//   = same lineage state, new audit instance.
// ---------------------------------------------------------------------------

const STAGE4_MAP = {
  MERGE_LEGITIMACY_CLOSED: 'READY_FOR_STAGE4',
  MERGE_LEGITIMACY_OPEN: 'GOVERNANCE_GAPS_REMAIN',
  RECONCILIATION_INCOMPLETE: 'GOVERNANCE_GAPS_REMAIN',
  LINEAGE_DIVERGENCE: 'DRIFT_DETECTED',
  PROOF_LINEAGE_MISMATCH: 'BYPASS_PATH_PRESENT',
};

function performClosureAudit({
  preoValidHash,
  scoValidHash,
  scoRequired,
  approvalLineageHash,
  branchProtectionEnforcementHash,
  mergeProof,
  validatedHeadSha,
  mergeCommitSha,
  repository,
  prNumber,
  auditedAt,
}) {
  const governanceGapInventory = [];
  const unresolvedDependencyInventory = [];

  function openResult(reason, gap) {
    governanceGapInventory.push(gap);
    return {
      lineage_classification: 'MERGE_LEGITIMACY_OPEN',
      stage4_readiness_classification: 'GOVERNANCE_GAPS_REMAIN',
      governance_gap_inventory: governanceGapInventory,
      unresolved_dependency_inventory: unresolvedDependencyInventory,
      reason,
    };
  }

  function divergenceResult(reason, unresolved) {
    unresolvedDependencyInventory.push(unresolved);
    return {
      lineage_classification: 'LINEAGE_DIVERGENCE',
      stage4_readiness_classification: 'DRIFT_DETECTED',
      governance_gap_inventory: governanceGapInventory,
      unresolved_dependency_inventory: unresolvedDependencyInventory,
      reason,
    };
  }

  function mismatchResult(reason, unresolved) {
    unresolvedDependencyInventory.push(unresolved);
    return {
      lineage_classification: 'PROOF_LINEAGE_MISMATCH',
      stage4_readiness_classification: 'BYPASS_PATH_PRESENT',
      governance_gap_inventory: governanceGapInventory,
      unresolved_dependency_inventory: unresolvedDependencyInventory,
      reason,
    };
  }

  // Pre-hash guard: all required gate artifacts must be present.
  if (!preoValidHash) return openResult('missing_preo_valid_hash', 'missing_preo_valid_hash');
  if (scoRequired && !scoValidHash) return openResult('missing_sco_valid_hash', 'missing_sco_valid_hash');
  if (!approvalLineageHash) return openResult('missing_approval_lineage_hash', 'missing_approval_lineage_hash');
  if (!branchProtectionEnforcementHash) return openResult('missing_branch_protection_enforcement_hash', 'missing_branch_protection_enforcement_hash');
  if (!mergeProof) return openResult('missing_merge_proof', 'missing_merge_proof');

  // Lineage divergence: validated_head_sha must be consistent across the chain.
  if (mergeProof.validated_head_sha !== validatedHeadSha) {
    return divergenceResult('validated_head_sha_mismatch', 'validated_head_sha_divergence');
  }
  if (mergeProof.merge_commit_sha !== mergeCommitSha) {
    return divergenceResult('merge_commit_sha_mismatch', 'merge_commit_sha_divergence');
  }

  // Proof lineage cross-reference: gate hashes in MERGE_PROOF must match the
  // individually presented gate hashes. Any divergence is PROOF_LINEAGE_MISMATCH.
  if (mergeProof.preo_valid_hash !== preoValidHash) {
    return mismatchResult('preo_valid_hash_mismatch', 'preo_valid_hash_not_bound_to_proof_lineage');
  }
  const expectedScoHash = scoRequired ? scoValidHash : null;
  if (mergeProof.sco_valid_hash !== expectedScoHash) {
    return mismatchResult('sco_valid_hash_mismatch', 'sco_valid_hash_not_bound_to_proof_lineage');
  }
  if (mergeProof.approval_lineage_hash !== approvalLineageHash) {
    return mismatchResult('approval_lineage_hash_mismatch', 'approval_lineage_hash_not_bound_to_proof_lineage');
  }
  if (mergeProof.branch_protection_enforcement_hash !== branchProtectionEnforcementHash) {
    return mismatchResult('branch_protection_enforcement_hash_mismatch', 'branch_protection_hash_not_bound_to_proof_lineage');
  }

  // All gate artifacts confirmed present and mutually consistent.
  // Compute stable lineage_closure_hash from lineage inputs only (no audited_at).
  const lineageClosureHash = canonicalHash({
    approval_lineage_hash: approvalLineageHash,
    branch_protection_enforcement_hash: branchProtectionEnforcementHash,
    merge_commit_sha: mergeCommitSha,
    pr_number: prNumber,
    preo_valid_hash: preoValidHash,
    repository,
    sco_valid_hash: scoRequired ? scoValidHash : null,
    validated_head_sha: validatedHeadSha,
  });

  // audit_record_hash incorporates audited_at — may differ across audit instances.
  const auditRecordHash = canonicalHash({ audited_at: auditedAt, lineage_closure_hash: lineageClosureHash });

  return {
    lineage_classification: 'MERGE_LEGITIMACY_CLOSED',
    stage4_readiness_classification: 'READY_FOR_STAGE4',
    lineage_closure_hash: lineageClosureHash,
    audit_record_hash: auditRecordHash,
    governance_gap_inventory: [],
    unresolved_dependency_inventory: [],
    audited_at: auditedAt,
  };
}

// ---------------------------------------------------------------------------
// Fixtures — five gate hashes representing the artifact-backed chain.
// Gate hashes are opaque to the closure audit; they are produced by each
// gate's own spec (PREO_VALID_SPEC, SCO_VALID_SPEC, APPROVAL_LINEAGE_SPEC,
// BRANCH_PROTECTION_ENFORCEMENT_PROOF_SPEC, MERGE_PROOF_SPEC).
// ---------------------------------------------------------------------------

const HEAD_SHA = 'a'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);
const REPO = 'example/mindshift-demo';
const PR_NUMBER = 42;
const AUDITED_AT = '2026-05-30T12:00:00Z';

const PREO_VALID_HASH = canonicalHash({ gate: 'PREO_VALID', head_sha: HEAD_SHA });
const SCO_VALID_HASH = canonicalHash({ gate: 'SCO_VALID', head_sha: HEAD_SHA });
const APPROVAL_LINEAGE_HASH = canonicalHash({ gate: 'APPROVAL_LINEAGE', head_sha: HEAD_SHA });
const BRANCH_PROTECTION_HASH = canonicalHash({ gate: 'BRANCH_PROTECTION', head_sha: HEAD_SHA });

// Simulated merge proof object (produced by MERGE_PROOF_SPEC / issue #1634).
// The closure audit cross-references its gate hashes against the individually
// presented gate hashes — it does not regenerate the proof internals.
const baseMergeProof = Object.freeze({
  preo_valid_hash: PREO_VALID_HASH,
  sco_valid_hash: null,
  approval_lineage_hash: APPROVAL_LINEAGE_HASH,
  branch_protection_enforcement_hash: BRANCH_PROTECTION_HASH,
  validated_head_sha: HEAD_SHA,
  merge_commit_sha: MERGE_SHA,
  merge_method: 'merge',
  merged_by: 'bot-governor',
  merged_at: '2026-05-30T11:00:00Z',
  validator_key_id: 'governance-validator-v1',
  validator_signature: canonicalHash({ proof: 'simulated', head_sha: HEAD_SHA }),
  canonical_proof_hash: canonicalHash({ proof: 'canonical', head_sha: HEAD_SHA }),
});

const baseAuditInput = Object.freeze({
  preoValidHash: PREO_VALID_HASH,
  scoValidHash: null,
  scoRequired: false,
  approvalLineageHash: APPROVAL_LINEAGE_HASH,
  branchProtectionEnforcementHash: BRANCH_PROTECTION_HASH,
  mergeProof: baseMergeProof,
  validatedHeadSha: HEAD_SHA,
  mergeCommitSha: MERGE_SHA,
  repository: REPO,
  prNumber: PR_NUMBER,
  auditedAt: AUDITED_AT,
});

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('CLOSURE_AUDIT_SPEC defines non-operative governance boundaries', () => {
  const { non_operability } = closureAuditSpec;
  assert.equal(non_operability.merge_operations, false);
  assert.equal(non_operability.authority_creation, false);
  assert.equal(non_operability.deploy_mutation, false);
  assert.equal(non_operability.proof_generation, false);
  assert.equal(non_operability.runtime_mutation, false);
  assert.equal(non_operability.registry_mutation, false);
  assert.equal(non_operability.workflow_mutation, false);
  assert.equal(non_operability.enforcement_implementation, false);
});

test('CLOSURE_AUDIT_SPEC non_goals forbid authority, execution, deployment, and merge permission creation', () => {
  const { non_goals } = closureAuditSpec;
  assert.equal(non_goals.creates_authority, false);
  assert.equal(non_goals.creates_execution, false);
  assert.equal(non_goals.creates_deployment, false);
  assert.equal(non_goals.creates_merge_permission, false);
});

test('CLOSURE_AUDIT_SPEC declares closure_audit_defined: true', () => {
  assert.equal(closureAuditSpec.closure_audit_defined, true);
});

test('CLOSURE_AUDIT_SPEC audit_chain covers the complete merge governance topology', () => {
  const { audit_chain } = closureAuditSpec;
  assert.ok(audit_chain.includes('PREO_CANDIDATE'));
  assert.ok(audit_chain.includes('PREO_VALID'));
  assert.ok(audit_chain.includes('SCO_CANDIDATE'));
  assert.ok(audit_chain.includes('SCO_VALID'));
  assert.ok(audit_chain.includes('reviewer_legitimacy_validation'));
  assert.ok(audit_chain.includes('approval_lineage_governance'));
  assert.ok(audit_chain.includes('merge_proof_generation'));
  assert.ok(audit_chain.includes('branch_protection_enforcement_proof'));
});

test('CLOSURE_AUDIT_SPEC required_inputs includes all five gate hash fields and metadata', () => {
  const { fields } = closureAuditSpec.required_inputs;
  assert.ok(fields.includes('preo_valid_hash'));
  assert.ok(fields.includes('sco_valid_hash'));
  assert.ok(fields.includes('approval_lineage_hash'));
  assert.ok(fields.includes('branch_protection_enforcement_hash'));
  assert.ok(fields.includes('merge_proof_hash'));
  assert.ok(fields.includes('validated_head_sha'));
  assert.ok(fields.includes('merge_commit_sha'));
  assert.ok(fields.includes('repository'));
  assert.ok(fields.includes('pr_number'));
});

test('CLOSURE_AUDIT_SPEC lineage_classification declares all required values', () => {
  const { values } = closureAuditSpec.lineage_classification;
  assert.ok(values.includes('MERGE_LEGITIMACY_CLOSED'));
  assert.ok(values.includes('MERGE_LEGITIMACY_OPEN'));
  assert.ok(values.includes('LINEAGE_DIVERGENCE'));
  assert.ok(values.includes('PROOF_LINEAGE_MISMATCH'));
  assert.ok(values.includes('RECONCILIATION_INCOMPLETE'));
});

test('CLOSURE_AUDIT_SPEC lineage_classification default is MERGE_LEGITIMACY_OPEN (fail closed)', () => {
  assert.equal(closureAuditSpec.lineage_classification.default, 'MERGE_LEGITIMACY_OPEN');
});

test('CLOSURE_AUDIT_SPEC stage4 classifications map to lineage classifications', () => {
  const { mapping } = closureAuditSpec.stage4_readiness_classification;
  assert.equal(mapping.MERGE_LEGITIMACY_CLOSED, 'READY_FOR_STAGE4');
  assert.equal(mapping.MERGE_LEGITIMACY_OPEN, 'GOVERNANCE_GAPS_REMAIN');
  assert.equal(mapping.RECONCILIATION_INCOMPLETE, 'GOVERNANCE_GAPS_REMAIN');
  assert.equal(mapping.LINEAGE_DIVERGENCE, 'DRIFT_DETECTED');
  assert.equal(mapping.PROOF_LINEAGE_MISMATCH, 'BYPASS_PATH_PRESENT');
});

test('CLOSURE_AUDIT_SPEC hashing model declares lineage_closure_hash and audit_record_hash as distinct', () => {
  const { hashing_model } = closureAuditSpec;
  assert.ok(hashing_model.lineage_closure_hash);
  assert.ok(hashing_model.audit_record_hash);
  assert.ok(!hashing_model.lineage_closure_hash.inputs.includes('audited_at'), 'lineage_closure_hash must not include audited_at');
  assert.ok(hashing_model.audit_record_hash.inputs.includes('audited_at'), 'audit_record_hash must include audited_at');
  assert.ok(hashing_model.audit_record_hash.inputs.includes('lineage_closure_hash'));
});

test('CLOSURE_AUDIT_SPEC verification_requirements are declared', () => {
  const { verification_requirements } = closureAuditSpec;
  assert.ok(verification_requirements.includes('no_missing_governance_link'));
  assert.ok(verification_requirements.includes('no_unresolved_bypass_path'));
  assert.ok(verification_requirements.includes('no_stale_head_sha_reuse'));
  assert.ok(verification_requirements.includes('no_governance_drift'));
  assert.ok(verification_requirements.includes('fail_closed_behavior_verified'));
});

test('CLOSURE_AUDIT_SPEC boundary_rule declares audit classifies but does not create legitimacy', () => {
  const { boundary_rule } = closureAuditSpec;
  assert.ok(boundary_rule.statement.includes('classifies'));
  assert.equal(boundary_rule.creates_authority, false);
  assert.equal(boundary_rule.creates_legitimacy, false);
  assert.equal(boundary_rule.creates_merge_permission, false);
});

test('CLOSURE_AUDIT_SPEC fail_closed_semantics declares MERGE_LEGITIMACY_NULL as failure_result', () => {
  assert.equal(closureAuditSpec.fail_closed_semantics.failure_result, 'MERGE_LEGITIMACY_NULL');
  assert.equal(closureAuditSpec.fail_closed_semantics.default_classification, 'MERGE_LEGITIMACY_OPEN');
});

test('CLOSURE_AUDIT_SPEC outputs declares MERGE_LEGITIMACY_CLOSURE_REPORT and required outputs', () => {
  const { outputs } = closureAuditSpec;
  assert.ok(outputs.MERGE_LEGITIMACY_CLOSURE_REPORT);
  assert.ok(outputs.governance_gap_inventory);
  assert.ok(outputs.unresolved_dependency_inventory);
  assert.ok(outputs.stage4_readiness_classification);
});

test('CLOSURE_AUDIT_SPEC deterministic_artifact requires deterministic lineage_closure_hash', () => {
  assert.equal(closureAuditSpec.deterministic_artifact.required, true);
  assert.equal(closureAuditSpec.deterministic_artifact.lineage_closure_hash_must_be_deterministic, true);
});

// ---------------------------------------------------------------------------
// Closure audit: valid path
// ---------------------------------------------------------------------------

test('PASS: all five gate artifacts present and consistent → MERGE_LEGITIMACY_CLOSED', () => {
  const result = performClosureAudit(baseAuditInput);
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
  assert.equal(result.stage4_readiness_classification, 'READY_FOR_STAGE4');
  assert.ok(result.lineage_closure_hash, 'lineage_closure_hash must be present');
  assert.ok(result.audit_record_hash, 'audit_record_hash must be present');
  assert.deepEqual(result.governance_gap_inventory, []);
  assert.deepEqual(result.unresolved_dependency_inventory, []);
});

test('PASS: with SCO required and sco_valid_hash present → MERGE_LEGITIMACY_CLOSED', () => {
  const scoMergeProof = { ...baseMergeProof, sco_valid_hash: SCO_VALID_HASH };
  const result = performClosureAudit({
    ...baseAuditInput,
    scoValidHash: SCO_VALID_HASH,
    scoRequired: true,
    mergeProof: scoMergeProof,
  });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
  assert.equal(result.stage4_readiness_classification, 'READY_FOR_STAGE4');
});

test('PASS: stage4 map is consistent with STAGE4_MAP constant', () => {
  const { mapping } = closureAuditSpec.stage4_readiness_classification;
  for (const [lineage, stage4] of Object.entries(STAGE4_MAP)) {
    assert.equal(mapping[lineage], stage4, `mapping for ${lineage} must equal ${stage4}`);
  }
});

// ---------------------------------------------------------------------------
// Pre-hash guard: missing gate artifacts → MERGE_LEGITIMACY_OPEN
// ---------------------------------------------------------------------------

test('FAIL: missing preo_valid_hash → MERGE_LEGITIMACY_OPEN → GOVERNANCE_GAPS_REMAIN', () => {
  const result = performClosureAudit({ ...baseAuditInput, preoValidHash: null });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_OPEN');
  assert.equal(result.stage4_readiness_classification, 'GOVERNANCE_GAPS_REMAIN');
  assert.equal(result.reason, 'missing_preo_valid_hash');
  assert.ok(result.governance_gap_inventory.includes('missing_preo_valid_hash'));
});

test('FAIL: sco_required with missing sco_valid_hash → MERGE_LEGITIMACY_OPEN', () => {
  const result = performClosureAudit({ ...baseAuditInput, scoRequired: true, scoValidHash: null });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_OPEN');
  assert.equal(result.stage4_readiness_classification, 'GOVERNANCE_GAPS_REMAIN');
  assert.equal(result.reason, 'missing_sco_valid_hash');
});

test('FAIL: missing approval_lineage_hash → MERGE_LEGITIMACY_OPEN', () => {
  const result = performClosureAudit({ ...baseAuditInput, approvalLineageHash: null });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_OPEN');
  assert.equal(result.stage4_readiness_classification, 'GOVERNANCE_GAPS_REMAIN');
  assert.equal(result.reason, 'missing_approval_lineage_hash');
});

test('FAIL: missing branch_protection_enforcement_hash → MERGE_LEGITIMACY_OPEN', () => {
  const result = performClosureAudit({ ...baseAuditInput, branchProtectionEnforcementHash: null });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_OPEN');
  assert.equal(result.stage4_readiness_classification, 'GOVERNANCE_GAPS_REMAIN');
  assert.equal(result.reason, 'missing_branch_protection_enforcement_hash');
});

test('FAIL: missing merge proof → MERGE_LEGITIMACY_OPEN', () => {
  const result = performClosureAudit({ ...baseAuditInput, mergeProof: null });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_OPEN');
  assert.equal(result.stage4_readiness_classification, 'GOVERNANCE_GAPS_REMAIN');
  assert.equal(result.reason, 'missing_merge_proof');
});

test('FAIL: all gate hashes absent → MERGE_LEGITIMACY_OPEN (first missing detected)', () => {
  const result = performClosureAudit({
    ...baseAuditInput,
    preoValidHash: null,
    approvalLineageHash: null,
    branchProtectionEnforcementHash: null,
    mergeProof: null,
  });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_OPEN');
  assert.equal(result.stage4_readiness_classification, 'GOVERNANCE_GAPS_REMAIN');
});

// ---------------------------------------------------------------------------
// Lineage divergence: head_sha mismatch across the chain → LINEAGE_DIVERGENCE
// ---------------------------------------------------------------------------

test('FAIL: merge proof validated_head_sha does not match audit validated_head_sha → LINEAGE_DIVERGENCE', () => {
  const divergedProof = { ...baseMergeProof, validated_head_sha: 'b'.repeat(40) };
  const result = performClosureAudit({ ...baseAuditInput, mergeProof: divergedProof });
  assert.equal(result.lineage_classification, 'LINEAGE_DIVERGENCE');
  assert.equal(result.stage4_readiness_classification, 'DRIFT_DETECTED');
  assert.equal(result.reason, 'validated_head_sha_mismatch');
  assert.ok(result.unresolved_dependency_inventory.includes('validated_head_sha_divergence'));
});

test('FAIL: merge proof merge_commit_sha does not match audit merge_commit_sha → LINEAGE_DIVERGENCE', () => {
  const divergedProof = { ...baseMergeProof, merge_commit_sha: 'd'.repeat(40) };
  const result = performClosureAudit({ ...baseAuditInput, mergeProof: divergedProof });
  assert.equal(result.lineage_classification, 'LINEAGE_DIVERGENCE');
  assert.equal(result.stage4_readiness_classification, 'DRIFT_DETECTED');
  assert.equal(result.reason, 'merge_commit_sha_mismatch');
  assert.ok(result.unresolved_dependency_inventory.includes('merge_commit_sha_divergence'));
});

// ---------------------------------------------------------------------------
// Proof lineage mismatch: gate hashes in MERGE_PROOF diverge from presented ones
// ---------------------------------------------------------------------------

test('FAIL: preo_valid_hash in proof does not match presented hash → PROOF_LINEAGE_MISMATCH', () => {
  const altHash = canonicalHash({ gate: 'PREO_VALID_ALT', head_sha: HEAD_SHA });
  const mismatchedProof = { ...baseMergeProof, preo_valid_hash: altHash };
  const result = performClosureAudit({ ...baseAuditInput, mergeProof: mismatchedProof });
  assert.equal(result.lineage_classification, 'PROOF_LINEAGE_MISMATCH');
  assert.equal(result.stage4_readiness_classification, 'BYPASS_PATH_PRESENT');
  assert.equal(result.reason, 'preo_valid_hash_mismatch');
  assert.ok(result.unresolved_dependency_inventory.includes('preo_valid_hash_not_bound_to_proof_lineage'));
});

test('FAIL: sco_valid_hash in proof does not match presented hash (SCO required) → PROOF_LINEAGE_MISMATCH', () => {
  const altScoHash = canonicalHash({ gate: 'SCO_VALID_ALT', head_sha: HEAD_SHA });
  const scoProof = { ...baseMergeProof, sco_valid_hash: altScoHash };
  const result = performClosureAudit({
    ...baseAuditInput,
    scoRequired: true,
    scoValidHash: SCO_VALID_HASH,
    mergeProof: scoProof,
  });
  assert.equal(result.lineage_classification, 'PROOF_LINEAGE_MISMATCH');
  assert.equal(result.stage4_readiness_classification, 'BYPASS_PATH_PRESENT');
  assert.equal(result.reason, 'sco_valid_hash_mismatch');
});

test('FAIL: approval_lineage_hash in proof does not match presented hash → PROOF_LINEAGE_MISMATCH', () => {
  const altHash = canonicalHash({ gate: 'APPROVAL_ALT', head_sha: HEAD_SHA });
  const mismatchedProof = { ...baseMergeProof, approval_lineage_hash: altHash };
  const result = performClosureAudit({ ...baseAuditInput, mergeProof: mismatchedProof });
  assert.equal(result.lineage_classification, 'PROOF_LINEAGE_MISMATCH');
  assert.equal(result.stage4_readiness_classification, 'BYPASS_PATH_PRESENT');
  assert.equal(result.reason, 'approval_lineage_hash_mismatch');
  assert.ok(result.unresolved_dependency_inventory.includes('approval_lineage_hash_not_bound_to_proof_lineage'));
});

test('FAIL: branch_protection_enforcement_hash in proof does not match → PROOF_LINEAGE_MISMATCH', () => {
  const altHash = canonicalHash({ gate: 'BRANCH_PROTECTION_ALT', head_sha: HEAD_SHA });
  const mismatchedProof = { ...baseMergeProof, branch_protection_enforcement_hash: altHash };
  const result = performClosureAudit({ ...baseAuditInput, mergeProof: mismatchedProof });
  assert.equal(result.lineage_classification, 'PROOF_LINEAGE_MISMATCH');
  assert.equal(result.stage4_readiness_classification, 'BYPASS_PATH_PRESENT');
  assert.equal(result.reason, 'branch_protection_enforcement_hash_mismatch');
  assert.ok(result.unresolved_dependency_inventory.includes('branch_protection_hash_not_bound_to_proof_lineage'));
});

test('FAIL: proof produced for a stale head_sha → LINEAGE_DIVERGENCE (validated_head_sha_mismatch)', () => {
  const staleHeadSha = 'e'.repeat(40);
  const staleProof = {
    ...baseMergeProof,
    validated_head_sha: staleHeadSha,
    preo_valid_hash: canonicalHash({ gate: 'PREO_VALID', head_sha: staleHeadSha }),
  };
  const result = performClosureAudit({ ...baseAuditInput, mergeProof: staleProof });
  assert.equal(result.lineage_classification, 'LINEAGE_DIVERGENCE');
  assert.equal(result.stage4_readiness_classification, 'DRIFT_DETECTED');
});

// ---------------------------------------------------------------------------
// Hashing model: lineage_closure_hash vs audit_record_hash
// ---------------------------------------------------------------------------

test('lineage_closure_hash is stable: same lineage inputs produce identical hash', () => {
  const first = performClosureAudit(baseAuditInput);
  const second = performClosureAudit({ ...baseAuditInput });
  assert.equal(first.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
  assert.equal(first.lineage_closure_hash, second.lineage_closure_hash);
});

test('audit_record_hash differs when audited_at differs, even if lineage is identical', () => {
  const first = performClosureAudit({ ...baseAuditInput, auditedAt: '2026-05-30T12:00:00Z' });
  const second = performClosureAudit({ ...baseAuditInput, auditedAt: '2026-05-30T13:00:00Z' });
  assert.equal(first.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
  assert.equal(second.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
  assert.equal(first.lineage_closure_hash, second.lineage_closure_hash, 'lineage_closure_hash must be identical');
  assert.notEqual(first.audit_record_hash, second.audit_record_hash, 'audit_record_hash must differ');
});

test('lineage_closure_hash changes when any gate hash changes', () => {
  const altHash = canonicalHash({ gate: 'PREO_VALID_ALT', head_sha: HEAD_SHA });
  const altProof = { ...baseMergeProof, preo_valid_hash: altHash };
  // Use a direct invocation where preoValidHash also changes to keep the chain consistent
  const baseResult = performClosureAudit(baseAuditInput);
  const altResult = performClosureAudit({
    ...baseAuditInput,
    preoValidHash: altHash,
    mergeProof: altProof,
  });
  assert.equal(baseResult.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
  assert.equal(altResult.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
  assert.notEqual(
    baseResult.lineage_closure_hash,
    altResult.lineage_closure_hash,
    'changed gate hash must produce different lineage_closure_hash',
  );
});

// ---------------------------------------------------------------------------
// Non-operability: audit does not revalidate gates; it audits the chain
// ---------------------------------------------------------------------------

test('audit does not reject a valid chain because of merge event fields it cannot see', () => {
  // The closure audit does not re-run PREO_VALID or other gate validators.
  // It confirms hash presence and cross-references the proof's gate hashes.
  // Internal gate fields (e.g. required_checks_alias_map) are opaque to the audit.
  const result = performClosureAudit(baseAuditInput);
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
});

test('audit result contains no lineage_closure_hash when pre-hash guard fails', () => {
  const result = performClosureAudit({ ...baseAuditInput, preoValidHash: null });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_OPEN');
  assert.ok(!('lineage_closure_hash' in result), 'lineage_closure_hash must not be present when guard fails');
  assert.ok(!('audit_record_hash' in result), 'audit_record_hash must not be present when guard fails');
});

test('sco_valid_hash absent when sco not required does not constitute a governance gap', () => {
  const result = performClosureAudit({ ...baseAuditInput, scoRequired: false, scoValidHash: null });
  assert.equal(result.lineage_classification, 'MERGE_LEGITIMACY_CLOSED');
  assert.deepEqual(result.governance_gap_inventory, []);
});
