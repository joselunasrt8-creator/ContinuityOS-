# Module 2 — The Object Model

**Duration:** ~1 hour  
**Lab:** [L1 — Create a legitimacy object](labs/lab-1.md)  
**Assignment:** Write definitions of ATAO, AEO, Authority, Proof in your own words.

---

## Learning Objectives

By the end of this module you will be able to:

1. Name and define the six core types in the ContinuityOS object model
2. Describe the lifecycle from ATAO → Authority → AEO → ValidationResult → Proof → ReplayRecord
3. Read a real `aeo.json` file and identify each field's purpose
4. Explain why the object model enforces separation of intent, validation, and execution

---

## 2.1 The Six Core Types

ContinuityOS has six object types that carry legitimacy through an execution lifecycle. Each type has a distinct role. None can substitute for another.

### ATAO — Agent Tool Action Object

**What it is:** The first structured representation of intent — produced before any authority is bound.

**Where it comes from:** When an agent (human, LLM, automated system) decides to attempt an action, it produces an ATAO. This is the moment intent becomes structured data.

**What it contains:**
- `intent` — human-readable description of what is being attempted
- `scope` — what resources are in scope (repo, branch, environment)
- `target` — the exact target of the action
- `constraints` — limits on how the action may be executed
- `authority_reference` — reference to the authority that must be bound
- `continuity_reference` — reference to the continuity lineage
- `risk_class` — classification of the action's risk level

**Key invariant:** An ATAO is not authorization. It is a declaration of intent waiting to be validated.

---

### Authority

**What it is:** A validated, scoped permission binding a specific decision to a specific continuity lineage.

**Where it comes from:** A governance process (human approval, policy engine, or signed decision) produces an Authority record. The ATAO must reference a valid Authority.

**What it contains:**
- `authority_id` — unique identifier
- `decision_id` — the decision that granted this authority (unique per action)
- `continuity_id` — the continuity lineage it is bound to
- `status` — `ACTIVE` | `REVOKED` | `CONSUMED`
- `expires_at` — when the authority lapses

**Key invariant:** Authority can be in only one of three states. A CONSUMED authority cannot be reused. A REVOKED authority cannot be reinstated.

---

### AEO — Atomic Execution Object

**What it is:** The compiled, hash-locked execution unit derived from a validated ATAO + bound Authority.

**Where it comes from:** The `/compile` route takes an ATAO and an Authority and produces an AEO. The AEO is then hashed to produce a `validated_object_hash`.

**What it contains:**
- `intent` — carried forward from ATAO
- `scope` — carried forward from ATAO
- `validation` — validation criteria to be checked at execution time
- `target` — the exact target (carried forward, frozen)
- `finality` — how the result should be recorded

**Key invariant:** The AEO that was validated is the AEO that will be executed. Any mutation between validation and execution returns NULL.

**Code reference:** [`src/lib/aeo-governance.ts`](../../src/lib/aeo-governance.ts)  
**Example:** [`aeo.json`](../../aeo.json)

---

### ValidationResult

**What it is:** The output of the `/validate` route — either `VALID` or `NULL`. No other values.

**Where it comes from:** The validation step takes a compiled AEO and checks all legitimacy predicates. It returns a binary result.

**What it contains:**
- `status` — `"VALID"` or `"NULL"`
- `result` — `"VALID"` or `"INVALID"`
- `validated_object_hash` — the exact hash of the object that was validated

**Key invariant:** The validation result references the exact object hash. At execution time, the runtime verifies that the object being executed matches this hash. If it does not match, execution returns NULL.

**Code reference:** [`src/result.ts`](../../src/result.ts)

---

### Proof

**What it is:** An append-only record that a specific, validated execution occurred.

**Where it comes from:** The `/proof` route produces a Proof after a successful execution. Proofs are stored in an append-only registry and cannot be deleted or modified.

**What it contains:**
- `proof_id` — deterministic, derived from topology + proof hashes
- `decision_hash` — hash of the decision that authorized the execution (unique)
- `execution_id` — the execution this proof covers
- `lineage` — continuity lineage at the time of proof
- `created_at` — timestamp

