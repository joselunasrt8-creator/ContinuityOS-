// tests/fate/execute-continuity-integration.test.mjs
// FATE — integration: the runtime /execute boundary depends on the execution-
// eligibility gate. Proves the runtime LAW (not just helper behavior):
//
//   AEO with lineage_key + MISSING prior executed object
//     → NULL → executor not called → no registry append
//   AEO with lineage_key + VALID prior executed object
//     → ELIGIBLE → execute → proof receipt includes parent_executed_object_hash
//     → proof binds lineage head → registry head advances
//
// Driven through executeGovernedRun (gate + executeWithAdapter + admitRun) against a
// real append-only JSONL registry.

import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { computeAdapterAEOHash } from '../../src/lib/adapter-contract.ts'
import { executeGovernedRun } from '../../runtime/lineage/governedExecution.mjs'
import { GENESIS_EXECUTION_STATE } from '../../runtime/lineage/executionEligibility.mjs'
import { readEntries, verifyRegistryChain } from '../../runtime/lineage/proofChainRegistry.mjs'

const KEY = 'svc/runtime@main'
const NOW = '2026-06-20T00:00:00Z'

// A counting mock adapter — lets us assert the executor is NEVER called on NULL.
function mockAdapter() {
  const adapter = {
    calls: 0,
    adapter_surface: 'test',
    execute(aeo) {
      adapter.calls++
      return { execution_id: `ex-${adapter.calls}`, executed_at: NOW, adapter_surface: 'test', adapter_specific: {} }
    },
  }
  return adapter
}

// Build an exact-5-key adapter-targeted AEO declaring continuity.
function makeAEO({ continuity_id, parent_continuity_id, parent_executed_object_hash, nonce }) {
  return {
    intent: { action: 'demo', purpose: 'integration' },
    scope: { region: 'test' },
    validation: {
      decision_id: `d-${nonce}`,
      authority_lineage_hash: 'sha256:auth',
      policy_id: 'pol',
      policy_hash: 'sha256:pol',
      replay_nonce: nonce,
      aeo_hash_required: true,
      requires_unused_nonce: true,
      lineage_key: KEY,
      continuity_id,
      parent_continuity_id,
      parent_executed_object_hash,
    },
    target: { system: 'test' },
    finality: { proof_required: true, proof_type: 'test_proof', replay_state_after_success: 'CONSUMED' },
  }
}

function freshRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'exec-int-'))
  const registry = join(dir, 'execution_lineage_registry.jsonl')
  writeFileSync(registry, JSON.stringify({ _record_type: 'registry_init', registry_version: '1.0' }) + '\n')
  return registry
}

// Run 1 — genesis root. Returns { registry, hash1, head1 }.
function seedGenesis(registry, adapter) {
  const aeo = makeAEO({
    continuity_id: 'c0',
    parent_continuity_id: '',
    parent_executed_object_hash: GENESIS_EXECUTION_STATE.executed_object_hash,
    nonce: 'n0',
  })
  const hash = computeAdapterAEOHash(aeo)
  const out = executeGovernedRun(registry, aeo, hash, adapter, NOW, { now: NOW })
  return { out, hash }
}

test('genesis root executes and binds the first lineage head', () => {
  const registry = freshRegistry()
  const adapter = mockAdapter()
  const { out, hash } = seedGenesis(registry, adapter)

  assert.equal(out.ok, true)
  assert.equal(adapter.calls, 1)
  assert.equal(out.receipt.execution_result, 'EXECUTED')
  assert.equal(out.receipt.lineage_eligibility, 'ELIGIBLE')
  assert.equal(out.receipt.parent_executed_object_hash, GENESIS_EXECUTION_STATE.executed_object_hash)
  assert.equal(out.lineage_appended, true)
  assert.equal(readEntries(registry, KEY).length, 1)
  // receipt_id binds the lineage fields (proof binds lineage)
  assert.ok(out.lineage_head && out.lineage_head.length === 64)
  // executed == validated
  assert.equal(out.receipt.executed_object_hash, hash)
})

