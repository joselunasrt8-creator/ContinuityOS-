import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const spec = JSON.parse(
  readFileSync(join(root, 'governance', 'deploy', 'DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC.json'), 'utf8'),
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
// Canonical hash derivations
//
// Boundary contract:
//   canonicalDeployProofBindingHash binds the full deploy source chain:
//     merge_legitimacy_closure_hash → merge_commit_sha → deployable_artifact_hash
//     → validated_object_hash → deployment_hash → deployment_proof_id
//
//   canonicalBuildProvenanceHash binds the build provenance record:
//     source_commit_sha → artifact_hash → build_workflow → build_run_id
//     → builder_identity → built_at
//
//   Both are deterministic and fail-closed: any mutation produces a different hash.
// ---------------------------------------------------------------------------

function canonicalDeployProofBindingHash({
  merge_legitimacy_closure_hash,
  merge_commit_sha,
  deployable_artifact_hash,
  validated_object_hash,
  deployment_hash,
  deployment_proof_id,
}) {
  return canonicalHash({
    merge_legitimacy_closure_hash,
    merge_commit_sha,
    deployable_artifact_hash,
    validated_object_hash,
    deployment_hash,
    deployment_proof_id,
  });
}

function canonicalBuildProvenanceHash({
  source_commit_sha,
  artifact_hash,
  build_workflow,
  build_run_id,
  builder_identity,
  built_at,
}) {
  return canonicalHash({
    source_commit_sha,
    artifact_hash,
    build_workflow,
    build_run_id,
    builder_identity,
    built_at,
  });
}

// ---------------------------------------------------------------------------
// Deploy legitimacy closure audit logic
//
// Boundary contract:
//   DEPLOY_LEGITIMACY_CLOSED requires the full deploy source chain to be
//   intact: merge legitimacy closure → build provenance → artifact hash
//   continuity → proof binding. Any missing, divergent, replayed, or
//   authority-invalid input fails closed to DEPLOYMENT_LEGITIMACY_NULL.
//
//   Missing evidence  → DEPLOY_RECONCILIATION_INCOMPLETE
//   Divergent evidence → DEPLOY_LINEAGE_DIVERGENCE
//   Replay            → DEPLOY_REPLAY_DIVERGENCE
//   Proof mismatch    → DEPLOY_PROOF_MISMATCH
//   Authority invalid → DEPLOY_AUTHORITY_INVALID
//   Open upstream     → DEPLOY_LEGITIMACY_OPEN
//
//   DEPLOY_LEGITIMACY_CLOSURE_REPORT is recorded finality audit,
//   not deployment authorization.
// ---------------------------------------------------------------------------

const AUDIT_CHAIN_LINKS = [
  'session_active',
  'continuity_active',
  'authority_active',
  'compile_hash_binding',
  'validate_hash_binding',
  'nonce_reservation',
  'execute_lineage',
  'replay_protection',
  'proof_generation',
  'deployment_proof_binding',
];

function nullResult(classification, reason, gaps) {
  const gapList = Array.isArray(gaps) ? gaps : [gaps];
  const lineage = Object.fromEntries(
    AUDIT_CHAIN_LINKS.map((link) => [link, !gapList.includes(link)]),
  );
  return {
    result: 'DEPLOYMENT_LEGITIMACY_NULL',
    classification,
    reason,
    deployment_gap_inventory: gapList,
    lineage_integrity_report: lineage,
    deployment_readiness_classification: classification,
  };
}

function auditDeployLegitimacy({
  session_id,
  continuity_id,
  decision_id,
  invocation_nonce,
  execution_id,
  merge_legitimacy_closure_hash,
  merge_commit_sha,
  deployable_artifact_hash,
  validated_object_hash,
  deployment_hash,
  deployment_proof_id,
  proof_binding_hash,
  build_provenance,
  // Authority validity flags
  session_active = true,
  continuity_active = true,
  authority_active = true,
  // Replay flags
  nonce_replayed = false,
  proof_reused = false,
  // Upstream merge legitimacy flag
  upstream_merge_legitimacy_open = false,
}) {
  // Phase 1: Upstream merge legitimacy open → DEPLOY_LEGITIMACY_OPEN
  if (upstream_merge_legitimacy_open) {
    return nullResult('DEPLOY_LEGITIMACY_OPEN', 'upstream_merge_legitimacy_not_closed', []);
  }

  // Phase 2: Required top-level field presence → DEPLOY_RECONCILIATION_INCOMPLETE
  const topLevelRequired = {
    session_id,
    continuity_id,
    decision_id,
    invocation_nonce,
    execution_id,
    merge_legitimacy_closure_hash,
    merge_commit_sha,
    deployable_artifact_hash,
    validated_object_hash,
    deployment_hash,
    deployment_proof_id,
    proof_binding_hash,
  };

  for (const [field, value] of Object.entries(topLevelRequired)) {
    if (!value) {
      return nullResult(
        'DEPLOY_RECONCILIATION_INCOMPLETE',
        `missing_field:${field}`,
        [field],
      );
    }
  }

  if (!build_provenance || typeof build_provenance !== 'object') {
    return nullResult(
      'DEPLOY_RECONCILIATION_INCOMPLETE',
      'missing_field:build_provenance',
      ['compile_hash_binding'],
    );
  }

  // Phase 3: Build provenance required fields → DEPLOY_RECONCILIATION_INCOMPLETE
  const provenanceRequired = [
    'build_provenance_hash',
    'source_commit_sha',
    'artifact_hash',
    'build_workflow',
    'build_run_id',
    'builder_identity',
    'built_at',
  ];

  for (const field of provenanceRequired) {
    if (!build_provenance[field]) {
      return nullResult(
        'DEPLOY_RECONCILIATION_INCOMPLETE',
        `missing_provenance_field:${field}`,
        ['compile_hash_binding'],
      );
    }
  }

  // Phase 4: Authority validity → DEPLOY_AUTHORITY_INVALID
  if (!session_active) {
    return nullResult('DEPLOY_AUTHORITY_INVALID', 'session_not_active', ['session_active']);
  }
  if (!continuity_active) {
    return nullResult('DEPLOY_AUTHORITY_INVALID', 'continuity_not_active', ['continuity_active']);
  }
  if (!authority_active) {
    return nullResult('DEPLOY_AUTHORITY_INVALID', 'authority_not_active', ['authority_active']);
  }

  // Phase 5: Replay checks → DEPLOY_REPLAY_DIVERGENCE
  if (nonce_replayed) {
    return nullResult(
      'DEPLOY_REPLAY_DIVERGENCE',
      'invocation_nonce_replayed',
      ['replay_protection', 'nonce_reservation'],
    );
  }
  if (proof_reused) {
    return nullResult(
      'DEPLOY_REPLAY_DIVERGENCE',
      'deployment_proof_reuse',
      ['replay_protection', 'deployment_proof_binding'],
    );
  }

  // Phase 6: Deploy source binding — hash equality checks → DEPLOY_LINEAGE_DIVERGENCE
  if (validated_object_hash !== deployable_artifact_hash) {
    return nullResult(
      'DEPLOY_LINEAGE_DIVERGENCE',
      'validated_object_hash_mismatch',
      ['validate_hash_binding', 'compile_hash_binding'],
    );
  }

  if (deployment_hash !== validated_object_hash) {
    return nullResult(
      'DEPLOY_LINEAGE_DIVERGENCE',
      'deployment_hash_mismatch',
      ['execute_lineage'],
    );
  }

  if (build_provenance.source_commit_sha !== merge_commit_sha) {
    return nullResult(
      'DEPLOY_LINEAGE_DIVERGENCE',
      'build_source_commit_sha_mismatch',
      ['compile_hash_binding'],
    );
  }

  if (build_provenance.artifact_hash !== deployable_artifact_hash) {
    return nullResult(
      'DEPLOY_LINEAGE_DIVERGENCE',
      'build_artifact_hash_mismatch',
      ['compile_hash_binding'],
    );
  }

  // Phase 7: Build provenance hash canonical verification → DEPLOY_PROOF_MISMATCH
  const expectedBuildProvenanceHash = canonicalBuildProvenanceHash({
    source_commit_sha: build_provenance.source_commit_sha,
    artifact_hash: build_provenance.artifact_hash,
    build_workflow: build_provenance.build_workflow,
    build_run_id: build_provenance.build_run_id,
    builder_identity: build_provenance.builder_identity,
    built_at: build_provenance.built_at,
  });

  if (build_provenance.build_provenance_hash !== expectedBuildProvenanceHash) {
    return nullResult(
      'DEPLOY_PROOF_MISMATCH',
      'build_provenance_hash_mismatch',
      ['compile_hash_binding'],
    );
  }

  // Phase 8: Proof binding hash canonical verification → DEPLOY_PROOF_MISMATCH
  const expectedProofBindingHash = canonicalDeployProofBindingHash({
    merge_legitimacy_closure_hash,
    merge_commit_sha,
    deployable_artifact_hash,
    validated_object_hash,
    deployment_hash,
    deployment_proof_id,
  });

  if (proof_binding_hash !== expectedProofBindingHash) {
    return nullResult(
      'DEPLOY_PROOF_MISMATCH',
      'proof_binding_hash_mismatch',
      ['deployment_proof_binding', 'proof_generation'],
    );
  }

  // All checks pass → DEPLOY_LEGITIMACY_CLOSED
  return {
    result: 'DEPLOY_LEGITIMACY_CLOSED',
    classification: 'DEPLOY_LEGITIMACY_CLOSED',
    report: {
      type: 'DEPLOY_LEGITIMACY_CLOSURE_REPORT',
      session_id,
      continuity_id,
      decision_id,
      invocation_nonce,
      execution_id,
      merge_legitimacy_closure_hash,
      merge_commit_sha,
      deployable_artifact_hash,
      validated_object_hash,
      deployment_hash,
      deployment_proof_id,
      proof_binding_hash,
      build_provenance_hash: build_provenance.build_provenance_hash,
    },
    deployment_gap_inventory: [],
    lineage_integrity_report: Object.fromEntries(AUDIT_CHAIN_LINKS.map((l) => [l, true])),
    deployment_readiness_classification: 'DEPLOY_LEGITIMACY_CLOSED',
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MERGE_COMMIT_SHA = 'a'.repeat(40);
const MERGE_LEGITIMACY_CLOSURE_HASH = canonicalHash({
  gate: 'MERGE_LEGITIMACY_CLOSED',
  commit_sha: MERGE_COMMIT_SHA,
});
const DEPLOYABLE_ARTIFACT_HASH = canonicalHash({
  artifact: 'build_artifact',
  commit_sha: MERGE_COMMIT_SHA,
});
const VALIDATED_OBJECT_HASH = DEPLOYABLE_ARTIFACT_HASH;
const DEPLOYMENT_HASH = VALIDATED_OBJECT_HASH;
const DEPLOYMENT_PROOF_ID = 'proof-' + 'b'.repeat(32);

const BASE_BUILD_PROVENANCE = {
  source_commit_sha: MERGE_COMMIT_SHA,
  artifact_hash: DEPLOYABLE_ARTIFACT_HASH,
  build_workflow: 'build.yml',
  build_run_id: 'run-123',
  builder_identity: 'github-actions',
  built_at: '2026-05-30T12:00:00Z',
};
BASE_BUILD_PROVENANCE.build_provenance_hash = canonicalBuildProvenanceHash(BASE_BUILD_PROVENANCE);

const PROOF_BINDING_HASH = canonicalDeployProofBindingHash({
  merge_legitimacy_closure_hash: MERGE_LEGITIMACY_CLOSURE_HASH,
  merge_commit_sha: MERGE_COMMIT_SHA,
  deployable_artifact_hash: DEPLOYABLE_ARTIFACT_HASH,
  validated_object_hash: VALIDATED_OBJECT_HASH,
  deployment_hash: DEPLOYMENT_HASH,
  deployment_proof_id: DEPLOYMENT_PROOF_ID,
});

const baseInput = Object.freeze({
  session_id: 'session-abc',
  continuity_id: 'continuity-xyz',
  decision_id: 'decision-123',
  invocation_nonce: 'nonce-456',
  execution_id: 'execution-789',
  merge_legitimacy_closure_hash: MERGE_LEGITIMACY_CLOSURE_HASH,
  merge_commit_sha: MERGE_COMMIT_SHA,
  deployable_artifact_hash: DEPLOYABLE_ARTIFACT_HASH,
  validated_object_hash: VALIDATED_OBJECT_HASH,
  deployment_hash: DEPLOYMENT_HASH,
  deployment_proof_id: DEPLOYMENT_PROOF_ID,
  proof_binding_hash: PROOF_BINDING_HASH,
  build_provenance: BASE_BUILD_PROVENANCE,
  session_active: true,
  continuity_active: true,
  authority_active: true,
  nonce_replayed: false,
  proof_reused: false,
  upstream_merge_legitimacy_open: false,
});

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC defines non-operative governance boundaries', () => {
  const { non_operability } = spec;
  assert.equal(non_operability.authority_creation, false);
  assert.equal(non_operability.execution_trigger, false);
  assert.equal(non_operability.deployment_mutation, false);
  assert.equal(non_operability.proof_generation, false);
  assert.equal(non_operability.registry_mutation, false);
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC non_goals forbid authority, execution, deployment, and proof creation', () => {
  const { non_goals } = spec;
  assert.equal(non_goals.creates_authority, false);
  assert.equal(non_goals.creates_execution, false);
  assert.equal(non_goals.creates_deployment, false);
  assert.equal(non_goals.creates_proof, false);
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares all required closure audit object fields', () => {
  const { required_fields } = spec.closure_audit_object;
  assert.ok(required_fields.includes('session_id'));
  assert.ok(required_fields.includes('continuity_id'));
  assert.ok(required_fields.includes('decision_id'));
  assert.ok(required_fields.includes('invocation_nonce'));
  assert.ok(required_fields.includes('execution_id'));
  assert.ok(required_fields.includes('merge_legitimacy_closure_hash'));
  assert.ok(required_fields.includes('merge_commit_sha'));
  assert.ok(required_fields.includes('deployable_artifact_hash'));
  assert.ok(required_fields.includes('validated_object_hash'));
  assert.ok(required_fields.includes('deployment_hash'));
  assert.ok(required_fields.includes('deployment_proof_id'));
  assert.ok(required_fields.includes('proof_binding_hash'));
  assert.ok(required_fields.includes('build_provenance'));
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares success_result as DEPLOY_LEGITIMACY_CLOSED', () => {
  assert.equal(spec.closure_audit_object.success_result, 'DEPLOY_LEGITIMACY_CLOSED');
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares failure_result as DEPLOYMENT_LEGITIMACY_NULL', () => {
  assert.equal(spec.closure_audit_object.failure_result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(spec.fail_closed_semantics.failure_result, 'DEPLOYMENT_LEGITIMACY_NULL');
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares all required classifications', () => {
  const { classifications } = spec;
  assert.ok(Object.hasOwn(classifications, 'DEPLOY_LEGITIMACY_CLOSED'));
  assert.ok(Object.hasOwn(classifications, 'DEPLOY_LEGITIMACY_OPEN'));
  assert.ok(Object.hasOwn(classifications, 'DEPLOY_LINEAGE_DIVERGENCE'));
  assert.ok(Object.hasOwn(classifications, 'DEPLOY_PROOF_MISMATCH'));
  assert.ok(Object.hasOwn(classifications, 'DEPLOY_REPLAY_DIVERGENCE'));
  assert.ok(Object.hasOwn(classifications, 'DEPLOY_AUTHORITY_INVALID'));
  assert.ok(Object.hasOwn(classifications, 'DEPLOY_RECONCILIATION_INCOMPLETE'));
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares all required audit chain links', () => {
  const { links } = spec.audit_chain;
  assert.ok(links.includes('session_active'));
  assert.ok(links.includes('continuity_active'));
  assert.ok(links.includes('authority_active'));
  assert.ok(links.includes('compile_hash_binding'));
  assert.ok(links.includes('validate_hash_binding'));
  assert.ok(links.includes('nonce_reservation'));
  assert.ok(links.includes('execute_lineage'));
  assert.ok(links.includes('replay_protection'));
  assert.ok(links.includes('proof_generation'));
  assert.ok(links.includes('deployment_proof_binding'));
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares all required outputs', () => {
  const { outputs } = spec;
  assert.ok(Object.hasOwn(outputs, 'DEPLOY_LEGITIMACY_CLOSURE_REPORT'));
  assert.ok(Object.hasOwn(outputs, 'deployment_gap_inventory'));
  assert.ok(Object.hasOwn(outputs, 'lineage_integrity_report'));
  assert.ok(Object.hasOwn(outputs, 'deployment_readiness_classification'));
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares all verification requirements', () => {
  const { verification_requirements } = spec;
  assert.ok(verification_requirements.includes('decision_id_continuity_preserved'));
  assert.ok(verification_requirements.includes('continuity_id_preserved'));
  assert.ok(verification_requirements.includes('validated_object_hash_preserved'));
  assert.ok(verification_requirements.includes('invocation_nonce_preserved'));
  assert.ok(verification_requirements.includes('proof_binding_hash_matches'));
  assert.ok(verification_requirements.includes('replay_protection_verified'));
  assert.ok(verification_requirements.includes('lineage_origin_verified'));
  assert.ok(verification_requirements.includes('deployment_lineage_drift_absent'));
  assert.ok(verification_requirements.includes('deployment_proof_reuse_absent'));
  assert.ok(verification_requirements.includes('fail_closed_behavior_verified'));
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC deploy_source_binding chain includes all required links', () => {
  const { chain } = spec.deploy_source_binding;
  assert.ok(chain.includes('merge_legitimacy_closure_hash'));
  assert.ok(chain.includes('merge_commit_sha'));
  assert.ok(chain.includes('deployable_artifact_hash'));
  assert.ok(chain.includes('validated_object_hash'));
  assert.ok(chain.includes('deployment_hash'));
  assert.ok(chain.includes('proof_binding_hash'));
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC build_provenance declares all required fields', () => {
  const { required_fields } = spec.build_provenance;
  assert.ok(required_fields.includes('build_provenance_hash'));
  assert.ok(required_fields.includes('source_commit_sha'));
  assert.ok(required_fields.includes('artifact_hash'));
  assert.ok(required_fields.includes('build_workflow'));
  assert.ok(required_fields.includes('build_run_id'));
  assert.ok(required_fields.includes('builder_identity'));
  assert.ok(required_fields.includes('built_at'));
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares missing vs divergent boundary', () => {
  const { missing_vs_divergent_boundary } = spec;
  assert.ok(missing_vs_divergent_boundary.DEPLOY_RECONCILIATION_INCOMPLETE);
  assert.ok(missing_vs_divergent_boundary.DEPLOY_LINEAGE_DIVERGENCE);
  assert.ok(missing_vs_divergent_boundary.example.includes('DEPLOY_LINEAGE_DIVERGENCE'));
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC declares upstream_input from MERGE_LEGITIMACY_CLOSED', () => {
  assert.equal(spec.upstream_input.source, 'MERGE_LEGITIMACY_CLOSED');
  assert.equal(spec.upstream_input.required_field, 'merge_legitimacy_closure_hash');
});

test('DEPLOY_LEGITIMACY_CLOSURE_AUDIT_SPEC proof_binding_hash_inputs include the full deploy source chain', () => {
  const { proof_binding_hash_inputs } = spec;
  assert.ok(proof_binding_hash_inputs.includes('merge_legitimacy_closure_hash'));
  assert.ok(proof_binding_hash_inputs.includes('merge_commit_sha'));
  assert.ok(proof_binding_hash_inputs.includes('deployable_artifact_hash'));
  assert.ok(proof_binding_hash_inputs.includes('validated_object_hash'));
  assert.ok(proof_binding_hash_inputs.includes('deployment_hash'));
  assert.ok(proof_binding_hash_inputs.includes('deployment_proof_id'));
});

// ---------------------------------------------------------------------------
// Audit: valid path
// ---------------------------------------------------------------------------

test('PASS: fully bound deploy chain produces DEPLOY_LEGITIMACY_CLOSED', () => {
  const result = auditDeployLegitimacy(baseInput);
  assert.equal(result.result, 'DEPLOY_LEGITIMACY_CLOSED');
  assert.equal(result.classification, 'DEPLOY_LEGITIMACY_CLOSED');
  assert.equal(result.deployment_readiness_classification, 'DEPLOY_LEGITIMACY_CLOSED');
  assert.deepEqual(result.deployment_gap_inventory, []);
  assert.ok(result.report, 'report must be present');
  assert.equal(result.report.type, 'DEPLOY_LEGITIMACY_CLOSURE_REPORT');
});

test('PASS: report preserves all lineage fields from chain', () => {
  const result = auditDeployLegitimacy(baseInput);
  assert.equal(result.result, 'DEPLOY_LEGITIMACY_CLOSED');
  assert.equal(result.report.session_id, 'session-abc');
  assert.equal(result.report.continuity_id, 'continuity-xyz');
  assert.equal(result.report.decision_id, 'decision-123');
  assert.equal(result.report.invocation_nonce, 'nonce-456');
  assert.equal(result.report.execution_id, 'execution-789');
  assert.equal(result.report.merge_legitimacy_closure_hash, MERGE_LEGITIMACY_CLOSURE_HASH);
  assert.equal(result.report.merge_commit_sha, MERGE_COMMIT_SHA);
  assert.equal(result.report.validated_object_hash, VALIDATED_OBJECT_HASH);
  assert.equal(result.report.deployment_hash, DEPLOYMENT_HASH);
  assert.equal(result.report.deployment_proof_id, DEPLOYMENT_PROOF_ID);
  assert.equal(result.report.proof_binding_hash, PROOF_BINDING_HASH);
  assert.equal(result.report.build_provenance_hash, BASE_BUILD_PROVENANCE.build_provenance_hash);
});

test('PASS: all chain links are true in lineage_integrity_report for valid input', () => {
  const result = auditDeployLegitimacy(baseInput);
  assert.equal(result.result, 'DEPLOY_LEGITIMACY_CLOSED');
  for (const link of AUDIT_CHAIN_LINKS) {
    assert.equal(result.lineage_integrity_report[link], true, `${link} must be true`);
  }
});

// ---------------------------------------------------------------------------
// Classification: DEPLOY_LEGITIMACY_OPEN
// ---------------------------------------------------------------------------

test('FAIL: upstream_merge_legitimacy_open=true → DEPLOY_LEGITIMACY_OPEN → DEPLOYMENT_LEGITIMACY_NULL', () => {
  const result = auditDeployLegitimacy({ ...baseInput, upstream_merge_legitimacy_open: true });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_LEGITIMACY_OPEN');
  assert.equal(result.reason, 'upstream_merge_legitimacy_not_closed');
});

// ---------------------------------------------------------------------------
// Classification: DEPLOY_RECONCILIATION_INCOMPLETE — missing required fields
// ---------------------------------------------------------------------------

test('FAIL: missing session_id → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, session_id: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:session_id');
});

