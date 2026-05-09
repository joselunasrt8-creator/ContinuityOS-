import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function collectBypassIds(value) {
  const ids = new Set();

  function visit(node) {
    if (!node || typeof node !== 'object') return;

    if (typeof node.path === 'string') ids.add(node.path);
    if (typeof node.bypass_id === 'string') ids.add(node.bypass_id);
    if (typeof node.id === 'string') ids.add(node.id);
    if (typeof node.name === 'string' && /bypass|direct|raw|deploy|workflow|database|wrangler/i.test(node.name)) {
      ids.add(node.name);
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    for (const child of Object.values(node)) visit(child);
  }

  visit(value);
  return ids;
}

const canonicalPath = join(process.cwd(), 'governance', 'runtime', 'BYPASS_PATHS.json');
const comparisonPaths = [
  join(process.cwd(), 'runtime', 'bypass_paths.json'),
  join(process.cwd(), 'governance', 'mindshift-validation-bundle', 'governance', 'BYPASS_PATHS.json'),
];

test('bypass path maps reconcile with canonical runtime bundle', () => {
  assert.equal(existsSync(canonicalPath), true, 'Missing canonical BYPASS_PATHS.json');

  const canonical = readJson(canonicalPath);
  const canonicalIds = collectBypassIds(canonical);

  assert.ok(canonicalIds.size > 0, 'Canonical bypass path map has no detectable bypass paths');

  const reconciliation = [];

  for (const comparisonPath of comparisonPaths) {
    if (!existsSync(comparisonPath)) {
      reconciliation.push({
        path: comparisonPath,
        status: 'missing_comparison_file',
        missing_from_comparison: [...canonicalIds],
        extra_in_comparison: [],
      });
      continue;
    }

    const comparisonIds = collectBypassIds(readJson(comparisonPath));
    const missingFromComparison = [...canonicalIds].filter((id) => !comparisonIds.has(id));
    const extraInComparison = [...comparisonIds].filter((id) => !canonicalIds.has(id));

    reconciliation.push({
      path: comparisonPath,
      status: missingFromComparison.length === 0 ? 'canonical_bypass_paths_present' : 'bypass_diff_detected',
      missing_from_comparison: missingFromComparison,
      extra_in_comparison: extraInComparison,
    });
  }

  const failures = reconciliation.filter((entry) => entry.missing_from_comparison.length > 0);

  assert.deepEqual(
    failures,
    [],
    `Bypass path reconciliation failed:\n${JSON.stringify(reconciliation, null, 2)}`,
  );
});
