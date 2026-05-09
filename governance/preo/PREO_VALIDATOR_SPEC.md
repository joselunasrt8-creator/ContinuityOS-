# PREO Validator Specification

## Purpose

PREO means Pull Request Review Evidence Object. The PREO validator specification defines a bounded, non-operative governance artifact for representing pull request review evidence as a strict object before any merge legitimacy decision is considered.

This specification does not implement runtime logic, create authority, create proof, deploy code, mutate workflows, or expose execution endpoints. It only defines the object discipline and validation expectations for future review-layer governance.

## Validation Target

The validation target is exactly one PREO JSON object describing one pull request review state for one repository, branch, base branch, and commit SHA.

The validator target is not a runtime request, execution command, deployment instruction, authority grant, proof record, registry write, or merge operation.

## Required PREO Fields

A PREO object must include all of the following fields:

- `pull_request_id`
- `repository`
- `branch`
- `base_branch`
- `commit_sha`
- `changed_files`
- `author_identity`
- `reviewer_identities`
- `approval_state`
- `review_state`
- `status_checks`
- `workflow_results`
- `validation_result`
- `merge_eligibility`
- `validated_at`

Missing, null, malformed, ambiguous, or extra fields make the PREO invalid and require a fail-closed result.

## Required Validation Checks

A PREO validator must check:

1. The object is valid JSON.
2. The object conforms exactly to `PREO.schema.json`.
3. No undeclared fields are present at the root or in nested objects.
4. `pull_request_id` identifies one pull request only.
5. `repository` identifies one repository only.
6. `branch` and `base_branch` are present and distinct unless explicitly allowed by policy outside this non-operative artifact.
7. `commit_sha` is a full immutable commit hash.
8. `changed_files` is present and machine-readable.
9. `author_identity` is present and machine-readable.
10. `reviewer_identities` is present and machine-readable.
11. `approval_state` and `review_state` are explicit enum values.
12. `status_checks` and `workflow_results` are present and machine-readable.
13. `validation_result` is explicit and does not imply authority, proof, deployment, execution, or merge.
14. `merge_eligibility` is one of the declared merge eligibility states.
15. `validated_at` is an explicit timestamp.
16. The PREO describes the same repository, branch, base branch, and commit SHA throughout the object.
17. The PREO does not claim execution, deployment, proof creation, authority creation, endpoint creation, or workflow mutation.

## Exact Object Discipline

The validator must apply exact object discipline:

- The validated object is the only object eligible for downstream consideration.
- The validated object must not be mutated after validation.
- Any downstream decision must bind to the exact validated object and commit SHA.
- Any mismatch between reviewed object, validated object, and proposed merge object invalidates merge eligibility.
- Extra fields are forbidden.
- Implicit defaults are forbidden.
- Ambiguous values are forbidden.
- Partial objects are invalid.

The invariant is:

```text
validated_object == reviewed_object == merge_candidate_object
```

If equality cannot be established, merge eligibility must be `NULL`.

## Fail-Closed Behavior

Default behavior is fail-closed. The default validation result is `NULL`.

A PREO must become `NULL` if any required field, required check, lineage requirement, replay requirement, proof requirement, observability requirement, or forbidden-action constraint is absent, invalid, ambiguous, stale, or unverifiable.

No validator failure may be converted into approval, authority, proof, execution, deployment, or merge.

## Replay Protection

A PREO must be bound to:

- one `pull_request_id`
- one `repository`
- one `branch`
- one `base_branch`
- one immutable `commit_sha`
- one exact `changed_files` set
- one validation timestamp

A PREO must not be reused for a different pull request, repository, branch, base branch, commit SHA, file set, review state, status check set, workflow result set, or merge candidate.

Any detected reuse, stale commit SHA, changed file mismatch, branch mismatch, status-check mismatch, workflow-result mismatch, or review-state mismatch requires `validation_result.result` to be `NULL` and `merge_eligibility` to be `NULL`.

## Merge Eligibility States

The only allowed merge eligibility states are:

- `PENDING_REVIEW` — review evidence is incomplete or still changing.
- `ELIGIBLE` — review evidence is structurally valid and all declared checks are satisfied.
- `BLOCKED` — review evidence is structurally valid but one or more declared checks do not permit merge.
- `NULL` — the PREO is missing, malformed, ambiguous, stale, replayed, unverifiable, or outside scope.

`ELIGIBLE` is evidence of review-layer legitimacy only. It is not authority, proof, deployment permission, execution permission, or a merge command.

## Proof Lineage Requirements

PREO does not create proof. PREO only declares proof lineage expectations.

Any later proof-producing system must be able to bind proof lineage to:

- the exact validated PREO object hash
- the pull request identifier
- the repository
- the branch and base branch
- the commit SHA
- the changed file set
- the validation result
- the merge eligibility state
- the validation timestamp

If downstream proof cannot bind to the exact validated PREO object, proof lineage is incomplete and execution or merge legitimacy must fail closed.

## Observability Requirements

A PREO validator should produce machine-readable observations for:

- schema validation outcome
- missing or extra fields
- field type failures
- enum failures
- commit SHA mismatch
- changed file mismatch
- review-state mismatch
- status-check mismatch
- workflow-result mismatch
- stale or replayed object detection
- final `validation_result.result`
- final `merge_eligibility`

Observability must not create execution authority, proof, deployment behavior, workflow behavior, endpoint behavior, registry writes, or automatic merge behavior.

## Forbidden Actions

This specification forbids PREO artifacts and PREO validators from:

- modifying runtime files
- modifying `src/index.ts`
- modifying workflows
- modifying migrations
- deploying code
- creating authority
- creating proof
- adding execution endpoints
- mutating registries
- merging pull requests
- bypassing validation
- creating alternate execution paths
- treating missing evidence as approval
- treating `ELIGIBLE` as execution permission
- treating `ELIGIBLE` as deployment permission
- treating `ELIGIBLE` as proof
- treating `ELIGIBLE` as authority

## Core Invariant

```text
If no valid PREO object exists, nothing happens.
```

A PREO is only review-layer evidence. It is non-operative and cannot execute, deploy, merge, create authority, create proof, or bypass the canonical governance path.