test('FAIL: missing continuity_id → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, continuity_id: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:continuity_id');
});

test('FAIL: missing decision_id → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, decision_id: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:decision_id');
});

test('FAIL: missing invocation_nonce → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, invocation_nonce: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:invocation_nonce');
});

test('FAIL: missing execution_id → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, execution_id: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:execution_id');
});

test('FAIL: missing merge_legitimacy_closure_hash → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, merge_legitimacy_closure_hash: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:merge_legitimacy_closure_hash');
});

test('FAIL: missing merge_commit_sha → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, merge_commit_sha: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:merge_commit_sha');
});

test('FAIL: missing deployable_artifact_hash → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, deployable_artifact_hash: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:deployable_artifact_hash');
});

test('FAIL: missing validated_object_hash → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, validated_object_hash: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:validated_object_hash');
});

test('FAIL: missing deployment_hash → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, deployment_hash: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:deployment_hash');
});

test('FAIL: missing deployment_proof_id → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, deployment_proof_id: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:deployment_proof_id');
});

test('FAIL: missing proof_binding_hash → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, proof_binding_hash: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:proof_binding_hash');
});

test('FAIL: missing build_provenance → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: null });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_field:build_provenance');
});

test('FAIL: missing build_provenance.build_provenance_hash → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const { build_provenance_hash: _dropped, ...provenance } = BASE_BUILD_PROVENANCE;
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: provenance });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_provenance_field:build_provenance_hash');
});

