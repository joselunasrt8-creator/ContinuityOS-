// Execution Adapter Boundary — fail-closed behavior tests.
//
// Proves that FilesystemExecutionAdapter and executeFilesystemAdapter:
//
//   TC-01  null AEO → NULL_AEO_INPUT (propagated from executeWithAdapter)
//   TC-02  blank validated_object_hash → NULL_VALIDATED_HASH
//   TC-03  wrong validated_object_hash → OBJECT_HASH_MISMATCH, writer never called
//   TC-04  target.system mismatch → EXECUTOR_RETURNED_NULL, writer never called
//   TC-05  missing target.path → EXECUTOR_RETURNED_NULL, writer never called
//   TC-06  writer returns null → EXECUTOR_RETURNED_NULL
//   TC-07  full success → AdapterProofReceipt with correct invariants
//   TC-08  creates_authority is structurally false in all outcomes
//   TC-09  adapter_surface in evidence matches AEO.target.system
//   TC-10  writer called with exact path and pre-bound content (no reinterpretation)
//   TC-11  OBJECT_HASH_MISMATCH: writer never called when hash stale
//   TC-12  receipt_id is deterministic sha256 of receipt body

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAdapterAEOHash,
} from '../src/lib/adapter-contract.ts'
import {
  executeFilesystemAdapter,
  FilesystemExecutionAdapter,
  FILESYSTEM_ADAPTER_SURFACE,
} from '../src/lib/filesystem-execution-adapter.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFilesystemAEO(targetOverrides = {}) {
  return Object.freeze({
    intent: Object.freeze({ action: 'write_file', purpose: 'governed filesystem write' }),
    scope: Object.freeze({
      repo: 'mindshift-demo',
      root: 'repository',
      allowed_paths: Object.freeze(['governed/filesystem-write-gateway/**']),
      denied_paths: Object.freeze([]),
      allowed_operations: Object.freeze(['create', 'modify']),
      denied_operations: Object.freeze([]),
      max_files: 1,
      max_diff_lines: 300,
    }),
    validation: Object.freeze({
      decision_id: 'AUTH-fs-001',
      authority_lineage_hash: 'sha256:fs-lineage-001',
      policy_id: 'filesystem-write-policy-v1',
      policy_hash: 'sha256:fs-policy-001',
      replay_nonce: 'nonce-fs-001',
      aeo_hash_required: true,
      requires_unused_nonce: true,
      requires_scope_match: true,
      requires_path_policy_match: true,
      requires_pre_write_hash_match: true,
      pre_write_hash: '',
      proposed_diff_hash: '',
      canonicalization: 'json-canonical-v1',
    }),
    target: Object.freeze({
      system: 'filesystem',
      operation: 'create',
      path: 'governed/filesystem-write-gateway/test.md',
      normalized_path_required: true,
      symlink_following_allowed: false,
      ...targetOverrides,
    }),
    finality: Object.freeze({
      proof_required: true,
      proof_type: 'filesystem_write_execution',
      expected_result: 'single_bounded_file_mutation',
      replay_state_after_success: 'CONSUMED',
      proof_fields: Object.freeze(['decision_id', 'aeo_hash', 'target_path']),
      registry_required: true,
      reconciliation_required: true,
    }),
  })
}

const GOOD_CONTENT = '# Test\n\nHello from the execution adapter boundary.\n'
const EMITTED_AT = '2026-06-09T00:00:00.000Z'

function makeGoodWriter() {
  let called = false
  let calledWith = null
  const writer = (input) => {
    called = true
    calledWith = input
    return {
      execution_id: 'fs-write:sha256:test-001',
      executed_at: EMITTED_AT,
      bytes_written: input.content.length,
    }
  }
  return { writer, wasCalled: () => called, calledWith: () => calledWith }
}

// ── TC-01: null AEO → NULL_AEO_INPUT ─────────────────────────────────────────

