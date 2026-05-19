import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('revoked continuity invalidates canonical proof lookup before resolution', () => {
  assert.match(source, /const executionContinuityRevoked = await continuityIsRevokedOrAmbiguous\(env, String\(execution\.continuity_id \|\| ""\)\)/)
  assert.match(source, /if \(executionContinuityRevoked\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"revoked_continuity" \}/)
  assert.match(source, /indicator: "proof_lookup_blocked_by_revocation"/)
})

test('ambiguous continuity revocation state fails closed as NULL', () => {
  assert.match(source, /if \(!session \|\| String\(session\.identity_id \|\| ""\) !== String\(row\.identity_id \|\| ""\) \|\| String\(session\.continuity_status \|\| ""\) !== "ACTIVE" \|\| isExpired\(String\(session\.expires_at \|\| ""\)\)\) return true/)
  assert.match(source, /const lineage = await resolveContinuityLineage\(env, continuity_id, session\)[\s\S]*return !lineage/)
})

test('execution lineage continuity binding is required for canonical proof restoration', () => {
  assert.match(source, /if \(String\(execution\?\.continuity_id \|\| ""\) === ""\) return false/)
  assert.match(source, /if \(String\(proof\?\.continuity_id \|\| ""\) !== String\(execution\?\.continuity_id \|\| ""\)\) return false/)
})

test('duplicate archived lineage remains non-authoritative after continuity revocation fail-close', () => {
  assert.match(source, /return json\(\{ status:"NULL", result:"INVALID", reason:"proof_replay"/)
})