test('LAW — valid prior executed object: ELIGIBLE → execute → proof binds head → head advances', () => {
  const registry = freshRegistry()
  const a1 = mockAdapter()
  const { hash: hash1 } = seedGenesis(registry, a1)
  const headBefore = readEntries(registry, KEY).at(-1).link_hash

  // Run 2 inherits run 1's executed object hash.
  const a2 = mockAdapter()
  const aeo2 = makeAEO({
    continuity_id: 'c1',
    parent_continuity_id: 'c0',
    parent_executed_object_hash: hash1, // VALID prior executed object
    nonce: 'n1',
  })
  const hash2 = computeAdapterAEOHash(aeo2)
  const out2 = executeGovernedRun(registry, aeo2, hash2, a2, NOW, { now: NOW })

  assert.equal(out2.ok, true)                                   // ELIGIBLE → execute
  assert.equal(a2.calls, 1)
  assert.equal(out2.receipt.parent_executed_object_hash, hash1) // proof receipt includes parent executed object
  assert.equal(out2.receipt.lineage_eligibility, 'ELIGIBLE')
  assert.equal(out2.lineage_appended, true)
  const headAfter = readEntries(registry, KEY).at(-1).link_hash
  assert.notEqual(headAfter, headBefore)                         // registry head advances
  assert.equal(readEntries(registry, KEY).length, 2)
  assert.equal(verifyRegistryChain(registry, KEY).result, 'VALID')
})

test('LAW — missing prior executed object: NULL → executor NOT called → no registry append', () => {
  const registry = freshRegistry()
  const a1 = mockAdapter()
  seedGenesis(registry, a1)
  const lenBefore = readEntries(registry, KEY).length

  // Run 2 does NOT inherit the prior executed object (wrong parent hash).
  const a2 = mockAdapter()
  const aeoBad = makeAEO({
    continuity_id: 'c1',
    parent_continuity_id: 'c0',
    parent_executed_object_hash: 'sha256:not-the-prior-executed-object',
    nonce: 'n1',
  })
  const hashBad = computeAdapterAEOHash(aeoBad)
  const out = executeGovernedRun(registry, aeoBad, hashBad, a2, NOW, { now: NOW })

  assert.equal(out.ok, false)                                          // NULL
  assert.equal(out.null_result.null_reason, 'EXECUTION_NOT_ELIGIBLE')
  assert.equal(out.null_result.lineage_null_reasons.includes('UNINHERITED_EXECUTED_STATE'), true)
  assert.equal(a2.calls, 0)                                            // executor NOT called
  assert.equal(out.lineage_appended, false)
  assert.equal(readEntries(registry, KEY).length, lenBefore)          // no registry append
})

test('a lineage AEO with no continuity context supplied is NULL (cannot bypass the gate)', () => {
  // Calling the boundary path without a registry-derived context: an AEO that declares
  // a lineage_key but reaches a stale prior cannot inherit. Here we reuse the same
  // nonce as genesis to also exercise replay rejection through the runtime path.
  const registry = freshRegistry()
  seedGenesis(registry, mockAdapter())

  const a = mockAdapter()
  const replayAeo = makeAEO({
    continuity_id: 'c1',
    parent_continuity_id: 'c0',
    parent_executed_object_hash: computeAdapterAEOHash(makeAEO({ continuity_id: 'c0', parent_continuity_id: '', parent_executed_object_hash: GENESIS_EXECUTION_STATE.executed_object_hash, nonce: 'n0' })),
    nonce: 'n0', // reused
  })
  const out = executeGovernedRun(registry, replayAeo, computeAdapterAEOHash(replayAeo), a, NOW, { now: NOW })
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTION_NOT_ELIGIBLE')
  assert.equal(out.null_result.lineage_null_reasons.includes('REPLAYED_NONCE'), true)
  assert.equal(a.calls, 0)
})
