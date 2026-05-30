# PHASE1_CLOSURE_MATRIX

**Repository:** joselunasrt8-creator/mindshift-demo
**Branch:** claude/open-issues-audit-zp7WN
**Date:** 2026-05-30
**Mode:** Non-operative. Derived exclusively from existing repository state.

---

## Closure Sequence

```
#1581  →  #1485  →  #1601
```

`#1581` must resolve first: its migration P0 blocks all test execution.
`#1485` depends on migration bootstrap to run runtime tests.
`#1601` cannot close until #1581, #1485, and all named sub-deliverables (#1502, #1570, #1593, #1594, #1616) are verified.

---

## Issue #1581

**Title:** P0: Fix migration ordering for finality_classification_registry in 0053 migration
**Type:** Implementation
**Priority:** P0 — cascade blocker

### Dependency

None. Independent. Blocks all downstream test execution.

### Root Cause (derived from repository state)

`migrations/0053_finality_classification_convergence_valid.sql` drops and recreates `finality_classification_registry` via a three-step pattern:

```
Step 1: CREATE TABLE finality_classification_registry_v2
Step 2: INSERT INTO _v2 SELECT * FROM finality_classification_registry
Step 3: DROP TABLE finality_classification_registry          ← staleness introduced here
Step 4: ALTER TABLE _v2 RENAME TO finality_classification_registry
```

Migrations 0049–0052 each define a cross-table trigger on a dependent registry that references `finality_classification_registry` in its trigger body:

| Trigger Name | Host Table | Defined In |
|---|---|---|
| `csr_finality_class_must_exist` | `conflict_set_registry` | `0049_conflict_set_registry.sql` |
| `qar_finality_class_must_exist` | `quorum_attestation_registry` | `0050_quorum_attestation_registry.sql` |
| `rlr_finality_class_must_exist` | `revocation_liveness_registry` | `0051_revocation_liveness_registry.sql` |
| `er_finality_class_must_exist` | `epoch_registry` | `0052_epoch_registry.sql` |

When `DROP TABLE finality_classification_registry` executes in step 3, these triggers become internally stale. Although step 4 restores the table name via `RENAME`, the trigger bodies retain a stale reference to the dropped object in the D1/SQLite execution environment. When any of the host tables receive an INSERT with a non-null `finality_classification_id`, the trigger fires and produces:

```
error in trigger csr_finality_class_must_exist:
no such table: main.finality_classification_registry
```

### Files

| File | Role |
|---|---|
| `migrations/0053_finality_classification_convergence_valid.sql` | **Primary fix target** — add DROP/RECREATE steps |
| `migrations/0049_conflict_set_registry.sql:107–116` | Source definition of `csr_finality_class_must_exist` |
| `migrations/0050_quorum_attestation_registry.sql:100–110` | Source definition of `qar_finality_class_must_exist` |
| `migrations/0051_revocation_liveness_registry.sql:91–101` | Source definition of `rlr_finality_class_must_exist` |
| `migrations/0052_epoch_registry.sql:144–154` | Source definition of `er_finality_class_must_exist` |

### Failing Tests

| Test File | Failure Mode |
|---|---|
| `tests/registry-lineage-migrations.test.mjs` | **Primary failure** — applies full migration chain; aborts at 0053 execution |
| `tests/fate/issue-1342-conflict-set-registry.test.mjs` | Trigger integrity check fails |
| `tests/fate/issue-1340-finality-classification-registry.test.mjs` | Schema/migration assertion failures |
| `tests/fate/issue-1249-epoch-registry.test.mjs` | `er_finality_class_must_exist` trigger check |
| `tests/session-runtime.test.mjs` | D1 schema bootstrap fails |
| `tests/fate/authority-lifecycle-consumption.test.mjs` | Downstream — requires clean migration chain |
| `tests/fate/proof-lineage-enforcement.test.mjs` | Downstream — requires clean migration chain |
| `tests/issue-869-install-base-telemetry-event-schema.test.mjs` | Downstream — requires clean migration chain |
| `tests/issue-890-deployment-provenance-registry.test.mjs` | Downstream — requires clean migration chain |

