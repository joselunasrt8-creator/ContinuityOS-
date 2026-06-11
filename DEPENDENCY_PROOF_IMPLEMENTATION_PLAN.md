# Dependency Proof — Implementation Plan

**Source:** `PORTFOLIO_LEVERAGE_AUDIT.md` (PR #1978), candidate #1 ("External-
validation path repair + demo-freshness CI gate")
**Transition targeted:** `Architecture Proof → Demonstration Proof →
Dependency Proof`
**Closure mapping:** unblocks `#1955` ("First External Dependency
Validation"), the only open issue in `ContinuityOS-`.

---

## 1. File-level change list

### Implemented in this change (branch
`claude/continuityos-dependency-proof-hzu5kd`)

| File | Change | LOC |
|---|---|---|
| `.github/workflows/demo-freshness.yml` | New CI workflow: `npm ci && npm run demo && npm run demo:langchain` on every push/PR to `main`, asserts `EXECUTED`/`NULL` outcomes appear in both logs, uploads logs as artifacts | +57 |
| `demo/portability/RECORDED_DEMO.md` | Fix clone URL (`ContinuityOS-.git`) and directory (`cd ContinuityOS-`); update transcript package name to `continuityos@1.0.0` | ~4 |
| `CANONICAL_AEO_IDENTITY_SPEC.md` | Fix `**Repository:**` field to `joselunasrt8-creator/ContinuityOS-` | 1 |
| `package.json`, `package-lock.json` | `"name": "mindshift-demo"` → `"name": "continuityos"` (npm package name only — `wrangler.toml` worker/D1 names untouched, see `IDENTITY_RESIDUE_AUDIT.md`) | 3 |
| `IDENTITY_RESIDUE_AUDIT.md` | New: full classification of every `mindshift-demo` reference (REPLACE / LEGACY / FOLLOW_UP / KEEP) | +110 |
| `PROOF_REGISTRY_BACKLOG_AUDIT.md` | New: mergeability analysis of the 8 open `proof-registry/*` PRs + PR #1880 | +45 |
| `DEPENDENCY_PROOF_IMPLEMENTATION_PLAN.md` | This document | +~90 |

**Total: ~7 files, ~310 LOC (mostly new audit/CI documentation; 8 LOC of
functional fix).**

### Completed after this change — GitHub-state operations (2026-06-11)

| Action | Where | Outcome |
|---|---|---|
| Rewrite `#1955`'s "External Validation Workflow" block (blank `git clone` + `cd mindshift-demo`) with the real clone URL/directory | Issue body edit, `ContinuityOS-#1955` | **Done** — issue body rewritten with corrected clone URL/dir and a dated note. |
| Open PR from `claude/continuityos-dependency-proof-hzu5kd` to `main`, get `demo-freshness` green | `ContinuityOS-#1980` | **Done** — merged (`4711827`). Required generating a manual GAP-005 GMA artifact for the new workflow file (`governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION.json`); all required checks passed. |
| Merge `#1924` (clean) | `ContinuityOS-` PR | **Done** — merged (`93c40fb`). |
| `#1880` | `ContinuityOS-` PR | **Closed, not merged** — its audit content was found stale (subject issues already resolved on `main` via #1899); see `PROOF_REGISTRY_BACKLOG_AUDIT.md` for details. |
| Rebase + merge `#1887, #1889, #1892, #1896, #1898, #1900, #1904` (1-line JSONL conflict each, see `PROOF_REGISTRY_BACKLOG_AUDIT.md`) | `ContinuityOS-` PRs | **Done** — all 7 rebased (chained, force-pushed) and merged in ascending `pr_number` order. Registry grew 87 → 96 lines. |
| Recruit one external operator and record evidence in `#1955` | External | **Pending** — requires a real external party, see closure mapping below. |

---

## 2. Recommended `#1955` issue body replacement (External Validation Workflow section)

```bash
git clone https://github.com/joselunasrt8-creator/ContinuityOS-.git
cd ContinuityOS-
npm install
npm run demo:langchain
```

Required observations (verified live during this session, see logs):

```text
"result": "EXECUTED"   (validated_object_hash == executed_object_hash)
"result": "NULL"       (REPLAY_NULL, then POLICY_NULL)
```

---

## 3. Implementation order

1. **Done**: demo-freshness CI gate + active-path identity fixes + audits.
   Pushed to `claude/continuityos-dependency-proof-hzu5kd`.
2. **Done**: opened PR #1980 from this branch to `main`; `demo-freshness`
   went green and the PR merged (`4711827`).
3. **Done**: merged `#1924` (clean); closed `#1880` (stale, not merged).
4. **Done**: rebased and merged `#1887 → #1889 → #1892 → #1896 → #1898 →
   #1900 → #1904` in ascending `pr_number` order, resolving the single-line
   JSONL insertion conflict each time.
5. **Done**: edited `#1955`'s issue body per §2 above.
6. **Pending**: recruit one external operator; walk them through clone →
   `npm install` → `npm run demo:langchain`; record their evidence and the 6
   feedback answers in `#1955`.
7. (Sandbox repo, lower priority) Confirm PR #12 is merged and `v0.1.1` is
   tagged — `continuityos-sandbox` already shows 0 open PRs as of this audit,
   so this step may already be complete.

---

## 4. Risk analysis

- **`package.json` rename (`mindshift-demo` → `continuityos`)**: low risk.
  Verified: `npm install`, `npm run demo`, and `npm run demo:langchain` all
  run correctly post-rename (executed in this session). Pre-existing test
  failures (41/5059, e.g. `tests/session-runtime.test.mjs`) were confirmed
  present **before** this change via `git stash` + re-run — unrelated to this
  change. `wrangler.toml` worker/D1 names (the actual deployed Cloudflare
  resources) were deliberately left untouched.
- **`demo-freshness.yml`**: read-only CI (`permissions: contents: read`), no
  deploy/authority capability, mirrors the existing `conformance.yml`
  pattern. Risk: demos are non-deterministic in timing only (hashes/IDs
  differ per run by design — the grep checks structural markers
  `"result": "EXECUTED"` / `"result": "NULL"`, not specific hash values, so
  this is stable).
- **Proof-registry rebases (§1, deferred)**: each is a single-line JSONL
  insertion; conflict resolution is mechanical and the `proof_id` values are
  pre-computed and immutable (only their position in the file changes).
  Force-pushing rebased branches changes PR history but not `main`; the
  actual `main` merges remain ordinary merge commits.
- **`#1955` edit**: editing an open issue's body is reversible (issue history
  is preserved) and does not change `main`.

---

## 5. Closure mapping to #1955

| #1955 acceptance criterion | Status |
|---|---|
| Documented workflow is executable verbatim | **Done** (PR #1980 merged; `demo-freshness` gates regressions) |
| One external operator identified | Pending (step 6) |
| Operator installs independently | Pending (step 6) |
| VALID / NULL execution demonstrated by operator | Pending (step 6) |
| Feedback documented | Pending (step 6) |
| Dependency evidence committed/linked/quoted in #1955 | Pending (step 6) |

Steps 1–5 are complete and remove every *internal* obstacle between `#1955`
and an external operator succeeding on the first try. Step 6 is the only step
that produces the actual "Dependency Proof" the milestone requires, and it
cannot be performed by this session (per `#1955`'s explicit non-goals:
"Self-validation by repository author", "Simulated external feedback").
