import test from "node:test";
import assert from "node:assert/strict";

import {
  RECONCILIATION_WINDOWS,
  RECONCILIATION_DRIFT_CLASSES,
  createReconciliationWindow,
  classifyReconciliationWindow,
  buildReconciliationCheckpoint,
  reconcileRuntimeWindow,
} from "../../runtime/reconciliation_scheduler.mjs";
test("reconciliation scheduler layer exists", () => {
  assert.ok(RECONCILIATION_WINDOWS);
  assert.ok(RECONCILIATION_DRIFT_CLASSES);
  assert.equal(
    typeof createReconciliationWindow,
    "function",
  );
  assert.equal(
    typeof classifyReconciliationWindow,
    "function",
  );
  assert.equal(
    typeof buildReconciliationCheckpoint,
    "function",
  );
  assert.equal(
    typeof reconcileRuntimeWindow,
    "function",
  );
});

test("scheduler remains observability only", () => {
  const window = createReconciliationWindow({
    window_id: "window-1",
    status: RECONCILIATION_WINDOWS.ACTIVE,
    checkpoint_hash: "checkpoint-1",
    depth: 1,
  });

  assert.equal(window.observability_only, true);
  assert.equal(window.execution_capable, false);
  assert.equal(window.mutation_capable, false);
  assert.equal(window.authority_inheriting, false);
});

test("scheduler preserves replay neutrality", () => {
  const checkpoint = buildReconciliationCheckpoint({
    checkpoint_hash: "cp-1",
    topology_hash: "topology-1",
    registry_hash: "registry-1",
    continuity_hash: "continuity-1",
  });

  assert.equal(checkpoint.replay_neutral, true);
});

test("scheduler preserves append-only semantics", () => {
  const window = createReconciliationWindow({
    window_id: "window-append",
    status: RECONCILIATION_WINDOWS.BOOT,
    checkpoint_hash: "checkpoint-append",
    depth: 0,
  });

  assert.equal(window.append_only, true);
});

test("scheduler exports deterministic checkpoints", () => {
  const checkpoint = buildReconciliationCheckpoint({
    checkpoint_hash: "cp-deterministic",
    topology_hash: "topology-deterministic",
    registry_hash: "registry-deterministic",
    continuity_hash: "continuity-deterministic",
  });

  assert.equal(checkpoint.deterministic, true);
  assert.equal(checkpoint.observability_only, true);
});

test("scheduler classifies governance windows", () => {
  const validWindow = createReconciliationWindow({
    window_id: "window-valid",
    status: RECONCILIATION_WINDOWS.ACTIVE,
    checkpoint_hash: "checkpoint-valid",
    depth: 1,
  });

  const invalidWindow = createReconciliationWindow({
    window_id: "window-invalid",
    status: "CORRUPTED",
    checkpoint_hash: "checkpoint-invalid",
    depth: 1,
  });

  assert.equal(
    classifyReconciliationWindow(validWindow),
    "VALID",
  );

  assert.equal(
    classifyReconciliationWindow(invalidWindow),
    RECONCILIATION_DRIFT_CLASSES.TOPOLOGY_STALENESS,
  );
});

test("scheduler denies execution authority", () => {
  const window = createReconciliationWindow({
    window_id: "window-authority",
    status: RECONCILIATION_WINDOWS.ACTIVE,
    checkpoint_hash: "checkpoint-authority",
    depth: 1,
  });

  const checkpoint = buildReconciliationCheckpoint({
    checkpoint_hash: "checkpoint-authority",
    topology_hash: "topology-authority",
    registry_hash: "registry-authority",
    continuity_hash: "continuity-authority",
  });

  const result = reconcileRuntimeWindow({
    window,
    checkpoint,
  });

  assert.equal(result.execution_authority, false);
  assert.equal(result.observability_only, true);
});

test("scheduler drift taxonomy is deterministic", () => {
  assert.ok(
    RECONCILIATION_DRIFT_CLASSES
      .SCHEDULER_REPLAY_DRIFT,
  );

  assert.ok(
    RECONCILIATION_DRIFT_CLASSES
      .WINDOW_OVERFLOW,
  );

  assert.ok(
    RECONCILIATION_DRIFT_CLASSES
      .RECONCILIATION_STARVATION,
  );

  assert.ok(
    RECONCILIATION_DRIFT_CLASSES
      .CHECKPOINT_DIVERGENCE,
  );

  assert.ok(
    RECONCILIATION_DRIFT_CLASSES
      .ASYNC_REVOCATION_GAP,
  );

  assert.ok(
    RECONCILIATION_DRIFT_CLASSES
      .TOPOLOGY_STALENESS,
  );

  assert.ok(
    RECONCILIATION_DRIFT_CLASSES
      .RECURSIVE_ACCUMULATION,
  );
});
