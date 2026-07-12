# Adopt the Agent Attribution Gate (5 minutes)

A self-serve install for the ContinuityOS **agent-attribution-gate**: a single
required status check that makes AI-generated pull requests declare their
authorship before they can merge — while leaving ordinary human PRs untouched.

## What it does

On an **agent lane** (a PR whose head branch is `claude/*`, `codex/*`, `cursor/*`,
`devin/*`, or `copilot/*`), the PR must be **authoritatively attributed
`AGENT_AUTHORED`** or this check fails closed and blocks the merge. On any other
branch the check passes neutrally, so human PRs are never blocked for missing
attribution.

The enforcement lives in *your* workflow. The published action
[`stategate@v1`](./README.md) stays non-blocking and only *emits*
the attribution classification from authoritative signals (commit trailer, PR
label, or PR-body block). Your workflow chooses to depend on that signal — that
dependency is the point.

> Not the same as `merge-guard`. `merge-guard` is a general PR-identity legitimacy
> check for **every** PR. `agent-attribution-gate` is narrower: it enforces
> **authorship on agent lanes only**. Adopt either or both.

## Recommended path: trial first, then require

Making a check required on a protected branch is a trust decision. You don't have
to make it on faith. Adopt in two stages:

- **Stage 0 — Trial (non-blocking, zero merge risk).** Install the report-only
  variant. It computes exactly what the enforcing gate *would* do and writes
  `VALID` / `NULL` / neutral to each PR's job summary — but it **always passes**,
  so it can never block a merge and does **not** need to be a required check.
  Watch it classify your own real agent-lane PRs for a few days.
- **Stage 1 — Require.** Once the verdicts look right on your real PRs, upgrade to
  the enforcing gate and make it a required status check. Now an agent-lane PR
  cannot merge unless it is attributed `AGENT_AUTHORED`.

