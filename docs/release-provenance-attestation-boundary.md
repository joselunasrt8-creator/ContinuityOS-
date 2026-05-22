# Release Provenance and Artifact Attestation Boundary

**Issue:** [#382](https://github.com/joselunasrt8-creator/mindshift-demo/issues/382)
**Generated:** 2026-05-22
**Artifact:** `runtime/release_provenance_matrix.json`

---

## Purpose

This document defines and verifies the release/tag provenance boundary so that no release is considered canonical unless it is traceable to reviewed repository state, validation evidence, provenance metadata, and immutable artifact identity.

It closes the remaining OPEN release/tag mutation path from the reverse-closure topology:
- **RCM-016** `release_tag_creation` — OPEN, linked #382
- **RCM-017** `package_artifact_publication` — OPEN, linked #382

This document is **evidence only**. It does not:
- create authority
- modify runtime behavior
- change validator or proof semantics
- execute workflows
- create deployment artifacts
- expand release workflow capability
- rewrite any schema

Scope: **release provenance and artifact attestation boundary only**.

---

## Non-Operative Declaration

> This document classifies the release provenance boundary. It does not make any release canonical. It does not create any GitHub release. It does not push any tag. It does not grant any release legitimacy to any commit, artifact, or actor. Classification is a precondition for governance closure, not the closure itself.

---

## Canonical Release Boundary

A release is **CANONICAL_RELEASE** only if every step in the following chain is satisfied and bound to the release artifact. Missing any step renders the release **NON_CANONICAL_RELEASE**.

```
PR-reviewed commit
    → required status checks
    → canonical main commit
    → release tag
    → release notes (with evidence references)
    → provenance / attestation reference
    → immutable artifact identity
```

### Step 1 — PR-Reviewed Commit

The source commit was merged to `main` via a pull request that passed:
- CODEOWNERS review by `@joselunasrt8-creator`
- `merge-governance-check` status check
- `generate-preo-candidate` status check
- `generate-sco-candidate` status check

**Current status:** OPEN — branch protection is not enforced at the GitHub settings level. Depends on [#380](https://github.com/joselunasrt8-creator/mindshift-demo/issues/380) closure.

Direct push, force push, admin bypass merge, or merge before branch protection was enforced disqualifies the commit from canonical release eligibility.

### Step 2 — Required Status Checks

The PR passed `merge-governance-check`, `generate-preo-candidate`, and `generate-sco-candidate` with passing check run results bound to the exact `head_sha` being released — not a stale SHA or pre-squash state.

**Current status:** EXTERNAL_POLICY — defined in `governance/runtime/BRANCH_PROTECTION_POLICY.json` but not enforced at the GitHub repository settings level.

### Step 3 — Canonical Main Commit

The release targets a commit that is reachable from the HEAD of the `main` branch — verifiable via `git rev-list main`. Releases from feature branches, detached HEAD states, pre-merge commits, or non-main ancestry are not canonical.

**Current status:** OPEN — no release workflow enforces a main-branch origin check.

### Step 4 — Release Tag

A git tag or GitHub release is created that references the canonical main commit. Annotated tags are preferred over lightweight tags. Unsigned lightweight tags are classified NON_CANONICAL_RELEASE pending signing infrastructure.

Tag overwrites (force-pushed tag references) disqualify the release. No tag immutability constraint exists at the repository level until GitHub tag protection rulesets are configured (EXTERNAL_POLICY).

**Current status:** OPEN — no governed tag creation workflow; any writer can create or overwrite tags.

### Step 5 — Release Notes with Evidence References

Release notes reference the canonical commit SHA, the merged PR number(s), a PREO_VALID artifact reference or status check run IDs. Release notes are documentation, not proof — they must bind to traceable evidence. Release notes without evidence binding are NON_CANONICAL_RELEASE markers.

**Current status:** OPEN — no release notes template or governance requirement for evidence binding.

### Step 6 — Provenance / Attestation Reference

The release binds a provenance or attestation reference: a DSSE attestation, SLSA provenance document, or equivalent signed metadata referencing the commit SHA and artifact hash. Release provenance is **evidence-only** unless later bound by explicit authority through the MindShift canonical chain.

**Current status:** OPEN — no signed attestation or SLSA provenance workflow exists.

### Step 7 — Immutable Artifact Identity

The release artifact has an immutable cryptographic identity: a SHA-256 or stronger hash that binds the artifact bytes to the release tag and provenance reference. Artifact rebuild drift, hash mismatch, or missing hash disqualifies the artifact from canonical status.

**Current status:** OPEN — no artifact hash generation or verification workflow. `package.json` is `private: true` with no publish configuration.

---

## Classification Schema

| Classification | Meaning |
|---|---|
| `CANONICAL_RELEASE` | Satisfies all 7 steps of the canonical boundary. Currently no release can be classified CANONICAL_RELEASE. |
| `NON_CANONICAL_RELEASE` | Release exists but does not satisfy the canonical boundary — unreviewed, unsigned, non-main, or without provenance binding. |
| `OPEN` | Release-capable path with no active governance gate. Live provenance gap requiring explicit closure action. |
| `EXTERNAL_POLICY` | Control defined in policy artifacts but depends on external GitHub settings or signing infrastructure not yet deployed. |
| `BREAK_GLASS` | Root authority path (GitHub admin, org owner). Cannot be eliminated at repository level. Non-normal execution. Cannot create release legitimacy. |
| `EVIDENCE_ONLY` | Observable but not enforceable at the repository code level. Closure requires external infrastructure. |

---

## Required Invariants

### RPI-001 — Release capability ≠ release legitimacy

Having repository write access and the ability to create a GitHub release or git tag does not grant governance status to that release. A release is CANONICAL_RELEASE only if all seven boundary steps are satisfied.

### RPI-002 — Tag existence ≠ canonical release

The existence of a git tag or GitHub release in the repository does not constitute a canonical release. Every unverified tag is NON_CANONICAL_RELEASE or OPEN pending verification of the full provenance chain.

### RPI-003 — Artifact existence ≠ provenance

A build artifact, release asset, or npm package without a bound provenance document is EVIDENCE_ONLY at best and NON_CANONICAL_RELEASE in the absence of governance tracing. Provenance requires a verifiable binding between the artifact's cryptographic hash and a signed document tracing the build to a specific source commit.

### RPI-004 — Release notes ≠ proof

Release notes are editable prose documentation. Even when they reference commit SHAs and PR numbers, they are not cryptographically signed, not append-only, and can be modified after publication. Release notes without bound validation evidence are NON_CANONICAL_RELEASE markers.

### RPI-005 — A canonical release must bind all eight fields

The CANONICAL_RELEASE classification requires all eight fields to be present and bound to each other:

1. Release tag name
2. Tagged commit SHA
3. Artifact hash (SHA-256 or stronger)
4. Validation evidence (PREO_VALID reference or equivalent)
5. Status check evidence (check run IDs for `merge-governance-check` and `generate-preo-candidate`)
6. Reviewer / CODEOWNERS evidence when available (PR review record, reviewer identity)
7. Provenance reference (signed document or SLSA provenance)
8. Release timestamp

Missing any binding renders the release NON_CANONICAL_RELEASE.

### RPI-006 — Release and tag creation cannot create authority

Creating a release tag or GitHub release grants no authority to execute, deploy, or mutate production state through the MindShift canonical chain. Authority requires `/session → /continuity → /authority` traversal. `creates_authority = false` for all classified provenance paths (except the BREAK_GLASS admin path, which acknowledges root platform capability, not MindShift governance authority).

### RPI-007 — Release provenance is evidence-only unless later bound by explicit authority

A release provenance document (SLSA provenance, DSSE attestation, or equivalent) is an evidence artifact. It does not authorize any execution, deployment, or governance action. Provenance must be bound to explicit authority through the MindShift canonical chain to authorize a deployment. Provenance alone cannot substitute for a proof registry entry.

### RPI-008 — Admin and root release paths must be classified as BREAK_GLASS

GitHub repository administrator authority, GitHub organization owner authority, and any account with bypass capability over tag protection rules are root-level authorities external to the MindShift governance model. All releases created via admin bypass are BREAK_GLASS, documented as non-normal execution, and recorded in the GitHub audit log. Admin-created releases cannot be classified CANONICAL_RELEASE.

### RPI-009 — Non-main or unreviewed release paths must be NON_CANONICAL_RELEASE or OPEN

Any release from a commit not reachable from `main` HEAD, or from a commit merged without CODEOWNERS review or required status checks, must be classified NON_CANONICAL_RELEASE or OPEN. These releases cannot be upgraded to CANONICAL_RELEASE without re-verification of the full boundary against a reviewed main-branch commit.

### RPI-010 — Release provenance must not mutate validator, execution, proof, or authority semantics

Release provenance artifacts are evidence-only. They classify and document the release governance boundary. They do not modify any runtime route, validator behavior, proof generation logic, execution surface, or authority creation mechanism.

---

## Verification Areas — All 20 Classified

| Path ID | Path Name | Classification |
|---|---|---|
| RPM-001 | release_tag_creation | OPEN |
| RPM-002 | unsigned_tag_creation | OPEN |
| RPM-003 | mutable_tag_overwrite | OPEN |
| RPM-004 | release_notes_without_validation_evidence | OPEN |
| RPM-005 | artifact_without_provenance_reference | OPEN |
| RPM-006 | package_publication_without_canonical_source_commit | OPEN |
| RPM-007 | github_release_from_non_main_commit | OPEN |
| RPM-008 | release_from_unreviewed_commit | OPEN |
| RPM-009 | release_without_status_check_evidence | OPEN |
| RPM-010 | release_without_artifact_hash | OPEN |
| RPM-011 | release_without_deployment_proof_linkage | OPEN |
| RPM-012 | local_tag_push_bypass | OPEN |
| RPM-013 | github_ui_release_creation_bypass | EXTERNAL_POLICY |
| RPM-014 | workflow_created_release | EVIDENCE_ONLY |
| RPM-015 | bot_created_release | EXTERNAL_POLICY |
| RPM-016 | admin_root_release_bypass | BREAK_GLASS |
| RPM-017 | artifact_rebuild_drift | OPEN |
| RPM-018 | rollback_release_lineage | OPEN |
| RPM-019 | provenance_replay | OPEN |
| RPM-020 | attestation_mismatch | OPEN |

**CANONICAL_RELEASE satisfiable currently:** No — all seven boundary steps have at least one OPEN or EXTERNAL_POLICY dependency.

---

## Residual Gap Summary

### Gaps Requiring Repo-Level Implementation

| Gap | Path | Closure |
|---|---|---|
| No governed release workflow | RPM-001 | Implement release workflow with canonical boundary verification |
| Tag overwrite not blocked | RPM-003 | GitHub tag protection rulesets (EXTERNAL_POLICY once configured) |
| No provenance generation | RPM-005 | SLSA provenance or DSSE attestation workflow |
| Release from unreviewed commit possible | RPM-008 | Governed release workflow + #380 closure |
| No artifact hash generation | RPM-010 | SHA-256 artifact hash in release workflow |
| No rollback release policy | RPM-018 | Define rollback release governance policy |
| No provenance replay prevention | RPM-019 | Provenance registry with uniqueness enforcement |
| No attestation verification | RPM-020 | Attestation verification step in release workflow |

### Gaps Requiring External Action (EXTERNAL_POLICY)

| Gap | Path | Closure |
|---|---|---|
| GitHub UI release creation not blockable at repository level | RPM-013 | GitHub Enterprise organization rulesets |
| Bot account release restriction | RPM-015 | GitHub repository collaborator access control |
| Tag protection rules | RPM-003 | GitHub repository rulesets (org-level) |

### Gaps That Cannot Be Closed at Repository Level (BREAK_GLASS)

| Gap | Path | Note |
|---|---|---|
| Admin/root release bypass irrevocable | RPM-016 | Platform root authority; classified non-normal; audit log observable |

---

## Relationship to Reverse-Closure Topology

**RCM-016** `release_tag_creation` — Was OPEN in `runtime/REVERSE_CLOSURE_MUTATION_MAP.json` with closure action linking to #382. This boundary document and the release provenance matrix classify all 20 release-capable paths. RCM-016 surface is now fully classified — the open gap is declared, not undiscovered.

**RCM-017** `package_artifact_publication` — Was OPEN in `REVERSE_CLOSURE_MUTATION_MAP.json`. RPM-006 (package publication without canonical source commit) and RPM-005 (artifact without provenance reference) classify the artifact publication surface as OPEN with explicit closure actions.

**BSM-011** `tag_based_mutation` — Was OPEN in `runtime/repository_sovereignty_matrix.json` with `unauthorized_result=UNVERIFIABLE_RELEASE_PROVENANCE` and `linked_issue=#382`. This document directly closes the classification gap BSM-011 references.

---

## Relationship to Adversarial Topology

**ADV-008** `hidden_deploy_path_discovery` — Enumerates release/tag creation (RCM-016, RCM-017) as classified OPEN gaps in `runtime/adversarial_execution_topology_map.json`. This boundary document resolves the classification requirement. The adversarial outcome for RPM-001 through RPM-020 is: OPEN paths are classified and acknowledged; BREAK_GLASS paths are non-normal execution; EXTERNAL_POLICY paths require external action; EVIDENCE_ONLY paths are observable but not enforceable.

---

## Issue #382 Closure Condition

\#382 can close only if every release-capable path is declared, linked to evidence, and assigned a closure status. This boundary document and `runtime/release_provenance_matrix.json` satisfy that requirement — all 20 paths are declared and classified.

Remaining external/root gaps (RPGAP-005 GitHub UI bypass, RPGAP-006 admin root bypass) are explicit, not hidden.

Full **CANONICAL_RELEASE** enforcement requires implementing the governed release workflow (RPGAP-001), provenance generation (RPGAP-003), and tag protection rules (RPGAP-002). Those are tracked as OPEN with explicit closure actions and do not block #382 closure. #382 closure requires **classification completeness**, not enforcement completeness.
