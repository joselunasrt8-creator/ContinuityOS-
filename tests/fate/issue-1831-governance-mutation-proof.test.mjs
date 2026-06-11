import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  classifyGovernedFiles,
  selectProofMutationClasses,
  computeGovernedFilesHash,
  selectGmaEntry,
  buildGovernanceMutationProof,
} from '../../governance/runtime/governance-mutation-proof.mjs';

const root = process.cwd();

function gmaEntry(overrides = {}) {
  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return {
    gma_id: 'GMA-test',
    decision_id: 'd'.repeat(64),
    continuity_id: 'c'.repeat(64),
    session_id: 's'.repeat(64),
    governed_files_hash: 'h'.repeat(64),
    mutation_classes: ['workflow_mutation'],
    branch: 'some-branch',
    authority_lineage_bound: true,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    status: 'GMA_VALID',
    ...overrides,
  };
}

test('the governance_mutation_proof binding logic lives under governance/ so changes to it are themselves governance_mutation', () => {
  const { governedFiles, mutationClasses } = classifyGovernedFiles(['governance/runtime/governance-mutation-proof.mjs']);
  assert.deepEqual(governedFiles, ['governance/runtime/governance-mutation-proof.mjs']);
  assert.deepEqual(mutationClasses, ['governance_mutation']);
});

test('classifyGovernedFiles tags the FULL governed-files set (governance/**, .github/workflows/**, src/**, etc.) mirroring merge-governance-check.yml', () => {
  const { governedFiles, mutationClasses } = classifyGovernedFiles([
    'governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION_SPEC.json',
    'governance/merge-legitimacy/merge_proof_registry.jsonl',
    'governance/merge-legitimacy/MERGE_PROOF_SPEC.json',
    '.github/workflows/merge-proof.yml',
    'src/index.ts',
    'README.md',
  ]);

  assert.deepEqual(governedFiles, [
    '.github/workflows/merge-proof.yml',
    'governance/merge-legitimacy/MERGE_PROOF_SPEC.json',
    'governance/merge-legitimacy/merge_proof_registry.jsonl',
    'src/index.ts',
  ]);
  assert.deepEqual(mutationClasses, ['governance_mutation', 'proof_persistence', 'runtime_mutation', 'workflow_mutation']);
});

test('classifyGovernedFiles returns no governed files or mutation classes for a non-governed diff', () => {
  const { governedFiles, mutationClasses } = classifyGovernedFiles(['README.md', 'docs/notes.md']);
  assert.deepEqual(governedFiles, []);
  assert.deepEqual(mutationClasses, []);
});

test('selectProofMutationClasses narrows the full mutation class set to governance_mutation/workflow_mutation only', () => {
  assert.deepEqual(
    selectProofMutationClasses(['governance_mutation', 'proof_persistence', 'runtime_mutation', 'workflow_mutation']),
    ['governance_mutation', 'workflow_mutation'],
  );
  assert.deepEqual(selectProofMutationClasses(['runtime_mutation', 'schema_mutation']), []);
});

test('computeGovernedFilesHash over the FULL governed-files set matches the hash merge-governance-check.yml used to admit the GMA, even when src/** is also changed', () => {
  const { governedFiles, mutationClasses } = classifyGovernedFiles([
    '.github/workflows/merge-proof.yml',
    'src/index.ts',
  ]);
  assert.deepEqual(governedFiles, ['.github/workflows/merge-proof.yml', 'src/index.ts']);
  assert.deepEqual(selectProofMutationClasses(mutationClasses), ['workflow_mutation']);

  const files = {
    '.github/workflows/merge-proof.yml': Buffer.from('workflow\n'),
    'src/index.ts': Buffer.from('export {}\n'),
  };
  // The GMA's governed_files_hash was computed over governed_files.txt, which
  // includes src/index.ts even though src/** alone isn't governance/workflow_mutation.
  const expectedParts = Object.keys(files)
    .sort()
    .map((f) => `${f}:${createHash('sha256').update(files[f]).digest('hex')}`);
  const expected = createHash('sha256').update(expectedParts.join('\n')).digest('hex');

  const actual = computeGovernedFilesHash(governedFiles, (f) => files[f]);
  assert.equal(actual, expected);
});

