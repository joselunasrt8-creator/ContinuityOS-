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
    'decision_id',
    'validated_object_hash',
    'invocation_nonce',
    '/validate',
    '/execute',
    '/proof'
  ];

  for (const field of requiredFields) {
    assert.match(governedDeploy, new RegExp(field));
  }
});
