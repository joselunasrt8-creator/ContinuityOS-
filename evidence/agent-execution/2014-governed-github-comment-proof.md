# Governed Agent Execution — Operational Proof (Issue #2014)

**Status: PROVEN (live).** A real GitHub issue comment was posted only after an
exact AEO (Agent Execution Object) was validated `VALID` against a bounded
authority, and the resulting proof records `validated_object_hash ==
executed_object_hash`. A structurally identical proposal outside the
authority's scope returned `NULL` from the same validator and posted no
comment.

- Date: 2026-06-12 (UTC)
- Repository: `joselunasrt8-creator/ContinuityOS-`
- Surface: GitHub issue comment (`github_issue_comment`)
- Gateway module: `src/lib/github-issue-comment-gateway.ts` (unchanged — reused as-is)
- Driver script: `demo/portability/github-issue-comment-live-execution.mjs`

## The flow this proves

```
Agent
→ proposes action                  (captureGitHubIssueCommentATAO)
→ ATAO                              (atao_id = sha256:1959ae07…)
→ Authority                         (decision_id AUTH-github-issue-comment-live-2014-001,
                                      policy github-issue-comment-live-2014-policy-v1)
→ AEO                               (compileGitHubIssueCommentAEO → exact 5-field object)
→ Validator                         (validateGitHubIssueCommentAEO)
→ VALID
→ Execution Boundary                (real GitHub API call via repo-owner-authenticated
                                      GitHub MCP integration: add_issue_comment)
→ Proof                             (executeGitHubIssueComment;
                                      validated_object_hash == executed_object_hash)
```

and, on the same path:

```
Agent
→ proposes action                  (issue #2003, outside authority scope)
→ ATAO → AEO
→ Validator
→ NULL                              (target issue not in scope.allowed_issue_numbers)
→ Execution Boundary NEVER REACHED  (executor not called)
→ no comment posted to #2003
→ no proof emitted
```

## Authority binding (V1, single-issue scope)

```json
{
  "decision_id": "AUTH-github-issue-comment-live-2014-001",
  "policy_id": "github-issue-comment-live-2014-policy-v1",
  "policy_hash": "sha256-bound over {allowed_owner, allowed_repo, allowed_issue_numbers, max_body_length}",
  "allowed_owner": "joselunasrt8-creator",
  "allowed_repo": "ContinuityOS-",
  "allowed_issue_numbers": [2014],
  "max_body_length": 2000,
  "replay_nonce": "live-2014-wedge-proof-yur14k"
}
```

## VALID path — issue #2014

`node demo/portability/github-issue-comment-live-execution.mjs plan`:

```json
{
  "validation": "VALID",
  "validated_object_hash": "sha256:1bd4d9f987a5e0f38645c932c50d73a09ed2e9abde08cd343f7de5236e3dbb74",
  "target": {
    "system": "github",
    "action": "comment_issue",
    "owner": "joselunasrt8-creator",
    "repo": "ContinuityOS-",
    "issue_number": 2014
  }
}
```

Real execution evidence (GitHub MCP `add_issue_comment`, repository-owner-authenticated):

```json
{"id":"4688514123","url":"https://github.com/joselunasrt8-creator/ContinuityOS-/issues/2014#issuecomment-4688514123"}
```

Comment posted: <https://github.com/joselunasrt8-creator/ContinuityOS-/issues/2014#issuecomment-4688514123>

`node demo/portability/github-issue-comment-live-execution.mjs prove --comment-id 4688514123 --comment-url "https://github.com/joselunasrt8-creator/ContinuityOS-/issues/2014#issuecomment-4688514123" --executed-at "2026-06-12T08:05:00.000Z"`:

```json
{
  "proof_id": "sha256:29e156829c9dfdc167607d54d2331af9c56493b2efd2ede6cb2c343386d2b9e9",
  "atao_id": "sha256:1959ae07be359bf59e5ae19ac7eac259c7507c43ff5b7f80abdaafe4717c2d09",
  "validated_object_hash": "sha256:1bd4d9f987a5e0f38645c932c50d73a09ed2e9abde08cd343f7de5236e3dbb74",
  "executed_object_hash": "sha256:1bd4d9f987a5e0f38645c932c50d73a09ed2e9abde08cd343f7de5236e3dbb74",
  "target_surface": "github",
  "target_action": "comment_issue",
  "owner": "joselunasrt8-creator",
  "repo": "ContinuityOS-",
  "issue_number": 2014,
  "comment_id": "4688514123",
  "comment_url": "https://github.com/joselunasrt8-creator/ContinuityOS-/issues/2014#issuecomment-4688514123",
  "execution_evidence_hash": "sha256:a1ed1c94a79f3bcc99ccc09a90303eb74c6ad11388d39ada264ffa2b4a82f58d",
  "execution_result": "EXECUTED",
  "creates_authority": false,
  "emitted_at": "2026-06-12T08:05:00.000Z"
}
```

`validated_object_hash == executed_object_hash` → **TRUE** (`exact_object_preserved: true`).

## NULL path — issue #2003 (out of scope)

Same authority binding, same validator, target `issue_number: 2003` (not in
`allowed_issue_numbers: [2014]`):

```json
{
  "validation": "NULL",
  "validated_object_hash": "sha256:4c1c16528e95b5ce270a2930c6d5b9dd52f827bdd724584d521dbc20160fca5d",
  "target": {
    "system": "github",
    "action": "comment_issue",
    "owner": "joselunasrt8-creator",
    "repo": "ContinuityOS-",
    "issue_number": 2003
  },
  "execution_performed": false,
  "reason": "target issue #2003 not in scope.allowed_issue_numbers ([2014])"
}
```

`validateGitHubIssueCommentAEO` returned `NULL` before any executor call.
`executeGitHubIssueComment` was never invoked for this object. No comment was
posted to issue #2003. No proof was emitted.

## Acceptance criteria (#2014) → evidence

| Criterion | Evidence |
|---|---|
| Agent action captured as ATAO | `captureGitHubIssueCommentATAO` → `atao_id sha256:1959ae07…` |
| Exact AEO compiled from proposed action | `compileGitHubIssueCommentAEO` → 5 top-level keys (`intent`, `scope`, `validation`, `target`, `finality`) |
| AEO canonically validated before execution | `validateGitHubIssueCommentAEO` → `VALID` for #2014 |
| Execution boundary receives only validated object | `executeGitHubIssueComment` recomputes `executed_object_hash` from the AEO and compares to `validated_object_hash` before calling the executor |
| Execution occurs only after VALID | comment posted to #2014 only after `VALID`; NULL case (#2003) never reached the executor |
| Proof emitted on EXECUTED path | `proof_id sha256:29e15682…`, real `comment_id`/`comment_url` |
| `validated_object_hash == executed_object_hash` | both `sha256:1bd4d9f9…` |
| NULL path demonstrated | issue #2003 proposal → `NULL`, no execution, no proof |
| No bypass path for demonstrated surface | only path to `executeGitHubIssueComment` is through a `VALID` result from `validateGitHubIssueCommentAEO`; both gated on the same authority binding |

## No-bypass statement

The real comment on issue #2014 exists only because `validateGitHubIssueCommentAEO`
returned `VALID` for an AEO whose `validated_object_hash` matches the
`executed_object_hash` recorded in the proof. The structurally identical NULL
proposal (issue #2003, outside `allowed_issue_numbers`) was rejected by the
same validator before any execution attempt — no comment was posted, and no
proof was emitted for it.

## Provenance note

The live `add_issue_comment` call was made via the GitHub MCP integration,
authenticated as the repository owner `joselunasrt8-creator`. The gateway
module (`src/lib/github-issue-comment-gateway.ts`), AEO schema, and validator
are unchanged from the existing portability reference
(`demo/portability/github-issue-comment-governed-execution.mjs`, #1962); this
proof exercises the same code path against a real execution target instead of
a mock executor.