test('computeGovernedFilesHash matches the documented sorted "path:sha256(content)" algorithm', () => {
  const files = {
    'b.yml': Buffer.from('second\n'),
    'a.yml': Buffer.from('first\n'),
  };
  const expectedParts = Object.keys(files)
    .sort()
    .map((f) => `${f}:${createHash('sha256').update(files[f]).digest('hex')}`);
  const expected = createHash('sha256').update(expectedParts.join('\n')).digest('hex');

  const actual = computeGovernedFilesHash(Object.keys(files), (f) => files[f]);
  assert.equal(actual, expected);
});

test('selectGmaEntry picks the matching (branch, governed_files_hash, GMA_VALID, unexpired) entry', () => {
  const hash = 'a'.repeat(64);
  const entries = [
    gmaEntry({ gma_id: 'GMA-wrong-hash', branch: 'feature', governed_files_hash: 'b'.repeat(64) }),
    gmaEntry({ gma_id: 'GMA-wrong-branch', branch: 'other', governed_files_hash: hash }),
    gmaEntry({
      gma_id: 'GMA-expired',
      branch: 'feature',
      governed_files_hash: hash,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }),
    gmaEntry({ gma_id: 'GMA-correct', branch: 'feature', governed_files_hash: hash }),
  ];

  const selected = selectGmaEntry(entries, { branch: 'feature', governedFilesHash: hash });
  assert.ok(selected);
  assert.equal(selected.gma_id, 'GMA-correct');
});

test('selectGmaEntry deterministically picks the most recently created entry when multiple GMAs match', () => {
  const hash = 'a'.repeat(64);
  const older = gmaEntry({
    gma_id: 'GMA-older',
    branch: 'feature',
    governed_files_hash: hash,
    created_at: new Date(Date.now() - 60_000).toISOString(),
  });
  const newer = gmaEntry({
    gma_id: 'GMA-newer',
    branch: 'feature',
    governed_files_hash: hash,
    created_at: new Date().toISOString(),
  });

  // Order in the registry should not affect the outcome — selection is by created_at, not position.
  assert.equal(selectGmaEntry([older, newer], { branch: 'feature', governedFilesHash: hash }).gma_id, 'GMA-newer');
  assert.equal(selectGmaEntry([newer, older], { branch: 'feature', governedFilesHash: hash }).gma_id, 'GMA-newer');
});


test('selectGmaEntry returns null when no entry matches', () => {
  const entries = [gmaEntry({ gma_id: 'GMA-other', branch: 'feature', governed_files_hash: 'a'.repeat(64) })];
  const selected = selectGmaEntry(entries, { branch: 'feature', governedFilesHash: 'b'.repeat(64) });
  assert.equal(selected, null);
});

test('buildGovernanceMutationProof produces proof_status GENERATED and a stable canonical_hash when a GMA is bound', () => {
  const gma = gmaEntry({ gma_id: 'GMA-bound', branch: 'feature', governed_files_hash: 'a'.repeat(64) });

  const proof = buildGovernanceMutationProof({
    pr_number: 1991,
    merge_commit_sha: '27125a2347e02b5dd7ca50c45df87c51bb3ff820',
    merge_proof_id: 'PROOF-1991-27125a23',
    gma,
    mutationClasses: ['workflow_mutation'],
    governedFilesHash: 'a'.repeat(64),
    generatedAt: '2026-06-11T00:00:00Z',
  });

  assert.equal(proof.proof_id, 'GMPROOF-1991-27125a23');
  assert.equal(proof.record_type, 'GOVERNANCE_MUTATION_PROOF');
  assert.equal(proof.canonical_payload.proof_status, 'GENERATED');
  assert.equal(proof.canonical_payload.gma_id, 'GMA-bound');
  assert.equal(proof.canonical_payload.decision_id, gma.decision_id);

  const recomputed = createHash('sha256').update(JSON.stringify(proof.canonical_payload)).digest('hex');
  assert.equal(proof.canonical_hash, recomputed);
});

