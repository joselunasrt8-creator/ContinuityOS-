export type LineageStage = "compile" | "validate" | "execute" | "proof"

export type LineageOriginFailureReason =
  | "invalid_compile_lineage"
  | "invalid_validation_lineage"
  | "invalid_execution_lineage"
  | "orphan_validation_lineage"
  | "orphan_execution_lineage"
  | "orphan_proof_lineage"
  | "lineage_stage_mismatch"
  | "lineage_origin_mismatch"

export type LineageOriginVerification = { ok: true } | { ok: false, reason: LineageOriginFailureReason }

export function canonicalLineageHash(input: { lineage_stage: LineageStage, decision_id: string, validated_object_hash: string, parent_hash: string }): string {
  return JSON.stringify({
    lineage_stage: input.lineage_stage,
    decision_id: input.decision_id,
    validated_object_hash: input.validated_object_hash,
    parent_hash: input.parent_hash,
  })
}

export function verifyLineageOrigin(input: {
  stage: Exclude<LineageStage, "compile">
  decision_id: string
  validated_object_hash: string
  lineage_stage: string
  lineage_origin_hash: string
  parent_compilation_hash?: string
  parent_validation_hash?: string
  parent_execution_hash?: string
  compiled_hash?: string
  validation_hash?: string
  execution_hash?: string
}): LineageOriginVerification {
  if (input.lineage_stage !== input.stage) return { ok: false, reason: "lineage_stage_mismatch" }
  if (input.stage === "validate") {
    if (!input.compiled_hash) return { ok: false, reason: "orphan_validation_lineage" }
    if (!input.parent_compilation_hash || input.parent_compilation_hash !== input.compiled_hash) return { ok: false, reason: "invalid_compile_lineage" }
    const expected = canonicalLineageHash({ lineage_stage: "validate", decision_id: input.decision_id, validated_object_hash: input.validated_object_hash, parent_hash: input.parent_compilation_hash })
    if (input.lineage_origin_hash !== expected) return { ok: false, reason: "lineage_origin_mismatch" }
    return { ok: true }
  }
  if (input.stage === "execute") {
    if (!input.validation_hash) return { ok: false, reason: "orphan_execution_lineage" }
    if (!input.parent_validation_hash || input.parent_validation_hash !== input.validation_hash) return { ok: false, reason: "invalid_validation_lineage" }
    const expected = canonicalLineageHash({ lineage_stage: "execute", decision_id: input.decision_id, validated_object_hash: input.validated_object_hash, parent_hash: input.parent_validation_hash })
    if (input.lineage_origin_hash !== expected) return { ok: false, reason: "lineage_origin_mismatch" }
    return { ok: true }
  }
  if (!input.execution_hash) return { ok: false, reason: "orphan_proof_lineage" }
  if (!input.parent_execution_hash || input.parent_execution_hash !== input.execution_hash) return { ok: false, reason: "invalid_execution_lineage" }
  const expected = canonicalLineageHash({ lineage_stage: "proof", decision_id: input.decision_id, validated_object_hash: input.validated_object_hash, parent_hash: input.parent_execution_hash })
  if (input.lineage_origin_hash !== expected) return { ok: false, reason: "lineage_origin_mismatch" }
  return { ok: true }
}
