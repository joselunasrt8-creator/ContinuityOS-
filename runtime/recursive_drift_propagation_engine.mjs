import crypto from "node:crypto";

export const DRIFT_CLASSES = Object.freeze({
  LINEAGE_COLLAPSE: "LINEAGE_COLLAPSE",
  TOPOLOGY_FRAGMENTATION: "TOPOLOGY_FRAGMENTATION",
  FEDERATED_TRUST_COLLAPSE: "FEDERATED_TRUST_COLLAPSE",
  PROOF_CONTAMINATION: "PROOF_CONTAMINATION",
  RECURSIVE_DRIFT_OVERFLOW: "RECURSIVE_DRIFT_OVERFLOW",
  EXECUTION_CONTINUITY_INVALID: "EXECUTION_CONTINUITY_INVALID"
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

export function propagateRecursiveDrift({
  root,
  graph,
  maxDepth = 8
}) {
  const visited = new Set();
  const affected = [];
  const queue = [{ id: root, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.depth > maxDepth) {
      return {
        status: "NULL",
        drift: DRIFT_CLASSES.RECURSIVE_DRIFT_OVERFLOW
      };
    }

    if (visited.has(current.id)) {
      continue;
    }

    visited.add(current.id);

    const node = graph[current.id];

    if (!node) {
      return {
        status: "NULL",
        drift: DRIFT_CLASSES.TOPOLOGY_FRAGMENTATION
      };
    }

    affected.push({
      id: current.id,
      class: node.class,
      depth: current.depth
    });

    for (const child of node.edges || []) {
      queue.push({
        id: child,
        depth: current.depth + 1
      });
    }
  }

  const checkpoint = {
    root,
    affected,
    drift: DRIFT_CLASSES.LINEAGE_COLLAPSE,
    replay_neutral: true,
    append_only: true,
    observability_only: true
  };

  return {
    status: "VALID",
    checkpoint,
    checkpoint_hash: hashCanonical(checkpoint)
  };
}
