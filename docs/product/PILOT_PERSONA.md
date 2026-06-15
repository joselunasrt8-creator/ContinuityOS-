# ContinuityOS Merge Guard — Pilot Persona

## 1. Exact operator profile

**Primary persona:** a platform- or security-conscious engineering lead, or
an infra owner, responsible for protected-branch integrity on a repository
where AI coding agents (e.g. Claude Code, Copilot workspace agents) already
open pull requests. This person has the authority to add a required status
check to branch protection — typically a repo admin or platform-team member.

**Secondary personas** (not the initial pilot target, but downstream
beneficiaries / influencers):

- A senior engineer who reviews agent-authored PRs day to day.
- A platform engineer who maintains the branch-protection configuration.
- A founder or technical lead adopting AI coding agents for the first time.
- A compliance-minded reviewer who needs an auditable signal for
  AI-authored changes.

## 2. Repository characteristics

A qualifying pilot repository has:

- A protected default branch with required status checks already configured
  (so adding one more is a familiar, low-friction operation).
- At least one AI coding agent that regularly opens PRs against that branch.
- Existing CI that is content-only (tests/lint) — no existing
  identity/provenance check.
- A small-to-medium team where adding a required check is a single decision,
  not a multi-team change-management process.

## 3. Current workflow (before Merge Guard)

Agent opens PR → CI runs (tests/lint) → a human reviews the diff → a human
merges. There is no automated identity/provenance check; "is this the PR I
reviewed" rests on implicit trust from no-force-push protections plus branch
protection alone.

## 4. Adoption trigger

One of:

- A near-miss or stated concern: "an agent PR merged and we had no check
  confirming its identity/authorship was accounted for."
- Proactive hardening ahead of scaling agent usage (more agents, more PRs per
  week).
- External pressure — e.g. a compliance or audit question: "how do you know
  what merged was what was reviewed, for AI-authored changes?"

## 5. Smallest acceptable installation path

1. Add the `continuity-merge-guard` action to a workflow file, pinned to
   `@v0.1.0` (per the action README's "Install (2 minutes)" snippet).
2. Configure one policy: `require-agent-authored: 'true'` if the goal is to
   gate agent-authored PRs specifically (required check name becomes
   `agent-merge-guard`); otherwise the default `merge-guard` check covers all
   PRs.
3. Add the resulting check (`merge-guard` or `agent-merge-guard`) to the
   branch's required status checks list.
4. Run one PR through to a `VALID` result and confirm it becomes mergeable.
5. Run one PR through to a `NULL` result (e.g. a deliberately mismatched
   identity object) and confirm it is blocked.
6. Inspect the generated `MERGE_GUARD_PROOF.json` for both runs.
7. Decide whether to keep the check required going forward.

## 6. Success criteria — 7 days

- `time_to_install`: target under 2 minutes, matching the action README.
- `first_VALID_check_time` and `first_NULL_check_time` both observed.
- At least one agent-authored PR checked by Merge Guard.
- A proof artifact (`MERGE_GUARD_PROOF.json`) generated and inspectable.
- `false_block_count == 0` — no legitimate PR incorrectly blocked.
- `override_count` tracked (0 expected in steady state; non-zero is a signal
  worth investigating, not necessarily a failure).

## 7. Success criteria — 30 days

- The required check is retained, not disabled, after the first month.
- Repeat usage across multiple PRs, not a one-off trial.
- The team reports improved confidence in agent PRs during manual review.
- "Agent PRs require Merge Guard `VALID` before merge" becomes a stated team
  policy (written down somewhere — README, CONTRIBUTING, or team norms doc).

## 8. Dependency criteria — the #2001 test

The question to put directly to the pilot operator after 30 days:

> "If Merge Guard were removed or disabled tomorrow, what becomes worse in
> your workflow?"

The candidate answer this pilot is meant to validate: *"We would lose the
only required, fail-closed signal that an agent PR's identity matches what
was reviewed; merge would proceed on content checks alone."*

Dependency is proven only when an **independent** operator — not the
ContinuityOS team — confirms this statement is true for their own workflow
and chooses to keep the check required after having experienced both a
`VALID` and a `NULL` result in production.

## 9. Rejection risks

- The team doesn't use protected branches or required status checks at all —
  no integration point exists.
- The team has no AI-authored PRs — there is no pain for Merge Guard to
  address.
- "VALID/NULL" is perceived as redundant with existing CI (the positioning
  doc must preempt this by clarifying identity vs. content checks).
- Perceived as added governance overhead with no visible payoff in week one.
