import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('execution boundary rejects stale decision lineage and validation drift', () => {
  assert.match(source, /if \(String\(validation\.decision_id \|\| ""\) !== decision_id\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"hash_mismatch" \}/)
  assert.match(source, /indicator: "validation_lineage_missing_or_mismatched"/)
})

test('execution boundary rejects consumed replay state and prior proof persistence', () => {
  assert.match(source, /if \(!inv \|\| inv\.status!=="RESERVED"\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"nonce_not_reserved" \}/)
  assert.match(source, /SELECT proof_id FROM proof_registry WHERE decision_id=\?1 AND validated_object_hash=\?2/)
  assert.match(source, /if \(proofReplay\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_replay" \}/)
})

test('execution boundary enforces compiled continuity and policy validity at execution time', () => {
  assert.match(source, /if \(String\(compiled\.continuity_id \|\| ""\) !== String\(authority\.continuity_id \|\| ""\)\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"lineage_mismatch" \}/)
  assert.match(source, /if \(String\(compiled\.status \|\| ""\) !== "COMPILED"\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"policy_invalid" \}/)
  assert.match(source, /indicator: "policy_invalid_at_execution"/)
})

test('valid unchanged canonical flow remains present', () => {
  assert.match(source, /if \(url\.pathname === "\/authority" && request\.method === "POST"\)/)
  assert.match(source, /if \(url\.pathname === "\/compile" && request\.method === "POST"\)/)
  assert.match(source, /if \(url\.pathname === "\/validate" && request\.method === "POST"\)/)
  assert.match(source, /if \(url\.pathname === "\/execute" && request\.method === "POST"\)/)
  assert.match(source, /if \(url\.pathname === "\/proof" && request\.method === "POST"\)/)
})
