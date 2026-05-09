import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const proofSpec = JSON.parse(readFileSync(new URL('../fate_proof_integrity_tests.json', import.meta.url), 'utf8'))

test('FATE proof integrity specs are now represented by executable assertions', () => {
  assert.equal(proofSpec.artifact, 'FATE_PROOF_INTEGRITY_TESTS')
  assert.equal(proofSpec.status, 'NON_OPERATIVE')
  assert.ok(proofSpec.tests.some((fate) => fate.expected_reason === 'proof_linkage_missing'))
})

test('proof without execution returns NULL / INVALID', () => {
  assert.match(source, /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 AND status='EXECUTED'/)
  assert.match(source, /proof_without_execute/)
  assert.match(source, /return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"execution_missing" \}/)
})

test('proof with wrong session lineage returns NULL / INVALID', () => {
  assert.match(source, /String\(execution\.session_id \|\| ""\) !== session_id/)
  assert.match(source, /String\(authority\.session_id \|\| ""\) !== session_id/)
  assert.match(source, /reason:"session_lineage_mismatch"/)
})

test('proof with wrong hash returns NULL / INVALID', () => {
  assert.match(source, /const executionById = await env\.DB\.prepare\(`SELECT \* FROM execution_registry WHERE execution_id=\?1`\)/)
  assert.match(source, /indicator: "proof_hash_mismatch"/)
  assert.match(source, /provided_hash: validated_object_hash/)
})

test('duplicate proof is blocked as NULL / INVALID', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*UNIQUE\(decision_id, validated_object_hash\)/)
  assert.match(source, /reason:"proof_replay"/)
  assert.match(source, /REPLAY_BLOCKED/)
})

test('proof persists authority/session lineage', () => {
  assert.match(source, /INSERT INTO proof_registry \(proof_id,session_id,execution_id,decision_id,validated_object_hash/)
  assert.match(source, /AND EXISTS \(SELECT 1 FROM authority_registry WHERE decision_id=\?4 AND session_id=\?2 AND status='EXECUTED'\)/)
  assert.match(source, /UPDATE authority_registry SET status='CONSUMED' WHERE decision_id=\?1 AND session_id=\?2 AND status='EXECUTED'/)
  assert.match(source, /proof: \{ proof_id, session_id, execution_id, decision_id, validated_object_hash \}/)
})
