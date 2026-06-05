/**
 * Tests for GAP-005 Governance Self-Mutation Containment Check (#1831)
 *
 * Invariant: governance mutation cannot bypass governance.
 *
 * Verified blockers (per PR #1868 review):
 *   1. GMP governed_files_hash is recomputed from actual changed files — old
 *      matching GMA+GMP pairs for different files are rejected.
 *   2. GOVERNANCE_GAP_REGISTRY.md (root) is classified as governance_registry_mutation.
 *   3. Invalid expires_at strings are rejected (not treated as passing).
 *   4. GMP validated_object_hash must equal GMA validated_object_hash.
 *   5. (branch protection policy is verified separately via merge-governance-check.yml)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChangedFiles,
  computeGovernedFilesHash,
  validateGovernanceMutationProof,
  runContainmentCheck,
  REQUIRED_LIFECYCLE_STAGES,
  REQUIRED_GMP_FIELDS,
} from '../../scripts/governance-mutation-containment-check.mjs';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 1000).toISOString();

/**
 * Deterministic mock file reader: returns `mock:${path}` as bytes.
 * Used to compute a reproducible governed_files_hash in tests.
 */
function mockReadFile(path) {
  return Buffer.from(`mock:${path}`);
}

/**
 * Compute the governed_files_hash that mockReadFile produces for a set of files.
 * Use this to set gma.governed_files_hash so hash verification passes.
 */
function mockHash(files) {
  return computeGovernedFilesHash(files, mockReadFile);
}

function validGma(governed = [], overrides = {}) {
  return {
    gma_id: 'GMA-test-run-1',
    decision_id: 'decision-abc',
    continuity_id: 'continuity-abc',
    session_id: 'session-abc',
    validated_object_hash: 'voh-abc',
    governed_files_hash: mockHash(governed),
    mutation_classes: ['governance_mutation'],
    gm_control_class: 'GOVERNANCE_CONTAINED',
    authority_lineage_bound: true,
    created_at: new Date().toISOString(),
    expires_at: FUTURE,
    status: 'GMA_VALID',
    ...overrides,
  };
}

function validGmp(gma, overrides = {}) {
  return {
    gmp_id: 'GMP-test-run-1',
    gma_id: gma.gma_id,
    session_id: gma.session_id,
    continuity_id: gma.continuity_id,
    decision_id: gma.decision_id,
    validated_object_hash: gma.validated_object_hash,
    validation_receipt_id: 'vr-abc',
    execution_id: 'exec-abc',
    proof_id: 'proof-abc',
    governed_files_hash: gma.governed_files_hash,
    lifecycle_stages: [...REQUIRED_LIFECYCLE_STAGES],
    status: 'GMP_VALID',
    created_at: new Date().toISOString(),
    expires_at: FUTURE,
    ...overrides,
  };
}

// ── Classification tests ──────────────────────────────────────────────────────

test('classifyChangedFiles: non-governance file is not a governance primitive', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['README.md', 'docs/architecture.md', 'cli/index.mjs']);
  assert.equal(governed.length, 0);
  assert.equal(mutationClasses.size, 0);
});

test('classifyChangedFiles: GOVERNANCE_GAP_REGISTRY.md at root is governance_registry_mutation', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['GOVERNANCE_GAP_REGISTRY.md']);
  assert.equal(governed.length, 1);
  assert.ok(mutationClasses.has('governance_registry_mutation'), 'must be governance_registry_mutation');
});

test('classifyChangedFiles: GOVERNANCE_REQUIREMENTS.json at root is governance_registry_mutation', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['GOVERNANCE_REQUIREMENTS.json']);
  assert.equal(governed.length, 1);
  assert.ok(mutationClasses.has('governance_registry_mutation'));
});

test('classifyChangedFiles: governance policy file is governance_mutation', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['governance/runtime/MERGE_GOVERNANCE_RULES.json']);
  assert.equal(governed.length, 1);
  assert.ok(mutationClasses.has('governance_mutation'));
});

test('classifyChangedFiles: workflow YAML is workflow_mutation', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['.github/workflows/governed-deploy.yml']);
  assert.equal(governed.length, 1);
  assert.ok(mutationClasses.has('workflow_mutation'));
});

test('classifyChangedFiles: schema file is schema_mutation', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['schemas/authority.schema.json']);
  assert.equal(governed.length, 1);
  assert.ok(mutationClasses.has('schema_mutation'));
});

test('classifyChangedFiles: schema.sql is schema_mutation', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['schema.sql']);
  assert.equal(governed.length, 1);
  assert.ok(mutationClasses.has('schema_mutation'));
});

