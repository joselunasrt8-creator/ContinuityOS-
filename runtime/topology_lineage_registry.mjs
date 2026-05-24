import { hashCanonical } from '../src/canonical.js';

export function deterministicLineageHash(payload) {
  return hashCanonical(payload);
}

export function persistTopologyLineage({
  previousCheckpoint = null,
  currentCheckpoint,
  status,
  drift = []
}) {
  const lineage = Object.freeze({
    previous_checkpoint:
      previousCheckpoint,

    current_checkpoint:
      currentCheckpoint,

    status,

    drift,

    replay_neutral: true,

    append_only: true,

    authority_granting: false
  });

  return Object.freeze({
    lineage,
    lineage_hash:
      deterministicLineageHash(lineage)
  });
}

export function detectLineageCollapse({
  lineageChain = []
}) {
  const invalid =
    lineageChain.some(
      (entry) => entry.status !== "VALID"
    );

  return Object.freeze({
    status: invalid
      ? "QUARANTINED"
      : "VALID",

    replay_neutral: true,

    append_only: true,

    authority_granting: false,

    collapse_detected: invalid
  });
}
