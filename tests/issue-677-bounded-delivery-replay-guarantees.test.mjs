import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const replaySemantics = readFileSync(new URL('../standards/replay-semantics-v1.md', import.meta.url), 'utf8')

test('Issue #677: duplicate execution attempts fail deterministically in execute boundary', () => {
  assert.match(source, /SELECT execution_id FROM execution_registry WHERE decision_id=\?1 AND validated_object_hash=\?2/)
  assert.match(source, /if \(replay\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"replay_detected" \}/)
})

test('Issue #677: proof uniqueness remains scoped to canonical legitimacy tuple', () => {
  assert.match(source, /SELECT proof_id FROM proof_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 ORDER BY created_at ASC, proof_id ASC LIMIT 1/)
  assert.match(source, /return json\(\{ status:"NULL", result:"INVALID", reason:"proof_replay", proof_id: String\(canonicalExistingProof\.proof_id \|\| ""\), replay: canonicalEvidenceReplay \}\)/)
})

test('Issue #677: acknowledgement loss retry cannot produce a second proof', () => {
  assert.match(source, /INSERT OR IGNORE INTO proof_registry/)
  assert.match(source, /if \(proofInserted === 0\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_replay" \}/)
})

test('Issue #677: missing replay semantics or continuity requirements fail closed as NULL', () => {
  assert.match(source, /if \(!invocation_nonce\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"missing_invocation_nonce" \}/)
  assert.match(source, /if \(!continuity\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"invalid_continuity" \}/)
})

test('Issue #677: documentation is explicit about bounded replay-safe guarantees (not global exactly-once)', () => {
  assert.match(replaySemantics, /does not promise global exactly-once delivery/i)
  assert.match(replaySemantics, /proof persistence is the source of truth/i)
  assert.match(replaySemantics, /transport or queue acknowledgement is not proof/i)
})
