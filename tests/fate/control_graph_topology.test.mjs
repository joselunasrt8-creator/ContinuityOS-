import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("control graph topology artifacts exist", () => {
  assert.equal(
    fs.existsSync("./runtime/control_graph_integration.ts"),
    true,
  );

  assert.equal(
    fs.existsSync("./graph/runtime-topology.cypher"),
    true,
  );

  assert.equal(
    fs.existsSync("./graph/legitimacy-traversals.cypher"),
    true,
  );

  assert.equal(
    fs.existsSync("./graph/reconciliation-views.cypher"),
    true,
  );
});