test('FAIL: missing build_provenance.source_commit_sha → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const { source_commit_sha: _dropped, ...provenance } = BASE_BUILD_PROVENANCE;
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: provenance });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_provenance_field:source_commit_sha');
});

test('FAIL: missing build_provenance.builder_identity → DEPLOY_RECONCILIATION_INCOMPLETE', () => {
  const { builder_identity: _dropped, ...provenance } = BASE_BUILD_PROVENANCE;
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: provenance });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.reason, 'missing_provenance_field:builder_identity');
});

// ---------------------------------------------------------------------------
// Classification: DEPLOY_AUTHORITY_INVALID
// ---------------------------------------------------------------------------

test('FAIL: session_active=false → DEPLOY_AUTHORITY_INVALID', () => {
  const result = auditDeployLegitimacy({ ...baseInput, session_active: false });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_AUTHORITY_INVALID');
  assert.equal(result.reason, 'session_not_active');
  assert.ok(result.deployment_gap_inventory.includes('session_active'));
});

test('FAIL: continuity_active=false → DEPLOY_AUTHORITY_INVALID', () => {
  const result = auditDeployLegitimacy({ ...baseInput, continuity_active: false });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_AUTHORITY_INVALID');
  assert.equal(result.reason, 'continuity_not_active');
  assert.ok(result.deployment_gap_inventory.includes('continuity_active'));
});

