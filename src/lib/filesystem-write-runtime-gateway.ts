// Issue #1890: Enforce first runtime Agent Tool Gateway action — filesystem write.
// Updated for Execution Adapter Boundary: Stage 4 now routes through
// executeFilesystemAdapter + executeWithAdapter (the generic boundary gate)
// instead of executeFilesystemWrite. The result type carries AdapterProofReceipt.
//
// runFilesystemWriteGatewayAction is the ONLY function in this codebase that can
// produce an EXECUTED filesystem-write proof. It does so by calling each stage in
// strict sequence and refusing to proceed past any stage that does not succeed:
//
//   raw input
//   → captureFilesystemWriteATAO   (no ATAO → NULL, stage="capture")
//   → compileFilesystemWriteAEO    (no AEO → NULL, stage="compile")
//   → validateFilesystemAEO        (not VALID → NULL, stage="validate")
//   → executeFilesystemAdapter     (exact-object boundary → EXECUTED | NULL)
//
// There is no branch, parameter, or code path through this function that reaches
// the writer without first holding a captured ATAO, a compiled AEO, and a VALID
// Ω-validator result bound to that exact AEO's hash.
//
// Non-goals (unchanged from the underlying chain):
//   no authority creation · no replay state mutation by this function ·
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
import type { AdapterProofReceipt } from './adapter-contract.js'
import { executeFilesystemAdapter } from './filesystem-execution-adapter.js'
import type { FilesystemWriter } from './filesystem-execution-adapter.js'
import type { ContinuityStorageAdapter } from './storage-adapter.js'
import { validateAeo } from '../continuity-core.js'

// Intent: pure data from the agent/caller — no adapter context, no runtime handles.
export type FilesystemWriteIntentInput = {
  readonly atao_input: FilesystemWriteATAOInput | null | undefined
  readonly binding: FilesystemWriteATAOBinding | null | undefined
}

// Context: provided by the adapter shell (src/index.ts).
// The kernel never receives: Request, Response, URL, headers, env, D1Database,
// HTTP method, route path, or any Cloudflare-specific handle. These three fields
// are adapter-boundary constructs: validator_context wraps D1 reads behind
// read-only interfaces; writer wraps the write side-effect behind a synchronous
// contract; emitted_at is a plain ISO string.
//
// storageAdapter: optional for incremental wiring — the route adapter passes
// initializeD1RegistryAdapter(env.DB) here so pre-fetch and post-commit use
// the abstract interface rather than direct D1 handles.
export type FilesystemWriteKernelContext = {
  readonly validator_context: FilesystemValidatorContext
  readonly writer: FilesystemWriter
  readonly emitted_at: string
  readonly storageAdapter?: ContinuityStorageAdapter | null
}

// Backward-compatibility alias. Not imported anywhere outside this file (confirmed).
// Retained as a migration marker; will be removed in a subsequent cleanup pass.
export type FilesystemWriteGatewayActionInput = FilesystemWriteIntentInput & FilesystemWriteKernelContext

export type FilesystemWriteGatewayStage = 'capture' | 'compile' | 'validate' | 'execute'

export type FilesystemWriteGatewayActionResult =
  | {
      readonly result: 'EXECUTED'
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
// failure, a non-VALID validator result, or an execution-boundary NULL all return
// a structured NULL outcome and never reach (or never invoke) the writer.
//
// The only way to obtain execution_result === "EXECUTED" from this function is to
// hold inputs that survive ATAO capture, AEO compilation, and Ω validation — in
// that order — and whose compiled-AEO hash is the exact hash the validator approved.
export async function runFilesystemWriteGatewayAction(
  intent: FilesystemWriteIntentInput | null | undefined,
  context: FilesystemWriteKernelContext,
): Promise<FilesystemWriteGatewayActionResult> {
  if (!intent) return nullAtStage('capture', 'NULL_GATEWAY_INPUT')
  if (!context.validator_context) return nullAtStage('validate', 'NULL_VALIDATOR_CONTEXT')
  if (typeof context.writer !== 'function') return nullAtStage('execute', 'NULL_WRITER')
  if (typeof context.emitted_at !== 'string' || context.emitted_at.trim().length === 0) {
    return nullAtStage('capture', 'NULL_EMITTED_AT')
  }

  // Stage 1 — ATAO capture: non-operative, creates no authority or execution eligibility.
  // A request that cannot form a valid ATAO never produces an AEO, never reaches the
  // validator, and never reaches the writer.
  const atao = captureFilesystemWriteATAO(intent.atao_input)
  if (!atao) return nullAtStage('capture', 'ATAO_CAPTURE_FAILED')

  // Stage 2 — AEO compilation: ATAO + authority binding → exact validator candidate.
  // Compilation does not validate, execute, or authorize — it only forms the object
  // the Ω validator will judge.
  const aeo = compileFilesystemWriteAEO(atao, intent.binding)
  if (!aeo) return nullAtStage('compile', 'AEO_COMPILE_FAILED')

  // Stage 2.5 — continuity-core structural gate: the compiled AEO must pass core
  // structural validation before the surface-specific Ω validator runs.
  // validateAeo enforces: exactly 5 required top-level fields, each a non-array
  // plain object. Full hash enforcement (validation.object_hash) and scope bounds
  // enforcement (scope.bounds + maximum_scope) activate when FilesystemAEO carries
  // those fields — until then, executeWithAdapter enforces the hash invariant and
  // the Ω validator enforces scope/policy.
  if (validateAeo(aeo, {}) !== 'VALID') return nullAtStage('compile', 'CORE_AEO_VALIDATION_FAILED')

  // Stage 3 — Ω validation: the exact compiled AEO is judged VALID or NULL.
  // Only a VALID result carries an aeo_hash forward — that hash is the one and only
  // validated_object_hash the execution boundary will accept.
  const validation = await validateFilesystemAEO(aeo, context.validator_context)
  if (validation.result !== 'VALID') {
    return nullAtStage('validate', validation.denial_result.denial_reason, {
      validator_denial: validation.denial_result,
    })
  }

  // Stage 4 — Execution boundary: FilesystemExecutionAdapter is invoked only now,
  // only with the exact AEO that was validated, and only bound to the exact hash the
  // validator returned. executeWithAdapter (called inside executeFilesystemAdapter)
  // independently recomputes the hash and refuses to call the writer on any mismatch
  // (validated_object_hash == executed_object_hash).
  //
  // content is taken from the captured ATAO — the exact bytes whose hash the Ω
  // validator approved via proposed_diff_hash. The adapter never re-derives content.
  const content = atao.proposed_action.parameters.content
  const outcome = executeFilesystemAdapter(
    aeo,
    validation.aeo_hash,
    content,
    context.writer,
    context.emitted_at,
  )

  if (!outcome.ok) return nullAtStage('execute', outcome.null_result.null_reason)
  return { result: 'EXECUTED', receipt: outcome.receipt, atao_id: atao.atao_id }
}
