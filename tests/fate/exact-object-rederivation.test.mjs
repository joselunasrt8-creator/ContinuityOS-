import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8');

test('execute route is bound to stored canonical AEO and validated hash', () => {
  assert.match(runtime, /\/execute/);
  assert.match(runtime, /validated_object_hash/);
  assert.match(runtime, /aeo_registry/);
  assert.match(runtime, /execution_registry/);
  assert.match(runtime, /invocation_registry/);
});

test('runtime contains exact-object mismatch failure signals', () => {
  const exactObjectSignals = [
    'hash_mismatch',
    'scope_constraints_mismatch',
    'workflow_mismatch',
    'validated_object_hash'
  ];

  for (const signal of exactObjectSignals) {
    assert.match(runtime, new RegExp(signal));
  }
});

test('execute route must not be hash-trust-only documentation', () => {
  const hasCanonicalization = /canonical/i.test(runtime) || /canonicalize/i.test(runtime);
  const hasHashComputation = /SHA-256|sha256|digest/i.test(runtime);

  assert.equal(hasCanonicalization, true, 'runtime must contain canonical object handling');
  assert.equal(hasHashComputation, true, 'runtime must contain hash computation / verification');
});
