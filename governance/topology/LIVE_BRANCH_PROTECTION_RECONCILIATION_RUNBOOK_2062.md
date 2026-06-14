# Live Branch-Protection Reconciliation Runbook — #2062

- **Issue:** #2062 (Reduce failed-check disturbance from long-running workflow scans)
- **Lineage:** #2066 (required-check topology), #2079 (runtime suite rename), #2095 (classification ratification)
- **Record type:** `owner_reconciliation_runbook`
- **Status:** `OWNER_VERIFICATION_REQUIRED` — the steps below are a repository-administrator settings
  action and are **not file-committable**. This document is the executable description of that action;
  it changes no required-check configuration and no execution semantics on its own.
- **Last reviewed:** 2026-06-14

## Why this exists

The required-check topology for `main` was classified and ratified into
`governance/runtime/BRANCH_PROTECTION_POLICY.json#required_check_topology_classification` (PR #2095).
That ratification is documentation: it records which checks are `LOAD_BEARING_REQUIRED` versus
`INFORMATIONAL_NON_BLOCKING`. It does **not** alter GitHub's live ruleset.

Today's evidence that the live surface still diverges from the ratified classification:

- **PR #2102** merge was rejected with *"Code scanning is still expecting 1 result from CodeQL for
  e50f8cf / 1db85b6"* — a merge gated on CodeQL scan latency, not on merge legitimacy.
- **PRs #2099 / #2101** had required checks park in `action_required` (0 jobs) on bot-pushed commits,
  requiring an owner re-kick.

These are exactly #2062's two still-unmet behavioral acceptance criteria:
1. Heavy/informational scans no longer block ordinary PRs.
2. Red checks correspond to real merge risk, not scan latency.

Neither is satisfiable by a committed file. Both require the live actions below.

## Target state (what "reconciled" means)

The live merge-blocking surface for `main` must equal exactly the four `LOAD_BEARING_REQUIRED` checks
from the ratified classification:

| Check | Classification | Live required? (target) |
|---|---|---|
| `merge-governance-check` | LOAD_BEARING_REQUIRED | ✅ required |
| `generate-preo-candidate` | LOAD_BEARING_REQUIRED | ✅ required |
| `generate-sco-candidate` | LOAD_BEARING_REQUIRED | ✅ required |
| `constitutional-integrity` | LOAD_BEARING_REQUIRED | ✅ required |
| `CodeQL / Analyze (actions)` | INFORMATIONAL_NON_BLOCKING | ❌ not merge-blocking |
| `CodeQL / Analyze (rust)` | INFORMATIONAL_NON_BLOCKING | ❌ not merge-blocking |
| `Fresh-clone install + demo` | INFORMATIONAL_NON_BLOCKING | ❌ not merge-blocking |
| `merge-proof` | POST_MERGE | ❌ never required (runs after merge) |

## Owner steps (repository-administrator)

1. **Branch protection / ruleset for `main`** → *Require status checks to pass before merging*.
   Set the required-status-checks list to **exactly** the four `LOAD_BEARING_REQUIRED` checks above.
   Remove `CodeQL / Analyze (actions)`, `CodeQL / Analyze (rust)`, and `Fresh-clone install + demo`
   from the required list if present.
2. **Code security and analysis** → *Code scanning* → *Protection rules* (merge protection / "check
   failures"): set CodeQL so a missing/in-progress result does **not** block merge. This is the rule
   that produced the PR #2102 *"Code scanning is still expecting 1 result"* rejection; it is separate
   from the required-status-checks list and must be relaxed independently.
3. Confirm `merge-proof` is **not** in the required list (it is POST_MERGE by design).
4. Re-confirm fail-closed is preserved: the four LOAD_BEARING checks remain required, and no
   informational removal dropped any of them.

## Verification after owner action

- Open a trivial in-scope PR on a `claude/*` branch and confirm it can merge once the four
  LOAD_BEARING checks are green, **without** waiting on CodeQL or Fresh-clone.
- Confirm a genuinely failing LOAD_BEARING check still blocks (red == real merge risk).
- Update `governance/runtime/BRANCH_PROTECTION_POLICY.json#live_branch_protection_reconciliation.status`
  from `OWNER_VERIFICATION_REQUIRED` to `RECONCILED` (with date) once the live surface matches.

## Invariants

- `semantics_unchanged`: true — this runbook changes no enforcement logic.
- `required_set_changed`: false — committing this file changes no required-check configuration.
- `fail_closed_preserved`: true — the target state retains all four LOAD_BEARING_REQUIRED checks.
- `reconciliation_status`: `RUNBOOK_ONLY` until the owner executes the steps and flips the policy flag.
