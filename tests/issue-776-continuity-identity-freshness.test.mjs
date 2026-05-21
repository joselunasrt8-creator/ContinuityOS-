import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('authority rejects missing continuity identity and mismatch', () => {
  assert.match(source, /resolveCurrentContinuityIdentity/);
  assert.match(source, /route: "\/authority"[\s\S]*reason: "missing_continuity_identity"/);
  assert.match(source, /route: "\/authority"[\s\S]*reason: "continuity_identity_mismatch"/);
});

test('validation, execute, proof reject stale or detached continuity identity lineage', () => {
  assert.match(source, /route: "\/validate"[\s\S]*reason:"continuity_identity_mismatch"/);
  assert.match(source, /route: "\/execute"[\s\S]*reason:"continuity_identity_mismatch"/);
  assert.match(source, /route: "\/proof"[\s\S]*reason:"continuity_identity_mismatch"/);
});

test('deterministic continuity identity check is bound to current active continuity leaf', () => {
  assert.match(source, /NOT EXISTS \([\s\S]*child\.parent_continuity_id=c\.continuity_id/);
  assert.match(source, /ORDER BY c\.issued_at DESC, c\.continuity_id DESC/);
});
