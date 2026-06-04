// Issue #1866: Adapter-Based Governance — fail-closed behavior tests.
//
// Proves that:
//   TC-01  null/undefined AEO → NULL_AEO_INPUT
//   TC-02  blank/null validated_object_hash → NULL_VALIDATED_HASH
//   TC-03  stale or wrong validated_object_hash → OBJECT_HASH_MISMATCH, executor not called
//   TC-04  null/missing executor → NULL_EXECUTOR
//   TC-05  executor returning null → EXECUTOR_RETURNED_NULL
//   TC-06  incomplete evidence fields → NULL with specific reason
//   TC-07  full success → proof receipt with correct invariants
//   TC-08  creates_authority is structurally false in all outcomes
//   TC-09  Cloudflare adapter: routing, execution, and null paths
//   TC-10  D1 storage adapter: routing, execution, and null paths

import test from 'node:test'
import assert from 'node:assert/strict'
import { computeAdapterAEOHash, executeWithAdapter } from '../src/lib/adapter-contract.ts'
import {
  executeCloudflareAdapter,
  CloudflareAdapter,
  CLOUDFLARE_ADAPTER_SURFACE,
} from '../src/lib/cloudflare-adapter.ts'
import {
  executeD1Adapter,
  D1StorageAdapter,
  D1_ADAPTER_SURFACE,
} from '../src/lib/d1-storage-adapter.ts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCloudflareAEO(targetOverrides = {}) {
  return Object.freeze({
    intent: Object.freeze({ action: 'deploy_worker', purpose: 'bounded worker deployment' }),
    scope: Object.freeze({ worker_name: 'mindshift-demo', max_bundle_kb: 256 }),
    validation: Object.freeze({
      decision_id: 'AUTH-cf-001',
      authority_lineage_hash: 'sha256:cf-lineage-001',
      policy_id: 'cloudflare-deploy-policy-v1',
      policy_hash: 'sha256:cf-policy-001',
      replay_nonce: 'nonce-cf-001',
      aeo_hash_required: true,
      requires_unused_nonce: true,
    }),
    target: Object.freeze({
      system: 'cloudflare_worker',
      worker_url: 'https://api.cloudflare.com/client/v4/accounts/test-acct/workers/scripts/mindshift',
      method: 'PUT',
      path: '/scripts/mindshift-demo',
      request_body_hash: 'sha256:bundle-001',
      ...targetOverrides,
    }),
    finality: Object.freeze({
      proof_required: true,
      proof_type: 'cloudflare_worker_deployment',
      replay_state_after_success: 'CONSUMED',
    }),
  })
}

function makeD1AEO(targetOverrides = {}) {
  return Object.freeze({
    intent: Object.freeze({ action: 'store_proof_receipt', purpose: 'bounded proof storage' }),
    scope: Object.freeze({ database_id: 'd1-mindshift-prod', allowed_tables: ['proof_receipts'] }),
    validation: Object.freeze({
      decision_id: 'AUTH-d1-001',
      authority_lineage_hash: 'sha256:d1-lineage-001',
      policy_id: 'd1-insert-policy-v1',
      policy_hash: 'sha256:d1-policy-001',
      replay_nonce: 'nonce-d1-001',
      aeo_hash_required: true,
      requires_unused_nonce: true,
    }),
    target: Object.freeze({
      system: 'd1',
      database_id: 'd1-mindshift-prod',
      table_name: 'proof_receipts',
      operation: 'INSERT',
      parameter_hash: 'sha256:params-001',
      ...targetOverrides,
    }),
    finality: Object.freeze({
      proof_required: true,
      proof_type: 'd1_storage_execution',
      replay_state_after_success: 'CONSUMED',
    }),
  })
}

const GOOD_CF_EVIDENCE = Object.freeze({
  execution_id: 'ray-abc123def456',
  executed_at: '2026-06-04T00:00:00.000Z',
  adapter_surface: 'cloudflare_worker',
  adapter_specific: Object.freeze({
    status_code: 200,
    response_hash: 'sha256:response-body-001',
    worker_region: 'us-east-1',
  }),
})

