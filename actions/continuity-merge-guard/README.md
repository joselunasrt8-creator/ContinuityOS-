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
      - uses: joselunasrt8-creator/mindshift-demo/actions/continuity-merge-guard@main
        id: merge-guard
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
```

Then, in repo settings → Branches → branch protection rule for `main`,
add `continuity-merge-guard / merge-guard` as a required status check.

Once required, ContinuityOS becomes part of the operational definition of
"mergeable" for that branch:

```
Agent-authored PR
 ↓
ContinuityOS Merge Guard: VALID or NULL
 ↓
Merge allowed | Merge blocked
```

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
