import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('proof registry persists lineage fields required for execution truth', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*execution_id TEXT NOT NULL[\s\S]*decision_id TEXT NOT NULL[\s\S]*validated_object_hash TEXT NOT NULL/,
    'proof_registry must bind proof to execution_id, decision_id, and validated_object_hash',
  )

  assert.match(
    source,
    /proof_registry:[\s\S]*"execution_id"[\s\S]*"decision_id"[\s\S]*"validated_object_hash"[\s\S]*"authority_lineage"[\s\S]*"execution_lineage"/,
    'schema diagnostics must require proof lineage fields',
  )
})

test('proof creation requires matching execution lineage', () => {
  assert.match(
    source,
    /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3/,
    'proof must load execution by execution_id, decision_id, and validated_object_hash',
  )

  assert.match(
    source,
    /if \(!execution\)[\s\S]*reason:"execution_missing"/,
    'orphaned proof without matching execution must return NULL / INVALID',
  )

  assert.match(
    source,
    /drift_class: "proof_drift"[\s\S]*indicator: "proof_without_execute"/,
    'orphaned proof attempt must be classified as proof_drift',
  )
})

test('proof creation binds authority and execution lineage into persisted proof', () => {
  assert.match(
    source,
    /const authorityLineage = canonicalize\(\{[\s\S]*identity_id:[\s\S]*session_id,[\s\S]*continuity_id:[\s\S]*continuity_ancestry:[\s\S]*authority_id:/,
    'proof must construct authority lineage evidence',
  )

  assert.match(
    source,
    /const executionLineage = canonicalize\(\{[\s\S]*identity_id:[\s\S]*session_id,[\s\S]*continuity_id:[\s\S]*continuity_ancestry:[\s\S]*execution_id,/,
    'proof must construct execution lineage evidence',
  )

  assert.match(
    source,
    /INSERT INTO proof_registry[\s\S]*authority_lineage,execution_lineage[\s\S]*authorityLineage,executionLineage/,
    'proof must persist authority_lineage and execution_lineage',
  )
})

test('duplicate proof is rejected as proof replay', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*UNIQUE\(decision_id, validated_object_hash\)/,
    'proof registry must enforce one canonical proof per decision hash',
  )

  assert.match(
    source,
    /catch \{\s*return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_replay" \}/,
    'duplicate proof attempt must return NULL / INVALID proof_replay',
  )

  assert.match(
    source,
    /indicator: "duplicate_proof_or_transaction_conflict"/,
    'duplicate proof attempt must emit duplicate proof telemetry context',
  )
})

test('proof persistence emits proof telemetry', () => {
  assert.match(
    source,
    /event_type: "PROOF_PERSISTED"/,
    'successful proof persistence must emit PROOF_PERSISTED telemetry',
  )

  assert.match(
    source,
    /proof_id[\s\S]*execution_id[\s\S]*decision_id[\s\S]*validated_object_hash/,
    'proof telemetry must include proof lineage identifiers',
  )
})

test('proof_requires_matching_execution_lineage', () => {
  assert.match(
    source,
    /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 AND status='EXECUTED'/,
    'proof must resolve execution by exact execution_id + decision_id + validated_object_hash lineage',
  )
})

test('proof_rejects_cross_decision_execution_id', () => {
  assert.match(
    source,
    /reason:"execution_decision_mismatch"[\s\S]*indicator: "proof_execution_decision_mismatch"/,
    'proof must reject execution_id that resolves to a different decision_id',
  )
})

test('proof_rejects_missing_execution_id', () => {
  assert.match(
    source,
    /if \(!execution_id\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"missing_execution_id" \}/,
    'proof must fail closed when execution_id is missing',
  )
})

test('proof_rejects_hash_mismatch', () => {
  assert.match(
    source,
    /reason:"execution_hash_mismatch"[\s\S]*indicator: "proof_hash_mismatch"/,
    'proof must reject execution_id lineage with mismatched validated_object_hash',
  )
})

test('proof_rejection_does_not_write_proof_registry', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const proofInsert = source.indexOf('INSERT INTO proof_registry', proofStart)
  const missingExecReject = source.indexOf('reason:"execution_missing"', proofStart)
  assert.ok(proofStart >= 0 && missingExecReject > proofStart && proofInsert > missingExecReject, 'expected proof lineage rejection before proof_registry insert')
  const failClosedBlock = source.slice(proofStart, proofInsert)
  assert.doesNotMatch(failClosedBlock, /INSERT INTO proof_registry/, 'proof rejection paths must not write proof_registry')
  assert.doesNotMatch(failClosedBlock, /UPDATE authority_registry SET status='CONSUMED'/, 'proof rejection paths must not consume authority')
})

test('valid_execute_proof_path_preserved', () => {
  assert.match(
    source,
    /return json\(\{ status:"EXECUTED", session_id, execution_id \}\)/,
    'execute success path must remain intact',
  )

  assert.match(
    source,
    /return json\(\{ status:"PROVEN", result:"OK", proof_id, proof:/,
    'proof success path must remain intact',
  )
})
