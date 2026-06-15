# ContinuityOS Merge Guard — Positioning

## 1. One-sentence positioning

ContinuityOS Merge Guard is a required legitimacy check for AI-authored PRs.

## 2. Three-sentence explanation

Merge Guard is a small, portable GitHub Action that canonicalizes a pull
request's identity — `{repo, pr_number, head_sha, base_sha, actor}` plus an
explicit author policy — into a deterministic `VALID` or `NULL` result and a
persisted proof artifact (`MERGE_GUARD_PROOF.json`). Add it as a required
status check and a PR can only become mergeable if its identity object
matches what was declared and validated; anything else is blocked, fail
closed. It does not review code, run tests, or detect authorship — it
answers one narrow question: *is this exactly the PR we think it is, and is
that accounted for before merge?*

## 3. First-user value prop

If your repository already accepts AI-authored or AI-assisted PRs against a
protected branch, Merge Guard gives you the one thing your current setup is
missing: a required, automated, fail-closed signal that the PR's identity
(repo, PR number, head/base SHAs, actor, and declared author policy) is
exactly what was validated — with a reproducible proof artifact you can point
to later. Install takes about two minutes and changes nothing else about how
you review or merge.

## 4. Pain — what's missing today

- No reproducible, verifiable record that "this exact PR (head_sha / base_sha
  / actor) is the one that was reviewed and is the one that will merge."
- CI checks **content** (tests pass, lint clean) but not **identity** — it
  doesn't confirm the PR being merged is the PR that was reviewed.
- For AI-authored PRs specifically, there is no required signal
  distinguishing "an agent opened this and it's accounted for" from "an agent
  opened this silently."

## 5. Existing workaround (and why it's insufficient)

- **CODEOWNERS** — routes review to the right humans, but does not verify
  identity or authorship at merge time.
- **Branch protection + required CI** — verifies content (tests/lint), not
  identity or provenance.
- **Human review + commit conventions** — manual, not enforced, not
  reproducible as proof.
- **PR labels / bot conventions** — advisory metadata, not fail-closed, and
  bypassable.

None of these answer the question: *if this PR's identity object doesn't
match what was reviewed, is merge automatically blocked, with proof?*

## 6. Failure mode without Merge Guard

An AI-authored PR can merge with no required, fail-closed check that its
`{repo, pr_number, head_sha, base_sha, actor}` identity is exactly what was
validated. This creates a silent gap between "what was reviewed" and "what
merges." For repos where AI agents regularly open PRs, this is the specific
gap that makes the workflow feel ungoverned even when humans are reviewing
every diff.

## 7. Why Merge Guard is load-bearing

- It runs as a **required status check** — a `NULL` result blocks merge,
  fail-closed, the same way a failing test does.
- `VALID` / `NULL` is **deterministic**: a sha256 of the canonical identity
  object, reproducible by anyone, with a persisted proof artifact
  (`MERGE_GUARD_PROOF.json`).
- It is demonstrated end-to-end in `continuityos-sandbox`: a real PR with a
  matching identity object went `VALID → mergeable` (#8), and a real PR with
  a mismatched identity object went `NULL → blocked` (#9) —
  `BLOCKED_NULL_CONFIRMED`.
- Removing it removes the **only** required, automated, fail-closed identity
  check in the merge path. Everything else in a typical setup (CI, human
  review) checks content, not identity.

## 8. What Merge Guard is NOT

- Not a replacement for code review, CI, CODEOWNERS, or branch protection —
  it sits alongside them.
- Not a general AI-agent classifier or authorship detector. v1 does not
  determine "was this written by an agent" — it validates a declared
  identity object against the canonical PR state.
- Not a full distributed-legitimacy or autonomous-org governance platform.

Merge Guard does **not** claim:

- Distributed proof finality
- Global legitimacy convergence
- Multi-org authority federation
- Full autonomous-org (AO) governance
- Complete agent safety
- Perfect authorship detection

It claims only the wedge: **AI-authored/assisted PR → required legitimacy
check → VALID/NULL → proof artifact → merge-eligibility signal.**

## 9. Comparison: existing mechanisms vs. Merge Guard

| Mechanism | Verifies PR identity at merge time? | Fail-closed? | Persisted proof artifact? |
|---|---|---|---|
| CI (tests/lint) | No | Yes (for content) | No |
| CODEOWNERS | No | No | No |
| Branch protection (alone) | No | N/A | No |
| Human review | No (implicit trust) | No | No |
| **Merge Guard** | **Yes** | **Yes** | **Yes** |

## 10. Bounded relationship to ContinuityOS

Merge Guard is the smallest installable wedge of the broader ContinuityOS
governance model. Installing it does not require adopting any other part of
ContinuityOS — it is a standalone GitHub Action with one required check and
one proof artifact.
