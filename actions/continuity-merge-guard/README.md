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
- `attribution_status`: `identity_present`, `identity_missing`, or `identity_ambiguous`
- `attribution_classification`: `AGENT_AUTHORED`, `AGENT_ASSISTED`, `HUMAN_AUTHORED`, or `UNKNOWN`
- `actor_kind`: normalized actor kind `human` / `agent` / `bot` / `unknown`
- `attribution_evidence_hash`: sha256 of the canonicalized attribution evidence
- `require_diff_binding`: normalized `true` / `false` diff-evidence policy
- `changed_files_hash`: optional caller-supplied `sha256:<hex>` changed-files/diff evidence hash
- `changed_files_count`: optional non-negative changed-files count represented by `changed_files_hash`
- `require_review_binding`: normalized `true` / `false` review-evidence policy
- `review_state`: optional caller-supplied review state; must be `APPROVED` when supplied or required
- `review_commit_sha`: optional caller-supplied review commit SHA; must match `head_sha` when supplied or required
- `review_author`: optional caller-supplied approving review actor/login
- `require_merge_commit_binding`: normalized `true` / `false` post-merge evidence policy
- `merge_commit_sha`: optional caller-supplied post-merge commit SHA
- `merged_at`: optional caller-supplied merge timestamp

The proof is written to the job's step summary and uploaded as a workflow
artifact named `MERGE_GUARD_PROOF`, so it is visible directly on the PR
check run — the proof is the product.

### Agent Identity (Phase 1)

The Merge Guard also records a descriptive **actor attribution** object, derived
from optional PR/workflow metadata (`pr-body`, `pr-labels`, `head-ref`,
`commit-trailers`, ...). Attribution is metadata, not authority: it never enters
the canonical identity payload (so `proof_hash` is unchanged and backward
compatible), and it does not alter merge execution semantics. Missing
attribution is non-blocking; only *conflicting* authoritative signals fail
closed (`ATTRIBUTION_AMBIGUOUS` → `NULL`). See
`governance/merge-legitimacy/AGENT_ATTRIBUTION_SPEC.json` and
`AGENT_ATTRIBUTION_PHASE1_NOTES.md`.

**Commit-trailer signal (authoritative).** The bundled
`.github/workflows/continuity-merge-guard.yml` harvests commit trailers from the
PR's `base..head` commit range and feeds them as the `commit-trailers` input.
Two keys are recognized (case-insensitive), co-located with the change they
describe:

```
Agent-Authored-By: <agent-id>     → AGENT_AUTHORED
Agent-Assisted-By: <agent-id>     → AGENT_ASSISTED
```