const GOOD_D1_EVIDENCE = Object.freeze({
  execution_id: 'query-xyz789',
  executed_at: '2026-06-04T00:00:00.000Z',
  adapter_surface: 'd1',
  adapter_specific: Object.freeze({
    rows_affected: 1,
    table_name: 'proof_receipts',
    operation: 'INSERT',
  }),
})

const EMITTED_AT = '2026-06-04T00:00:00.000Z'

// ── TC-01: null/undefined AEO → NULL_AEO_INPUT ───────────────────────────────

test('TC-01a null AEO returns NULL_AEO_INPUT', () => {
  const out = executeWithAdapter(null, 'sha256:hash', { adapter_surface: 'cf', execute: () => null }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_AEO_INPUT')
  assert.equal(out.null_result.execution_result, 'NULL')
  assert.equal(out.null_result.creates_authority, false)
})

test('TC-01b undefined AEO returns NULL_AEO_INPUT', () => {
  const out = executeWithAdapter(undefined, 'sha256:hash', { adapter_surface: 'cf', execute: () => null }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_AEO_INPUT')
})

// ── TC-02: blank/null validated_object_hash → NULL_VALIDATED_HASH ────────────

test('TC-02a blank validated_object_hash returns NULL_VALIDATED_HASH', () => {
  const out = executeWithAdapter(makeCloudflareAEO(), '', { adapter_surface: 'cf', execute: () => null }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_VALIDATED_HASH')
})

test('TC-02b null validated_object_hash returns NULL_VALIDATED_HASH', () => {
  const out = executeWithAdapter(makeCloudflareAEO(), null, { adapter_surface: 'cf', execute: () => null }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_VALIDATED_HASH')
})

test('TC-02c whitespace-only validated_object_hash returns NULL_VALIDATED_HASH', () => {
  const out = executeWithAdapter(makeCloudflareAEO(), '   ', { adapter_surface: 'cf', execute: () => null }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_VALIDATED_HASH')
})

// ── TC-03: hash mismatch → OBJECT_HASH_MISMATCH, executor never called ────────

test('TC-03a wrong hash returns OBJECT_HASH_MISMATCH', () => {
  const aeo = makeCloudflareAEO()
  const out = executeWithAdapter(aeo, 'sha256:wrong-stale-hash', { adapter_surface: 'cf', execute: () => GOOD_CF_EVIDENCE }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(out.null_result.creates_authority, false)
})

test('TC-03b executor is not called when hash mismatches', () => {
  const aeo = makeCloudflareAEO()
  let executorCalled = false
  const adapter = {
    adapter_surface: 'cf',
    execute: () => { executorCalled = true; return GOOD_CF_EVIDENCE },
  }
  const out = executeWithAdapter(aeo, 'sha256:wrong-hash', adapter, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(executorCalled, false, 'executor must not be called when hash mismatches')
})

test('TC-03c mutated AEO produces hash mismatch', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  // Simulate mutation: a different AEO object (same structure but different field)
  const mutated = makeCloudflareAEO({ path: '/scripts/MUTATED' })
  const out = executeWithAdapter(mutated, hash, { adapter_surface: 'cf', execute: () => GOOD_CF_EVIDENCE }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
})

// ── TC-04: null/missing executor → NULL_EXECUTOR ──────────────────────────────

test('TC-04a null executor returns NULL_EXECUTOR', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeWithAdapter(aeo, hash, null, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_EXECUTOR')
})

test('TC-04b executor without execute method returns NULL_EXECUTOR', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const badAdapter = { adapter_surface: 'cf' }  // missing execute()
  const out = executeWithAdapter(aeo, hash, badAdapter, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'NULL_EXECUTOR')
})

// ── TC-05: executor returning null → EXECUTOR_RETURNED_NULL ──────────────────

test('TC-05 executor returning null returns EXECUTOR_RETURNED_NULL', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cf', execute: () => null }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

// ── TC-06: incomplete evidence → NULL with specific reason ────────────────────

test('TC-06a blank execution_id returns EVIDENCE_MISSING_EXECUTION_ID', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const bad = { ...GOOD_CF_EVIDENCE, execution_id: '' }
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cf', execute: () => bad }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EVIDENCE_MISSING_EXECUTION_ID')
})

test('TC-06b blank executed_at returns EVIDENCE_MISSING_EXECUTED_AT', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const bad = { ...GOOD_CF_EVIDENCE, executed_at: '' }
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cf', execute: () => bad }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EVIDENCE_MISSING_EXECUTED_AT')
})

test('TC-06c evidence surface mismatch returns EVIDENCE_SURFACE_MISMATCH', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const bad = { ...GOOD_CF_EVIDENCE, adapter_surface: 'some_other_surface' }
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cf', execute: () => bad }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EVIDENCE_SURFACE_MISMATCH')
})

test('TC-06d null adapter_specific returns EVIDENCE_ADAPTER_SPECIFIC_NULL', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const bad = { ...GOOD_CF_EVIDENCE, adapter_specific: null }
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cf', execute: () => bad }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EVIDENCE_ADAPTER_SPECIFIC_NULL')
})

