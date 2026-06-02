---
issue_lineage: #1609 topology compression; phase issue #1604 closure planning
phase_lineage: Historical Phase 2 closure matrix; predecessor inventory/closure evidence used by #1760 reduction eligibility
status: Archived historical closure artifact; non-authoritative evidence
archive_classification: archive/closure/phase-matrix
relocated_from: /PHASE2_CLOSURE_MATRIX.md
relocated_to: /artifacts/closure/phase-matrices/PHASE2_CLOSURE_MATRIX.md
relocation_date: 2026-06-02
authority_note: This artifact is observational/archive evidence only; it does not grant authority or alter governance enforcement.
---

# PHASE2_CLOSURE_MATRIX

**Repository:** joselunasrt8-creator/mindshift-demo
**Branch:** claude/session-1604-YPAQp
**Date:** 2026-05-31
**Mode:** Non-operative. Derived exclusively from existing repository state.

---

## Closure Type Classification

```text
#1604 closure type:
PLANNING_CLOSURE_COMPLETE

Enforcement closure status:
ENFORCEMENT_CLOSURE_NOT_ELIGIBLE
```

**Rationale:**

Planning closure is complete. All six required deliverables exist:

| Deliverable | Artifact | Status |
|---|---|---|
| Merge surface inventory | `governance/merge-legitimacy/MERGE_SURFACE_INVENTORY.json` | COMPLETE |
| Merge bypass inventory | `governance/merge-legitimacy/MERGE_BYPASS_INVENTORY.json` | COMPLETE |
| Approval lineage binding spec | `governance/merge-legitimacy/APPROVAL_LINEAGE_BINDING_SPEC.json` | COMPLETE |
| Merge proof specification | `governance/merge-legitimacy/MERGE_PROOF_SPEC.json` | COMPLETE |
| Remaining gap list | `governance/merge-legitimacy/PR_GOVERNANCE_GAP_LIST.json` | COMPLETE |
| Closure recommendation | `governance/merge-legitimacy/CLOSURE_RECOMMENDATION.md` | COMPLETE |

Enforcement closure is not yet eligible because:

```text
(1) all code admission ≠ single governed merge path
(2) unresolved merge bypass paths exist
(3) 5 child enforcement gaps require dedicated follow-up issues
(4) Phase 1 (#1601) dependency is AUDIT_PENDING
```

**Stage mapping** (`governance/runtime/ENFORCED_BOUNDARY_ROADMAP.json`):

```text
Current:  Stage 2 — Advisory
          Workflows run and generate PREO/SCO candidates.
          Checks are not required by branch protection.

Target:   Stage 4 — Branch-Protected Enforcement
          Direct push restricted, PRs required,
          required checks must pass, admin bypass policy active.
```

Enforcement closure requires completing all child issues below AND confirmed Phase 1 closure.

---

## Closure Sequence

```
#1601  (Phase 1 — Deploy Closure)
         ↓
  ┌──────┴──────┐
  │ Child issues │  (opened against #1604)
  │  CI-001      │
  │  CI-002      │
  │  CI-003      │
  │  CI-004      │
  │  CI-005      │
  └──────┬──────┘
         ↓
#1604  (Phase 2 — PR Governance Closure)
```

#1604 can move to CLOSED only when:

```text
#1601 is verified closed
AND
CI-001 through CI-005 are all verified closed
```

---

## Child Issue Definitions

Five gaps require dedicated child issues. Each converts a documented enforcement blocker
into a bounded follow-up task. Scope must not widen beyond the stated smallest change.

---

### CI-001 — Branch Protection Activation and Verification

**Maps to:** GAP-001
**Title:** Activate and verify branch protection enforcement on main

**Smallest change:**

1. Repository admin activates GitHub branch protection on `main` matching
   `governance/runtime/BRANCH_PROTECTION_POLICY.json` — specifically:
   - `require_pull_request_before_merge: true`
   - `required_approving_review_count: 1`
   - `dismiss_stale_reviews: true`
   - `require_status_checks: true` with checks: `merge-governance-check`, `generate-preo-candidate`, `generate-sco-candidate`
   - `require_branch_up_to_date_before_merge: true`
   - `restrict_direct_push_to_main: true`
   - `allow_force_pushes: false`