test('TC-01 null AEO returns NULL_AEO_INPUT', () => {
  const { writer } = makeGoodWriter()
  const out = executeFilesystemAdapter(null, 'sha256:hash', GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_AEO_INPUT')
  assert.equal(out.null_result.execution_result, 'NULL')
})

test('TC-01b undefined AEO returns NULL_AEO_INPUT', () => {
  const { writer } = makeGoodWriter()
  const out = executeFilesystemAdapter(undefined, 'sha256:hash', GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_AEO_INPUT')
})

// ── TC-02: blank validated_object_hash → NULL_VALIDATED_HASH ─────────────────

test('TC-02a blank validated_object_hash returns NULL_VALIDATED_HASH', () => {
  const aeo = makeFilesystemAEO()
  const { writer } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, '', GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_VALIDATED_HASH')
})

test('TC-02b null validated_object_hash returns NULL_VALIDATED_HASH', () => {
  const aeo = makeFilesystemAEO()
  const { writer } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, null, GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_VALIDATED_HASH')
})

// ── TC-03: wrong hash → OBJECT_HASH_MISMATCH, writer never called ─────────────

test('TC-03 stale validated_object_hash blocks execution and writer is never called', () => {
  const aeo = makeFilesystemAEO()
  const { writer, wasCalled } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, 'sha256:stale-hash-that-does-not-match', GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(wasCalled(), false, 'writer must not be called on hash mismatch')
})

// ── TC-04: target.system mismatch → EXECUTOR_RETURNED_NULL ───────────────────

test('TC-04 wrong target.system returns EXECUTOR_RETURNED_NULL, writer never called', () => {
  const aeo = makeFilesystemAEO({ system: 'cloudflare_worker' })
  const hash = computeAdapterAEOHash(aeo)
  const { writer, wasCalled } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
  assert.equal(wasCalled(), false, 'writer must not be called on surface mismatch')
})

// ── TC-05: missing target.path → EXECUTOR_RETURNED_NULL ──────────────────────

test('TC-05 missing target.path returns EXECUTOR_RETURNED_NULL, writer never called', () => {
  const aeo = makeFilesystemAEO({ path: undefined })
  const hash = computeAdapterAEOHash(aeo)
  const { writer, wasCalled } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
  assert.equal(wasCalled(), false, 'writer must not be called on missing path')
})

// ── TC-06: writer returns null → EXECUTOR_RETURNED_NULL ──────────────────────

test('TC-06 writer returning null returns EXECUTOR_RETURNED_NULL', () => {
  const aeo = makeFilesystemAEO()
  const hash = computeAdapterAEOHash(aeo)
  const nullWriter = () => null
  const out = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, nullWriter, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

// ── TC-07: full success → AdapterProofReceipt with correct invariants ─────────

test('TC-07 full success emits AdapterProofReceipt with correct fields', () => {
  const aeo = makeFilesystemAEO()
  const hash = computeAdapterAEOHash(aeo)
  const { writer } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, true)
  const receipt = out.receipt
  assert.equal(receipt.execution_result, 'EXECUTED')
  assert.equal(receipt.validated_object_hash, hash)
  assert.equal(receipt.executed_object_hash, hash)
  assert.equal(receipt.adapter_surface, 'filesystem')
  assert.equal(receipt.decision_id, 'AUTH-fs-001')
  assert.equal(receipt.replay_nonce, 'nonce-fs-001')
  assert.equal(receipt.emitted_at, EMITTED_AT)
  assert.ok(receipt.receipt_id.startsWith('sha256:'), 'receipt_id must be a sha256 hash')
  assert.ok(receipt.execution_evidence_hash.startsWith('sha256:'), 'execution_evidence_hash must be a sha256 hash')
})

// ── TC-08: creates_authority is structurally false in all outcomes ─────────────

test('TC-08a creates_authority is false in NULL outcome', () => {
  const { writer } = makeGoodWriter()
  const out = executeFilesystemAdapter(null, 'sha256:hash', GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.creates_authority, false)
})

test('TC-08b creates_authority is false in EXECUTED receipt', () => {
  const aeo = makeFilesystemAEO()
  const hash = computeAdapterAEOHash(aeo)
  const { writer } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, true)
  assert.equal(out.receipt.creates_authority, false)
})

// ── TC-09: adapter_surface in evidence matches AEO.target.system ──────────────

test('TC-09 adapter_surface in receipt matches AEO target system', () => {
  const aeo = makeFilesystemAEO()
  const hash = computeAdapterAEOHash(aeo)
  const { writer } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, true)
  assert.equal(out.receipt.adapter_surface, aeo.target.system)
  assert.equal(out.receipt.adapter_surface, FILESYSTEM_ADAPTER_SURFACE)
})

// ── TC-10: writer called with exact path and pre-bound content ────────────────

test('TC-10 writer receives exact path from AEO.target.path and pre-bound content', () => {
  const aeo = makeFilesystemAEO()
  const hash = computeAdapterAEOHash(aeo)
  const { writer, calledWith } = makeGoodWriter()
  const out = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, true)
  assert.equal(calledWith().path, 'governed/filesystem-write-gateway/test.md')
  assert.equal(calledWith().content, GOOD_CONTENT)
})

// ── TC-11: OBJECT_HASH_MISMATCH blocks writer even when AEO is otherwise valid ──

test('TC-11 mutated AEO (hash no longer matches) blocks writer', () => {
  const aeo = makeFilesystemAEO()
  const originalHash = computeAdapterAEOHash(aeo)
  // Simulate a tampered AEO by using an AEO that differs from the original
  const tamperedAEO = makeFilesystemAEO({ path: 'governed/filesystem-write-gateway/other.md' })
  const { writer, wasCalled } = makeGoodWriter()
  // Pass the original hash but the tampered AEO — hash will not match
  const out = executeFilesystemAdapter(tamperedAEO, originalHash, GOOD_CONTENT, writer, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(wasCalled(), false)
})

// ── TC-12: receipt_id is deterministic sha256 ─────────────────────────────────

test('TC-12 receipt_id is deterministic for identical inputs', () => {
  const aeo = makeFilesystemAEO()
  const hash = computeAdapterAEOHash(aeo)
  const { writer: w1 } = makeGoodWriter()
  const { writer: w2 } = makeGoodWriter()
  const out1 = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, w1, EMITTED_AT)
  const out2 = executeFilesystemAdapter(aeo, hash, GOOD_CONTENT, w2, EMITTED_AT)
  assert.equal(out1.ok, true)
  assert.equal(out2.ok, true)
  assert.equal(out1.receipt.receipt_id, out2.receipt.receipt_id)
})

// ── TC-13: FilesystemExecutionAdapter adapter_surface constant ────────────────

test('TC-13 FilesystemExecutionAdapter.adapter_surface equals FILESYSTEM_ADAPTER_SURFACE', () => {
  const { writer } = makeGoodWriter()
  const adapter = new FilesystemExecutionAdapter(GOOD_CONTENT, writer)
  assert.equal(adapter.adapter_surface, FILESYSTEM_ADAPTER_SURFACE)
  assert.equal(adapter.adapter_surface, 'filesystem')
})
