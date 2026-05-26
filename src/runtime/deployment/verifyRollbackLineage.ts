export type RollbackLineageInput = {
  prior_deployment_proof_id: string
  prior_artifact_hash: string
  prior_workflow_hash: string
  prior_commit_sha: string
  rollback_artifact_hash: string
  rollback_workflow_hash: string
  rollback_commit_sha: string
  rollback_lineage_hash?: string
  existing_rollback_proof_binding_hash?: string
}

export type RollbackLineageFailureReason =
  | "missing_prior_deployment_proof"
  | "missing_prior_workflow_hash"
  | "rollback_artifact_mismatch"
  | "rollback_commit_sha_mismatch"
  | "rollback_lineage_drift"
  | "rollback_proof_replayed"
  | "invalid_rollback_target"

export type RollbackLineageVerification =
  | { ok: true; rollback_lineage_hash: string }
  | { ok: false; reason: RollbackLineageFailureReason }

export function canonicalRollbackLineageHash(input: {
  prior_deployment_proof_id: string
  rollback_artifact_hash: string
  rollback_workflow_hash: string
  rollback_commit_sha: string
}): string {
  return JSON.stringify({
    prior_deployment_proof_id: input.prior_deployment_proof_id,
    rollback_artifact_hash: input.rollback_artifact_hash,
    rollback_workflow_hash: input.rollback_workflow_hash,
    rollback_commit_sha: input.rollback_commit_sha,
  })
}

export function verifyRollbackLineage(input: RollbackLineageInput): RollbackLineageVerification {
  if (!String(input.prior_deployment_proof_id || "").trim()) {
    return { ok: false, reason: "missing_prior_deployment_proof" }
  }
  if (!String(input.prior_workflow_hash || "").trim()) {
    return { ok: false, reason: "missing_prior_workflow_hash" }
  }
  if (
    !String(input.rollback_artifact_hash || "").trim() ||
    !String(input.rollback_workflow_hash || "").trim() ||
    !String(input.rollback_commit_sha || "").trim()
  ) {
    return { ok: false, reason: "invalid_rollback_target" }
  }

  if (String(input.rollback_workflow_hash) !== String(input.prior_workflow_hash)) {
    return { ok: false, reason: "invalid_rollback_target" }
  }
  if (String(input.rollback_artifact_hash) !== String(input.prior_artifact_hash)) {
    return { ok: false, reason: "rollback_artifact_mismatch" }
  }
  if (String(input.rollback_commit_sha) !== String(input.prior_commit_sha)) {
    return { ok: false, reason: "rollback_commit_sha_mismatch" }
  }

  const rollback_lineage_hash = canonicalRollbackLineageHash({
    prior_deployment_proof_id: input.prior_deployment_proof_id,
    rollback_artifact_hash: input.rollback_artifact_hash,
    rollback_workflow_hash: input.rollback_workflow_hash,
    rollback_commit_sha: input.rollback_commit_sha,
  })

  if (
    String(input.rollback_lineage_hash || "") &&
    String(input.rollback_lineage_hash) !== rollback_lineage_hash
  ) {
    return { ok: false, reason: "rollback_lineage_drift" }
  }

  if (
    String(input.existing_rollback_proof_binding_hash || "") &&
    String(input.existing_rollback_proof_binding_hash) === rollback_lineage_hash
  ) {
    return { ok: false, reason: "rollback_proof_replayed" }
  }

  return { ok: true, rollback_lineage_hash }
}
