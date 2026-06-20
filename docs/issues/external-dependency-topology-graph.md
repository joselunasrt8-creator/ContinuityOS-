# Issue draft: External Dependency Topology Graph

## Summary

Make external dependency formation observable as topology instead of anecdotal evidence.

ContinuityOS can already demonstrate runtime enforcement through required checks, documented architecture proof, demonstration proof, and cross-repo dependency signals. This planning issue proposes a read-only dependency topology graph that makes dependency formation signals inspectable without adding a new execution path, authority source, or dependency-proof claim.

## Core thesis

GitHub required checks demonstrate enforcement.

A topology graph can demonstrate dependency formation signals.

## Problem

ContinuityOS can show architecture proof, demonstration proof, and cross-repo dependency signals, but independent dependency formation still needs observable topology.

Current evidence can answer whether a particular required check enforced a merge boundary, whether a proof artifact was produced by that check, and whether a documented external repository depends on the action. It does not yet provide a normalized topology view across users, repositories, workflows, repeated installs, retention events, removals, and degraded workflows.

The gap is observational rather than executable: dependency formation needs a queryable map of signals before it can be compared across external repositories without turning anecdotal adoption notes into authority.

## Proposed graph model

This model is a planning schema only. It documents a future observational graph shape and does not implement Neo4j, add a graph store, or introduce any runtime dependency.

### Nodes

| Node | Meaning | Suggested stable identity fields |
| --- | --- | --- |
| `User` | External installer, maintainer, operator, or organization actor observed through install/retention signals. | `user_id`, `provider`, `handle_hash`, `observed_at` |
| `Repository` | External repository where ContinuityOS is installed, required, removed, or evaluated. | `repository_id`, `provider`, `owner_hash`, `repo_hash`, `default_branch` |
| `Workflow` | CI/CD workflow or automation surface that invokes ContinuityOS. | `workflow_id`, `repository_id`, `workflow_path`, `workflow_name` |
| `Install` | Observed installation or configured use of ContinuityOS in a workflow. | `install_id`, `repository_id`, `workflow_id`, `version_ref`, `installed_at` |
| `RequiredCheck` | Branch protection or merge requirement that names a ContinuityOS check. | `required_check_id`, `repository_id`, `check_name`, `branch_pattern` |
| `PullRequest` | Pull request that triggered a ContinuityOS check. | `pull_request_id`, `repository_id`, `number`, `head_sha`, `opened_at` |
| `ValidationResult` | Observed VALID/NULL result emitted by a ContinuityOS check. | `validation_result_id`, `check_run_id`, `result`, `completed_at` |
| `ProofArtifact` | Evidence artifact produced by a validation result when valid. | `proof_artifact_id`, `artifact_name`, `artifact_digest`, `created_at` |
| `RetentionEvent` | Explicit or inferred signal that an operator kept/reused the dependency. | `retention_event_id`, `repository_id`, `signal_type`, `observed_at` |
| `RemovalEvent` | Observed removal or disabled required-check configuration. | `removal_event_id`, `repository_id`, `workflow_id`, `removed_at` |

### Relationships

| Relationship | Source -> Target | Meaning |
| --- | --- | --- |
| `USER_INSTALLED` | `User -> Install` | A user or organization installed/configured ContinuityOS in a repository workflow. |
| `REPO_REQUIRES_CHECK` | `Repository -> RequiredCheck` | A repository requires a ContinuityOS check for merge eligibility. |
| `PR_TRIGGERED_CHECK` | `PullRequest -> RequiredCheck` | A pull request caused the required check to run. |
| `CHECK_PRODUCED_RESULT` | `RequiredCheck -> ValidationResult` | A required check produced an observed validation outcome. |
| `RESULT_GENERATED_PROOF` | `ValidationResult -> ProofArtifact` | A valid result generated an evidence artifact. |
| `USER_RETURNED` | `User -> RetentionEvent` | A user/operator returned, reused, retained, or reaffirmed the dependency. |
| `WORKFLOW_DEPENDS_ON` | `Workflow -> Install` | A workflow depends on the installed ContinuityOS action/configuration. |
| `REMOVAL_DEGRADED_WORKFLOW` | `RemovalEvent -> Workflow` | Removing the dependency degraded a merge-safety or proof-producing workflow. |

## Boundary

Neo4j or any graph store must not sit in the critical execution path yet.

Runtime enforcement remains deterministic and fail-closed.

The graph layer is observational/topology/proof intelligence only.

### Non-goals

- Do not implement Neo4j.
- Do not add a graph database, client library, hosted service, queue, or dependency.
- Do not mutate runtime code.
- Do not introduce a new authority source.
- Do not make graph traversal part of validation, execution, merge enforcement, proof creation, or replay control.
- Do not claim independent dependency proof exists.
- Do not treat retention, reuse, or removal observations as legitimacy by themselves.

## Example topology

```text
(User: external-maintainer)
  -[:USER_INSTALLED]-> (Install: continuity-merge-guard@v0.1.0)

(Repository: external-consumer-repo)
  -[:REPO_REQUIRES_CHECK]-> (RequiredCheck: merge-guard)

(Workflow: .github/workflows/continuity-merge-guard.yml)
  -[:WORKFLOW_DEPENDS_ON]-> (Install: continuity-merge-guard@v0.1.0)

(PullRequest: #18)
  -[:PR_TRIGGERED_CHECK]-> (RequiredCheck: merge-guard)

(RequiredCheck: merge-guard)
  -[:CHECK_PRODUCED_RESULT]-> (ValidationResult: VALID)

(ValidationResult: VALID)
  -[:RESULT_GENERATED_PROOF]-> (ProofArtifact: MERGE_GUARD_PROOF)

(User: external-maintainer)
  -[:USER_RETURNED]-> (RetentionEvent: retained-after-use)

(RemovalEvent: merge-guard-disabled)
  -[:REMOVAL_DEGRADED_WORKFLOW]-> (Workflow: .github/workflows/continuity-merge-guard.yml)
```

