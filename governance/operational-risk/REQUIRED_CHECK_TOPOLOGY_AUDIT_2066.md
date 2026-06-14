# Required Check Topology Classification and Load-Bearing Audit — Issue #2066

## Intent

Map, before mutating anything, the repository's CI workflow topology by
merge-legitimacy impact. This artifact classifies every workflow into one of
four classes, states the current vs. recommended **required** (merge-blocking)
check surface, and records the rationale for each proposed move.

This is a **map-first** deliverable. It changes no execution semantics, mutates
no required-check configuration, alters no `npm` scripts, and touches no
`merge-governance-check` classification logic. Those are sequenced as separate
issues (#2079, #2062, #2052) that depend on this map.

## Scope

In scope:

- Inventory all `.github/workflows/*.yml` plus GitHub-managed code-scanning
  (CodeQL) checks.
- Classify each by merge-legitimacy impact.
- Record the current blocking-check surface (as observed on a representative
  governed PR) and the recommended blocking surface.
- Justify every required check and every proposed move.
- Record dependency notes for #2062 (required-check reduction) and #2079
  (test-tiering).

Out of scope (explicitly deferred):

- Changing branch-protection required-check configuration (#2062).
- Splitting / renaming `npm test` (#2079).
- Refactoring `merge-governance-check` path classification (#2052).
- Removing, weakening, or reordering any validation, proof, authority, replay,
  or continuity check.

## Method

- Workflow triggers read from each file's `on:` block at `main`
  (`049dcc4`).
- "Current blocking surface" is the set of checks observed gating a recent
  governed PR (#2082): `merge-governance-check`, `Runtime conformance suite
  (npm test)`, `generate-sco-candidate`, `generate-preo-candidate`,
  `merge-guard`, `constitutional-integrity`, `Fresh-clone install + demo`,
  `CodeQL`, `Analyze (actions)`, `Analyze (rust)`.
- The authoritative required-check list lives in branch-protection settings
  (owner-visible, server-side). This audit classifies by function; #2062
  reconciles the branch-protection list against this map.

## Workflow Inventory

| Workflow file | Workflow / check name | Trigger(s) | PR-blocking today? |
|---|---|---|---|
| `merge-governance-check.yml` | merge-governance-check | `pull_request` → main, `merge_group` | Yes |
| `runtime-tests.yml` | Runtime conformance suite (npm test) | `pull_request`, `push` → main, `workflow_dispatch` | Yes |
| `sco-candidate.yml` | generate-sco-candidate | `pull_request` → main | Yes |
| `preo-candidate.yml` | generate-preo-candidate | `pull_request` → main | Yes |
| `continuity-merge-guard.yml` | merge-guard | `pull_request` (opened/synchronize/reopened) → main | Yes |
| `constitutional-integrity.yml` | constitutional-integrity | `pull_request` → main | Yes |
| `demo-freshness.yml` | Fresh-clone install + demo | `pull_request`, `push` → main, `workflow_dispatch` | Yes (currently) |
| `conformance.yml` | conformance-pack-v1 | `pull_request`/`push` **path-scoped** (`conformance/pack-v1/**`, `scripts/run-conformance.sh`, self), `workflow_dispatch` | Only when in-scope paths change |
| `merge-proof.yml` | merge-proof | `pull_request` **closed** → main | No (post-merge) |
| _(GitHub code scanning)_ | CodeQL / Analyze (actions) / Analyze (rust) | code-scanning default setup | Yes (currently) |
| `governance-mutation-authorization.yml` | governance-mutation-authorization | `workflow_dispatch` | No |
| `standing-authority-issuance.yml` | standing-authority-issuance | `workflow_dispatch` | No |
| `governed-deploy.yml` | governed-deploy | `workflow_dispatch` | No |
| `prepare-governed-deploy.yml` | prepare-governed-deploy | `workflow_dispatch` | No |
| `governed-release.yml` | governed-release | `workflow_dispatch` | No |
| `sa-tier3-demo.yml` | sa-tier3-demo | `workflow_dispatch` | No |

## Classification

### LOAD_BEARING_REQUIRED

Directly protect merge legitimacy, authority containment, proof integrity,
replay safety, or runtime correctness. Red here must mean real merge risk.

- **merge-governance-check** — the single admission gate (Tier 1/2/3 GMA +
  Standing Authority derivation, append-only registry guards, trust-surface
  hard-deny). Non-negotiable.
- **Runtime conformance suite (npm test)** — currently the only required check
  that executes the full FATE suite (runtime + governance + SA/GMA + proof
  lineage). Load-bearing for runtime *and* governance correctness. **Remains
  load-bearing and required until #2079 lands a tiered replacement** (see
  dependency notes).
- **generate-preo-candidate** — pre-execution-object candidate generation;
  protects execution-eligibility derivation.
- **generate-sco-candidate** — state-continuity-object candidate generation;
  protects continuity lineage.
- **merge-guard** (`continuity-merge-guard`) — continuity invariant guard on
  the merge path. Fast and merge-critical; kept required. (The #2066 issue body
  tentatively placed this under SPECIALIZED; this audit promotes it to
  LOAD_BEARING because it gates merge-time continuity legitimacy, not a
  path-scoped concern.)

Post-merge load-bearing (not a pre-merge gate, must not be made one):

- **merge-proof** — runs on PR **close** to write the merge proof and stamp
  Standing Authority budget. Load-bearing for proof/budget integrity, but by
  construction it executes after merge and is therefore never a blocking PR
  check. Listed here so #2062 does not mistake it for a removable required
  check.

### INFORMATIONAL_NON_BLOCKING

Provide visibility / installability / security-scan evidence but do not
determine execution eligibility. Recommended to **not** block ordinary PRs.

- **Fresh-clone install + demo** (`demo-freshness`) — installability evidence
  (clean clone + demo run). Valuable signal, but a demo/install hiccup is not a
  merge-legitimacy failure. Recommend → non-blocking (still runs on every PR
  and push as a visible signal).
- **CodeQL / Analyze (actions) / Analyze (rust)** — GitHub code-scanning.
  Already reports `neutral` rather than a hard pass/fail legitimacy verdict.
  Security-scan signal, not merge-legitimacy. Recommend → non-blocking
  (continues to run and surface alerts).

### SCHEDULED_OR_MANUAL

`workflow_dispatch`-only bounded mutation/operational surfaces. Never PR checks;
not eligible to be required. No change.

- **governance-mutation-authorization** — owner-dispatch GMA minting.
- **standing-authority-issuance** — owner-dispatch SA issuance.
- **governed-deploy** — owner-dispatch production deploy.
- **prepare-governed-deploy** — owner-dispatch deploy-input preparation.
- **governed-release** — owner-dispatch release verification.
- **sa-tier3-demo** — owner-dispatch demonstration.

### SPECIALIZED_OR_PATH_SCOPED

Run conditionally or on a narrow surface; should block **only** when their
in-scope surface changes.

- **conformance-pack-v1** (`conformance.yml`) — path-scoped to
  `conformance/pack-v1/**`, `scripts/run-conformance.sh`, and its own workflow.
  Correctly does not run on unrelated PRs. Keep path-scoped; block only when
  conformance-pack paths change.
- **constitutional-integrity** — runs on every PR today. Verifies
  constitutional-document integrity. Recommend keeping it required **but**
  evaluating in #2062 whether it can be path-scoped to constitutional/governance
  document changes to cut noise on unrelated PRs. (No move asserted in this
  map — flagged for #2062.)

## Current vs. Recommended Required (Blocking) Surface

### Current blocking surface (observed on PR #2082)

```text
merge-governance-check              (LOAD_BEARING_REQUIRED)
Runtime conformance suite (npm test)(LOAD_BEARING_REQUIRED)
generate-sco-candidate              (LOAD_BEARING_REQUIRED)
generate-preo-candidate             (LOAD_BEARING_REQUIRED)
merge-guard                         (LOAD_BEARING_REQUIRED)
constitutional-integrity            (SPECIALIZED_OR_PATH_SCOPED — currently blocking)
Fresh-clone install + demo          (INFORMATIONAL — currently blocking)
CodeQL                              (INFORMATIONAL — currently blocking)
Analyze (actions)                   (INFORMATIONAL — currently blocking)
Analyze (rust)                      (INFORMATIONAL — currently blocking)
```

### Recommended blocking surface (target for #2062)

```text
merge-governance-check              keep — central admission gate
Runtime conformance suite (npm test)keep — full legitimacy suite (until #2079 re-tiers; see below)
generate-sco-candidate              keep — continuity lineage
generate-preo-candidate             keep — execution-eligibility derivation
merge-guard                         keep — merge-time continuity guard
constitutional-integrity            keep, but consider path-scoping in #2062
```

Move to non-blocking (still run, surfaced as signal):

```text
Fresh-clone install + demo          → INFORMATIONAL_NON_BLOCKING
CodeQL / Analyze (actions/rust)     → INFORMATIONAL_NON_BLOCKING
```

### Rationale per move

- **Fresh-clone install + demo → non-blocking:** installability/demo signal,
  not merge-legitimacy. A demo flake should not red-gate a governed PR. Keeps
  running on every PR and push, so the signal is preserved.
- **CodeQL family → non-blocking:** code-scanning already emits `neutral`, not a
  legitimacy verdict; treating scan latency/alerts as merge-risk is exactly the
  "legitimacy noise" #2062 targets. Alerts still surface in the Security tab.
- **constitutional-integrity → keep required (flag for path-scoping):** it
  protects constitutional-document integrity, which is legitimacy-adjacent, so
  it is not safe to drop wholesale. The throughput win is to scope it to
  relevant paths rather than de-require it — a #2062 decision, not asserted
  here.
- **Everything in LOAD_BEARING_REQUIRED: no change.** These are the checks whose
  red genuinely corresponds to merge/runtime/governance risk.

## Dependency Notes

### For #2079 (tiered tests) — must land before #2062 touches `npm test`

- `npm test` today is `node --import tsx --test` with **no path filter**, so it
  runs the entire suite (runtime + governance + proof + SA/GMA + continuity).
- It is therefore the **only** required check carrying full FATE governance
  coverage. It cannot be removed or shrunk as a standalone change without
  opening a legitimacy-coverage gap.
- **Zero-gap path:** #2079 introduces explicit tiers (`npm test` = fast
  unit/smoke; `npm run test:full` = current full suite) and, in the *same PR*,
  repoints the `runtime-tests.yml` CI step from `npm test` → `npm run
  test:full`. The required check is **renamed, never deleted** — full coverage
  gates every merge throughout.
- **Explicit invariant:** until #2079 lands that zero-gap rename, the current
  `npm test` (full runtime + governance) **remains LOAD_BEARING_REQUIRED**. This
  audit removes no validation coverage and de-requires no legitimacy check.

### For #2062 (required-check reduction) — consumes this map

- #2062 may move `Fresh-clone install + demo` and the CodeQL family to
  non-blocking, using the classification above as justification evidence.
- #2062 should **not** alter `npm test`'s required status until #2079 provides
  the renamed `test:full` gate (ordering dependency: #2079 before the `npm
  test`-related part of #2062).
- #2062 should evaluate path-scoping `constitutional-integrity` rather than
  de-requiring it.
- The LOAD_BEARING_REQUIRED set is the floor: #2062 must not drop below it.

### Relationship to #2052 (separate track)

- #2052 refactors `merge-governance-check`'s **file-path → mutation-class**
  classifier (authorization throughput / manual-GMA churn). That is a different
  axis from required-check topology (this map) and is implemented separately.
  No coupling required.

## Preserved Invariants

```text
This audit changes no execution semantics.
This audit removes no validation coverage.
This audit mutates no required-check configuration.
Full runtime + governance coverage (npm test) remains LOAD_BEARING_REQUIRED
  until #2079 lands a zero-gap tiered replacement.
Capability ≠ authority. Visibility ≠ legitimacy. Classification ≠ permission.
```

## Closure Condition

This issue (#2066) closes when this artifact is merged: every workflow is
inventoried and classified, the current vs. recommended blocking surface is
recorded with per-move rationale, and the dependency ordering for #2079 → #2062
(and the separate #2052 track) is documented. Implementation of any move is
explicitly deferred to those issues.