All downstream test failures are cascade effects of the migration abort; they are not independent bugs.

### Acceptance Criteria (from issue body)

- [ ] Clean migration bootstrap from empty database
- [ ] No references to nonexistent registry tables during migration chain
- [ ] Registry lineage migration suite passes migration phase
- [ ] `tests/registry-lineage-migrations.test.mjs` passes
- [ ] All four cross-table triggers fire correctly after migration 0053 completes

### Smallest Change Set

**One file. One migration.** Add a new step 3a (before DROP) and a new step 4a (after RENAME) to `0053_finality_classification_convergence_valid.sql`:

```
Step 3a: DROP TRIGGER IF EXISTS csr_finality_class_must_exist
         DROP TRIGGER IF EXISTS qar_finality_class_must_exist
         DROP TRIGGER IF EXISTS rlr_finality_class_must_exist
         DROP TRIGGER IF EXISTS er_finality_class_must_exist
Step 3:  DROP TABLE finality_classification_registry       (existing)
Step 4:  RENAME _v2 → finality_classification_registry    (existing)
Step 4a: RECREATE all four triggers (same definitions as in 0049–0052)
```

No schema semantics change. No data change. Trigger logic is identical to original definitions.

### Closure Risk

**LOW.** Single-file SQL change. No schema mutation. Trigger definitions are identical to their originals. No test logic changes required.

---

## Issue #1485

**Title:** Fix OpenClaw govern ancestry enforcement to use persisted lineage state
**Type:** Validation (runtime regression tests)
**Priority:** Security / governance regression

### Dependency

Depends on `#1581` (migration bootstrap must succeed for runtime tests to execute).

### Current State (derived from repository state)

The implementation in `src/index.ts` is present and structurally correct as of the current branch state:

**`requiresGovernEnvelopeLineage` (lines 204–209):**
```typescript
async function requiresGovernEnvelopeLineage(env, decision_id, payload) {
  const persisted_govern_envelope_id =
    await resolvePersistedGovernedEnvelopeId(env, decision_id)  // queries authority_registry
  if (persisted_govern_envelope_id)
    return { required: true, persisted_govern_envelope_id }   // persisted state takes precedence
  if (isOpenClawOriginPayload(payload))
    return { required: true, persisted_govern_envelope_id: "" } // fallback to caller markers
  return { required: false }
}
```

**`/validate` route (lines 7965–7975):** calls `requiresGovernEnvelopeLineage` before any request parameter is consumed.

**`/proof` route (lines 8164–8174):** identical pattern.

**Gap:** The existing test file `tests/issue-1464-openclaw-govern-lineage-validate-proof.test.mjs` (36 lines) is **entirely composed of static source regex assertions** (`assert.match(source, /pattern/)`). It reads `src/index.ts` as a text string and verifies that code patterns are present. It does NOT:
- Create a test database
- Insert an authority row with `governed_tool_envelope_id` populated
- Issue HTTP requests to `/validate` or `/proof`
- Verify runtime enforcement behavior when origin markers are omitted

The issue requires **6 runtime regression tests** that prove the implementation is correct under actual request conditions.

### Files

| File | Role |
|---|---|
| `src/index.ts` lines 192–243 | All relevant helper functions |
| `src/index.ts` lines 7961–7975 | `/validate` route enforcement call site |
| `src/index.ts` lines 8159–8174 | `/proof` route enforcement call site |
| `tests/issue-1464-openclaw-govern-lineage-validate-proof.test.mjs` | Existing static assertion tests (36 lines) — runtime tests must be added here |

### Relevant Schema Column

`authority_registry.governed_tool_envelope_id TEXT` — defined at `src/index.ts:1443`.
This column is the persisted enforcement trigger. Its presence determines whether governance enforcement is required, independent of request body content.

### Tests Required (from issue body)

