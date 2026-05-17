import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileSurfaceInventory,
  SURFACE_CLASSES,
  DRIFT_CLASSES
} from "../../runtime/surface_inventory_reconciler.mjs";

test("surface inventory reconciliation passes for equivalent inventories", () => {
  const result = reconcileSurfaceInventory({
    declared: [
      {
        route: "/runtime/checkpoint",
        method: "GET",
        classification: SURFACE_CLASSES.OBSERVABILITY,
        replay_neutral: true,
        append_only: true,
        authority_bound: false
      }
    ],
    observed: [
      {
        route: "/runtime/checkpoint",
        method: "GET",
        classification: SURFACE_CLASSES.OBSERVABILITY,
        replay_neutral: true,
        append_only: true,
        authority_bound: false
      }
    ]
  });

  assert.equal(result.status, "VALID");
});

test("undeclared surface fails closed", () => {
  const result = reconcileSurfaceInventory({
    declared: [],
    observed: [
      {
        route: "/execute",
        method: "POST",
        classification: SURFACE_CLASSES.EXECUTION_CAPABLE,
        replay_neutral: false,
        append_only: false,
        authority_bound: true
      }
    ]
  });

  assert.equal(result.status, "NULL");

  assert.equal(
    result.drift[0].drift,
    DRIFT_CLASSES.UNDECLARED_SURFACE
  );
});

test("observability escalation fails closed", () => {
  const result = reconcileSurfaceInventory({
    declared: [
      {
        route: "/runtime/graph",
        method: "GET",
        classification: SURFACE_CLASSES.OBSERVABILITY,
        replay_neutral: true,
        append_only: true,
        authority_bound: false
      }
    ],
    observed: [
      {
        route: "/runtime/graph",
        method: "POST",
        classification: SURFACE_CLASSES.EXECUTION_CAPABLE,
        replay_neutral: false,
        append_only: false,
        authority_bound: true
      }
    ]
  });

  assert.equal(result.status, "NULL");
});
