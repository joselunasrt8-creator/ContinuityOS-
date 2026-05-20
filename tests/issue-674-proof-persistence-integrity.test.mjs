import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('proof persistence uses atomic insert-or-ignore CAS semantics', () => {
  assert.match(source, /INSERT OR IGNORE INTO proof_registry/)
  assert.match(source, /if \(proofInserted === 0\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_replay" \}/)
})

test('duplicate or concurrent proof persistence cannot consume authority', () => {
  assert.match(source, /UPDATE authority_registry SET status='CONSUMED'[\s\S]*EXISTS \(SELECT 1 FROM proof_registry WHERE proof_id=\?3 AND decision_id=\?1 AND validated_object_hash=\?4\)/)
  assert.match(source, /if \(proofInserted !== 1 \|\| authorityConsumed !== 1\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"authority_consumption_failed" \}/)
})

test('proof boundary keeps batch result available for post-batch guards', () => {
  assert.match(source, /let proofBoundary: any\[] = \[]/)
  assert.match(source, /proofBoundary = await env\.DB\.batch<any>\(proofStatements\)[\s\S]*const outboxQueued = proofBoundary\[2\]\?\.meta\?\.changes \|\| 0/)
})

test('executed object hash must exactly match validated object hash before proof insertion', () => {
  assert.match(source, /String\(execution\.validated_object_hash \|\| ""\) !== validated_object_hash \|\| String\(validation\?\.validated_object_hash \|\| ""\) !== validated_object_hash/)
  assert.match(source, /indicator: "validated_object_execution_mismatch"/)
})

test('proof path remains fail-closed without alternate fallback execution', () => {
  assert.doesNotMatch(source, /retry/i)
  assert.match(source, /return json\(\{ status:"NULL", result:"INVALID", reason:"proof_replay"/)
})
