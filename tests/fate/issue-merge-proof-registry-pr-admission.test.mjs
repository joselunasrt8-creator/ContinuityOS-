import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
const branchProtectionPolicy = JSON.parse(
  readFileSync(join(root, 'governance', 'runtime', 'BRANCH_PROTECTION_POLICY.json'), 'utf8'),
);
const mergeLegitimacySpec = JSON.parse(
  readFileSync(join(root, 'governance', 'merge-legitimacy', 'MERGE_PROOF_SPEC.json'), 'utf8'),
);
const preoMergeProofSpec = JSON.parse(
  readFileSync(join(root, 'governance', 'preo', 'MERGE_PROOF_SPEC.json'), 'utf8'),
);

const prRequiredFields = ['PR number', 'proof_id', 'proof_hash', 'merge_commit_sha', 'merged_at'];

test('merge-proof registry persistence uses a pull request, not a direct main push', () => {
  assert.match(workflow, /pull-requests:\s*write/, 'workflow must be allowed to open the registry PR');
  assert.match(workflow, /name: Append proof to registry via PR/, 'registry append step must route through PR admission');
  assert.match(workflow, /BRANCH_NAME="proof-registry\/\$\{PROOF_ID\}"/, 'registry entry must be committed on a proof-specific branch');
  assert.match(workflow, /git checkout -B "\$BRANCH_NAME" origin\/main/, 'branch must be created from main without checking out main for mutation');
  assert.match(workflow, /git push --force-with-lease origin "HEAD:\$BRANCH_NAME"/, 'workflow may push the proof branch only');
  assert.match(workflow, /gh pr create[\s\S]*--base main[\s\S]*--head "\$BRANCH_NAME"/, 'workflow must open a PR targeting main');

  assert.doesNotMatch(workflow, /git push(?:\s+origin)?\s+main\b/, 'workflow must never push directly to main');
  assert.doesNotMatch(workflow, /git pull --rebase origin main/, 'workflow must not retry a direct main append path');
  assert.doesNotMatch(workflow, /Admin action required: add 'github-actions\[bot\]' as a bypass actor/, 'workflow must not require a bypass actor');
});

test('merge-proof registry PR is idempotent by proof_id and carries required proof fields', () => {
  assert.match(workflow, /gh pr list[\s\S]*--state open[\s\S]*--base main[\s\S]*--search "\$PROOF_ID in:title,body"/, 'existing registry PRs must be searched by proof_id');
  assert.match(workflow, /Registry PR for proof_id \$PROOF_ID already exists/, 'existing PR detection must suppress duplicate creation');

  for (const field of prRequiredFields) {
    assert.match(workflow, new RegExp(field.replace('#', '\\#')), `registry PR body/title must include ${field}`);
  }

  assert.match(workflow, /Direct main persistence classification: NULL \(non-retryable\)/, 'direct persistence failure must be classified as NULL, not retryable');
  assert.match(workflow, /proof generated ≠ proof persisted/, 'workflow must preserve generation/persistence separation');
});

test('governance artifacts classify registry persistence as PR admission', () => {
  const bypass = branchProtectionPolicy.proof_registry_bypass;
  assert.equal(bypass.status, 'NOT_REQUIRED_PR_ADMISSION');
  assert.equal(bypass.required_admin_action, 'None. No bypass actor is required for proof registry persistence.');
  assert.equal(bypass.bypass_actor, null);
  assert.match(bypass.persistence_path, /opens a PR to main/);
  assert.match(bypass.failure_mode, /NULL and non-retryable/);

  assert.equal(mergeLegitimacySpec.proof_storage_requirements.admission_path, 'PR_REQUIRED');
  assert.equal(mergeLegitimacySpec.proof_storage_requirements.direct_main_push, 'FORBIDDEN_NULL_NON_RETRYABLE');
  assert.equal(mergeLegitimacySpec.failure_semantics.direct_main_persistence, 'NULL_NON_RETRYABLE');

  assert.equal(preoMergeProofSpec.proof_storage_requirements.admission_path, 'PR_REQUIRED');
  assert.equal(preoMergeProofSpec.proof_storage_requirements.direct_main_push, 'FORBIDDEN_NULL_NON_RETRYABLE');
  assert.equal(preoMergeProofSpec.fail_closed_semantics.direct_main_persistence, 'NULL_NON_RETRYABLE');
});
