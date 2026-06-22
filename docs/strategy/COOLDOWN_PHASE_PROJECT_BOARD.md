# Cooldown Phase Project Board

## Current objective

Track cooldown-phase priorities, dependencies, and execution status around one bottleneck:

```text
External dependency formation
```

The work is not to add new architecture. The work is to convert a small, understandable ContinuityOS check into an outside-owner operator trial.

## Board

| Priority | Lane | Item | Status | Dependency | Next action |
|---:|---|---|---|---|---|
| P0 | Board control | #2210 Cooldown Phase Project Board | Created | None | Use as live issue board |
| P0 | External validation | #2211 Operator validation queue | Created | External maintainer response | Wait; no over-follow-up |
| P0 | Public wedge map | #2212 WEDGE.md | In PR | Board docs branch | Review and land |
| P0 | Evidence boundary | #2213 Sandbox boundary | Created | Existing sandbox proof | Keep same-owner proof separated |
| P0 | GitHub agent wedge | #2207 / #2206 governed issue comment | Active | One-action proof implementation | Finish 5-minute visible demo |
| P1 | Candidate expansion | #2214 candidate search lane | Created | Fresh repo qualification | Find 3-5 more active candidates |
| P1 | Status sync | #2215 execution status sync | Created | Board updates | Update after material changes |
| P1 | In-repo board | #2216 project board docs artifact | In PR | This file | Review and land |
| P1 | Cooldown work queue | #2205 cooldown dependency work queue | Open PR | Docs review | Land or reconcile with this board |
| P1 | GitHub adapter roadmap | #2208 GitHub Adapter Roadmap | Open | #2207 completion | Keep roadmap parked until P0 proof |
| P2 | Research lanes | #2203 / #2204 / #2209 | Parked | P0 dependency proof | Preserve context only |

## Dependency graph

```text
WEDGE.md
→ 5-minute demo surface
→ external maintainer trial
→ operator feedback
→ retain / adapt / decline signal
→ dependency-formation evidence
```

Parallel guardrail:

```text
continuityos-sandbox evidence
→ technical feasibility proof
→ same-owner boundary preserved
→ no outside-owner claim until external signal exists
```

## External operator validation status

| Repository | Contact issue | Observed state | Board state |
|---|---:|---|---|
| `s243a/UnifyWeaver` | #3321 | Open, no comments observed | Waiting |
| `JovieInc/Jovie` | #11555 | Open, Linear linkback observed | Routed / waiting |
| `jaetill/game-night-pwa` | #231 | Open, local labels applied | Waiting |

## Signal taxonomy

| Signal | Meaning | Dependency claim |
|---|---|---|
| `NO_RESPONSE` | No maintainer answer | No claim |
| `DECLINE` | Maintainer rejects trial or explains mismatch | Feedback only |
| `TRY` | Maintainer runs the gate once | External trial started |
| `ADAPT` | Maintainer changes workflow/install path | External fit/friction signal |
| `RETAIN` | Maintainer keeps it after trial | Dependency-formation signal |

## Execution order

1. Keep the board current.
2. Land `WEDGE.md` and this board artifact.
3. Complete the governed issue-comment wedge (#2207 / #2206).
4. Wait on contacted external maintainers without repeated nudges.
5. Search and qualify 3-5 more candidates only under #2214 criteria.
6. Convert only observed outside-owner signals into dependency evidence.

## Update rules

- Update this file or #2210 only after material state changes.
- Do not count self-owned sandbox evidence as unaffiliated validation.
- Do not move roadmap work ahead of the one-action GitHub wedge.
- Do not expand the external ask beyond report-only, no app, no secrets, reversible.
- Do not infer dependency proof from silence.
