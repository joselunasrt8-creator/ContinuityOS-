import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateComputeLegitimacyObject,
  validateWorkloadAuthority,
  validateAgentFleetBoundary,
  validateVirtualCollaboratorBoundary,
  validateFrontierReleaseAuthority,
  createComputeUsageProof,
  ReplayGuard,
} from '../src/lib/legitimacy-governance.js';

test('CLO enforces fail-closed and validity predicate', () => {
  const valid = validateComputeLegitimacyObject({
    object_id: 'clo-1', authority_id: 'auth-1', aeo_id: 'aeo-1', workload_authority_id: 'wa-1',
    policy_result: 'VALID_AND_AUTHORIZED_AND_UNUSED_AND_POLICY_VALID',
    issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2030-01-01T00:00:00.000Z',
    execution_target: 'github:prod:deploy', replay_nonce: 'n-1', unused: true,
  });
  assert.equal(valid.ok, true);
  const invalid = validateComputeLegitimacyObject({ object_id: 'x' });
  assert.equal(invalid.state, 'NULL');
});

test('Workload authority requires budget/platform/surface controls', () => {
  const result = validateWorkloadAuthority({
    authority_id: 'wa-1', workload_class: 'training', token_budget: 10, cost_ceiling_usd: 1,
    compute_platform: 'cloudflare', execution_surfaces: ['/execute'], duration_limit_seconds: 30,
    issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2030-01-01T00:00:00.000Z', revoked: false,
  });
  assert.equal(result.ok, true);
});

test('Agent fleet boundary blocks sensitive actions unless explicit controls exist', () => {
  const result = validateAgentFleetBoundary({
    boundary_id: 'afb-1', agents: ['agent-a'],
    forbidden_actions: ['mutate_repository','modify_infra','change_financial_records','deploy_systems','invoke_external_apis','alter_enterprise_workflows'],
    authority_binding_required: true, proof_required: true, validator_required: true,
  });
  assert.equal(result.ok, true);
});

test('Virtual collaborator boundary enforces identity and tool boundary', () => {
  const result = validateVirtualCollaboratorBoundary({
    collaborator_id: 'vc-1', identity_continuity_id: 'id-1', session_id: 's-1',
    memory_boundary: { max_context_tokens: 2048 }, revocation_epoch: 4, tool_authorizations: ['read_only'],
  });
  assert.equal(result.ok, true);
});

test('Frontier release authority requires class, phase, rollback and proof', () => {
  const result = validateFrontierReleaseAuthority({
    release_id: 'fr-1', capability_class: 'agentic', phase: 'limited', rollback_required: true, proof_required: true,
    issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2030-01-01T00:00:00.000Z',
  });
  assert.equal(result.ok, true);
});

test('Proof generation and replay protection', () => {
  const proof = createComputeUsageProof({
    authority_id: 'auth-1', execution_id: 'exe-1', workload_class: 'inference', compute_platform: 'cloudflare-gpu',
    tokens_used: 777, accelerator_hours: 0.2, timestamps: { started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-01T00:01:00.000Z' },
    result_reference: 'proof://registry/proof-1',
  });
  assert.equal(proof.ok, true);
  const guard = new ReplayGuard();
  assert.equal(guard.consume('auth-1', proof.proof_hash).ok, true);
  assert.equal(guard.consume('auth-1', proof.proof_hash).state, 'NULL');
});
