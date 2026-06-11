# Canonical AEO & Identity Anchor Specification

**Issue:** #1691
**Repository:** joselunasrt8-creator/ContinuityOS-
**Branch:** claude/session-1691-ANOHu
**Date:** 2026-06-01
**Mode:** Non-operative. Derived exclusively from existing repository state.

---

## Purpose

This document defines the canonical execution object and identity model required for Phase 3 execution governance.

All Phase 3 downstream primitives — authority binding, validator determinism, replay containment, proof generation, and reconciliation — depend on the stable identity anchor defined here.

---

## 1. Canonical AEO Schema

The Canonical AEO (Authorized Execution Object) is a five-field frozen record. No additional fields are permitted. Any object that does not conform exactly returns NULL.

### Schema

```
CanonicalAEO {
  intent:     string (non-empty)
  scope:      object (key-value record)
  validation: object (key-value record)
  target:     object (key-value record)
  finality:   object (key-value record)
}
```

### Field Constraints

| Field | Type | Constraint |
|---|---|---|
| `intent` | string | Non-empty. Derived from `authority.intent`. Not from request body. |
| `scope` | object | Derived from `authority.scope`. Not from request body. |
| `validation` | object | Must contain `workflow: GOVERNED_WORKFLOW`. Constrained, not caller-supplied. |
| `target` | object | Derived from `authority.constraints` via `canonicalDeployTarget`. Must contain `repo`, `branch`, `workflow`. |
| `finality` | object | Must contain `proof_required: true`. |

### Additional Properties

`additionalProperties: false` — enforced at construction. Extra fields return NULL.

### Field Count Invariant

`Object.keys(canonical_aeo).length === 5`

Any object with fewer or more fields is rejected as NULL.

### Schema Reference

```
schemas/aeo.schema.json
schemas/json/continuityos/v1/aeo.schema.json
runtime/legitimacy/schemas/AEO.schema.json
```

---

## 2. ATAO → AEO Transformation Contract

### Transformation Chain

```
ATAO
  → [authority creation]
  → Authority (bound to session, continuity, constraints)
  → [/compile route]
  → Canonical AEO
  → [sha256(canonicalize(aeo))]
  → Identity Anchor (validated_object_hash)
```

### ATAO Fields Used

| ATAO Field | AEO Field | Transformation |
|---|---|---|
| `intent` | `intent` | Direct via `authority.intent` |
| `scope` | `scope` | Direct via `authority.scope` (parsed JSON) |
| `proposed_action.system` | — | Referenced in `authority.constraints` → `target.repo`, `target.branch` |
| `proposed_action.action` | — | Referenced in `authority.constraints` → `target.workflow` |

### Constrained AEO Fields (not derived from ATAO)

| AEO Field | Source | Reason |
|---|---|---|
| `validation.workflow` | `GOVERNED_WORKFLOW` constant | Caller cannot override execution surface |
| `target.workflow` | `GOVERNED_WORKFLOW` constant | Workflow must equal `governed-deploy.yml` |
| `finality.proof_required` | `true` (constant) | Proof is unconditionally required |

### Compile Route AEO Construction

```typescript
const canonical_aeo = toCanonicalAeo({
  intent:     authority.intent,
  scope:      JSON.parse(String(authority.scope || "{}")),
  validation: { workflow: GOVERNED_WORKFLOW },
  target:     canonicalDeployTarget(constraints),
  finality:   { proof_required: true }
})
```

Source: `src/index.ts:7852`

### Rejection Conditions

- `authority` missing or not ACTIVE → NULL
- `authority.expiry` exceeded → NULL
- `target.workflow !== GOVERNED_WORKFLOW` → NULL
- `toCanonicalAeo` returns null (missing field, extra field, empty intent) → NULL
- Authority CONSUMED → NULL
- Authority REVOKED → NULL

---

## 3. Canonical Serialization Rules

### Algorithm

Deterministic JSON serialization with recursively sorted keys.

```
canonicalize(v):
  if v is array:
    return "[" + v.map(canonicalize).join(",") + "]"
  if v is plain object:
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}"
  return JSON.stringify(v)
```

Source: `src/index.ts:1162-1167`

