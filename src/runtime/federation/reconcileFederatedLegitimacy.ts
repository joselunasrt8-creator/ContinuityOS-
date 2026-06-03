import { hashCanonical } from "../../canonical.js"

export const FEDERATION_MODES = ["OBSERVE_ONLY", "RECONCILE_ONLY"] as const
export type FederationMode = (typeof FEDERATION_MODES)[number]

export const FEDERATION_DRIFT_CLASSES = [
  "FEDERATION_PROOF_DIVERGENCE",
  "FEDERATION_LINEAGE_DIVERGENCE",
  "FEDERATION_CONTINUITY_MISMATCH",
  "FEDERATION_REPLAY_DIVERGENCE",
  "FEDERATION_ORPHAN_PROOF",
  "FEDERATION_TOPOLOGY_MISMATCH",
  "FEDERATION_SCHEMA_MISMATCH",
  "FEDERATION_UNKNOWN_NODE",
  "FEDERATION_UNTRUSTED_NODE",
  "FEDERATION_NON_CANONICAL_HASH",
] as const

export type FederationDriftClass = (typeof FEDERATION_DRIFT_CLASSES)[number]
export type TrustClassification = "TRUSTED" | "UNTRUSTED" | "UNKNOWN"

// Distinct cross-registry reconciliation classification outcomes.
// These five states are mutually exclusive and collectively exhaustive.
// RECONCILED_DETERMINISTIC is only reachable when no drift classes are present.
// All non-RECONCILED_DETERMINISTIC outcomes are fail-closed for execution eligibility.
export const CROSS_REGISTRY_CLASSIFICATIONS = [
  "RECONCILED_DETERMINISTIC",
  "RECONCILIATION_REQUIRED",
  "PARTITION_SUSPENDED",
  "AMBIGUOUS",
  "NULL",
] as const

export type CrossRegistryClassification = (typeof CROSS_REGISTRY_CLASSIFICATIONS)[number]

export type FederatedNodeDeclaration = {
  node_id: string
  governance_version: string
  schema_version: string
  canonical_hash_algorithm: "sha256"
  trust_classification: TrustClassification
  federation_mode: FederationMode
}

export type FederatedLegitimacySnapshot = {
  node: FederatedNodeDeclaration
  lineage_root: string
  continuity_root: string
  proof_root: string
  replay_root: string
  validation_root: string
  topology_root: string
}

export type ReconciliationFlags = Readonly<{
  evidence_only: true
  read_only: true
  mutation_capable: false
  creates_authority: false
  creates_proof: false
  remote_execution_legitimacy: false
}>

export type ReconciliationResult = {
  local_node_id: string
  compared_node_id: string
  classification: CrossRegistryClassification
  equivalent: boolean
  drift_classes: FederationDriftClass[]
  orphan_proofs: string[]
  flags: ReconciliationFlags
}

export function deterministicFederationSnapshot(snapshot: FederatedLegitimacySnapshot) {
  const canonical = {
    node: snapshot.node,
    lineage_root: snapshot.lineage_root,
    continuity_root: snapshot.continuity_root,
    proof_root: snapshot.proof_root,
    replay_root: snapshot.replay_root,
    validation_root: snapshot.validation_root,
    topology_root: snapshot.topology_root,
  }
  return Object.freeze({
    ...canonical,
    deterministic_hash: hashCanonical(canonical),
    evidence_only: true as const,
    immutable_snapshot: true as const,
  })
}

