import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('runtime persists the same validated_object_hash across validation, execution, and proof', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS validation_registry[\s\S]*validated_object_hash TEXT NOT NULL/,
    'validation registry must persist validated_object_hash',
  )

  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS execution_registry[\s\S]*validated_object_hash TEXT NOT NULL/,
    'execution registry must persist validated_object_hash',
  )

  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*validated_object_hash TEXT NOT NULL/,
    'proof registry must persist validated_object_hash',
  )
})

test('execution requires decision_id, validated_object_hash, and a VALID validation state', () => {
  assert.match(
    source,
    /if \(!decision_id\) return rejectWithTelemetry\(env, \{ status:\"NULL\", result:\"INVALID\", reason:\"missing_decision_id\" \}[\s\S]*route: \"\/execute\"/,
    'execution must require decision_id before execution lookup',
  )

  assert.match(
    source,
    /if \(!validated_object_hash\) return rejectWithTelemetry\(env, \{ status:\"NULL\", result:\"INVALID\", reason:\"missing_validated_object_hash\" \}[\s\S]*event_type: \"HASH_MISMATCH\"/,
    'execution must require validated_object_hash and classify missing hash as hash drift',
  )

  assert.match(
    source,
    /SELECT \* FROM validation_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND invocation_nonce=\?3 AND result='VALID' AND status='VALID'/,
    'execution must look up a VALID validation record by decision_id, validated_object_hash, nonce, result, and status',
  )

  assert.match(
    source,
    /if \(!valid\) return rejectWithTelemetry\(env, \{ status:\"NULL\", result:\"INVALID\", reason:\"no_validation\" \}/,
    'missing validation evidence must return NULL / INVALID with no_validation',
  )

  assert.match(
    source,
    /event_type: \"HASH_MISMATCH\"[\s\S]*indicator: \"validation_hash_missing_or_mismatched\"/,
    'hash mismatch must emit HASH_MISMATCH telemetry',
  )
})

test('validation rejects mutated or non-canonical compiled AEO lineage', () => {
  assert.match(
    source,
    /SELECT \* FROM aeo_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND status='COMPILED'/,
    'validation must bind to a compiled AEO by decision_id and validated_object_hash',
  )

  assert.match(
    source,
    /const compiledHash = compiledCanonicalAeo \? await sha256Hex\(canonicalize\(compiledCanonicalAeo\)\) : \"\"/,
    'validation must recompute the hash from the canonicalized compiled AEO',
  )

  assert.match(
    source,
    /!compiledCanonicalAeo \|\| compiledHash !== validated_object_hash \|\| compiledHash !== String\(compiled\.validated_object_hash \|\| \"\"\)[\s\S]*reason:\"hash_mismatch\"/,
    'validation must reject mutated AEO hash lineage with hash_mismatch',
  )

  assert.match(
    source,
    /String\(compiled\.continuity_id \|\| \"\"\) !== String\(authority\.continuity_id \|\| \"\"\)[\s\S]*indicator: \"non_canonical_validation_lineage\"/,
    'validation must reject non-canonical continuity lineage',
  )
})

test('execution and proof preserve exact-object hash continuity', () => {
  assert.match(
    source,
    /INSERT INTO execution_registry[\s\S]*decision_id,validated_object_hash,invocation_nonce[\s\S]*\.bind\(execution_id, authority\.session_id, decision_id, validated_object_hash, invocation_nonce/,
    'execution must persist the same validated_object_hash used for validation',
  )

  assert.match(
    source,
    /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 AND status='EXECUTED'/,
    'proof must load execution by execution_id, decision_id, validated_object_hash, and executed state',
  )

  assert.match(
    source,
    /INSERT INTO proof_registry[\s\S]*validated_object_hash[\s\S]*EXISTS \(SELECT 1 FROM execution_registry WHERE execution_id=\?3 AND decision_id=\?4 AND validated_object_hash=\?5/,
    'proof must persist only when the execution row has the same validated_object_hash',
  )
})

test('mutation after validation is rejected as NULL with canonical hash_mismatch semantics', () => {
  assert.match(
    source,
    /reason:\"hash_mismatch\"/,
    'mutated object hash must be rejected with hash_mismatch',
  )

  assert.doesNotMatch(
    source,
    /reason:\"wrong_hash\"|reason: \"wrong_hash\"/,
    'runtime must not drift to non-canonical wrong_hash semantics',
  )

  assert.match(
    source,
    /drift_class: \"hash_drift\"/,
    'mutated object hash must be classified as hash_drift',
  )
})