test('classifyChangedFiles: validator file in src/ is validator_mutation', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['src/lib/filesystem-aeo-validator.ts']);
  assert.equal(governed.length, 1);
  assert.ok(mutationClasses.has('validator_mutation'));
});

test('classifyChangedFiles: validator file in scripts/ is validator_mutation', () => {
  const { governed, mutationClasses } = classifyChangedFiles(['scripts/semantic_collapse_validator.mjs']);
  assert.equal(governed.length, 1);
  assert.ok(mutationClasses.has('validator_mutation'));
});

test('classifyChangedFiles: governance/authorizations/** is EXEMPT', () => {
  const { governed } = classifyChangedFiles([
    'governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION.json',
    'governance/authorizations/GOVERNANCE_MUTATION_PROOF.json',
  ]);
  assert.equal(governed.length, 0, 'GMA/GMP artifacts must not trigger containment check');
});

test('classifyChangedFiles: merge_proof_registry.jsonl is EXEMPT', () => {
  const { governed } = classifyChangedFiles(['governance/merge-legitimacy/merge_proof_registry.jsonl']);
  assert.equal(governed.length, 0);
});

test('classifyChangedFiles: multiple governance primitives detected together', () => {
  const { governed, mutationClasses } = classifyChangedFiles([
    'GOVERNANCE_GAP_REGISTRY.md',
    'governance/runtime/MERGE_GOVERNANCE_RULES.json',
    '.github/workflows/merge-governance-check.yml',
    'schemas/proof.schema.json',
    'README.md',
  ]);
  assert.equal(governed.length, 4);
  assert.ok(mutationClasses.has('governance_registry_mutation'));
  assert.ok(mutationClasses.has('governance_mutation'));
  assert.ok(mutationClasses.has('workflow_mutation'));
  assert.ok(mutationClasses.has('schema_mutation'));
});

// ── computeGovernedFilesHash tests ────────────────────────────────────────────

test('computeGovernedFilesHash: deterministic for same inputs', () => {
  const files = ['governance/runtime/MERGE_GOVERNANCE_RULES.json', '.github/workflows/foo.yml'];
  const h1 = computeGovernedFilesHash(files, mockReadFile);
  const h2 = computeGovernedFilesHash(files, mockReadFile);
  assert.equal(h1, h2);
});

test('computeGovernedFilesHash: different file sets produce different hashes', () => {
  const h1 = computeGovernedFilesHash(['governance/a.json'], mockReadFile);
  const h2 = computeGovernedFilesHash(['governance/b.json'], mockReadFile);
  assert.notEqual(h1, h2);
});

test('computeGovernedFilesHash: order-independent (sorts inputs)', () => {
  const files = ['governance/b.json', 'governance/a.json'];
  const sorted = ['governance/a.json', 'governance/b.json'];
  assert.equal(
    computeGovernedFilesHash(files, mockReadFile),
    computeGovernedFilesHash(sorted, mockReadFile),
  );
});

test('computeGovernedFilesHash: missing file treated as DELETED, not skipped', () => {
  const readWithMissing = (p) => { if (p === 'missing.json') throw new Error('ENOENT'); return mockReadFile(p); };
  const withMissing = computeGovernedFilesHash(['missing.json', 'governance/a.json'], readWithMissing);
  const withPresent = computeGovernedFilesHash(['governance/a.json'], mockReadFile);
  assert.notEqual(withMissing, withPresent, 'deleted file must change the hash');
});

// ── validateGovernanceMutationProof tests ─────────────────────────────────────

test('validateGovernanceMutationProof: valid GMP passes', () => {
  const gma = validGma(['governance/runtime/MERGE_GOVERNANCE_RULES.json']);
  const result = validateGovernanceMutationProof(validGmp(gma), gma);
  assert.equal(result.valid, true);
});

test('validateGovernanceMutationProof: rejects GMP with wrong status', () => {
  const gma = validGma([]);
  const result = validateGovernanceMutationProof(validGmp(gma, { status: 'PENDING' }), gma);
  assert.equal(result.valid, false);
  assert.match(result.reason, /GMP_VALID/);
});

test('validateGovernanceMutationProof: rejects expired GMP', () => {
  const gma = validGma([]);
  const result = validateGovernanceMutationProof(validGmp(gma, { expires_at: PAST }), gma);
  assert.equal(result.valid, false);
  assert.match(result.reason, /expired/);
});

