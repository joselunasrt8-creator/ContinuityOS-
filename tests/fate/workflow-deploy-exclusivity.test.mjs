import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const workflowDir = new URL('../../.github/workflows/', import.meta.url);
const workflowFiles = readdirSync(workflowDir);

const deployPatterns = [
  'wrangler deploy',
  'npx wrangler deploy',
  'cloudflare deploy'
];

test('only governed-deploy.yml may contain deploy-capable commands', () => {
  const violatingFiles = [];

  for (const file of workflowFiles) {
    const fullPath = path.join(workflowDir.pathname, file);
    const content = readFileSync(fullPath, 'utf8');

    const hasDeployPattern = deployPatterns.some(pattern =>
      content.includes(pattern)
    );

    if (hasDeployPattern && file !== 'governed-deploy.yml') {
      violatingFiles.push(file);
    }
  }

  assert.deepEqual(violatingFiles, []);
});

test('governed-deploy workflow requires canonical governance fields', () => {
  const governedDeploy = readFileSync(
    path.join(workflowDir.pathname, 'governed-deploy.yml'),
    'utf8'
  );

  const requiredFields = [
    'scripts/governed-deploy.ts',
    'MINDSHIFT_GOVERNED_DEPLOY_CONTEXT',
    'decision_id',
    'validated_object_hash',
    'invocation_nonce',
    '/session',
    '/continuity',
    '/authority',
    '/compile',
    '/validate',
    '/execute',
    '/proof'
  ];

  for (const field of requiredFields) {
    assert.match(governedDeploy, new RegExp(field));
  }
});


test('governed-deploy workflow preserves exact canonical lifecycle order', () => {
  const governedDeploy = readFileSync(
    path.join(workflowDir.pathname, 'governed-deploy.yml'),
    'utf8'
  );

  const canonicalLifecycle = [
    'POST "$CLEAN_WORKER_URL/session"',
    'POST "$CLEAN_WORKER_URL/continuity"',
    'POST "$CLEAN_WORKER_URL/authority"',
    'POST "$CLEAN_WORKER_URL/compile"',
    'POST "$CLEAN_WORKER_URL/validate"',
    'POST "$CLEAN_WORKER_URL/execute"',
    'POST "$CLEAN_WORKER_URL/proof"'
  ];

  let previousIndex = -1;
  for (const routeInvocation of canonicalLifecycle) {
    const currentIndex = governedDeploy.indexOf(routeInvocation);
    assert.notEqual(currentIndex, -1, `${routeInvocation} must exist in governed deploy lifecycle`);
    assert.ok(currentIndex > previousIndex, `${routeInvocation} must appear after the previous canonical lifecycle step`);
    previousIndex = currentIndex;
  }

  assert.match(governedDeploy, /--arg continuity_id "\$CONTINUITY_ID"/);
  assert.match(governedDeploy, /AUTHORITY_CONTINUITY_ID.*!= "\$CONTINUITY_ID"/);
});
