# Main Branch Protection Governance

**Issue:** [#380](https://github.com/joselunasrt8-creator/mindshift-demo/issues/380)
**Generated:** 2026-05-22
**Artifact:** `runtime/repository_sovereignty_matrix.json`

---

## Purpose

This document classifies, verifies, and hardens the repository mutation governance boundary for the `main` branch.

It is generated after:
- **#695** adversarial execution verification merged
- **#383** reverse-closure mutation map merged
- **#896** Cloudflare authority bypass containment merged

It is **evidence only**. It does not:
- create authority
- modify branch protection settings
- alter runtime behavior
- change validator or proof semantics
- execute workflows
- create deployment artifacts

Scope: **repository sovereignty only**.

---

## Non-Operative Declaration

```text
This document is non-operative.

It describes enforcement boundaries and classifies mutation paths.

It does not enforce GitHub branch protection settings.
Branch protection must be applied at the GitHub repository settings level.
```

---

## Canonical Repository Invariant

```text
No direct mutation path to main
may bypass governed review.
```

---

## Required Governance Invariants

### RSI-001 — Repository Mutation Cannot Create Legitimacy

```text
repository mutation alone cannot create legitimacy
```

A commit, merge, or direct push to `main` does not produce a MindShift execution authority, proof object, or canonical chain traversal. Repository state change is a precondition for deployment consideration, not a legitimacy grant.

**Evidence:**
- `BRANCH_PROTECTION_POLICY.json` `core_invariant`: `No PREO_VALID -> no merge legitimacy`
- `runtime/root_authority_constraints.json` `root_authority_escalation=NULL`
- RCM-001 `creates_legitimacy=false`, RCM-003 `creates_legitimacy=false`

---

### RSI-002 — Merge Capability ≠ Execution Legitimacy

```text
merge capability does not equal execution legitimacy
```

The ability to merge a PR into `main` (whether through branch protection, admin bypass, or direct push) grants no authority to execute, deploy, or mutate production state through the MindShift canonical chain.

Legitimacy requires canonical chain traversal:

```
/session → /continuity → /authority → /compile → /validate → /execute → /proof
```

**Evidence:**
- `BRANCH_PROTECTION_POLICY.json` `merge_legitimacy_requirements`: PREO_VALID generated for exact head_sha
- RCM-002 `creates_legitimacy=true` only because PREO_VALID is the merge gate, not the merge action itself

---

### RSI-003 — Branch Protection Is Governance Dependency, Not Proof

```text
branch protection is governance dependency, not proof
```

Branch protection rules enforce the process by which repository mutations are reviewed and checked. They are a necessary dependency for repository sovereignty but do not themselves constitute proof of execution legitimacy.

A branch protection setting cannot substitute for a PREO_VALID, SCO_CANDIDATE, or canonical chain proof object.

**Evidence:**
- `BRANCH_PROTECTION_POLICY.json` `status=policy_only_non_enforcing`
- PREO_VALID remains canonical merge gate independent of branch protection activation
- `REVERSE_CLOSURE_MUTATION_MAP.json` INV-005: main branch protection is governance dependency

---

### RSI-004 — Unsigned and Unreviewed Mutation Paths Classify as Unauthorized

```text
unsigned and unreviewed mutation paths must classify as unauthorized
```

Any repository mutation path that lacks cryptographic commit provenance (signed commits) or required CODEOWNERS review must be classified as UNAUTHORIZED.

This classification does not block such mutations from occurring absent branch protection enforcement, but establishes their governance status for evidence and reconciliation purposes.

**Evidence:**
- BSM-005 `unsigned_commits` OPEN `unauthorized_result=UNVERIFIABLE_COMMIT_PROVENANCE`
- BSM-004 `missing_codeowners_review` OPEN `unauthorized_result=UNREVIEWED_MERGE`
- `BRANCH_PROTECTION_POLICY.json` `require_approvals=true`, `dismiss_stale_reviews=true`

---

### RSI-005 — External GitHub Admin and Root Authority Classify as BREAK_GLASS

```text
external GitHub admin and root authority must classify as BREAK_GLASS
```

GitHub repository administrator authority, GitHub organization owner authority, and any account with bypass capability over branch protection rules are root-level authorities external to the MindShift governance model.

They must be classified as BREAK_GLASS, acknowledged as non-normal execution paths, and explicitly documented as not creating MindShift execution legitimacy.

**Evidence:**
- BSM-003 `admin_bypass` BREAK_GLASS `non_normal_execution=true` `creates_legitimacy=false`
- RCM-019 `root_credential_break_glass` BREAK_GLASS
- `governance/ROOT_AUTHORITY_CLASSIFICATION.json` GitHub admin authority `bypass_risk=P3`
- `runtime/root_authority_constraints.json` `root_authority_escalation=NULL`

---

## Classification Schema

| Classification | Meaning |
|---|---|
| **ENFORCED** | Control is technically active at the GitHub platform level and cannot be suppressed by PR author without root authority |
| **EXTERNAL_POLICY** | Control is defined in governance policy and depends on a human administrator applying it at GitHub settings level |
| **BREAK_GLASS** | Mutation path exists as root authority capability; classified as non-normal execution; cannot create MindShift legitimacy |
| **OPEN** | Mutation path is currently uncontrolled at the platform level; represents live sovereignty gap |
| **CONTAINED** | Mutation path has governance controls limiting exploitability but controls are not fully enforced as blocking gates |

---

## Verification Areas and Classifications

| Path ID | Verification Area | Classification | Residual Gap |
|---|---|---|---|
| BSM-001 | Direct push to main | **OPEN** | Branch protection advisory only; GitHub settings not aligned |
| BSM-002 | Force push to main | **OPEN** | allow_force_pushes=false in policy; not enforced at platform level |
| BSM-003 | Admin bypass | **BREAK_GLASS** | GitHub admin has irrevocable platform-level bypass; root authority |
| BSM-004 | Missing CODEOWNERS review | **OPEN** | CODEOWNERS advisory until branch protection enforces required reviews |
| BSM-005 | Unsigned commits | **OPEN** | No signed commit requirement defined or enforced |
| BSM-006 | Stale review dismissal | **EXTERNAL_POLICY** | dismiss_stale_reviews=true in policy; GitHub settings not aligned |
| BSM-007 | Required status checks | **EXTERNAL_POLICY** | Required checks defined in policy; GitHub settings not aligned |
| BSM-008 | Workflow mutation through PR | **CONTAINED** | Detection active; merge not gated until required checks enforced |
| BSM-009 | Branch deletion | **OPEN** | allow_branch_deletion=false in policy; not enforced at platform level |
| BSM-010 | Branch recreation after deletion | **OPEN** | Same as BSM-009; no append-only constraint on repository history |
| BSM-011 | Tag-based mutation | **OPEN** | No tag governance; linked to #382 |
| BSM-012 | GitHub Actions privilege escalation | **CONTAINED** | Workflow code enforces canonical chain; workflow mutation through PR unblocked |
| BSM-013 | workflow_dispatch misuse | **CONTAINED** | Canonical chain verification active; tuple proliferation residual |
| BSM-014 | Merge queue bypass | **OPEN** | No merge queue configured; branch protection not enforced |
| BSM-015 | Bot/account mutation classification | **EXTERNAL_POLICY** | Depends on GitHub collaborator settings external to repository |
| BSM-016 | PR workflow execution | **ENFORCED** | Platform enforces trigger execution; results not required for merge |

---

## Detailed Verification Area Analysis

### BSM-001 — Direct Push to Main

**Classification:** OPEN

**Current Gate:** `BRANCH_PROTECTION_POLICY.json` declares `restrict_direct_push_to_main=true` but status is `policy_only_non_enforcing`. GitHub repository settings are not aligned.

**Risk:** Repository owner or collaborator with push access can push directly to `main`, bypassing PREO/SCO governance checks, CODEOWNERS review, and all required status checks.

**Linked RCM:** RCM-001 (`repository_direct_push`)

**Closure:** Enable GitHub branch protection for `main` — restrict direct pushes, require pull requests, require CODEOWNERS approval, require status checks.

---

### BSM-002 — Force Push to Main

**Classification:** OPEN

**Current Gate:** `BRANCH_PROTECTION_POLICY.json` declares `allow_force_pushes=false`. Not enforced at platform level.

**Risk:** Force push can rewrite git history, erasing PREO/SCO evidence, merge commit records, and proof lineage references from the repository graph.

**Linked RCM:** RCM-001

**Closure:** Enforce `allow_force_pushes=false` in GitHub branch protection settings for `main`.

---

### BSM-003 — Admin Bypass

**Classification:** BREAK_GLASS

**Current Gate:** `BRANCH_PROTECTION_POLICY.json` declares `allow_admin_bypass=false`. GitHub repository admin has root authority that cannot be constrained by repository-level governance artifacts.

**Risk:** GitHub repository administrator has platform-level authority to bypass branch protection and merge without required checks. This is a root authority and cannot be eliminated at the repository level.

**Governance Status:**
- `non_normal_execution: true`
- `creates_legitimacy: false`
- Must be recorded as explicit break-glass incident with audit log entry

**Linked RCM:** RCM-019 (`root_credential_break_glass`)

**Closure:** Cannot be fully closed at repository level. Enforce `allow_admin_bypass=false` in branch protection. Classify all admin bypass events as break-glass incidents. Periodic audit of GitHub audit log for bypass events.

---

### BSM-004 — Missing CODEOWNERS Review

**Classification:** OPEN

**Current Gate:** `.github/CODEOWNERS` and `CODEOWNERS` declare `@joselunasrt8-creator` as required reviewer for all repository paths. Enforcement depends on branch protection requiring `required_approving_review_count >= 1` with `dismiss_stale_reviews=true`.

**Risk:** Without branch protection enforcement, PRs can be merged without CODEOWNERS approval. The ownership boundary is declared but does not gate the merge action.

**Linked RCM:** RCM-004 (`codeowners_review`)

**Closure:** Enforce branch protection with `required_approving_review_count >= 1` and `dismiss_stale_reviews=true`.

---

### BSM-005 — Unsigned Commits

**Classification:** OPEN

**Current Gate:** No GPG or SSH signed commit requirement defined in `BRANCH_PROTECTION_POLICY.json` or enforced at GitHub settings level.

**Risk:** Commits without cryptographic signatures cannot have their authorship verified. Bot, automated, or impersonated commits cannot be distinguished from legitimate maintainer commits. Commit provenance chain is unverifiable.

**Closure:** Define `require_signed_commits` policy. Enable GitHub branch protection signed commit requirement for `main`.

---

### BSM-006 — Stale Review Dismissal

**Classification:** EXTERNAL_POLICY

**Current Gate:** `BRANCH_PROTECTION_POLICY.json` declares `dismiss_stale_reviews=true`. Requires branch protection enforcement to activate.

**Risk:** Without enforcement, a reviewer's approval of a pre-mutation commit state persists and could satisfy review requirements for a different (post-mutation) head SHA.

**Linked RCM:** RCM-002 (`pr_merge`)

**Closure:** Enforce branch protection with `dismiss_stale_reviews=true` by applying `BRANCH_PROTECTION_POLICY.json` in GitHub repository settings.

---

### BSM-007 — Required Status Checks

**Classification:** EXTERNAL_POLICY

**Current Gate:** `BRANCH_PROTECTION_POLICY.json` declares required checks:
- `merge-governance-check`
- `generate-preo-candidate`
- `generate-sco-candidate`

`emitted_check_inventory` documents workflow file / job name / check run name alignment. GitHub settings not aligned.

**Risk:** Status checks run on every PR to `main` and generate PREO/SCO evidence, but they are not required for merge. An admin or owner can merge even if checks fail or have not completed.

**Governance Drift Policy:** `BRANCH_PROTECTION_POLICY.json` `governance_drift_policy`: required check without emitted job → `PREO_INVALID_AND_MERGE_LEGITIMACY_NULL`.

**Linked RCM:** RCM-002, RCM-003

**Closure:** Enforce branch protection with required status checks matching emitted check run names per `emitted_check_inventory`. Enable `require_branch_up_to_date_before_merge=true`.

---

### BSM-008 — Workflow Mutation Through PR

**Classification:** CONTAINED

**Current Gate:**
- `constitutional-integrity.yml` classifies `.github/workflows/**` changes as `source_control_governance` mutations (PR-3 sovereignty class)
- `preo-candidate.yml` generates PREO_CANDIDATE for every PR to `main`
- `sco-candidate.yml` generates SCO_CANDIDATE with `workflow_mutation` class
- `CODEOWNERS` requires `@joselunasrt8-creator` approval for `/.github/workflows/**`

**Risk:** Workflow mutation detection is operational but merge is not gated by classification result until required status checks are enforced.

**Linked RCM:** RCM-005, RCM-006

**Closure:** Enforce branch protection required checks. Require CODEOWNERS approval for `.github/workflows/**`.

---

### BSM-009 — Branch Deletion

**Classification:** OPEN

**Current Gate:** `BRANCH_PROTECTION_POLICY.json` declares `allow_branch_deletion=false`. Not enforced at platform level.

**Risk:** Main branch or feature branches containing governance evidence could be deleted, destroying history and PREO/SCO evidence.

**Linked RCM:** RCM-001

**Closure:** Enforce `allow_branch_deletion=false` in GitHub branch protection settings.

---

### BSM-010 — Branch Recreation After Deletion

**Classification:** OPEN

**Current Gate:** Same as BSM-009. If deletion is prevented, recreation with different history is also prevented.

**Risk:** A branch could be deleted and recreated with a different commit history, substituting governance evidence with an alternative lineage.

**Closure:** Enforce branch deletion prevention via branch protection. Periodic git history integrity verification.

---

### BSM-011 — Tag-Based Mutation Paths

**Classification:** OPEN

**Current Gate:** No governed tag or release creation workflow. Any repository writer can create tags without PREO validation or canonical chain traversal.

**Risk:** Tags and GitHub releases created without governance generate artifacts with unverifiable provenance. Release artifacts cannot be traced to governed repository state.

**Linked RCM:** RCM-016 (`release_tag_creation`), RCM-017 (`package_artifact_publication`)

**Closure:** Define release provenance and artifact attestation boundary per **#382**. Require signed tags or DSSE attestations. Require passing validation evidence and proof lineage reference before release creation.

---

### BSM-012 — GitHub Actions Privilege Escalation

**Classification:** CONTAINED

**Current Gate:**
- `governed-deploy.yml` requires `workflow_dispatch` event with `DECISION_ID`, `VALIDATED_OBJECT_HASH`, `INVOCATION_NONCE`
- Full canonical chain `/session → /proof` with replay protection
- `MINDSHIFT_GOVERNED_DEPLOY_CONTEXT=github_actions_governed` required by `governed-deploy.ts`
- `constitutional-integrity.yml` detects workflow permission changes

**Risk:** Workflow definition mutation through PR (BSM-008) could introduce privilege escalation. Requires branch protection enforcement (BSM-007) to gate workflow changes.

**Linked RCM:** RCM-005, RCM-009

**Closure:** Enforce branch protection required checks and CODEOWNERS review for `.github/workflows/**`. Add GitHub environment approval gate to `governed-deploy.yml`.

---

### BSM-013 — workflow_dispatch Misuse

**Classification:** CONTAINED

**Current Gate:**
- `governed-deploy.yml` verifies `event_name=workflow_dispatch`, `CALLER_WORKFLOW_REF`, full canonical chain input validation
- Fabricated inputs fail `/compile` hash match requirement
- Replay protection via used nonces and `deployment_proof_registry` UNIQUE `proof_binding_hash`
- `prepare-governed-deploy.yml` does not deploy autonomously

**Risk:** Repeated `prepare-governed-deploy.yml` dispatches generate multiple valid deploy-candidate tuples. Each tuple is reusable until expiry. No one-shot gate on tuple generation.

**Linked RCM:** RCM-005, RCM-006

**Closure:** Rate-limit or one-shot-gate `prepare-governed-deploy.yml` dispatch. Add GitHub environment approval gate. Expire generated tuples after first consume.

---

### BSM-014 — Merge Queue Bypass

**Classification:** OPEN

**Current Gate:** `BRANCH_PROTECTION_POLICY.json` declares merge queue controls:
- `require_merge_queue_required_checks_on_enqueued_head=true`
- `squash_merge_requires_current_head_sha_checks=true`
- `rebase_merge_requires_current_head_sha_checks=true`

No merge queue configured at GitHub settings level. Branch protection not enforced.

**Risk:** PRs can be merged using check results from a different head SHA than the one being merged. Squash and rebase merges can complete with stale evidence.

**Linked RCM:** RCM-002

**Closure:** Enforce branch protection and configure merge queue per `BRANCH_PROTECTION_POLICY.json` `merge_method_policy`.

---

### BSM-015 — Bot/Account Mutation Classification

**Classification:** EXTERNAL_POLICY

**Current Gate:** `CODEOWNERS` requires `@joselunasrt8-creator` review. GitHub collaborator settings control which accounts have push access. No machine account restriction policy defined in repository artifacts.

**Risk:** Bots or automated accounts with repository write access could push commits or merge PRs without human CODEOWNERS review. Classification depends on collaborator access control external to repository governance code.

**Linked RCM:** RCM-004

**Closure:** Restrict repository collaborator access to named human accounts. Enforce CODEOWNERS review via branch protection. Classify all machine account mutations as requiring explicit governance exception.

---

### BSM-016 — PR Workflow Execution

**Classification:** ENFORCED

**Current Gate:** GitHub platform enforces workflow trigger semantics. `on: pull_request` targeting `main` causes workflows to run on every qualifying PR event. The PR author cannot prevent these workflows from running.

**Workflows:**
- `constitutional-integrity.yml` — classifies governance mutations; detects workflow changes
- `preo-candidate.yml` — generates PREO_CANDIDATE for every PR
- `sco-candidate.yml` — generates SCO_CANDIDATE for governed path mutations
- `merge-governance-check.yml` — verifies governance integrity on merge

**Residual Gap:** Workflow EXECUTION is enforced. Workflow RESULTS as required merge gates are not enforced (EXTERNAL_POLICY per BSM-007). Evidence generation is active; merge blocking is inactive until branch protection required_status_checks are configured.

**Linked RCM:** RCM-002, RCM-004

---

## Residual Open Sovereignty Gaps

The following gaps are explicitly identified as unresolved at the time this document is generated:

| Gap ID | Path | Classification | Risk | Resolution Issue |
|---|---|---|---|---|
| RSGAP-001 | BSM-001 direct_push_to_main | OPEN | P1 | #380 |
| RSGAP-002 | BSM-002 force_push_to_main | OPEN | P1 | #380 |
| RSGAP-003 | BSM-003 admin_bypass | BREAK_GLASS | P3 | #380 (acknowledged, cannot be eliminated) |
| RSGAP-004 | BSM-004 codeowners_review | OPEN | P1 | #380 |
| RSGAP-005 | BSM-005 unsigned_commits | OPEN | P2 | #380 |
| RSGAP-006 | BSM-009 branch_deletion | OPEN | P1 | #380 |
| RSGAP-007 | BSM-011 tag_based_mutation | OPEN | P2 | #382 |
| RSGAP-008 | BSM-014 merge_queue_bypass | OPEN | P1 | #380 |

**Note:** Branch protection activation (applying `BRANCH_PROTECTION_POLICY.json` in GitHub repository settings) closes RSGAP-001, RSGAP-002, RSGAP-004, RSGAP-006, RSGAP-008 as a single governance action. RSGAP-003 (admin bypass) cannot be closed at the repository level — it is classified and acknowledged as BREAK_GLASS. RSGAP-005 (unsigned commits) requires a separate branch protection setting. RSGAP-007 (tag/release) is tracked under #382.

---

## Branch Protection Policy Alignment

`BRANCH_PROTECTION_POLICY.json` defines the following controls, all currently in `policy_only_non_enforcing` status:

| Control | Policy Value | Enforcement Status |
|---|---|---|
| require_pull_request_before_merge | true | Not enforced |
| required_approving_review_count | 1 | Not enforced |
| dismiss_stale_reviews | true | Not enforced |
| require_status_checks | true | Not enforced |
| required_status_checks | [merge-governance-check, merge-guard, generate-preo-candidate, generate-sco-candidate, constitutional-integrity] | Not enforced |
| require_branch_up_to_date_before_merge | true | Not enforced |
| restrict_direct_push_to_main | true | Not enforced |
| allow_force_pushes | false | Not enforced |
| allow_branch_deletion | false | Not enforced |
| allow_admin_bypass | false | Not enforced |
| require_conversation_resolution | true | Not enforced |

**All controls are advisory until applied at GitHub repository settings level.**

---

## Cross-Reference: Reverse Closure Map

The following RCM surfaces are addressed by this governance document:

| RCM ID | Surface | RCM Status | BSM Paths |
|---|---|---|---|
| RCM-001 | repository_direct_push | OPEN | BSM-001, BSM-002, BSM-009, BSM-010 |
| RCM-002 | pr_merge | CONTAINED | BSM-006, BSM-007, BSM-014, BSM-016 |
| RCM-003 | branch_protection_enforcement | OPEN | BSM-001 through BSM-010, BSM-014 |
| RCM-004 | codeowners_review | CONTAINED | BSM-004, BSM-015 |
| RCM-005 | github_actions_workflow_dispatch_governed | CONTAINED | BSM-012, BSM-013 |
| RCM-006 | github_actions_workflow_dispatch_ungoverned | CONTAINED | BSM-013 |
| RCM-016 | release_tag_creation | OPEN | BSM-011 |
| RCM-017 | package_artifact_publication | OPEN | BSM-011 |
| RCM-019 | root_credential_break_glass | BREAK_GLASS | BSM-003 |

---

## Closure Conditions

**#380 closes when:**

1. All repository mutation paths are classified in `runtime/repository_sovereignty_matrix.json` ✓
2. All required verification areas have assigned classifications ✓
3. Residual open sovereignty gaps are explicitly identified ✓
4. Branch mutation governance is fully mapped and verified ✓
5. GitHub branch protection rules are applied at settings level (requires external admin action)
6. `npm test` shows no new regressions ✓ (verified by test suite)
7. `npx tsc --noEmit` passes ✓ (no TypeScript changes)

**Note:** Items 1–4 and 6–7 are completed by this PR. Item 5 requires external human admin action to apply `BRANCH_PROTECTION_POLICY.json` controls in GitHub repository settings.

---

## Final Principles

```text
CODEOWNERS defines authority.
Branch protection enforces authority.
Branch protection activation is governance dependency, not proof.

Repository mutation alone cannot create legitimacy.
Merge capability does not equal execution legitimacy.

Admin bypass cannot create MindShift legitimacy.
Admin bypass must be classified BREAK_GLASS.

Unsigned commits must be classified as unverifiable.
Unreviewed merges must be classified as unauthorized.
```