test('FAIL: authority_active=false → DEPLOY_AUTHORITY_INVALID', () => {
  const result = auditDeployLegitimacy({ ...baseInput, authority_active: false });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_AUTHORITY_INVALID');
  assert.equal(result.reason, 'authority_not_active');
  assert.ok(result.deployment_gap_inventory.includes('authority_active'));
});

// ---------------------------------------------------------------------------
// Classification: DEPLOY_REPLAY_DIVERGENCE
// ---------------------------------------------------------------------------

test('FAIL: nonce_replayed=true → DEPLOY_REPLAY_DIVERGENCE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, nonce_replayed: true });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_REPLAY_DIVERGENCE');
  assert.equal(result.reason, 'invocation_nonce_replayed');
  assert.ok(result.deployment_gap_inventory.includes('replay_protection'));
  assert.ok(result.deployment_gap_inventory.includes('nonce_reservation'));
});

test('FAIL: proof_reused=true → DEPLOY_REPLAY_DIVERGENCE', () => {
  const result = auditDeployLegitimacy({ ...baseInput, proof_reused: true });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_REPLAY_DIVERGENCE');
  assert.equal(result.reason, 'deployment_proof_reuse');
  assert.ok(result.deployment_gap_inventory.includes('replay_protection'));
  assert.ok(result.deployment_gap_inventory.includes('deployment_proof_binding'));
});