### Properties

- **Deterministic**: field insertion order is irrelevant; output is always identical for equal values
- **Key-sorted**: all object keys are sorted lexicographically at every nesting level
- **Type-preserving**: null, boolean, number, string are serialized via `JSON.stringify`
- **Recursive**: applied uniformly to all nested objects and arrays

### Normalization

Before canonicalization, values are normalized:
- `undefined` → `null`
- `NaN`, `Infinity`, `-Infinity` → `null`
- Nested objects: recursively normalized
- Non-plain objects (class instances, functions) → `null`

Source: `src/canonical.js`, `src/index.ts:1100-1158`

### Canonical Serialization Contract

Given two AEO objects `A` and `B`:

```
A.intent === B.intent
  AND deep_equal(A.scope, B.scope)
  AND deep_equal(A.validation, B.validation)
  AND deep_equal(A.target, B.target)
  AND deep_equal(A.finality, B.finality)
  → canonicalize(A) === canonicalize(B)
```

Any field difference, including nested key differences, produces a different serialization.

---

## 4. Identity Anchor Generation

### Definition

```
identity(aeo) = SHA-256(canonicalize(aeo))
```

This value is stored as `validated_object_hash` and serves as the stable execution identity across all governance stages.

### Generation Procedure

```
1. Construct canonical_aeo via toCanonicalAeo(...)
2. Serialize: canonical_aeo_json = canonicalize(canonical_aeo)
3. Hash: validated_object_hash = SHA-256(canonical_aeo_json)
4. Store in aeo_registry.validated_object_hash
```

Source: `src/index.ts:7854-7855`

### Identity Anchor Properties

| Property | Value |
|---|---|
| Algorithm | SHA-256 |
| Input | `canonicalize(canonical_aeo)` |
| Output | 64-character hex string |
| Stability | Immutable after AEO creation |
| Uniqueness | Derived from content; equal AEOs produce equal anchors |
| Collision resistance | SHA-256 preimage resistance |

### Cross-Stage Identity Invariant

```
identity(validated_object) == identity(executed_object) == identity(proven_object) == identity(reconciled_object)
```

This is enforced by using `validated_object_hash` as the primary lookup key at every governance stage:

- `/validate`: looks up `aeo_registry WHERE decision_id=? AND validated_object_hash=?`
- `/execute`: looks up `aeo_registry WHERE decision_id=? AND validated_object_hash=?`
- `/proof`: looks up `aeo_registry WHERE decision_id=? AND validated_object_hash=?`
- reconciliation closure: `deterministic_reconciliation_anchor` is derived from `validated_object_hash`

Any drift between stages — any mutation that produces a different hash — causes a lookup failure and returns NULL.

---

## 5. Mutation Invariant

### Statement

An AEO is immutable after identity anchor generation.

```
mutation_capable = false
```

### Formal Invariant

```
∀ aeo, field f, value v:
  mutate(aeo, f, v) → identity(mutated_aeo) ≠ identity(aeo)
```

Any change to any field of the canonical AEO changes the SHA-256 hash, producing a different `validated_object_hash`. The mutated object will not be found in the registry under the original `validated_object_hash` and execution returns NULL.

### Enforcement

- AEO stored as frozen object in memory: `Object.freeze({ intent, scope, validation, target, finality })`
- AEO stored as serialized canonical JSON in `aeo_registry.canonical_aeo`
- Hash recomputed and compared at validation: `recomputedHash !== storedHash → NULL`
- Hash compared at execution: `compiled.validated_object_hash` must equal the hash presented in the request

### Conflict Detection

If multiple AEO rows exist for the same `decision_id` with differing `validated_object_hash` or `canonical_aeo`, the compile route rejects with `compiled_aeo_hash_mismatch`.

Source: `src/index.ts:7841-7844`

---

## 6. Authority Binding Target

### Binding Model

The authority object binds to the AEO identity via `decision_id` and `validated_object_hash`.

```
authority_registry.decision_id
  → aeo_registry.decision_id
  → aeo_registry.validated_object_hash (identity anchor)
```

### Authority Binding Fields

