import test from "node:test";
import assert from "node:assert/strict";

import {
  persistTopologyLineage,
  detectLineageCollapse
} from "../../runtime/topology_lineage_registry.mjs";

test("topology lineage persists deterministic checkpoints", () => {
  const result =
    persistTopologyLineage({
      previousCheckpoint: "a",
      currentCheckpoint: "b",
      status: "VALID"
    });

  assert.equal(
    result.lineage.current_checkpoint,
    "b"
  );
});

test("lineage hashes are deterministic", () => {
  const first =
    persistTopologyLineage({
      previousCheckpoint: "a",
      currentCheckpoint: "b",
      status: "VALID"
    });

  const second =
    persistTopologyLineage({
      previousCheckpoint: "a",
      currentCheckpoint: "b",
      status: "VALID"
    });

  assert.equal(
    first.lineage_hash,
    second.lineage_hash
  );
});

test("invalid lineage chain triggers collapse detection", () => {
  const result =
    detectLineageCollapse({
      lineageChain: [
        {
          status: "VALID"
        },
        {
          status: "QUARANTINED"
        }
      ]
    });

  assert.equal(
    result.collapse_detected,
    true
  );

  assert.equal(
    result.status,
    "QUARANTINED"
  );
});