// ---------------------------------------------------------------------------
// Classification: DEPLOY_LINEAGE_DIVERGENCE — evidence exists but disagrees
// ---------------------------------------------------------------------------

test('FAIL: validated_object_hash != deployable_artifact_hash → DEPLOY_LINEAGE_DIVERGENCE', () => {
  const altHash = canonicalHash({ artifact: 'different_artifact', commit_sha: MERGE_COMMIT_SHA });
  const result = auditDeployLegitimacy({ ...baseInput, validated_object_hash: altHash });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_LINEAGE_DIVERGENCE');
  assert.equal(result.reason, 'validated_object_hash_mismatch');
});

test('FAIL: deployment_hash != validated_object_hash → DEPLOY_LINEAGE_DIVERGENCE', () => {
  const altHash = canonicalHash({ artifact: 'drift_artifact', commit_sha: MERGE_COMMIT_SHA });
  const result = auditDeployLegitimacy({ ...baseInput, deployment_hash: altHash });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_LINEAGE_DIVERGENCE');
  assert.equal(result.reason, 'deployment_hash_mismatch');
});

test('FAIL: build_provenance.source_commit_sha != merge_commit_sha → DEPLOY_LINEAGE_DIVERGENCE', () => {
  const altCommit = 'f'.repeat(40);
  const altProvenance = {
    ...BASE_BUILD_PROVENANCE,
    source_commit_sha: altCommit,
  };
  altProvenance.build_provenance_hash = canonicalBuildProvenanceHash(altProvenance);
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: altProvenance });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_LINEAGE_DIVERGENCE');
  assert.equal(result.reason, 'build_source_commit_sha_mismatch');
});

