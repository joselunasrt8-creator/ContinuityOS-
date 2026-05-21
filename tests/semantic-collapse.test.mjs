import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const registryPath = path.join(root, 'governance/runtime/SEMANTIC_COLLAPSE_REGISTRY.json');

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('semantic collapse validator emits deterministic report', () => {
  execFileSync('node', ['scripts/semantic_collapse_validator.mjs'], { cwd: root, stdio: 'pipe' });
  const reportPath = path.join(root, 'governance/runtime/SEMANTIC_COLLAPSE_REPORT.json');
  assert.equal(fs.existsSync(reportPath), true);
  const report = loadJSON(reportPath);
  assert.equal(report.generated_at, 'deterministic');
});

test('one authoritative primitive per semantic domain', () => {
  const registry = loadJSON(registryPath);
  const authoritative = registry.authoritative_primitives;
  const values = Object.values(authoritative);
  assert.equal(values.length > 0, true);
  for (const [domain, primitive] of Object.entries(authoritative)) {
    assert.equal(typeof primitive, 'string', `${domain} must map to a single primitive`);
    assert.equal(primitive.length > 0, true);
  }
});

test('no archive or generated authority escalation and no duplicate ownership', () => {
  const report = loadJSON(path.join(root, 'governance/runtime/SEMANTIC_COLLAPSE_REPORT.json'));
  const archiveEscalation = (report.conflicts || []).filter((c) =>
    JSON.stringify(c).includes('archive/') || JSON.stringify(c).includes('generated')
  );
  assert.deepEqual(archiveEscalation, []);
  const duplicateOwnership = (report.conflicts || []).filter((c) => c.type === 'duplicate_authoritative_domain');
  assert.deepEqual(duplicateOwnership, []);
});

test('topology remains singular and observability non-authoritative', () => {
  const registry = loadJSON(registryPath);
  assert.equal(registry.execution_relevant_domains['deterministic topology'], true);
  const report = loadJSON(path.join(root, 'governance/runtime/SEMANTIC_COLLAPSE_REPORT.json'));
  assert.deepEqual(report.observability_authority_escalation, []);
});
