# Independent Merge Guard Dependency Evidence (Issue #2001)

This directory holds dated, repo-visible evidence records that track an
**independent** (non-`continuityos-sandbox`, different-owner) operator's
adoption of the `continuity-merge-guard` action
(`actions/continuity-merge-guard/`), from first awareness through to a
dependency decision.

## Purpose

`docs/product/MERGE_GUARD_POSITIONING.md` (#2005) and
`docs/product/PILOT_PERSONA.md` (#2004) define the pitch and the target
operator. `continuityos-sandbox` has already demonstrated the mechanism
end-to-end (`EXTERNAL_DEPENDENCY_PROOF.md`, `NULL_ENFORCEMENT_PROOF.md`), but
because that repo shares an owner with this one, it is **demonstration
evidence, not independent dependency evidence**.

Issue #2001 ("independent dependency proof") closes only when an operator
*other than the ContinuityOS team* installs Merge Guard, makes it a required
status check, observes both a `VALID` and a `NULL` result in production, and
states — in their own words — that removing it would make their merge
workflow materially worse.

This directory exists so that, **when** such an operator reaches that point,
the evidence can be recorded here in a structured, dated, reviewable form —
instead of a closure claim being made from comments alone.

**No record may be added to this directory that has not been self-reported
by the independent operator named in that record.** A missing record means
#2001 remains `OPEN` and is classified as the unproven dependency frontier.

## The adoption funnel

Each record reports the operator's furthest-reached stage in this funnel
(see `evidence-record.template.json` field `resulting_classification`):

| Stage | Description | Who acts |
|---|---|---|
| 1 | Candidate operator identified | owner-only, not recorded here |
| 2 | Conversation held (operator aware of #2005 pitch) | owner-only, not recorded here |
| 3 | Operator installs the action (`DEPENDENCY_FORMATION_PREP`) | operator, self-reported |
| 4 | Operator adds it as a required status check (`DEPENDENCY_FORMATION_ACTIVE`) | operator, self-reported |
| 5 | Operator retains the check for 30+ days, possibly with caveats (`DEPENDENCY_CONDITIONAL`) | operator, self-reported |
| 6 | Operator states removal would make their workflow materially worse (`DEPENDENCY_CONFIRMED`) — closes #2001 | operator, self-reported |
| any | Operator tries it and decides not to adopt (`DEPENDENCY_REJECTED`) | operator, self-reported |

Stages 1-2 are owner-led outreach and are intentionally **not** tracked as
evidence records — only operator-side self-reports (stages 3+) belong here.

As of this writing, this directory contains **zero records**.

## Evidence record format

Each evidence record is a JSON file named
`EXTERNAL_OPERATOR_DEPENDENCY_<operator_id>_<YYYY-MM-DD>.json`, using
`evidence-record.template.json` as the schema. `<operator_id>` is a
short, operator-chosen identifier (not necessarily the org name, if the
operator prefers anonymity).

## What this directory does NOT do

- It does not itself close issue #2001 — a `DEPENDENCY_CONFIRMED` record is
  a proposal for review, not an automatic state change.
- It does not perform or simulate outreach, and does not assert that any
  candidate operator exists.
- It does not change the classification of `continuityos-sandbox`'s
  demonstration evidence, which remains valid as demonstration (not
  independent dependency) proof.
