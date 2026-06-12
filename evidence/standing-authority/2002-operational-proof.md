# Standing Authority Operational Proof — Issue #2002

**Status: PROVEN (live).** A real PR was admitted through Tier 3 Standing Authority
derivation with no per-PR GMA, merged, and its merge proof records the
`standing_authority_id`. A real out-of-scope PR resolved to `MERGE_LEGITIMACY_NULL`,
demonstrating fail-closed containment.

- Date: 2026-06-12 (UTC)
- Repository: `joselunasrt8-creator/ContinuityOS-`
- Issued/merged by: `joselunasrt8-creator` (owner)

## Before → after (the transition this issue proves)

| | `standing_authority_registry.jsonl` on `main` | Authority budget |
|---|---|---|
| Before | absent (0 active authorities) | n/a |
| After  | present, 1 authority `STANDING_AUTHORITY_VALID` | 1 / 1 consumed |

Implemented authority → **operational** authority.

## The Standing Authority (narrow V1, single-file scope)

Issued via `standing-authority-issuance.yml` — owner `workflow_dispatch`
([run 27399384732](https://github.com/joselunasrt8-creator/ContinuityOS-/actions/runs/27399384732)).

```json
{"_record_type":"standing_authority","authority_id":"SA-claude/standing-authority-operational-proof-yur14k-27399384732","authority_hash":"e2b449f961f947b02df77bef5ee9ad35e6afce38e1ecb0c3666ef618604f4250","intent":"Operational proof for issue #2002: bounded Standing Authority permitting exactly one workflow file (.github/workflows/sa-tier3-demo.yml) on claude/* branches, 24h TTL, single merge. Demonstrates live Tier 3 derivation.","issued_by":"joselunasrt8-creator","source_authority":"OWNER_WORKFLOW_DISPATCH","bounds":{"branch_pattern":"claude/*","mutation_classes":["workflow_mutation"],"path_globs":[".github/workflows/sa-tier3-demo.yml"],"max_merges":1},"ttl_hours":24,"issued_at":"2026-06-12T06:42:06Z","expires_at":"2026-06-13T06:42:06Z","authority_lineage_bound":true,"status":"STANDING_AUTHORITY_VALID"}
```

- `authority_hash` recomputed from bounds via `computeAuthorityHash()` → matches `e2b449f9…`.
- `expires_at == issued_at + ttl_hours` (24h) → verified.

## The chain (each link is a real workflow run)

```
Owner workflow_dispatch issues Standing Authority   (run 27399384732)
→ bootstrap PR #2015 admitted via TIER 1 (explicit GMA)   ← trust-surface change needs explicit GMA, never SA-derivable
→ merged to main (19472772) — authority now in BASE state, budget 0/1
→ qualifying PR #2017 mutates ONLY .github/workflows/sa-tier3-demo.yml, NO per-PR GMA
→ merge-governance-check TIER 3 derives authorization   (run 27399796219)
→ GMA_VALID (source: standing-authority-derivation)
→ merged to main (16da2e88)
→ merge-proof stamps standing_authority_id into proof_entry (PR #2018, merged c644248)
→ budget consumed 0/1 → 1/1
```

### 1. Bootstrap (Tier 1) — PR [#2015](https://github.com/joselunasrt8-creator/ContinuityOS-/pull/2015)

The SA registry is a governed **trust surface**, hard-denied from Tier 3, so issuance is
admitted by an explicit GMA (`governance-mutation-authorization.yml`,
[run 27399592517](https://github.com/joselunasrt8-creator/ContinuityOS-/actions/runs/27399592517),
`governed_files_hash 6f25380714…`). `merge-governance-check`
([run 27399665863](https://github.com/joselunasrt8-creator/ContinuityOS-/actions/runs/27399665863)):

```
GMA_VALID: GMA-claude/standing-authority-operational-proof-yur14k-27399592517 (source: registry (branch+hash))
Result: GMA_VALID — governance mutation authorized via append-only lineage
```
Admitted via **Tier 1, not Tier 3** — as required. Merged to `main` (`19472772`).

### 2. Qualifying Tier 3 derivation — PR [#2017](https://github.com/joselunasrt8-creator/ContinuityOS-/pull/2017)

Mutates only `.github/workflows/sa-tier3-demo.yml` on `claude/sa-tier3-demo-proof-yur14k`,
**no per-PR GMA issued**. `merge-governance-check`
([run 27399796219](https://github.com/joselunasrt8-creator/ContinuityOS-/actions/runs/27399796219/job/80974984489),
`BASE_SHA 19472772`, same-repo / not a fork):

```
GMA_VALID: derived (source: standing-authority-derivation; authority_id=SA-claude/standing-authority-operational-proof-yur14k-27399384732)
branch: claude/sa-tier3-demo-proof-yur14k
bounds: {"branch_pattern":"claude/*","mutation_classes":["workflow_mutation"],"path_globs":[".github/workflows/sa-tier3-demo.yml"],"max_merges":1}
Result: GMA_VALID — governance mutation authorized via Standing Authority (GAP-005 Phase 2, policy-bound).
```
No Tier 1/2 match existed; admission came **entirely** from the Standing Authority. Merged (`16da2e88`).

### 3. Proof attribution — PR [#2018](https://github.com/joselunasrt8-creator/ContinuityOS-/pull/2018) (merged `c644248`)

`merge-proof` re-derived the same authority from BASE state at merge time and stamped it.
Persisted `proof_entry` in `governance/merge-legitimacy/merge_proof_registry.jsonl`:

```json
{"_record_type":"proof_entry","proof_id":"PROOF-2017-16da2e88","proof_hash":"4cc5e89466e49377c40791ff7452340f03ad1f7e22fa44af2ab4e40bc6a8d71f","pr_number":2017,"merge_commit_sha":"16da2e889996bf1319b1919805cd84d88420cddd","merged_at":"2026-06-12T06:54:14Z","appended_at":"2026-06-12T06:54:26Z","standing_authority_id":"SA-claude/standing-authority-operational-proof-yur14k-27399384732"}
```

`countConsumedBudget(main, SA-…-27399384732)` → **0 before, 1 after** (budget 1/1).

### Precedence control — bootstrap proof carries NO attribution

The bootstrap merge (#2015) was admitted by an explicit GMA, so its proof_entry
(PR [#2016](https://github.com/joselunasrt8-creator/ContinuityOS-/pull/2016), `PROOF-2015-19472772`)
has **no** `standing_authority_id` — no Standing Authority budget was consumed by the
manual-GMA path. This confirms the tier-precedence rule.

## Negative path (fail-closed) — PR [#2019](https://github.com/joselunasrt8-creator/ContinuityOS-/pull/2019), NULL, closed unmerged

A `claude/*` PR mutating a **different** workflow file (`.github/workflows/sa-tier3-offscope.yml`,
outside the authority's single-file `path_globs`), no GMA. `merge-governance-check`
([run 27400038543](https://github.com/joselunasrt8-creator/ContinuityOS-/actions/runs/27400038543/job/80975791292)):

```
Standing-authority derivation declined: SA-claude/standing-authority-operational-proof-yur14k-27399384732: file .github/workflows/sa-tier3-offscope.yml outside authority path scope
NULL — no valid GMA for this PR's governed diff.
Result: MERGE_LEGITIMACY_NULL (GAP-005 / Issue #1984)
```

Additional negatives are covered by `tests/fate/standing-authority-derivation.test.mjs`
(expired TTL, revoked, budget-exhausted, branch-pattern miss, class out of scope). After this
proof the authority is also **budget-exhausted (1/1)**, so any further `claude/*` mutation of
`.github/workflows/sa-tier3-demo.yml` would likewise NULL.

## Acceptance criteria (#2002) → evidence

| Criterion | Evidence |
|---|---|
| Standing Authority machinery on `main` | present pre-existing (PR #1999) |
| SA record in `standing_authority_registry.jsonl` | registry line above; on `main` since `19472772` |
| Owner-issued, unexpired, unrevoked, in-budget | `OWNER_WORKFLOW_DISPATCH`, 24h TTL, budget 0→1/1 |
| Qualifying PR mutates only in-bounds files | PR #2017 diff = `.github/workflows/sa-tier3-demo.yml` only |
| No per-PR GMA for the qualifying PR | no `gma_registry`/singleton entry for that branch+hash |
| Admitted through Tier 3 | run 27399796219 log (above) |
| `GMA_VALID` source `standing-authority-derivation` | run 27399796219 log (above) |
| Merge proof records `standing_authority_id` | `PROOF-2017-16da2e88` entry (above) |
| ≥1 out-of-scope/exhausted NULL case | PR #2019 NULL (above) + test fixtures |

## No-bypass statement

No explicit per-PR GMA was issued for the qualifying PR #2017. Its admission depended
entirely on the bounded, owner-issued Standing Authority. The authority could not widen
itself (trust-surface edits are hard-denied from Tier 3), could not self-authorize (the gate
reads the registry, ledger, and verifier from `BASE_SHA`), and could not exceed scope
(out-of-scope mutation NULLed). Standing Authority is bounded authority, not a bypass.

## Provenance note

All `workflow_dispatch` calls and merges in this proof were executed by the repository owner
identity `joselunasrt8-creator` (the GitHub MCP integration is authenticated as the owner).
The Standing Authority and bootstrap GMA were produced by their real owner-dispatch workflow
runs (27399384732, 27399592517), not hand-authored.
