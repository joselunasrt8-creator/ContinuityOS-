import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const requirementsPath = join(process.cwd(), 'governance', 'runtime', 'PROOF_REQUIREMENTS.json');
const runtimePath = join(process.cwd(), 'src', 'index.ts');

const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'));
const runtimeSource = readFileSync(runtimePath, 'utf8');

const runtimeFieldAliases = {
  run_id: ['run_id'],
  commit_sha: ['commit_sha'],
  workflow_name: ['workflow_name', 'workflow'],
  execution_timestamp: ['execution_timestamp', 'created_at'],
  validated_object_hash: ['validated_object_hash'],
  execution_result: ['execution_result', 'status', 'result'],
};

test('proof requirements are represented in proof persistence behavior', () => {
  assert.ok(
    Array.isArray(requirements.required_proof_fields),
    'PROOF_REQUIREMENTS.json must define required_proof_fields',
  );

  const requiredRuntimeSignals = [
    'proof_registry',
    'proof_id',
    'execution_id',
    'decision_id',
    'validated_object_hash',
    'PROOF_PERSISTED',
  ];

  for (const signal of requiredRuntimeSignals) {
    assert.ok(
      runtimeSource.includes(signal),
      `Runtime missing proof persistence signal: ${signal}`,
    );
  }

  for (const field of requirements.required_proof_fields) {
    const aliases = runtimeFieldAliases[field] || [field];
    assert.ok(
      aliases.some((alias) => runtimeSource.includes(alias)),
      `Runtime missing proof requirement field or alias: ${field}`,
    );
  }
});
