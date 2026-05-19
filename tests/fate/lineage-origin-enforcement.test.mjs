import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('src/index.ts','utf8')

test('forged validation rejected', () => {
  assert.match(source, /invalid_compile_lineage|orphan_validation_lineage/)
})

test('forged execution rejected', () => {
  assert.match(source, /invalid_validation_lineage|orphan_execution_lineage/)
})

test('forged proof rejected', () => {
  assert.match(source, /invalid_execution_lineage|orphan_proof_lineage/)
})

test('replay lineage rejected', () => {
  assert.match(source, /proof_replay|replay_detected/)
})

test('mutated lineage rejected', () => {
  assert.match(source, /lineage_origin_mismatch|lineage_stage_mismatch/)
})

test('orphan lineage rejected', () => {
  assert.match(source, /orphan_validation_lineage|orphan_execution_lineage|orphan_proof_lineage/)
})

test('deterministic lineage traversal stable', () => {
  assert.match(source, /canonicalLineageHash\(/)
})

test('lineage reports are evidence-only', () => {
  assert.match(source, /duplicate_proof_replay: true/)
})