test('FAIL: build_provenance.artifact_hash != deployable_artifact_hash → DEPLOY_LINEAGE_DIVERGENCE', () => {
  const altArtifactHash = canonicalHash({ artifact: 'substituted', commit_sha: MERGE_COMMIT_SHA });
  const altProvenance = {
    ...BASE_BUILD_PROVENANCE,
    artifact_hash: altArtifactHash,
  };
  altProvenance.build_provenance_hash = canonicalBuildProvenanceHash(altProvenance);
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: altProvenance });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_LINEAGE_DIVERGENCE');
  assert.equal(result.reason, 'build_artifact_hash_mismatch');
});

// ---------------------------------------------------------------------------
// Missing vs divergent boundary — spec rule verified by test
// ---------------------------------------------------------------------------

test('divergent build_source_commit_sha (both present, disagree) → LINEAGE_DIVERGENCE not INCOMPLETE', () => {
  const altProvenance = {
    ...BASE_BUILD_PROVENANCE,
    source_commit_sha: 'e'.repeat(40),
  };
  altProvenance.build_provenance_hash = canonicalBuildProvenanceHash(altProvenance);
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: altProvenance });
  assert.equal(result.classification, 'DEPLOY_LINEAGE_DIVERGENCE');
  assert.notEqual(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
});

