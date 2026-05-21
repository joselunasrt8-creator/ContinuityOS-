import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ownership = JSON.parse(fs.readFileSync('governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json', 'utf8'));

const authorityEntries = Object.entries(ownership.authoritative_sources);
const authorityPaths = authorityEntries.map(([, p]) => p);

test('singular authoritative ownership', () => {
  assert.equal(new Set(authorityPaths).size, authorityPaths.length);
});

test('no duplicate authoritative semantic domains', () => {
  assert.equal(authorityEntries.length, new Set(authorityEntries.map(([domain]) => domain)).size);
});

test('archive objects cannot become authoritative', () => {
  const authoritative = new Set(authorityPaths);
  for (const key of Object.keys(ownership.archive_only_objects || {})) {
    assert.equal(authoritative.has(key), false, `${key} cannot be authoritative`);
  }
});

test('generated artifacts cannot become canonical', () => {
  const authoritative = new Set(authorityPaths);
  for (const generated of Object.keys(ownership.generated_artifacts || {})) {
    assert.equal(authoritative.has(generated), false, `${generated} cannot be canonical`);
  }
});

test('topology ownership remains singular', () => {
  const owners = Object.values(ownership.topology_owners || {});
  assert.equal(new Set(owners).size, 1);
});

test('bypass path ownership remains singular', () => {
  assert.ok(ownership.authoritative_sources.bypass_path_semantics);
  assert.equal(Array.isArray(ownership.derived_surfaces.bypass_path_semantics), true);
});

test('invariant declarations remain singular', () => {
  assert.ok(ownership.authoritative_sources.invariant_declarations);
  const invariantOwner = ownership.authoritative_sources.invariant_declarations;
  assert.equal(typeof invariantOwner, 'string');
});