test('validateGovernanceMutationProof: rejects GMP with invalid (non-date) expires_at string', () => {
  const gma = validGma([]);
  // "not-a-date" → new Date("not-a-date").getTime() is NaN → must reject
  const result = validateGovernanceMutationProof(validGmp(gma, { expires_at: 'not-a-date' }), gma);
  assert.equal(result.valid, false);
  assert.match(result.reason, /not a valid date/i);
});

test('validateGovernanceMutationProof: rejects GMP with expires_at = empty string (would be NaN)', () => {
  const gma = validGma([]);
  // REQUIRED_GMP_FIELDS check catches empty string first, but be explicit
  const gmp = validGmp(gma);
  gmp.expires_at = '';
  const result = validateGovernanceMutationProof(gmp, gma);
  assert.equal(result.valid, false);
});

test('validateGovernanceMutationProof: rejects GMP missing a lifecycle stage', () => {
  const gma = validGma([]);
  for (const missingStage of REQUIRED_LIFECYCLE_STAGES) {
    const stages = REQUIRED_LIFECYCLE_STAGES.filter((s) => s !== missingStage);
    const result = validateGovernanceMutationProof(validGmp(gma, { lifecycle_stages: stages }), gma);
    assert.equal(result.valid, false, `Should reject GMP missing stage: ${missingStage}`);
    assert.match(result.reason, new RegExp(missingStage));
  }
});

test('validateGovernanceMutationProof: rejects GMP with gma_id mismatch', () => {
  const gma = validGma([]);
  const result = validateGovernanceMutationProof(validGmp(gma, { gma_id: 'GMA-wrong' }), gma);
  assert.equal(result.valid, false);
  assert.match(result.reason, /gma_id/);
});

test('validateGovernanceMutationProof: rejects GMP with governed_files_hash mismatch', () => {
  const gma = validGma([]);
  const result = validateGovernanceMutationProof(validGmp(gma, { governed_files_hash: 'different-hash' }), gma);
  assert.equal(result.valid, false);
  assert.match(result.reason, /governed_files_hash/);
});

test('validateGovernanceMutationProof: rejects GMP with validated_object_hash mismatch', () => {
  const gma = validGma([]);
  const result = validateGovernanceMutationProof(
    validGmp(gma, { validated_object_hash: 'different-voh' }),
    gma,
  );
  assert.equal(result.valid, false);
  assert.match(result.reason, /validated_object_hash/);
});

test('validateGovernanceMutationProof: rejects GMP with session_id mismatch', () => {
  const gma = validGma([]);
  const result = validateGovernanceMutationProof(validGmp(gma, { session_id: 'session-different' }), gma);
  assert.equal(result.valid, false);
  assert.match(result.reason, /session_id/);
});

test('validateGovernanceMutationProof: rejects GMP with continuity_id mismatch', () => {
  const gma = validGma([]);
  const result = validateGovernanceMutationProof(validGmp(gma, { continuity_id: 'continuity-different' }), gma);
  assert.equal(result.valid, false);
  assert.match(result.reason, /continuity_id/);
});

test('validateGovernanceMutationProof: rejects GMP with decision_id mismatch', () => {
  const gma = validGma([]);
  const result = validateGovernanceMutationProof(validGmp(gma, { decision_id: 'decision-different' }), gma);
  assert.equal(result.valid, false);
  assert.match(result.reason, /decision_id/);
});

for (const field of REQUIRED_GMP_FIELDS) {
  test(`validateGovernanceMutationProof: rejects GMP missing field: ${field}`, () => {
    const gma = validGma([]);
    const gmp = validGmp(gma);
    delete gmp[field];
    const result = validateGovernanceMutationProof(gmp, gma);
    assert.equal(result.valid, false);
    assert.match(result.reason, new RegExp(field.replace('_', '.')));
  });
}

// ── runContainmentCheck integration tests ────────────────────────────────────

test('runContainmentCheck: non-governance change is CONTAINED (no readFile needed)', () => {
  const check = runContainmentCheck({
    changedFiles: ['README.md', 'docs/threat-model.md'],
    gma: null,
    gmp: null,
  });
  assert.equal(check.result, 'CONTAINED');
  assert.equal(check.reason, 'no_governance_primitive_mutation');
});

test('runContainmentCheck: governed files with no readFile → NULL (hash_verification_impossible)', () => {
  const files = ['governance/runtime/MERGE_GOVERNANCE_RULES.json'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma, gmp: null, readFile: null });
  assert.equal(check.result, 'NULL');
  assert.equal(check.reason, 'hash_verification_impossible');
});

