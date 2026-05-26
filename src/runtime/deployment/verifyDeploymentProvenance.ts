export type DeploymentProvenanceRecord = {
  provenance_id: string
  commit_sha: string
  workflow_hash: string
  artifact_hash: string
  deploy_actor: string
  deployment_timestamp: string
  environment_classification: string
  deployment_proof_id: string
}

export type DeploymentProvenanceFailureReason =
  | "missing_commit_sha"
  | "missing_workflow_hash"
  | "missing_artifact_hash"
  | "missing_deploy_actor"
  | "missing_deployment_timestamp"
  | "missing_environment_classification"
  | "missing_deployment_proof_id"
  | "missing_provenance_id"
  | "replayed_deployment_provenance"

export type DeploymentProvenanceVerification =
  | { ok: true }
  | { ok: false; reason: DeploymentProvenanceFailureReason }

export function verifyDeploymentProvenance(record: Partial<DeploymentProvenanceRecord>): DeploymentProvenanceVerification {
  if (!String(record.commit_sha || "").trim()) return { ok: false, reason: "missing_commit_sha" }
  if (!String(record.workflow_hash || "").trim()) return { ok: false, reason: "missing_workflow_hash" }
  if (!String(record.artifact_hash || "").trim()) return { ok: false, reason: "missing_artifact_hash" }
  if (!String(record.deploy_actor || "").trim()) return { ok: false, reason: "missing_deploy_actor" }
  if (!String(record.deployment_timestamp || "").trim()) return { ok: false, reason: "missing_deployment_timestamp" }
  if (!String(record.environment_classification || "").trim()) return { ok: false, reason: "missing_environment_classification" }
  if (!String(record.deployment_proof_id || "").trim()) return { ok: false, reason: "missing_deployment_proof_id" }
  if (!String(record.provenance_id || "").trim()) return { ok: false, reason: "missing_provenance_id" }
  return { ok: true }
}

export function provenanceIsReplayed(
  candidate: Partial<DeploymentProvenanceRecord>,
  existing: Partial<DeploymentProvenanceRecord> | null
): boolean {
  if (!existing) return false
  return (
    String(existing.workflow_hash || "") === String(candidate.workflow_hash || "") &&
    String(existing.artifact_hash || "") === String(candidate.artifact_hash || "") &&
    String(existing.commit_sha || "") === String(candidate.commit_sha || "") &&
    String(existing.deployment_proof_id || "") === String(candidate.deployment_proof_id || "") &&
    String(existing.provenance_id || "") === String(candidate.provenance_id || "")
  )
}
