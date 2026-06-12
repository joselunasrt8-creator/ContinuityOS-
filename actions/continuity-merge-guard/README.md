# ContinuityOS Merge Guard

A packaged, portable GitHub Action implementing the smallest installable
ContinuityOS dependency wedge:

```
PR
 ↓
canonical identity object {repo, pr_number, head_sha, base_sha, actor}
+ explicit author policy {author_kind, require_agent_authored}
 ↓
canonicalize → sha256
 ↓
VALID  (identity complete and policy satisfied)
  | NULL (missing field, invalid policy input, or policy mismatch — fail-closed)
 ↓
proof artifact (MERGE_GUARD_PROOF.json)
 ↓
required status check
```

## What this proves (v1)

This proves the PR identity object and explicit author-policy scope are
**complete, canonicalized, hashed, and proof-bound** before merge eligibility:

```
validated_object == merge_guard_object
```

That is the entire claim. v1 does **not** validate:

- the PR diff or changed files
- review status or approvals
- automatic detection of whether the author is a human or an agent; callers must provide `author-kind` explicitly
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
- `author_kind`: normalized `agent`, `human`, or `unknown` author scope
- `null_reasons`: comma-separated NULL reason codes, empty for VALID

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
    "actor": "some-contributor",
    "author_kind": "agent",
    "require_agent_authored": "true"
  },
  "canonical_hash": "...",
  "result": "VALID",
  "missing_fields": [],
  "invalid_fields": [],
  "author_kind": "agent",
  "require_agent_authored": "true",
  "agent_author_required": true,
  "null_reasons": [],
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


### Agent-authored required workflow

For an agent-authored PR lane, make the check load-bearing by setting
`require-agent-authored: 'true'` and adding the resulting job name as a
required status check in branch protection. This creates the dependency path
needed by #2001:

```text
Agent-authored PR
 ↓
ContinuityOS Merge Guard: VALID or NULL
 ↓
protected branch required check: pass or fail
 ↓
merge eligible or blocked
 ↓
MERGE_GUARD_PROOF.json
```

Minimal workflow slice:

```yaml
name: continuity-agent-merge-guard

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

jobs:
  agent-merge-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard@main
        id: merge-guard
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
          author-kind: ${{ github.event.pull_request.user.type == 'Bot' && 'agent' || 'human' }}
          require-agent-authored: 'true'
```

Required-check name: **`agent-merge-guard`**. A human-authored PR in this
lane deterministically returns `NULL` with `null_reasons: AGENT_AUTHOR_REQUIRED`;
an agent-authored PR with a complete identity object returns `VALID`.

### Version reference

- `@v0.1.0` — pinned, stable identity-only validator surface. Recommended for any
  consumer that treats the current identity-only Merge Guard result as
  load-bearing (a required status check), so that a changed result can only
  come from a changed PR object, never from a changed validator implementation.
- `@main` — current agent-authored workflow-policy validator surface for
  consumers evaluating `author-kind` and `require-agent-authored` before a
  release tag is cut. Do not leave `@main` as a permanent load-bearing ref.
- `@v0.2.0` — planned pinned tag for the agent-authored workflow-policy
  validator surface. Use this, once tagged, for load-bearing consumers that
  need `author-kind` and `require-agent-authored` proof fields.

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
- **Automatic agent classification** — derive agent/human classification from trusted platform evidence instead of requiring callers to pass `author-kind`.
- **Policy binding** — org-level policy packs and templates.
- **Merge commit binding** — extend the proof past merge to the resulting
  `merge_commit_sha`, in the spirit of `merge-proof.yml`.
- **Registry persistence** — append-only proof registry via PR, following
  the pattern in `governance/merge-legitimacy/merge_proof_registry.jsonl`.
