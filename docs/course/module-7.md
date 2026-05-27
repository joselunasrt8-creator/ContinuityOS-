# Module 7 — Distributed Legitimacy

**Duration:** ~2 hours  
**Assignment:** Describe one scenario where LOCAL_VALID ≠ GLOBAL_VALID in your system.

---

## Learning Objectives

By the end of this module you will be able to:

1. Distinguish `LOCAL_VALID` from `GLOBAL_VALID` and state when each applies
2. Describe the nine-predicate legitimacy gate in a distributed context
3. Explain topology visibility and why a node must be observed to execute
4. Trace the reconciliation state machine from OBSERVED to FINALIZED
5. Explain why `reconciliation ≠ authority` and why convergence does not retroactively authorize

---

## 7.1 From Single-Node to Multi-Node

Modules 1–6 described legitimacy in a single-node context. A single runtime validates, executes, and emits proof. The chain is local and deterministic.

In a distributed deployment, the same legitimacy chain must hold across multiple nodes:
- Multiple nodes may each hold validation registries
- A validation result on node A is not automatically valid on node B
- A proof on node A may not yet be visible on node B
- Network partitions can create divergent state between nodes

ContinuityOS addresses this with two validity classes: `LOCAL_VALID` and `GLOBAL_VALID`.

**Code reference:** [`src/lib/finality-classification.ts`](../../src/lib/finality-classification.ts)

---

## 7.2 LOCAL_VALID vs GLOBAL_VALID

| Property | LOCAL_VALID | GLOBAL_VALID |
|----------|-------------|--------------|
| Validated on local node | ✓ | ✓ |
| Quorum attestation complete | ✗ | ✓ |
| Topology visibility confirmed | ✗ | ✓ |
| Cross-node replay resistance | ✗ | ✓ |
| Audit log globally canonical | ✗ | ✓ |
| Safe for distributed finality | ✗ | ✓ |

A `LOCAL_VALID` result means: this node has validated the object against its local state. No other node has confirmed this.

A `GLOBAL_VALID` result means: a quorum of topology nodes has attested that the validation result is consistent with their state.

**Key invariant:** `LOCAL_VALID` alone is not sufficient for distributed finality.

---

## 7.3 The Full Distributed Predicate Gate

The legitimacy predicate gate in a distributed context is:

```
VALID
∧ AUTHORIZED
∧ UNUSED          (nonce not consumed on any topology node)
∧ POLICY_VALID
∧ REPLAY_SAFE     (nonce not in any node's replay registry)
∧ TOPOLOGY_VISIBLE (executing node is observed in topology registry)
∧ RECONCILABLE    (continuity lineage is consistent across visible nodes)
∧ EPOCH_VALID     (epoch is current on this node)
∧ CONVERGENCE_VALID (distributed state has converged on this node)
→ GLOBAL_VALID candidate

Else → NULL
```

Each predicate is necessary. None is sufficient alone.

---

## 7.4 Topology Visibility

**`TOPOLOGY_VISIBLE`** means: the node executing the action must be observable in the topology registry.

```typescript
// Topology visibility check
function isTopologyVisible(nodeId: string, topologyRegistry: TopologyRegistry): boolean {
  const entry = topologyRegistry.get(nodeId);
  return entry !== undefined && entry.status === "OBSERVED";
}
```

If a node is not in the topology registry, it cannot execute. This prevents ghost nodes — nodes that can execute but are not visible to the rest of the topology — from acting outside the governed surface.

**Code reference:** [`src/lib/topology-visibility.ts`](../../src/lib/topology-visibility.ts)

---

## 7.5 Epoch Validity

Every legitimacy object is bound to an **epoch** — a time-bounded validity window.

```typescript
interface Epoch {
  epoch_id: string
  started_at: string
  expires_at: string
  status: "CURRENT" | "EXPIRED" | "SUPERSEDED"
}
```

If the epoch has expired or been superseded when the object is presented for execution:
- `EPOCH_VALID` predicate returns false
- The legitimacy gate returns NULL
- The object must be re-compiled under a new epoch

**Code reference:** [`src/lib/epoch-substrate.ts`](../../src/lib/epoch-substrate.ts)

---

## 7.6 The Reconciliation State Machine

When distributed nodes diverge — due to network partition, delayed replication, or conflicting executions — the reconciliation process resolves the conflict.