2. Add a branch protection verification entry to `governance/runtime/BRANCH_PROTECTION_POLICY.json`
   confirming activation date and enforcing actor.

**Files affected:**

| File | Change |
|---|---|
| `governance/runtime/BRANCH_PROTECTION_POLICY.json` | Add `enforcement_activation` record |

**Closure risk:** LOW (external admin action; single policy artifact update)

**Closes:** GAP-001, MB-001, MB-002, MB-003, MB-010 (enforcement now active for all four)

---

### CI-002 — Merge Proof Generation Workflow

**Maps to:** GAP-005
**Title:** Implement post-merge proof generation workflow

**Smallest change:**

Add `.github/workflows/merge-proof.yml` triggered on `pull_request: types: [closed]` when
`github.event.pull_request.merged == true`. Workflow must:

1. Generate a merge proof object binding all fields defined in
   `governance/merge-legitimacy/MERGE_PROOF_SPEC.json`:
   - `pr_number`, `head_sha`, `merge_commit_sha`, `merged_by`, `merged_at`
   - `preo_id` (from PREO_CANDIDATE artifact of the merge run)
   - `sco_id` (from SCO_CANDIDATE artifact, if governed path)
   - `review_status`, `checks_status`
   - `invocation_nonce` (fresh UUID per run)
2. Upload proof as a workflow artifact named `MERGE_PROOF`.
3. Write proof hash to a durable append-only registry
   (`governance/merge-legitimacy/merge_proof_registry.jsonl`).

**Files affected:**

| File | Change |
|---|---|
| `.github/workflows/merge-proof.yml` | New file |
| `governance/merge-legitimacy/merge_proof_registry.jsonl` | New file (append-only registry seed) |

**Closure risk:** MEDIUM (new workflow; proof storage is append-only artifact, not runtime mutation)

**Closes:** GAP-005

---

### CI-003 — Merge Queue Containment

**Maps to:** GAP-003
**Title:** Classify and contain merge queue combined-SHA gap

**Smallest change (preferred option a):**

Add `merge_queue_policy` to `governance/runtime/MERGE_GOVERNANCE_RULES.json`:

```json
"merge_queue_policy": {
  "status": "DISABLED_FOR_GOVERNED_BRANCHES",
  "rationale": "Merge queue may produce a combined commit SHA not covered by original PREO/SCO. Until merge-queue-specific PREO regeneration is implemented, merge queue is classified as MERGE_LEGITIMACY_NULL for governed branches.",
  "governed_branches": ["main"],
  "closure_condition": "Merge queue re-enabled only after CI-003b (queue-SHA PREO regeneration) is implemented and required."
}
```

Then add a validation assertion in the merge-governance-check workflow that fails if the
triggering event is a `merge_group` event (detecting merge queue attempts).

**Files affected:**

| File | Change |
|---|---|
| `governance/runtime/MERGE_GOVERNANCE_RULES.json` | Add `merge_queue_policy` field |
| `.github/workflows/merge-governance-check.yml` | Add `merge_group` event check |

**Closure risk:** LOW (policy declaration + single workflow guard)

**Closes:** GAP-003, MB-007

---

### CI-004 — Merge Actor Classification

**Maps to:** GAP-004
**Title:** Enumerate and authority-bound permitted merge actors

**Smallest change:**

Create `governance/merge-legitimacy/MERGE_ACTOR_REGISTRY.json` declaring:
- Permitted human merge actors (by role, not individual identity)
- Permitted bot actors (explicit allowlist — empty until a bot is formally classified)
- Forbidden actor patterns (elevated-scope tokens, unrecognized bots)
- Result for unclassified actors: `MERGE_LEGITIMACY_NULL`

Add a validation step to `.github/workflows/merge-governance-check.yml` that reads
`merged_by` from the event context and verifies it against the actor registry.