| Field | Purpose |
|---|---|
| `authority_registry.decision_id` | Primary linkage from authority to AEO |
| `authority_registry.authority_id` | AEO references back via `aeo_registry.authority_id` |
| `authority_registry.governed_tool_envelope_id` | Governed envelope binding |
| `aeo_registry.validated_object_hash` | Stable identity of the AEO bound to this authority |

### Authority Binding Contract

An authority is valid for execution if and only if:
- `authority_registry.status = 'ACTIVE'`
- `authority_registry.expiry` has not elapsed
- `aeo_registry` contains exactly one row for `decision_id` with `status = 'COMPILED'`
- `aeo_registry.validated_object_hash` equals the hash of the current canonical AEO content

An authority object without a compiled AEO cannot proceed to validation or execution.

---

## 7. Ω Validator Target

### Definition

The Ω Validator operates on the **canonical AEO identified by `(decision_id, validated_object_hash)`**.

The validator subject is not the request payload, not the authority record, and not the ATAO. It is the frozen canonical AEO stored in `aeo_registry.canonical_aeo`.

### Validator Lookup

```sql
SELECT canonical_aeo, validated_object_hash, status
FROM aeo_registry
WHERE decision_id = ?
  AND validated_object_hash = ?
  AND status = 'COMPILED'
```

Source: `src/index.ts:8005` (validate route)

### Validator Determinism Contract

- The validator is stateless with respect to the AEO: given the same `(decision_id, validated_object_hash)`, the validator must produce the same result
- The validator may consult external state (session, continuity, authority) but must not modify the AEO
- The canonical AEO is re-parsed from its stored JSON and re-validated via `toCanonicalAeo`
- The stored hash is recomputed from the re-parsed AEO and compared to the stored hash before validation proceeds

### Validation Output

```
VALID   — AEO identity confirmed, authority active, hash matches, constraints satisfied
NULL    — any failure, including hash mismatch, expired authority, invalid structure
```

The validator never produces partial authorization states.

---

## 8. Replay Target

### Definition

The replay target is the triple `(decision_id, validated_object_hash, invocation_nonce)` stored in `invocation_registry`.

### Single-Use Enforcement

```sql
CREATE TABLE invocation_registry (
  decision_id           TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce      TEXT NOT NULL,
  status                TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  continuity_id         TEXT,
  PRIMARY KEY (decision_id, validated_object_hash, invocation_nonce)
)
CREATE UNIQUE INDEX idx_invocation_registry_nonce_once
  ON invocation_registry(decision_id, validated_object_hash, invocation_nonce)
```

Source: `src/index.ts:1461-1462`

### Replay Invariant

A given `(decision_id, validated_object_hash, invocation_nonce)` triple may be consumed at most once. Attempting to replay an already-consumed invocation returns NULL.

### Replay Identity Semantics

The replay target is anchored to the AEO identity anchor (`validated_object_hash`). An AEO mutation produces a different `validated_object_hash`, which produces a different replay slot. The original nonce cannot be replayed against the mutated object.

---

## 9. Proof Target

### Definition

The proof target is the canonical AEO identified by `(decision_id, validated_object_hash)` at the time execution completed.

### Proof Binding

The proof record binds to the AEO identity anchor via:

```sql
proof_registry.decision_id             = aeo_registry.decision_id
proof_registry.validated_object_hash   = aeo_registry.validated_object_hash
```

The proof is generated only after successful execution and only for the specific `(decision_id, validated_object_hash)` pair. Proof generation without successful validation is not permitted.

### Proof AEO Lookup

```sql
SELECT canonical_aeo, validated_object_hash, status
FROM aeo_registry
WHERE decision_id = ?
  AND validated_object_hash = ?
  AND status = 'COMPILED'
```

Source: `src/index.ts:8275` (proof route)

### Proof Identity Invariant

```
proof_registry.validated_object_hash === aeo_registry.validated_object_hash
  === execution_registry.validated_object_hash
  === validation_registry.validated_object_hash
```

All four registries bind to the same `validated_object_hash`. A proof that references a different hash than the executed object represents a proof drift violation.

### Proof Lineage Binding

```
proof_registry.lineage_origin_hash  = canonicalLineageHash({ stage: "proof", decision_id, validated_object_hash, parent_hash: execution_hash })
```

