# MindShift External Positioning Compression

## Canonical external positioning

MindShift is execution legitimacy infrastructure for AI-assisted systems.

This statement is the canonical public entry point. All other language is secondary and must not replace it in public-facing summaries.

## Primary execution gate

Execution is permitted only when all four conditions hold:

```text
VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID
```

Otherwise the runtime returns deterministic fail-closed outcomes (`NULL`, `INVALID`, `BLOCKED`, or `QUARANTINED`) and does not execute.

## 1) Terminology drift inventory

The following terms are valid in internal governance and runtime analysis, but drift in external positioning when used as front-door language:

| Drift-prone term | Current pattern | External risk | Compression directive |
| --- | --- | --- | --- |
| sovereignty | used across runtime/infrastructure boundary narratives | reads as abstract political framing instead of execution control | keep for internal boundary accounting; externally translate to "execution boundary control" |
| federation | used for cross-runtime observability and reconciliation evidence | reads like multi-party protocol speculation | keep for internal observability/evidence semantics; externally translate to "remote evidence comparison" |
| recursive governance | used in closure/fate/topology docs | reads as conceptual recursion over operations | keep for internal verification depth; externally translate to "layered legitimacy checks" |
| constitutional runtime | appears in architecture/positioning descriptions | reads as metaphor-heavy branding | replace externally with "deterministic execution legitimacy runtime" |
| orchestration consensus | used in distributed/reconciliation language | reads as coordination theory rather than runtime guarantee | keep internally for drift-class taxonomy; externally translate to "consensus evidence" |
| topology reconciliation | used in control-graph and reconciliation material | reads as graph-theory-heavy abstraction | keep internally for deterministic topology verification; externally translate to "state consistency checks" |

## 2) Duplicate ontology inventory

These duplicate framing pairs describe similar outcomes and should be compressed for public language:

| Duplicate ontology cluster | Public canonical term |
| --- | --- |
| "execution ontology infrastructure", "constitutional runtime", "governance runtime" | execution legitimacy infrastructure |
| "authority integrity", "authority binding", "authorization discipline" | AUTHORIZED gate |
| "replay resistance", "replay neutrality", "replay containment" | UNUSED gate |
| "policy conformance", "scope policy", "governance policy validation" | POLICY_VALID gate |
| "deterministic validation", "legitimacy verification", "validation boundary" | VALID gate |
| "federated reconciliation", "distributed legitimacy comparison", "topology reconciliation" | remote evidence comparison (observability only) |

## 3) Simplified public language proposal

Use the following template in README intros, architecture summaries, diagrams, and onboarding:

1. **What MindShift is**: "MindShift is execution legitimacy infrastructure for AI-assisted systems."
2. **What it does**: "It prevents state change unless execution legitimacy passes."
3. **How it decides**: "Execution only proceeds when `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID`."
4. **What happens on failure**: "If any condition fails, execution is blocked with deterministic fail-closed evidence."
5. **What is secondary**: "Topology, federation, and reconciliation are internal observability/evidence systems, not execution authority."

## 4) Canonical external positioning guide

### One-line
MindShift is execution legitimacy infrastructure for AI-assisted systems.

### Three-line
MindShift gates state-changing execution.
Execution is allowed only when `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID`.
If no valid object exists, nothing happens.

### Public vocabulary allowlist
- execution legitimacy
- deterministic validation
- authorization
- replay prevention
- policy validation
- proof persistence
- fail-closed execution boundary

### Public vocabulary avoidlist (unless technical deep-dive)
- sovereignty
- federation
- recursive governance
- constitutional runtime
- orchestration consensus
- topology reconciliation

## 5) Internal-only terminology separation

Internal terminology is retained for rigor, but should be explicitly marked as **internal governance vocabulary** in docs.

| Internal-only term | Keep internally for | Public translation |
| --- | --- | --- |
| sovereignty | infrastructure and authority boundary accounting | execution boundary control |
| federation | cross-runtime evidence exchange constraints | remote evidence comparison |
| recursive governance | depth/closure verification semantics | layered legitimacy checks |
| topology reconciliation | deterministic graph/state consistency checks | state consistency checks |
| orchestration consensus | distributed conformance and drift detection | consensus evidence |

## Enforcement notes

- Preserve canonical invariants: `validated_object == executed_object`.
- Preserve execution boundary semantics: no authority from observability, no GET mutation surfaces, no bypass routes.
- Preserve fail-closed runtime behavior: invalid state never executes.
- Compression applies to **public narrative**, not to runtime enforcement logic or test-bound canonical terminology.
