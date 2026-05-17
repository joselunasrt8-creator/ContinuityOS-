import test from "node:test";
import assert from "node:assert/strict";

import {
  propagateRecursiveDrift,
  DRIFT_CLASSES
} from "../../runtime/recursive_drift_propagation_engine.mjs";

test("recursive drift propagates deterministically", () => {
  const result = propagateRecursiveDrift({
    root: "authority",
    graph: {
      authority: {
        class: "AUTHORITY",
        edges: ["proof"]
      },
      proof: {
        class: "PROOF",
        edges: ["execution"]
      },
      execution: {
        class: "EXECUTION",
        edges: []
      }
    }
  });

  assert.equal(result.status, "VALID");
  assert.equal(
    result.checkpoint.drift,
    DRIFT_CLASSES.LINEAGE_COLLAPSE
  );

  assert.equal(result.checkpoint.replay_neutral, true);
  assert.equal(result.checkpoint.append_only, true);
});

test("missing topology fails closed", () => {
  const result = propagateRecursiveDrift({
    root: "authority",
    graph: {}
  });

  assert.equal(result.status, "NULL");
  assert.equal(
    result.drift,
    DRIFT_CLASSES.TOPOLOGY_FRAGMENTATION
  );
});

test("recursive overflow fails closed", () => {
  const result = propagateRecursiveDrift({
    root: "a",
    maxDepth: 1,
    graph: {
      a: {
        class: "ROOT",
        edges: ["b"]
      },
      b: {
        class: "CHILD",
        edges: ["c"]
      },
      c: {
        class: "LEAF",
        edges: []
      }
    }
  });

  assert.equal(result.status, "NULL");
  assert.equal(
    result.drift,
    DRIFT_CLASSES.RECURSIVE_DRIFT_OVERFLOW
  );
});

test("checkpoint hashes are deterministic", () => {
  const graph = {
    authority: {
      class: "AUTHORITY",
      edges: ["proof"]
    },
    proof: {
      class: "PROOF",
      edges: []
    }
  };

  const a = propagateRecursiveDrift({
    root: "authority",
    graph
  });

  const b = propagateRecursiveDrift({
    root: "authority",
    graph
  });

  assert.equal(a.checkpoint_hash, b.checkpoint_hash);
});