Interpretation: the topology can show observed dependency formation signals such as installation, required-check enforcement, repeated use, proof artifact generation, retention, and removal degradation. It does not prove independent dependency formation by itself.

## Retention signals to identify

- Same user or organization keeps the ContinuityOS workflow after initial installation.
- Same repository triggers the required check across multiple pull requests.
- Operator documents a keep/retain decision after evaluating friction and value.
- Workflow version is updated rather than removed.
- Required-check configuration remains enabled after NULL/VALID paths are exercised.
- Users return to inspect proof artifacts, check results, or enforcement reports.

## Dependency signals to identify

- Repository has an installed ContinuityOS workflow/action reference.
- Branch protection requires the ContinuityOS check.
- Pull requests trigger the required check before merge.
- VALID results generate proof artifacts.
- NULL results block merge through the required check.
- Removal or disabling of ContinuityOS removes merge-safety, proof artifact generation, or agent-attribution enforcement.
- Multiple external repositories independently exhibit install, required-check, use, and retention signals.

## Highest-leverage query

> Who installed ContinuityOS, used it more than once, and would lose merge safety if removed?

### Read-only query sketch

```cypher
MATCH (u:User)-[:USER_INSTALLED]->(i:Install)<-[:WORKFLOW_DEPENDS_ON]-(w:Workflow)
MATCH (repo:Repository)-[:REPO_REQUIRES_CHECK]->(check:RequiredCheck)
MATCH (pr:PullRequest)-[:PR_TRIGGERED_CHECK]->(check)-[:CHECK_PRODUCED_RESULT]->(result:ValidationResult)
MATCH (removal:RemovalEvent)-[:REMOVAL_DEGRADED_WORKFLOW]->(w)
WHERE repo.repository_id = i.repository_id
WITH u, repo, w, collect(DISTINCT pr.pull_request_id) AS observed_prs, collect(DISTINCT result.result) AS results
WHERE size(observed_prs) > 1
RETURN u.user_id, repo.repository_id, w.workflow_id, observed_prs, results
```

This query is intentionally read-only. Its output would identify dependency formation signals for review; it would not authorize execution, validate an object, or prove independent dependency formation.

### Additional query examples

#### Repositories with required checks but no proof artifacts observed

```cypher
MATCH (repo:Repository)-[:REPO_REQUIRES_CHECK]->(check:RequiredCheck)
MATCH (check)-[:CHECK_PRODUCED_RESULT]->(result:ValidationResult)
WHERE NOT (result)-[:RESULT_GENERATED_PROOF]->(:ProofArtifact)
RETURN repo.repository_id, check.check_name, collect(result.result) AS results
```

#### Retained installs with repeated pull-request usage

```cypher
MATCH (u:User)-[:USER_INSTALLED]->(i:Install)<-[:WORKFLOW_DEPENDS_ON]-(w:Workflow)
MATCH (u)-[:USER_RETURNED]->(retention:RetentionEvent)
MATCH (pr:PullRequest)-[:PR_TRIGGERED_CHECK]->(:RequiredCheck)<-[:REPO_REQUIRES_CHECK]-(repo:Repository)
WHERE repo.repository_id = i.repository_id
WITH u, repo, w, retention, count(DISTINCT pr.pull_request_id) AS pr_count
WHERE pr_count > 1
RETURN u.user_id, repo.repository_id, w.workflow_id, retention.signal_type, pr_count
```

#### Workflows where removal degraded merge safety

```cypher
MATCH (removal:RemovalEvent)-[:REMOVAL_DEGRADED_WORKFLOW]->(w:Workflow)-[:WORKFLOW_DEPENDS_ON]->(i:Install)
RETURN removal.removal_event_id, w.workflow_id, i.version_ref, removal.removed_at
```

## Acceptance criteria

- [ ] Schema documented.
- [ ] Example topology documented.
- [ ] Retention signals identified.
- [ ] Dependency signals identified.
- [ ] Query examples included.
- [ ] No runtime enforcement changes.
- [ ] No new authority source.
- [ ] No claim of independent dependency proof.

## Planning notes

### Preserved invariants

- Runtime enforcement remains deterministic and fail-closed.
- `validated_object == executed_object` discipline is untouched.
- Proof artifacts remain produced by existing enforcement paths, not by topology inspection.
- Graph observations are non-authoritative and replay-neutral.
- Removal/degradation observations are dependency signals, not legitimacy grants.

### Mutation-capable surfaces

None in this issue. The planned artifact is documentation only.

### Replay implications

The graph must not consume replay tokens, issue replay decisions, mutate replay state, or allow replay resurrection. Any future graph ingestion should treat replay-related fields as evidence snapshots only.

### Proof requirements

Future work should distinguish:

- enforcement proof from required checks;
- proof artifacts from existing ContinuityOS validation paths;
- dependency formation signals from topology observations; and
- independent dependency proof, which this issue does not claim.

### Validation requirements

Future validation should be limited to documentation/schema review until a separate implementation issue defines an ingestion boundary. Runtime validation, merge enforcement, and proof generation must remain outside the graph layer.

### Unresolved ambiguity

- Which external data sources are acceptable for observing installs, branch protection, retention, and removal events?
- What privacy-preserving identifiers should be used for users and repositories?
- What threshold separates repeated use from durable dependency formation?
- How should stale or deleted external repositories be represented without rewriting history?
- What governance review is required before any future graph ingestion job is introduced?

## Final compression

ContinuityOS runtime = enforcement.

Topology graph = dependency visibility.
