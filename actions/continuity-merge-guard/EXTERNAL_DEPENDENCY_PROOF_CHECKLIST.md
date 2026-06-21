# External Dependency Proof Checklist

## 1. Purpose

Use this checklist in an outside-owner repository to prove whether ContinuityOS Merge Guard is an external workflow dependency, not just a pilot run.

Pilot evidence ≠ dependency proof. Pilot evidence means the check ran. Dependency proof means removal worsens an external workflow.

## 2. What this proves

This proves an independent maintainer can install the existing Merge Guard action, configure the required check named exactly `merge-guard`, produce one `VALID` mergeable PR, produce one `NULL` blocked PR, capture the resulting proof, and state whether removing the required check worsens their workflow.

## 3. What this does not prove

This does not prove diff validation, review validation, final merge commit validation, automatic human/agent authorship detection, or any authority beyond the existing Merge Guard identity and explicit author-policy check.

## 4. Install Merge Guard

In the outside-owner repository, add a pull request workflow that uses the existing action:

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
      - uses: joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard@main
        id: merge-guard
        with:
          repo: ${{ github.repository }}
          pr-number: ${{ github.event.pull_request.number }}
          head-sha: ${{ github.event.pull_request.head.sha }}
          base-sha: ${{ github.event.pull_request.base.sha }}
          actor: ${{ github.event.pull_request.user.login }}
```

## 5. Configure protected branch required check

In the outside-owner repository, configure branch protection for the target branch and add the required status check named exactly `merge-guard`.

Capture screenshot or text proof that `merge-guard` is required before running the evidence loop.

## 6. Evidence Loop

### PR A: VALID / mergeable

1. Open a normal pull request with complete Merge Guard inputs.
2. Confirm the `merge-guard` required check passes with result `VALID`.
3. Confirm the PR is mergeable with the required check enabled.
4. Download or capture the `MERGE_GUARD_PROOF.json` artifact for this run.

### PR B: NULL / blocked

1. Open or update a separate pull request so Merge Guard returns `NULL` without changing Merge Guard code.
2. Confirm the `merge-guard` required check fails or blocks merge eligibility.
3. Confirm the PR cannot be merged while `merge-guard` is required.
4. Download or capture the `MERGE_GUARD_PROOF.json` artifact for this run.

## 7. Required Evidence

Collect the following evidence from the outside-owner repository:

- workflow URL for the installed Merge Guard run
- `MERGE_GUARD_PROOF.json` from PR A and PR B
- screenshot or text proof that `merge-guard` is configured as a required check
- blocked NULL PR evidence showing PR B is not mergeable while `merge-guard` is required
- maintainer statement answering the Removal Test question below

## 8. Removal Test

The maintainer must answer:

> What becomes worse if this required check is removed?

A useful answer identifies a concrete workflow, gate, review expectation, release rule, or operational habit that becomes weaker, less deterministic, or more manual without the required `merge-guard` check.

## 9. Success Criteria

The external dependency proof succeeds only when all of the following are true:

- the repository is owned or maintained outside ContinuityOS
- the existing Merge Guard action is installed without runtime changes
- the protected branch requires the check named exactly `merge-guard`
- PR A produces `VALID` evidence and remains mergeable
- PR B produces `NULL` evidence and is blocked by the required check
- both PRs provide `MERGE_GUARD_PROOF.json`
- the maintainer states whether removal worsens their workflow

## 10. Non-Goals

This checklist does not create new authority, expand canon, change action behavior, change validator logic, change proof artifact shape, claim diff validation, claim review validation, claim final merge commit validation, or claim automatic human/agent authorship detection.
