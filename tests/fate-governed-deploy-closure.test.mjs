import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const governedDeployWorkflow = readFileSync('.github/workflows/governed-deploy.yml', 'utf8');
const prepareGovernedDeployWorkflow = readFileSync('.github/workflows/prepare-governed-deploy.yml', 'utf8');
const governanceGapRegistry = readFileSync('GOVERNANCE_GAP_REGISTRY.md', 'utf8');

const routeOrderPattern = /"\$CLEAN_WORKER_URL\/session"[\s\S]*"\$CLEAN_WORKER_URL\/continuity"[\s\S]*"\$CLEAN_WORKER_URL\/authority"[\s\S]*"\$CLEAN_WORKER_URL\/compile"[\s\S]*"\$CLEAN_WORKER_URL\/validate"[\s\S]*"\$CLEAN_WORKER_URL\/execute"[\s\S]*"\$CLEAN_WORKER_URL\/proof"/;

test('valid governed deploy path preserves canonical chain and ends PROVEN', () => {
  assert.match(governedDeployWorkflow, routeOrderPattern);
  assert.match(governedDeployWorkflow, /\[ "\$PROOF_STATUS" = "NULL" \] \|\| \[ "\$PROOF_STATUS" != "PROVEN" \]/);
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
  assert.match(governanceGapRegistry, /sovereignty gap tracked under #578, not #577 production deploy blocker unless production-capable\./);
});
