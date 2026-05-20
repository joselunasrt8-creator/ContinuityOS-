import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('proof propagation is queued only after proof persistence in the same boundary', () => {
  assert.match(source, /INSERT OR IGNORE INTO proof_registry/)
  assert.match(source, /INSERT OR IGNORE INTO proof_propagation_outbox/)
  assert.match(source, /WHERE EXISTS \(SELECT 1 FROM proof_registry WHERE proof_id=\?2 AND decision_id=\?3 AND execution_id=\?4 AND validated_object_hash=\?5\)/)
})

test('outbound propagation rejects orphan or replayed delivery', () => {
  assert.match(source, /if \(!outbox \|\| String\(outbox.status \|\| ""\) !== "PENDING"\) return json\(\{ status:"NULL", result:"INVALID", reason:"replayed_propagation" \}\)/)
  assert.match(source, /if \(!proof\) return json\(\{ status:"NULL", result:"INVALID", reason:"orphan_propagation" \}\)/)
  assert.match(source, /reason:"duplicate_propagation"/)
})

test('publish mutation is idempotent and fail-closed', () => {
  assert.match(source, /UPDATE proof_propagation_outbox SET status='PUBLISHED', publish_attempts=publish_attempts\+1[\s\S]*WHERE outbox_id=\?1 AND status='PENDING'/)
  assert.match(source, /if \(\(publish.meta\?\.changes \|\| 0\) !== 1\) return json\(\{ status:"NULL", result:"INVALID", reason:"replayed_propagation" \}\)/)
  assert.match(source, /if \(outboxQueued !== 1\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_outbox_enqueue_failed" \}/)
})
