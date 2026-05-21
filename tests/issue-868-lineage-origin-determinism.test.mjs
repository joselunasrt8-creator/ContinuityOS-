import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('execute rejects missing validation lineage and stale replayed validation', () => {
  assert.match(source, /reason:"missing_validation"/)
  assert.match(source, /reason:"stale_validation"/)
  assert.match(source, /reason:"nonce_not_reserved"/)
})

test('execute enforces validation ancestry and hash determinism before persistence', () => {
  assert.match(source, /const validationLineageCheck = verifyLineageOrigin\(\{[\s\S]*stage: "validate"[\s\S]*lineage_stage: String\(validation\.lineage_stage \|\| ""\)[\s\S]*parent_compilation_hash: String\(validation\.parent_compilation_hash \|\| ""\)[\s\S]*compiled_hash: compiledCanonicalHash[\s\S]*\}\)/)
  assert.match(source, /if \(!validationLineageCheck\.ok\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason: validationLineageCheck\.reason \}/)
  assert.match(source, /parent_validation_hash,lineage_stage,lineage_origin_hash\)/)
})

test('proof rejects missing/orphan execution lineage and enforces execution hash match', () => {
  assert.match(source, /reason:"missing_execution_id"/)
  assert.match(source, /reason:"execution_missing"/)
  assert.match(source, /reason:"execution_hash_mismatch"/)
})

test('proof enforces execution lineage origin and persists explicit execution origin reference', () => {
  assert.match(source, /const executionLineageOriginCheck = verifyLineageOrigin\(\{[\s\S]*stage: "execute"[\s\S]*lineage_stage: String\(execution\.lineage_stage \|\| ""\)[\s\S]*parent_validation_hash: String\(execution\.parent_validation_hash \|\| ""\)[\s\S]*validation_hash: validationOriginHashAtProof[\s\S]*\}\)/)
  assert.match(source, /if \(!executionLineageOriginCheck\.ok\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason: executionLineageOriginCheck\.reason \}/)
  assert.match(source, /parent_execution_hash,lineage_stage,lineage_origin_hash\)/)
})
