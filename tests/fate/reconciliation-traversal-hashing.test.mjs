import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('deterministic traversal hash binds canonical traversal identity material', () => {
  assert.match(source, /async function deterministicTraversalHash\(/)
  assert.match(source, /result\.canonical_registry_ordering/)
  assert.match(source, /checked_registries: canonicalTrace\.map\(\(entry\) => entry\.registry\)/)
  assert.match(source, /drift_classes = result\.drift_classifications\.map\(\(drift\) => drift\.drift_class\)\.sort\(\)/)
  assert.match(source, /reconciliation_merkle_root/)
  assert.match(source, /hash_continuity/)
  assert.match(source, /traversal_hash = await deterministicTraversalHash\(result, merkle\.root, traversal_id\)/)
})

test('deterministic traversal hash remains canonicalized and order-invariant', () => {
  assert.match(source, /map\(\(registry\) => result\.deterministic_traversal_trace\.find\(\(entry\) => entry\.registry === registry\) \|\| null\)/)
  assert.match(source, /filter\(\(entry\): entry is ReconciliationTraceEntry => Boolean\(entry\)\)/)
  assert.match(source, /canonicalRecord\(\{/)
})

test('lineage failures and traversal loops remain fail-closed classifications', () => {
  assert.match(source, /return reconciliationInvalid\("orphan_legitimacy_object_drift"/)
  assert.match(source, /if \(!current_id \|\| visited\.has\(current_id\)\) return "recursive_ancestry_drift"/)
})
