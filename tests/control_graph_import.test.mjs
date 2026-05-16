import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("control graph runtime files exist", () => {
  assert.equal(
    fs.existsSync("./runtime/control_graph_integration.ts"),
    true,
  );

  assert.equal(
    fs.existsSync("./runtime/control_graph_emitter.ts"),
    true,
  );

  assert.equal(
    fs.existsSync("./runtime/control_graph_hooks.ts"),
    true,
  );
});	
