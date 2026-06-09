# GOVERNANCE_GAP_REGISTRY

## Purpose

Deterministic registry of remaining legitimacy closure gaps.

Canonical invariant:

```text
If no valid object exists
→ nothing happens
```

Closure invariant:

```text
No unauthorized reality mutation path exists.
```

The purpose of this registry is to:
- enumerate remaining governance gaps
- classify mutation-capable surfaces
- identify bypass-capable authority paths
- define closure conditions
- bind required validation coverage
- convert governance hardening into deterministic gap elimination

---

# Registry Schema

| Field | Meaning |
|---|---|
| gap_id | Stable governance gap identifier |
| surface | Runtime/governance surface affected |
| risk_class | P0/P1/P2/P3 severity |
| bypass_condition | Condition that bypasses canonical legitimacy |
| closure_condition | Required invariant for closure |
| current_state | Observed implementation state |
| required_tests | Mandatory validation coverage |
| required_proofs | Required proof/registry evidence |
| status | OPEN / PARTIAL / CLOSED / QUARANTINED |

---

# GAP-001 — Identity Continuity Hardening

| Field | Value |
|---|---|
| gap_id | GAP-001 |
| surface | continuity_registry / authority lineage |
| risk_class | P3 |
| bypass_condition | Authority survives invalid or revoked continuity ancestry |
| closure_condition | No authority object may execute unless recursive continuity lineage is ACTIVE and replay-valid |
| current_state | Partial implementation present; recursive propagation and reconciliation still expanding |
| required_tests | replay invalidation, recursive ancestry traversal, orphan rejection, revocation propagation |
| required_proofs | continuity lineage persistence, recursive revocation evidence |
| status | OPEN |

---

# GAP-002 — Root Authority Containment

| Field | Value |
|---|---|
| gap_id | GAP-002 |
| surface | Cloudflare/GitHub/root deploy authority |
| risk_class | P0 |
| bypass_condition | Infrastructure root credentials mutate runtime outside canonical legitimacy chain |
| closure_condition | All production mutation authority traverses canonical governed execution lifecycle |
| current_state | Runtime governance stronger than infrastructure sovereignty; PR #582 triggered a Cloudflare Git Integration deployment from commit 77c2b95 outside /session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof. Classified as preview/non-production based on PR-linked Git Integration evidence; sovereignty gap tracked under #578, not #577 production deploy blocker unless production-capable. |
| required_tests | deploy bypass detection, workflow provenance verification, authority equivalence verification |
| required_proofs | deploy provenance evidence, immutable workflow lineage |
| status | OPEN |

---

# GAP-003 — Cross-Registry Reconciliation Integrity

| Field | Value |
|---|---|
| gap_id | GAP-003 |
| surface | session/continuity/authority/proof registries |
| risk_class | P2 |
| bypass_condition | Registries remain individually valid while lineage relationships silently drift |
| closure_condition | All persisted lineage relationships remain recursively reconcilable |
| current_state | Deterministic reconciliation substrate partially defined |
| required_tests | lineage equivalence traversal, reconciliation determinism, drift quarantine |
| required_proofs | reconciliation snapshots, lineage continuity proofs |
| status | OPEN |

---

# GAP-004 — Execution Surface Exhaustiveness

| Field | Value |
|---|---|
| gap_id | GAP-004 |
| surface | deploy/database/workflow/runtime mutation surfaces |
| risk_class | P1 |
| bypass_condition | Mutation-capable execution surface exists outside canonical inventory |
| closure_condition | Every mutation-capable surface is declared, classified, authority-bound, replay-safe, and proof-bound |
| current_state | Surface inventory exists but requires continuous reconciliation |
| required_tests | surface reconciliation, bypass drift detection, unauthorized route detection |
| required_proofs | canonical surface map, drift telemetry |
| status | OPEN |

---

# GAP-005 — Governance Self-Mutation

