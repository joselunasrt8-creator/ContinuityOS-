import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/runtime/federation/reconcileFederatedLegitimacy.ts', import.meta.url), 'utf8')
const indexSource = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const snapshot = JSON.parse(readFileSync(new URL('../../runtime/federation/federated_legitimacy_snapshot.json', import.meta.url), 'utf8'))

test('deterministic reconciliation stable', () => {
  assert.match(source, /function deterministicFederationSnapshot/)
  assert.match(source, /deterministic_hash/)
  assert.match(source, /Object\.keys\(o\)\.sort\(\)/)
})

test('orphan federation proofs quarantined, replay divergence and topology mismatch detected', () => {
  assert.match(source, /FEDERATION_ORPHAN_PROOF/)
  assert.match(source, /FEDERATION_REPLAY_DIVERGENCE/)
  assert.match(source, /FEDERATION_TOPOLOGY_MISMATCH/)
  assert.match(source, /orphan_proofs\.push/)
})

test('untrusted node classified and external node cannot create authority/proof', () => {
  assert.match(source, /FEDERATION_UNTRUSTED_NODE/)
  assert.match(source, /creates_authority: false/)
  assert.match(source, /creates_proof: false/)
  assert.match(source, /remote_execution_legitimacy: false/)
})

test('federation snapshots are evidence-only and reconciliation is read-only', () => {
  assert.equal(snapshot.evidence_only, true)
  assert.equal(snapshot.read_only, true)
  assert.equal(snapshot.mutation_capable, false)
  assert.equal(snapshot.remote_execution_legitimacy, false)
})

test('canonical runtime route unchanged', () => {
  assert.match(indexSource, /\["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\]/)
})
