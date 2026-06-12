# Operational Risk Audit Artifact — Issue #2031

## Intent

Create a bounded, repository-visible operational-risk audit artifact for issue
#2031. The artifact identifies non-architecture blockers, classifies the current
evidence boundary, and names the exact external evidence required to clear each
blocker without changing runtime execution semantics.

## Scope

This is an evidence artifact, not a governance-policy artifact. It deliberately
lives under `evidence/` so it does not widen, replace, or mutate any
`governance/` authority surface.

In scope:

- Cloudflare Git Integration preview-deploy path.
- Cloudflare deployment sovereignty evidence.
- GitHub permissions and branch-protection enforcement evidence.
- Deploy-capable token and secret authority evidence.
- Proof persistence evidence.
- Stale branch and stale workflow lineage evidence.
- Retry/replay and stop-condition evidence.

Out of scope:

- Closing #2013.
- Closing #2001.
- Changing Cloudflare account settings.
- Changing GitHub repository, branch-protection, environment, or secret settings.
- Changing runtime enforcement, worker routes, schemas, migrations, or workflow
  execution behavior.

## Affected files

This audit adds only this evidence artifact:

- `evidence/operational-risk/OPERATIONAL_RISK_AUDIT_2031.md`

Referenced governance and runtime surfaces are read-only for this audit.

## Preserved invariants

- `validated_object == executed_object` remains unchanged.
- The canonical runtime flow remains `/session → /continuity → /authority →
  /compile → /validate → /execute → /proof`.
- No deploy path, workflow trigger, token scope, runtime route, D1 mutation
  rule, or proof persistence path is changed by this artifact.
- External authority evidence is classified as evidence-needed unless it is
  backed by a repository artifact or an operator-provided observation.
- Repository policy declarations are not treated as proof of external settings
  unless an external settings export, API response, screenshot hash, or audit-log
  artifact is recorded.

## Mutation-capable surfaces considered

| Surface | Existing repository classification | Current #2031 audit state | Exact evidence required to clear |
|---|---|---|---|
| Cloudflare Git Integration automatic deploy | `RB-001` is production-capable, not governed by MindShift, and previously required account-level disable evidence. | **Downgrade candidate only.** Operator-provided observation says Worker `mindshift-demo` Settings → Build → Git repository shows `Connect`, so no GitHub repository appears connected for automatic builds/deployments. This supports the narrower statement that the GitHub PR → Cloudflare Git Integration automatic preview deployment path appears inactive for this Worker. | Add `governance/runtime/evidence/RB-001_<date>.json` with verifier, date, dashboard source, screenshot/export hash, and a PR preview-deploy test outcome. The evidence should explicitly cover whether Cloudflare bot comments or automatic deployments occur for a test PR. |
| Cloudflare account/dashboard deploy authority | Root Cloudflare account authority remains outside repository control. | **Partial / still open.** A disconnected Git Integration does not prove dashboard deploy capability, account audit settings, or token exclusivity. | Cloudflare account audit-log export for Worker deploy events, list of deploy-capable users/roles, confirmation of dashboard deploy restrictions or break-glass policy, and evidence that all production deploy events are externally observable. |
| Direct `wrangler deploy` / Cloudflare deploy token | Deploy-capable Cloudflare token or local Wrangler auth is portable execution authority and remains open unless scoped externally. | **Open.** Repository artifacts cannot prove token scope, exclusivity, or absence of operator-local credentials. | Cloudflare API token scope export with values redacted, last-used metadata, evidence of OIDC-only or otherwise non-portable deployment authority, GitHub environment/secret scope export, and explicit statement whether any operator-local Wrangler session can deploy `mindshift-demo`. |
| GitHub permissions and branch protection | Branch-protection policy exists and activation is recorded, but verification remains required. | **Partial.** Policy intent and activation record exist; external GitHub settings evidence is still required for closure-grade confidence. | GitHub branch protection or ruleset API response for `main`, required checks list, required-review count, stale review dismissal setting, force-push restriction, admin bypass/bypass-list settings, and repository audit-log evidence for direct-push/override attempts. |
| GitHub Environment approval for governed deploy | `governed-deploy.yml` declares `environment: production`; required reviewers must be configured externally. | **Partial.** The workflow is environment-bound, but repository code cannot prove the `production` environment has required reviewers. | GitHub Environments API/settings export for `production` showing required reviewers, wait timer if any, branch/tag deployment policy, secret availability boundaries, and recent deployment approval/audit-log record. |
| Proof persistence | Proof generation and registry persistence are separate; direct main persistence is classified as NULL/non-retryable in the branch-protection policy. | **Partial.** Repository policy defines the expected PR-mediated proof persistence path, but operational evidence of token scope and branch-protection enforcement is still required. | Merge-proof run artifact showing proof branch creation, registry PR creation, deduplication behavior, branch-protection admission through required checks, and `MERGE_PROOF_PR_TOKEN` scope proving no direct-main mutation authority. |
| Stale branches and stale workflow lineage | Branch/ref binding and stale-review dismissal are required for merge/deploy legitimacy. | **Open until externally inventoried.** Repository workflows bind runtime inputs to current refs, but stale branch inventory and settings are external. | Branch inventory with last commit dates for protected and deployment-capable branches, evidence that stale branches cannot deploy to production, stale review dismissal setting, and closure/reconciliation decision for branches with obsolete governance workflows. |
| Retry/replay | Governed deploy uses explicit dispatch inputs, `cancel-in-progress: false`, and replay/lineage identifiers including run id, run attempt, SHA, ref, decision id, validated object hash, and invocation nonce. | **Partial.** The workflow includes replay-bounding fields, but operational replay behavior must be evidenced from run artifacts and failed retries. | Workflow run logs for initial run and rerun attempts showing replay IDs, proof/validation responses, failed duplicate/replayed invocation behavior, artifact retention, and stop-condition handling for non-canonical responses. |
| Stop conditions / NULL boundaries | Workflow shell gates exit on missing inputs/secrets, wrong trigger, workflow-binding mismatch, endpoint error, and non-canonical responses. | **Partial.** Static workflow inspection shows fail-closed conditions, but operational evidence should prove they fire in GitHub-hosted execution. | Redacted workflow logs or run summaries for negative cases: missing secret, mismatched workflow ref, invalid object hash, stale decision, duplicate nonce, and endpoint non-2xx response. |