```
OBSERVED
    ↓
PENDING        (inconsistency detected, resolution not yet started)
    ↓
RECONCILING    (resolution in progress)
    ↓
CONFLICTED     (irreconcilable conflict detected)
    ↓
SETTLEMENT_CANDIDATE  (proposed resolution)
    ↓
CONVERGED      (nodes agree on canonical state)
    ↓
FINALIZED      (stable, globally canonical)
```

**Code reference:** [`src/lib/reconciliation-state-machine.ts`](../../src/lib/reconciliation-state-machine.ts)

---

## 7.7 Reconciliation ≠ Authority

A critical invariant that the reconciliation state machine enforces:

> **Convergence does not retroactively authorize anything.**

If two nodes diverged and one executed an action that the other did not, reconciliation determines which execution is canonical. But it does not:
- Grant authority for the non-canonical execution
- Allow the non-canonical execution to be counted as legitimate
- Create a proof for an unauthorized execution

```
Node A: executed with valid authority
Node B: executed without valid authority (partition scenario)

Reconciliation result:
  - Node A's execution: CONVERGED → FINALIZED
  - Node B's execution: CONFLICTED → no proof → no canonical record
```

The authority that would have been needed to authorize Node B's execution during the partition does not materialize after the partition heals.

---

## 7.8 Causal Ambiguity

In a distributed system with partitions, **causal ambiguity** arises when it is unclear whether two executions happened before or after each other.

ContinuityOS handles this with causal legitimacy clocks: each execution records the causal vector at the time of execution. The reconciliation process uses these vectors to determine ordering and detect conflicts.

**Code reference:** [`src/lib/epoch-substrate.ts`](../../src/lib/epoch-substrate.ts) — causal clock logic

If causal ordering cannot be determined:
- The `RECONCILABLE` predicate returns false
- The legitimacy gate returns NULL
- A governance decision is required to resolve the ambiguity

---

## 7.9 Split-Brain and Partition Finality

In a network partition, each side of the partition may see itself as canonical. ContinuityOS's partition finality semantics:

1. Each side continues to accept validations with `LOCAL_VALID` status
2. `GLOBAL_VALID` is suspended during partition (quorum cannot be reached)
3. After partition heals, reconciliation determines the canonical side
4. Non-canonical executions are downgraded to `CONFLICTED`

**Code reference:** [`PARTITION_FINALITY_SEMANTICS.md`](../../PARTITION_FINALITY_SEMANTICS.md)

The key guarantee: no execution is globally finalized without quorum. Partition does not create phantom authority.

---

## 7.10 Downgrade and Upgrade Events

The reconciliation state machine supports explicit state transitions:

- **Downgrade**: `GLOBAL_VALID → LOCAL_VALID` — triggered when quorum evidence is revoked or superseded
- **Upgrade**: `LOCAL_VALID → GLOBAL_VALID` — triggered when quorum attestation is received

**Code reference:** [`src/lib/reconciliation-state-machine.ts`](../../src/lib/reconciliation-state-machine.ts) — downgrade/upgrade event handlers

---

## Knowledge Check

1. A validation result is `LOCAL_VALID`. Is this sufficient to emit a globally canonical proof? Why or why not?
2. Node X is not in the topology registry. Can it execute a legitimacy-gated action? What predicate fails?
3. Two nodes diverge during a partition. After the partition heals, reconciliation determines node A's execution is canonical. What happens to node B's execution record?

---

## Code to Read

- [`src/lib/finality-classification.ts`](../../src/lib/finality-classification.ts) — `LOCAL_VALID`, `GLOBAL_VALID`, classification logic
- [`src/lib/reconciliation-state-machine.ts`](../../src/lib/reconciliation-state-machine.ts) — reconciliation state transitions
- [`src/lib/topology-visibility.ts`](../../src/lib/topology-visibility.ts) — topology observation and TOPOLOGY_VISIBLE predicate
- [`src/lib/epoch-substrate.ts`](../../src/lib/epoch-substrate.ts) — epoch management and causal clocks
- [`docs/stage2-legitimacy-vocabulary.md`](../stage2-legitimacy-vocabulary.md) — canonical vocabulary for all distributed legitimacy terms
- [`PARTITION_FINALITY_SEMANTICS.md`](../../PARTITION_FINALITY_SEMANTICS.md) — partition behavior specification

---

## Next

[Module 8 — Conformance and Telemetry](module-8.md): run the conformance suite, interpret the report, earn the conformance badge, and instrument telemetry to measure governed execution in your repo.