test('buildGovernanceMutationProof produces proof_status MISSING_AUTHORIZER without throwing when no GMA is found', () => {
  const proof = buildGovernanceMutationProof({
    pr_number: 1992,
    merge_commit_sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    merge_proof_id: 'PROOF-1992-deadbeef',
    gma: null,
    mutationClasses: ['governance_mutation'],
    governedFilesHash: 'c'.repeat(64),
    generatedAt: '2026-06-11T00:00:00Z',
  });

  assert.equal(proof.canonical_payload.proof_status, 'MISSING_AUTHORIZER');
  assert.equal(proof.canonical_payload.gma_id, null);
  assert.equal(proof.canonical_payload.decision_id, null);
  assert.equal(proof.canonical_payload.continuity_id, null);
  assert.equal(proof.canonical_payload.session_id, null);
});

test('merge-proof.yml wires governance_mutation_proof generation and registry persistence', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');

  assert.match(workflow, /name: Detect governance mutation and authorizing GMA \(GAP-005 \/ Issue #1831\)/);
  assert.match(workflow, /from '\.\/governance\/runtime\/governance-mutation-proof\.mjs'/);
  assert.match(workflow, /_record_type: "governance_mutation_proof"/);
  assert.match(workflow, /GOVERNANCE_MUTATION_PROOF\.json/);
});

test('governance_mutation_proof append is gated behind the existing MERGE_PROOF idempotency checks (replay-safe)', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  const appendStep = workflow.slice(workflow.indexOf('name: Append proof to registry via PR'));

  const idempotency1 = appendStep.indexOf('Idempotency 1');
  const idempotency2 = appendStep.indexOf('Idempotency 2');
  const govProofAppend = appendStep.indexOf('_record_type: "governance_mutation_proof"');

  assert.ok(idempotency1 >= 0 && idempotency2 >= 0 && govProofAppend >= 0);
  // Both idempotency early-exits must precede the governance_mutation_proof append,
  // so a rerun against an already-persisted proof_id skips both entries together
  // rather than appending a duplicate governance_mutation_proof line.
  assert.ok(idempotency1 < govProofAppend);
  assert.ok(idempotency2 < govProofAppend);
});

test('GOVERNANCE_MUTATION_PROOF_SPEC documents proof_status values and registry persistence', () => {
  const spec = JSON.parse(
    readFileSync(join(root, 'governance', 'merge-legitimacy', 'GOVERNANCE_MUTATION_PROOF_SPEC.json'), 'utf8'),
  );

  assert.deepEqual(spec.proof_object.proof_status_values, ['GENERATED', 'MISSING_AUTHORIZER']);
  assert.equal(spec.evidentiary_nature.re_decides_admission, false);
  assert.equal(spec.proof_storage_requirements.registry_location, 'governance/merge-legitimacy/merge_proof_registry.jsonl');
  assert.equal(spec.proof_storage_requirements.record_type_value, 'governance_mutation_proof');
});

test('GOVERNANCE_GAP_REGISTRY.md GAP-005 reflects governance_mutation_proof persistence wiring', () => {
  const registry = readFileSync(join(root, 'GOVERNANCE_GAP_REGISTRY.md'), 'utf8');
  assert.match(registry, /governance_mutation_proof entry \(record_type governance_mutation_proof, proof_status GENERATED\/MISSING_AUTHORIZER\)/);
  assert.match(registry, /pending observed real-PR evidence/);
});
