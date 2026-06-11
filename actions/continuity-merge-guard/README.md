# ContinuityOS Merge Guard

A packaged, portable GitHub Action implementing the smallest installable
ContinuityOS dependency wedge:

```
PR
 ↓
canonical identity object {repo, pr_number, head_sha, base_sha, actor}
 ↓
canonicalize → sha256
 ↓
VALID  (all fields present and non-empty)
  | NULL (any field missing — fail-closed)
 ↓
proof artifact (MERGE_GUARD_PROOF.json)
 ↓
required status check
```

## What this proves (v1)

This proves the PR identity object is **complete, canonicalized, hashed,
and proof-bound** before merge eligibility:

```
validated_object == merge_guard_object
```

That is the entire claim. v1 does **not** validate:

- the PR diff or changed files
- review status or approvals
- whether the author is a human or an agent
- the final merge commit

Those are deliberately deferred — see [v2](#v2-not-yet-built) below. v1 is
a legitimacy check on object identity, not a review system, agent
classifier, or policy engine.

v1 is **stateless and idempotent**, not replay-tracked: re-running the action
against an identical `{repo, pr_number, head_sha, base_sha, actor}` payload
(e.g. a re-run of the same workflow on an unchanged PR) re-evaluates to the
same `result`/`canonical_hash` every time. This differs from the
replay-nonce model used by the Stage 1 governed-execution gateway
(`npm run demo`, `REPLAY_NULL`/`REPLAY_NONCE_CONSUMED`); Merge Guard v1 has no
equivalent "consumed nonce" concept.

## Output

Each run produces:

- `result`: `VALID` or `NULL`
- `proof_id`: `MERGE_GUARD-{pr_number}-{head_sha[:8]}`
- `proof_hash`: sha256 of the canonical payload
- `proof_url`: path to the uploaded `MERGE_GUARD_PROOF.json` artifact

The proof is written to the job's step summary and uploaded as a workflow
artifact named `MERGE_GUARD_PROOF`, so it is visible directly on the PR
check run — the proof is the product.

Example `MERGE_GUARD_PROOF.json`:

```json
{
  "proof_id": "MERGE_GUARD-1970-a1b2c3d4",
  "repo": "owner/repo",
  "canonical_payload": {
    "repo": "owner/repo",
    "pr_number": "1970",
    "head_sha": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    "base_sha": "0123456789abcdef0123456789abcdef01234567",
    "actor": "some-contributor"
  },
  "canonical_hash": "...",
  "result": "VALID",
  "missing_fields": [],
  "generated_at": "2026-06-10T00:00:00.000Z",
  "record_type": "MERGE_GUARD_PROOF"
}
```

## Install (2 minutes)

Add a workflow to the consuming repo:

```yaml
name: continuity-merge-guard

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

jobs:
  merge-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard@v0.1.0
        id: merge-guard
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
```

Then, in repo settings → Branches → branch protection rule for `main`,
add the required status check named **`merge-guard`** (this is the exact
check-run name GitHub reports for the `merge-guard` job above; the
workflow file name shows as grouping context in the UI but is not part of
the required-check name itself — select `merge-guard`, not
`continuity-merge-guard / merge-guard`).

Once required, ContinuityOS becomes part of the operational definition of
"mergeable" for that branch:

```
Agent-authored PR
 ↓
ContinuityOS Merge Guard: VALID or NULL
 ↓
Merge allowed | Merge blocked
```

### Version reference

- `@v0.1.0` — pinned, stable validator surface. Recommended for any
  consumer that treats the Merge Guard result as load-bearing (a required
  status check), so that a changed result can only come from a changed PR
  object, never from a changed validator implementation.
- `@main` — floating reference. Acceptable for exploration/evaluation, but
  not recommended once a consumer relies on the result for merge
  eligibility.

A `v0.1.1` tag is planned at the current `main` HEAD (the commit that
fixed this README's stale `mindshift-demo` install path). Relative to
`v0.1.0`, only this README changes — `action.yml`, `check.mjs`,
`test.mjs`, and `fixtures/` are byte-identical, so `result`, `proof_id`,
and `canonical_hash` are unaffected by a `v0.1.0` → `v0.1.1` move. See
`continuityos-sandbox`'s `VERSION_UPGRADE.md` for the continuity
assessment.

### Known external consumers

- [`joselunasrt8-creator/continuityos-sandbox`](https://github.com/joselunasrt8-creator/continuityos-sandbox) —
  pins `@v0.1.0`; `merge-guard` is a **required** status check on `main`
  (`LOAD-BEARING_ACTIVE`). See that repo's `LOAD_BEARING_READINESS.md`,
  `NULL_ENFORCEMENT_PROOF.md`, and `EXTERNAL_DEPENDENCY_PROOF.md` for the
  install path, required-check configuration, and proof that real PRs'
  merge eligibility depends on the Merge Guard result.

## Portability

This directory is self-contained: `check.mjs` inlines `canonicalize` and
`sha256Hex` (the same algorithm used by
`conformance/pack-v1/harness.mjs`) and has no external npm dependencies.
It can be copied into any repository unmodified.

## Conformance

```bash
node actions/continuity-merge-guard/test.mjs
```

Runs the decision logic against the fixtures in `fixtures/` with no
network access — verifying VALID/NULL classification and `canonical_hash`
determinism.

## v2 (not yet built)

Deferred to keep v1 minimal and installable in 2 minutes:

- **Review binding** — require an approving review with
  `commit_id == head_sha`.
- **Diff binding** — bind the proof to the changed files / tree, not just
  the commit identity.
- **Agent classification** — distinguish agent-authored PRs from
  human-authored PRs and apply different policy.
- **Policy binding** — org-level policy packs and templates.
- **Merge commit binding** — extend the proof past merge to the resulting
  `merge_commit_sha`, in the spirit of `merge-proof.yml`.
- **Registry persistence** — append-only proof registry via PR, following
  the pattern in `governance/merge-legitimacy/merge_proof_registry.jsonl`.
