# ContinuityOS Cooldown Wedge

## Current objective

The active cooldown objective is external dependency formation.

The architecture, execution, and governance proofs are not the current bottleneck. The current bottleneck is whether an unaffiliated maintainer will try, use, adapt, retain, or reject the smallest ContinuityOS dependency surface.

```text
External maintainer trial
→ report-only attribution signal
→ visible PR check result
→ operator feedback
→ retain / adapt / decline
→ dependency-formation evidence
```

## Smallest active wedge

The smallest wedge is not a platform expansion. It is a report-only GitHub gate for agent-authored PR attribution and a governed GitHub issue-comment proof path.

Active execution stack:

| Layer | Current artifact | Status |
|---|---|---|
| Project board | #2210 | Created |
| External operator queue | #2211 | Created |
| WEDGE.md tracker | #2212 | Created |
| Sandbox boundary | #2213 | Created |
| Candidate search lane | #2214 | Created |
| Execution status sync | #2215 | Created |
| In-repo board artifact | #2216 | Created |
| Governed issue-comment wedge | #2207 / #2206 | Active |
| Cooldown dependency work queue | #2205 | Open PR |
| GitHub adapter roadmap | #2208 | Open; bounded by P0 proof |

## Sandbox status

`continuityos-sandbox` is useful proof that ContinuityOS can become load-bearing as a required GitHub check in a separate repository.

It is still same-owner proof. It must not be counted as unaffiliated external operator validation.

Allowed claim:

```text
Self-owned external-repo dependency loop: demonstrated.
```

Disallowed claim until observed outside-owner use:

```text
Unaffiliated maintainer dependency proof: not yet demonstrated.
```

## External operator validation

Currently contacted:

| Repository | Issue | Observed state | Follow-up rule |
|---|---:|---|---|
| `s243a/UnifyWeaver` | #3321 | Open, no comments observed | Wait |
| `JovieInc/Jovie` | #11555 | Open, Linear linkback observed | Wait |
| `jaetill/game-night-pwa` | #231 | Open, local labels applied | Wait |

Do not over-follow-up. Add new candidates only when they are active, relevant, and maintainers accept issues or discussions for workflow/tooling questions.

## GitHub agent wedge demonstration

The active demonstration target is one governed GitHub issue-comment action:

```text
agent proposes issue comment
→ object is validated
→ VALID executes exactly that object
→ NULL executes nothing
→ proof records validated_object_hash == executed_object_hash
```

This remains intentionally narrow. Do not expand into PR creation, labels, reviews, merges, releases, workflow dispatch, or broad GitHub adapter coverage until the one-comment wedge is proven.

## Non-goals

- No new platform theory.
- No broad adapter roadmap execution before the P0 wedge.
- No required blocking default for external operators.
- No app install requirement.
- No secrets requirement.
- No outside-owner dependency claim without outside-owner evidence.

## Current next move

1. Keep #2210 as the live project board.
2. Keep #2211 as the outside-owner validation queue.
3. Complete #2207 / #2206 as the one-action GitHub agent wedge demonstration.
4. Search for 3-5 additional active candidate repos only under the criteria in #2214.
5. Convert only observed external operator signals into dependency evidence.
