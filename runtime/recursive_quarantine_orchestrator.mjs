import { hashCanonical } from '../src/canonical.js';

export const QUARANTINE_DRIFT = Object.freeze({
  TOPOLOGY_CONTAMINATION: "TOPOLOGY_CONTAMINATION",
  EXECUTION_SURFACE_ESCAPE: "EXECUTION_SURFACE_ESCAPE",
  RECONCILIATION_COLLAPSE: "RECONCILIATION_COLLAPSE",
  OBSERVABILITY_ESCALATION: "OBSERVABILITY_ESCALATION"
});

export function deterministicQuarantineHash(payload) {
  return hashCanonical(payload);
}

export function recursivelyQuarantine({
  reconciliation
}) {
  const quarantined =
    reconciliation.status !== "VALID";

  const affectedScopes = quarantined
    ? [
        "runtime",
        "topology",
        "reconciliation",
        "governance"
      ]
    : [];

  const quarantine = Object.freeze({
    status: quarantined
      ? "QUARANTINED"
      : "VALID",

    affected_scopes: affectedScopes,

    replay_neutral: true,

    append_only: true,

    authority_granting: false,

    drift: quarantined
      ? [
          {
            status: "NULL",
            drift:
              QUARANTINE_DRIFT.RECONCILIATION_COLLAPSE
          }
        ]
      : []
  });

  return Object.freeze({
    quarantine,
    checkpoint:
      deterministicQuarantineHash(quarantine)
  });
}