test('missing source_commit_sha → INCOMPLETE not LINEAGE_DIVERGENCE', () => {
  const { source_commit_sha: _dropped, ...provenance } = BASE_BUILD_PROVENANCE;
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: provenance });
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
  assert.notEqual(result.classification, 'DEPLOY_LINEAGE_DIVERGENCE');
});

// ---------------------------------------------------------------------------
// Classification: DEPLOY_PROOF_MISMATCH
// ---------------------------------------------------------------------------

test('FAIL: tampered build_provenance_hash → DEPLOY_PROOF_MISMATCH', () => {
  const tamperedProvenance = {
    ...BASE_BUILD_PROVENANCE,
    build_provenance_hash: 'tampered_provenance_hash',
  };
  const result = auditDeployLegitimacy({ ...baseInput, build_provenance: tamperedProvenance });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_PROOF_MISMATCH');
  assert.equal(result.reason, 'build_provenance_hash_mismatch');
});

test('FAIL: tampered proof_binding_hash → DEPLOY_PROOF_MISMATCH', () => {
  const result = auditDeployLegitimacy({
    ...baseInput,
    proof_binding_hash: 'tampered_proof_binding_hash',
  });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_PROOF_MISMATCH');
  assert.equal(result.reason, 'proof_binding_hash_mismatch');
});

test('FAIL: proof_binding_hash from different deployment_proof_id → DEPLOY_PROOF_MISMATCH', () => {
  const altProofId = 'proof-' + 'c'.repeat(32);
  const altProofHash = canonicalDeployProofBindingHash({
    merge_legitimacy_closure_hash: MERGE_LEGITIMACY_CLOSURE_HASH,
    merge_commit_sha: MERGE_COMMIT_SHA,
    deployable_artifact_hash: DEPLOYABLE_ARTIFACT_HASH,
    validated_object_hash: VALIDATED_OBJECT_HASH,
    deployment_hash: DEPLOYMENT_HASH,
    deployment_proof_id: altProofId,
  });
  const result = auditDeployLegitimacy({
    ...baseInput,
    proof_binding_hash: altProofHash,
  });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_PROOF_MISMATCH');
  assert.equal(result.reason, 'proof_binding_hash_mismatch');
});

// ---------------------------------------------------------------------------
// Fail-closed: no single chain link can be absent without producing NULL
// ---------------------------------------------------------------------------

test('all required top-level fields absent simultaneously → DEPLOYMENT_LEGITIMACY_NULL', () => {
  const result = auditDeployLegitimacy({
    ...baseInput,
    session_id: null,
    continuity_id: null,
    decision_id: null,
  });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
});

test('all gate checks failing with missing merge_legitimacy_closure_hash → DEPLOYMENT_LEGITIMACY_NULL', () => {
  const result = auditDeployLegitimacy({
    ...baseInput,
    merge_legitimacy_closure_hash: null,
    proof_binding_hash: null,
  });
  assert.equal(result.result, 'DEPLOYMENT_LEGITIMACY_NULL');
  assert.equal(result.classification, 'DEPLOY_RECONCILIATION_INCOMPLETE');
});