All six must be **runtime tests** (not source regex assertions):

| # | Test Description | Verifies |
|---|---|---|
| 1 | `/validate` enforces govern envelope lineage when `authority_registry.governed_tool_envelope_id` exists **even if `origin` and `nonce_domain` are omitted** | Persisted state drives enforcement, not caller markers |
| 2 | `/proof` enforces govern ancestry when `authority_registry.governed_tool_envelope_id` exists **even if `origin` and `nonce_domain` are omitted** | Same, for proof route |
| 3 | Body-provided conflicting `govern_envelope_id` does not override persisted `governed_tool_envelope_id` | `ambiguousReason` is returned on conflict |
| 4 | Non-governed decision without persisted `governed_tool_envelope_id` preserves existing behavior | No regression for non-OpenClaw flows |
| 5 | Invalid persisted govern envelope hash fails closed | Hash mismatch → `govern_envelope_hash_mismatch` / `govern_ancestry_hash_mismatch` |
| 6 | Missing persisted govern envelope record fails closed | Missing record → `govern_envelope_missing` / `govern_ancestry_missing` |

**Test command (from issue body):**
```bash
node --import tsx --test tests/issue-1464-openclaw-govern-lineage-validate-proof.test.mjs
npx tsc --noEmit
```

### Acceptance Criteria (from issue body)

- [ ] `/validate` enforces lineage from `authority_registry.governed_tool_envelope_id` regardless of `origin`/`nonce_domain` presence in request body
- [ ] `/proof` enforces lineage from `authority_registry.governed_tool_envelope_id` regardless of `origin`/`nonce_domain` presence in request body
- [ ] Body-provided `govern_envelope_id` that conflicts with persisted value returns `govern_envelope_ambiguous` / `govern_ancestry_ambiguous`
- [ ] Non-governed decision (no persisted `governed_tool_envelope_id`, no OpenClaw markers) is unaffected
- [ ] Invalid hash on persisted envelope fails closed with correct reason code
- [ ] Missing persisted record fails closed with correct reason code
- [ ] `npx tsc --noEmit` clean

### Smallest Change Set

**One file: `tests/issue-1464-openclaw-govern-lineage-validate-proof.test.mjs`.**
Add 6 runtime test cases after the existing 6 static assertions. The implementation in `src/index.ts` appears structurally correct; no source change is anticipated unless a runtime test reveals a defect.

If a runtime test reveals a defect, the fix is contained to `src/index.ts` within `requiresGovernEnvelopeLineage` (lines 204–209) or the `/validate` / `/proof` call sites (lines 7965–7975, 8164–8174).

### Closure Risk

