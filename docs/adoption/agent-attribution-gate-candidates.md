# Agent Attribution Gate — Candidate Discovery & Qualification

A repeatable funnel for finding the **first independent (outside-owner)** repo to
install the `agent-attribution-gate`. Pairs with the outreach brief in
[`agent-attribution-gate-outreach.md`](./agent-attribution-gate-outreach.md): this
doc finds and qualifies targets; that doc is what you send them.

The goal is **one** retained outside install, not volume. A single independent
maintainer who keeps the check because removing it would make their workflow worse
is the data point that converts ContinuityOS from same-owner demonstrated
dependency into genuine external dependency.

---

## Qualification rubric

Score each candidate 0–2 on each signal. A good first target scores high on
**pain** and **fit**, and is **small enough to move fast**.

| Signal | 0 | 1 | 2 |
|---|---|---|---|
| **Protected `main`** | none | branch rules, no required checks | required status checks already enforced |
| **Receives AI/agent PRs** | none visible | occasional bot/agent PR | recurring agent-lane branches (`claude/*`, `codex/*`, …) or bot authors |
| **Native-check preference** | runs a GitHub App / external platform for policy | mixed | relies on GitHub-native required checks only |
| **Felt the pain** | no sign | general AI-PR review concern | explicit issue/discussion about unverified or mislabeled AI contributions |
| **Move-fast size** | large org, CLA + legal review | mid-size | solo/small-team maintainer who can change branch protection themselves |

**Target threshold:** ≥ 7 / 10, with **Felt the pain ≥ 1** and **Move-fast = 2**.
A maintainer who can flip branch protection without committee is worth more than a
larger repo that can't move.

## Disqualifiers (skip for the *first* install)

- Heavy existing policy stack (Snyk / Semgrep / OPA / a merge queue) — they'll say
  the pain is already covered; not the cheapest first yes.
- No AI-generated PRs at all — no pain, nothing to enforce.
- Corporate CLA / security-review friction — slows the boundary crossing you're
  trying to make cheap.
- Repos where you have privileged access or shared ownership — that's same-owner
  again; the whole point is an *independent* trust boundary.

## Discovery queries

Copy-paste starting points. Treat every hit as a hypothesis to verify by hand —
these surface candidates, they don't qualify them.

**GitHub code/branch search (web UI or `gh search`):**

```
# Repos that publicly carry agent-lane branches (confirms: receives AI/agent PRs)
#   GitHub web search → "Branches", or via the API below.
# PRs that self-identify as agent/bot authored (confirms: pain surface exists)
is:pr is:open label:agent-authored
is:pr author:app/devin-ai-integration
is:pr head:claude/ in:head
```

**GitHub API (gh CLI) — agent-lane branches on a candidate repo:**

```bash
# Confirms recurring agent lanes on a specific repo
gh api "repos/OWNER/REPO/branches?per_page=100" \
  --jq '.[].name | select(test("^(claude|codex|cursor|devin|copilot)/"))'

# Confirms whether main already enforces required checks (rubric: Protected main)
gh api "repos/OWNER/REPO/branches/main/protection/required_status_checks" \
  --jq '.contexts' 2>/dev/null || echo "no required checks (or no access)"

# Surfaces explicit pain: issues/discussions about AI-PR authorship/attribution
gh search issues "AI generated pull request attribution" --limit 30 \
  --json repository,title,url
```

**Signals that a repo has "felt the pain"** (worth reading before contacting):
issues/discussions mentioning *unverified AI PRs*, *bot PRs slipping through*,
*can't tell which PRs are agent-authored*, or a hand-rolled label/CI hack that
approximates what this gate does natively.

## Scoring + outreach tracking table

One row per candidate. Fill the score columns from the rubric; fill the evidence
columns as outreach progresses. The three evidence columns are exactly the
step-5 retention proof the audit asks for.

| Candidate (owner/repo) | Score /10 | Pain | Contacted (date / channel) | Installed? | Blocked agent PR | Passed agent PR | Retention answer (1 sentence) |
|---|---|---|---|---|---|---|---|
| _example/your-repo_ | 8 | issue #123 | 2026-06-20 / issue | yes | #45 | #46 | "yes — without it we'd merge unlabeled agent PRs blind" |
|  |  |  |  |  |  |  |  |

- **Contacted** — repo-level (open an issue/discussion) is preferred over personal
  email; keep it public and low-pressure.
- **Installed?** — they added `agent-attribution-gate` as a required check.
- **Blocked / Passed agent PR** — link the two live runs (the counterfactual).
- **Retention answer** — the one sentence that matters: *would your merge path be
  materially worse without this check?* A "yes" here is the milestone.

## Method note

Run the funnel narrow and shallow: qualify ~6–10 candidates, contact the top 1–2,
and optimize for a single retained yes rather than many installs. The first
boundary crossing is the experiment; scale is a later problem.
