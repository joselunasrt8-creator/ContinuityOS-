// Issue #1890: Enforce first runtime Agent Tool Gateway action — filesystem write.
// Issue #1928: Insert canonical validateAeo gateway stage (Approach B).
// Issue #1931: Replay Registry Boundary — route replay eligibility through ReplayRegistryPort.
//
// runFilesystemWriteGatewayAction is the ONLY function in this codebase that can
// produce an EXECUTED filesystem-write proof. It does so by calling each stage in
// strict sequence and refusing to proceed past any stage that does not succeed:
//
//   raw input
//   → captureFilesystemWriteATAO             (no ATAO → NULL, stage="capture")
//   → compileFilesystemWriteAEO              (no AEO → NULL, stage="compile")
//   → compileCanonicalAEOFromFilesystem      (NULL → stage="canonical")
//   → validateAeo(canonicalAEO, context)     (not VALID → NULL, stage="canonical")
//   → ReplayRegistryPort.isNonceUnused       (consumed → NULL, stage="replay")
//   → validateFilesystemAEO(filesystemAEO)   (not VALID → NULL, stage="validate")
//   → executeFilesystemAdapter(canonicalAEO, canonical_aeo_hash)
//                                            (exact-object boundary → EXECUTED | NULL)
//   → ReplayRegistryPort.markNonceConsumed   (REJECTED → EXECUTED_UNCOMMITTED)
//
// canonical_aeo_hash is the sha256 of the CanonicalAEO (with validation.object_hash set).
// It is passed as validated_object_hash to executeWithAdapter, which recomputes the hash
// of the CanonicalAEO at the boundary and requires them to match (exact-object invariant).
// proof.validated_object_hash == proof.executed_object_hash == canonical_aeo_hash.
//
// validateAeo and validateFilesystemAEO are not modified. Rust/TS conformance unchanged.
//
// Non-goals (unchanged from the underlying chain):
//   no authority creation · no reservation semantics · no lineage/proof batching ·
//   no multi-adapter routing · no shell/network/deploy surfaces

import type { DenialResult, FilesystemValidatorContext } from './filesystem-aeo-validator.js'
import { validateFilesystemAEO } from './filesystem-aeo-validator.js'
import {
  captureFilesystemWriteATAO,
  compileFilesystemWriteAEO,
} from './filesystem-write-gateway.js'
import type {
  FilesystemWriteATAOBinding,
  FilesystemWriteATAOInput,
} from './filesystem-write-gateway.js'
import type { AdapterProofReceipt, AdapterTargetedAEO } from './adapter-contract.js'
import { executeFilesystemAdapter } from './filesystem-execution-adapter.js'
import type { FilesystemWriter } from './filesystem-execution-adapter.js'
import { compileCanonicalAEOFromFilesystem } from './compile-canonical-aeo.js'
// validateAeo: existing continuity-core canonical gateway — not modified.
// Mirrors Rust validate_aeo(); governed by V3_CONFORMANCE_SPEC and fixtures/conformance/.
import { validateAeo } from '../continuity-core.js'
import type { ReplayRegistryPort } from './storage-adapter.js'

// Intent: pure data from the agent/caller — no adapter context, no runtime handles.
export type FilesystemWriteIntentInput = {
  readonly atao_input: FilesystemWriteATAOInput | null | undefined
  readonly binding: FilesystemWriteATAOBinding | null | undefined
}

// Context: provided by the adapter shell (src/index.ts).
// The kernel never receives: Request, Response, URL, headers, env, D1Database,
// HTTP method, route path, or any Cloudflare-specific handle. These fields
// are adapter-boundary constructs: validator_context wraps D1 reads behind
// read-only interfaces; writer wraps the write side-effect behind a synchronous
// contract; replay_registry wraps nonce persistence behind ReplayRegistryPort;
// emitted_at is a plain ISO string.
export type FilesystemWriteKernelContext = {
  readonly validator_context: FilesystemValidatorContext
  readonly writer: FilesystemWriter
  readonly replay_registry: ReplayRegistryPort
  readonly emitted_at: string
}

