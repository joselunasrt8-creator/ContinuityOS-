# Agent Attribution Gate — Outside-Installation Kit

A ready-to-send brief for converting the proven `agent-attribution-gate` into the
**first independent (outside-owner) installation**. Lead with the pain, not the
architecture. The whole ask is one native GitHub required check; no app, no
secrets, ~5 minutes, reversible.

The install path this points to:
[`actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md`](../../actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md).

---

## Who to approach first

Best first adopter profile:

- Maintains an OSS or small-team repo on GitHub with a **protected `main`**.
- **Already receives AI-generated PRs** — agent-session branches (`claude/*`,
  `codex/*`, `cursor/*`, `devin/*`, `copilot/*`) or bot contributors.
- Relies on **GitHub's native required checks**; does *not* want to run a GitHub
  App, manage secrets, or adopt a new platform.
- Has felt the specific pain: an AI PR that looked operationally normal but
  carried no explicit, auditable statement of who/what authored it.

Skip for now (they'll say it's already covered, or there's no pain yet):

- Large orgs with a heavy existing policy stack (Snyk / Semgrep / merge queue).
- Repos with effectively no AI-generated PRs.

## Lead with the pain (not the mechanism)

> AI agents now open PRs that look operationally normal but carry no explicit,
> auditable declaration that they were agent-authored. You usually find out after
> the merge, if at all. There's no native GitHub control that *requires* an
> agent-lane PR to declare its authorship before it's allowed to merge.

Only after the pain lands: *what it is* is one required status check that enforces
authorship on agent lanes and leaves human PRs completely untouched.

## The ask (small, native, reversible)

One required status check on the protected branch. On an agent-lane branch, a PR
must carry an authoritative `AGENT_AUTHORED` signal (a commit trailer, a label, or
a PR-body block) or it cannot merge. Human PRs pass neutrally. No GitHub App, no
secrets, no new platform. Removing it is a one-click branch-protection change.

## Ready-to-send message (copy / paste, then trim)

> **Subject: a 5-minute native check that makes AI PRs declare authorship before merge**
>
> Hi <name> — you merge AI-generated PRs into a protected `main`. Right now nothing
> on GitHub *requires* an agent-lane PR to state that it was agent-authored before
> it can merge; you find out after the fact, if at all.
>
> There's a tiny, native fix: one required status check. On agent-lane branches
> (`claude/*`, `codex/*`, …) a PR must be attributed `AGENT_AUTHORED` — via a commit
> trailer, a label, or a PR-body block — or it's blocked. Ordinary human PRs are
> never touched. No GitHub App, no secrets, ~5 minutes, and it's a one-click revert
> if you don't like it.
>
> 5-minute install: <link to ADOPT_AGENT_ATTRIBUTION_GATE.md>
>
> If you try it, I'd love to know one thing afterward: would your merge path be
> worse without it? That's the only feedback I'm after.

(Works as a DM, an email, or a GitHub issue body. Replace `<name>` and `<link>`.)

## What to ask them to report back (this is the evidence we're collecting)

The point of the first outside install is **retention evidence**, not another
demo. Ask for exactly three things:

1. One agent-lane PR that was **blocked** for missing attribution (the gate
   worked).
2. One agent-lane PR that **passed** after adding the signal.
3. One sentence: *would your merge path be materially worse without this check?*

A "yes" to #3 from an independent maintainer is the single data point that
converts ContinuityOS from same-owner demonstrated dependency into genuine
**external** dependency formation.

## Proof to show if they want evidence first

Point skeptics at the reference deployment — the gate is already a required check
on an independent consumer repo, with both outcomes proven on a live PR:

- Adoption guide (what they'd copy):
  [`ADOPT_AGENT_ATTRIBUTION_GATE.md`](../../actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md)
- Copy-paste workflow:
  [`examples/continuity-agent-attribution-gate.yml`](../../actions/continuity-merge-guard/examples/continuity-agent-attribution-gate.yml)
- Load-bearing proof (counterfactual on one PR, required-check enforced):
  `continuityos-sandbox` → `ATTRIBUTION_DEPENDENCY_PROOF.md`.

## Honest scope (don't oversell)

Everything proven so far is **same-owner**: it shows the gate enforces correctly
and is genuinely load-bearing. It does **not** yet show that an *independent*
maintainer installs and keeps it. That ownership-boundary crossing — one outside
repo, retained because removing the check would make its workflow worse — is the
single open question this kit exists to close.
