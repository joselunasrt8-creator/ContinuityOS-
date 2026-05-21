# Passive Legitimacy Topology Classification Map

Issue: #855  
Classification: **NON_OPERATIVE**, **TOPOLOGY_ONLY**, **OBSERVABILITY_ONLY**, **NO_RUNTIME_MUTATION**

## Scope and Runtime Boundary

This document defines a **passive** topology classification model for legitimacy observability.
It does **not** introduce authority, execution semantics, mutation paths, or validator behavior.

Boundaries preserved:

- No runtime mutation.
- No route changes.
- No validator/execution/proof/replay behavior changes.
- No authority synthesis.
- No graph-driven execution semantics.
- Derived topology remains non-authoritative.

If runtime change appears necessary for any topology concern, the required system response is:

`NULL`

---

## 1) Authoritative Registries

Authoritative registries are append-only system-of-record surfaces that can establish canonical legitimacy facts.
They are write-restricted to canonical mutation flow and are not inferable from observability graphs.

### Definition

A registry is **authoritative** only when all are true:

1. Record provenance is bound to canonical state-changing flow.
2. Record identity is deterministic and immutable post-write.
3. Record validity is constrained by validator and policy gates.
4. Record persistence semantics are append-only (or equivalent immutability discipline).

### Classification rule

- Authoritative registries are **source truth**.
- Everything else in this document is downstream or evidence-only unless explicitly marked authoritative.

---

## 2) Derived-Only Projections

Derived-only projections are materialized or computed topology views created from authoritative records.
They are strictly observability artifacts.

### Constraints

- Cannot grant authority.
- Cannot authorize execution.
- Cannot mutate canonical objects.
- Cannot alter replay state.
- Cannot substitute for validator outcomes.

### Classification rule

- Derived projections are always **non-authoritative**.
- Any discrepancy between projection and registry resolves in favor of registry.

---

## 3) Authoritative Lineage Edges

Authoritative lineage edges represent immutable, canonical parent-child or predecessor-successor relationships between authoritative objects.

### Required properties

- Edge endpoints are authoritative objects.
- Edge creation is bound to canonical state-changing flow.
- Edge identity is deterministic and reproducible.
- Edge cannot be retroactively reinterpreted by derived graphs.

### Classification rule

- These edges may be used for legitimacy traceability.
- They are not independent authority sources; they inherit authority from endpoint objects and canonical write path.

---

## 4) Evidence-Only Relationships

Evidence-only relationships are non-authoritative links used for explanation, diagnostics, correlation, and observability.

### Examples (class category examples)

- Temporal adjacency correlations.
- Similarity/candidate relationship hints.
- Projection-layer inferred links.
- Analyst or telemetry annotations.

### Classification rule

- Evidence-only relationships are never execution-permissive.
- They cannot upgrade proposal/capability into authority.
- They remain replay-neutral and mutation-incapable.

---

## 5) Replay Topology

Replay topology models reuse risk and consumption state relationships for authority-bound artifacts.

### Purpose

- Surface whether objects/authorizations appear linked to previously consumed execution surfaces.
- Provide observability for replay-resistance posture.

### Non-authoritative boundary

- Replay topology visualizations do not enforce runtime decisions directly.
- Enforcement remains in canonical policy/validation/execute flow.

### Classification rule

- Topology output is evidence.
- Canonical runtime checks remain sole decision authority.

---

## 6) Proof Topology

Proof topology maps proof-of-transfer/proof persistence chains and adjacency between execution and proof objects.

### Purpose

- Show proof coverage and continuity visibility.
- Detect missing-link observability conditions.

### Non-authoritative boundary

- Proof topology does not create or amend proof records.
- Topology absence/presence alone does not authorize execution.

### Classification rule

- Proof topology is observability-only.
- Authoritative proof facts remain in canonical persisted proof records.

---

## 7) Continuity Topology

Continuity topology represents sequence coherence across session/continuity/authority/compile/validate/execute/proof evidence.

### Purpose

- Reveal continuity gaps, forks, dead-ends, or unresolved branches for analysis.
- Support deterministic operational diagnostics.

### Non-authoritative boundary

- Continuity topology cannot resolve gaps by mutation.
- Runtime continuity decisions remain fail-closed and canonical.

### Classification rule

- Continuity graphs inform; they do not execute.

---

## 8) Dependency Topology

Dependency topology models prerequisite relations between objects, validations, policies, and proofs as observed from authoritative records.

### Purpose

- Explain which preconditions were required or observed.
- Surface blocked chains for diagnostics.

### Non-authoritative boundary

- Dependency maps cannot inject missing prerequisites.
- Missing dependency resolution through topology alone is invalid.

### Classification rule

- Dependency topology is explanatory and non-mutating.
- Authoritative prerequisite satisfaction is determined only by canonical runtime.

---

## 9) Topology Drift Categories

Drift categories classify mismatch between topology views and authoritative registry state.
They are diagnostic labels, not runtime authority.

1. **Projection Lag Drift**  
   Derived projection is stale relative to authoritative append state.

2. **Projection Omission Drift**  
   Authoritative object/edge exists but is absent from a derived view.

3. **Projection Surplus Drift**  
   Derived view contains a relationship unsupported by authoritative lineage.

4. **Evidence Inflation Drift**  
   Evidence-only relationship is misread as authoritative.

5. **Lineage Divergence Drift**  
   Competing lineage interpretation appears in derived views while authoritative lineage remains singular.

6. **Temporal Ordering Drift**  
   Topology ordering disagrees with canonical deterministic ordering semantics.

7. **Replay Visibility Drift**  
   Replay-relevant state exists authoritatively but is not visible in replay topology view.

8. **Proof Visibility Drift**  
   Persisted proof exists but proof topology rendering is incomplete or delayed.

### Classification rule

- Drift categories drive observability remediation, not runtime mutation.
- Canonical runtime behavior remains deterministic and fail-closed independent of drift labeling.

---

## 10) Freshness Visibility Categories

Freshness visibility categories communicate confidence in projection recency versus authoritative state.
They are display semantics only.

1. **FRESH**  
   Projection is aligned with latest known authoritative watermark.

2. **RECENT**  
   Projection is near-current within accepted lag tolerance.

3. **STALE**  
   Projection is outside tolerance and may omit recent authoritative changes.

4. **UNKNOWN**  
   Freshness cannot be determined due to missing watermark/comparison basis.

5. **DEGRADED**  
   Partial freshness signals available; confidence reduced.

### Classification rule

- Freshness categories do not modify authority.
- Staleness never implies permission to synthesize authority.

---

## Deterministic Governance Invariants Preserved

This classification map preserves:

- Observability ≠ authority.
- Capability/proposal ≠ execution permission.
- Derived topology remains non-authoritative.
- Replay/proof/continuity semantics remain runtime-governed in canonical path.
- Fail-closed behavior remains unchanged (`NULL` on invalid/insufficient conditions).

Canonical execution sequence remains:

`/authority → /compile → /validate → /execute → /proof`

No topology class in this document can bypass or collapse this sequence.
