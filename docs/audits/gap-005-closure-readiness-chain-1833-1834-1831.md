# Closure Readiness Chain Audit — #1833 → #1834 → #1831 (GAP-005)

**Audit date:** 2026-06-07
**Branch:** `claude/audit-closure-gap-005-Y6HSw`
**Scope:** Three linked governance-enforcement audits performed in sequence:

1. Issue #1833 — Agent tool call governance binding (UNKNOWN → GOVERNED classification; reviewer_id validation)
2. Issue #1834 — Operationalize execution surface exhaustiveness (continuous EXECUTION_SURFACES drift detection)
3. Issue #1831 — Governance self-mutation containment (GAP-005), remaining delta after #1833/#1834 review

All three issues are **OPEN**. No PRs or branches referencing #1833 or #1834 exist in the repository history as of this audit.

---

## 1. Issue #1833 — Closure Readiness

**Issue state:** OPEN · labels: `containment`, `enforcement` · Leverage 9/10

### 1.1 Acceptance Criteria Matrix

| ID | Criterion (verbatim) | Finding |
|----|---|---|
| AC-1 | Every agent tool call that can mutate state resolves to `GOVERNED` (via AEO + canonical lifecycle) or `BREAK_GLASS` (observable, auditable) | PARTIAL |
| AC-2 | `BYPASS_PATHS.json` entry for agent tool calls updated from `UNKNOWN` to classified | MISSING |
| AC-3 | `reviewer_id` in `conductAuthorityReview()` validated against `MERGE_ACTOR_REGISTRY.json` or equivalent | MISSING |
| AC-4 | `conductAuthorityReview()` confirmed as sufficient gateway or gap documented with bounded remediation | MISSING |
| AC-5 | Test: agent tool call without valid authority object → fail-closed rejection | PARTIAL |
| AC-6 | Test: authority review with fabricated `reviewer_id` not in registry → rejected | MISSING |

### 1.2 Evidence

**AC-1 / AC-5 — `/agent/tool-call` surface (`AGENT_TOOL_INVOCATION_ROUTE`, `src/index.ts:939`)**

This route enforces the full canonical `/session → /continuity → /authority → /compile → /validate → /execute → /proof` lifecycle and fails closed:

- `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` asserts `status: 'NULL'` with `reason: 'authority_missing' | 'validation_missing' | 'proof_missing' | 'agent_tool_invocation_replay'` for incomplete lineages, and `status: 'READONLY_OBSERVED'` / `runtime_mutated: false` for read-only tools.
- This is genuine evidence that **one** agent-mutation surface resolves to a governed (fail-closed, lineage-bound) outcome — IMPLEMENTED for that surface.

However, a **second, parallel** agent-governance pipeline exists — `src/lib/agent-tool-gateway.ts` + `src/lib/authority-review.ts`, exposed via `/gateway/tool/intercept`, `/gateway/tool/propose`, `/gateway/authority/review`, `/gateway/authority/atao`, `/gateway/tool/compile` (`src/index.ts:940-944`). This pipeline runs Observation → CIP → Proposal → Authority Review → ATAO, and **terminates at `atao_status: "FORMED"`**. Nothing in this path classifies the call as `GOVERNED` or `BREAK_GLASS`, executes the mutation, or produces a proof — so AC-1's "resolves to GOVERNED or BREAK_GLASS" requirement is not demonstrably met for this second surface. Two parallel governance pipelines for the same threat model (agent tool calls) is itself an unresolved structural question the issue implicitly raises (which one is canonical?).

