# Closure Audit — Issue #2002: Standing Authority Operational Proof

**Status:** CLOSED — acceptance criteria satisfied
**Repository:** `joselunasrt8-creator/ContinuityOS-`
**Audit date:** 2026-06-12
**Artifact class:** evidence (read-only record *about* governance state; **not** a
governance primitive). The authoritative objects remain
`governance/authorizations/standing_authority_registry.jsonl`,
`governance/merge-legitimacy/merge_proof_registry.jsonl`, and
`governance/authorizations/gma_registry.jsonl`.

> Every claim below is transcribed verbatim from live GitHub Actions logs and the
> `main` registry state at commit `c644248`. No values were synthesized.

---

## Closure statement

Standing Authority moved from architectural capability to operational registry
state through owner-authenticated `workflow_dispatch`. A qualifying in-scope
workflow mutation derived eligibility through **Tier 3** standing-authority-derivation
without a per-PR GMA. Merge-proof attribution persisted `standing_authority_id`
and consumed the sole merge budget (**0/1 → 1/1**). An out-of-scope workflow
mutation returned **MERGE_LEGITIMACY_NULL** and remained ineligible. Issue #2002
acceptance criteria are satisfied.

---

## The Standing Authority under test

From `governance/authorizations/standing_authority_registry.jsonl` on `main`:

| field | value |
|---|---|
| `authority_id` | `SA-claude/standing-authority-operational-proof-yur14k-27399384732` |
| `authority_hash` | `e2b449f961f947b02df77bef5ee9ad35e6afce38e1ecb0c3666ef618604f4250` |
| `source_authority` | `OWNER_WORKFLOW_DISPATCH` (issued_by `joselunasrt8-creator`) |
| `bounds.branch_pattern` | `claude/*` |
| `bounds.mutation_classes` | `["workflow_mutation"]` |
| `bounds.path_globs` | `[".github/workflows/sa-tier3-demo.yml"]` (single file) |
| `bounds.max_merges` | `1` |
| `ttl_hours` | `24` |
| `issued_at` | `2026-06-12T06:42:06Z` |
| `expires_at` | `2026-06-13T06:42:06Z` (= `issued_at` + 24h, exact) |
| `status` | `STANDING_AUTHORITY_VALID` |

---

## Phase A — issuance + Tier 1 bootstrap (PR #2015)

The SA registry is a **trust surface** (`merge-governance-check.yml` `TRUST_SURFACES`),
so issuing the authority can **never** be admitted by SA derivation — it must go
through an explicit GMA. PR #2015 carried that covering GMA.

**Provenance run IDs**
- SA issuance: `standing-authority-issuance.yml`, run **`27399384732`** (the run_id
  is bound into the `authority_id`).
- Covering GMA issuance: `governance-mutation-authorization.yml`, run **`27399592517`**
  (bound into the `gma_id`).

**Tier 1 admission** — `merge-governance-check`, run **`27399665863`**, job **`80974563831`**:

```
GMA_VALID: GMA-claude/standing-authority-operational-proof-yur14k-27399592517 (source: registry (branch+hash))
governed_files_hash: 6f25380714eee0cd36f687852a2a6106261a60884494a58ed78ac6cdcb710e38
branch: claude/standing-authority-operational-proof-yur14k
decision_id: f1b21161cf4fa68b498d21d2ad42c74637763e61cdda519e27727be36993a7f9
Result: GMA_VALID — governance mutation authorized via append-only lineage (GAP-005 / Issue #1984)
```

- Admission source = **Tier 1 explicit GMA** (`registry (branch+hash)`), **not**
  `standing-authority-derivation`.
- Same job also logged `Validated 1 appended standing authority record(s).`
- Merged by `joselunasrt8-creator`; SA landed on `main`.
- Budget after bootstrap: **0/1** (the bootstrap merge carries no
  `standing_authority_id`; it establishes authority existence, not consumption).

---

## Phase B — Tier 3 derivation (PR #2017)

PR #2017 adds `.github/workflows/sa-tier3-demo.yml` — a `workflow_mutation` on a
`claude/*` branch, exactly inside the SA `path_globs`, with **no explicit GMA**.

**Tier 3 admission** — `merge-governance-check`, run **`27399796219`**, job **`80974984489`**:

```
GMA_VALID: derived (source: standing-authority-derivation; authority_id=SA-claude/standing-authority-operational-proof-yur14k-27399384732)
branch: claude/sa-tier3-demo-proof-yur14k
bounds: {"branch_pattern":"claude/*","mutation_classes":["workflow_mutation"],"path_globs":[".github/workflows/sa-tier3-demo.yml"],"max_merges":1}
Result: GMA_VALID — governance mutation authorized via Standing Authority (GAP-005 Phase 2, policy-bound).
```