Stage 0 is one file and one upgrade line away from Stage 1 — see
[Stage 0 below](#stage-0--trial-non-blocking-zero-merge-risk). If you already
trust the behavior, skip to Step 1.

## Stage 0 — Trial (non-blocking, zero merge risk)

Copy [`examples/continuity-agent-attribution-gate.report-only.yml`](./examples/continuity-agent-attribution-gate.report-only.yml)
into your repository at `.github/workflows/continuity-agent-attribution-gate.report-only.yml`.
It uses the same `stategate@v1` signal as the enforcing gate, but
its final step only *reports* the verdict and always exits 0. Open or re-push a
`claude/*` PR and read the **report-only (trial)** block in the check's job
summary: it tells you whether the enforcing gate would have passed or blocked,
without touching your merge button.

When the trial verdicts match your intent, **upgrade**: the report-only file's
last step carries an `UPGRADE:` note — replace that one step with the enforcing
step from [`examples/continuity-agent-attribution-gate.yml`](./examples/continuity-agent-attribution-gate.yml)
(reproduced as Step 1 below), rename the job to `agent-attribution-gate`, then do
Step 2. That upgrade — choosing to make it load-bearing *after* watching it work —
is the dependency.

## Step 1 — Add the workflow

Copy [`examples/continuity-agent-attribution-gate.yml`](./examples/continuity-agent-attribution-gate.yml)
into your repository at `.github/workflows/continuity-agent-attribution-gate.yml`.
The full file is inlined here so this guide is self-contained:

```yaml
name: continuity-agent-attribution-gate

on:
  pull_request:
    # labeled/unlabeled/edited re-run the gate when a maintainer adds the
    # `agent-authored` label or edits the PR-body attribution block to fix a
    # blocked PR — otherwise that fix would not be re-evaluated until an
    # unrelated push.
    types: [opened, synchronize, reopened, labeled, unlabeled, edited]
    branches:
      - main

permissions:
  contents: read

jobs:
  agent-attribution-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Harvest commit trailers
        id: trailers
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          set -euo pipefail
          git fetch --no-tags --depth=1 origin "$BASE_SHA" 2>/dev/null || true
          TRAILERS="$(git log "${BASE_SHA}..${HEAD_SHA}" --no-merges \
            --pretty=format:'%(trailers:only=true,unfold=true)' 2>/dev/null \
            | grep -iE '^(Agent-Authored-By|Agent-Assisted-By)[[:space:]]*:' | sort -u || true)"
          {
            echo "value<<TRAILERS_EOF"
            echo "$TRAILERS"
            echo "TRAILERS_EOF"
          } >> "$GITHUB_OUTPUT"

      - uses: joselunasrt8-creator/stategate@v1
        id: merge-guard
        continue-on-error: true
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
          pr-author: ${{ github.event.pull_request.user.login }}
          head-ref: ${{ github.event.pull_request.head.ref }}
          pr-body: ${{ github.event.pull_request.body }}
          pr-labels: ${{ join(github.event.pull_request.labels.*.name, ',') }}
          commit-trailers: ${{ steps.trailers.outputs.value }}

      - name: Enforce AGENT_AUTHORED on the agent lane
        env:
          HEAD_REF: ${{ github.event.pull_request.head.ref }}
          CLASSIFICATION: ${{ steps.merge-guard.outputs.attribution_classification }}
          STATUS: ${{ steps.merge-guard.outputs.attribution_status }}
        run: |
          set -euo pipefail
          case "$HEAD_REF" in
            claude/*|codex/*|cursor/*|devin/*|copilot/*) AGENT_LANE=true ;;
            *) AGENT_LANE=false ;;
          esac
          if [ "$AGENT_LANE" != "true" ]; then
            echo "Non-agent lane - attribution gate passes neutrally."
            exit 0
          fi
          if [ "$CLASSIFICATION" = "AGENT_AUTHORED" ]; then
            echo "VALID - agent-lane PR is authoritatively attributed AGENT_AUTHORED."
            exit 0
          fi
          {
            echo "NULL - agent-lane PR is not attributed AGENT_AUTHORED (got: ${CLASSIFICATION:-<none>})."
            echo "Add an 'Agent-Authored-By:' commit trailer, an 'agent-authored' PR label, or a PR-body attribution block."
          } >&2
          exit 1
```

## Step 1a — One-file copy/paste checklist

Before asking an outside maintainer to install, keep the copy/paste surface to one
file and verify these five lines survived unchanged:

- `uses: joselunasrt8-creator/stategate@v1`
- `permissions: contents: read`
- `jobs.agent-attribution-gate` as the job id for the enforcing workflow
- the agent-lane `case` prefixes match the maintainer's agent branches
- the final enforcing step exits `1` when an agent-lane PR is not `AGENT_AUTHORED`

Do **not** ask the maintainer to make the check required during the trial. The
report-only workflow's job id is `agent-attribution-gate-report-only`; making
`agent-attribution-gate` required before installing the enforcing workflow leaves
GitHub waiting for a check that never appears.

## Step 2 — Make it required

In **Settings → Branches → branch protection rule for `main`**:

1. Enable **Require status checks to pass before merging**.
2. Add the required status check named **exactly** `agent-attribution-gate`.

That name is the **job id**, which is the exact check-run name GitHub reports. The
workflow file name shows as grouping context in the UI but is not part of the
required-check name — select `agent-attribution-gate`, not
`continuity-agent-attribution-gate / agent-attribution-gate`.

Once required, the gate becomes part of the operational definition of "mergeable"
for that branch: an agent-lane PR cannot merge unless it is attributed
`AGENT_AUTHORED`.

## Step 3 — Attribute agent PRs

`AGENT_AUTHORED` requires **at least one authoritative signal** and no conflicting
authoritative signal. Any one of these is sufficient, listed most-durable first:

1. **Commit trailer (recommended, most durable).** Add to the agent's commits —
   it travels with the change and is harvested automatically by the workflow:

   ```
   Agent-Authored-By: <agent-id>
   ```

   (`Agent-Assisted-By:` classifies as `AGENT_ASSISTED`, which does **not** satisfy
   the gate. `Co-Authored-By:` is deliberately **not** an agent signal — humans use
   it routinely.)

2. **PR label.** Add the `agent-authored` label to the PR.

3. **PR-body attribution block.** Include a fenced attribution block in the PR
   description.

Conflicting authoritative signals (e.g. a trailer and a label that disagree) fail
closed to `UNKNOWN` — by design.

## Expected outcomes

| PR head branch | Authoritative agent signal? | Classification | Gate result |
|---|---|---|---|
| `claude/*` (agent lane) | yes (`Agent-Authored-By:` / label / body) | `AGENT_AUTHORED` | ✅ pass |
| `claude/*` (agent lane) | none | `UNKNOWN` | ❌ blocked |
| `claude/*` (agent lane) | conflicting signals | `UNKNOWN` | ❌ blocked |
| `feature/*` (human lane) | — | any | ✅ neutral pass |

## Customize the agent lane

Edit the `case` line to match the branch prefixes your agents use:

```bash
case "$HEAD_REF" in
  claude/*|codex/*|cursor/*|devin/*|copilot/*|bot/*) AGENT_LANE=true ;;
  *) AGENT_LANE=false ;;
esac
```

## Version pinning

The snippet pins `@v1`. Pin a release tag so a changed result can only come
from a changed PR, never from a changed validator implementation. The attribution
outputs are metadata, not authority: they never alter `result` or `canonical_hash`,
so a consumer that previously read only `result` is unaffected by moving to
`@v1`. Do **not** leave `@main` as a permanent load-bearing reference. See the
[Version reference](./README.md#version-reference) in the action README.

## Break-glass

If the gate is ever wrong or unavailable in an emergency, a repository admin can
temporarily merge via GitHub's existing branch-protection override. Treat this as a
governed, logged exception rather than a silent bypass — for a documented pattern
see `continuityos-sandbox`'s `BREAK_GLASS.md`.

## Verify it works

1. Open a PR from a `claude/*` branch **without** any agent signal → the
   `agent-attribution-gate` check fails and the PR is blocked.
2. Add an `Agent-Authored-By:` trailer to a commit (or the `agent-authored` label)
   and push → the check re-runs and passes; the PR becomes mergeable.
3. Open a PR from a normal `feature/*` branch → the check passes neutrally.

That pass / blocked / neutral triple is the proof that the gate is load-bearing in
your repo.

## Outside-owner proof capture

For the first independent maintainer, capture only the dependency loop evidence:

| Evidence | What to capture |
|---|---|
| Maintainer fit | Active outside-owned repo, real AI/agent PR flow, review/merge discipline, and branch-protection access. |
| Trial signal | Report-only workflow run URL showing at least one real agent-lane `VALID` or `NULL` would-be verdict. |
| Required check | Branch-protection evidence showing the exact required check `agent-attribution-gate`. |
| First VALID | PR URL and workflow run URL where an attributed agent-lane PR passes and is mergeable. |
| First NULL | PR URL and workflow run URL where an under-attributed agent-lane PR is blocked by the required check. |
| Proof artifact | `MERGE_GUARD_PROOF` artifact or job-summary proof from each run. |
| Removal test | Maintainer answer to: “If this check were removed, would your agent-authorship workflow become worse? How?” |

Stop there. Do not add new policy, ontology, or review requirements to the first
outside-owner proof; the dependency claim is only that removing this required
agent-authorship check makes the maintainer's workflow worse.
