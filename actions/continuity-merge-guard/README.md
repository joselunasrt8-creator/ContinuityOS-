# ContinuityOS StateGate

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
validated_object == stategate_object
```

That is the entire claim. v1 does **not** validate:

- the PR diff or changed files
- review status or approvals
- automatic detection of whether the author is a human or an agent; callers must provide `author-kind` explicitly
- the final merge commit

Those are deliberately deferred — see [v2](#v2-not-yet-built) below. v1 is
a legitimacy check on object identity, not a review system, agent
classifier, or policy engine.


## Compatibility

StateGate intentionally preserves several machine-readable legacy `MERGE_GUARD_*` identifiers for replay safety, proof compatibility, and existing integrations. This includes the `MERGE_GUARD_PROOF` artifact name and filename, `MERGE_GUARD-*` proof IDs, the `MERGE_GUARD_PROOF` record type, `MERGE_GUARD_*` environment variables, conformance sentinels, and existing required-check names such as `merge-guard` / `agent-merge-guard`. These identifiers are compatibility surfaces, not public branding, and are intentionally preserved until a future versioned migration sequences replacement identifiers and downstream branch-protection changes.

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

The proof is written to the job's step summary and uploaded as a workflow
artifact named `MERGE_GUARD_PROOF`, so it is visible directly on the PR
check run — the proof is the product.

### Agent Identity (Phase 1)

StateGate also records a descriptive **actor attribution** object, derived
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

For outside-owner adoption evidence, use the [External Dependency Proof Checklist](EXTERNAL_DEPENDENCY_PROOF_CHECKLIST.md).

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
      - uses: joselunasrt8-creator/stategate@v1
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
ContinuityOS StateGate: VALID or NULL
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
ContinuityOS StateGate: VALID or NULL
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
      - uses: joselunasrt8-creator/stategate@v1
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

- `@v1` — current public StateGate release reference for installation examples.
  Use this pinned tag for load-bearing consumers so a changed result can only
  come from a changed PR object or an explicit future version migration, never
  from an unpinned validator implementation.
- Legacy `@v0.x` tags belonged to the pre-StateGate public identity. Those tags
  remain historical compatibility evidence for existing consumers, but current
  installation documentation should use `joselunasrt8-creator/stategate@v1`.

### Known external consumers

- [`joselunasrt8-creator/continuityos-sandbox`](https://github.com/joselunasrt8-creator/continuityos-sandbox) —
  historically pinned the predecessor action at `@v0.1.0`; `merge-guard` is a
  **required** status check on `main` (`LOAD-BEARING_ACTIVE`). See that repo's
  `LOAD_BEARING_READINESS.md`, `NULL_ENFORCEMENT_PROOF.md`, and
  `EXTERNAL_DEPENDENCY_PROOF.md` for the historical install path,
  required-check configuration, and proof that real PRs' merge eligibility
  depends on the StateGate-compatible result.

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
