# External Dependency Proof Checklist

## 1. Purpose

Use this checklist with one outside-owner maintainer to prove whether the
ContinuityOS **agent-attribution-gate** has become an external workflow
dependency, not just a pilot run.

Pilot evidence means the check ran. Dependency proof means removing the required
check makes the maintainer's agent-authorship workflow worse.

## 2. Maintainer fit

Choose one qualified outside maintainer before optimizing anything else:

- active outside-owned repository
- uses AI/agent-generated pull requests or agent-session branches
- already has review/merge discipline for protected branches
- has access to change branch protection and required status checks

If those are not true, stop. The first proof depends on a real maintainer with a
real agent-authorship problem, not on broader architecture.

## 3. Install path

### Stage 0 — Report-only trial first

Ask the maintainer to copy exactly one file first:

```text
actions/continuity-merge-guard/examples/continuity-agent-attribution-gate.report-only.yml
→ .github/workflows/continuity-agent-attribution-gate.report-only.yml
```

This trial uses
`joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard@v0.3.0`,
reports `VALID` / `NULL` / neutral in the job summary, and always exits 0. Do not
make it required.

### Stage 1 — Enforcing one-file workflow

After the trial verdicts match maintainer intent, ask the maintainer to copy the
enforcing workflow:

```text
actions/continuity-merge-guard/examples/continuity-agent-attribution-gate.yml
→ .github/workflows/continuity-agent-attribution-gate.yml
```

The enforcing workflow must keep these install-critical lines:

- action reference:
  `joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard@v0.3.0`
- job id: `agent-attribution-gate`
- permission: `contents: read`
- agent-lane branch prefixes matching the maintainer's AI PR branches

Do not use `@main` for outside-owner dependency proof. Before outreach, verify
that the `v0.3.0` tag resolves publicly; if it does not, fix the release/tag
before asking an outside maintainer to install.

## 4. Required check configuration

Only after Stage 1 is installed, configure branch protection on the target branch
and add the required status check named exactly:

```text
agent-attribution-gate
```

That is the job id and the check-run name GitHub reports. Do not require the
workflow grouping label:

```text
continuity-agent-attribution-gate / agent-attribution-gate
```

Capture screenshot or text/API proof that `agent-attribution-gate` is required
before running the evidence loop.

## 5. Evidence loop

### PR A — VALID / mergeable

1. Open or update an agent-lane PR, such as `claude/*` or `codex/*`.
2. Add one authoritative `AGENT_AUTHORED` signal:
   - `Agent-Authored-By: <agent-id>` commit trailer, or
   - `agent-authored` PR label, or
   - PR-body attribution block.
3. Confirm the required `agent-attribution-gate` check passes.
4. Confirm the PR is mergeable while the required check is enabled.
5. Capture the workflow run URL and the `MERGE_GUARD_PROOF` artifact/job summary.

### PR B — NULL / blocked

1. Open or update an agent-lane PR without any authoritative `AGENT_AUTHORED`
   signal, or with conflicting authoritative signals.
2. Confirm the required `agent-attribution-gate` check fails.
3. Confirm GitHub blocks merge while `agent-attribution-gate` is required.
4. Capture the workflow run URL and the `MERGE_GUARD_PROOF` artifact/job summary.
5. Optional repair proof: add the missing attribution and show the same PR moves
   from blocked `NULL` to passing `VALID`.

## 6. Required evidence packet

Collect only these artifacts from the outside-owner repository:

- outside repo URL and maintainer contact/role
- report-only trial run URL
- enforcing workflow URL or commit URL
- branch-protection evidence showing exact required check `agent-attribution-gate`
- PR A URL: attributed agent-lane PR, `VALID`, mergeable
- PR B URL: under-attributed or conflicting agent-lane PR, `NULL`, blocked
- `MERGE_GUARD_PROOF` artifact/job-summary evidence for PR A and PR B
- maintainer removal-test answer

## 7. Removal test

Ask exactly:

> If this check were removed, would your agent-authorship workflow become worse?
> How?

A dependency-forming answer identifies a concrete degradation, such as agent PRs
being able to merge without declared authorship, maintainers returning to manual
AI-authorship policing, or branch protection no longer encoding the repository's
agent contribution rule.

## 8. Success criteria

The external dependency proof succeeds only when all of the following are true:

- the repository is owned or maintained outside ContinuityOS
- the maintainer first saw a report-only verdict before accepting enforcement
- the existing action is installed at `@v0.3.0` without runtime changes
- the protected branch requires the check named exactly `agent-attribution-gate`
- one attributed agent-lane PR passes and is mergeable (`VALID`)
- one under-attributed/conflicting agent-lane PR is blocked (`NULL`)
- both outcomes provide proof artifacts or job-summary proof
- the maintainer answers the removal-test question

## 9. Non-goals

This checklist does not create new authority, expand canon, change action
behavior, change validator logic, change proof artifact shape, claim diff
validation, claim review validation, claim final merge commit validation, or add
new governance layers. It only proves whether the current issue-comment / PR
attribution wedge becomes worse to remove for one outside maintainer.
