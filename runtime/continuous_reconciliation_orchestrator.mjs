import crypto from "node:crypto";

import {
  scanRuntimeSurfaces
} from "./runtime_surface_scanner.mjs";

import {
  reconcileSurfaceInventory
} from "./surface_inventory_reconciler.mjs";

export const ORCHESTRATOR_DRIFT = Object.freeze({
  RECONCILIATION_DRIFT: "RECONCILIATION_DRIFT",
  SCAN_DIVERGENCE: "SCAN_DIVERGENCE",
  TOPOLOGY_MISMATCH: "TOPOLOGY_MISMATCH"
});

export function deterministicCheckpoint(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function orchestrateContinuousReconciliation({
  runtimeFile,
  declaredInventory
}) {
  const observedInventory =
    scanRuntimeSurfaces(runtimeFile);

  const reconciliation =
    reconcileSurfaceInventory({
      declared: declaredInventory,
      observed: observedInventory
    });

  const checkpoint =
    deterministicCheckpoint({
      runtimeFile,
      observedInventory,
      reconciliation
    });

  return Object.freeze({
    status: reconciliation.status,
    checkpoint,
    reconciliation,
    observedInventory,
    replay_neutral: true,
    append_only: true,
    authority_granting: false,
    drift:
      reconciliation.status === "VALID"
        ? []
        : [
            {
              drift:
                ORCHESTRATOR_DRIFT.RECONCILIATION_DRIFT,
              status: "NULL"
            }
          ]
  });
}
