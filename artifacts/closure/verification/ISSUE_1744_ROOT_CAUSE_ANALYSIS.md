---
issue_lineage: #1744 root-cause analysis; retained under #1609 topology compression
phase_lineage: Historical verification/root-cause evidence; predecessor artifact identified by #1760 reduction eligibility
status: Archived historical analysis; non-authoritative evidence
archive_classification: archive/closure/root-cause-analysis
relocated_from: /ISSUE_1744_ROOT_CAUSE_ANALYSIS.md
relocated_to: /artifacts/closure/verification/ISSUE_1744_ROOT_CAUSE_ANALYSIS.md
relocation_date: 2026-06-02
authority_note: This artifact is observational/archive evidence only; it does not grant authority or alter governance enforcement.
---

# Root Cause Analysis: Proof-Registry PR Accumulation

**Issue:** #1744  
**Status:** Investigation complete  
**Date:** 2026-06-02  
**Scope:** Topology analysis only. No implementation changes.

---

## 1. Observed Topology

### Live PR State at Investigation Time

| PR | Title | Head Branch | Base SHA | Status |
|----|-------|-------------|----------|--------|
| #1741 | proof: persist PROOF-1740-7cbecbdf | `proof-registry/PROOF-1740-7cbecbdf` | `acab30e4` | Open / **stale** |
| #1742 | proof: persist PROOF-1739-acab30e4 | `proof-registry/PROOF-1739-acab30e4` | `acab30e4` | Open / **stale** |
| #1743 | proof: persist PROOF-1736-5ff92739 | `proof-registry/PROOF-1736-5ff92739` | `5ff92739` | Open / current |

