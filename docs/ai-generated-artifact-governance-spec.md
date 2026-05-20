# AI-Generated Simulation Artifact Governance Spec

## Status

Canonical governance specification.

This document is non-executing and non-deploying.

## Purpose

Define the governance boundary for AI-generated simulation/content artifacts (including USD, materials, physics assignments, generated textures, and synthetic "simulation-ready" objects).

Core invariants:

- Generated artifact != validated artifact.
- Visual plausibility != physical legitimacy.
- SimReady label != proof.
- Capability != authority.
- If no valid object exists -> nothing happens.

## Scope

Applies to all AI-generated or AI-modified artifact objects intended for downstream use in:

- robotics
- digital twins
- synthetic data pipelines
- physical AI and simulation workflows

This spec governs object state transitions and legitimacy boundaries only.

This spec does **not** implement simulation validators or execution engines.

## Canonical Path

All state-changing artifact transitions must follow the canonical path:

```text
/authority -> /compile -> /validate -> /execute -> /proof
```

No alternate execution path is allowed.

## 1) Artifact Classification Boundary

All AI-generated USD/material/physics outputs are **proposal objects only**.

Proposal objects are non-authoritative and non-executable until all downstream eligibility gates pass.

Proposal state must never be auto-promoted to trusted operational state.

## 2) Downstream Eligibility Gates

An AI-generated proposal artifact is eligible for downstream use only when all of the following are true:

1. **Authority bound**: explicit authority binding exists for the specific target object.
2. **Exact-object compile**: the compiled object identity is deterministic and hash-addressable.
3. **Deterministic validation**: validation is executed against the exact object intended for downstream use.
4. **Execution integrity**: executed object equals validated object.
5. **Proof persistence**: proof is generated and durably persisted before registry acceptance.
6. **Registry persistence**: append-only registry write succeeds for the proof/object linkage.
7. **Replay/idempotency check**: authority and object replay protections are satisfied.

If any gate fails or is missing, result is deterministic fail-closed (`NULL`, `INVALID`, `BLOCKED`, or `QUARANTINED`).

## 3) Authority Binding Requirement

No proposal object may be validated or executed without explicit authority binding.

Authority must be bound to:

- object identity/hash
- allowed scope/intended downstream target
- one-time or replay-governed usage semantics

Implicit authority, inferred authority, or UI confidence cannot satisfy this requirement.

## 4) Deterministic Validation Requirement

Validation must run on the exact object (hash identity) intended for downstream use.

Validation on previews, near-equivalent variants, or post-hoc transformed derivatives is non-compliant.

Any object mutation after validation invalidates legitimacy and requires re-entry at `/compile` then `/validate`.

## 5) Proof Persistence and Registry Acceptance

Proof is mandatory prior to registry acceptance.

Registry acceptance requires persisted proof that binds:

- authority
- compiled/validated object hash
- executed object hash
- validation decision/outcome
- execution event identity

Registry writes must remain append-only and replay-neutral.

No object may be treated as accepted if proof persistence or registry persistence is absent.

## 6) Provenance, Hashing, and Lineage

All governed artifacts must support provenance and deterministic identity tracking.

Minimum provenance set:

- proposal source lineage (agent/run/reference)
- canonical object hash
- authority binding id
- validation record id
- execution record id
- proof record id

Lineage mismatch, hash mismatch, or unresolved provenance must fail closed.

## 7) Replay and Idempotency Semantics

Used authority, reused execution object, or replayed proof artifacts must be blocked under policy.

Idempotent retries may only succeed when they reference the same immutable canonical object and produce non-divergent governed outcomes.

Any replay ambiguity returns deterministic non-success (`NULL`, `BLOCKED`, or `QUARANTINED`).

## 8) Explicit Non-Proof Sources

The following are explicitly forbidden as legitimacy proof:

- rendered preview images/video
- agent confidence statements
- "SimReady" labels
- generated metadata claims without governed validation/proof linkage
- observability output alone

Observability evidence is non-authoritative and cannot bootstrap mutation or execution.

## 9) Exact-Object Equivalence Requirement

Validated object must equal executed object and persisted object.

```text
validated_object == executed_object == proof_bound_object == persisted_registry_object
```

If equivalence cannot be established deterministically, the system must fail closed to `NULL`.

## 10) Null Cases (Mandatory Fail-Closed)

Return deterministic non-success and prevent downstream state change when any condition occurs:

- missing authority binding
- missing deterministic compile/hash identity
- validation absent, indeterminate, or non-exact-object
- execution requested before `VALID`
- proof missing, invalid, or unpersisted
- registry persistence missing or non-append-only
- replay detected or idempotency violation
- object/proof hash mismatch
- lineage/provenance mismatch

No bypass, fallback execution, or silent promotion is allowed.

## 11) Runtime and Deployment Constraints

This governance spec introduces no new runtime execution surfaces.

- No runtime execution changes.
- No deployment changes.
- No bypass paths.

Any implementation that weakens canonical routing or fail-closed behavior is non-compliant.

## 12) Compliance Statement

Compliant systems MUST preserve:

- proposal != authority
- proposal != execution
- SimReady != proof
- canonical path only: `/authority -> /compile -> /validate -> /execute -> /proof`
- deterministic fail-closed semantics when governance prerequisites are absent
- prevention of silent trust escalation for AI-generated artifacts
