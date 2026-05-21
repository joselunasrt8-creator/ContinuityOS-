import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = JSON.parse(fs.readFileSync('governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json', 'utf8'));

function validate(ownership) {
  const errors = [];
  for (const [cls, owner] of Object.entries(ownership.authoritative_sources)) {
    if (!owner) errors.push(`missing:${cls}`);
  }
  if (Object.keys(ownership.topology_owners).length > 1) {
    const v = Object.values(ownership.topology_owners);
    if (new Set(v).size > 1) errors.push('duplicate_topology_owners');
  }
  for (const key of Object.keys(ownership.archive_only_objects || {})) {
    if (ownership.authoritative_sources[key]) errors.push('archive_escalation');
  }
  for (const [cls, items] of Object.entries(ownership.derived_surfaces)) {
    if (!ownership.authoritative_sources[cls]) errors.push('derived_unknown_owner');
    for (const item of items) {
      if (Object.values(ownership.authoritative_sources).includes(item)) errors.push('derived_override');
    }
  }
  if (ownership.authoritative_sources.BYPASS_PATHS && ownership.authoritative_sources.BYPASS_PATHS_2) {
    errors.push('bypass_collision');
  }
  return errors;
}

test('conflicting authoritative definitions fail closed', () => {
  const o = structuredClone(base);
  o.authoritative_sources.BYPASS_PATHS_2 = o.authoritative_sources.BYPASS_PATHS;
  assert.ok(validate(o).includes('bypass_collision'));
});

test('duplicate topology owners fail closed', () => {
  const o = structuredClone(base);
  o.topology_owners['runtime/topology/alt_manifest.json'] = 'runtime/topology/alt_manifest.json';
  assert.ok(validate(o).includes('duplicate_topology_owners'));
});

test('archive object escalation fails closed', () => {
  const o = structuredClone(base);
  o.archive_only_objects.BYPASS_PATHS = 'archive/generated/BYPASS_PATHS.json';
  o.authoritative_sources.BYPASS_PATHS = 'archive/generated/BYPASS_PATHS.json';
  assert.ok(validate(o).includes('archive_escalation'));
});

test('derived artifact semantic override fails closed', () => {
  const o = structuredClone(base);
  o.derived_surfaces.BYPASS_PATHS = [o.authoritative_sources.BYPASS_PATHS];
  assert.ok(validate(o).includes('derived_override'));
});

test('bypass-path ownership collision fails closed', () => {
  const o = structuredClone(base);
  o.authoritative_sources.BYPASS_PATHS_2 = 'runtime/surfaces/BYPASS_PATHS.json';
  assert.ok(validate(o).includes('bypass_collision'));
});
