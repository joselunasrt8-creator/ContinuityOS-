import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('validate binds canonical execution snapshot including repository tree hash', () => {
  assert.match(source, /const validationSnapshot = executionSnapshotFrom\(b\)/)
  assert.match(source, /missingValidationSnapshot/)
  assert.match(source, /INSERT OR REPLACE INTO execution_snapshot_registry[\s\S]*repository_tree_hash/)
})

test('execute fails closed on missing repository tree hash', () => {
  assert.match(source, /reason:"repository_tree_hash_missing"/)
})

test('execute fails closed on repository tree integrity mismatch with HASH_MISMATCH telemetry', () => {
  assert.match(source, /reason:"repository_tree_integrity_mismatch"/)
  assert.match(source, /event_type: "HASH_MISMATCH"[\s\S]*indicator: "repository_tree_integrity_mismatch"/)
})

test('proof cannot repair tree integrity drift and enforces accepted tree hash lineage', () => {
  assert.match(source, /route: "\/proof"[\s\S]*indicator: "repository_tree_integrity_mismatch"/)
  assert.match(source, /if \(String\(executionSnapshot\.repository_tree_hash \|\| ""\) !== provenance\.source_tree_hash\) return rejectWithTelemetry/)
})

