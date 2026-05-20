import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const governedDeployWorkflow = readFileSync('.github/workflows/governed-deploy.yml', 'utf8');
const prepareGovernedDeployWorkflow = readFileSync('.github/workflows/prepare-governed-deploy.yml', 'utf8');
const governanceGapRegistry = readFileSync('GOVERNANCE_GAP_REGISTRY.md', 'utf8');

const routeOrderPattern = /"\$CLEAN_WORKER_URL\/session"[\s\S]*"\$CLEAN_WORKER_URL\/continuity"[\s\S]*"\$CLEAN_WORKER_URL\/authority"[\s\S]*"\$CLEAN_WORKER_URL\/compile"[\s\S]*"\$CLEAN_WORKER_URL\/validate"[\s\S]*"\$CLEAN_WORKER_URL\/execute"[\s\S]*"\$CLEAN_WORKER_URL\/proof"/;

function workflowStep(name) {
  const start = governedDeployWorkflow.indexOf(`- name: ${name}`);
  assert.notEqual(start, -1, `${name} step must exist`);
  const next = governedDeployWorkflow.indexOf('\n      - name:', start + 1);
  return governedDeployWorkflow.slice(start, next === -1 ? undefined : next);
}

test('valid governed deploy path preserves canonical chain and ends PROVEN', () => {
  assert.match(governedDeployWorkflow, routeOrderPattern);
  assert.match(governedDeployWorkflow, /\[ "\$PROOF_STATUS" = "NULL" \] \|\| \[ "\$PROOF_STATUS" != "PROVEN" \]/);
});

test('governed deploy carries one invocation nonce through validate, execute, and proof', () => {
  assert.match(governedDeployWorkflow, /invocation_nonce:\s*\n\s*required: true/);
  assert.match(governedDeployWorkflow, /INVOCATION_NONCE: \$\{\{ github\.event\.inputs\.invocation_nonce \}\}/);
  assert.match(governedDeployWorkflow, /for var in DECISION_ID VALIDATED_OBJECT_HASH INVOCATION_NONCE WORKER_URL API_KEY/);

  for (const name of ['Save validate response', 'Save execute response', 'Save proof response']) {
    const step = workflowStep(name);
    assert.match(step, /--arg invocation_nonce "\$INVOCATION_NONCE"/);
    assert.match(step, /invocation_nonce: \$invocation_nonce/);
  }
});

test('governed deploy proof request includes required lineage', () => {
  const proofStep = workflowStep('Save proof response');

  for (const field of [
    /--arg session_id "\$SESSION_ID"/,
    /--arg continuity_id "\$CONTINUITY_ID"/,
    /--arg decision_id "\$DECISION_ID"/,
    /--arg validated_object_hash "\$VALIDATED_OBJECT_HASH"/,
    /--arg invocation_nonce "\$INVOCATION_NONCE"/,
    /session_id: \$session_id/,
    /continuity_id: \$continuity_id/,
    /decision_id: \$decision_id/,
    /validated_object_hash: \$validated_object_hash/,
    /invocation_nonce: \$invocation_nonce/,
  ]) {
    assert.match(proofStep, field);
  }
});

test('missing authority is fail-closed NULL', () => {
  assert.match(governedDeployWorkflow, /if \[ "\$AUTHORITY_STATUS" = "NULL" \] \|\| \[ "\$AUTHORITY_STATUS" != "ACTIVE" \] \|\| \[ "\$AUTHORITY_DECISION_ID" != "\$DECISION_ID" \]; then[\s\S]*echo "NULL — Authority response is non-canonical"/);
});

test('hash mismatch fails closed as NULL', () => {
  assert.match(governedDeployWorkflow, /echo "NULL — compile hash mismatch"/);
  assert.match(governedDeployWorkflow, /echo "NULL — Hash mismatch"/);
});

test('replay attempt is blocked as NULL', () => {
  assert.match(governedDeployWorkflow, /if \[ "\$REPLAY_STATUS" != "NULL" \] \|\| \[ "\$REPLAY_RESULT" != "INVALID" \]; then[\s\S]*echo "NULL — Replay protection failed"/);
});

test('missing proof fails closed', () => {
  assert.match(governedDeployWorkflow, /echo "NULL — Missing required proof or response is non-canonical"/);
});

test('direct deploy bypass attempt remains blocked', () => {
  assert.doesNotMatch(prepareGovernedDeployWorkflow, /\/execute|\/proof|wrangler deploy/);
  assert.doesNotMatch(governedDeployWorkflow, /npm run deploy|wrangler deploy/);
});

test('cloudflare preview deploy risk remains a scoped sovereignty gap under issue #578', () => {
  assert.match(governanceGapRegistry, /PR #582 triggered a Cloudflare Git Integration deployment from commit 77c2b95 outside \/session -> \/continuity -> \/authority -> \/compile -> \/validate -> \/execute -> \/proof\./);
  assert.match(governanceGapRegistry, /Classified as preview\/non-production based on PR-linked Git Integration evidence/);
  assert.match(governanceGapRegistry, /sovereignty gap tracked under #578, not #577 production deploy blocker unless production-capable\./);
});