test('TC-06e array adapter_specific returns EVIDENCE_ADAPTER_SPECIFIC_NULL', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const bad = { ...GOOD_CF_EVIDENCE, adapter_specific: ['not', 'a', 'record'] }
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cf', execute: () => bad }, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EVIDENCE_ADAPTER_SPECIFIC_NULL')
})

// ── TC-07: successful execution → proof receipt ────────────────────────────────

test('TC-07a valid AEO + valid evidence → proof receipt', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cloudflare_worker', execute: () => GOOD_CF_EVIDENCE }, EMITTED_AT)
  assert.equal(out.ok, true)
  const r = out.receipt
  assert.equal(r.execution_result, 'EXECUTED')
  assert.equal(r.creates_authority, false)
  assert.equal(r.validated_object_hash, hash)
  assert.equal(r.executed_object_hash, hash)
  assert.equal(r.adapter_surface, 'cloudflare_worker')
  assert.match(r.receipt_id, /^sha256:/)
  assert.match(r.execution_evidence_hash, /^sha256:/)
  assert.equal(r.emitted_at, EMITTED_AT)
})

test('TC-07b receipt binds decision_id and replay_nonce from AEO.validation', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cloudflare_worker', execute: () => GOOD_CF_EVIDENCE }, EMITTED_AT)
  assert.equal(out.ok, true)
  assert.equal(out.receipt.decision_id, 'AUTH-cf-001')
  assert.equal(out.receipt.replay_nonce, 'nonce-cf-001')
})

test('TC-07c receipt_id is deterministic for identical inputs', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const adapter = { adapter_surface: 'cloudflare_worker', execute: () => GOOD_CF_EVIDENCE }
  const out1 = executeWithAdapter(aeo, hash, adapter, EMITTED_AT)
  const out2 = executeWithAdapter(aeo, hash, adapter, EMITTED_AT)
  assert.equal(out1.ok, true)
  assert.equal(out2.ok, true)
  assert.equal(out1.receipt.receipt_id, out2.receipt.receipt_id)
})

test('TC-07d validated_object_hash equals executed_object_hash on EXECUTED', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cloudflare_worker', execute: () => GOOD_CF_EVIDENCE }, EMITTED_AT)
  assert.equal(out.ok, true)
  assert.equal(out.receipt.validated_object_hash, out.receipt.executed_object_hash)
})

test('TC-07e execution_evidence_hash is sha256 of canonical evidence', () => {
  const aeo = makeD1AEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'd1', execute: () => GOOD_D1_EVIDENCE }, EMITTED_AT)
  assert.equal(out.ok, true)
  // evidence hash must be a sha256 prefix hash
  assert.match(out.receipt.execution_evidence_hash, /^sha256:[0-9a-f]{64}$/)
})

