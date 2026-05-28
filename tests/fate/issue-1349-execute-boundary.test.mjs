import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const s = fs.readFileSync('src/index.ts', 'utf8')
const x = s.slice(
  s.indexOf('url.pathname === "/execute"'),
  s.indexOf('url.pathname === "/proof"')
)

test('/execute ignores validate classification evidence as authority', () => {
  assert.doesNotMatch(x, /classification_evidence/)
  assert.doesNotMatch(x, /local_lineage_present/)
  assert.doesNotMatch(x, /distributed_quorum_present/)
  assert.doesNotMatch(x, /global_consensus_present/)
  assert.doesNotMatch(x, /cryptographic_integrity_present/)
})

test('/execute remains registry-bound', () => {
  for (const r of ['validation_registry','invocation_registry','authority_registry','continuity_registry']) {
    assert.match(x, new RegExp(r))
  }
})

test('/execute preserves exact-object and replay boundary', () => {
  assert.match(x, /execHash !== validated_object_hash/)
  assert.match(x, /validated_object_execution_mismatch/)
  assert.match(x, /nonce_not_reserved/)
  assert.match(x, /replay_detected/)
})

test('/execute requires topology and reconciliation admission', () => {
  assert.match(x, /classifyPartitionFinalityAdmission/)
  assert.match(x, /topology_visible/)
  assert.match(x, /reconciliation_deterministic/)
  assert.match(x, /reconciliation_ordering_deterministic/)
})