| Field | Value |
|---|---|
| gap_id | GAP-005 |
| surface | validator/schema/policy/governance mutation |
| risk_class | P0 |
| bypass_condition | Governance primitives mutate without governed legitimacy validation |
| closure_condition | Runtime governance changes require recursively governed legitimacy approval |
| current_state | PARTIAL — GMA (Governance Mutation Authorization) enforcement active: governance_mutation and workflow_mutation class PRs require a valid GMA artifact with canonical lifecycle lineage (/session → /continuity → /authority → /compile). Enforcement in merge-governance-check.yml. Creation workflow: governance-mutation-authorization.yml. Spec: governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION_SPEC.json. Bootstrap exemption (GMA_BOOTSTRAP_EXEMPTION) applies only to the single PR introducing GAP-005 GMA infrastructure — self-limiting, non-reusable, auditable. Once merged, all subsequent governance mutations fully enforce GMA. Remaining gap: runtime proof persistence (/execute → /proof) for governance mutations not yet enforced. |
| issue_reference | #1831 |
| required_tests | governance mutation validation, recursive approval lineage, policy drift invalidation |
| required_proofs | governance lineage persistence, immutable governance mutation evidence |
| remaining_closure | Wire /execute → /proof stage for governance mutations; add governance_mutation_proof to proof registry |
| status | PARTIAL |

---

# GAP-006 — Cloudflare Production Authority Bypass Containment

| Field | Value |
|---|---|
| gap_id | GAP-006 |
| issue_reference | #584 |
| surface | Cloudflare Workers deployment authority / production mutation paths |
| risk_class | P3 |
| bypass_condition | Production Cloudflare Worker deployment occurs outside canonical /session → /continuity → /authority → /compile → /validate → /execute → /proof chain. Vectors: Cloudflare Git Integration (auto-deploy on push), local wrangler deploy with valid API token, unauthorized workflow_dispatch with fabricated inputs, preview environment targeting production worker. |
| closure_condition | All production-capable Cloudflare mutation paths either: (a) traverse the full canonical chain via governed-deploy.yml, or (b) are classified as root break-glass authority with observable audit trail. Cloudflare Git Integration must be disabled at account level. |
| current_state | Governed deploy workflow (PATH-001) is active and enforces canonical chain. Git Integration requires account-level disable (OPEN). Local wrangler bypass is classified as root break-glass authority with audit observable. Preview environment isolated via wrangler.toml [env.preview]. Authority expiry in legitimacy artifact now derived from /authority response (was hardcoded 2999). Wrangler detection in governed-deploy.ts strengthened to cover shell-wrapped patterns. |
| required_tests | production deploy outside governed workflow → NULL; unauthorized workflow dispatch → NULL; local bypass classified and observable; preview-only paths cannot mutate production; replayed deployment lineage rejected |
| required_proofs | CLOUDFLARE_AUTHORITY_CLASSIFICATION.json, DEPLOYMENT_TOPOLOGY_MAP.json, PRODUCTION_MUTATION_CONTAINMENT.json, RESIDUAL_BYPASS_MATRIX.json |
| fate_tests | tests/fate/issue-584-cloudflare-authority-bypass-containment.test.mjs |
| status | PARTIAL — code containment active; Cloudflare Git Integration account-level disable pending |

---

# Canonical Source Registry — Governance Artifact Paths

Declared per #1837. Enforcement tooling must reference canonical paths only.

| Artifact | Canonical Path | Derivative Copies |
|---|---|---|
| EXECUTION_SURFACES | `EXECUTION_SURFACES.json` (root) | `governance/runtime/EXECUTION_SURFACES.json`, `runtime/surfaces/EXECUTION_SURFACES.json`, `governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json` |
| BYPASS_PATHS | `BYPASS_PATHS.json` (root) | `governance/runtime/BYPASS_PATHS.json`, `runtime/surfaces/BYPASS_PATHS.json`, `governance/mindshift-validation-bundle/governance/BYPASS_PATHS.json` |
| Schemas | `schemas/` (root) | `runtime/legitimacy/schemas/`, namespace directories |

All derivative copies carry `derived_from`, `canonical_source`, and `generated_at` metadata fields.

CI enforcement: `.github/workflows/merge-governance-check.yml` updated to reference `EXECUTION_SURFACES.json` (canonical).

---

# Canonical Closure Condition

The governance gap registry reaches closure only when:

```text
all state-changing capability
=
fully governed capability
```

AND:

```text
no alternate execution legitimacy path exists
```

Else:

```text
NULL
```