// ---------------------------------------------------------------------------
// Determinism: identical inputs produce identical proof binding hash
// ---------------------------------------------------------------------------

test('DEPLOY_LEGITIMACY_CLOSED is deterministic for identical inputs', () => {
  const first = auditDeployLegitimacy(baseInput);
  const second = auditDeployLegitimacy({ ...baseInput });
  assert.equal(first.result, 'DEPLOY_LEGITIMACY_CLOSED');
  assert.equal(second.result, 'DEPLOY_LEGITIMACY_CLOSED');
  assert.equal(first.report.proof_binding_hash, second.report.proof_binding_hash);
  assert.equal(first.report.build_provenance_hash, second.report.build_provenance_hash);
});

test('different merge_commit_sha produces different proof_binding_hash', () => {
  const altCommit = 'd'.repeat(40);
  const altArtifact = canonicalHash({ artifact: 'build_artifact', commit_sha: altCommit });
  const altProvenance = {
    source_commit_sha: altCommit,
    artifact_hash: altArtifact,
    build_workflow: 'build.yml',
    build_run_id: 'run-123',
    builder_identity: 'github-actions',
    built_at: '2026-05-30T12:00:00Z',
  };
  altProvenance.build_provenance_hash = canonicalBuildProvenanceHash(altProvenance);

  const altProofHash = canonicalDeployProofBindingHash({
    merge_legitimacy_closure_hash: MERGE_LEGITIMACY_CLOSURE_HASH,
    merge_commit_sha: altCommit,
    deployable_artifact_hash: altArtifact,
    validated_object_hash: altArtifact,
    deployment_hash: altArtifact,
    deployment_proof_id: DEPLOYMENT_PROOF_ID,
  });

  const result = auditDeployLegitimacy({
    ...baseInput,
    merge_commit_sha: altCommit,
    deployable_artifact_hash: altArtifact,
    validated_object_hash: altArtifact,
    deployment_hash: altArtifact,
    proof_binding_hash: altProofHash,
    build_provenance: altProvenance,
  });

  assert.equal(result.result, 'DEPLOY_LEGITIMACY_CLOSED');
  assert.notEqual(
    result.report.proof_binding_hash,
    PROOF_BINDING_HASH,
    'different merge_commit_sha must produce different proof_binding_hash',
  );
});

test('different deployment_proof_id produces different canonicalDeployProofBindingHash', () => {
  const hash1 = canonicalDeployProofBindingHash({
    merge_legitimacy_closure_hash: MERGE_LEGITIMACY_CLOSURE_HASH,
    merge_commit_sha: MERGE_COMMIT_SHA,
    deployable_artifact_hash: DEPLOYABLE_ARTIFACT_HASH,
    validated_object_hash: VALIDATED_OBJECT_HASH,
    deployment_hash: DEPLOYMENT_HASH,
    deployment_proof_id: 'proof-aaa',
  });
  const hash2 = canonicalDeployProofBindingHash({
    merge_legitimacy_closure_hash: MERGE_LEGITIMACY_CLOSURE_HASH,
    merge_commit_sha: MERGE_COMMIT_SHA,
    deployable_artifact_hash: DEPLOYABLE_ARTIFACT_HASH,
    validated_object_hash: VALIDATED_OBJECT_HASH,
    deployment_hash: DEPLOYMENT_HASH,
    deployment_proof_id: 'proof-bbb',
  });
  assert.notEqual(hash1, hash2, 'different deployment_proof_id must produce different hash');
});

// ---------------------------------------------------------------------------
// Non-operability: audit alone does not authorize or execute deployment
// ---------------------------------------------------------------------------

test('DEPLOY_LEGITIMACY_CLOSED result does not contain deploy_authorized or deploy_executed fields', () => {
  const result = auditDeployLegitimacy(baseInput);
  assert.equal(result.result, 'DEPLOY_LEGITIMACY_CLOSED');
  assert.ok(!Object.hasOwn(result, 'deploy_authorized'));
  assert.ok(!Object.hasOwn(result, 'deploy_executed'));
  assert.ok(!Object.hasOwn(result, 'authority_created'));
  assert.ok(!Object.hasOwn(result, 'proof_generated'));
});

test('DEPLOY_LEGITIMACY_CLOSED report does not contain authority or execution artifacts', () => {
  const { report } = auditDeployLegitimacy(baseInput);
  assert.ok(!Object.hasOwn(report, 'authority_token'));
  assert.ok(!Object.hasOwn(report, 'execution_token'));
  assert.ok(!Object.hasOwn(report, 'deploy_command'));
});
