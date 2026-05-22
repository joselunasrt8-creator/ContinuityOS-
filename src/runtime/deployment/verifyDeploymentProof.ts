export type DeploymentProofRecord = {
  deployment_proof_id: string
  workflow_hash: string
  artifact_hash: string
  commit_sha: string
  deployment_environment: string
  provenance_lineage_hash: string
  proof_binding_hash: string
}

export type DeploymentProofFailureReason =
  | "missing_workflow_hash"
  | "missing_artifact_hash"
  | "missing_commit_sha"
  | "missing_deployment_environment"
  | "missing_provenance_lineage"
  | "proof_binding_hash_mismatch"
  | "replayed_deployment_proof"
  | "stale_workflow_deployment"
  | "artifact_hash_mismatch"
  | "commit_sha_mismatch"
  | "deployment_lineage_drift"

export type DeploymentProofVerification =
  | { ok: true; proof_binding_hash: string }
  | { ok: false; reason: DeploymentProofFailureReason }

export function canonicalProofBindingHash(input: {
  workflow_hash: string
  artifact_hash: string
  commit_sha: string
  deployment_environment: string
  provenance_lineage_hash: string
}): string {
  return JSON.stringify({
    workflow_hash: input.workflow_hash,
    artifact_hash: input.artifact_hash,
    commit_sha: input.commit_sha,
    deployment_environment: input.deployment_environment,
    provenance_lineage_hash: input.provenance_lineage_hash,
  })
}

export function verifyDeploymentProof(input: {
  candidate: Partial<DeploymentProofRecord>
  prior_proof?: Partial<DeploymentProofRecord> | null
}): DeploymentProofVerification {
  const { candidate } = input
  if (!String(candidate.workflow_hash || "").trim()) return { ok: false, reason: "missing_workflow_hash" }
  if (!String(candidate.artifact_hash || "").trim()) return { ok: false, reason: "missing_artifact_hash" }
  if (!String(candidate.commit_sha || "").trim()) return { ok: false, reason: "missing_commit_sha" }
  if (!String(candidate.deployment_environment || "").trim()) return { ok: false, reason: "missing_deployment_environment" }
  if (!String(candidate.provenance_lineage_hash || "").trim()) return { ok: false, reason: "missing_provenance_lineage" }

  if (input.prior_proof) {
    const prior = input.prior_proof
    if (String(prior.workflow_hash || "") && String(prior.workflow_hash || "") !== String(candidate.workflow_hash || "")) {
      return { ok: false, reason: "stale_workflow_deployment" }
    }
    if (String(prior.artifact_hash || "") && String(prior.artifact_hash || "") !== String(candidate.artifact_hash || "")) {
      return { ok: false, reason: "artifact_hash_mismatch" }
    }
    if (String(prior.commit_sha || "") && String(prior.commit_sha || "") !== String(candidate.commit_sha || "")) {
      return { ok: false, reason: "commit_sha_mismatch" }
    }
    if (
      String(prior.proof_binding_hash || "") &&
      String(prior.proof_binding_hash || "") === String(candidate.proof_binding_hash || "")
    ) {
      return { ok: false, reason: "replayed_deployment_proof" }
    }
    if (
      String(prior.provenance_lineage_hash || "") &&
      String(prior.provenance_lineage_hash || "") !== String(candidate.provenance_lineage_hash || "")
    ) {
      return { ok: false, reason: "deployment_lineage_drift" }
    }
  }

  const proof_binding_hash = canonicalProofBindingHash({
    workflow_hash: String(candidate.workflow_hash || ""),
    artifact_hash: String(candidate.artifact_hash || ""),
    commit_sha: String(candidate.commit_sha || ""),
    deployment_environment: String(candidate.deployment_environment || ""),
    provenance_lineage_hash: String(candidate.provenance_lineage_hash || ""),
  })

  if (
    String(candidate.proof_binding_hash || "") &&
    String(candidate.proof_binding_hash || "") !== proof_binding_hash
  ) {
    return { ok: false, reason: "proof_binding_hash_mismatch" }
  }

  return { ok: true, proof_binding_hash }
}
