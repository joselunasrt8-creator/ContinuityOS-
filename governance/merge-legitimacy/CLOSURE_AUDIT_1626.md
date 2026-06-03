# Closure Audit — Issue #1626: Governed PR / Merge System

**Audit Date:** 2026-06-03
**Repository:** joselunasrt8-creator/mindshift-demo
**Issue:** #1626 — Governed PR / Merge System
**Branch:** claude/issue-1626-closure-audit-BUf5R
**Audit Mode:** Evidence-only topology analysis; non-mutating
**Methodology:** Lineage tracing, governance artifact inventory, acceptance criteria evaluation

---

## Issue Acceptance Criteria

Issue #1626 defines the following success criteria:

```
- Reviewed object hash can be generated deterministically
- Stale reviews are detected when PR head changes
- PREO can be generated from PR metadata without executing merge
- Merge eligibility requires exact reviewed object match
- Merge proof links to PR number, head SHA, merge commit SHA, reviewer state, and PREO hash
- Direct merge / bypass paths are classified as OPEN, PARTIAL, UNKNOWN, or BREAK_GLASS
- No merge execution is introduced by this issue unless separately governed
```

And two invariants from Issue #1604 (Phase 2 anchor):

```
(1) all code admission = single governed merge path
(2) no unresolved merge bypass remains
```

---

## Evidence Collection

### A. Governance Artifacts Located

Repository evidence confirms complete infrastructure for PR merge governance:

```
governance/merge-legitimacy/
├─ MERGE_PROOF_SPEC.json          (operational specification — declared)
├─ MERGE_SURFACE_INVENTORY.json   (surface audit: 11 surfaces classified)
├─ MERGE_BYPASS_INVENTORY.json    (bypass matrix: 10 paths, 9 open)
├─ MERGE_ACTOR_REGISTRY.json      (actor classification)
├─ APPROVAL_LINEAGE_BINDING_SPEC.json (6-stage lineage chain)
├─ MERGE_LINEAGE_MODEL.json       (7-stage governance object)
├─ PR_GOVERNANCE_GAP_LIST.json    (10 documented gaps: 6 closure-blocking)
├─ MERGE_GOVERNANCE_RULES.json    (40+ merge invariants)
├─ merge_proof_registry.jsonl     (42 proof entries appended)
├─ CLOSURE_RECOMMENDATION.md      (Phase 2 audit, 2026-05-31: CLOSURE_NOT_ELIGIBLE)
└─ RISK_CLASSIFICATION_RULES.json (risk tier rules for P1–P3 PRs)
governance/preo/
├─ MERGE_PROOF_SPEC.json          (field specifications, canonicalization)
├─ PREO_SPEC.json                 (PREO field requirements)
├─ PREO.schema.json               (JSON schema for PREO object)
├─ PREO_FLOW.json                 (6-stage PREO lifecycle)
├─ PREO_VALIDATION_RULES.json     (PREO validation rules)
├─ MERGE_LEGITIMACY_CLOSURE_AUDIT_SPEC.json (closure audit specification)
└─ PREO_SPEC.md                   (non-operative governance artifact)
governance/runtime/
├─ MERGE_GOVERNANCE_RULES.json    (canonical governance rules)
├─ BRANCH_PROTECTION_POLICY.json  (branch protection declarations)
└─ PREO_REQUIREMENTS.json         (PREO requirements)
.github/workflows/
├─ merge-governance-check.yml     (PREO/SCO candidate generation)
└─ merge-proof.yml                (post-merge proof generation workflow)
runtime/
└─ merge-object-hash.mjs          (reviewed-object hash computation)
```

### B. Proof Generation Mechanism

**Status: IMPLEMENTED**

Evidence:
- `.github/workflows/merge-proof.yml` runs `on: pull_request: types: [closed]` after merge
- Workflow computes reviewer legitimacy, exact-object admission, and canonical merge proof
- Registry append uses PR-based flow via `MERGE_PROOF_PR_TOKEN` to satisfy branch protection
- `governance/merge-legitimacy/merge_proof_registry.jsonl` contains **42 proof entries**
  - First entry: `PROOF-1712-eefe2771` (merged_at: 2026-06-01)
  - Most recent: `PROOF-1807-b5be40a3` (merged_at: 2026-06-03)