**MEDIUM.** No anticipated code change; risk is in test harness setup (requires D1-compatible test database with `authority_registry` schema, which is blocked until #1581 resolves). If #1581 is clean, this becomes LOW risk.

---

## Issue #1601

**Title:** Phase 1 Anchor — Canonical GitHub Deploy Closure
**Type:** Governance / Audit
**Priority:** Gate for all phases 2–6

### Dependency

Depends on `#1581` (migration bootstrap), `#1485` (runtime verification), and the five linked sub-issues:

| Sub-Issue | Title | Required Deliverable |
|---|---|---|
| #1502 | Lock GitHub CI/CD Deploy Surface | Governed workflow as canonical deploy entrypoint; direct wrangler path classified as bypass |
| #1570 | FATE: fail-closed coverage for pre-execution runtime routes | Test coverage for /session, /continuity, /authority under invalid lineage, revoked continuity, expired authority |
| #1593 | P0: Identity Continuity Closure Hardening | Orphan rejection, recursive revocation, freshness validation, expiry enforcement |
| #1594 | P1: Execution to Proof Lineage Binding | intent→validation→execution→proof→registry chain; registry binding verification |
| #1616 | Workflow Ownership Closure Audit | Governing policy artifacts for prepare-governed-deploy.yml, constitutional-integrity.yml, conformance.yml |

### Current State (derived from repository state)

| Deliverable | Status | Evidence |
|---|---|---|
| Canonical deploy route implemented | **PRESENT** | `src/index.ts`: all 7 routes at lines 7589, 7601, 7747, 7787, 7961, 8043, 8159 |
| Governed deploy workflow | **PRESENT** | `.github/workflows/governed-deploy.yml` (25,161 bytes); full 7-step chain with REPLAY_TEST proving nonce reuse → NULL |
| Bypass inventory | **PRESENT** | `runtime/bypass_paths.json` (13 classes), `runtime/REVERSE_CLOSURE_MUTATION_MAP.json` (22 surfaces, RCM-001–RCM-022), `runtime/unauthorized_mutation_path_closure_audit.json` (CLOSED_CLASSIFICATION_COMPLETE) |
| Exact-object enforcement (AEO) | **PRESENT** | `validated_object_hash` bound through /compile → /validate → /execute → /proof; `runtime/legitimacy/schemas/AEO.schema.json` |
| Replay containment | **PRESENT** | `invocation_nonce` single-use in `invocation_registry` (PRIMARY KEY on `decision_id, validated_object_hash, invocation_nonce`); REPLAY_TEST in governed-deploy.yml |
| Fail-closed validation | **PRESENT** | All routes return `NULL` on guard failure; `constitutional-integrity.yml` enforces route immutability |
| Deploy lineage proof | **PRESENT** | `/proof` captures: `decision_id`, `authority_id`, `execution_id`, `validated_object_hash`, `invocation_nonce`, `run_id`, `commit_sha`, `environment`, `session_id`, `continuity_id` |
| FATE test coverage | **PRESENT** | 160+ test files in `tests/fate/`; coverage for all 7 routes |
| Workflow ownership declarations | **PARTIAL** | `.github/CODEOWNERS` covers workflows; BUT `prepare-governed-deploy.yml`, `constitutional-integrity.yml`, `conformance.yml` lack explicit **governing policy artifact** references (issue #1616) |
| Continuity hardening | **PARTIAL** | `src/continuity-lineage-closure-hardening.ts` exists; BUT orphan rejection, recursive revocation propagation, continuity freshness validation acceptance criteria (issue #1593) are not verified closed |
| Execution-to-proof lineage | **PARTIAL** | Chain enforced in routes; BUT FATE coverage for lineage failure paths (acceptance criteria in issue #1594) not verified complete |
| FATE pre-execution route coverage | **PARTIAL** | `tests/fate/session-continuity.test.mjs`, `continuity-lineage*.test.mjs` exist; BUT issue #1570's specific criteria (missing API key, revoked continuity, expired lineage under ancillary routes) not verified as fully closed |

### Files

**Workflow files (governance boundary):**

| File | Purpose | Ownership Gap |
|---|---|---|
| `.github/workflows/governed-deploy.yml` | Full canonical 7-step deploy chain | None — fully governed |
| `.github/workflows/prepare-governed-deploy.yml` | Creates session, continuity, authority, compile artifacts | **No governing policy artifact** (#1616) |
| `.github/workflows/constitutional-integrity.yml` | PR classification matrix, route drift detection | **No governing policy artifact** (#1616) |
| `.github/workflows/conformance.yml` | Non-operative governance boundary assertions | **No governing policy artifact** (#1616) |
| `.github/workflows/merge-governance-check.yml` | PR merge governance enforcement | Covered by merge governance rules |
| `.github/workflows/sco-candidate.yml` | SCO generation | Covered by release governance |
| `.github/workflows/preo-candidate.yml` | PREO generation | Covered by branch protection policy |

**Runtime implementation:**

| File | Purpose |
|---|---|
| `src/index.ts` (lines 7589–8200+) | All 7 canonical route handlers |
| `src/governed-deploy.ts` | DeployATAO, DeployAEO, validateDeployATAO, buildDeployAEO |
| `src/runtime/continuity/verifyContinuityLineage.ts` | Continuity verification |
| `src/runtime/lineage/verifyLineageOrigin.ts` | Lineage origin enforcement |
| `src/runtime/deployment/verifyDeploymentProof.ts` | Deploy proof verification |
| `src/continuity-lineage-closure-hardening.ts` | Continuity closure enforcement |
| `src/distributed-continuity-lineage-reconciliation.ts` | Distributed continuity |

**Runtime artifacts:**

| File | Status |
|---|---|
| `runtime/bypass_paths.json` | CLOSED — 13 bypass classes, all → NULL |
| `runtime/REVERSE_CLOSURE_MUTATION_MAP.json` | 22 surfaces classified, issue #383 |
| `runtime/unauthorized_mutation_path_closure_audit.json` | CLOSED_CLASSIFICATION_COMPLETE |
| `runtime/residual_exploitability_report.json` | All 22 surfaces adversarially verified |
| `runtime/deploy_audit_registry.json` | 60+ entries; active audit log |
| `runtime/CANONICAL_BOUNDARY_MANIFEST.json` | replay_safe: true |

**Tests:**

| Test File | Coverage |
|---|---|
| `tests/fate/session-continuity.test.mjs` | /session, /continuity |
| `tests/fate/canonical-authority.test.mjs` (378 lines) | /authority, authority lifecycle |
| `tests/fate/continuity-lineage*.test.mjs` (6 files) | Continuity lineage, revocation, orphaning |
| `tests/fate/proof-lineage-enforcement.test.mjs` | Proof lineage |
| `tests/fate/replay-attacks.test.mjs` | Replay containment |
| `tests/fate/exact-object-enforcement.test.mjs` | AEO hash binding |
| `tests/fate/issue-1349-execute-boundary.test.mjs` | /execute boundary |
| `tests/fate/issue-695-adversarial-execution-verification.test.mjs` | Adversarial bypass verification |
| `tests/fate-governed-deploy-closure.test.mjs` | End-to-end governed deploy |

### Acceptance Criteria (from issue body)

**Deploy Surface Inventory:**
- [ ] All state-changing deploy capability = fully governed deploy capability
- [ ] No alternate execution path remains unresolved

**Bypass Inventory Closure:**
- [ ] All bypass paths classified: GOVERNED / PARTIAL / BREAK_GLASS / UNKNOWN
- [ ] No UNKNOWN bypass path remaining

**Deploy Lineage Proof:**
- [ ] Proof reconstructs: decision → authority → validation → execution → proof
- [ ] Required fields present: decision_id, authority_reference, validation_id, validated_object_hash/AEO hash, workflow run_id, commit_sha, environment, timestamp, proof_reference

**Exact-Object Enforcement:**
- [ ] `validated_object == executed_object` verified
- [ ] No mutation permitted after validation

**Replay Containment:**
- [ ] Invocation nonce uniqueness enforced
- [ ] Lineage uniqueness enforced
- [ ] Deploy replay rejected

**Fail-Closed Validation:**
- [ ] Deployment fails unless: VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE

**Sub-Issue Closure:**
- [ ] #1502 closed — CI/CD deploy surface formally locked
- [ ] #1570 closed — FATE coverage for /session, /continuity, /authority complete
- [ ] #1593 closed — continuity hardening (orphan rejection, recursive revocation, freshness, expiry)
- [ ] #1594 closed — execution-to-proof lineage fully verified
- [ ] #1616 closed — workflow ownership declarations for all 3 unowned workflows

### Smallest Change Set

`#1601` has no single-file fix. It requires **verified closure of 5 sub-issues**, each with its own smallest change set:

| Sub-Issue | Smallest Change |
|---|---|
| #1502 | Formal closure statement; `governed-deploy.yml` and `conformance.yml` already enforce the requirement; closure audit entry in `runtime/deploy_audit_registry.json` |
| #1570 | Add FATE tests for ancillary route failure paths: missing API key → NULL, revoked continuity → NULL, expired authority → NULL (in `tests/fate/` targeting /session, /continuity, /authority) |
| #1593 | Verify or add: orphan continuity detection, revocation cascade in `src/continuity-lineage-closure-hardening.ts`; FATE test coverage for each failure path |
| #1594 | Verify or add: FATE tests covering registry binding failure, stale lineage detection, reconciliation lineage equivalence |
| #1616 | Add governing policy artifact references to `prepare-governed-deploy.yml`, `constitutional-integrity.yml`, `conformance.yml` (each currently has no `owner:` or policy file reference) |

After all 5 sub-issues close: add a formal Phase 1 closure audit entry to `runtime/deploy_audit_registry.json` documenting that all exit criteria are met.

### Closure Risk

**HIGH** (scope, not implementation complexity). The individual changes are low-risk. The risk is completeness — 5 sub-issues must reach verified closure before #1601 can close. No single change closes it; it is an audit gate, not an implementation task.

---

## Dependency Graph

```
#1581  Fix migration ordering (0053)
  │
  │  unblocks test execution across all surfaces
  ▼
#1485  OpenClaw ancestry enforcement (runtime tests)
  │
  │  runtime verification complete
  ▼
#1570  FATE: pre-execution route coverage ──────────────┐
#1593  Identity continuity hardening ──────────────────┤
#1594  Execution-to-proof lineage ─────────────────────┤  all feed #1601
#1502  CI/CD deploy surface lock ──────────────────────┤
#1616  Workflow ownership audit ───────────────────────┘
  │
  ▼
#1601  Phase 1 Anchor — GitHub Deploy Closure
  │
  │  closes → unblocks
  ▼
#1604  Phase 2 Anchor (and transitively #1605 → #1606 → #1607 → #1608)
```

---

## Phase-1 Execution Wedge

```
┌──────────────────────────────────────────────────────────────────┐
│  ACTIVE EXECUTION SET — Phase 1 only                            │
│                                                                  │
│  #1581  (1 file: migrations/0053_...)                           │
│         DROP + RECREATE 4 cross-table triggers                  │
│         ↓ enables all test execution                            │
│                                                                  │
│  #1485  (1 file: tests/issue-1464-...)                          │
│         Add 6 runtime regression tests                          │
│         ↓ runtime enforcement verified                          │
│                                                                  │
│  #1570  tests/fate/ — ancillary route FATE coverage             │
│  #1593  continuity-lineage-closure-hardening.ts + FATE          │
│  #1594  tests/fate/ — execution-to-proof lineage FATE           │
│  #1502  formal closure audit entry                              │
│  #1616  policy artifact refs in 3 workflow files                │
│         ↓ all sub-deliverables verified                         │
│                                                                  │
│  #1601  Phase 1 Anchor — formal closure audit                   │
│         → unblocks phases 2–6                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Files that must change to close Phase 1:**

| File | Change | Closes |
|---|---|---|
| `migrations/0053_finality_classification_convergence_valid.sql` | DROP + RECREATE 4 cross-table triggers | #1581 |
| `tests/issue-1464-openclaw-govern-lineage-validate-proof.test.mjs` | Add 6 runtime regression tests | #1485 |
| `tests/fate/` (new or extended FATE tests) | /session, /continuity, /authority fail-closed paths | #1570 |
| `src/continuity-lineage-closure-hardening.ts` (or FATE tests) | Orphan rejection, recursive revocation, freshness | #1593 |
| `tests/fate/` (new or extended FATE tests) | Execution-to-proof lineage failure paths | #1594 |
| `runtime/deploy_audit_registry.json` | Formal CI/CD surface closure entry | #1502 |
| `.github/workflows/prepare-governed-deploy.yml` | Add governing policy artifact reference | #1616 |
| `.github/workflows/constitutional-integrity.yml` | Add governing policy artifact reference | #1616 |
| `.github/workflows/conformance.yml` | Add governing policy artifact reference | #1616 |
| `runtime/deploy_audit_registry.json` | Phase 1 closure audit entry | #1601 |
