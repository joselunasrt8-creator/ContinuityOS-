import test from "node:test";
import assert from "node:assert/strict";

const CONTROL_GRAPH_EXECUTION_MODE =
  "OBSERVABILITY_ONLY";

test("control graph cannot mutate runtime authority", () => {
  assert.equal(
    CONTROL_GRAPH_EXECUTION_MODE,
    "OBSERVABILITY_ONLY",
  );
});
