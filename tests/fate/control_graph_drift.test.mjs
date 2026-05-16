import test from "node:test";
import assert from "node:assert/strict";

function propagateTopologyDrift(input) {
  return {
    mode: "OBSERVABILITY_ONLY",
    observed_node: input.node,
    drift_class: input.drift_class,
    mutation_permitted: false,
  };
}

test("drift propagation remains observability-only", () => {
  const drift = propagateTopologyDrift({
    node: "validator",
    drift_class: "topology_mismatch",
  });

  assert.equal(
    drift.mode,
    "OBSERVABILITY_ONLY",
  );

  assert.equal(
    drift.mutation_permitted,
    false,
  );
});
