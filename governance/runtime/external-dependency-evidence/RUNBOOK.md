# Independent Merge Guard Dependency Verification Runbook (Issue #2001)

This runbook describes the **operator-side** steps that produce evidence
records for `governance/runtime/external-dependency-evidence/`. It does not
perform any of these steps itself, and no step has been performed as part of
issue #2001 — this directory starts empty.

It is written for the operator described in `docs/product/PILOT_PERSONA.md`
(#2004), using the pitch in `docs/product/MERGE_GUARD_POSITIONING.md` (#2005)
and the install steps in `actions/continuity-merge-guard/README.md`.

## Stage 3 — Install

1. Add the `continuity-merge-guard` action to a workflow file, pinned to
   `@v0.1.0` (see `actions/continuity-merge-guard/README.md`, "Install (2
   minutes)").
2. Choose whether to gate all PRs (`merge-guard`) or specifically
   agent-authored PRs (`require-agent-authored: 'true'`, check name
   `agent-merge-guard`).
3. Record `install_evidence` in `evidence-record.template.json`
   (`uses_reference`, `pinned_version`, `required_check_name`).

## Stage 4 — Required check adoption

1. Add the check name from step 2 to the protected branch's required status
   checks.
2. Record `branch_protection_evidence` — a description or reference (e.g.
   a screenshot hash, or the relevant branch-protection API response with
   secrets redacted) confirming the check is required.

## Stage 5 — Observe both outcomes

1. Open or identify a PR whose identity object matches what Merge Guard
   expects; confirm it reports `VALID` and the PR becomes mergeable. Record
   `valid_path_evidence` (PR reference + proof artifact reference).
2. Open or identify a PR whose identity object does not match (e.g. a
   deliberately mismatched base/head); confirm it reports `NULL` and the PR
   is blocked. Record `null_path_evidence` (PR reference + proof artifact
   reference).
3. Let the check remain required for at least 30 days of normal use.

## Stage 6 — The dependency statement

After stage 5 has run for 30+ days, answer in your own words:

> "If Merge Guard were removed or disabled tomorrow, what becomes worse in
> your workflow?"

Record this verbatim as `operator_statement`.

## Submitting the record

1. Fill out `evidence-record.template.json` as
   `EXTERNAL_OPERATOR_DEPENDENCY_<operator_id>_<report_date>.json` in this
   directory, using `<operator_id>` as a short identifier you choose
   (anonymous if preferred).
2. Set `resulting_classification` to the furthest stage reached:
   - Installed only -> `DEPENDENCY_FORMATION_PREP`
   - Required check added, evidence gathered -> `DEPENDENCY_FORMATION_ACTIVE`
   - Retained 30+ days, with caveats -> `DEPENDENCY_CONDITIONAL`
   - Retained 30+ days, dependency statement given -> `DEPENDENCY_CONFIRMED`
   - Tried it, decided not to adopt, at any stage -> `DEPENDENCY_REJECTED`
3. Submit the record (e.g. via a PR adding the file, or by attaching it to
   the relevant issue) for governance review.

## What "closed" requires

A `DEPENDENCY_CONFIRMED` record from an independent operator is a *proposal*
that issue #2001 be closed — it is reviewed, not automatically applied. Until
such a record exists, #2001 remains `OPEN`, and `continuityos-sandbox`'s
existing evidence remains classified as demonstration (same-owner), not
independent dependency.
