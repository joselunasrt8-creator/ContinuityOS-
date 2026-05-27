import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('compile persists projection hash for OpenClaw-governed lineage', () => {
  assert.match(source, /govern_projection_hash/)
  assert.match(source, /INSERT INTO aeo_registry[\s\S]*govern_projection_hash/)
})

test('validate accepts equality path by comparing projection hashes', () => {
  assert.match(source, /compareGovernProjectionHashes\(/)
})

test('validate rejects intent drift with projection_hash_drift', () => { assert.match(source, /reason:"projection_hash_drift"/) })
test('validate rejects scope drift with projection_hash_drift', () => { assert.match(source, /route: "\/validate"[\s\S]*projection_hash_drift/) })
test('validate rejects target drift with projection_hash_drift', () => { assert.match(source, /computeGovernProjectionHash\(canonicalGovernProjectionFromAeo/) })
test('validate rejects finality drift with projection_hash_drift', () => { assert.match(source, /canonicalGovernProjectionFromCandidate/) })

test('execute rejects executable object drift after validation', () => {
  assert.match(source, /route: "\/execute"[\s\S]*projection_hash_drift/)
})

test('proof includes govern projection hash lineage material when available', () => {
  assert.match(source, /executionLineage = canonicalize\([\s\S]*govern_projection_hash/)
})

test('non-OpenClaw flows remain unchanged', () => {
  assert.match(source, /if \(isOpenClawOriginPayload\(payload\)\) return \{ required: true/)
})

test('#1463 and #1464 enforcement surfaces remain present', () => {
  assert.match(source, /requiresGovernEnvelopeLineage/)
  assert.match(source, /verifyGovernedToolEnvelopeLinkage/)
})
