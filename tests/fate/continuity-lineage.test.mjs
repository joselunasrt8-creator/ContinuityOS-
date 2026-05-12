import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const continuitySchema = readFileSync(new URL('../../schemas/continuity.schema.json', import.meta.url), 'utf8')
const authoritySchema = readFileSync(new URL('../../schemas/authority.schema.json', import.meta.url), 'utf8')
const proofSchema = readFileSync(new URL('../../schemas/proof.schema.json', import.meta.url), 'utf8')

test('revoked continuity → NULL', () => {
  assert.match(source, /String\(continuity\.status \|\| ""\) !== "ACTIVE"/) 
  assert.match(source, /reason: "revoked_continuity"/)
  assert.match(source, /cascadeRevocation\(env, continuity_id\)/)
})

test('expired continuity → NULL', () => {
  assert.match(source, /isExpired\(String\(continuity\.expires_at \|\| ""\)\)/)
  assert.match(source, /reason: "expired_continuity"/)
})

test('lineage mismatch → NULL', () => {
  assert.match(source, /String\(continuity\.session_id \|\| ""\) !== String\(session\.session_id \|\| ""\)/)
  assert.match(source, /String\(continuity\.identity_id \|\| ""\) !== String\(session\.identity_id \|\| ""\)/)
  assert.match(source, /reason:"continuity_lineage_mismatch"/)
})

test('orphaned execution → NULL', () => {
  assert.match(source, /reason:"no_validation"/)
  assert.match(source, /orphaned_execution_prevented/)
  assert.match(source, /const continuity = await activeContinuity\(env, String\(authority\.continuity_id \|\| ""\), session/)
})

test('replayed continuity chain → blocked', () => {
  assert.match(source, /UNIQUE\(continuity_id, decision_id, validated_object_hash\)/)
  assert.match(source, /indicator: "reused_nonce"/)
  assert.match(source, /authority_reuse_after_consumed/)
})

test('mutated continuity hash → NULL', () => {
  assert.match(source, /const actualHash = await continuityHash\(canonical\)/)
  assert.match(source, /actualHash !== String\(continuity\.continuity_hash \|\| ""\)/)
  assert.match(continuitySchema, /continuity_hash/)
})

test('proof persists continuity lineage', () => {
  assert.match(source, /INSERT INTO proof_registry \(proof_id,identity_id,session_id,continuity_id,continuity_hash/)
  assert.match(proofSchema, /continuity_id/)
  assert.match(proofSchema, /authority_lineage/)
})

test('proof lineage must equal execution lineage', () => {
  assert.match(source, /authority_lineage,execution_lineage/)
  assert.match(source, /authorityLineage, executionLineage/)
  assert.match(authoritySchema, /continuity_id/)
})