**Files affected:**

| File | Change |
|---|---|
| `governance/merge-legitimacy/MERGE_ACTOR_REGISTRY.json` | New file |
| `.github/workflows/merge-governance-check.yml` | Add actor classification check |

**Closure risk:** LOW (new artifact + single workflow validation step)

**Closes:** GAP-004, MB-009

---

### CI-005 — Reviewer Legitimacy Enforcement at Merge Time

**Maps to:** GAP-010
**Title:** Enforce reviewer legitimacy in PREO generation

**Smallest change:**

Extend the `generate-preo-candidate` step in `.github/workflows/preo-candidate.yml`
(or `merge-governance-check.yml`) to validate:

1. Reviewer is not the PR author (`reviewer_login != pr_author_login`)
2. Reviewer has at least one approved review with a non-stale submission timestamp
3. For PRs with `risk_class: P3`, at least one reviewer with a declared sovereignty-review
   authority role (enumerated in the actor registry from CI-004)

PREO_CANDIDATE `review_status` transitions from `UNVERIFIED` to `APPROVED` only when all
three conditions pass. Failed validation sets `review_status: LEGITIMACY_NULL`.

**Files affected:**

| File | Change |
|---|---|
| `.github/workflows/preo-candidate.yml` | Add reviewer legitimacy validation step |

**Closure risk:** LOW (additive validation step; no schema or runtime change)

**Closes:** GAP-010

---

## Non-Child Gap Dispositions

The following gaps do not require new child issues. Their disposition is fixed.

| Gap | Disposition | Reason |
|---|---|---|
| GAP-002 — Admin bypass | **External constraint** — not a code gap. GitHub org-level enforcement cannot be addressed by repository code. Classified as root authority evidence; admin bypass events must be recorded in an external audit log outside this repository. Remains OPEN until org-level policy is confirmed active externally. | Structural property of GitHub permission model |
| GAP-006 — Workflow-dispatch surface | **Inline resolution** — enumerate workflows with write:contents in `MERGE_SURFACE_INVENTORY.json`. No current workflow performs a direct merge; this is a classification gap, not an enforcement gap. Single artifact update. | Low complexity; does not require an independent issue |
| GAP-007 — Phase 1 dependency | **Dependency** — this gap IS issue #1601. Closes when #1601 closes. No new issue needed. | #1601 is the tracking vehicle |
| GAP-008 — Auto-merge stale timing | **Resolves with CI-001** — auto-merge stale timing gap closes when GAP-001 closes (dismiss_stale_reviews becomes active at branch protection level). No independent issue. | Dependent on GAP-001 |
| GAP-009 — External bot auto-merge | **Inline resolution** — Dependabot and Renovate are not configured. A one-line policy declaration in `MERGE_SURFACE_INVENTORY.json` (MS-011 `classification: DISABLED_NOT_CONFIGURED`) closes this. Single artifact update. | Not currently active; low complexity |

---

## Exit Criteria

Issue #1604 may move toward CLOSED only when:

```text
#1601 (Phase 1 — Deploy Closure) is verified CLOSED
AND
CI-001 — Branch protection verified active
AND
CI-002 — Merge proof generation workflow implemented
AND
CI-003 — Merge queue containment implemented
AND
CI-004 — Merge actor registry implemented
AND
CI-005 — Reviewer legitimacy enforcement implemented
```

and:

```text
all code admission = single governed merge path
and
no unresolved merge bypass remains
```

#1604 is an **audit gate**, not an implementation task. It closes only after all child
issues are verified closed and Phase 1 dependency is resolved.

---

## Canonical Compression

```text
#1604 planning closure:
COMPLETE

#1604 enforcement closure:
NOT ELIGIBLE — 5 child enforcement issues + Phase 1 dependency remain

No valid merge object → no code admission.
```

*No runtime mutation, validator behavior change, authority creation, proof generation,
registry mutation, reconciliation execution, topology mutation, deployment, merge, or
execution claim is implied by this document.*