This creates a cryptographic chain: compile → validate → execute → proof, each stage linking to the same `validated_object_hash`.

---

## 10. Reconciliation Identity Anchor

### Definition

The reconciliation identity anchor is derived from `validated_object_hash` as part of the `deterministic_reconciliation_anchor` computed during reconciliation closure.

### Anchor Construction

The `deterministic_reconciliation_anchor` incorporates the AEO identity through the lineage graph, which traces from compile through proof via `validated_object_hash` at each stage.

```
deterministic_reconciliation_anchor = sha256(canonicalize({
  ...reconciliation_graph_inputs,
  // lineage chain includes validated_object_hash at each stage
}))
```

Source: `src/index.ts:2319-2325`

### Reconciliation Identity Semantics

The reconciliation closure can only reach `RECONCILIATION_EQUIVALENT` if:
- The same `validated_object_hash` appears in compile, validate, execute, and proof stages
- No hash drift is detected between stages
- The `deterministic_reconciliation_anchor` is stable across reconciliation runs

If `validated_object_hash` drifts between stages, the reconciliation engine records `federated_exact_object_drift` and the closure returns `RECONCILIATION_DRIFT`.

### Recursive Checkpoint Identity

```
recursive_checkpoint_identity = sha256(canonicalize({
  deterministic_reconciliation_anchor,
  lineage_depth,
  recursive_lineage_depth_evidence
}))
```

This provides a stable, content-addressed identity for each reconciliation closure that can be used as an anchor across federated reconciliation.

---

## Summary: Identity Propagation Chain

```
ATAO
  └─ intent, scope, proposed_action
       ↓
Authority (authority_registry)
  └─ intent, scope, constraints, session_id, continuity_id
       ↓
Canonical AEO (aeo_registry.canonical_aeo)
  └─ { intent, scope, validation, target, finality }
       ↓
Identity Anchor = SHA-256(canonicalize(canonical_aeo))
  = validated_object_hash
       ↓ (same anchor at every stage)
  ├─ Validation:    validation_registry.validated_object_hash
  ├─ Execution:     execution_registry.validated_object_hash
  ├─ Proof:         proof_registry.validated_object_hash
  └─ Reconciliation: deterministic_reconciliation_anchor (lineage includes validated_object_hash)
```

---

## Target Invariant

```
identity(validated_object) == identity(executed_object) == identity(proven_object) == identity(reconciled_object)
```

This invariant is representable and enforced through:
1. A single `validated_object_hash` computed at compile and stored in `aeo_registry`
2. All subsequent operations look up the AEO by `(decision_id, validated_object_hash)` — any hash drift produces a NULL result
3. The proof stage re-reads the compiled AEO from `aeo_registry` and binds its `validated_object_hash` to the proof record
4. Reconciliation closure traces the lineage chain and detects any `hash_drift` drift class

---

## Evidence References

| Artifact | Location |
|---|---|
| `toCanonicalAeo` | `src/index.ts:1169` |
| `REQUIRED_AEO_KEYS` | `src/index.ts:1160` |
| `canonicalize` | `src/index.ts:1162` |
| `sha256Hex` | `src/index.ts:1184` |
| AEO compile route | `src/index.ts:7852-7862` |
| AEO validate route | `src/index.ts:8005-8010` |
| AEO execute route | `src/index.ts:8097-8099` |
| AEO proof route | `src/index.ts:8275-8277` |
| `invocation_registry` DDL | `src/index.ts:1461-1462` |
| `aeo_registry` DDL | `src/index.ts:1445` |
| Canonical AEO schema | `schemas/aeo.schema.json` |
| ContinuityOS v1 AEO schema | `schemas/json/continuityos/v1/aeo.schema.json` |
| AEO requirements | `governance/runtime/AEO_REQUIREMENTS.json` |
| AEO governance lib | `src/lib/aeo-governance.ts` |
| Conformance fixtures | `conformance/pack-v1/fixtures/` |

---

*No runtime mutation, validator behavior change, authority creation, proof generation,
registry mutation, reconciliation execution, topology mutation, deployment, merge, or
execution claim is implied by this document.*
