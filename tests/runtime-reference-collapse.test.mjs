import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ownership = JSON.parse(fs.readFileSync('governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json', 'utf8'));

test('no duplicate authoritative declarations', () => {
  const unique = new Set(Object.values(ownership.authoritative_sources));
  assert.equal(unique.size, Object.values(ownership.authoritative_sources).length);
});

test('derived artifacts map to canonical owner', () => {
  for (const [cls, entries] of Object.entries(ownership.derived_surfaces)) {
    assert.ok(ownership.authoritative_sources[cls], `missing owner class: ${cls}`);
    for (const file of entries) assert.ok(typeof file === 'string' && file.length > 0);
  }
});

test('archive objects cannot become authoritative', () => {
  for (const key of Object.keys(ownership.archive_only_objects || {})) {
    assert.equal(ownership.authoritative_sources[key], undefined);
  }
});

test('generated artifacts are reproducible', () => {
  const keys = Object.keys(ownership.generated_artifacts);
  const sorted = [...keys].sort();
  assert.deepEqual(keys.sort(), sorted);
});

test('topology ownership remains singular', () => {
  const vals = Object.values(ownership.topology_owners);
  assert.equal(new Set(vals).size, 1);
});

test('bypass path ownership remains singular', () => {
  assert.ok(ownership.authoritative_sources.BYPASS_PATHS);
  assert.ok(Array.isArray(ownership.derived_surfaces.BYPASS_PATHS));
});

test('execution surface ownership remains singular', () => {
  assert.ok(ownership.authoritative_sources.EXECUTION_SURFACES);
  assert.ok(Array.isArray(ownership.derived_surfaces.EXECUTION_SURFACES));
});

test('reconciliation ownership remains singular', () => {
  const vals = Object.values(ownership.reconciliation_sources);
  assert.equal(new Set(vals).size, 1);
});

test('derived artifacts cannot override canonical definitions', () => {
  const authoritySet = new Set(Object.values(ownership.authoritative_sources));
  for (const entries of Object.values(ownership.derived_surfaces)) {
    for (const p of entries) assert.equal(authoritySet.has(p), false, `derived is authoritative: ${p}`);
  }
});
