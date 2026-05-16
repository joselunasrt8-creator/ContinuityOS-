export const RECONCILIATION_WINDOWS = Object.freeze({
  BOOT: "BOOT",
  ACTIVE: "ACTIVE",
  DEGRADED: "DEGRADED",
  QUARANTINED: "QUARANTINED",
  RECOVERY: "RECOVERY",
});

export const RECONCILIATION_DRIFT_CLASSES = Object.freeze({
  SCHEDULER_REPLAY_DRIFT: "SCHEDULER_REPLAY_DRIFT",
  WINDOW_OVERFLOW: "WINDOW_OVERFLOW",
  RECONCILIATION_STARVATION: "RECONCILIATION_STARVATION",
  CHECKPOINT_DIVERGENCE: "CHECKPOINT_DIVERGENCE",
  ASYNC_REVOCATION_GAP: "ASYNC_REVOCATION_GAP",
  TOPOLOGY_STALENESS: "TOPOLOGY_STALENESS",
  RECURSIVE_ACCUMULATION: "RECURSIVE_ACCUMULATION",
});

export const RECONCILIATION_OBSERVABILITY_FLAGS = Object.freeze({
  observability_only: true,
  replay_neutral: true,
  append_only: true,
  authority_inheriting: false,
  execution_capable: false,
  mutation_capable: false,
});

export function createReconciliationWindow({
  window_id,
  status,
  checkpoint_hash,
  depth,
}) {
  return Object.freeze({
    window_id,
    status,
    checkpoint_hash,
    depth,
    created_from_scheduler: true,
    ...RECONCILIATION_OBSERVABILITY_FLAGS,
  });
}

export function classifyReconciliationWindow(window) {
  if (!window) {
    return RECONCILIATION_DRIFT_CLASSES.CHECKPOINT_DIVERGENCE;
  }

  if (window.depth > 64) {
    return RECONCILIATION_DRIFT_CLASSES.RECURSIVE_ACCUMULATION;
  }

  if (
    !Object.values(RECONCILIATION_WINDOWS).includes(window.status)
  ) {
    return RECONCILIATION_DRIFT_CLASSES.TOPOLOGY_STALENESS;
  }

  return "VALID";
}

export function buildReconciliationCheckpoint({
  checkpoint_hash,
  topology_hash,
  registry_hash,
  continuity_hash,
}) {
  return Object.freeze({
    checkpoint_hash,
    topology_hash,
    registry_hash,
    continuity_hash,
    deterministic: true,
    replay_neutral: true,
    observability_only: true,
  });
}

export function reconcileRuntimeWindow({
  window,
  checkpoint,
}) {
  const classification =
    classifyReconciliationWindow(window);

  if (classification !== "VALID") {
    return Object.freeze({
      status: "NULL",
      drift: classification,
      replay_neutral: true,
      observability_only: true,
    });
  }

  return Object.freeze({
    status: "VALID",
    window_id: window.window_id,
    checkpoint_hash: checkpoint.checkpoint_hash,
    replay_neutral: true,
    observability_only: true,
    execution_authority: false,
  });
}
