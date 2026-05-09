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

test('execution requires validated object hash to match the validated registry record', () => {
  assert.match(
    source,
    /SELECT \* FROM validation_registry WHERE decision_id=\?1 AND validated_object_hash=\?2[\s\S]*status='VALID'/,
    'execution must look up a VALID validation record by decision_id and validated_object_hash',
  )

  assert.match(
    source,
    /if \(!validation\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"hash_mismatch" \}/,
    'missing validation hash match must return NULL / INVALID with hash_mismatch',
  )

  assert.match(
    source,
    /event_type: "HASH_MISMATCH"[\s\S]*indicator: "validation_hash_missing_or_mismatched"/,
    'hash mismatch must emit HASH_MISMATCH telemetry',
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
    /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3/,
    'proof must load execution by execution_id, decision_id, and validated_object_hash',
  )

  assert.match(
    source,
    /INSERT INTO proof_registry[\s\S]*validated_object_hash[\s\S]*\.bind\(proof_id, execution\.session_id, execution_id, decision_id, validated_object_hash/,
    'proof must persist the same validated_object_hash used by execution',
  )
})

test('mutation after validation is rejected as NULL', () => {
  assert.match(
    source,
    /reason:"hash_mismatch"/,
    'mutated object hash must be rejected with hash_mismatch',
  )

  assert.match(
    source,
    /drift_class: "hash_drift"/,
    'mutated object hash must be classified as hash_drift',
  )
})
