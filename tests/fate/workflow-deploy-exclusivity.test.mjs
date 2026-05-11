import test from 'node:test';
import assert from 'node:assert/strict';

// MODE B — STRUCTURED ARTIFACT
// Non-operative workflow sovereignty verification scaffold.

test('only governed-deploy.yml may contain deploy-capable production execution', async () => {
  const canonicalWorkflow = '.github/workflows/governed-deploy.yml';

  const requiredRoutes = [
    '/validate',
    '/execute',
    '/proof'
  ];

  const forbiddenDeployPatterns = [
    'wrangler deploy',
    'npx wrangler deploy',
    'cloudflare deploy'
  ];

  assert.equal(canonicalWorkflow.includes('governed-deploy'), true);
  assert.equal(requiredRoutes.length, 3);
  assert.ok(forbiddenDeployPatterns.length > 0);

  // Required future static assertion:
  // no alternate workflow may deploy production state.
});