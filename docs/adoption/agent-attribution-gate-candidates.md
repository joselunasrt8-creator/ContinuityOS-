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

Rows below were verified on **2026-06-20** via read-only GitHub search (agent-lane
PR volume, author association, explicit pain issues/PRs, repo size). The
`Contacted / Installed / Blocked / Passed / Retention` columns are **deliberately
empty** — they are human-outreach outcomes and are not filled until a real
maintainer responds. Do not fabricate them.

**Primary (qualified — contact these first):**

| Candidate (owner/repo) | Score /10 | Pain (verified signal) | Contacted | Installed? | Blocked agent PR | Passed agent PR | Retention answer |
|---|---|---|---|---|---|---|---|
| _example/your-repo_ | 8 | issue #123 | 2026-06-20 / issue | yes | #45 | #46 | "yes — without it we'd merge unlabeled agent PRs blind" |
| casscoulston/thriving-teams | 8 | **Strongest felt-pain.** Issue #12 "AI statement"; PR [#16](https://github.com/casscoulston/thriving-teams/pull/16) reworks AI-authorship disclosure to Nature/ICMJE/COPE wording and *removes a wrong model attribution*. Receives Claude **and** Copilot PRs from an **external collaborator** (`ricardotwumasi`, not the owner). Native GH Actions CI (`r-lint.yml`). 1★, solo academic owner → move-fast. | — | — | — | — | — |
| s243a/UnifyWeaver | 8 | **Best mechanism-fit.** ~3,280 PRs, pervasive `claude/*` agent lanes; solo maintainer hand-rolling agent-lane-on-`main` governance ("own-PR workflow on main"). 5★ → move-fast. | — | — | — | — | — |
| cacheplane/angular-agent-framework | 6 | ~720 PRs all "Generated with Claude Code", but **single-maintainer self-authored** (`blove`) → lower *external*-attribution pain. 99★ established Angular agent SDK → move-fast = mid. | — | — | — | — | — |

**Secondary (discovered 2026-06-20; only agent-PR signal confirmed — qualify before contacting):**

| Candidate (owner/repo) | Score /10 | Pain (verified signal) | Contacted | Installed? | Blocked agent PR | Passed agent PR | Retention answer |
|---|---|---|---|---|---|---|---|
| tallyfy/documentation | ~5 (unqualified) | Receives **external** CONTRIBUTOR Claude-Code PRs (`amitkoth`, PR #94). Company/org → move-fast + pain unverified. | — | — | — | — | — |
| legioncodeinc/honeycomb | ~5 (unqualified) | **External** CONTRIBUTOR Claude-Code agent PRs (PR #31). Org; size / protection / explicit pain unverified. | — | — | — | — | — |

> **Discovery finding (2026-06-20).** Agent-authored PRs are now ubiquitous —
> ~163,700 open PRs carry "Generated with Claude Code" — but the **overwhelming
> majority are owner self-authored**. The gate's specific pain (forcing *external /
> agent* PRs to declare authorship before merge) is concentrated in the rarer
> repos already wrestling with attribution. That is why the verified primaries
> above (especially `thriving-teams`, the clearest attribution-pain case, and
> `UnifyWeaver`, the clearest mechanism-fit) outrank generic high-volume agent
> repos. Keyword discovery for "AI attribution" issues returned mostly digest/spam
> noise plus large policy-heavy repos (e.g. `stdlib-js/stdlib` #9347) that the
> disqualifiers exclude.

> **Verification still pending — Protected `main` column.** The `Protected main /
> required-checks` rubric signal is **not yet verified** for any row: this
> session's GitHub access is scoped to the ContinuityOS repos, so direct
> branch-protection reads on candidate repos returned `NO_ACCESS` (and the public
> API was egress-blocked). Per the rubric this is expected and **outreach
> proceeds** — the draft's protected-branch question verifies in-thread. To verify
> independently before contact, run the probe script:
>
> ```bash
> # one or more repos
> ./verify-candidate.sh casscoulston/thriving-teams s243a/UnifyWeaver
> # or drive it off this table
> ./verify-candidate.sh --from-table
> ```
>
> See [`verify-candidate.sh`](./verify-candidate.sh) (read-only; needs `gh` + `jq`;
> `column` optional). A repo with **no** required checks is still a valid target —
> the gate becomes its *first* required check (`+1`). A repo that already enforces
> required checks, via classic protection **or a repository ruleset**, scores the
> full `+2`. If you lack admin on the target you'll get
> `NO_ACCESS → ASK_IN_OUTREACH` — that's expected for an unaffiliated repo, and the
> outreach **proceeds**: the draft's protected-branch question does the verification
> in-thread. Record the result in the row and only then finalize the score.

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