## Current Cloudflare Git Integration evidence comment

Operational-risk evidence update:

- Worker: `mindshift-demo`.
- Cloudflare dashboard path checked: Worker settings → Build → Git repository.
- Observed state supplied by operator: Git repository shows `Connect`.
- Interpretation: no GitHub repository is currently connected to this Worker for
  automatic builds/deployments, so the specific risk path `GitHub PR →
  Cloudflare Git Integration automatic preview deployment → runtime deployment
  outside governed-deploy` appears inactive for this Worker.
- Boundary: this does **not** prove full Cloudflare account sovereignty.
  Remaining external authority risks may still include dashboard deploy
  capability, token scope/exclusivity, operator-local deploy tokens, environment
  secret exclusivity, and Cloudflare account-level audit settings.
- Classification: Cloudflare Git Integration PR preview path is a downgrade
  candidate / currently not configured; full Cloudflare deployment sovereignty
  remains **PARTIAL** unless account-level token/dashboard evidence is captured.

## Replay implications

This artifact is evidence-only and replay-neutral. It does not create a new
runtime input, deploy command, workflow trigger, registry write path, or token
consumer. Replay risk remains bounded by existing deploy workflow lineage fields
and by the requirement to collect external logs for rerun/retry evidence before
claiming closure-grade operational confidence.

## Proof requirements for #2031 closure-grade reconciliation

A closure-grade #2031 evidence bundle should contain, at minimum:

1. `RB-001_<date>.json` for Cloudflare Git Integration, with dashboard/export
   hash and PR preview-deploy test result.
2. `RB-002_<date>.json` for Cloudflare deploy token scope/exclusivity, including
   redacted token-scope export and local-Wrangler authority statement.
3. GitHub branch protection or ruleset API export for `main`.
4. GitHub `production` Environment settings export proving approval and secret
   boundaries.
5. Merge-proof persistence run evidence proving proof registry persistence occurs
   through a branch/PR path, not a direct-main push.
6. Branch inventory and stale-branch reconciliation record.
7. Replay/rerun evidence for governed deploy and merge-proof stop conditions.
8. Audit-log excerpts or exports for Cloudflare deploys and GitHub direct-push /
   bypass attempts, with sensitive values redacted.

## Validation requirements

For this audit artifact itself:

- Markdown must remain documentation-only.
- The artifact must remain under `evidence/`, not `governance/`, so it records
  evidence without mutating governance policy surfaces.
- No workflow, runtime, migration, schema, or executable source should change.
- Repository status should show only this evidence artifact path changing before
  commit.
- A grep/readback check should confirm #2013 and #2001 are named only as
  out-of-scope / keep-open boundaries, not as closure claims.

## Unresolved ambiguity

- Whether Cloudflare account-level dashboard deploys are restricted or only
  audit-observable.
- Whether every deploy-capable Cloudflare credential is scoped exclusively to the
  governed GitHub path.
- Whether GitHub branch protection/rulesets exactly match repository policy
  artifacts in live settings.
- Whether `production` Environment reviewers and secret availability constraints
  are active in live GitHub settings.
- Whether stale branches with older workflow definitions can reach any
  production-capable deploy path.
- Whether negative replay/retry and stop-condition cases have been exercised in
  live GitHub Actions and recorded as artifacts.

## Closure posture

- #2031: this artifact provides the bounded operational-risk audit map and exact
  evidence list; closure should still be reconciled against the external
  evidence bundle above before asserting full operational sovereignty.
- #2013: keep open; dependency proof is outside this audit.
- #2001: keep open; agent-authored protected-branch dependency proof is outside
  this audit.
