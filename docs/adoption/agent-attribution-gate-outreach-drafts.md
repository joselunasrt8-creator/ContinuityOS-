# Agent Attribution Gate — Personalized Outreach Drafts

Ready-to-send, per-candidate messages built from the template in
[`agent-attribution-gate-outreach.md`](./agent-attribution-gate-outreach.md) and
scored in [`agent-attribution-gate-candidates.md`](./agent-attribution-gate-candidates.md).

Each draft leads with the candidate's *specific* pain, makes the same small
native ask (one required status check, ~5 min, reversible, human PRs untouched),
links the 5-minute install guide, and ends with the **single retention question**
that is the whole point of the experiment.

**Before sending any of these:**

1. Verify the candidate's `main` actually has branch protection (the
   "Verification pending" probe in `agent-attribution-gate-candidates.md`). The
   ask only makes sense where a required check can attach.
2. Prefer a **public, low-pressure channel** — a GitHub issue or discussion on
   their repo over a DM/email.
3. Replace `<link>` with the live URL to
   `actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md`.

The goal is **one retained yes**, not volume — send to the top 1–2, not all three.

---

## 1. `s243a/UnifyWeaver`

**Why this one first:** highest-scoring (8). Solo maintainer, active, Apache-2.0,
and an open agent PR literally about an *"own-PR workflow on `main`"* — they are
already building, by hand, the agent-lane-on-`main` discipline this gate provides.

> **Subject: a 5-minute native check that makes agent PRs declare authorship before merge**
>
> Hi — I came across your work on the own-PR / agent workflow landing on `main`,
> and it lines up with something I've been building.
>
> Right now nothing on GitHub *requires* an agent-lane PR (`claude/*`, `codex/*`,
> …) to state that it was agent-authored before it can merge into a protected
> `main` — you find out after the fact, if at all. Since you're already running
> agent PRs into `main`, you've effectively been solving this by hand.
>
> The tiny native version: one required status check. On agent-lane branches a PR
> must carry an `AGENT_AUTHORED` signal (a commit trailer, a label, or a PR-body
> block) or it's blocked. Ordinary human PRs are never touched. No GitHub App, no
> secrets, ~5 minutes, one-click revert.
>
> 5-minute install: <link>
>
> If you try it, I'd love to know one thing afterward: **would your merge path be
> materially worse without it?** That's the only feedback I'm after.

---

## 2. `cacheplane/angular-agent-framework`

**Why:** score 7. Small org building an *agent SDK* — an audience that already
thinks in agent-authorship terms — and it carries an external `claude/*` PR
(author ≠ owner), i.e. a real cross-author agent contribution on a live repo.

> **Subject: a 5-minute native check that makes agent PRs declare authorship before merge**
>
> Hi — you're building an Angular agent framework, so you already live in the
> world where agents open PRs. I noticed at least one external agent-lane
> (`claude/*`) PR on the repo.
>
> There's a gap GitHub doesn't cover natively: nothing *requires* an agent-lane
> PR to declare that it was agent-authored before it's allowed to merge into a
> protected `main`. For a project whose whole subject is agentic apps, having that
> authorship boundary be enforceable (not just convention) might be worth a look.
>
> The ask is small: one required status check that enforces authorship on agent
> lanes and leaves human PRs completely untouched. No GitHub App, no secrets,
> ~5 minutes, one-click revert.
>
> 5-minute install: <link>
>
> If you try it, the one thing I'd want to learn: **would your merge path be
> materially worse without it?**

---

## 3. `casscoulston/thriving-teams`

**Why:** score 7, and the most *explicit* pain signal in the set — an open issue
about model attribution for Copilot-generated work. Note: verify the repo still
receives agent PRs (it surfaced via the pain query, not the agent-lane query) and
that `main` is protected before sending.

> **Subject: a 5-minute native check that makes AI PRs declare authorship before merge**
>
> Hi — I saw your issue about adding a model-attribution statement for
> Copilot-generated work. That's the exact problem a small thing I've been
> building addresses, but at the *merge gate* instead of in the README.
>
> Right now nothing on GitHub *requires* an AI/agent-authored PR to declare its
> authorship before it can merge — the attribution lives in docs, not in
> enforcement. The native fix is one required status check: on agent-lane branches
> a PR must be attributed `AGENT_AUTHORED` (commit trailer, label, or PR-body
> block) or it's blocked. Human PRs pass untouched. No GitHub App, no secrets,
> ~5 minutes, one-click revert.
>
> 5-minute install: <link>
>
> If you try it, I'd love one sentence back: **would your merge path be materially
> worse without it?** That's the only feedback I'm collecting.

---

## What to capture after a yes

Per the kit, the first outside install is about **retention evidence**, not a
demo. From whoever installs, record exactly three things back into the candidate
table (`agent-attribution-gate-candidates.md`):

1. One agent-lane PR that was **blocked** for missing attribution (gate worked).
2. One agent-lane PR that **passed** after adding the signal.
3. One sentence answering: *would your merge path be materially worse without
   this check?*

A "yes" to #3 from an independent maintainer is the single data point that
converts ContinuityOS from same-owner demonstrated dependency into genuine
**external** dependency formation (#2145 / #2173).
