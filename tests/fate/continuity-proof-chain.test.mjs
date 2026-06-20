// tests/fate/continuity-proof-chain.test.mjs
// FATE — Continuity Proof Chain SUBSTRATE: the append-only, tamper-evident hash
// chain that orders execution-lineage carries. Fail-closed on every break.
//
// The substrate orders and binds; the execution-eligibility GATE (tested in
// execution-eligibility-continuity.test.mjs) decides admission. This file proves
// the substrate alone: determinism, inheritance, and fail-closed verification.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GENESIS_LINK_HASH,
  linkProof,
  verifyInheritance,
  verifyChain,
  computeLinkHash,
  headOf,
} from '../../runtime/lineage/continuityProofChain.mjs'

const KEY = 'owner/repo@main'

// A carry payload (terminal runtime state of a run) for sequence n.
function carry(n) {
  return {
    lineage_key: KEY,
    continuity_id: `c${n}`,
    parent_continuity_id: n === 0 ? '' : `c${n - 1}`,
    validated_object_hash: `v${n}`,
    executed_object_hash: `v${n}`,
    proof_hash: `p${n}`,
    timestamp: `2026-06-20T00:0${n}:00Z`,
  }
}

function buildChain(n) {
  const chain = []
  let head = null
  for (let i = 0; i < n; i++) {
    const link = linkProof(carry(i), head)
    chain.push(link)
    head = link
  }
  return chain
}

test('genesis: first link parents to GENESIS_LINK_HASH at sequence 0', () => {
  const link = linkProof(carry(0), null)
  assert.equal(link.parent_link_hash, GENESIS_LINK_HASH)
  assert.equal(link.sequence_number, 0)
  assert.equal(link.link_hash, computeLinkHash(link))
  assert.equal(link.mutation_allowed, false)
})

test('the carry is bound into link_hash (continuity + executed object)', () => {
  const a = linkProof(carry(0), null)
  const b = linkProof({ ...carry(0), executed_object_hash: 'different' }, null)
  assert.notEqual(a.link_hash, b.link_hash) // executed_object_hash is part of identity
})

test('verified state inheritance: a valid next link inherits the head', () => {
  const chain = buildChain(1)
  const next = linkProof(carry(1), headOf(chain))
  assert.equal(next.parent_link_hash, chain[0].link_hash)
  assert.equal(next.sequence_number, 1)
  assert.equal(verifyInheritance(next, headOf(chain)).result, 'VALID')
})

test('whole valid chain replays VALID and reports the head', () => {
  const chain = buildChain(4)
  const res = verifyChain(chain)
  assert.equal(res.result, 'VALID')
  assert.equal(res.length, 4)
  assert.equal(res.head_link_hash, chain[3].link_hash)
})

test('link_hash excludes itself — recompute is stable and tamper-evident', () => {
  const link = linkProof(carry(0), null)
  assert.equal(computeLinkHash(link), link.link_hash)
})

test('determinism: identical inputs + head produce identical link_hash', () => {
  assert.equal(linkProof(carry(7), null).link_hash, linkProof(carry(7), null).link_hash)
})

// ── Fail-closed: every substrate NULL reason ─────────────────────────────────

test('NULL — MISSING_PARENT: no parent_link_hash', () => {
  const link = { ...linkProof(carry(0), null), parent_link_hash: '' }
  assert.equal(verifyInheritance(link, null).null_reasons.includes('MISSING_PARENT'), true)
})

test('NULL — PARENT_MISMATCH: forked parent does not equal head', () => {
  const chain = buildChain(1)
  const forged = linkProof(carry(1), { ...chain[0], link_hash: 'deadbeef' })
  const res = verifyInheritance(forged, headOf(chain))
  assert.equal(res.result, 'NULL')
  assert.equal(res.null_reasons.includes('PARENT_MISMATCH'), true)
})

test('NULL — SEQUENCE_GAP: skips ahead of head+1', () => {
  const chain = buildChain(1)
  const skipped = { ...linkProof(carry(1), headOf(chain)), sequence_number: 5 }
  const rehashed = { ...skipped, link_hash: computeLinkHash(skipped) }
  assert.equal(verifyInheritance(rehashed, headOf(chain)).null_reasons.includes('SEQUENCE_GAP'), true)
})

test('NULL — DUPLICATE_SEQUENCE: replays a sequence already at/under head', () => {
  const chain = buildChain(2)
  const replay = linkProof(carry(0), null) // seq 0 against a head at seq 1
  assert.equal(verifyInheritance(replay, headOf(chain)).null_reasons.includes('DUPLICATE_SEQUENCE'), true)
})

test('NULL — DUPLICATE_LINK_HASH: same link appears twice in a chain', () => {
  const chain = buildChain(2)
  const res = verifyChain([...chain, chain[1]])
  assert.equal(res.result, 'NULL')
  assert.equal(res.null_reasons.includes('DUPLICATE_LINK_HASH'), true)
})

test('NULL — MUTATED_PRIOR_LINK: a stored link is tampered after the fact', () => {
  const chain = buildChain(3)
  const tampered = chain.map((l, i) => (i === 1 ? { ...l, executed_object_hash: 'tampered' } : l))
  const res = verifyChain(tampered)
  assert.equal(res.result, 'NULL')
  assert.equal(res.broken_at, 1)
  assert.equal(res.null_reasons.includes('MUTATED_PRIOR_LINK'), true)
})

test('NULL — LINEAGE_KEY_MISMATCH: a link from a different chain', () => {
  const chain = buildChain(1)
  const other = linkProof({ ...carry(1), lineage_key: 'owner/repo@release' }, headOf(chain))
  assert.equal(verifyInheritance(other, headOf(chain)).null_reasons.includes('LINEAGE_KEY_MISMATCH'), true)
})

test('NULL — LINK_HASH_MISMATCH: the candidate link itself is tampered', () => {
  const chain = buildChain(1)
  const tampered = { ...linkProof(carry(1), headOf(chain)), proof_hash: 'changed' }
  assert.equal(verifyInheritance(tampered, headOf(chain)).null_reasons.includes('LINK_HASH_MISMATCH'), true)
})
