import crypto from "node:crypto";

export const FEDERATION_DRIFT_CLASSES = Object.freeze({
  REMOTE_AUTHORITY_INHERITANCE: "REMOTE_AUTHORITY_INHERITANCE",
  FEDERATED_TOPOLOGY_DIVERGENCE: "FEDERATED_TOPOLOGY_DIVERGENCE",
  SOVEREIGNTY_FRAGMENTATION: "SOVEREIGNTY_FRAGMENTATION",
  REMOTE_REPLAY_RESURRECTION: "REMOTE_REPLAY_RESURRECTION",
  FEDERATED_PROOF_CONTAMINATION: "FEDERATED_PROOF_CONTAMINATION",
  CROSS_RUNTIME_LINEAGE_COLLAPSE: "CROSS_RUNTIME_LINEAGE_COLLAPSE"
});

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }

  return value;
}

export function hashCanonical(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function reconcileFederatedSovereignty({
  localRuntime,
  remoteRuntime,
  allowAuthorityInheritance = false,
  maxFederationDepth = 4
}) {
  if (allowAuthorityInheritance) {
    return {
      status: "NULL",
      drift: FEDERATION_DRIFT_CLASSES.REMOTE_AUTHORITY_INHERITANCE
    };
  }

  if (maxFederationDepth <= 0) {
    return {
      status: "NULL",
      drift: FEDERATION_DRIFT_CLASSES.SOVEREIGNTY_FRAGMENTATION
    };
  }

  if (
    localRuntime.topology_hash !==
    remoteRuntime.expected_local_topology_hash
  ) {
    return {
      status: "NULL",
      drift: FEDERATION_DRIFT_CLASSES.FEDERATED_TOPOLOGY_DIVERGENCE
    };
  }

  const checkpoint = {
    local_runtime: localRuntime.runtime_id,
    remote_runtime: remoteRuntime.runtime_id,
    topology_hash: localRuntime.topology_hash,
    replay_neutral: true,
    append_only: true,
    observability_only: true,
    authority_inheritance: false
  };

  return {
    status: "VALID",
    checkpoint,
    checkpoint_hash: hashCanonical(checkpoint)
  };
}
