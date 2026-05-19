import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const requirementsPath = join(process.cwd(), 'governance', 'runtime', 'AEO_REQUIREMENTS.json');
const runtimePath = join(process.cwd(), 'src', 'index.ts');

const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'));
const runtimeSource = readFileSync(runtimePath, 'utf8');

test('AEO requirements are represented in compile and validate runtime behavior', () => {
  assert.ok(Array.isArray(requirements.required_fields), 'AEO_REQUIREMENTS.json must define required_fields');

  const requiredRuntimeSignals = [
    'decision_id',
    'validated_object_hash',
    'authority_id',
    'expiry',
    'invocation_nonce',
    'canonical_aeo',
    'REQUIRED_AEO_KEYS',
    'toCanonicalAeo',
    'canonicalize',
    'sha256Hex',
  ];

  for (const signal of requiredRuntimeSignals) {
    assert.ok(
      runtimeSource.includes(signal),
      `Runtime missing AEO exact-object signal: ${signal}`,
    );
  }

  assert.ok(
    runtimeSource.includes('intent') &&
      runtimeSource.includes('scope') &&
      runtimeSource.includes('validation') &&
      runtimeSource.includes('target') &&
      runtimeSource.includes('finality'),
    'Runtime must represent canonical AEO fields: intent, scope, validation, target, finality',
  );

  assert.ok(
    runtimeSource.includes('validated_object_hash') && runtimeSource.includes('canonical_aeo'),
    'Runtime must bind validated_object_hash to canonical_aeo',
  );

  assert.ok(
    runtimeSource.includes('invocation_registry') || runtimeSource.includes('invocation_nonce'),
    'Runtime must include replay/nonce discipline for exact-object execution',
  );
});

test('specification-to-AEO compilation is exact-five-field and fail-closed', () => {
  assert.match(runtimeSource, /const REQUIRED_AEO_KEYS = \["intent", "scope", "validation", "target", "finality"\] as const/);
  assert.match(runtimeSource, /if \(keys\.length !== REQUIRED_AEO_KEYS\.length\) return null/);
  assert.ok(runtimeSource.includes('if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null'));
  assert.match(runtimeSource, /return Object\.freeze\(\{[\s\S]*intent: String\(input\.intent \|\| ""\),[\s\S]*scope: canonicalRecord\(input\.scope\),[\s\S]*validation: canonicalRecord\(input\.validation\),[\s\S]*target: canonicalRecord\(input\.target\),[\s\S]*finality: canonicalRecord\(input\.finality\)/);
});

test('compile route does not grant authority to prompts/spec text and requires proof finality', () => {
  assert.match(runtimeSource, /const canonical_aeo = toCanonicalAeo\(\{ intent: authority\.intent, scope: JSON\.parse\(String\(authority\.scope \|\| "\{\}"\)\), validation: \{ workflow: GOVERNED_WORKFLOW \}, target, finality: \{ proof_required: true \} \}\)/);
  assert.equal(/toCanonicalAeo\(\{[^}]*intent: String\(b\./.test(runtimeSource), false, 'compile must not derive AEO fields from request prompt/spec body');
  assert.equal(/toCanonicalAeo\(\{[^}]*scope: b\./.test(runtimeSource), false, 'compile must not derive AEO scope from request prompt/spec body');
  assert.equal(/toCanonicalAeo\(\{[^}]*validation: b\./.test(runtimeSource), false, 'compile must not derive AEO validation from request prompt/spec body');
  assert.equal(/toCanonicalAeo\(\{[^}]*target: b\./.test(runtimeSource), false, 'compile must not derive AEO target from request prompt/spec body');
  assert.equal(/toCanonicalAeo\(\{[^}]*finality: b\./.test(runtimeSource), false, 'compile must not derive AEO finality from request prompt/spec body');
});
