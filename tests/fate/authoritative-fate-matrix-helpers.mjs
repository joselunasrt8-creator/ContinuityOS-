// Issue #1936: Authoritative Mutation Surface Fate Suite — shared fate matrix.
//
// Runs the same canonical matrix of fate checks against every
// executeWithAdapter-based mutation-capable execution surface
// (filesystem, cloudflare_worker, d1):
//
//   INVALID_OBJECT_NULL              — malformed AEO shape -> NULL (AEO_SHAPE_INVALID)
//   UNAUTHORIZED_OBJECT_NULL         — blank/missing validated_object_hash -> NULL (NULL_VALIDATED_HASH)
//   MUTATED_AFTER_VALIDATION_NULL    — AEO content mutated after hash was computed -> NULL (OBJECT_HASH_MISMATCH)
//   EXECUTED_HASH_EQUALS_VALIDATED_HASH — on EXECUTED, executed_object_hash === validated_object_hash
//   PROOF_HASH_BOUND_TO_EXECUTED_HASH   — receipt_id varies with executed_object_hash
//   NOTHING_HAPPENS_WITHOUT_VALID    — the underlying executor/writer is never invoked on any NULL branch
//
// REPLAYED_OBJECT_NULL is not part of this generic matrix: executeWithAdapter is
// replay-neutral by design (see src/lib/adapter-contract.ts). Replay protection for
// the filesystem surface is exercised separately via runFilesystemWriteGatewayAction
// + ReplayRegistryPort in the main suite.

import test from 'node:test'
import assert from 'node:assert/strict'
import { computeAdapterAEOHash } from '../../src/lib/adapter-contract.ts'

export const EMITTED_AT = '2026-06-09T00:00:00.000Z'

// callExecute: (aeo, validated_object_hash) => AdapterExecutionOutcome
// resetCallCount / getCallCount: track whether the underlying executor/writer ran
export function runAdapterFateMatrix({ surfaceId, makeAEO, mutateAEO, callExecute, resetCallCount, getCallCount }) {
  test(`[${surfaceId}] INVALID_OBJECT_NULL: AEO with extra top-level field returns NULL`, () => {
    const aeo = makeAEO()
    const malformed = { ...aeo, extra_injected_field: 'injected' }
    const hash = computeAdapterAEOHash(malformed)
    resetCallCount()
    const out = callExecute(malformed, hash)
    assert.equal(out.ok, false)
    assert.equal(out.null_result.null_reason, 'AEO_SHAPE_INVALID')
    assert.equal(out.null_result.execution_result, 'NULL')
    assert.equal(getCallCount(), 0, 'executor must not run for an invalid object')
  })

  test(`[${surfaceId}] INVALID_OBJECT_NULL: AEO missing a required top-level field returns NULL`, () => {
    const aeo = makeAEO()
    const { finality: _dropped, ...incomplete } = aeo
    const hash = computeAdapterAEOHash(incomplete)
    resetCallCount()
    const out = callExecute(incomplete, hash)
    assert.equal(out.ok, false)
    assert.equal(out.null_result.null_reason, 'AEO_SHAPE_INVALID')
    assert.equal(getCallCount(), 0, 'executor must not run for an invalid object')
  })

  test(`[${surfaceId}] UNAUTHORIZED_OBJECT_NULL: blank validated_object_hash returns NULL`, () => {
    const aeo = makeAEO()
    resetCallCount()
    const out = callExecute(aeo, '')
    assert.equal(out.ok, false)
    assert.equal(out.null_result.null_reason, 'NULL_VALIDATED_HASH')
    assert.equal(getCallCount(), 0, 'executor must not run without an authorized hash')
  })

  test(`[${surfaceId}] UNAUTHORIZED_OBJECT_NULL: forged validated_object_hash returns NULL, executor not called`, () => {
    const aeo = makeAEO()
    resetCallCount()
    const out = callExecute(aeo, 'sha256:' + '0'.repeat(64))
    assert.equal(out.ok, false)
    assert.equal(out.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
    assert.equal(getCallCount(), 0, 'executor must not run for a forged/unauthorized hash')
  })

  test(`[${surfaceId}] MUTATED_AFTER_VALIDATION_NULL: AEO mutated after hash computed returns NULL, executor not called`, () => {
    const aeo = makeAEO()
    const hash = computeAdapterAEOHash(aeo)
    const mutated = mutateAEO(aeo)
    resetCallCount()
    const out = callExecute(mutated, hash)
    assert.equal(out.ok, false)
    assert.equal(out.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
    assert.equal(getCallCount(), 0, 'executor must not run when the validated object was mutated')
  })

  test(`[${surfaceId}] EXECUTED_HASH_EQUALS_VALIDATED_HASH: executed_object_hash === validated_object_hash`, () => {
    const aeo = makeAEO()
    const hash = computeAdapterAEOHash(aeo)
    resetCallCount()
    const out = callExecute(aeo, hash)
    assert.equal(out.ok, true)
    assert.equal(out.receipt.execution_result, 'EXECUTED')
    assert.equal(out.receipt.validated_object_hash, hash)
    assert.equal(out.receipt.executed_object_hash, hash)
    assert.equal(out.receipt.validated_object_hash, out.receipt.executed_object_hash)
    assert.equal(getCallCount(), 1, 'executor must run exactly once for a valid object')
  })

  test(`[${surfaceId}] PROOF_HASH_BOUND_TO_EXECUTED_HASH: receipt_id changes when executed_object_hash changes`, () => {
    const aeoA = makeAEO()
    const hashA = computeAdapterAEOHash(aeoA)
    const outA = callExecute(aeoA, hashA)

    const aeoB = mutateAEO(aeoA)
    const hashB = computeAdapterAEOHash(aeoB)
    const outB = callExecute(aeoB, hashB)

    assert.equal(outA.ok, true)
    assert.equal(outB.ok, true)
    assert.notEqual(hashA, hashB, 'fixture mutation must change the AEO hash')
    assert.notEqual(outA.receipt.executed_object_hash, outB.receipt.executed_object_hash)
    assert.notEqual(outA.receipt.receipt_id, outB.receipt.receipt_id,
      'proof hash (receipt_id) must be bound to executed_object_hash')
  })

  test(`[${surfaceId}] NOTHING_HAPPENS_WITHOUT_VALID: executor never invoked across all NULL branches`, () => {
    const aeo = makeAEO()
    const hash = computeAdapterAEOHash(aeo)
    const malformed = { ...aeo, extra_injected_field: 'injected' }
    const mutated = mutateAEO(aeo)

    resetCallCount()
    callExecute(null, hash)
    callExecute(malformed, computeAdapterAEOHash(malformed))
    callExecute(aeo, '')
    callExecute(aeo, 'sha256:' + '0'.repeat(64))
    callExecute(mutated, hash)
    assert.equal(getCallCount(), 0, 'no NULL branch may invoke the underlying executor/writer')
  })
}
