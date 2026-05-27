# Issue #1467 — OpenClaw Behavioral Authority Surface Classification (Governed Envelope v1)

## Intent

Introduce **non-operative topology visibility** for persistent OpenClaw behavioral/cognition-shaping files so mutation to these files is classifiable as governance-relevant evidence.

This artifact is **classification-only** and does not create authority.

## Scope and Non-Scope

### In scope
- Define behavioral authority surface semantics.
- Define deterministic classification taxonomy.
- Define behavioral topology visibility and lineage hash concepts.
- Classify known OpenClaw behavioral surfaces in-repo.

### Out of scope
- Runtime enforcement of cognition lineage.
- Mutation blocking of behavioral files.
- Authority creation from classification.
- Execution path expansion from `/govern`.

## Core Invariants Preserved

- If no valid object exists → nothing happens.
- Proposal ≠ authority.
- Capability ≠ permission.
- Visibility ≠ legitimacy.
- `validated_object == executed_object`.
- No valid continuity lineage → no valid authority → no valid execution.

## Definitions

- **Behavioral authority surface**: A persistent file whose contents can shape an agent's future decision policy or mutation behavior and therefore can influence future execution eligibility indirectly.
- **Cognition-shaping file**: A file that influences planning, interpretation, prioritization, guardrails, or instruction inheritance for an agent/runtime.
- **Indirect execution governance surface**: A non-executable surface that affects whether later executable proposals are generated or selected.
- **Behavioral mutation**: A content change to a behavioral/cognition-shaping file.
- **Future execution eligibility**: The downstream validity/authorization potential of future proposed actions, potentially altered by behavioral mutation.
- **Behavioral topology visibility**: Evidence-level recording that a behavioral mutation-capable surface exists and has a deterministic classification/hash.
- **Behavioral lineage hash**: Deterministic hash over canonicalized surface content for lineage comparison and replay-neutral mutation evidence.
- **Mutation visibility**: The property that mutation-capable behavioral surfaces are classed and observable as governance-relevant topology input.

## Classification Taxonomy

Allowed classifications:
- `BEHAVIORAL_AUTHORITY_SURFACE`
- `COGNITION_SHAPING_SURFACE`
- `TOOL_ROUTING_SURFACE`
- `MEMORY_INHERITANCE_SURFACE`
- `BOOTSTRAP_SURFACE`
- `NON_GOVERNANCE_SURFACE`

Allowed statuses:
- `OBSERVATIONAL`
- `CLASSIFIED`
- `NULL`

## Canonical Behavioral Surface Map (OpenClaw-oriented)

| Surface path pattern | Classification | Governance relevance | Mutation capable | Affects future execution eligibility |
|---|---|---:|---:|---:|
| `**/AGENTS.md` | `BEHAVIORAL_AUTHORITY_SURFACE` | true | true | true |
| `**/SOUL.md` | `COGNITION_SHAPING_SURFACE` | true | true | true |
| `**/TOOLS.md` | `TOOL_ROUTING_SURFACE` | true | true | true |
| `**/HEARTBEAT.md` | `MEMORY_INHERITANCE_SURFACE` | true | true | true |
| `**/BOOTSTRAP.md` | `BOOTSTRAP_SURFACE` | true | true | true |
| `**/memory/**` | `MEMORY_INHERITANCE_SURFACE` | true | true | true |
| any other path | `NON_GOVERNANCE_SURFACE` | false | contextual | false |

## Determinism Requirements

Classification must be deterministic based on:
1. normalized path,
2. fixed pattern precedence,
3. immutable taxonomy literals,
4. deterministic content hash.

## Visibility vs Legitimacy Boundary

Classification means:
- mutation becomes visible,
- lineage can be discussed,
- governance relevance can be recorded.

Classification does **not** mean:
- authority exists,
- execution is permitted,
- policy predicates are satisfied,
- proof exists.

## Final Compression

OpenClaw behavioral files do not execute directly.

If they alter future execution eligibility, they are governance-relevant topology surfaces.

This issue makes those surfaces visible.

It does not make them authoritative.
