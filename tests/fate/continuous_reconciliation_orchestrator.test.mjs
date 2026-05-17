import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  orchestrateContinuousReconciliation
} from "../../runtime/continuous_reconciliation_orchestrator.mjs";

test("continuous reconciliation orchestrator validates equivalent topology", () => {
  const fixture =
    "./tests/fate/orchestrator_fixture.tmp";

  fs.writeFileSync(
    fixture,
    `
      app.get("/runtime/checkpoint")
    `
  );

  const result =
    orchestrateContinuousReconciliation({
      runtimeFile: fixture,
      declaredInventory: [
        {
          route: "/runtime/checkpoint",
          method: "GET",
          classification: "OBSERVABILITY",
          replay_neutral: true,
          append_only: true,
          authority_bound: false
        }
      ]
    });

  assert.equal(result.status, "VALID");

  fs.unlinkSync(fixture);
});

test("continuous reconciliation detects undeclared execution surfaces", () => {
  const fixture =
    "./tests/fate/orchestrator_fixture.tmp";

  fs.writeFileSync(
    fixture,
    `
      app.post("/execute")
    `
  );

  const result =
    orchestrateContinuousReconciliation({
      runtimeFile: fixture,
      declaredInventory: []
    });

  assert.equal(result.status, "NULL");

  fs.unlinkSync(fixture);
});

test("continuous reconciliation checkpoints are deterministic", () => {
  const fixture =
    "./tests/fate/orchestrator_fixture.tmp";

  fs.writeFileSync(
    fixture,
    `
      app.get("/runtime/topology")
    `
  );

  const first =
    orchestrateContinuousReconciliation({
      runtimeFile: fixture,
      declaredInventory: [
        {
          route: "/runtime/topology",
          method: "GET",
          classification: "OBSERVABILITY",
          replay_neutral: true,
          append_only: true,
          authority_bound: false
        }
      ]
    });

  const second =
    orchestrateContinuousReconciliation({
      runtimeFile: fixture,
      declaredInventory: [
        {
          route: "/runtime/topology",
          method: "GET",
          classification: "OBSERVABILITY",
          replay_neutral: true,
          append_only: true,
          authority_bound: false
        }
      ]
    });

  assert.equal(
    first.checkpoint,
    second.checkpoint
  );

  fs.unlinkSync(fixture);
});
