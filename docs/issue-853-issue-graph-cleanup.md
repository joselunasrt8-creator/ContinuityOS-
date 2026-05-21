# Issue #853 — Issue Graph Cleanup (Runtime Freeze + Observability Phase)

Date: 2026-05-21 (UTC)

Scope constraints honored:
- Runtime work remains frozen.
- No runtime routes or mutation logic changes.
- No validator/execute/proof/replay/authority/continuity/reconciliation mutations.
- Focus is issue-graph coherence: closure, supersession, duplication control.

## A) Open issue inventory

Because GitHub issue API access is unavailable in this environment (HTTP 403 from api.github.com), this inventory is bounded to issues explicitly provided in Issue #853 context plus repository evidence docs.

Candidate open issues in scope:
- #853 (current cleanup meta issue)
- Any not-yet-closed observability/install-base/topology/governance-ledger issues adjacent to merged anchors below

Known merged anchors (already landed):
- #847 install-base telemetry (merged)
- #854 observability boundary review (merged)
- #855 topology classification (merged)
- #856 install-base compression (merged)
- #852 PLTL/PLOL observability containment (merged)
- #845 continuity convergence (merged)

## B) Close list with reasons

Classify as closed/superseded based on merged-anchor state:
- #847 → CLOSE_SUPERSEDED (anchor merged)
- #854 → CLOSE_SUPERSEDED (anchor merged)
- #855 → CLOSE_SUPERSEDED (anchor merged)
- #856 → CLOSE_SUPERSEDED (anchor merged)
- #852 → CLOSE_SUPERSEDED (anchor merged)
- #845 → CLOSE_SUPERSEDED (anchor merged)

For any still-open issues duplicating these surfaces:
- Install-base duplicates of #847/#856 → CLOSE_DUPLICATE
- Observability-boundary duplicates of #854/#852 → CLOSE_DUPLICATE
- Topology-classification duplicates of #855 → CLOSE_DUPLICATE
- Runtime-hardening issues that reopen frozen runtime execution surfaces without a new invariant breach artifact → CLOSE_NULL

## C) Keep list with cluster labels

- #853 → KEEP_GOVERNANCE_LEDGER
  - Reason: active coordination issue to preserve freeze discipline and issue-graph coherence.

If additional open issues exist after dedupe, keep only one per cluster:
- KEEP_OBSERVABILITY: exactly one continuation issue max.
- KEEP_INSTALL_BASE: exactly one continuation issue max.
- KEEP_TOPOLOGY: exactly one continuation issue max.
- KEEP_GOVERNANCE_LEDGER: exactly one coordinator issue max (#853 preferred).

Any issue with unclear overlap/invariant relevance under freeze:
- NEEDS_REVIEW

## D) Supersession / link map

Closed strategy anchors should link forward to active continuation owner issues:
- #854, #852 (observability containment/boundary) → active observability continuation issue (single owner)
- #847, #856 (install-base telemetry/compression) → active install-base continuation issue (single owner)
- #855 (topology classification) → active topology continuation issue (single owner)
- #845 (continuity convergence) → governance-ledger coordinator (#853) unless a dedicated continuity follow-up is already open

Backlinks to preserve coherence:
- Continuation issues should reference merged anchors as "supersedes/continues".
- Closed duplicates should reference the exact owner continuation issue.

## E) Remaining active issue clusters

Target steady-state cluster set during runtime freeze:
1. Observability containment/evidence quality (non-authoritative, GET-only)
2. Install-base evidence compression/telemetry hygiene (read-only evidence)
3. Topology classification determinism (observability-only topology coherence)
4. Governance ledger / issue graph housekeeping (freeze enforcement)

## F) Next single recommended issue

Recommended next active issue:
- #853 (governance-ledger coordinator)

Reason:
- It can execute graph cleanup (close/supersede/duplicate triage) without creating runtime work.
- It preserves the freeze boundary while linking merged strategy anchors to one continuation owner per cluster.

## G) Whether a PR is needed

Yes — documentation-only cleanup PR is appropriate.

Rationale:
- Produces explicit, auditable issue-graph cleanup plan without touching runtime logic.
- Keeps open PR count controllable before new non-runtime work begins.