test('runContainmentCheck: validator mutation without GMP is NULL (failing case)', () => {
  const files = ['src/lib/filesystem-aeo-validator.ts'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma, gmp: null, readFile: mockReadFile });
  assert.equal(check.result, 'NULL');
  assert.equal(check.reason, 'governance_mutation_without_proof');
  assert.ok(check.governed.includes('src/lib/filesystem-aeo-validator.ts'));
});

test('runContainmentCheck: validator mutation without GMA is NULL', () => {
  const files = ['src/lib/filesystem-aeo-validator.ts'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma: null, gmp: validGmp(gma), readFile: mockReadFile });
  assert.equal(check.result, 'NULL');
  assert.equal(check.reason, 'governance_mutation_without_gma');
});

test('runContainmentCheck: schema file mutation without GMP is NULL (failing case)', () => {
  const files = ['schemas/authority.schema.json'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma, gmp: null, readFile: mockReadFile });
  assert.equal(check.result, 'NULL');
  assert.equal(check.reason, 'governance_mutation_without_proof');
});

test('runContainmentCheck: policy file mutation without GMP is NULL (failing case)', () => {
  const files = ['governance/runtime/MERGE_GOVERNANCE_RULES.json'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma, gmp: null, readFile: mockReadFile });
  assert.equal(check.result, 'NULL');
  assert.equal(check.reason, 'governance_mutation_without_proof');
});

test('runContainmentCheck: workflow YAML mutation without GMP is NULL (failing case)', () => {
  const files = ['.github/workflows/governed-deploy.yml'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma, gmp: null, readFile: mockReadFile });
  assert.equal(check.result, 'NULL');
  assert.equal(check.reason, 'governance_mutation_without_proof');
});

test('runContainmentCheck: GOVERNANCE_GAP_REGISTRY.md mutation without GMP is NULL', () => {
  const files = ['GOVERNANCE_GAP_REGISTRY.md'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma, gmp: null, readFile: mockReadFile });
  assert.equal(check.result, 'NULL');
  assert.equal(check.reason, 'governance_mutation_without_proof');
  assert.ok(check.governed.includes('GOVERNANCE_GAP_REGISTRY.md'));
});

test('runContainmentCheck: mutation with expired GMP is NULL', () => {
  const files = ['governance/runtime/MERGE_GOVERNANCE_RULES.json'];
  const gma = validGma(files);
  const check = runContainmentCheck({
    changedFiles: files,
    gma,
    gmp: validGmp(gma, { expires_at: PAST }),
    readFile: mockReadFile,
  });
  assert.equal(check.result, 'NULL');
  assert.match(check.reason, /expired/);
});

test('runContainmentCheck: mutation with invalid date GMP expires_at is NULL', () => {
  const files = ['governance/runtime/MERGE_GOVERNANCE_RULES.json'];
  const gma = validGma(files);
  const check = runContainmentCheck({
    changedFiles: files,
    gma,
    gmp: validGmp(gma, { expires_at: 'not-a-date' }),
    readFile: mockReadFile,
  });
  assert.equal(check.result, 'NULL');
  assert.match(check.reason, /not a valid date/i);
});

test('runContainmentCheck: mutation with incomplete lifecycle (missing execute+proof) is NULL', () => {
  const files = ['.github/workflows/governed-deploy.yml'];
  const gma = validGma(files);
  const partialStages = ['session', 'continuity', 'authority', 'compile', 'validate'];
  const check = runContainmentCheck({
    changedFiles: files,
    gma,
    gmp: validGmp(gma, { lifecycle_stages: partialStages }),
    readFile: mockReadFile,
  });
  assert.equal(check.result, 'NULL');
  assert.match(check.reason, /execute|proof/);
});

test('runContainmentCheck: mutation with valid GMA + full GMP is CONTAINED (passing case)', () => {
  const files = ['governance/runtime/MERGE_GOVERNANCE_RULES.json'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma, gmp: validGmp(gma), readFile: mockReadFile });
  assert.equal(check.result, 'CONTAINED');
  assert.equal(check.reason, 'full_lifecycle_proof_verified');
  assert.equal(check.gmp_id, 'GMP-test-run-1');
  assert.equal(check.gma_id, 'GMA-test-run-1');
});

test('runContainmentCheck: workflow mutation with valid GMA + full GMP is CONTAINED', () => {
  const files = ['.github/workflows/governance-mutation-authorization.yml'];
  const gma = validGma(files);
  const check = runContainmentCheck({ changedFiles: files, gma, gmp: validGmp(gma), readFile: mockReadFile });
  assert.equal(check.result, 'CONTAINED');
});

