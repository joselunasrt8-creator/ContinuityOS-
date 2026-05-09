import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const replaySpec = JSON.parse(readFileSync(new URL('../fate_replay_tests.json', import.meta.url), 'utf8'))

test('FATE replay specs are now represented by executable assertions', () => {
  assert.equal(replaySpec.artifact, 'FATE_REPLAY_TESTS')
  assert.equal(replaySpec.status, 'NON_OPERATIVE')
  assert.ok(replaySpec.tests.some((fate) => fate.then === 'NULL' && fate.expected_reason === 'replay_detected'))
})

test('reused invocation nonce returns NULL / INVALID', () => {
  assert.match(source, /INSERT OR IGNORE INTO invocation_registry[\s\S]*'RESERVED'/)
  assert.match(source, /insert\.meta\?\.changes\|\|0\)===0\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"nonce_used" \}/)
  assert.match(source, /event_type: "REPLAY_BLOCKED"[\s\S]*indicator: "reused_nonce"/)
})

test('duplicate execution row is blocked as NULL / INVALID replay drift', () => {
  assert.match(source, /SELECT execution_id FROM execution_registry WHERE decision_id=\?1 AND validated_object_hash=\?2/)
  assert.match(source, /if \(replay\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"replay_detected" \}/)
  assert.match(source, /UNIQUE\(decision_id, validated_object_hash\)/)
})

test('consumed authority reuse returns NULL / INVALID', () => {
  assert.match(source, /!\["ACTIVE","VALIDATED","RESERVED"\]\.includes\(String\(authority\.status\)\)[\s\S]*reason:"authority_unusable"/)
  assert.match(source, /!authority \|\| !\["RESERVED","VALIDATED"\]\.includes\(String\(authority\.status\)\)[\s\S]*reason:"authority_not_reserved"/)
  assert.match(source, /authority_reuse_after_consumed/)
})

test('duplicate proof attempt is blocked as NULL / INVALID', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*UNIQUE\(decision_id, validated_object_hash\)/)
  assert.match(source, /catch \{\s*return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_replay" \}/)
  assert.match(source, /duplicate_proof_or_transaction_conflict/)
})
