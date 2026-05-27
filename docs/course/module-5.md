# Module 5 — Proof and Continuity

**Duration:** ~1 hour  
**Lab:** [L6 — Emit a proof artifact for a valid action](labs/lab-6.md)

---

## Learning Objectives

By the end of this module you will be able to:

1. Describe what a proof artifact contains and what each field means
2. Explain why proofs are append-only and cannot be deleted
3. Explain why `proof_existence ≠ distributed_finality`
4. Describe how continuity lineage chains executions together
5. State why `continuity ≠ authority` and `proof ≠ authority`

---

## 5.1 What a Proof Is

A **proof** is an append-only record that a specific, validated execution occurred. It is produced by the `/proof` route after a successful execution.

```typescript
interface Proof {
  proof_id: string            // deterministic: derived from topology + proof hashes
  decision_hash: string       // hash of the decision that authorized the execution
  execution_id: string        // the execution this proof covers
  lineage: string             // continuity lineage at time of proof
  created_at: string          // timestamp
}
```

**Code reference:** [`runtime/control_graph_proof.ts`](../../runtime/control_graph_proof.ts), [`src/lib/proof-finality-metadata.ts`](../../src/lib/proof-finality-metadata.ts)

---

## 5.2 What a Proof Is Not

The proof object carries explicit metadata about what it cannot do:

```typescript
interface ProofFinalityMetadata {
  proof_existence: true
  distributed_finality: false    // local proof ≠ global consensus
  replay_neutral: true           // proof does not authorize re-execution
  runtime_authority: false       // proof does not grant authority
  append_only: true              // cannot be deleted or modified
  consensus_required: boolean    // depends on topology configuration
}
```

These invariants are not aspirational — they are enforced by the runtime:

- `distributed_finality: false` — a proof stored on one node is not globally finalized until quorum attestation
- `replay_neutral: true` — the nonce referenced in the proof is consumed; it cannot produce another execution
- `runtime_authority: false` — holding a proof does not entitle you to execute anything else
- `append_only: true` — no DELETE or UPDATE operation is permitted on the proof registry

---

## 5.3 Append-Only Semantics

The proof registry table is write-only from the application's perspective:

```sql
-- proof_registry: INSERT only, no UPDATE, no DELETE
CREATE TABLE proof_registry (
  proof_id TEXT PRIMARY KEY,
  decision_hash TEXT UNIQUE NOT NULL,
  execution_id TEXT NOT NULL,
  lineage TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

The `decision_hash UNIQUE` constraint means:
- Each decision can produce exactly one proof
- If a proof already exists for a `decision_hash`, a second insert fails
- There is no "re-proof" operation

This is not a policy choice. It is a schema constraint enforced at the database level.

---

## 5.4 Continuity Lineage

**Continuity** is the chain of accountability that links one execution to the next. Every execution in ContinuityOS is bound to a `continuity_id`, which references a parent continuity record.

```
Epoch 1
  └─ continuity_id: "c-001"
       └─ authority: "auth-001"
            └─ AEO: compiled from auth-001
                 └─ execution: "exec-001"
                      └─ proof: "proof-001"
                           └─ continuity_id: "c-002"  ← next execution chains here
                                └─ authority: "auth-002"
                                     └─ ...
```

Each proof references the continuity lineage at the time of execution. The next authority must bind to a continuity that descends from that lineage.

**Code reference:** [`runtime/control_graph_continuity.ts`](../../runtime/control_graph_continuity.ts)

---

## 5.5 No Valid Lineage → No Valid Execution

If the continuity lineage is broken at any point, no further execution can be authorized:

```
broken lineage
      ↓
no valid continuity_id
      ↓
no valid authority can be created
      ↓
no valid AEO can be compiled
      ↓
validation returns NULL
      ↓
execution does not happen
```

This is why continuity is not just a bookkeeping artifact. It is a hard dependency in the legitimacy predicate gate.

---

## 5.6 Proof Emission Failure

What happens if the `/proof` route fails after a successful execution?

The execution record exists in `execution_registry` with status `EXECUTED`. But no proof row exists in `proof_registry`. This is a legitimacy gap.

The runtime handles this with the `proof_required` flag:
- If `proof_required: true` in the AEO's `validation` block, and proof emission fails, the execution is logged but flagged as incomplete
- The continuity lineage from this execution cannot be used to authorize a subsequent execution until the proof gap is resolved

This is why Lab 6 requires you to verify that a proof row exists in the `proof_registry` after emitting it — not just that the `/proof` route returned 200.

---

## 5.7 Distributed Finality

A local proof is not a distributed proof. In a multi-node topology, "globally finalized" means:
- A quorum of topology nodes has attested to the execution
- The proof is visible in the `proof_registry` on enough nodes to satisfy the consensus threshold
- The `consensus_required` flag in the proof metadata is `true` and has been satisfied

**Code reference:** [`src/lib/finality-classification.ts`](../../src/lib/finality-classification.ts)

Until distributed finality is reached, the proof has `distributed_finality: false`. The execution is locally recorded but not globally canonical.

This matters for:
- Cross-node replay resistance
- Reconciliation after network partition
- Audit log completeness

You will learn distributed finality in full in Module 7.

---

## 5.8 Proof in the Governed Deploy Workflow

In the governed deploy workflow, proof emission is a required step:

```yaml
- name: Emit proof
  run: |
    PROOF_RESPONSE=$(curl -sf -X POST "$CLEAN_WORKER_URL/proof" \
      -H "X-API-Key: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"decision_id\": \"$DECISION_ID\"}")
```

If this step fails:
- The workflow fails
- The deploy is logged as executed but not proved
- The CI run is marked failed
- The conformance suite will detect the gap

---

## Knowledge Check

1. Can a proof be used to authorize a re-execution of the same action? Why not?
2. What does `distributed_finality: false` mean for a proof stored on a single node?
3. If the continuity lineage from execution `exec-001` is broken, what happens when you try to authorize `exec-002`?

---

## Code to Read

- [`runtime/control_graph_proof.ts`](../../runtime/control_graph_proof.ts) — proof construction and registry insert
- [`src/lib/proof-finality-metadata.ts`](../../src/lib/proof-finality-metadata.ts) — `ProofFinalityMetadata` type
- [`runtime/control_graph_continuity.ts`](../../runtime/control_graph_continuity.ts) — continuity lineage logic
- [`src/lib/finality-classification.ts`](../../src/lib/finality-classification.ts) — LOCAL_VALID vs GLOBAL_VALID classification

---

## Next

[Module 6 — Agent Execution Gateway](module-6.md): apply the legitimacy chain to AI agent tool calls, routing agent output through ATAO → AEO before any mutation can occur.
