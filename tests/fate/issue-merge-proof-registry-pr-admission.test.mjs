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
  assert.match(workflow, /pull-requests:\s*read/, 'GITHUB_TOKEN should retain only read visibility for PR metadata');
  assert.match(workflow, /name: Append proof to registry via PR/, 'registry append step must route through PR admission');
  assert.match(workflow, /BRANCH_NAME="proof-registry\/\$\{PROOF_ID\}"/, 'registry entry must be committed on a proof-specific branch');
  assert.match(workflow, /git checkout -B "\$BRANCH_NAME" origin\/main/, 'branch must be created from main without checking out main for mutation');
  assert.match(workflow, /git push --force-with-lease origin "HEAD:\$BRANCH_NAME"/, 'workflow may push the proof branch only');
  assert.match(workflow, /GH_TOKEN="\$MERGE_PROOF_PR_TOKEN" gh pr create[\s\S]*--base main[\s\S]*--head "\$BRANCH_NAME"/, 'workflow must open a PR targeting main with the explicit registry PR token');

  assert.doesNotMatch(workflow, /git push(?:\s+origin)?\s+main\b/, 'workflow must never push directly to main');
  assert.doesNotMatch(workflow, /git pull --rebase origin main/, 'workflow must not retry a direct main append path');
  assert.doesNotMatch(workflow, /Admin action required: add 'github-actions\[bot\]' as a bypass actor/, 'workflow must not require a bypass actor');
});

test('merge-proof registry PR is idempotent by proof_id and carries required proof fields', () => {
  assert.match(workflow, /GH_TOKEN="\$MERGE_PROOF_PR_TOKEN" gh pr list[\s\S]*--state open[\s\S]*--base main[\s\S]*--search "\$PROOF_ID in:title,body"/, 'existing registry PRs must be searched by proof_id with the explicit registry PR token');
  assert.match(workflow, /Registry PR for proof_id \$PROOF_ID already exists/, 'existing PR detection must suppress duplicate creation');

  for (const field of prRequiredFields) {
    assert.match(workflow, new RegExp(field.replace('#', '\\#')), `registry PR body/title must include ${field}`);
  }

  assert.match(workflow, /Direct main persistence classification: NULL \(non-retryable\)/, 'direct persistence failure must be classified as NULL, not retryable');
  assert.match(workflow, /MERGE_PROOF_PR_TOKEN: \${{ secrets\.MERGE_PROOF_PR_TOKEN }}/, 'workflow must reference the explicit registry PR creation secret');
  assert.match(workflow, /if \[ -z "\${MERGE_PROOF_PR_TOKEN:-}" \]; then[\s\S]*NULL — registry PR creation token missing[\s\S]*exit 1/, 'missing registry PR token must fail closed as NULL');
  assert.doesNotMatch(workflow, /GH_TOKEN: \${{ secrets\.MERGE_PROOF_PR_TOKEN }}/, 'registry PR token must not be exported as a whole-step gh token');
  assert.match(workflow, /proof generated ≠ proof persisted/, 'workflow must preserve generation/persistence separation');
  assert.match(workflow, /git push --force-with-lease origin "HEAD:\$BRANCH_NAME"[\s\S]*GH_TOKEN="\$MERGE_PROOF_PR_TOKEN" gh pr create/, 'PR creation must remain the registry persistence path after proof branch push');
});

test('governance artifacts classify registry persistence as PR admission', () => {
  const bypass = branchProtectionPolicy.proof_registry_bypass;
  assert.equal(bypass.status, 'NOT_REQUIRED_PR_ADMISSION');
  assert.match(bypass.required_admin_action, /No bypass actor is required/);
  assert.match(bypass.required_admin_action, /MERGE_PROOF_PR_TOKEN/);
  assert.equal(bypass.bypass_actor, null);
  assert.match(bypass.persistence_path, /opens a PR to main/);
  assert.match(bypass.persistence_path, /MERGE_PROOF_PR_TOKEN/);
  assert.equal(bypass.pr_creation_token, 'MERGE_PROOF_PR_TOKEN');
  assert.equal(bypass.missing_pr_creation_token, 'NULL — registry PR creation token missing');
  assert.match(bypass.pr_creation_token_scope, /PR creation only/);
  assert.match(bypass.pr_creation_token_scope, /not grant or be used for direct main mutation/);
  assert.match(bypass.failure_mode, /NULL and non-retryable/);

  assert.equal(mergeLegitimacySpec.proof_storage_requirements.admission_path, 'PR_REQUIRED');
  assert.equal(mergeLegitimacySpec.proof_storage_requirements.direct_main_push, 'FORBIDDEN_NULL_NON_RETRYABLE');
  assert.equal(mergeLegitimacySpec.proof_storage_requirements.direct_main_bypass, 'NOT_REQUIRED_FORBIDDEN');
  assert.equal(mergeLegitimacySpec.proof_storage_requirements.pr_creation_token, 'MERGE_PROOF_PR_TOKEN');
  assert.equal(mergeLegitimacySpec.proof_storage_requirements.missing_pr_creation_token, 'NULL — registry PR creation token missing');
  assert.match(mergeLegitimacySpec.proof_storage_requirements.pr_creation_token_scope, /not direct main mutation/);
  assert.equal(mergeLegitimacySpec.failure_semantics.direct_main_persistence, 'NULL_NON_RETRYABLE');

  assert.equal(preoMergeProofSpec.proof_storage_requirements.admission_path, 'PR_REQUIRED');
  assert.equal(preoMergeProofSpec.proof_storage_requirements.direct_main_push, 'FORBIDDEN_NULL_NON_RETRYABLE');
  assert.equal(preoMergeProofSpec.proof_storage_requirements.direct_main_bypass, 'NOT_REQUIRED_FORBIDDEN');
  assert.equal(preoMergeProofSpec.proof_storage_requirements.pr_creation_token, 'MERGE_PROOF_PR_TOKEN');
  assert.equal(preoMergeProofSpec.proof_storage_requirements.missing_pr_creation_token, 'NULL — registry PR creation token missing');
  assert.match(preoMergeProofSpec.proof_storage_requirements.pr_creation_token_scope, /not direct main mutation/);
  assert.equal(preoMergeProofSpec.fail_closed_semantics.direct_main_persistence, 'NULL_NON_RETRYABLE');
});