test('runContainmentCheck: exempted governance/authorizations/** does not trigger containment', () => {
  const check = runContainmentCheck({
    changedFiles: ['governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION.json'],
    gma: null,
    gmp: null,
  });
  assert.equal(check.result, 'CONTAINED');
  assert.equal(check.reason, 'no_governance_primitive_mutation');
});

// ── Key invariant: GMA+GMP must match THIS PR's files, not just each other ────

test('runContainmentCheck: old GMA+GMP for different files is NULL (core anti-bypass)', () => {
  // An old, valid, matching GMA+GMP pair authorized `governance/old-file.json`.
  // The current PR changes `governance/runtime/MERGE_GOVERNANCE_RULES.json`.
  // The old pair must NOT authorize this new mutation.
  const oldFiles = ['governance/old-policy-file.json'];
  const oldGma = validGma(oldFiles);
  const oldGmp = validGmp(oldGma);

  const currentPrFiles = ['governance/runtime/MERGE_GOVERNANCE_RULES.json'];

  const check = runContainmentCheck({
    changedFiles: currentPrFiles,
    gma: oldGma,      // GMA was for old files
    gmp: oldGmp,      // GMP matches old GMA
    readFile: mockReadFile,
  });

  assert.equal(check.result, 'NULL');
  assert.match(check.reason, /gma_governed_files_hash_mismatch/);
});

test('runContainmentCheck: GMP with wrong validated_object_hash is NULL', () => {
  const files = ['governance/runtime/MERGE_GOVERNANCE_RULES.json'];
  const gma = validGma(files);
  const gmp = validGmp(gma, { validated_object_hash: 'tampered-voh' });
  const check = runContainmentCheck({ changedFiles: files, gma, gmp, readFile: mockReadFile });
  assert.equal(check.result, 'NULL');
  assert.match(check.reason, /validated_object_hash/);
});

// ── Comprehensive invariant: governance mutation cannot bypass governance ──────

test('runContainmentCheck: governance mutation cannot bypass governance (core invariant)', () => {
  const primitives = [
    ['governance/runtime/MERGE_GOVERNANCE_RULES.json'],
    ['.github/workflows/merge-governance-check.yml'],
    ['schemas/session.schema.json'],
    ['src/lib/filesystem-aeo-validator.ts'],
    ['GOVERNANCE_GAP_REGISTRY.md'],
  ];

  for (const files of primitives) {
    const file = files[0];

    // No evidence → NULL
    const noEvidence = runContainmentCheck({ changedFiles: files, gma: null, gmp: null });
    assert.equal(noEvidence.result, 'NULL', `${file} without evidence must be NULL`);

    // GMA only (no GMP) → NULL
    const gma = validGma(files);
    const gmaOnly = runContainmentCheck({ changedFiles: files, gma, gmp: null, readFile: mockReadFile });
    assert.equal(gmaOnly.result, 'NULL', `${file} with GMA but no GMP must be NULL`);

    // GMA + GMP for wrong files → NULL
    const wrongGma = validGma(['governance/wrong-file.json']);
    const wrongGmp = validGmp(wrongGma);
    const wrongPair = runContainmentCheck({ changedFiles: files, gma: wrongGma, gmp: wrongGmp, readFile: mockReadFile });
    assert.equal(wrongPair.result, 'NULL', `${file} with mismatched GMA+GMP must be NULL`);

    // Full evidence for correct files → CONTAINED
    const fullGma = validGma(files);
    const fullGmp = validGmp(fullGma);
    const fullEvidence = runContainmentCheck({ changedFiles: files, gma: fullGma, gmp: fullGmp, readFile: mockReadFile });
    assert.equal(fullEvidence.result, 'CONTAINED', `${file} with full correct evidence must be CONTAINED`);
  }
});

// ── Required lifecycle and field declarations ─────────────────────────────────

test('REQUIRED_LIFECYCLE_STAGES covers the full canonical governed lifecycle', () => {
  assert.deepEqual(
    REQUIRED_LIFECYCLE_STAGES,
    ['session', 'continuity', 'authority', 'compile', 'validate', 'execute', 'proof'],
  );
});

test('REQUIRED_GMP_FIELDS includes all binding fields for lifecycle evidence', () => {
  const mustHave = ['gmp_id', 'gma_id', 'session_id', 'continuity_id', 'decision_id',
    'validated_object_hash', 'validation_receipt_id', 'execution_id', 'proof_id',
    'governed_files_hash', 'lifecycle_stages', 'status'];
  for (const field of mustHave) {
    assert.ok(REQUIRED_GMP_FIELDS.includes(field), `REQUIRED_GMP_FIELDS must include: ${field}`);
  }
});
