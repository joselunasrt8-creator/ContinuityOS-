# MindShift Glossary

## Purpose

This glossary stabilizes canonical terminology for MindShift governance, runtime, documentation, and future agent coordination.

This artifact is non-operative.

It does not create authority, validate objects, execute actions, generate proof, or mutate runtime behavior.

---

## Core Terms

### Authority
Human-originated or registry-recognized permission source that bounds whether an action may become eligible for execution.

Authority is required but not sufficient.

### Legitimacy
The structured condition under which a proposed action is allowed to exist before execution.

Legitimacy is determined by authority, structure, validation, boundary control, proof requirements, and registry continuity.

### ATAO
Agent Tool Action Object.

A pre-execution capture of a proposed agent/tool action before it becomes an exact executable object.

ATAO is proposal structure, not execution authority.

### AEO
Atomic Execution Object.

The exact executable object submitted for deterministic validation.

Canonical fields:
- intent
- scope
- validation
- target
- finality

### Ω Validator
Deterministic validation layer that returns only VALID or NULL for the exact object presented.

### Execution Boundary
The non-bypassable control point immediately before state-changing execution.

### Proof
External or registry-persisted evidence that a validated execution occurred.

No proof means execution is incomplete.

### Registry Persistence
Durable storage of legitimacy state, lineage, proof, replay, and continuity records.

### Replay
Reuse or resurrection of a legitimacy object, nonce, lineage, or execution path outside its permitted semantics.

Replay must fail closed.

### Continuity
Legitimacy lineage across identity, session, authority, validation, execution, and proof.

Continuity is legitimacy persistence, not simple session memory.

### Reconciliation
Observability/governance process that detects drift, lineage gaps, and cross-registry inconsistency.

Reconciliation observes; it does not authorize.

### Provenance
Traceable origin and lineage evidence for code, object, proof, release, or runtime state.

### Sovereignty
Control over root authority surfaces and mutation-capable infrastructure paths.

### Mutation Surface
Any file, route, workflow, credential, registry, API, deployment, or tool path capable of changing state.

### Bypass Path
Any path that can alter state outside the canonical governance chain.

### Exact-Object Discipline
The invariant that the object validated must equal the object executed.

```text
validated_object == executed_object
```

---

## Canonical Boundary

```text
proposal ≠ authority
capability ≠ permission
AI output ≠ execution legitimacy
```
