import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8'));
}

const surfaces = readJson('EXECUTION_SURFACES.json');
const bypass = readJson('BYPASS_PATHS.json');
const requirements = readJson('GOVERNANCE_REQUIREMENTS.json');
const source = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');
const governedDeploy = readFileSync(join(process.cwd(), '.github/workflows/governed-deploy.yml'), 'utf8');
const prepareDeploy = readFileSync(join(process.cwd(), '.github/workflows/prepare-governed-deploy.yml'), 'utf8');
const packageJson = readJson('package.json');

const surfaceIds = new Set(surfaces.surfaces.map((surface) => surface.surface_id));
const bypassIds = new Set(bypass.bypass_paths.map((path) => path.bypass_id));

function requireSurface(id) {
  assert.equal(surfaceIds.has(id), true, `missing execution surface: ${id}`);
}

function requireBypass(id) {
  assert.equal(bypassIds.has(id), true, `missing bypass path: ${id}`);
}

test('execution-capable surfaces enumerate governed, raw-write, webhook, and hidden paths', () => {
  for (const id of [
    'github_governed_deploy_workflow',
    'github_prepare_governed_deploy_workflow',
    'cloudflare_worker_runtime_router',
    'd1_schema_and_migrations',
    'package_manager_scripts',
    'wrangler_configuration',
    'legacy_demo_entrypoints',
    'static_demo_webhook_objects',
  ]) {
    requireSurface(id);
  }

  assert.ok(
    surfaces.surfaces.some((surface) => surface.capabilities.includes('D1 registry writes')),
    'runtime D1 write surface must be explicitly inventoried',
  );
  assert.ok(
    surfaces.surfaces.some((surface) => surface.capabilities.includes('transfer_webhook intent')),
    'webhook mutation representation must be explicitly inventoried',
  );
});

test('bypass paths identify direct deploy, raw DB write, webhook, hidden, exact-object, and proof bypass classes', () => {
  for (const id of [
    'direct_wrangler_deploy',
    'raw_d1_migration_apply',
    'runtime_raw_registry_write',
    'manual_governed_workflow_dispatch_without_valid_object',
    'webhook_mutation_demo_object',
    'legacy_runtime_entrypoint_invocation',
    'mutation_after_validation',
    'proof_without_execution_lineage',
    'github_admin_branch_protection_root_override',
    'github_repository_environment_secret_root_override',
    'cloudflare_account_or_token_direct_deploy',
    'local_authenticated_wrangler_direct_deploy',
    'github_direct_push_to_main',
    'github_force_push_to_main',
    'github_branch_protection_bypass',
  ]) {
    requireBypass(id);
  }

  assert.equal(bypass.fail_closed_response, 'NULL');
  assert.ok(bypass.bypass_paths.every((path) => /NULL|block|governed|quarantine/i.test(path.required_response)));
});


test('merge legitimacy governance closes source-control merge method and root bypass gaps', () => {
  const merge = readJson('governance/runtime/MERGE_GOVERNANCE_RULES.json');
  const branch = readJson('governance/runtime/BRANCH_PROTECTION_POLICY.json');

  assert.equal(merge.preo_valid_canonical_gate.canonical_gate, 'PREO_VALID');
  assert.equal(merge.preo_valid_canonical_gate.merge_legitimacy_without_preo_valid, 'NULL');
  assert.deepEqual(merge.required_checks, [
    'merge-governance-check',
    'generate-preo-candidate',
    'generate-sco-candidate',
  ]);
  assert.equal(merge.pr_head_sha_binding.stale_review_reuse_result, 'NULL');
  assert.equal(merge.pr_head_sha_binding.stale_check_reuse_result, 'NULL');
  assert.equal(merge.sco_enforcement.governed_mutation_without_sco_result, 'NULL');
  assert.equal(merge.merge_method_policy.merge_queue.allowed_only_if_required_checks_bind_current_head_sha, true);
  assert.equal(merge.merge_method_policy.squash_merge.stale_review_or_check_reuse_result, 'NULL');
  assert.equal(merge.merge_method_policy.rebase_merge.stale_review_or_check_reuse_result, 'NULL');
  assert.equal(merge.bypass_path_policy.direct_push_to_main.allowed, false);
  assert.equal(merge.bypass_path_policy.force_push_to_main.allowed, false);
  assert.equal(merge.bypass_path_policy.branch_protection_bypass.legitimacy_source, false);
  assert.equal(merge.root_authority_policy.admin_bypass_is_legitimacy, false);
  assert.equal(merge.root_authority_policy.root_authority_evidence_may_authorize_merge, false);
  assert.equal(branch.required_controls.restrict_direct_push_to_main, true);
  assert.equal(branch.required_controls.allow_force_pushes, false);
  assert.equal(branch.required_controls.require_merge_queue_required_checks_on_enqueued_head, true);
});

test('exact-object validation requirements preserve validated_object equals executed_object', () => {
  assert.deepEqual(requirements.canonical_execution_path, ['/authority', '/compile', '/validate', '/execute', '/proof']);
  assert.match(requirements.canonical_invariant, /If no valid object exists/);

  const exactTests = requirements.validation_tests.exact_object.map((entry) => entry.test_id);
  assert.deepEqual(exactTests.sort(), [
    'execute_requires_validated_object_row',
    'post_validation_mutation_rejected',
    'proof_lineage_must_match_execution',
  ].sort());

  assert.match(source, /validated_object_hash/);
  assert.match(source, /reason:"hash_mismatch"/);
  assert.match(source, /authority_lineage,execution_lineage/);
  assert.match(governedDeploy, /COMPILED_HASH[\s\S]*VALIDATED_OBJECT_HASH/);
  assert.match(governedDeploy, /RETURNED_HASH[\s\S]*VALIDATED_OBJECT_HASH/);
});

test('replay-resistance requirements are mapped to runtime/workflow enforcement signals', () => {
  const replayTests = requirements.validation_tests.replay_resistance.map((entry) => entry.test_id);
  assert.deepEqual(replayTests.sort(), [
    'duplicate_proof_blocked',
    'reused_authority_blocked',
    'reused_invocation_nonce_blocked',
  ].sort());

  assert.match(source, /invocation_registry/);
  assert.match(source, /status='EXECUTED'/);
  assert.match(source, /status='CONSUMED'/);
  assert.match(source, /replay_detected/);
  assert.match(governedDeploy, /Save replay response/);
  assert.match(governedDeploy, /REPLAY_STATUS[\s\S]*NULL/);
});

test('continuity lineage scaffolding is declared and backed by runtime lineage fields', () => {
  const continuityTests = requirements.validation_tests.continuity_lineage_scaffolding.map((entry) => entry.test_id);
  assert.deepEqual(continuityTests.sort(), [
    'continuity_hash_rederived',
    'proof_persists_continuity_lineage',
    'revoked_continuity_blocks_execution',
  ].sort());

  for (const field of ['continuity_id', 'continuity_hash', 'identity_id', 'authority_lineage', 'execution_lineage']) {
    assert.match(source, new RegExp(field), `runtime source must include ${field}`);
  }
  assert.match(source, /cascadeRevocation/);
  assert.match(source, /revoked_continuity/);
});

test('non-bypassable workflow and package guardrails remain fail-closed', () => {
  assert.doesNotMatch(prepareDeploy, /\/execute|\/proof|wrangler deploy/);
  assert.match(governedDeploy, /\/authority[\s\S]*\/compile[\s\S]*\/validate[\s\S]*\/execute[\s\S]*\/proof/);
  assert.match(packageJson.scripts.deploy, /Direct deploy disabled/);
});
