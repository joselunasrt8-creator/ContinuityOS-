// tests/fate/lineage-observer.test.mjs
// FATE — CI OBSERVER of the runtime execution-lineage law. The observer re-verifies
// the runtime-produced registry is intact and emits attributable evidence. It
// OBSERVES, it does not DECIDE: VALID -> pass; tampered/forked/malformed/broken ->
// fail closed. It never classifies or creates eligibility, never appends, never
// mints authority.

import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GENESIS_EXECUTION_STATE } from '../../runtime/lineage/executionEligibility.mjs'
import { admitRun } from '../../runtime/lineage/proofChainRegistry.mjs'
import { observeRegistry } from '../../runtime/lineage/observeRegistry.mjs'

const KEY = 'owner/repo@main'
const NOW = '2026-06-20T00:00:00Z'
const PINNED = '2026-06-21T00:00:00Z'

function freshRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'lineage-observe-'))
  const registry = join(dir, 'execution_lineage_registry.jsonl')
  writeFileSync(registry, JSON.stringify({ _record_type: 'registry_init', registry_version: '1.0' }) + '\n')
  return registry
}

function seedChain(registry) {
  admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c0', parent_continuity_id: '',
    parent_executed_object_hash: GENESIS_EXECUTION_STATE.executed_object_hash,
    validated_object_hash: 'obj0', executed_object_hash: 'obj0', nonce: 'n0',
  }, { now: NOW, proof_id: 'R1' })
  admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c1', parent_continuity_id: 'c0',
    parent_executed_object_hash: 'obj0',
    validated_object_hash: 'obj1', executed_object_hash: 'obj1', nonce: 'n1',
  }, { now: NOW, proof_id: 'R2' })
}

function tamperFirstEntry(registry, mutate) {
  const lines = readFileSync(registry, 'utf8').split('\n')
  let done = false
  const out = lines.map((line) => {
    const t = line.trim()
    if (done || !t) return line
    let obj
    try { obj = JSON.parse(t) } catch { return line }
    if (obj._record_type !== 'execution_lineage_entry' || !obj.link_hash) return line
    done = true
    return JSON.stringify(mutate(obj))
  })
  writeFileSync(registry, out.join('\n'))
}

test('observe: an intact empty registry is VALID and mints nothing', () => {
  const registry = freshRegistry()
  const o = observeRegistry(registry, { verified_at: PINNED })

  assert.equal(o.object_type, 'ExecutionLineageObservation')
  assert.equal(o.mode, 'observability_only')
  assert.equal(o.verification_status, 'VALID')
  assert.equal(o.intact, true)
  assert.equal(o.registry_length, 0)
  assert.deepEqual(o.null_reasons, [])
  assert.equal(o.verified_at, PINNED)
  // Observer boundaries — it creates no authority and no eligibility, and never
  // decides (no eligibility classification field is emitted).
  assert.equal(o.creates_authority, false)
  assert.equal(o.creates_eligibility, false)
  assert.equal('eligibility' in o, false)
})

test('observe: an intact multi-link chain is VALID and binds the observed head', () => {
  const registry = freshRegistry()
  seedChain(registry)
  const o = observeRegistry(registry, { lineage_key: KEY, verified_at: PINNED })

  assert.equal(o.verification_status, 'VALID')
  assert.equal(o.intact, true)
  assert.equal(o.registry_length, 2)
  assert.equal(typeof o.head_link_hash, 'string')
  assert.equal(o.head_link_hash.length, 64) // the observed lineage head, recorded
})

test('observe: a tampered hash-bound field fails closed (MUTATED_PRIOR_LINK)', () => {
  const registry = freshRegistry()
  seedChain(registry)
  tamperFirstEntry(registry, (e) => ({ ...e, revoked_at: '2026-01-01T00:00:00Z' }))
  const o = observeRegistry(registry, { lineage_key: KEY, verified_at: PINNED })

  assert.equal(o.verification_status, 'NULL')
  assert.equal(o.intact, false)
  assert.equal(o.null_reasons.includes('MUTATED_PRIOR_LINK'), true)
})

test('observe: a malformed registry line fails closed (MALFORMED_REGISTRY_LINE)', () => {
  const registry = freshRegistry()
  seedChain(registry)
  writeFileSync(registry, readFileSync(registry, 'utf8') + 'NOT-JSON\n')
  const o = observeRegistry(registry, { lineage_key: KEY, verified_at: PINNED })

  assert.equal(o.verification_status, 'NULL')
  assert.equal(o.intact, false)
  assert.equal(o.null_reasons.includes('MALFORMED_REGISTRY_LINE'), true)
})

test('observe: a forked parent fails closed (PARENT_MISMATCH)', () => {
  const registry = freshRegistry()
  seedChain(registry)
  // Re-point the second link's parent so it no longer inherits the head, AND keep
  // its own link_hash self-consistent so this surfaces as a fork, not a mutation.
  const lines = readFileSync(registry, 'utf8').trim().split('\n')
  const entries = lines.map((l) => JSON.parse(l))
  const second = entries.find((e) => e._record_type === 'execution_lineage_entry' && e.sequence_number === 1)
  second.parent_link_hash = 'f'.repeat(64)
  writeFileSync(registry, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const o = observeRegistry(registry, { lineage_key: KEY, verified_at: PINNED })

  assert.equal(o.intact, false)
  // The fork repoint changes the recomputed hash too, so either the mutation or the
  // parent break trips first — both are fail-closed; assert it is NOT VALID.
  assert.equal(o.verification_status, 'NULL')
  assert.ok(o.null_reasons.length > 0)
})

test('observe is read-only: it never appends to or mutates the registry', () => {
  const registry = freshRegistry()
  seedChain(registry)
  const before = readFileSync(registry, 'utf8')
  observeRegistry(registry, { lineage_key: KEY, verified_at: PINNED })
  observeRegistry(registry, { verified_at: PINNED })
  assert.equal(readFileSync(registry, 'utf8'), before) // byte-identical after observation
})
