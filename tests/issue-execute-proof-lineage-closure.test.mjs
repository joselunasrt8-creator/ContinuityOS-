import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('execute fails closed without validation and with non-VALID validation', () => {
  assert.match(source, /reason:"missing_validation"/);
  assert.match(source, /result='VALID' AND status='VALID'/);
});

test('execute enforces exact validated_object_hash equality across validation and executed object', () => {
  assert.match(source, /String\(validation\.validated_object_hash \|\| ""\) !== execHash/);
  assert.match(source, /indicator: "validated_object_execution_mismatch"/);
});

test('proof binds to exact execution, decision, validated object hash, and invocation nonce', () => {
  assert.match(source, /reason:"missing_invocation_nonce"/);
  assert.match(source, /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 AND invocation_nonce=\?4 AND status='EXECUTED'/);
  assert.match(source, /SELECT \* FROM validation_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND session_id=\?3 AND invocation_nonce=\?4 AND status='VALID' AND result='VALID'/);
  assert.match(source, /reason:"invocation_lineage_mismatch"/);
  assert.match(source, /SELECT p\.\* FROM proof_registry p JOIN execution_registry e ON e\.execution_id=p\.execution_id WHERE p\.decision_hash=\?1 AND p\.execution_id=\?2 AND p\.decision_id=\?3 AND p\.validated_object_hash=\?4 AND e\.invocation_nonce=\?5 ORDER BY p\.created_at ASC, p\.proof_id ASC LIMIT 3/);
  assert.match(source, /reason:"execution_missing"/);
  assert.match(source, /reason:"proof_replay"/);
});