// Backward-compatibility alias. Not imported anywhere outside this file (confirmed).
// Retained as a migration marker; will be removed in a subsequent cleanup pass.
export type FilesystemWriteGatewayActionInput = FilesystemWriteIntentInput & FilesystemWriteKernelContext

export type FilesystemWriteGatewayStage = 'capture' | 'compile' | 'canonical' | 'replay' | 'validate' | 'execute'

export type FilesystemWriteGatewayActionResult =
  | {
      readonly result: 'EXECUTED'
      readonly receipt: AdapterProofReceipt
      readonly atao_id: string
    }
  | {
      // Execution occurred and proof was issued, but nonce consumption was rejected by the
      // registry. replay state ≠ executed state. The proof receipt is still valid evidence.
      readonly result: 'EXECUTED_UNCOMMITTED'
      readonly receipt: AdapterProofReceipt
      readonly atao_id: string
    }
  | {
      readonly result: 'NULL'
      readonly stage: FilesystemWriteGatewayStage
      readonly reason: string
      readonly receipt: AdapterProofReceipt | null
      readonly validator_denial: DenialResult | null
    }

function nullAtStage(
  stage: FilesystemWriteGatewayStage,
  reason: string,
  extra: { receipt?: AdapterProofReceipt | null; validator_denial?: DenialResult | null } = {},
): FilesystemWriteGatewayActionResult {
  return {
    result: 'NULL',
    stage,
    reason,
    receipt: extra.receipt ?? null,
    validator_denial: extra.validator_denial ?? null,
  }
}

