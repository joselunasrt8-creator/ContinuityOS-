# Branch Protection Enforcement

**Issue**: #380 — Enable main branch protection for repository ownership boundary

## Purpose

This document describes the enforced governance model for the `main` branch of this repository. It converts `CODEOWNERS` from an advisory ownership declaration into an enforced mutation boundary.

**Canonical invariant**: If no valid PREO_VALID exists → merge legitimacy is NULL.

---

## Enforcement Model

### Authority Declaration

`CODEOWNERS` declares who owns which paths. The repository-wide owner is `@joselunasrt8-creator`. This declaration is authoritative but was previously advisory — commits could reach `main` without CODEOWNER review.

### Enforcement Mechanism

Branch protection rules enforce the authority declared in `CODEOWNERS`. No commit may reach `main` outside the governed PR/review lineage.

---

## Required Protections for `main`

| Control | Configuration | Bypass Result |
|---------|--------------|---------------|
| PR required before merge | `require_pull_request_before_merge: true` | `MERGE_LEGITIMACY_NULL` |
| CODEOWNER review required | `require_code_owner_reviews: true` | `MERGE_LEGITIMACY_NULL` |
| Required approving review count | `required_approving_review_count: 1` | `MERGE_LEGITIMACY_NULL` |
| Status checks required | `require_status_checks: true` | `PREO_INVALID_AND_MERGE_LEGITIMACY_NULL` |
| Stale reviews dismissed | `dismiss_stale_reviews: true` | `PREO_INVALID_AND_MERGE_LEGITIMACY_NULL` |
| Branch up to date required | `require_branch_up_to_date_before_merge: true` | `PREO_INVALID_AND_MERGE_LEGITIMACY_NULL` |
| Linear history required | `require_linear_history: true` | `MERGE_LEGITIMACY_NULL` |
| Direct push blocked | `restrict_direct_push_to_main: true` | `MERGE_LEGITIMACY_NULL` |
| Force push blocked | `allow_force_pushes: false` | `MERGE_LEGITIMACY_NULL` |
| Branch deletion blocked | `allow_branch_deletion: false` | `MERGE_LEGITIMACY_NULL` |
| Admin bypass disallowed | `allow_admin_bypass: false` | `ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL` |

---

## Required Status Checks

Every PR targeting `main` must pass all of the following checks before merge is permitted:

| Check Name | Workflow File | Purpose |
|-----------|--------------|---------|
| `merge-governance-check` | `.github/workflows/merge-governance-check.yml` | PREO/SCO candidate generation and binding validation |
| `generate-preo-candidate` | `.github/workflows/preo-candidate.yml` | PR review object candidate generation |
| `generate-sco-candidate` | `.github/workflows/sco-candidate.yml` | Scope change object candidate generation |
| `constitutional-integrity` | `.github/workflows/constitutional-integrity.yml` | Constitutional governance path drift detection |
| `branch-protection-enforcement` | `.github/workflows/branch-protection-enforcement.yml` | Enforcement control verification and status-check lineage |

### Status-Check Lineage Invariant

The `branch-protection-enforcement` and `merge-governance-check` workflows both verify that every name listed in `required_status_checks` (in `governance/runtime/BRANCH_PROTECTION_POLICY.json`) matches an actual GitHub Actions job name emitted by a workflow file. If a required check has no corresponding emitted job, the lineage is broken and the PR is blocked.

---

## Bypass Classification

All bypass actors are formally classified in `governance/runtime/BYPASS_CLASSIFICATION.json`.

**Governing principle**: No bypass actor produces merge legitimacy.

| Bypass Actor | Classification | Enforcement Response |
|-------------|---------------|---------------------|
| GitHub repository admin | `ROOT_REPOSITORY_AUTHORITY` | `ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL` |
| GitHub organization owner | `ROOT_REPOSITORY_AUTHORITY` | `ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL` |
| Direct push actor | `MERGE_LEGITIMACY_NULL` | `MERGE_LEGITIMACY_NULL; ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL` |
| Force push actor | `MERGE_LEGITIMACY_NULL` | `MERGE_LEGITIMACY_NULL; ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL` |
| Branch deletion actor | `MERGE_LEGITIMACY_NULL` | `MERGE_LEGITIMACY_NULL; ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL` |
| Unreviewed merge actor | `MERGE_LEGITIMACY_NULL` | `MERGE_LEGITIMACY_NULL; CODEOWNER approval required -> NULL` |
| Unchecked merge actor | `PREO_INVALID_AND_MERGE_LEGITIMACY_NULL` | `PREO_INVALID_AND_MERGE_LEGITIMACY_NULL -> NULL` |

### Normalization Prohibition

- Admin bypass must never be treated as a shortcut to merge legitimacy.
- Root authority evidence may invalidate legitimacy but may **NEVER** authorize merge.
- No hidden admin bypass normalization.
- No direct mutation shortcut.
- No weakened review boundary.

---

## Enforcement Verification

Per-PR enforcement verification is produced by the `branch-protection-enforcement` workflow as `ENFORCEMENT_VERIFICATION.json`. The static record is maintained at `governance/runtime/ENFORCEMENT_VERIFICATION.json`.

### Verification Steps (per PR)

1. **Policy artifact validation** — `governance/runtime/BRANCH_PROTECTION_POLICY.json` must exist, be valid JSON, and have `status != policy_only_non_enforcing`.
2. **Status-check lineage** — All `required_status_checks` must have corresponding emitted workflow job names.
3. **Enforcement controls** — All required controls verified programmatically (PR, CODEOWNER review, force-push block, branch deletion block, admin bypass disallow).
4. **Bypass classification** — `governance/runtime/BYPASS_CLASSIFICATION.json` must exist, enumerate all bypass actors, and declare `bypass_creates_merge_legitimacy: false` for all actors.
5. **CODEOWNERS coverage** — `.github/CODEOWNERS` must exist and reference the repository owner.

---

## Artifacts

| Artifact | Path | Purpose |
|---------|------|---------|
| Branch protection policy | `governance/runtime/BRANCH_PROTECTION_POLICY.json` | Machine-readable enforcement configuration |
| Bypass classification | `governance/runtime/BYPASS_CLASSIFICATION.json` | Formal bypass actor classification |
| Enforcement verification (static) | `governance/runtime/ENFORCEMENT_VERIFICATION.json` | Static enforcement verification record |
| Governance documentation | `governance/BRANCH_PROTECTION_ENFORCEMENT.md` | This document |
| Enforcement workflow | `.github/workflows/branch-protection-enforcement.yml` | Per-PR enforcement verification |

---

## Closure Condition

> No mutation path to `main` exists outside the governed PR/review lineage.

This condition is satisfied when:
- Branch protection rules are active on `main`
- All required status checks are listed and emitted by live workflow jobs
- CODEOWNER review is enforced
- All bypass paths are classified as non-legitimacy-producing
- The `branch-protection-enforcement` check passes on every PR