- Each proof entry binds: `proof_id`, `proof_hash`, `pr_number`, `merge_commit_sha`, `merged_at`, `appended_at`
- Proof registry PR flow is operational: proof entries are admitted through governed PR admission (proof-registry/* branches)

**GAP-005 (No merge proof generation mechanism): CLOSED**

### C. Replay Protection

**Status: IMPLEMENTED**

Evidence:
- `migrations/0004_execution_replay_protection.sql` — replay protection index
- `migrations/0041_proof_replay_idempotency.sql` — proof replay idempotency
- Nonce-based replay detection: `invocation_registry` with unique constraint on `(decision_id, validated_object_hash, invocation_nonce)`
- `merge-proof.yml` generates `invocation_nonce` per run via `/proc/sys/kernel/random/uuid`
- Workflow idempotency: checks for existing registry PR before creating another

### D. PREO / SCO Generation

**Status: IMPLEMENTED (Advisory)**

Evidence:
- `.github/workflows/merge-governance-check.yml` generates `PREO_CANDIDATE` and `SCO_CANDIDATE` objects for each PR
- PREO binds: `pr_number`, `repo`, `base_branch`, `head_sha`, `reviewed_paths`, `risk_class`
- SCO binds sovereignty-class PRs to required reviewer authority
- **Enforcement gap:** GitHub branch protection does NOT require these workflow checks as mandatory status checks
- `BRANCH_PROTECTION_POLICY.json`: `enforcement_classification: { current: "partial", activation_status: "ACTIVATION_RECORDED" }`
- Classification: Stage 2 (Advisory) — checks run but are not required for merge

### E. Reviewed-Object Hash

**Status: IMPLEMENTED**

Evidence:
- `runtime/merge-object-hash.mjs` computes reviewed-object hash from PR file set and head SHA
- `merge-proof.yml` step "Verify exact-object admission" calls `checkExactObjectAdmission()`
- Hash binds: `reviewed_head_sha`, `head_sha`, `merge_commit_sha`, `changed_files`, `risk_class`
- Stale review detection: PREO requires `commit_id == head_sha` on approval; mismatch → `LEGITIMACY_NULL`
- Fail-closed: `reviewed_head_sha != head_sha` → `MERGE_LEGITIMACY_NULL`

### F. PR Admission Controls

**Status: PARTIALLY IMPLEMENTED**

Evidence:
- `CODEOWNERS` enforces owner review on `/.github/workflows/**` and `governance/**` paths
- `MERGE_ACTOR_REGISTRY.json` enumerates permitted actors:
  - `joselunasrt8-creator` — repository maintainer
  - `repository_administrator` — admin role (bypass: BREAK_GLASS)
  - `single_contributor_policy.permitted_self_certifiers` — owner self-certification
- **Gap:** `permitted_bot_actors: []` is empty — no bot actors enumerated (GAP-004)
- **Gap:** `authority_roles.sovereignty_review` allowlist empty → P3 PRs produce `LEGITIMACY_NULL`

### G. Merge Authorization Controls

**Status: NOT IMPLEMENTED (external dependency)**

Evidence:
- No runtime merge authorization in repository code
- Branch protection is configuration-only (external to repository code)
- `BRANCH_PROTECTION_POLICY.json` declares enforcement as `advisory`
- **Blocking gap:** GAP-001 — Branch protection enforcement is advisory only
- GAP-002 — Admin bypass cannot be prevented by repository code (structural GitHub permission property)

### H. Merge Bypass Containment

**Status: PARTIAL (1 of 10 bypass paths closed)**

Evidence per `MERGE_BYPASS_INVENTORY.json`:

| Bypass Path | Status |
|---|---|
| MB-001 — Direct push to main | OPEN (external enforcement) |
| MB-002 — Force push to main | OPEN (external enforcement) |
| MB-003 — Admin override | OPEN (BREAK_GLASS) |
| MB-004 — Stale approval timing window | OPEN (depends GAP-001) |
| MB-005 — Merge without PREO | OPEN (advisory only) |
| MB-006 — Merge without SCO | OPEN (advisory only) |
| MB-007 — Workflow-dispatch merge | PARTIAL |
| MB-008 — Approval reuse across PRs | **CLOSED** (PREO head_sha binding) |
| MB-009 — Bot merge with elevated token | OPEN (GAP-004) |
| MB-010 — Merge queue combined SHA | OPEN (GAP-003) |

---

## Implementation Matrix

| Criterion | Status | Evidence |
|---|---|---|
| **Reviewed-object hash (deterministic)** | IMPLEMENTED | `runtime/merge-object-hash.mjs`, `merge-proof.yml` |
| **Stale review detection** | IMPLEMENTED | PREO `commit_id == head_sha` binding; `LEGITIMACY_NULL` on mismatch |
| **PREO generation from PR metadata** | IMPLEMENTED | `merge-governance-check.yml`, `PREO_SPEC.json` |
| **Exact reviewed-object match enforcement** | ADVISORY | Checks run; not required by branch protection |
| **Merge proof linking PR→head→commit→PREO** | IMPLEMENTED | `merge-proof.yml`, 42 registry entries |
| **Bypass path classification** | IMPLEMENTED | `MERGE_BYPASS_INVENTORY.json`: OPEN/PARTIAL/BREAK_GLASS |
| **No merge execution introduced** | SATISFIED | Non-operative; workflow only generates proofs |
| **MERGE AUTHORIZATION** | NOT IMPLEMENTED | Depends on external GitHub branch protection |
| **PROOF PERSISTENCE (append-only)** | IMPLEMENTED | PR-based registry flow; 42 entries |
| **FAIL-CLOSED SEMANTICS** | IMPLEMENTED | Default: `MERGE_LEGITIMACY_NULL` |
| **REPLAY PROTECTION** | IMPLEMENTED | Nonce binding, idempotency checks |

---

## Issue #1626 Success Criteria Evaluation

| Criterion | Status | Notes |
|---|---|---|
| Reviewed object hash generated deterministically | **MET** | `merge-object-hash.mjs` |
| Stale reviews detected when PR head changes | **MET** | PREO `commit_id == head_sha` |
| PREO generated from PR metadata without executing merge | **MET** | `merge-governance-check.yml` |
| Merge eligibility requires exact reviewed object match | **ADVISORY** | Not enforced by branch protection |
| Merge proof links to PR, head SHA, merge commit SHA, reviewer, PREO hash | **MET** | 42 proofs in registry |
| Bypass paths classified as OPEN/PARTIAL/UNKNOWN/BREAK_GLASS | **MET** | `MERGE_BYPASS_INVENTORY.json` |
| No merge execution introduced | **MET** | Non-operative artifacts only |

---

## Unresolved Closure-Blocking Gaps

### GAP-001 — Branch Protection Enforcement Is Advisory Only

**Severity:** HIGH | **Blocks Issue #1626 Closure:** YES (Phase 2 anchor criterion)

Evidence:
- `BRANCH_PROTECTION_POLICY.json`: `enforcement_classification.current: "partial"`, `activation_status: "ACTIVATION_RECORDED"`
- Bypass paths MB-001 (direct push) and MB-002 (force push) remain open
- PREO/SCO checks run but are not required by GitHub branch protection

Required action: Activate GitHub branch protection ruleset on `main` (external repository settings).
Child issue slot: CI-001.

---

### GAP-002 — Admin Bypass Cannot Be Prevented by Repository Code

**Severity:** HIGH | **Blocks Phase 2 closure:** YES

Evidence:
- `MERGE_BYPASS_INVENTORY.json`: MB-003 admin override classified as BREAK_GLASS
- Structural GitHub permission property — repository code cannot restrict admin capabilities
- `MERGE_GOVERNANCE_RULES.json`: *"Branch protection bypass → root authority evidence only; may NEVER create merge legitimacy"*

Required action: Organization-level policy or GitHub Enterprise admin controls (external enforcement).

---

### GAP-003 — Merge Queue Combined SHA Not Covered by PREO

**Severity:** HIGH | **Blocks Phase 2 closure:** YES

Evidence:
- `PR_GOVERNANCE_GAP_LIST.json` GAP-003: enqueued commit SHA differs from original `head_sha`
- `merge-governance-check.yml` binds PREO to PR `head_sha` — not enqueued combined SHA
- Core invariant violated: `reviewed_object ≠ merged_object` for queue-combined commits

Required action: Disable merge queue for `main` OR implement merge-queue PREO regeneration.
Child issue slot: CI-003.

---

### GAP-004 — Bot Merge Actor Not Classified or Authority-Bound

**Severity:** HIGH | **Blocks Phase 2 closure:** YES

Evidence:
- `MERGE_ACTOR_REGISTRY.json`: `permitted_bot_actors: []` (empty)
- MB-009 (bot merge with elevated token) is unclassified
- No authority scope restriction on bot token permissions

Required action: Enumerate permitted bot actors; restrict token scope; classify bot-merged PRs.
Child issue slot: CI-004.

---

### GAP-007 — Phase 1 Deploy Closure Not Yet Confirmed

**Severity:** HIGH | **Blocks Phase 2 closure:** YES

Evidence:
- `CLOSURE_RECOMMENDATION.md`: Phase 2 closure depends on Phase 1 (`#1601`) closure
- No Phase 1 closure confirmation found in current repository state

Required action: Verify Issue #1601 (Phase 1 deploy closure) is closed and confirmed.

---

## Phase 2 Anchor Criteria Evaluation

Issue #1604 defines two required exit criteria:

| Criterion | Status |
|---|---|
| **(1) All code admission = single governed merge path** | **NOT MET** — Multiple PARTIAL and BREAK_GLASS surfaces; branch protection advisory only |
| **(2) No unresolved merge bypass remains** | **NOT MET** — 9 of 10 bypass paths open |

---

## Lineage Chain Evidence

```
ISSUE #1626 (Governed PR / Merge System)
   ↓
MERGE_GOVERNANCE_RULES.json (40+ invariants)
MERGE_PROOF_SPEC.json (specification — declared)
MERGE_LINEAGE_MODEL.json (7-stage lineage — declared)
   ↓
MERGE_SURFACE_INVENTORY.json (11 surfaces classified)
MERGE_BYPASS_INVENTORY.json (10 paths: 1 closed, 9 open)
   ↓
.github/workflows/merge-governance-check.yml (PREO/SCO — IMPLEMENTED)
.github/workflows/merge-proof.yml (proof generation — IMPLEMENTED, operational)
runtime/merge-object-hash.mjs (object hash — IMPLEMENTED)
   ↓
governance/merge-legitimacy/merge_proof_registry.jsonl (42 proofs appended)
   ↓
BRANCH_PROTECTION_POLICY.json (enforcement: advisory — not activated) ← GAP-001
MERGE_ACTOR_REGISTRY.json (permitted actors: human enumerated, bot empty) ← GAP-004
PR_GOVERNANCE_GAP_LIST.json (6 closure-blocking gaps documented)
   ↓
CLOSURE_AUDIT_1626.md (THIS DOCUMENT — 2026-06-03: CLOSURE_PARTIAL)
```

---

## Closure Determination

```
┌────────────────────────────────────────────────────────┐
│ CLOSURE DETERMINATION — Issue #1626                    │
├────────────────────────────────────────────────────────┤
│ Status:                                                │
│   CLOSURE_PARTIAL                                      │
│                                                        │
│ Reason:                                                │
│   Issue #1626 success criteria: 6 of 7 MET            │
│   (1 criterion ADVISORY — exact-object enforcement     │
│   not required by branch protection)                   │
│                                                        │
│   Phase 2 anchor criteria (from #1604):                │
│   NOT MET — single governed merge path not enforced    │
│   NOT MET — 9 of 10 bypass paths remain open          │
│                                                        │
│   Deliverables: COMPLETE                               │
│   Implementation: SUBSTANTIALLY COMPLETE               │
│   Enforcement: ADVISORY ONLY                           │
│   Proof registry: OPERATIONAL (42 entries)             │
│   Remaining closure-blocking gaps: 4 (GAP-001, -002,  │
│     -003, -004, -007)                                  │
│                                                        │
│ Next Required Actions:                                 │
│   CI-001 — Activate branch protection on main         │
│   CI-003 — Contain merge queue SHA gap                │
│   CI-004 — Enumerate and bound merge actor authority  │
│   GAP-007 — Confirm Phase 1 (#1601) closure           │
│   GAP-002 — Org-level admin bypass prevention         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Audit Statement

**Evidence boundary:** This audit is limited to repository-visible artifacts as of 2026-06-03. Runtime proof requires external verification of branch protection activation.

**Documentation ≠ Enforcement:** `BRANCH_PROTECTION_POLICY.json` declares required controls; actual GitHub branch protection must be activated externally by a repository admin.

**Visibility ≠ Containment:** PREO/SCO workflows run and generate governance candidates; these are advisory until branch protection requires them as status checks.

**Proof registry operational:** 42 merge proofs generated and persisted via governed PR admission as of audit date. GAP-005 (no proof generation mechanism) is closed.

**Approved bypass:** MB-008 (approval reuse across PRs) is closed by PREO `head_sha` binding. No other bypass paths are closed.

---

*No runtime mutation, validator behavior change, authority creation, proof generation, registry mutation, reconciliation execution, topology mutation, deployment, merge, or execution claim is implied by this document.*