- Admission source = **Tier 3 standing-authority-derivation** from the SA above —
  the owner authorized once (issuance), and the qualifying PR derived eligibility
  without a per-PR GMA.
- Derivation inputs read from the **BASE** branch only (registry + verifier +
  proof ledger), never the PR checkout (TOCTOU-closed by design).
- Merged to `main` as commit `16da2e889996bf1319b1919805cd84d88420cddd`.

---

## Consumption — proof attribution (PR #2018)

`merge-proof.yml` (run `27399896724`) generated the merge proof and routed its
persistence through governed PR admission (**PR #2018**, merged by
`joselunasrt8-creator`). Resulting append-only entry, line 102 of
`governance/merge-legitimacy/merge_proof_registry.jsonl` on `main` (`c644248`):

```json
{"_record_type":"proof_entry","proof_id":"PROOF-2017-16da2e88","proof_hash":"4cc5e89466e49377c40791ff7452340f03ad1f7e22fa44af2ab4e40bc6a8d71f","pr_number":2017,"merge_commit_sha":"16da2e889996bf1319b1919805cd84d88420cddd","merged_at":"2026-06-12T06:54:14Z","appended_at":"2026-06-12T06:54:26Z","standing_authority_id":"SA-claude/standing-authority-operational-proof-yur14k-27399384732"}
```

**Budget**

| | value |
|---|---|
| before consumption | **0/1** |
| after consumption | **1/1** |
| counting mechanism | `countConsumedBudget()` — `runtime/standing-authority.mjs:102` (counts unique `proof_id`s whose `standing_authority_id` matches the authority) |

The SA is now exhausted (`consumed (1) < max_merges (1)` is false), so it can
authorize no further derivations even before its 24h TTL elapses.

---

## Negative control — fail-closed boundary (PR #2019)

PR #2019 mutates `.github/workflows/sa-tier3-offscope.yml` — a workflow file
**outside** the SA `path_globs`, same `claude/*` branch, same `workflow_mutation`
class, no explicit GMA. It is **expected to fail** and was **not merged**.

`merge-governance-check`, run **`27400038543`**, job **`80975791292`** (conclusion: **failure**, exit 1):

```
Standing-authority derivation declined: SA-claude/standing-authority-operational-proof-yur14k-27399384732: file .github/workflows/sa-tier3-offscope.yml outside authority path scope
NULL — no valid GMA for this PR's governed diff.
computed governed_files_hash: 09c5fc2f4ca86711befa93f66ab1d04c7e98d27c766c14c4dcd9f8e7d964e03d
branch: claude/sa-tier3-offscope-yur14k
Result: MERGE_LEGITIMACY_NULL (GAP-005 / Issue #1984)
```

PR #2019 state: **closed, unmerged**. This is the containment proof: the Standing
Authority is **bounded authority, not a bypass** — capability ≠ authority.

---

## Acceptance criteria — final tally

| #2002 criterion | result | evidence |
|---|---|---|
| Standing Authority exists on `main` | ✅ | SA registry record, `status=STANDING_AUTHORITY_VALID` |
| `authority_hash` verifiable from bounds | ✅ | `e2b449f9…`, recomputed by `computeAuthorityHash()` |
| `expires_at = issued_at + 24h` | ✅ | `06:42:06Z` → `06:42:06Z` (+24h) |
| Bootstrap admitted via Tier 1 only (trust surface) | ✅ | run `27399665863` — `source: registry (branch+hash)` |
| Bootstrap consumes no SA budget | ✅ | no `standing_authority_id` on #2015; budget stayed 0/1 |
| Tier 3 derives from the SA | ✅ | run `27399796219` — `source: standing-authority-derivation` |
| `standing_authority_id` persisted | ✅ | `PROOF-2017-16da2e88` (PR #2018, merged) |
| Budget 0/1 → 1/1 | ✅ | `countConsumedBudget()` = 1 |
| Out-of-scope mutation fails closed | ✅ | run `27400038543` — `MERGE_LEGITIMACY_NULL`, PR #2019 unmerged |

**Issue #2002: CLOSED.**

---

## Provenance index

| object | id / ref |
|---|---|
| SA issuance run | `27399384732` |
| Covering GMA issuance run | `27399592517` |
| Tier 1 admission (PR #2015) | run `27399665863`, job `80974563831` |
| Tier 3 admission (PR #2017) | run `27399796219`, job `80974984489` |
| Merge-proof generation (PR #2017) | run `27399896724` |
| Consumption proof persistence | PR #2018 → `main` commit `c644248` |
| Negative control (PR #2019) | run `27400038543`, job `80975791292` |
| `main` HEAD at audit | `c644248` |
