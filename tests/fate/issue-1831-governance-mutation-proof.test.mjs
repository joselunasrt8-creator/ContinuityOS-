import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  classifyGovernedFiles,
  computeGovernedFilesHash,
  selectGmaEntry,
  buildGovernanceMutationProof,
} from '../../runtime/governance-mutation-proof.mjs';

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

test('classifyGovernedFiles tags governance/** and .github/workflows/** with the correct mutation classes', () => {
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
  ]);
  assert.deepEqual(mutationClasses, ['governance_mutation', 'workflow_mutation']);
});

test('classifyGovernedFiles returns no mutation classes for a non-governance diff', () => {
  const { governedFiles, mutationClasses } = classifyGovernedFiles(['src/index.ts', 'README.md']);
  assert.deepEqual(governedFiles, []);
  assert.deepEqual(mutationClasses, []);
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
  assert.match(workflow, /from '\.\/runtime\/governance-mutation-proof\.mjs'/);
  assert.match(workflow, /_record_type: "governance_mutation_proof"/);
  assert.match(workflow, /GOVERNANCE_MUTATION_PROOF\.json/);
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
