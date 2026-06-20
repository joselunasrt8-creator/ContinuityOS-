# Agent Attribution Gate — Personalized Outreach Drafts

Ready-to-send, per-candidate messages built from the template in
[`agent-attribution-gate-outreach.md`](./agent-attribution-gate-outreach.md) and
scored in [`agent-attribution-gate-candidates.md`](./agent-attribution-gate-candidates.md).

Each draft leads with the candidate's *specific* pain, then makes the **low-friction
trial ask**: drop in one **non-blocking, report-only** workflow that watches their
real agent PRs with **zero merge risk** — and only if the verdicts look right, a
one-line change upgrades it to a required check. Every draft links the 5-minute
guide (start at **Stage 0 — Trial**) and ends with the **single retention question**
that is the whole point of the experiment.

Why trial-first: making a check required on a protected branch is a trust decision.
Asking a stranger to make that decision *before* they've seen the gate run on their
own PRs is the friction that suppresses the first install. The report-only trial
lets them decide on evidence — and the **upgrade to required**, made after watching
it work, *is* the dependency-formation event we are trying to cause.

**Before sending any of these:**

1. Verify the candidate's `main` actually has branch protection — run
   `./verify-candidate.sh OWNER/REPO` (the "Verification pending" probe in
   `agent-attribution-gate-candidates.md`). A repo with **no** required checks is
   still a valid target: the trial needs none, and the gate becomes its *first*
   required check on upgrade. `NO_ACCESS → ASK_IN_OUTREACH` is expected for an
   unaffiliated repo — the draft's protected-branch question verifies it in-thread.
2. Prefer a **public, low-pressure channel** — a GitHub issue or discussion on
   their repo over a DM/email.
3. Replace `<link>` with the live URL to
   `actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md` and tell them
   to **start at "Stage 0 — Trial"**.

The goal is **one retained yes**, not volume — send to the top 1–2, not all three.

---

## 1. `s243a/UnifyWeaver`

**Why this one first:** highest-scoring (8). Solo maintainer, active, Apache-2.0,
and an open agent PR literally about an *"own-PR workflow on `main`"* — they are
already building, by hand, the agent-lane-on-`main` discipline this gate provides.

> **Subject: a 5-minute, zero-risk way to see which agent PRs declared their authorship**
>
> Hi — I came across your work on the own-PR / agent workflow landing on `main`,
> and it lines up with something I've been building.
>
> Right now nothing on GitHub tells you whether an agent-lane PR (`claude/*`,
> `codex/*`, …) actually declared it was agent-authored before it merges into
> `main` — you find out after the fact, if at all. Since you're already running
> agent PRs into `main`, you've effectively been handling this by hand.
>
> Worth trying with **zero merge risk**: drop in one *report-only* workflow. On
> agent-lane branches it tells you — right in the PR's check summary — whether the
> PR carried an `AGENT_AUTHORED` signal (a commit trailer, a label, or a PR-body
> block) and what a strict gate *would* do. It **never blocks anything** during the
> trial, and human PRs are never touched. No GitHub App, no secrets, ~5 minutes.
>
> Watch it on your real PRs for a few days; if the verdicts look right, **one line**
> upgrades it to a required check that actually enforces authorship on the agent
> lane. One-click revert at any point.
>
> 5-minute install (start at "Stage 0 — Trial"): <link>
>
> If you run the trial, I'd love to know one thing afterward: **once you'd watched
> it, did you make it required — and would your merge path be materially worse
> without it?** That's the only feedback I'm after.

---

## 2. `cacheplane/angular-agent-framework`

**Why:** score 7. Small org building an *agent SDK* — an audience that already
thinks in agent-authorship terms — and it carries an external `claude/*` PR
(author ≠ owner), i.e. a real cross-author agent contribution on a live repo.

> **Subject: a 5-minute, zero-risk check that shows which agent PRs declared authorship**
>
> Hi — you're building an Angular agent framework, so you already live in the world
> where agents open PRs. I noticed at least one external agent-lane (`claude/*`) PR
> on the repo.
>
> There's a gap GitHub doesn't cover natively: nothing tells you whether an
> agent-lane PR declared it was agent-authored before it merges into `main`. For a
> project whose whole subject is agentic apps, making that authorship boundary
> observable — and then enforceable — might be worth a look.
>
> The first step is risk-free: one *report-only* workflow that watches your
> agent-lane PRs and reports, in the check summary, whether each one carried an
> `AGENT_AUTHORED` signal and what a strict gate would do. It **can't block a
> merge** during the trial, and human PRs are untouched. No GitHub App, no secrets,
> ~5 minutes. If it looks right on your real PRs, one line upgrades it to a required
> check. One-click revert.
>
> 5-minute install (start at "Stage 0 — Trial"): <link>
>
> If you run it, the one thing I'd want to learn: **did the trial convince you to
> make it required, and would your merge path be materially worse without it?**

---

## 3. `casscoulston/thriving-teams`

**Why:** score 7, and the most *explicit* pain signal in the set — an open issue
about model attribution for Copilot-generated work. Note: verify the repo still
receives agent PRs (it surfaced via the pain query, not the agent-lane query) and
that `main` is protected before sending.

> **Subject: a 5-minute, zero-risk way to enforce AI-PR attribution at the merge gate**
>
> Hi — I saw your issue about adding a model-attribution statement for
> Copilot-generated work. That's the exact problem a small thing I've been building
> addresses, but at the *merge gate* instead of in the README.
>
> Right now attribution for AI/agent work lives in docs, not in enforcement —
> nothing checks whether an AI-authored PR actually declared its authorship before
> it merges. You can try the enforcement side with **zero risk**: one *report-only*
> workflow that watches agent-lane PRs and reports, in the check summary, whether
> each carried an `AGENT_AUTHORED` signal (commit trailer, label, or PR-body block)
> and what a strict gate would do. It **never blocks a merge** during the trial, and
> human PRs pass untouched. No GitHub App, no secrets, ~5 minutes.
>
> If the verdicts match what you want, one line upgrades it to a required check —
> attribution that's enforced, not just documented. One-click revert.
>
> 5-minute install (start at "Stage 0 — Trial"): <link>
>
> If you try it, I'd love one sentence back: **did you upgrade it to required, and
> would your merge path be materially worse without it?** That's the only feedback
> I'm collecting.

---

## What to capture after a yes

Per the kit, the first outside install is about **retention evidence**, not a
demo. The trial makes the evidence cheap to collect — its report-only summaries
already give you #1 and #2 as *would-block (NULL)* and *would-pass (VALID)*
verdicts on the maintainer's real PRs, before anything is enforced. Record these
three things back into the candidate table
(`agent-attribution-gate-candidates.md`):

1. One agent-lane PR the trial flagged as **would-block (NULL)** for missing
   attribution — or, post-upgrade, one actually **blocked**.
2. One agent-lane PR that read **VALID** after the signal was added — or, post-
   upgrade, one that **passed** and merged.
3. One sentence answering: *did you upgrade the trial to a required check, and
   would your merge path be materially worse without it?*

The decisive event is the **upgrade**: a maintainer who, after watching the trial,
chooses to make the check required has chosen — on their own evidence — to make
ContinuityOS load-bearing in their repo. That upgrade plus a "yes" to the retention
question is the single data point that converts ContinuityOS from same-owner
demonstrated dependency into genuine **external** dependency formation.