Net: AC-1 PARTIAL (one of two agent-mutation surfaces demonstrably resolves to governed/fail-closed; the gateway/ATAO surface's terminal classification is undefined). AC-5 PARTIAL (the test exists for the `/agent/tool-call` surface only; no equivalent test exists for the `/gateway/tool/*` → ATAO path).

**AC-2 — `BYPASS_PATHS.json` classification**

Per `INVENTORY_SOURCE_MAP.md` (Family 2), the canonical master bypass inventory is the **root** `BYPASS_PATHS.json` (v2.0, consumed by `scripts/bypass-audit-detector.mjs`). It still carries, unchanged:

```
bypass_paths[0]:    bypass_id "ungoverned_agent_tool_call" → governance_class: "UNKNOWN"   (line 19)
topology_surfaces:  surface_id "bypass:agent_tool_call"    → governance_class: "UNKNOWN"   (line 312)
```

Both entries retain `fail_closed_response: "AGENT_TOOL_MUTATION_UNCLASSIFIED -> NULL"`. No update from `UNKNOWN` to a classified state (`GOVERNED`/`PARTIAL`/`BREAK_GLASS`) has been made — **MISSING**, despite the closure test in §1.2 (AC-1) demonstrating that at least one agent-mutation surface now has a governed, lineage-checked, fail-closed implementation that could justify a reclassification (or, at minimum, a documented `PARTIAL` with rationale for the still-ungoverned `/gateway/tool/*` surface).

**AC-3 / AC-4 / AC-6 — `reviewer_id` validation**

`conductAuthorityReview()` (`src/lib/authority-review.ts:180-214`) validates only:

```ts
if (!input.reviewer_id) return { status: "NULL", reason: "missing_reviewer_id" }
```

This is a **truthiness check on a string**, not a registry lookup. A repo-wide search confirms **zero references** to `MERGE_ACTOR_REGISTRY.json` (or any equivalent authorized-reviewer list) from `authority-review.ts`, `agent-tool-gateway.ts`, or the `/gateway/authority/review` handler in `src/index.ts`. `MERGE_ACTOR_REGISTRY.json` exists (`governance/merge-legitimacy/MERGE_ACTOR_REGISTRY.json`, issue #1669/CI-004) but governs **merge actors**, not agent-tool-call **reviewers** — there is no equivalent registry for the latter. The issue's central security claim — "any caller that knows the field name passes the reviewer identity check" — is **confirmed true and unaddressed**.

Consequently:
- AC-3 (registry validation): MISSING — no lookup exists.
- AC-4 (gateway sufficiency confirmed or gap documented): MISSING — no document or code comment addresses whether `conductAuthorityReview()` is a sufficient gateway; the open gap is undocumented.
- AC-6 (test for fabricated `reviewer_id`): MISSING — `tests/issue-1627-agent-tool-gateway.test.mjs` and related gateway tests assert lineage/hash/status checks but never assert rejection of an unregistered `reviewer_id`, because no registry exists to test against.

### 1.3 Closure Determination

```
CLOSURE_OPEN
```

**Rationale:** Of six acceptance criteria, three (AC-2, AC-3/AC-4 combined logically, AC-6) show **zero** implementation evidence, and the issue's two headline concerns — the `UNKNOWN` `BYPASS_PATHS.json` classification and the unvalidated `reviewer_id` — are both verified still-present exactly as described in the issue body. The two PARTIAL items (AC-1, AC-5) reflect real but incomplete progress confined to a *different* surface (`/agent/tool-call`) than the one the issue's reviewer-identity concern targets (`/gateway/authority/review` → `conductAuthorityReview()`). No bounded-remediation document or test addresses the reviewer-identity escalation path named as the issue's second major finding.

### 1.4 Minimal Wedge for Closure

1. Add a `reviewer_id` lookup in `conductAuthorityReview()` against an explicit authorized-reviewer list (either extend `MERGE_ACTOR_REGISTRY.json` with an `agent_tool_review_actors` section, or add a sibling `AGENT_TOOL_REVIEWER_REGISTRY.json`), returning `NULL`/`reason: "reviewer_not_authorized"` for unregistered identities.
2. Add the AC-6 test: fabricated `reviewer_id` → `status: "NULL"`, `reason: "reviewer_not_authorized"`.
3. Reclassify `BYPASS_PATHS.json` (`bypass_id: "ungoverned_agent_tool_call"` and `surface_id: "bypass:agent_tool_call"`) — at minimum to `PARTIAL` with a documented rationale distinguishing the governed `/agent/tool-call` surface from the still-open `/gateway/tool/*` → ATAO termination gap, or fully to `GOVERNED` once item 4 below closes that gap.
4. Document (or implement) the terminal classification of the `/gateway/tool/*` → ATAO pipeline: does `atao_status: "FORMED"` constitute `GOVERNED`, or does the pipeline require an execution+proof stage to complete the canonical lifecycle? This is the AC-4 "gap documented with bounded remediation" requirement.

---

## 2. Issue #1834 — Closure Readiness

**Issue state:** OPEN · labels: `hardening`, `enforcement` · Leverage 8/10

### 2.1 Acceptance Criteria Matrix

| ID | Criterion (verbatim) | Finding |
|----|---|---|
| AC-1 | Automated check on every PR/push compares declared `EXECUTION_SURFACES.json` surfaces against actual repository surfaces | MISSING |
| AC-2 | New mutation-capable surfaces not in `EXECUTION_SURFACES.json` cause CI to fail | MISSING |
| AC-3 | Surface classification changes trigger a governance review signal | MISSING |
| AC-4 | Drift report artifact produced and persisted on each check run | MISSING |
| AC-5 | Test: add a new deployment script not listed → drift detection fires, CI fails | MISSING |
| AC-6 | `GOVERNANCE_GAP_REGISTRY.md` GAP-004 updated on closure | N/A (pending) |

### 2.2 Evidence

**Building blocks that exist but are not wired into CI:**

| Artifact | Role | Evidence class |
|---|---|---|
| `runtime/runtime_surface_scanner.mjs` | Pattern-matches routes in source files, classifies `EXECUTION_CAPABLE` vs `OBSERVABILITY` | Building block — not invoked by CI |
| `runtime/surface_inventory_reconciler.mjs` | Surface-class taxonomy/reconciliation helpers | Building block — not invoked by CI |
| `src/reconciliation/mutation-surface-exhaustiveness.ts` (issue #358) | Static taxonomy: `MUTATION_DRIFT_TAXONOMY` includes `UNDECLARED_MUTATION_SURFACE`, `UNCLASSIFIED_EXECUTION_SURFACE`; declares `AUTHORITATIVE_MUTATION_TABLES` / `EVIDENCE_ONLY_MUTATION_TABLES` | Building block — pure classification module, no repo scan, no CI hook |
| `scripts/bypass-audit-detector.mjs` (the issue's named integration point) | Loads `BYPASS_PATHS.json`-style registries, persists detection events | **Zero references to `EXECUTION_SURFACES`** — confirmed by grep; the named "extend or integrate" target has not been touched |

**CI integration that exists but does not satisfy the AC:**

`merge-governance-check.yml` line 513 reads `runtime/surfaces/EXECUTION_SURFACES.json` — but only to feed `reconcileTopology()` (`runtime/reconciliation/topology-reconciliation-engine.js`), which produces a `TOPOLOGY_RECONCILIATION_SIGNAL.json` cross-registry hash/topology-ancestry reconciliation artifact. This is a **declared-vs-declared** consistency check across governance registries — not a **declared-vs-actual** scan of the repository for undeclared mutation-capable surfaces (workflows, scripts, endpoints, migration paths) as AC-1/AC-2 require. No workflow greps for new `.github/workflows/*`, `scripts/*deploy*`/`*migrat*`, or new runtime routes and diffs them against the inventory.

**GAP-004 registry state** (`GOVERNANCE_GAP_REGISTRY.md:94-106`): `status: OPEN`, `current_state: "Surface inventory exists but requires continuous reconciliation"` — consistent with the absence of any closure work; the registry has not drifted out of sync with reality.

### 2.3 Closure Determination

```
CLOSURE_OPEN
```

**Rationale:** All six acceptance criteria are unimplemented. The conceptual primitives needed (route scanning, mutation-pattern classification, drift taxonomy) already exist scattered across `runtime/runtime_surface_scanner.mjs`, `runtime/surface_inventory_reconciler.mjs`, and `src/reconciliation/mutation-surface-exhaustiveness.ts`, but none are invoked from CI, none compare scan output to `EXECUTION_SURFACES.json`, and the issue's explicitly named integration target (`scripts/bypass-audit-detector.mjs`) contains no `EXECUTION_SURFACES` reference at all. This is closer to "scaffolding exists, gate does not" than `CLOSURE_PARTIAL`.

### 2.4 Minimal Wedge for Closure

1. A CI step (in `merge-governance-check.yml` or a new `surface-drift.yml`) that runs `runtime_surface_scanner.mjs` over `src/`, `.github/workflows/`, `scripts/`, and `migrations/`, diffs the result against `governance/runtime/EXECUTION_SURFACES.json` (the canonical governance-side source per `INVENTORY_SOURCE_MAP.md` Family 1), and fails the run on any `mutation_capable: true` surface absent from the inventory.
2. Persist the diff as a `DRIFT_REPORT.json` artifact (satisfies AC-4) and, on classification changes (not just additions), emit a governance-review signal comparable to the existing `TOPOLOGY_RECONCILIATION_SIGNAL.json` pattern (satisfies AC-3).
3. Add the AC-5 test: a fixture deployment script absent from `EXECUTION_SURFACES.json` → drift check returns a non-empty undeclared-surfaces list / non-zero exit.
4. Flip GAP-004 `status: OPEN → CLOSED` (or `PARTIAL`, if continuous reconciliation is judged to require more than a CI gate) once 1–3 land.

---

## 3. Issue #1831 / GAP-005 — Remaining Delta

**Issue state:** OPEN · labels: `p0`, `enforcement` · Leverage 10/10
**GOVERNANCE_GAP_REGISTRY.md status:** `PARTIAL` (`GOVERNANCE_GAP_REGISTRY.md:110-124`)

### 3.1 What Is Already Closed (verified)

| Acceptance criterion (verbatim) | Status | Evidence |
|---|---|---|
| Mutation to a governance primitive must produce a valid AEO and traverse `/session → /continuity → /authority → /compile` … | IMPLEMENTED (through `/compile`) | `governance-mutation-authorization.yml` builds a GMA via the `/session → /continuity → /authority → /compile` chain, producing a hash-bound `GMA_VALID` artifact at `governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION.json` |
| Changes without valid governed lineage are rejected fail-closed | IMPLEMENTED | `merge-governance-check.yml:314` "Validate governance mutation authorization (GAP-005)" step: rejects with `MERGE_LEGITIMACY_NULL` when GMA is missing, expired, `governed_files_hash` mismatched, missing required fields, status ≠ `GMA_VALID`, `authority_lineage_bound` ≠ true, or mutation class not covered by the GMA |
| Spec defines required GMA structure / hash binding / exemptions | IMPLEMENTED | `governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION_SPEC.json` — self-referential bootstrap exemption for `governance/authorizations/` documented and scoped to a single, non-reusable PR (`GMA_BOOTSTRAP_EXEMPTION`) |

### 3.2 What Remains (the registry's own stated delta, independently verified)

The registry already names the remaining gap precisely: *"Wire `/execute → /proof` stage for governance mutations; add `governance_mutation_proof` to proof registry."* This audit independently confirms it is **fully open**:

- A repo-wide search for `governance_mutation_proof` returns **zero results** — no registry table, JSON schema entry, or proof-emission code references it.
- `governance-mutation-authorization.yml` and `GOVERNANCE_MUTATION_AUTHORIZATION_SPEC.json` both terminate at the `/compile` stage (`GMA_VALID` artifact, `governed_files_hash` binding). Neither references `proof`, `/execute`, or `/proof`.
- `merge-governance-check.yml`'s GAP-005 step *validates* a GMA at merge-gate time but does not *execute* a governance-mutation lifecycle stage or *persist* a proof record after the merge completes — it is purely a pre-merge gate, not an `/execute → /proof` pipeline.
- This leaves issue #1831's third acceptance criterion — *"Proof artifact is generated and persisted for every governance primitive mutation"* — entirely unmet, and the fifth criterion — *"`GOVERNANCE_GAP_REGISTRY.md` GAP-005 status updated to CLOSED on closure"* — correctly still pending (registry shows `PARTIAL`, matching reality).

A secondary, narrower observation: AC's literal wording — *"attempt to mutate a validator without a valid session object → rejected"* — is satisfied at the **artifact-validation** layer (the GMA's `session_id`/`continuity_id`/`decision_id` fields are checked for presence and hash-bound), but **not** at the **registry-resolution** layer the way `/agent/tool-call` does it (i.e., resolving those IDs against live `session_registry`/`continuity_registry`/`authority_registry` rows with status/expiry checks). Whether this distinction matters for closure depends on whether "valid session object" is read as "well-formed GMA artifact" (current state: met) or "live, resolvable session/continuity/authority lineage" (current state: not independently verified by the merge-gate step — it trusts the GMA artifact's self-reported lineage IDs). This is a smaller, second-order gap than the missing proof stage but worth flagging for the closure write-up.

### 3.3 Relationship to #1833 and #1834

Neither #1833 nor #1834 is a declared dependency of #1831 (#1831 names GAP-001, `governed-deploy.yml`, and `RECURSIVE_GOVERNANCE_CONTAINMENT_MODEL.json`). They are **adjacent**, not **blocking**:

- All three issues exhibit the **same structural pattern**: an authorization/classification layer has been built, but the corresponding **evidence-persistence layer** (proof, classification update, drift report) has not. #1833 needs a `BYPASS_PATHS.json` reclassification + reviewer registry; #1834 needs a drift-report artifact; #1831/GAP-005 needs a `governance_mutation_proof` artifact. Closing any one does not unblock the others, but a single proof/evidence-persistence convention applied across all three would be efficient to design once and reuse.
- Practically: closing #1831/GAP-005 does **not** require #1833 or #1834 to close first, and vice versa.

### 3.4 GAP-005 Remaining-Delta Determination

```
CLOSURE_PARTIAL — bounded to a single, well-named wedge
```

**Minimal wedge for GAP-005 → CLOSED** (matches the registry's own `remaining_closure` field):

1. Add a `governance_mutation_proof` table/registry entry (e.g., alongside `merge_proof_registry.jsonl` or as a new append-only D1 table) and a proof-emission step — triggered post-merge for any PR that passed the GAP-005 GMA gate — that persists `{ proof_id, gma_id, governed_files_hash, merge_commit_sha, decision_id, continuity_id, session_id, created_at }`.
2. Add a test: governance-primitive mutation merged with a valid GMA → `governance_mutation_proof` record persisted and hash-bound to the GMA; merged without one → no record (and the merge itself is already blocked by the existing GAP-005 gate).
3. (Optional, strengthens AC fidelity) Have the merge-gate step independently resolve the GMA's `session_id`/`continuity_id`/`authority_id` against live registry rows rather than trusting the artifact's self-reported lineage — closing the secondary gap noted in §3.2.
4. Flip `GOVERNANCE_GAP_REGISTRY.md` GAP-005 `status: PARTIAL → CLOSED` once 1–2 (and ideally 3) land and are demonstrated against a live merge.

---

## Summary

| Issue | Determination | Primary blocker to closure |
|---|---|---|
| #1833 | `CLOSURE_OPEN` | `reviewer_id` accepted as an unvalidated string (no registry lookup); `BYPASS_PATHS.json` agent-tool-call entries still `UNKNOWN`; gateway/ATAO pipeline's terminal `GOVERNED`/`BREAK_GLASS` classification undefined |
| #1834 | `CLOSURE_OPEN` | No CI step compares `EXECUTION_SURFACES.json` against actual repo surfaces; named integration target (`bypass-audit-detector.mjs`) has zero `EXECUTION_SURFACES` references; scaffolding exists but is unwired |
| #1831 (GAP-005) | `CLOSURE_PARTIAL` (registry-confirmed) | `/execute → /proof` stage and `governance_mutation_proof` registry entry — the lifecycle is enforced through `/compile` (GMA gate) but produces no persisted proof artifact for governance mutations |
