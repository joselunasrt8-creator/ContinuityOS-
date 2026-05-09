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
    /if \(!execution\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"missing_execution" \}/,
    'orphaned proof without matching execution must return NULL / INVALID',
  )

  assert.match(
    source,
    /drift_class: "proof_drift"[\s\S]*indicator: "orphaned_proof_attempt"/,
    'orphaned proof attempt must be classified as proof_drift',
  )
})

test('proof creation binds authority and execution lineage into persisted proof', () => {
  assert.match(
    source,
    /const authorityLineage = JSON\.stringify\(\{[\s\S]*authority_id:[\s\S]*decision_id:[\s\S]*continuity_id:[\s\S]*identity_id:/,
    'proof must construct authority lineage evidence',
  )

  assert.match(
    source,
    /const executionLineage = JSON\.stringify\(\{[\s\S]*execution_id:[\s\S]*decision_id:[\s\S]*validated_object_hash:[\s\S]*continuity_id:/,
    'proof must construct execution lineage evidence',
  )

  assert.match(
    source,
    /INSERT INTO proof_registry[\s\S]*authority_lineage,execution_lineage[\s\S]*authorityLineage, executionLineage/,
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
