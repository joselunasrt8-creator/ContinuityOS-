// Issue #1890: Enforce first runtime Agent Tool Gateway action — filesystem write.
//
// This module wires the previously-isolated filesystem-write chain into a single
// MANDATORY runtime path. Before this module existed, captureFilesystemWriteATAO,
// compileFilesystemWriteAEO, validateFilesystemAEO, and executeFilesystemWrite were
// complete, fail-closed, and independently unit-tested — but nothing composed them
// into one path, and nothing in the runtime invoked them (see
// docs/audits/agent-tool-execution-runtime-closure-audit.md, GAP-RT-2).
//
// runFilesystemWriteGatewayAction is now the ONLY function in this codebase that can
// produce an EXECUTED filesystem-write proof. It does so by calling each stage in
// strict sequence and refusing to proceed past any stage that does not succeed:
//
//   raw input
//   → captureFilesystemWriteATAO   (no ATAO → NULL, stage="capture")
//   → compileFilesystemWriteAEO    (no AEO → NULL, stage="compile")
//   → validateFilesystemAEO        (not VALID → NULL, stage="validate")
//   → executeFilesystemWrite       (exact-object boundary → EXECUTED | NULL)
//
// There is no branch, parameter, or code path through this function that reaches
// the executor without first holding a captured ATAO, a compiled AEO, and a VALID
// Ω-validator result bound to that exact AEO's hash. This is what makes the chain
// "mandatory" rather than merely "available": the composition itself is the gate.
//
// Non-goals (unchanged from the underlying chain):
//   no authority creation · no replay state mutation by this function ·
//   no multi-adapter routing · no shell/network/deploy surfaces

import type { DenialResult, FilesystemValidatorContext } from './filesystem-aeo-validator.js'
import { validateFilesystemAEO } from './filesystem-aeo-validator.js'
import {
  captureFilesystemWriteATAO,
  compileFilesystemWriteAEO,
  executeFilesystemWrite,
} from './filesystem-write-gateway.js'
import type {
  FilesystemWriteATAOBinding,
  FilesystemWriteATAOInput,
  FilesystemWriteExecutionProof,
  FilesystemWriteExecutor,
} from './filesystem-write-gateway.js'

export type FilesystemWriteGatewayActionInput = {
  readonly atao_input: FilesystemWriteATAOInput | null | undefined
  readonly binding: FilesystemWriteATAOBinding | null | undefined
  readonly validator_context: FilesystemValidatorContext
  readonly executor: FilesystemWriteExecutor
  readonly emitted_at: string
}

export type FilesystemWriteGatewayStage = 'capture' | 'compile' | 'validate' | 'execute'

export type FilesystemWriteGatewayActionResult =
  | {
      readonly result: 'EXECUTED'
      readonly proof: FilesystemWriteExecutionProof
    }
  | {
      readonly result: 'NULL'
      readonly stage: FilesystemWriteGatewayStage
      readonly reason: string
      readonly proof: FilesystemWriteExecutionProof | null
      readonly validator_denial: DenialResult | null
    }

function nullAtStage(
  stage: FilesystemWriteGatewayStage,
  reason: string,
  extra: { proof?: FilesystemWriteExecutionProof | null; validator_denial?: DenialResult | null } = {},
): FilesystemWriteGatewayActionResult {
  return {
    result: 'NULL',
    stage,
    reason,
    proof: extra.proof ?? null,
    validator_denial: extra.validator_denial ?? null,
  }
}

// runFilesystemWriteGatewayAction: the mandatory gateway path.
//
// Fails closed at every stage — null/undefined input, capture failure, compile
// failure, a non-VALID validator result, or an execution-boundary NULL all return
// a structured NULL outcome and never reach (or never invoke) the executor.
//
// The only way to obtain execution_result === "EXECUTED" from this function is to
// hold inputs that survive ATAO capture, AEO compilation, and Ω validation — in
// that order — and whose compiled-AEO hash is the exact hash the validator approved.
export async function runFilesystemWriteGatewayAction(
  input: FilesystemWriteGatewayActionInput | null | undefined,
): Promise<FilesystemWriteGatewayActionResult> {
  if (!input) return nullAtStage('capture', 'NULL_GATEWAY_INPUT')
  if (!input.validator_context) return nullAtStage('validate', 'NULL_VALIDATOR_CONTEXT')
  if (typeof input.executor !== 'function') return nullAtStage('execute', 'NULL_EXECUTOR')
  if (typeof input.emitted_at !== 'string' || input.emitted_at.trim().length === 0) {
    return nullAtStage('capture', 'NULL_EMITTED_AT')
  }

  // Stage 1 — ATAO capture: non-operative, creates no authority or execution eligibility.
  // A request that cannot form a valid ATAO never produces an AEO, never reaches the
  // validator, and never reaches the executor.
  const atao = captureFilesystemWriteATAO(input.atao_input)
  if (!atao) return nullAtStage('capture', 'ATAO_CAPTURE_FAILED')

  // Stage 2 — AEO compilation: ATAO + authority binding → exact validator candidate.
  // Compilation does not validate, execute, or authorize — it only forms the object
  // the Ω validator will judge.
  const aeo = compileFilesystemWriteAEO(atao, input.binding)
  if (!aeo) return nullAtStage('compile', 'AEO_COMPILE_FAILED', { /* no AEO exists yet */ })

  // Stage 3 — Ω validation: the exact compiled AEO is judged VALID or NULL.
  // Only a VALID result carries an aeo_hash forward — that hash is the one and only
  // validated_object_hash the execution boundary will accept.
  const validation = await validateFilesystemAEO(aeo, input.validator_context)
  if (validation.result !== 'VALID') {
    return nullAtStage('validate', validation.denial_result.denial_reason, {
      validator_denial: validation.denial_result,
    })
  }

  // Stage 4 — Execution boundary: the adapter is invoked only now, only with the
  // exact AEO that was validated, and only bound to the exact hash the validator
  // returned. executeFilesystemWrite independently recomputes the hash and refuses
  // to call the executor on any mismatch (validated_object_hash == executed_object_hash).
  const proof = executeFilesystemWrite({
    aeo,
    validated_object_hash: validation.aeo_hash,
    atao,
    executor: input.executor,
    emitted_at: input.emitted_at,
  })
  if (!proof) return nullAtStage('execute', 'EXECUTION_BOUNDARY_REJECTED')

  if (proof.execution_result === 'EXECUTED') {
    return { result: 'EXECUTED', proof }
  }
  return nullAtStage('execute', proof.null_reason ?? 'EXECUTION_NULL', { proof })
}