// ── TC-08: creates_authority is always false ───────────────────────────────────

test('TC-08a NULL result structurally forbids authority creation', () => {
  const out = executeWithAdapter(null, null, null, null)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.creates_authority, false)
})

test('TC-08b proof receipt structurally forbids authority creation', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeWithAdapter(aeo, hash, { adapter_surface: 'cloudflare_worker', execute: () => GOOD_CF_EVIDENCE }, EMITTED_AT)
  assert.equal(out.ok, true)
  assert.equal(out.receipt.creates_authority, false)
})

test('TC-08c all NULL reasons carry creates_authority: false', () => {
  const reasons = [
    executeWithAdapter(null, null, null, null),
    executeWithAdapter(makeCloudflareAEO(), '', null, null),
    executeWithAdapter(makeCloudflareAEO(), 'sha256:wrong', null, null),
  ]
  for (const out of reasons) {
    assert.equal(out.ok, false)
    assert.equal(out.null_result.creates_authority, false)
  }
})

// ── TC-09: Cloudflare adapter ─────────────────────────────────────────────────

test('TC-09a CLOUDFLARE_ADAPTER_SURFACE constant is cloudflare_worker', () => {
  assert.equal(CLOUDFLARE_ADAPTER_SURFACE, 'cloudflare_worker')
})

test('TC-09b CloudflareAdapter instance has correct adapter_surface', () => {
  const adapter = new CloudflareAdapter(() => null)
  assert.equal(adapter.adapter_surface, 'cloudflare_worker')
})

test('TC-09c Cloudflare adapter executes valid CF AEO and passes exact target fields', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  let capturedTarget = null
  const executor = (target) => {
    capturedTarget = target
    return GOOD_CF_EVIDENCE
  }
  const out = executeCloudflareAdapter(aeo, hash, executor, EMITTED_AT)
  assert.equal(out.ok, true)
  assert.equal(capturedTarget.worker_url, aeo.target.worker_url)
  assert.equal(capturedTarget.method, 'PUT')
  assert.equal(capturedTarget.path, '/scripts/mindshift-demo')
  assert.equal(capturedTarget.request_body_hash, 'sha256:bundle-001')
})

test('TC-09d Cloudflare adapter does not pass extra fields to executor', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  let capturedTarget = null
  const executor = (target) => { capturedTarget = target; return GOOD_CF_EVIDENCE }
  executeCloudflareAdapter(aeo, hash, executor, EMITTED_AT)
  // Only the four canonical target fields should be present
  const keys = Object.keys(capturedTarget).sort()
  assert.deepEqual(keys, ['method', 'path', 'request_body_hash', 'worker_url'])
})