// Classifies a set of drift classes into one of the five required cross-registry
// classification outcomes. Priority is fail-closed: the strongest failure wins.
//
// Priority order:
// 1. NULL — hash comparability broken (NON_CANONICAL_HASH) or proof tree irreconcilable (ORPHAN_PROOF)
// 2. PARTITION_SUSPENDED — remote node explicitly untrusted; execution eligibility suspended
// 3. AMBIGUOUS — trust classification indeterminate; convergence cannot be established
// 4. RECONCILIATION_REQUIRED — known drifts (proof, lineage, replay, topology, schema, continuity)
// 5. RECONCILED_DETERMINISTIC — only when drift set is empty
//
// Invariants enforced:
// - Proof divergence → RECONCILIATION_REQUIRED (never RECONCILED_DETERMINISTIC)
// - Execution status divergence (replay root) → RECONCILIATION_REQUIRED
// - Stale lineage → RECONCILIATION_REQUIRED (fail-closed)
// - Partition-suspended → PARTITION_SUSPENDED (no execution eligibility)
// - Ambiguous trust → AMBIGUOUS (cannot imply convergence)
// - Local validity does not imply global convergence
export function classifyFederatedReconciliation(
  drifts: ReadonlySet<FederationDriftClass>,
): CrossRegistryClassification {
  if (drifts.size === 0) return "RECONCILED_DETERMINISTIC"

  if (drifts.has("FEDERATION_NON_CANONICAL_HASH") || drifts.has("FEDERATION_ORPHAN_PROOF")) {
    return "NULL"
  }

  if (drifts.has("FEDERATION_UNTRUSTED_NODE")) {
    return "PARTITION_SUSPENDED"
  }

  if (drifts.has("FEDERATION_UNKNOWN_NODE")) {
    return "AMBIGUOUS"
  }

  return "RECONCILIATION_REQUIRED"
}

export function reconcileFederatedLegitimacy(
  local: FederatedLegitimacySnapshot,
  remote: FederatedLegitimacySnapshot,
): ReconciliationResult {
  const drifts = new Set<FederationDriftClass>()
  const orphan_proofs: string[] = []

  if (remote.node.trust_classification === "UNKNOWN") drifts.add("FEDERATION_UNKNOWN_NODE")
  if (remote.node.trust_classification === "UNTRUSTED") drifts.add("FEDERATION_UNTRUSTED_NODE")
  if (!FEDERATION_MODES.includes(remote.node.federation_mode)) drifts.add("FEDERATION_SCHEMA_MISMATCH")
  if (remote.node.canonical_hash_algorithm !== local.node.canonical_hash_algorithm) drifts.add("FEDERATION_NON_CANONICAL_HASH")
  if (remote.node.schema_version !== local.node.schema_version) drifts.add("FEDERATION_SCHEMA_MISMATCH")
  if (remote.node.governance_version !== local.node.governance_version) drifts.add("FEDERATION_TOPOLOGY_MISMATCH")

  if (local.lineage_root !== remote.lineage_root) drifts.add("FEDERATION_LINEAGE_DIVERGENCE")
  if (local.continuity_root !== remote.continuity_root) drifts.add("FEDERATION_CONTINUITY_MISMATCH")
  if (local.proof_root !== remote.proof_root) drifts.add("FEDERATION_PROOF_DIVERGENCE")
  if (local.replay_root !== remote.replay_root) drifts.add("FEDERATION_REPLAY_DIVERGENCE")
  if (local.topology_root !== remote.topology_root) drifts.add("FEDERATION_TOPOLOGY_MISMATCH")
  if (local.validation_root !== remote.validation_root) drifts.add("FEDERATION_SCHEMA_MISMATCH")

  if (remote.proof_root !== remote.lineage_root) {
    drifts.add("FEDERATION_ORPHAN_PROOF")
    orphan_proofs.push(remote.proof_root)
  }

  const classification = classifyFederatedReconciliation(drifts)

  return {
    local_node_id: local.node.node_id,
    compared_node_id: remote.node.node_id,
    classification,
    equivalent: classification === "RECONCILED_DETERMINISTIC",
    drift_classes: Array.from(drifts).sort(),
    orphan_proofs,
    flags: {
      evidence_only: true,
      read_only: true,
      mutation_capable: false,
      creates_authority: false,
      creates_proof: false,
      remote_execution_legitimacy: false,
    },
  }
}