This is the most durable place to declare authorship. Like a label or a PR-body
block it is an *assertion*, not cryptographic proof, and it is not authority —
classifying a PR `AGENT_AUTHORED` grants it no merge permission. `Co-Authored-By`
is deliberately **not** treated as an agent signal (humans use it routinely). A
trailer that contradicts an authoritative label/body declaration is a conflict
and fails closed to `NULL`.

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
    "require_agent_authored": "true",
    "require_diff_binding": "true",
    "diff_binding": {
      "changed_files_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "changed_files_count": 3,
      "binding_mode": "caller_supplied_v1"
    },
    "require_review_binding": "true",
    "review_binding": {
      "review_state": "APPROVED",
      "review_commit_sha": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      "review_author": "maintainer-login",
      "binding_mode": "caller_supplied_v1"
    },
    "require_merge_commit_binding": "true",
    "merge_commit_binding": {
      "merge_commit_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "merged_at": "2026-06-10T00:05:00.000Z",
      "binding_mode": "caller_supplied_post_merge_v1"
    }
  },
  "canonical_hash": "...",
  "result": "VALID",
  "missing_fields": [],
  "invalid_fields": [],
  "author_kind": "agent",
  "require_agent_authored": "true",
  "agent_author_required": true,
  "require_diff_binding": "true",
  "diff_binding_required": true,
  "diff_binding": {
    "changed_files_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "changed_files_count": 3,
    "binding_mode": "caller_supplied_v1"
  },
  "require_review_binding": "true",
  "review_binding_required": true,
  "review_binding": {
    "review_state": "APPROVED",
    "review_commit_sha": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    "review_author": "maintainer-login",
    "binding_mode": "caller_supplied_v1"
  },
  "require_merge_commit_binding": "true",
  "merge_commit_binding_required": true,
  "merge_commit_binding": {
    "merge_commit_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "merged_at": "2026-06-10T00:05:00.000Z",
    "binding_mode": "caller_supplied_post_merge_v1"
  },
  "null_reasons": [],
  "generated_at": "2026-06-10T00:00:00.000Z",
  "record_type": "MERGE_GUARD_PROOF"
}
```

For outside-owner adoption evidence, use the [External Dependency Proof Checklist](EXTERNAL_DEPENDENCY_PROOF_CHECKLIST.md).

### Diff binding — caller-supplied v1

Merge Guard can now bind the proof to explicit changed-files evidence without
calling the GitHub API or inferring authority. Set `require-diff-binding:
'true'` and pass both:

- `changed-files-hash`: a `sha256:<hex>` digest of the caller's canonical
  changed-files/diff evidence.
- `changed-files-count`: the non-negative count represented by that evidence.

When diff binding is required, missing or malformed evidence returns `NULL`
with `DIFF_BINDING_REQUIRED` and/or `INVALID_DIFF_BINDING`. When omitted,
legacy identity-only consumers keep the v1 canonical payload shape; no hidden
checkout, review, or GitHub API state is introduced.

### Review binding — caller-supplied v1

Merge Guard can also bind the proof to explicit review evidence without calling
the GitHub API or deciding which platform review is authoritative. Set
`require-review-binding: 'true'` and pass:

- `review-state`: must be `APPROVED`.
- `review-commit-sha`: must equal the checked `head-sha`.
- `review-author`: optional reviewer actor/login recorded in the proof.

When review binding is required, missing evidence returns `NULL` with
`REVIEW_BINDING_REQUIRED`. Supplied non-approval evidence returns
`REVIEW_APPROVAL_REQUIRED`; malformed commit evidence returns
`INVALID_REVIEW_BINDING`; an approval bound to any commit other than `head-sha`
returns `REVIEW_COMMIT_MISMATCH`. Omitted review evidence keeps the legacy
identity/diff payload shape and does not introduce hidden platform authority.

### Merge commit binding — caller-supplied post-merge v1

For post-merge lifecycle checks, Merge Guard can bind the proof to explicit
merge-result evidence without pushing to a registry or calling the GitHub API.
Set `require-merge-commit-binding: 'true'` and pass:

- `merge-commit-sha`: the resulting merge commit SHA.
- `merged-at`: the merge timestamp supplied by the caller/workflow.

When merge commit binding is required, missing evidence returns `NULL` with
`MERGE_COMMIT_BINDING_REQUIRED`. Malformed or incomplete supplied evidence
returns `INVALID_MERGE_COMMIT_BINDING`. Omitted merge commit evidence keeps the
legacy pre-merge identity/diff/review payload shape; this is evidence binding
only, not proof-registry persistence or merge authorization.

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

## Agent Attribution Gate — Install (5 minutes)

The **agent-attribution-gate** is the narrower, self-serve adoption wedge:
`merge-guard` checks general PR identity legitimacy for *every* PR, while the
attribution gate enforces **authorship on agent lanes only** and leaves human PRs
untouched. On an agent lane (`claude/*`, `codex/*`, `cursor/*`, `devin/*`,
`copilot/*`), a PR must be authoritatively attributed `AGENT_AUTHORED` or the check
fails closed.

1. Start with the report-only workflow in
   [`examples/continuity-agent-attribution-gate.report-only.yml`](./examples/continuity-agent-attribution-gate.report-only.yml)
   to see `VALID` / `NULL` / neutral verdicts without blocking merges.
2. After the trial verdicts match maintainer intent, copy the one-file enforcing
   workflow from [`examples/continuity-agent-attribution-gate.yml`](./examples/continuity-agent-attribution-gate.yml)
   into `.github/workflows/`.
3. In repo settings → Branches → branch protection rule for `main`, add the
   required status check named **exactly** `agent-attribution-gate` (the job id;
   not the workflow grouping label `continuity-agent-attribution-gate / agent-attribution-gate`).
4. Attribute agent PRs with any one authoritative signal: an `Agent-Authored-By:`
   commit trailer (most durable), an `agent-authored` PR label, or a PR-body
   attribution block.
5. Capture one attributed agent-lane PR that passes (`VALID`), one under-attributed
   agent-lane PR that blocks (`NULL`), the `MERGE_GUARD_PROOF` artifact/run URL,
   and the maintainer's removal-test answer.

Full step-by-step walkthrough, expected pass/blocked/neutral outcomes, lane
customization, and verification: [`ADOPT_AGENT_ATTRIBUTION_GATE.md`](./ADOPT_AGENT_ATTRIBUTION_GATE.md).

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
- `@v0.3.0` — pinned release reference for the **Agent Identity attribution surface**:
  the action emits `attribution_status`, `attribution_classification`,
  `actor_kind`, and `attribution_evidence_hash` (driven by the authoritative
  `pr-labels` / `pr-body` / `commit-trailers` signals). Use this for consumers
  that make the attribution classification load-bearing — e.g. an agent-lane
  gate that requires `AGENT_AUTHORED`. Before asking an outside maintainer to
  install, verify that the `v0.3.0` tag resolves publicly; do not substitute
  `@main` for a required check in an outside-owner proof. The attribution outputs are
  metadata, not authority: they never alter `result` or `canonical_hash`, so a
  `@v0.1.0` consumer that only reads `result` is unaffected by moving to
  `@v0.3.0`. `continuityos-sandbox` pins this tag for its
  `agent-attribution-gate` (see that repo's `ATTRIBUTION_DEPENDENCY_PROOF.md`).

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

- **Review binding** — caller-supplied approving review evidence binding is
  implemented as `require-review-binding` + `review-state` /
  `review-commit-sha` / `review-author`. Automatic platform review discovery
  remains deferred.
- **Diff binding** — caller-supplied changed-files evidence binding is
  implemented as `require-diff-binding` + `changed-files-hash` /
  `changed-files-count`. Self-computed tree/diff binding remains deferred.
- **Merge commit binding** — caller-supplied post-merge evidence binding is
  implemented as `require-merge-commit-binding` + `merge-commit-sha` /
  `merged-at`. Registry persistence and workflow-owned merge proof generation
  remain separate.
- **Automatic agent classification** — derive agent/human classification from trusted platform evidence instead of requiring callers to pass `author-kind`.
- **Policy binding** — org-level policy packs and templates.
- **Merge proof generation** — workflow-owned persistence in the spirit of
  `merge-proof.yml`.
- **Registry persistence** — append-only proof registry via PR, following
  the pattern in `governance/merge-legitimacy/merge_proof_registry.jsonl`.