**Key invariants:**
- `proof_existence ≠ distributed_finality` — a local proof is not global consensus
- `proof.replay_neutral = true` — a proof does not authorize re-execution
- `proof.runtime_authority = false` — a proof does not grant authority
- `proof.append_only = true` — proofs cannot be deleted or modified

**Code reference:** [`runtime/control_graph_proof.ts`](../../runtime/control_graph_proof.ts), [`src/lib/proof-finality-metadata.ts`](../../src/lib/proof-finality-metadata.ts)

---

### ReplayRecord

**What it is:** A record that a specific invocation nonce was consumed, preventing replay of the same execution.

**Where it comes from:** Created during execution when the invocation nonce is consumed.

**What it contains:**
- `replay_id` — deterministic identifier
- `continuity_id` — the continuity lineage it is bound to
- `continuity_hash` — hash of the continuity state at consumption
- `lineage_hash` — ancestry hash

**Key invariant:** A nonce that appears in the replay registry cannot be used again. Any attempt to execute with a consumed nonce returns NULL.

**Code reference:** [`runtime/control_graph_replay.ts`](../../runtime/control_graph_replay.ts), [`src/lib/replay-convergence.ts`](../../src/lib/replay-convergence.ts)

---

## 2.2 The Lifecycle

```
Human / agent produces intent
          ↓
       ATAO
  (intent structured)
          ↓
     Authority
  (permission bound to
   decision_id + continuity_id)
          ↓
        AEO
  (compiled, hash-locked
   execution unit)
          ↓
  ValidationResult
  (VALID or NULL — binary)
          ↓
     Execution
  (only if VALID and
   validated_object == executed_object)
          ↓
       Proof
  (append-only record of execution)
          ↓
    ReplayRecord
  (nonce consumed — cannot replay)
```

Each arrow in this diagram is a non-bypassable step. You cannot jump from ATAO to Execution. You cannot produce a Proof without an Execution. You cannot re-execute using a Proof.

---

## 2.3 Reading a Real AEO

The file [`aeo.json`](../../aeo.json) in this repository is an example AEO for a production Worker deployment.

Open it and identify:

1. What is the `intent`? What action does it describe?
2. What does the `scope` contain? What is in scope for this action?
3. What does `validation.proof_required` mean? What happens if it is `false`?
4. What is `validation.replay_nonce`? Why is it a UUID?
5. What does `finality.continuity_required` enforce?

---

## 2.4 Why Separation Matters

The object model enforces separation at every step:

| Type | Creates | Does NOT create |
|------|---------|-----------------|
| ATAO | Structured intent | Authority, proof, execution |
| Authority | Permission scope | AEO, proof, execution |
| AEO | Execution unit | Authority, proof |
| ValidationResult | Legitimacy signal | Authority, proof, execution |
| Proof | Evidence record | Authority, next execution |
| ReplayRecord | Nonce consumption | Authority, proof |

This separation means:
- No shortcut from intent to execution
- No implicit authority creation
- No proof reuse as execution authorization
- No replay of consumed nonces

---

## 2.5 Database Schema

The D1 database (`schema.sql`) has one registry table per object type:

| Table | Object type |
|-------|-------------|
| `authority_registry` | Authority |
| `aeo_registry` | AEO |
| `validation_registry` | ValidationResult |
| `execution_registry` | Execution record |
| `proof_registry` | Proof |

Each table enforces uniqueness constraints (e.g., `decision_id UNIQUE`, `decision_hash UNIQUE`) that prevent duplicate execution.

---

## Knowledge Check

1. What is the difference between an ATAO and an AEO?
2. Can a Proof authorize a re-execution of the same action? Why not?
3. What happens if the object hash at execution time does not match the hash recorded in the ValidationResult?

---

## Code to Read

- [`src/lib/aeo-governance.ts`](../../src/lib/aeo-governance.ts) — `CanonicalAEO` type and `toCanonicalAeo()` function
- [`src/result.ts`](../../src/result.ts) — `CanonicalNullResult` and `CanonicalValidResult`
- [`src/governed-deploy.ts`](../../src/governed-deploy.ts) — `DeployATAO`, `DeployAEO`, `DeployValidatorPredicates`
- [`aeo.json`](../../aeo.json) — example AEO for production deploy

---

## Next

[Module 3 — Exact-Object Validation](module-3.md): learn how canonical serialization and hashing enforce `validated_object == executed_object`.
