# ContinuityOS Dependency Tracker

> Deliverable for [#2145 — External Dependency Formation Tracker](https://github.com/joselunasrt8-creator/ContinuityOS-/issues/2145).
> Single scoreboard for the **one open metric**: an *independent, outside-owner*
> maintainer who installs ContinuityOS and would have a materially worse workflow
> without it.

This file tracks **dependency**, not adoption. A user *trying* ContinuityOS is
adoption. A maintainer who *refuses to remove* it because their workflow degrades
is dependency. Only the second one is recorded as a result here.

---

## Status (as of 2026-06-20)

```text
Architecture proof ............................. COMPLETE
Demonstration proof ............................ COMPLETE
Enforcement proof (same-owner) ................. COMPLETE
Adoption proof (independent) ................... OPEN  (0 outside installs)
Dependency proof (same-owner) .................. COMPLETE
Dependency proof (independent / outside-owner) . OPEN  ← the only open metric
Non-substitutable dependency primitive ......... ABSENT (current model)
```

Matches the cooldown board ([#2173](https://github.com/joselunasrt8-creator/ContinuityOS-/issues/2173)):
`Outside-owner dependency proof: OPEN`, `BLOCKED_ON_OUTSIDE_OPERATOR`.

**Bottleneck:** distribution / trust-boundary, **not** engineering. The wedge and
its install kit are built and proven same-owner; the only missing evidence is one
unaffiliated maintainer answering *"my merge path is worse without it."*

**Primitive finding (evidence, not speculation).** The Primitive Gate research
([#2184](https://github.com/joselunasrt8-creator/ContinuityOS-/issues/2184),
[`PRIMITIVE_GATE_EVALUATION.md`](PRIMITIVE_GATE_EVALUATION.md), merged) returned
`NO_QUALIFYING_PRIMITIVE_EXISTS_UNDER_CURRENT_CONTINUITYOS_MODEL`:

```text
Continuity primitive ... ✓ proven
Dependency primitive ... ✗ absent under the current model
```

This **confirms** the bottleneck rather than relocating it: ContinuityOS has no
continuity guarantee a foreign consumer cannot reproduce, so the path to
independent dependency is adoption across a real trust boundary — not another
architecture-research question. Independent (outside-owner) dependency remains
the unresolved scarce resource.

---

## Success condition

```text
independent maintainer (different owner, repo, trust boundary)
  → installs agent-attribution-gate
  → makes it a required check on their own protected branch
  → an agent-lane PR is blocked for missing attribution, then merges once attributed
  → 30 days later: removing it would make their merge path materially worse
```

A single retained outside "yes" closes **Independent Dependency Proof**.

---

## External user registry

> **Empty by design.** No independent operator has installed ContinuityOS yet.
> The only consumer is `continuityos-sandbox`, which is **same-owner**
> (`joselunasrt8-creator`) and therefore does **not** count toward independent
> dependency. Do not add a row until a real outside maintainer installs. Do not
> fabricate rows.

| # | Owner (≠ joselunasrt8-creator) | Repo | Wedge installed | Required check? | Install date | Retained? | Evidence |
|---|---|---|---|---|---|---|---|
| — | _none yet_ | — | — | — | — | — | — |

---

## Workflow inventory (the dependency under test)

| Wedge | Mechanism | Status |
|---|---|---|
| **Agent Attribution Gate** (primary) | `agent-attribution-gate` workflow consumes `joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard@v0.3.0`, which emits `attribution_classification`; required check passes `AGENT_AUTHORED`, fails `UNKNOWN` (fail-closed) on agent lanes; human PRs pass neutrally | Proven same-owner; **outside-owner OPEN** |
| Merge Guard (identity) | `merge-guard` required check; VALID/NULL on `{repo, pr_number, head_sha, base_sha, actor}` | Proven same-owner; weaker degradation, deprioritized |

Install path (what an outside maintainer copies):
[`actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md`](./actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md)
(start at "Stage 0 — Trial (non-blocking)").

---

## Dependency evidence log

### Same-owner — COMPLETE (does not satisfy independence)

| Evidence | Where | Result |
|---|---|---|
| Attribution gate load-bearing on a single branch (UNKNOWN→blocked, then AGENT_AUTHORED→merged) | `continuityos-sandbox/ATTRIBUTION_DEPENDENCY_PROOF.md` (PR #24) | `ATTRIBUTION_ENFORCEMENT_CONFIRMED` |
| Merge Guard required-check, VALID→mergeable / NULL→blocked | `continuityos-sandbox/EXTERNAL_DEPENDENCY_PROOF.md`, `NULL_ENFORCEMENT_PROOF.md` (PRs #8/#9) | `EXTERNAL_DEPENDENCY_CONFIRMED` |
| Operator chose to retain | `continuityos-sandbox/RETENTION_SIGNAL.md` | `RETAIN` |

> Scope: every row above is **same-owner**. It proves the gate enforces correctly
> and is genuinely load-bearing — it does **not** prove an *independent* maintainer
> adopts and keeps it.

### Independent / outside-owner — OPEN

| Evidence needed | Status |
|---|---|
| Outside repo references `...@v0.3.0` with `agent-attribution-gate` | not yet |
| Outside admin sets it as a required check on their protected branch | not yet |
| Real agent-lane PR blocked for missing attribution on their repo | not yet |
| Same PR merges after attribution added | not yet |
| One-sentence retention answer ("worse without it") | not yet |

---

## Removal counterfactual (the degradation claim being tested)

> With the gate removed, agent-lane PRs can again reach `mergeable` **without** the
> `Agent-Authored-By` signal. The maintainer loses the only native mechanism that
> makes "attributed as agent-authored" part of what "mergeable" means, and silently
> returns to unenforceable manual policing of AI authorship.

This degradation is **real only if the maintainer has an actual disclosure policy**
— which is why outreach targets the maintainers in
[`docs/adoption/agent-attribution-gate-candidates.md`](./docs/adoption/agent-attribution-gate-candidates.md)
who already grapple with AI attribution.

---

## Candidate funnel & outreach

- Qualified candidate shortlist + scoring: [`docs/adoption/agent-attribution-gate-candidates.md`](./docs/adoption/agent-attribution-gate-candidates.md)
- Outside-installation kit / ready-to-send message: [`docs/adoption/agent-attribution-gate-outreach.md`](./docs/adoption/agent-attribution-gate-outreach.md)
- Top verified targets (2026-06-20): `casscoulston/thriving-teams` (highest felt-pain), `s243a/UnifyWeaver` (best mechanism-fit).

**Human-only next actions (not performed by the agent — outreach cannot be automated or faked):**
1. Send the outreach message to the top 1–2 candidates as a public, low-pressure repo issue/DM.
2. Record install / blocked-PR / passed-PR / retention answer back into the candidate table **and** the external-user registry above.

---

## Quarterly dependency assessment

| Quarter | Outside installs | Required-check installs | Retained "yes" | Independent Dependency Proof | Notes |
|---|---|---|---|---|---|
| 2026-Q2 | 0 | 0 | 0 | OPEN | Wedge + kit built and same-owner proven; funnel verified; outreach not yet initiated |

Review cadence: re-assess each quarter (or on the first outside install, whichever
is sooner). The proof is **CLOSED** the first quarter a row exists in the external
user registry with `Retained? = yes`.

---

> **Boundary.** No outreach, installation, dependency proof, or maintainer intent
> is claimed by this commit. This file records candidate *verification* and the
> *open* state of independent dependency only.
