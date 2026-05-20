import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('proof propagation is queued only after proof persistence in the same boundary', () => {
  assert.match(source, /INSERT OR IGNORE INTO proof_registry/)
  assert.match(source, /INSERT OR IGNORE INTO proof_propagation_outbox/)
  assert.match(source, /WHERE EXISTS \(SELECT 1 FROM proof_registry p JOIN execution_registry e ON e\.execution_id=p\.execution_id WHERE p\.proof_id=\?2 AND p\.decision_id=\?3 AND p\.execution_id=\?4 AND p\.validated_object_hash=\?5 AND e\.invocation_nonce=\?8\)/)
  assert.match(source, /canonicalize\(\{ proof_id, decision_id, execution_id, validated_object_hash, invocation_nonce, route: "\/proof", lineage_stage: "proof" \}\)/)
})

test('/proof/propagate is not a runtime mutation route', () => {
  assert.doesNotMatch(source, /url\.pathname === "\/proof\/propagate" && request\.method === "POST"/)
  assert.match(source, /if \(request\.method === "POST" && !canonicalRuntimeRoute\) \{[\s\S]*invalid_route_invocation[\s\S]*return json\(\{ status: "NULL", reason: "not_found" \}, 404\)/)
})

test('proof propagation outbox cannot mutate authority, execution lineage, or proof truth', () => {
  const outboxStatements = [...source.matchAll(/`[^`]*proof_propagation_outbox[^`]*`/g)].map((match) => match[0])
  assert.ok(outboxStatements.length >= 2)
  assert.equal(outboxStatements.some((statement) => /UPDATE\s+proof_propagation_outbox/.test(statement)), false)
  assert.equal(outboxStatements.some((statement) => /UPDATE\s+(authority_registry|execution_registry|proof_registry)/.test(statement)), false)
  assert.match(source, /proof_id TEXT NOT NULL UNIQUE/)
  assert.match(source, /replay_neutral TEXT NOT NULL CHECK \(replay_neutral='true'\)/)
  assert.match(source, /fail_closed TEXT NOT NULL CHECK \(fail_closed='true'\)/)
  assert.match(source, /if \(outboxQueued !== 1\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_outbox_enqueue_failed" \}/)
})
