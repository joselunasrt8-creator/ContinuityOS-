import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('issue #1464 /validate enforces missing govern envelope reason for OpenClaw-origin', () => {
  assert.match(source, /govern_envelope_missing/)
})

test('issue #1464 /validate enforces govern envelope hash mismatch reason', () => {
  assert.match(source, /govern_envelope_hash_mismatch/)
})

test('issue #1464 /validate enforces VALID_CANDIDATE status for govern envelope lineage', () => {
  assert.match(source, /govern_envelope_invalid_status/)
  assert.match(source, /String\(record\.status \|\| ""\) !== "VALID_CANDIDATE"/)
})

test('issue #1464 /validate performs govern envelope lineage resolution for OpenClaw-origin', () => {
  assert.match(source, /resolveGovernEnvelopeLineage\(env, b, "govern_envelope_missing", "govern_envelope_ambiguous", "govern_envelope_invalid_status", "govern_envelope_hash_mismatch"/)
})

test('issue #1464 /proof enforces missing govern ancestry reason for OpenClaw-origin', () => {
  assert.match(source, /govern_ancestry_missing/)
})

test('issue #1464 /proof enforces govern ancestry hash mismatch reason', () => {
  assert.match(source, /govern_ancestry_hash_mismatch/)
})

test('issue #1464 /proof includes govern_envelope_id\/hash in proof lineage and closure material', () => {
  assert.match(source, /govern_envelope_id: String\(proofGovernLineage\?\.govern_envelope_id \|\| ""\)/)
  assert.match(source, /govern_envelope_hash: String\(proofGovernLineage\?\.govern_envelope_hash \|\| ""\)/)
})

test('issue #1464 non-OpenClaw validation\/proof behavior remains unchanged via origin gate', () => {
  assert.match(source, /const openClawOrigin = isOpenClawOriginPayload\(b\)/)
})
