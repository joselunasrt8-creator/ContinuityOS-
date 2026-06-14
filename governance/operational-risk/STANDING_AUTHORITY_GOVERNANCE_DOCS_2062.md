# Bounded Standing Authority — Governance Topology-Closure Docs (#2062)

## Intent

Remove the recurring, self-inflicted GMA friction that #2062/#2066-style
governance *documentation* closures hit on `claude/*` branches (observed on
PR #2095, where a one-line classification ratification into
`governance/runtime/BRANCH_PROTECTION_POLICY.json` required a full manual GMA
dispatch). Issue **one** narrowly-scoped Standing Authority (SA) from which those
doc PRs derive authorization automatically, instead of an owner GMA per PR.

This is an **evidence/proposal** artifact (operational-risk → `operational_risk_evidence`,
not a governance primitive, no GMA required to land it). It does **not** issue the
authority — issuance is an owner `workflow_dispatch` act (below).

## The mechanism already exists — this is scope, not new machinery

The SA derivation engine is fully implemented and hardened in
`runtime/standing-authority.mjs` (`selectStandingAuthority`) and enforced at
`merge-governance-check.yml` Tier 3, with budget attribution in `merge-proof.yml`.
It already enforces every bound this proposal relies on:

- `branch_pattern` glob, `mutation_classes` gating, `path_globs` containment,
  **TTL hard bound**, `max_merges` proof-ledger budget, revocation, fail-closed
  on any missing input, deterministic newest-wins selection, `authority_hash`
  recompute on appended records, **trust-surface hard-deny**, fork-safety, and
  base-branch-only provenance.

The generic invariants are covered by `tests/fate/standing-authority-derivation.test.mjs`.
The **exact proposed bounds** below are covered by
`tests/fate/issue-2062-governance-docs-standing-authority-scope.test.mjs`
(admits a `BRANCH_PROTECTION_POLICY.json` / `governance/topology/**` doc on
`claude/*`; rejects out-of-scope governance files, workflow edits, non-`claude/*`
branches, expired TTL, exhausted budget + replay; no vacuous authorization).

## Proposed authority (NARROW by owner decision)

```json
{
  "_record_type": "standing_authority",
  "authority_id": "SA-governance-docs-topology-<workflow_run_id>",
  "authority_hash": "<computed by issuer from bounds + ttl_hours + issued_at>",
  "intent": "Bounded authority for #2062/#2066-style governance topology-closure docs on claude/* without per-PR GMA.",
  "issued_by": "<owner>",
  "source_authority": "OWNER_WORKFLOW_DISPATCH",
  "bounds": {
    "branch_pattern": "claude/*",
    "mutation_classes": ["governance_mutation"],
    "path_globs": [
      "governance/runtime/BRANCH_PROTECTION_POLICY.json",
      "governance/topology/**"
    ],
    "max_merges": 3
  },
  "ttl_hours": 168,
  "issued_at": "<ISO8601_UTC>",
  "expires_at": "<issued_at + 168h>",
  "authority_lineage_bound": true,
  "status": "STANDING_AUTHORITY_VALID"
}
```

### Scope decisions and rationale

- **`mutation_classes`: `governance_mutation` only** — deliberately **excludes**
  `workflow_mutation`. #2062/#2066 closures are governance *docs*, not CI-workflow
  edits. Workflow edits on `claude/*` remain covered (until 2026-06-16) by the
  pre-existing `SA-claude/restore-standing-authority-27472447145`; widening this
  authority to workflows would expand authority beyond the proven bottleneck.
- **`path_globs`: two entries only** — the required-check topology artifact and
  the topology spec directory. Not `governance/**` (that would approach
  "arbitrary governance changes").
- **`ttl_hours: 168` (7 days)** — short blast radius; re-issue deliberately. v1 is
  an experiment: issue narrow, observe, reconcile, extend later.
- **`max_merges: 3`** — small async proof-ledger budget. Owner sets the final
  value at dispatch; use `1` for literally one-merge-then-expire.
- **Trust surfaces are hard-denied regardless of these globs**:
  `runtime/standing-authority.mjs`, `governance/authorizations/standing_authority_registry.jsonl`,
  `.github/workflows/governance-mutation-authorization.yml`,
  `.github/workflows/standing-authority-issuance.yml`. A PR touching any of them
  always requires an explicit GMA — this authority cannot widen or disable the
  authority layer it derives from.

### Why no `governed_files_hash` binding

An SA binds a **class** of changes (branch + mutation_classes + path_globs + TTL
+ budget), not a single diff. Binding a specific `governed_files_hash` would make
it single-use — i.e. a GMA. Per-merge `governed_files_hash` is recorded where it
belongs: in the `merge_proof_registry.jsonl` proof entry stamped at merge time,
which is also the budget ledger. Each derivation is single-use and replay-safe
(one merge per budget unit; the same diff cannot be replayed to drain budget).

## Issuance — owner two-step `workflow_dispatch` (cannot be self-issued)

The SA registry is a governed trust surface, so issuance is a two-step owner act
(per `STANDING_AUTHORITY_SPEC.json#trust_surface_gating`):

1. **Actions → `standing-authority-issuance` → Run workflow**, branch
   `claude/<issuance-branch>`, inputs:
   - `branch_pattern`: `claude/*`
   - `mutation_classes`: `governance_mutation`
   - `path_globs`: `governance/runtime/BRANCH_PROTECTION_POLICY.json,governance/topology/**`
   - `ttl_hours`: `168`
   - `max_merges`: `3`
   - `intent`: `Bounded authority for #2062/#2066-style governance topology-closure docs on claude/* without per-PR GMA.`
   → appends the SA record to `governance/authorizations/standing_authority_registry.jsonl`.
2. **Actions → `governance-mutation-authorization` → Run workflow** on the **same**
   branch → mints a GMA covering the SA-registry change.
3. Open the PR and merge → Tier 1 (explicit GMA) authorizes the issuance; the SA
   lands on `main` (base branch).

Thereafter, a `claude/*` PR whose governed diff is confined to the two path globs
and is `governance_mutation`-only derives Tier 3 authorization automatically — no
per-PR GMA — until the 7-day TTL expires or the budget is consumed, whichever
comes first. Revoke early by appending a `standing_authority_revocation` for the
`authority_id`.

## Preserved invariants

- No verifier, validator, proof, authority, replay, continuity, or workflow
  behavior is changed by this proposal or its test (both are non-governed files).
- Fail-closed preserved: no covering SA and no explicit GMA → `MERGE_LEGITIMACY_NULL`.
- No authority expansion beyond the two governance-doc path globs; trust surfaces
  hard-denied; workflow edits not authorized by this SA.
- `max_merges` is best-effort async budget (per `bound_model`); TTL is the hard
  bound. Strict serial replay safety under concurrent PRs is not claimed.