Current main HEAD: `5ff92739` (merge commit of PR #1736).

PRs #1741 and #1742 both target a base SHA that is no longer main's HEAD. They require a branch update before they can merge. PR #1743 is the only one currently aligned with main.

### Registry State at Investigation Time

`governance/merge-legitimacy/merge_proof_registry.jsonl` contains 13 proof entries (lines 2–14):

```
PROOF-1712, PROOF-1713, PROOF-1716, PROOF-1718, PROOF-1719, PROOF-1717,
PROOF-1725, PROOF-1728, PROOF-1729, PROOF-1734, PROOF-1738, PROOF-1735,
PROOF-1737
```

Notably absent: PROOF-1736, PROOF-1739, PROOF-1740 — all pending in open PRs.

### Observed Recursive Lineage

```
PR #1734 (normal PR) merged to main
  └─▶ merge-proof fires → PROOF-1734 generated
        └─▶ proof-registry PR #1736 created (appends PROOF-1734)
              └─▶ PR #1736 merged to main
                    └─▶ merge-proof fires → PROOF-1736 generated
                          └─▶ proof-registry PR #1743 created (appends PROOF-1736)
                                └─▶ PR #1743 pending merge…
                                      └─▶ (will generate PROOF-1743 when merged)
```

This is not a bug in the generation logic. It is the structural consequence of a missing self-exclusion filter.

---

## 2. Root Cause

### Primary Cause: No Self-Exclusion Filter on Proof-Registry Merges

The merge-proof workflow trigger (`.github/workflows/merge-proof.yml`, lines 7–11):

```yaml
on:
  pull_request:
    types: [closed]
    branches:
      - main
```

Combined with the gate (line 19):

```yaml
if: github.event.pull_request.merged == true
```

This fires on **every merge to main with no exceptions**. There is no condition to skip:

- PRs whose head branch matches `proof-registry/*`
- PRs whose sole mutation is `governance/merge-legitimacy/merge_proof_registry.jsonl`

When a proof-registry PR is merged, the workflow fires, generates a new proof, and opens a new proof-registry PR. That PR must also be merged (governance invariant: direct push to main is `NULL/non-retryable`). Its merge fires the workflow again. The chain has no terminal state.

### Secondary Cause: Branch-per-Proof Architecture Prevents Concurrent Merge

Each proof-registry PR is created from a branch rooted at the current main HEAD at the time of PR creation (lines 461–462):

```bash
git fetch origin main
git checkout -B "$BRANCH_NAME" origin/main
```

If three merges happen before any proof-registry PR is merged, three separate branches are created from three successive HEAD positions:

```
main: A ─── B ─── C ─── D (current HEAD)
              │         │
              │         └─ proof-registry/PROOF-C-xxxx (current)
              └─────────── proof-registry/PROOF-B-xxxx (stale: based on B)
```

Only the most recently created proof-registry PR can ever be current. All older ones are stale by construction. The only way to un-stale them is to rebase or update their branch — which creates a new commit, advancing the branch to D but not changing the semantic content (still one appended JSONL line).

### Tertiary Cause: Stale PRs Cannot Self-Resolve

The existing idempotency checks (lines 450–470) do not help with stale-branch accumulation:

- **Idempotency check 1** (lines 450–459): Searches open PRs by `proof_id`. This correctly prevents duplicate PRs for the same proof. It does not prevent a new proof-registry PR from being opened for a proof-registry merge.
- **Idempotency check 2** (lines 467–470): Greps the registry file on `origin/main`. This prevents duplicate proof entries after a prior registry PR was already merged. It does not prevent new proof generation for a proof-registry merge event.

Neither check addresses the question "is this PR itself a proof-registry PR?" because neither inspects the head branch name or the changed-file list of the triggering event.

---

## 3. Reproduction Path

```
1. Merge any PR to main → proof-registry PR opens (PR N)
2. Merge PR N → proof-registry PR opens (PR N+1)
3. Merge PR N+1 → proof-registry PR opens (PR N+2)
4. [repeat indefinitely]
```

Acceleration: if multiple normal PRs merge in quick succession before any proof-registry PR is merged, each generates a proof-registry PR at successive base SHAs. All but the latest are immediately stale. The backlog grows proportionally to merge rate.

The confirmed instance from Issue #1744:

```
PR #1734 → PR #1736 (proof-registry) → PR #1743 (proof-registry of proof-registry)
```

---

## 4. Governance Implications

### Is the Current Behavior Intentional?

The governance invariant (merge-proof.yml, line 441) states:

> "Direct main persistence classification: NULL (non-retryable); registry persistence must enter through PR admission."

This invariant is correct and desirable for ordinary mutations. Applied to proof-registry mutations without qualification, it generates an unbounded recursive chain where:

- Every proof-registry commit must itself be proofed
- Every proof of a proof-registry commit is also a registry mutation
- Each such mutation must itself be proofed
- etc.

The chain terminates only if proof-registry PRs are excluded from triggering further proofs. The current workflow contains no such exclusion.

### Governance Completeness vs. Recursive Closure

Two interpretations of the governance model are in tension:

**Interpretation A — Complete self-coverage (current behavior):**  
Every mutation to main, including registry admissions, must be independently attested. This produces an unbroken chain of proofs for all mutations but is non-terminating.

**Interpretation B — Registry entries as terminal governance artifacts:**  
A proof-registry entry is the terminal governance record for a merge event. The act of admitting a proof-registry PR through the governed PR path is itself the governance event — it does not require a further proof. The proof-registry PR carries the proof-of-the-original-merge as its payload; no additional proof of the registry admission is needed.

Interpretation B is consistent with the registry's design as an append-only ledger of merge proofs. The ledger records what was proved. The ledger admission itself is not a new merge event requiring further proof; it is the persistence step of an already-completed proof.

### Registry Integrity Under Either Interpretation

The append-only JSONL structure is not compromised by either interpretation. Under Interpretation B:

- The registry still captures every governed main mutation
- Each governed merge produces exactly one proof entry
- The only entries absent from the registry under B are entries that would exist only to document the addition of other entries — recursive self-reference with no additional governance signal

---

## 5. Recommended Remediation Options

### Option 1: Filter on Head Branch Name (Minimal Change)

Add an exclusion condition to the workflow trigger job:

```yaml
if: |
  github.event.pull_request.merged == true &&
  !startsWith(github.event.pull_request.head.ref, 'proof-registry/')
```

**Mechanism:** Proof-registry PRs have head branches matching `proof-registry/PROOF-*`. This condition prevents the workflow from running for such PRs entirely.

**Tradeoff:** Relies on branch naming convention. If a non-proof-registry PR were accidentally named with that prefix, it would be excluded. Branch naming is enforced by the workflow itself (line 439), so in practice this is a closed system.

**Implementation complexity:** Single-line change to merge-proof.yml.  
**Governance impact:** Low. Proof-registry admissions remain governed (go through PR path). They simply do not generate recursive proofs of themselves.

---

### Option 2: Filter on Changed Files (Semantic Exclusion)

Skip proof generation if the PR's changed files are exclusively `merge_proof_registry.jsonl`:

```bash
CHANGED_FILES=$(gh api "repos/$REPO/pulls/$PR_NUMBER/files" --jq '[.[].filename] | @json')
if echo "$CHANGED_FILES" | jq -e '. == ["governance/merge-legitimacy/merge_proof_registry.jsonl"]' > /dev/null; then
  echo "Registry-only PR; proof generation excluded"
  exit 0
fi
```

**Mechanism:** Inspects actual changed files rather than branch name. Catches registry-only mutations regardless of branch naming.

**Tradeoff:** Slightly more fragile (depends on GitHub API call, could misfire if registry path changes). Does not prevent a proof-registry PR that also changes other files from generating a proof — which may be desirable.

**Implementation complexity:** Moderate. Requires a new step or early-exit block before proof generation.  
**Governance impact:** Low, and more semantically precise than Option 1.

---

### Option 3: Single Shared Registry Branch (Queue Model)

Replace the branch-per-proof model with a single long-lived `proof-registry/admission-queue` branch. Each proof is appended to the same PR, which is rebased on main and force-pushed for each new proof.

**Mechanism:** Eliminates the multiplicity of open PRs. One PR always contains all pending proof entries. Merging it catches up all pending proofs at once.

**Tradeoff:** Requires coordination between concurrent workflow runs (race on the shared branch). Force-push required on each update. The PR would need to be closed and a new one opened after each merge cycle, or the branch continuously updated. Conceptually cleaner but operationally more complex.

**Implementation complexity:** High. Requires atomic branch locking, retry logic, and PR lifecycle management.  
**Governance impact:** Medium. A single PR per batch of proofs may weaken auditability of individual proof admissions.

---

### Option 4: Auto-Merge Proof-Registry PRs

Keep the recursive architecture but configure the proof-registry PRs to auto-merge as soon as CI passes, without requiring a human review round-trip.

**Mechanism:** Add `--auto-merge` to the `gh pr create` call (line 512). This merges the PR immediately once required checks pass without any PR queue buildup.

**Tradeoff:** Does not eliminate the recursion — still generates proof-of-proof indefinitely. Reduces human review burden but does not stop the chain. PRs may still accumulate if CI is slow.

**Implementation complexity:** Low. One-line change.  
**Governance impact:** Medium-high. Eliminates human gating on registry admission, which may be inconsistent with the stated governance model.

---

## 6. Preferred Remediation

**Option 1 (filter on head branch name)** is preferred.

Rationale:

1. **Minimal surface area.** One condition added to the job's `if` expression. No new API calls, no new logic paths, no new failure modes.

2. **Consistent with Interpretation B.** A proof-registry admission is the terminal persistence step of an already-generated, already-validated proof. It does not represent a new governed code merge. Excluding it from proof generation is semantically correct, not a governance bypass.

3. **Self-contained enforcement.** The branch naming convention (`proof-registry/PROOF-*`) is produced exclusively by this workflow (line 439). No external actor creates these branches. The filter is therefore closed under the system's own invariants.

4. **Terminates the chain immediately.** The first proof-registry PR merge under this fix produces no further proof-registry PR. The recursive chain collapses to depth 1 for all future merges.

5. **Does not weaken existing idempotency.** Checks 1 and 2 (lines 450–470) remain in place for ordinary proof generation.

The combination of Options 1 and 2 (branch-name filter AND changed-file filter) provides defense-in-depth and is also low-complexity. They are not mutually exclusive.

---

## 7. Implementation Complexity Assessment

| Option | Files Changed | Lines Changed | Risk | Reversible |
|--------|---------------|---------------|------|------------|
| Option 1 (branch filter) | 1 (`merge-proof.yml`) | ~2 | Low | Yes |
| Option 2 (file filter) | 1 (`merge-proof.yml`) | ~8–12 | Low–Medium | Yes |
| Options 1 + 2 (combined) | 1 (`merge-proof.yml`) | ~10–14 | Low | Yes |
| Option 3 (queue model) | 1 (`merge-proof.yml`) | ~50–80 | High | Difficult |
| Option 4 (auto-merge) | 1 (`merge-proof.yml`) | ~1 | Low | Yes |

Option 1 alone is a single-session change. Options 1+2 combined remain a single-session change. Neither requires changes to the registry schema, governance spec, branch protection rules, or any other artifact.

---

## 8. Summary

The proof-registry PR accumulation is caused by a missing self-exclusion filter in `merge-proof.yml`. The workflow fires on all merges to main including merges of its own proof-registry PRs, creating an unbounded recursive chain of proof-of-proof entries. Independently, the branch-per-proof architecture ensures that only one of multiple concurrent proof-registry PRs can ever be current with main at any moment, causing all older ones to require manual branch updates before merging.

The fix is a single condition on the workflow's job gate that skips proof generation when the merged PR originated from a `proof-registry/*` branch. This terminates the recursive chain while preserving all governance properties for ordinary merges.
