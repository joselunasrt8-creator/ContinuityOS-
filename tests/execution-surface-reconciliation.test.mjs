import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function collectSurfaceIds(value) {
  const ids = new Set();

  function visit(node) {
    if (!node || typeof node !== 'object') return;

    if (typeof node.surface_id === 'string') ids.add(node.surface_id);
    if (typeof node.id === 'string') ids.add(node.id);
    if (typeof node.name === 'string' && /deploy|execute|proof|authority|compile|validate|workflow|database|webhook/i.test(node.name)) {
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

const canonicalPath = join(process.cwd(), 'governance', 'runtime', 'EXECUTION_SURFACES.json');
const comparisonPaths = [
  join(process.cwd(), 'runtime', 'execution_surfaces.json'),
  join(process.cwd(), 'runtime', 'external_execution_surfaces.json'),
  join(process.cwd(), 'governance', 'mindshift-validation-bundle', 'governance', 'EXECUTION_SURFACES.json'),
];

test('execution surface maps reconcile with canonical runtime bundle', () => {
  assert.equal(existsSync(canonicalPath), true, 'Missing canonical EXECUTION_SURFACES.json');

  const canonical = readJson(canonicalPath);
  const canonicalIds = collectSurfaceIds(canonical);

  assert.ok(canonicalIds.size > 0, 'Canonical execution surface map has no detectable surfaces');

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

    const comparisonIds = collectSurfaceIds(readJson(comparisonPath));
    const missingFromComparison = [...canonicalIds].filter((id) => !comparisonIds.has(id));
    const extraInComparison = [...comparisonIds].filter((id) => !canonicalIds.has(id));

    reconciliation.push({
      path: comparisonPath,
      status: missingFromComparison.length === 0 ? 'canonical_surfaces_present' : 'surface_diff_detected',
      missing_from_comparison: missingFromComparison,
      extra_in_comparison: extraInComparison,
    });
  }

  const failures = reconciliation.filter((entry) => entry.missing_from_comparison.length > 0);

  assert.deepEqual(
    failures,
    [],
    `Execution surface reconciliation failed:\n${JSON.stringify(reconciliation, null, 2)}`,
  );
});
