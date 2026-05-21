import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/index.ts', 'utf8')
const schema = readFileSync('schema.sql', 'utf8')

test('validate/execute/proof persist workflow integrity lineage hash', () => {
  assert.match(source, /INSERT INTO validation_registry \([^`]*workflow_integrity_hash[^`]*\)/)
  assert.match(source, /INSERT INTO execution_registry \([^`]*workflow_integrity_hash[^`]*\)/)
  assert.match(source, /INSERT OR IGNORE INTO proof_registry \([^`]*workflow_integrity_hash[^`]*\)/)
  assert.match(schema, /CREATE TABLE IF NOT EXISTS validation_registry \([\s\S]*workflow_integrity_hash TEXT/)
  assert.match(schema, /CREATE TABLE IF NOT EXISTS execution_registry \([\s\S]*workflow_integrity_hash TEXT/)
  assert.match(schema, /CREATE TABLE IF NOT EXISTS proof_registry \([\s\S]*workflow_integrity_hash TEXT/)
})

test('execute/proof fail closed on workflow integrity drift with deterministic reason', () => {
  assert.match(source, /if \(!String\(validation\.workflow_integrity_hash \|\| ""\)\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"workflow_integrity_drift" \}/)
  assert.match(source, /if \(String\(executionSnapshot\.workflow_hash \|\| ""\) !== String\(validation\.workflow_integrity_hash \|\| ""\)\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"workflow_integrity_drift" \}/)
  assert.match(source, /if \(!String\(validation\.workflow_integrity_hash \|\| ""\) \|\| !String\(execution\.workflow_integrity_hash \|\| ""\)\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"workflow_integrity_drift" \}/)
})
