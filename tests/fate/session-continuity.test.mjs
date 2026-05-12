import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const sessionMigration = readFileSync(new URL('../../migrations/0010_identity_session_continuity.sql', import.meta.url), 'utf8')

test('authority without session returns NULL', () => {
  assert.match(source, /const session_id = String\(b\.session_id \|\| ""\)/)
  assert.match(source, /const session = await activeSession\(env, session_id\)/)
  assert.match(source, /if \(!session\) return rejectWithTelemetry\(env, \{ status: "NULL", reason: "invalid_session" \}/)
})

test('revoked session returns NULL', () => {
  assert.match(source, /continuity_status TEXT NOT NULL/)
  assert.match(source, /String\(session\.continuity_status \|\| ""\) !== "ACTIVE"/)
  assert.match(sessionMigration, /continuity_status TEXT NOT NULL/)
})

test('mismatched session lineage returns NULL / INVALID', () => {
  assert.match(source, /String\(authority\.session_id \|\| ""\) !== session_id/)
  assert.match(source, /String\(validation\.session_id \|\| ""\) !== session_id/)
  assert.match(source, /reason:"session_lineage_mismatch"/)
})

test('execute with invalid session returns NULL / INVALID', () => {
  assert.match(source, /if \(!session\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"invalid_session" \}/)
  assert.match(source, /drift_class: "execution_drift"/)
})