test('TC-09e Cloudflare adapter returns NULL for non-cloudflare target system', () => {
  const d1Aeo = makeD1AEO()
  const hash = computeAdapterAEOHash(d1Aeo)
  const out = executeCloudflareAdapter(d1Aeo, hash, () => GOOD_CF_EVIDENCE, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

test('TC-09f Cloudflare adapter returns NULL when executor returns null', () => {
  const aeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeCloudflareAdapter(aeo, hash, () => null, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

test('TC-09g Cloudflare adapter returns NULL for target with missing worker_url', () => {
  const aeo = makeCloudflareAEO({ worker_url: '' })
  const hash = computeAdapterAEOHash(aeo)
  const out = executeCloudflareAdapter(aeo, hash, () => GOOD_CF_EVIDENCE, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

test('TC-09h Cloudflare adapter: OBJECT_HASH_MISMATCH when hash is stale', () => {
  const aeo = makeCloudflareAEO()
  const out = executeCloudflareAdapter(aeo, 'sha256:stale', () => GOOD_CF_EVIDENCE, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
})

// ── TC-10: D1 storage adapter ──────────────────────────────────────────────────

test('TC-10a D1_ADAPTER_SURFACE constant is d1', () => {
  assert.equal(D1_ADAPTER_SURFACE, 'd1')
})

test('TC-10b D1StorageAdapter instance has correct adapter_surface', () => {
  const adapter = new D1StorageAdapter(() => null)
  assert.equal(adapter.adapter_surface, 'd1')
})

test('TC-10c D1 adapter executes valid D1 AEO and passes exact target fields', () => {
  const aeo = makeD1AEO()
  const hash = computeAdapterAEOHash(aeo)
  let capturedTarget = null
  const executor = (target) => {
    capturedTarget = target
    return GOOD_D1_EVIDENCE
  }
  const out = executeD1Adapter(aeo, hash, executor, EMITTED_AT)
  assert.equal(out.ok, true)
  assert.equal(capturedTarget.database_id, 'd1-mindshift-prod')
  assert.equal(capturedTarget.table_name, 'proof_receipts')
  assert.equal(capturedTarget.operation, 'INSERT')
  assert.equal(capturedTarget.parameter_hash, 'sha256:params-001')
})

test('TC-10d D1 adapter does not pass extra fields to executor', () => {
  const aeo = makeD1AEO()
  const hash = computeAdapterAEOHash(aeo)
  let capturedTarget = null
  const executor = (target) => { capturedTarget = target; return GOOD_D1_EVIDENCE }
  executeD1Adapter(aeo, hash, executor, EMITTED_AT)
  const keys = Object.keys(capturedTarget).sort()
  assert.deepEqual(keys, ['database_id', 'operation', 'parameter_hash', 'table_name'])
})

test('TC-10e D1 adapter returns NULL for non-d1 target system', () => {
  const cfAeo = makeCloudflareAEO()
  const hash = computeAdapterAEOHash(cfAeo)
  const out = executeD1Adapter(cfAeo, hash, () => GOOD_D1_EVIDENCE, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

test('TC-10f D1 adapter returns NULL when executor returns null', () => {
  const aeo = makeD1AEO()
  const hash = computeAdapterAEOHash(aeo)
  const out = executeD1Adapter(aeo, hash, () => null, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

test('TC-10g D1 adapter returns NULL for invalid operation type', () => {
  const aeo = makeD1AEO({ operation: 'DROP' })  // not a valid D1Operation
  const hash = computeAdapterAEOHash(aeo)
  const out = executeD1Adapter(aeo, hash, () => GOOD_D1_EVIDENCE, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

test('TC-10h D1 adapter returns NULL for target with blank database_id', () => {
  const aeo = makeD1AEO({ database_id: '' })
  const hash = computeAdapterAEOHash(aeo)
  const out = executeD1Adapter(aeo, hash, () => GOOD_D1_EVIDENCE, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'EXECUTOR_RETURNED_NULL')
})

test('TC-10i D1 adapter: OBJECT_HASH_MISMATCH when hash is stale', () => {
  const aeo = makeD1AEO()
  const out = executeD1Adapter(aeo, 'sha256:stale', () => GOOD_D1_EVIDENCE, EMITTED_AT)
  assert.equal(out.ok, false)
  assert.equal(out.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
})

// ── TC-11: computeAdapterAEOHash is deterministic ─────────────────────────────

test('TC-11a computeAdapterAEOHash is deterministic for same AEO', () => {
  const aeo = makeCloudflareAEO()
  const h1 = computeAdapterAEOHash(aeo)
  const h2 = computeAdapterAEOHash(aeo)
  assert.equal(h1, h2)
  assert.match(h1, /^sha256:[0-9a-f]{64}$/)
})

test('TC-11b computeAdapterAEOHash differs for different AEOs', () => {
  const aeo1 = makeCloudflareAEO()
  const aeo2 = makeCloudflareAEO({ path: '/scripts/different' })
  assert.notEqual(computeAdapterAEOHash(aeo1), computeAdapterAEOHash(aeo2))
})