// runFilesystemWriteGatewayAction: the mandatory gateway path.
//
// Fails closed at every stage — null/undefined input, capture failure, compile
// failure, a consumed nonce, a non-VALID validator result, or an execution-boundary
// NULL all return a structured NULL outcome and never reach (or never invoke) the writer.
//
// The only way to obtain result === "EXECUTED" from this function is to hold inputs
// that survive ATAO capture, AEO compilation, replay eligibility, and Ω validation —
// in that order — and whose compiled-AEO hash is the exact hash the validator approved,
// and whose nonce is confirmed consumed by the replay registry after execution.
export async function runFilesystemWriteGatewayAction(
  intent: FilesystemWriteIntentInput | null | undefined,
  context: FilesystemWriteKernelContext,
): Promise<FilesystemWriteGatewayActionResult> {
  if (!intent) return nullAtStage('capture', 'NULL_GATEWAY_INPUT')
  if (!context.validator_context) return nullAtStage('validate', 'NULL_VALIDATOR_CONTEXT')
  if (typeof context.writer !== 'function') return nullAtStage('execute', 'NULL_WRITER')
  if (!context.replay_registry || typeof context.replay_registry.isNonceUnused !== 'function') {
    return nullAtStage('replay', 'NULL_REPLAY_REGISTRY')
  }
  if (typeof context.emitted_at !== 'string' || context.emitted_at.trim().length === 0) {
    return nullAtStage('capture', 'NULL_EMITTED_AT')
  }

  // Stage 1 — ATAO capture: non-operative, creates no authority or execution eligibility.
  // A request that cannot form a valid ATAO never produces an AEO, never reaches the
  // validator, and never reaches the writer.
  const atao = captureFilesystemWriteATAO(intent.atao_input)
  if (!atao) return nullAtStage('capture', 'ATAO_CAPTURE_FAILED')

  // Stage 2 — AEO compilation: ATAO + authority binding → FilesystemAEO candidate.
  // Compilation does not validate, execute, or authorize.
  const aeo = compileFilesystemWriteAEO(atao, intent.binding)
  if (!aeo) return nullAtStage('compile', 'AEO_COMPILE_FAILED')

  // Stage 3 — Canonical projection: FilesystemAEO → CanonicalAEO + context.
  // Projects the FilesystemAEO into the five-section canonical shape required by
  // the existing continuity-core validateAeo contract. canonical_authority_id is
  // derived from authority_lineage_hash as a projection identity, not authority creation.
  const canonicalResult = compileCanonicalAEOFromFilesystem(aeo)
  if (!canonicalResult.ok) return nullAtStage('canonical', canonicalResult.denial_reason)

  // Stage 4 — Canonical validation: validateAeo judges the CanonicalAEO VALID or NULL.
  // Uses the existing continuity-core validateAeo unchanged (src/continuity-core.js).
  // Checks: exact 5-field shape, authority_id on all sections, scope bounds containment,
  // and validation.object_hash integrity. Writer is never called if this returns NULL.
  const canonicalDecision = validateAeo(canonicalResult.canonical_aeo, canonicalResult.context)
  if (canonicalDecision !== 'VALID') {
    return nullAtStage('canonical', 'CANONICAL_VALIDATION_NULL')
  }

  // Stage 5 — Replay eligibility: kernel explicitly checks nonce freshness via port.
  // ReplayRegistryPort is the only path to nonce state; D1 SQL is hidden behind it.
  // validateFilesystemAEO also checks replay state internally (defense-in-depth).
  const replay_nonce = canonicalResult.canonical_aeo.validation.replay_nonce
  const nonceUnused = await context.replay_registry.isNonceUnused(replay_nonce)
  if (!nonceUnused) return nullAtStage('replay', 'REPLAY_NONCE_CONSUMED')

  // Stage 6 — Ω validation: validateFilesystemAEO judges the FilesystemAEO VALID or NULL.
  // Runs the full 10-step pipeline (authority, policy, path/op, replay, pre-state, diff,
  // finality). This stage is NOT bypassed by the canonical validation or replay check above.
  const omegaValidation = await validateFilesystemAEO(aeo, context.validator_context)
  if (omegaValidation.result !== 'VALID') {
    return nullAtStage('validate', omegaValidation.denial_result.denial_reason, {
      validator_denial: omegaValidation.denial_result,
    })
  }

  // Stage 7 — Execution boundary: CanonicalAEO is passed to executeWithAdapter with
  // canonical_aeo_hash as validated_object_hash. executeWithAdapter recomputes the hash
  // of the CanonicalAEO at the boundary and requires it to match (exact-object invariant).
  // proof.validated_object_hash == proof.executed_object_hash == canonical_aeo_hash.
  //
  // The CanonicalAEO is cast to AdapterTargetedAEO: the TypeScript type does not match,
  // but the runtime contract is satisfied — the object has exactly 5 keys, target.system
  // is "filesystem", and validation.decision_id / validation.replay_nonce are present for
  // proof receipt construction. FilesystemExecutionAdapter reads target.path and
  // target.operation from the CanonicalAEO, both projected from the FilesystemAEO.
  //
  // content is taken from the captured ATAO — the exact bytes approved by the Ω validator.
  const content = atao.proposed_action.parameters.content
  const outcome = executeFilesystemAdapter(
    canonicalResult.canonical_aeo as unknown as AdapterTargetedAEO,
    canonicalResult.canonical_aeo_hash,
    content,
    context.writer,
    context.emitted_at,
  )

  if (!outcome.ok) return nullAtStage('execute', outcome.null_result.null_reason)

  // Stage 8 — Nonce consumption: mark the nonce consumed via ReplayRegistryPort.
  // execution occurred ≠ replay state committed — these are distinct outcomes.
  const commitResult = await context.replay_registry.markNonceConsumed(
    replay_nonce,
    outcome.receipt.decision_id,
  )
  if (commitResult.status === 'REJECTED') {
    return { result: 'EXECUTED_UNCOMMITTED', receipt: outcome.receipt, atao_id: atao.atao_id }
  }

  return { result: 'EXECUTED', receipt: outcome.receipt, atao_id: atao.atao_id }
}
