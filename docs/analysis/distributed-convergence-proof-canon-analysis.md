# Distributed Convergence Proof Canon Analysis

**Scope:** Distributed convergence proof analysis across the legitimacy substrate  
**Branch:** `claude/mindshift-convergence-proof-USLg7`  
**Date:** 2026-05-25  
**Status:** Evidence-only analysis. No authority created. No runtime state mutated. No execution authorized.

---

## Preamble

This document is a convergence proof canon analysis — not a runtime mutation, not authority creation, not settlement execution, not governance automation, not topology mutation, not replay implementation.

The analysis determines whether distributed convergence under the MindShift legitimacy substrate can become: canonical, topology-independent, replay-safe, irreversible, epoch-authoritative, recursively reconcilable, and propagation-verifiable — and where structural gaps prevent each property.

### Canonical Invariants (Preserved Throughout)

```
If no valid object exists → nothing happens

validated_object == executed_object

No valid continuity lineage
→ no valid authority
→ no valid execution

CONVERGENCE_FAILED → EXECUTION_NULL
AMBIGUOUS_CONVERGENCE → REPLAY_NULL

VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ EPOCH_VALID ∧ CONVERGENCE_PROVEN
Else → NULL
```

---

## Evidence Base

The analysis draws on the following artifacts (read-only):

| Artifact | Path |
|---|---|
| Replay death boundary canon | `artifacts/REPLAY_DEATH_BOUNDARY_CANON.md` |
| Tombstone propagation canon | `artifacts/TOMBSTONE_PROPAGATION_CANON.md` |
| Distributed governance canon analysis | `docs/analysis/distributed-governance-canon-analysis.md` |
| Settlement convergence analysis | `docs/analysis/governance-settlement-convergence-analysis.md` |
| Epoch canon analysis | `docs/analysis/governance-epoch-canon-analysis.md` |
| Continuity legitimacy convergence | `docs/analysis/continuity-legitimacy-convergence-analysis.md` |
| Continuity epoch legitimacy | `docs/CONTINUITY_EPOCH_LEGITIMACY_ANALYSIS.md` |
| Continuity supersession analysis | `docs/continuity-supersession-analysis.md` |
| Validate lineage freshness convergence | `docs/analysis/validate-lineage-freshness-convergence.md` |
| Cross-registry reconciliation closure | `docs/cross-registry-reconciliation-closure.md` |
| Continuous reconciliation hardening | `docs/continuous-reconciliation-hardening.md` |
| Distributed topology convergence module | `src/distributed-topology-convergence.ts` |
| Distributed replay convergence module | `src/distributed-replay-convergence.ts` |
| Schema migrations | `migrations/0001–0047` |
| Conformance suites | `conformance/suites/` |
| Deterministic legitimacy vectors | `conformance/vectors/deterministic-legitimacy-vectors.json` |
| Governance requirements | `GOVERNANCE_REQUIREMENTS.json` |
| Execution surfaces | `EXECUTION_SURFACES.json` |

---

## Part 1 — Convergence Proof Canon

### 1.1 Current Convergence Derivation Pathways

The runtime derives convergence through four observable pathways:

**Pathway A — Topology Quorum Observation**  
`src/distributed-topology-convergence.ts` computes `TOPOLOGY_CONVERGED` when all participant topology hashes match under a quorum threshold. This is evidence-only: the result is computed in-flight and classified, but no convergence proof record is written to a durable registry. No `convergence_proof_id` is bound to the output.

**Pathway B — Reconciliation Visibility**  
`reconciliation_closure_registry` (migration 0029) and `cross_registry_reconciliation_registry` (migration 0039) are append-only registries that record `RECONCILIATION_EQUIVALENT` or `RECONCILIATION_DRIFT` state. These survive D1 append-only constraints. However, they classify reconciliation state — not convergence proof state. The two streams are independent with no formal consistency binding.

**Pathway C — Replay Convergence Observation**  
`src/distributed-replay-convergence.ts` classifies `REPLAY_CONVERGED` when all registry views agree on `replay_hash`. This is evidence-only; no persisted proof record is generated. `STALE_REPLAY` and `REPLAY_RESURRECTION` classifications are observable but not enforced.

**Pathway D — Federated Checkpoints**  
`federated_checkpoint_registry` (migration 0018) stores `reconciliation_merkle_root` per checkpoint. These are append-only. They provide a per-checkpoint evidence anchor but do not constitute a per-replica convergence receipt or propagation proof.

### 1.2 What Is Missing: Required Convergence Proof Primitives

The following convergence proof primitives are structurally absent from the runtime:

| Required Primitive | Current State | Gap |
|---|---|---|
| `topology_convergence_proof_registry` | Not present | No durable per-topology-state convergence proof record |
| `convergence_receipt` objects | Not present | Convergence classification is transient, not receipt-bound |
| Replica propagation proofs | Not present | No per-replica acknowledgement that convergence was received |
| Convergence epoch bindings | Not present | No `continuity_epoch` column on any authoritative table |
| Stale replica quarantine proofs | Evidence-only classification only | STALE_PARTICIPANT detected but not enforced via quarantine record |
| Replay convergence proofs | Evidence-only | REPLAY_CONVERGED is a classification, not a durable proof |
| Settlement convergence proofs | Not present | Settlement invalidation is advisory/observational only |
| Tombstone dissemination proofs | Not present | Tombstone propagation has no per-replica receipt (confirmed in TOMBSTONE_PROPAGATION_CANON.md) |

**Determination:** Convergence currently derives exclusively from observational pathways. No explicit convergence proof objects exist. The absence of a `topology_convergence_proof_registry` and `convergence_receipt` type means convergence cannot be distinguished from convergence-observation.

---

## Part 2 — Replica Agreement Determinism

### 2.1 Determinism Under Identical Inputs

The convergence functions in `distributed-topology-convergence.ts` and `distributed-replay-convergence.ts` are locally deterministic: given identical inputs, they produce identical hash outputs. Canonical JSON serialization and SHA-256 hashing are applied consistently. This satisfies single-node determinism.

### 2.2 Determinism Under Distributed Visibility

Distributed replica agreement is **not deterministic** under the following conditions:

**Stale-majority convergence election**  
If a network partition isolates a minority of current replicas while the majority hold stale state, `verifyDistributedTopologyConvergence` will classify `TOPOLOGY_CONVERGED` on the stale state because the quorum threshold is satisfied by stale participants. There is no mechanism to invalidate a quorum composed of stale-majority replicas. The `PARTICIPANT_STALE` classification is evidence-only.

**Absent epoch ordering**  
`continuity_epoch` is absent from `continuity_registry`, `authority_registry`, `validation_registry`, `execution_registry`, and `proof_registry` (confirmed across migrations 0001–0047). Replicas cannot deterministically order competing continuity lineages by epoch. Two replicas may elect different ACTIVE continuity leaves because the tie-breaking criterion (epoch monotonicity) is not encoded.

**Absent SUPERSEDED status**  
The `continuity_registry.status` column accepts TEXT values but the schema does not constrain or enforce a `SUPERSEDED` status transition. Supersession is derived from topology observation (does a child exist?) rather than from an authoritative status transition. Two replicas with different visibility of the child's creation will disagree on whether the parent is SUPERSEDED.

**Reconciliation-before-convergence**  
`reconciliation_closure_registry` may record `RECONCILIATION_EQUIVALENT` while topology convergence has not yet propagated to all replicas. The two classifications are independent evidence streams; no ordering invariant between them is encoded.

**Conclusion — Replica Agreement Determinism**

| Condition | Deterministic? |
|---|---|
| Single node, complete visibility | YES |
| Multiple nodes, complete visibility, same epoch | YES |
| Network partition present | NO |
| Stale-majority partition | NO |
| Epoch divergence | NO |
| Supersession race | NO |
| Delayed reconciliation | NO |
| Partition healing with stale leader | NO |

Replicas **cannot** deterministically converge on a single lineage state, a single replay boundary, a single settlement validity state, a single supersession boundary, or a single canonical epoch under stale visibility.

---

## Part 3 — Convergence Proof Persistence

### 3.1 What Persists Under Rollback / D1 Restore

The following registries are append-only (triggers: BEFORE UPDATE → ABORT, BEFORE DELETE → ABORT):

- `distributed_legitimacy_registry` (migration 0018)
- `federated_checkpoint_registry` (migration 0018)
- `topology_reconciliation_registry` (migration 0033)
- `reconciliation_closure_registry` (migration 0029)
- `cross_registry_reconciliation_registry` (migration 0039)
- `proof_registry` (unique index on `decision_hash`)

**Survival analysis:**

| Threat | Survival |
|---|---|
| D1 restore to earlier snapshot | PARTIAL — append-only records persist only to snapshot point; entries after snapshot are lost; convergence observations from the restored epoch re-emerge |
| Stale replica resurrection | PARTIAL — stale replica re-emerges with its last-known state; no quarantine mechanism prevents it from re-entering convergence quorum |
| Rollback attempt | PARTIAL — append-only tables survive; but `authority_registry.status` and `continuity_registry.status` are mutable TEXT columns; rollback can restore ACTIVE status that was subsequently CONSUMED or REVOKED |
| Migration downgrade | RISK — a migration downgrade that drops columns added in later migrations removes epoch bindings, tombstone indicators, or convergence columns if added |
| Delayed reconciliation | PARTIAL — reconciliation_closure_registry appends drift classifications but cannot enforce convergence of missing records |
| Stale-majority topology | NO — stale-majority topology produces a convergence classification on old state that cannot be distinguished from canonical convergence |

**Critical gap — Status column mutability:**  
`authority_registry.status` (TEXT NOT NULL, mutable), `continuity_registry.status` (TEXT NOT NULL, mutable), and `validation_registry.status` (TEXT NOT NULL, mutable) are not append-only. A D1 restore rewrites these columns to their snapshot values. An authority that was CONSUMED at T=100 returns to ACTIVE after restore to T=80. This allows replay of a consumed authority without any convergence proof invalidation, because the convergence proof registries themselves contain no reference to authority status at the time of convergence.

**Confirmed prior finding (REPLAY_DEATH_BOUNDARY_CANON.md):** Status-column mutability prevents append-only enforcement on the primary legitimacy state machine. This analysis confirms the finding extends to convergence proof persistence.

---

## Part 4 — Distributed Convergence Races

### Race 1: Reconciliation-Before-Convergence

**Timeline:**
```
T0: Replica A records RECONCILIATION_EQUIVALENT in reconciliation_closure_registry
T1: Replica B has not yet received topology state update; still holds diverged state
T2: External consumer reads RECONCILIATION_EQUIVALENT from A
T3: External consumer reads TOPOLOGY_DIVERGED from B
```
**Result:** Two contradictory convergence classifications coexist. Neither is authoritative; both are evidence-only. No canonical tiebreaker exists.  
**Severity:** HIGH — Reconciliation equivalence claims can precede actual convergence by an unbounded interval.

### Race 2: Stale-Majority Convergence Election

**Timeline:**
```
T0: Partition isolates current-state replica C (minority)
T1: Stale replicas A, B elect TOPOLOGY_CONVERGED on stale state (quorum satisfied)
T2: Convergence observation is appended to topology_reconciliation_registry
T3: Partition heals; C re-emerges with later state
T4: New quorum election runs; result may differ from T2 record
```
**Result:** topology_reconciliation_registry contains a `TOPOLOGY_VALID` record for a stale convergence epoch. The append-only constraint means this stale convergence record cannot be deleted. A future reconciliation must detect and classify it as superseded, but no mechanism for "convergence supersession" exists in the schema.  
**Severity:** HIGH — Stale convergence records are permanently appended with no invalidation path.

### Race 3: Rollback-Before-Proof

**Timeline:**
```
T0: /execute succeeds; execution_registry.status = EXECUTED
T1: /proof succeeds; proof_registry record persisted; authority.status = CONSUMED
T2: D1 restore to snapshot prior to T1
T3: proof_registry record no longer exists; authority.status = RESERVED
T4: /execute can be re-invoked with same invocation_nonce
```
**Result:** The proof_registry UNIQUE constraint on `decision_hash` is absent post-restore. The invocation_registry UNIQUE constraint on `(decision_id, validated_object_hash, invocation_nonce)` may also be absent if the restore predates the invocation record. Full replay is possible.  
**Severity:** CRITICAL — D1 restore can resurrect a full replay window.

### Race 4: Replay-Before-Convergence

**Timeline:**
```
T0: Topology convergence classified on lineage L1 (ACTIVE)
T1: Propagation of tombstone for L1 is delayed to replica B
T2: Replica B receives a replay request for invocation_nonce N under L1
T3: Replica B observes L1 as ACTIVE (not yet tombstoned); replay proceeds
T4: Topology convergence on L1 death reaches replica B; too late
```
**Result:** A replay completes on a lineage that the canonical topology had already tombstoned. No replay convergence proof existed at T2 to block this. `distributed-replay-convergence.ts` would classify this as `REPLAY_RESURRECTION` retroactively, but the execution already occurred.  
**Severity:** CRITICAL — Replay-before-convergence is not structurally blocked.

### Race 5: Stale Settlement Replay

**Timeline:**
```
T0: Settlement for decision_id D is invalidated (settlement authority = CONSUMED)
T1: Stale replica A has not received the invalidation
T2: Stale settlement acknowledgement is re-submitted via replica A
T3: No settlement convergence proof exists to block the acknowledgement
```
**Result:** Stale settlement acknowledgements are not invalidated by a canonical convergence boundary. The `governance-settlement-convergence-analysis.md` confirms settlement authority is ADVISORY; no settlement convergence proof registry exists.  
**Severity:** HIGH.

### Race 6: Supersession-Before-Propagation

**Timeline:**
```
T0: Child continuity C2 created; parent C1 observationally superseded
T1: Supersession not yet propagated to replica B
T2: Replica B resolves C1 as ACTIVE leaf; authorizes execution under C1
T3: Canonical replica determines C1 is SUPERSEDED; execution under C1 is invalid
```
**Result:** Execution under a superseded continuity is authorized by a replica that has not received supersession propagation. No SUPERSEDED status in schema means the stale replica cannot even represent the correct state.  
**Severity:** CRITICAL — Confirmed in `continuity-supersession-analysis.md`.

### Race 7: Epoch Divergence Race

**Timeline:**
```
T0: Authority A1 issued under epoch E1 (implicit: issued_at boundary)
T1: Epoch boundary passes; new epoch E2 begins
T2: Stale replica B still processes A1 as valid (no epoch column → no rejection)
T3: Canonical replica rejects A1 as expired; but no EPOCH_VALID gate exists
```
**Result:** Cross-epoch replay is not blocked. No epoch column on authority_registry means A1 cannot be structurally rejected on epoch grounds. Confirmed in `governance-epoch-canon-analysis.md`.  
**Severity:** HIGH.

---

## Part 5 — Convergence + Replay Interaction

### 5.1 Does REPLAY_CONVERGED Invalidate Stale Replay?

The `verifyDistributedReplayConvergence` function classifies `REPLAY_CONVERGED` when all registry views agree on `replay_hash`. However:

- The function is evidence-only; it does not write to any registry.
- No `replay_convergence_proof_id` is emitted that could serve as a foreign key in execution gating.
- A stale replica that has not received the convergence observation can still be queried and will produce a different classification.
- The `/execute` route has no gate condition that requires a `REPLAY_CONVERGED` proof before authorizing execution.

**Determination:** `REPLAY_CONVERGED` classifies convergence observationally. It does not block stale replay because (a) no durable proof exists and (b) no execution gate requires it.

### 5.2 Does REPLAY_CONVERGED Invalidate Stale RESERVED Authority?

The authority lifecycle (`ACTIVE → RESERVED → EXECUTED → CONSUMED`) is enforced by status column update on `authority_registry`. RESERVED status is a mutable field. A stale replica that has not received the RESERVED update still shows ACTIVE. A convergence observation that classifies `REPLAY_CONVERGED` on the canonical replica is invisible to the stale replica.

**Determination:** Stale RESERVED authority is not invalidated by replay convergence because the RESERVED state itself has not propagated. Replay convergence presupposes status propagation that does not have a push mechanism.

### 5.3 Does Convergence Invalidate Stale Settlement Proofs?

Settlement legitimacy is classified as TOPOLOGY-OBSERVATIONAL (from `governance-settlement-convergence-analysis.md`). No settlement convergence proof registry exists. A stale settlement proof cannot be invalidated by a convergence observation because the invalidation itself would need to be convergence-proven — creating a circular dependency that has no structural resolution.

### 5.4 Does Convergence Invalidate Stale Delegation Lineage?

`recursive-revocation-propagation.ts` and `continuity-lineage-closure-hardening.ts` produce evidence-only traversal of delegation lineage. They detect incomplete propagation and orphaned lineage but cannot enforce convergence. A stale delegation lineage survives until reconciliation reaches the stale replica.

### 5.5 Does Convergence Invalidate Stale PREO Lineage?

The `preo_registry` (migration 0013) is append-only for records but its `status` column is mutable (TEXT NOT NULL). No NO-UPDATE trigger on `preo_registry.status` was found in the migrations. A stale PREO lineage whose status has been updated to SUPERSEDED on the canonical node remains ACTIVE on a stale replica.

---

## Part 6 — Convergence + Epoch Interaction

### 6.1 Epoch Convergence

No `continuity_epoch` column exists on any of the following tables:
- `continuity_registry`
- `authority_registry`
- `validation_registry`
- `execution_registry`
- `proof_registry`
- `invocation_registry`

This was confirmed by reviewing migrations 0001 through 0047. Prior analysis (`governance-epoch-canon-analysis.md`, `CONTINUITY_EPOCH_LEGITIMACY_ANALYSIS.md`) established this as the highest-leverage structural gap in the epoch domain.

**Consequence for convergence:** Epoch convergence is undefined. The runtime has no structural concept of "epoch N is authoritative and epoch N-1 is superseded." Convergence proofs cannot be epoch-bound, and epoch rollback divergence cannot be detected at the schema level.

### 6.2 Stale Epoch Replicas

A stale epoch replica holds legitimacy state from a prior epoch interval. Because there is no epoch column, the replica cannot recognize its own staleness with respect to epoch boundaries. The `distributed-topology-convergence.ts` module includes an epoch field in the `TopologyParticipantView` interface and classifies `TOPOLOGY_EPOCH_MISMATCH` when participant epochs differ. However, this classification is evidence-only; there is no enforcement that TOPOLOGY_EPOCH_MISMATCH replicas are quarantined before convergence election.

### 6.3 Epoch Rollback Divergence

A D1 restore to a snapshot within epoch E1 while the canonical runtime has advanced to epoch E2 produces epoch rollback divergence: the restored instance has no mechanism to detect that it is in the wrong epoch. No epoch monotonicity trigger exists on any registry.

### 6.4 Epoch Monotonicity Propagation

Epoch monotonicity would require that once a continuity advances past epoch N, no continuity in epoch ≤ N can be valid. This invariant (`EPOCH_CONVERGENCE_VALID`) is not encoded in the runtime. The constitutional execution gate does not include an EPOCH_VALID condition (confirmed in `governance-epoch-canon-analysis.md`).

### 6.5 Cross-Epoch Replay Convergence

Cross-epoch replay (an authority from epoch N replayed under epoch N+1 continuity) is not structurally blocked. The invocation_registry UNIQUE constraint on `(decision_id, validated_object_hash, invocation_nonce)` prevents direct nonce reuse within a single D1 state, but does not prevent cross-epoch replay after D1 restore or across replicas that have diverged on epoch boundaries.

---

## Part 7 — Settlement Convergence Analysis

### 7.1 Settlement Invalidation Convergence

Settlement invalidation is TOPOLOGY-OBSERVATIONAL: convergence is determined by whether the topology can observe the invalidation across all replicas. It is not derived from a settlement convergence proof record. Therefore:

- Settlement invalidation **does not converge canonically** — it converges only when all replicas happen to have received the invalidation update.
- Under network partition, invalidation may have converged on the majority while the minority continues to treat the settlement as valid.

### 7.2 Stale Settlement Lineage

Stale settlement lineage survives under partition healing if:
1. The settlement authority status column has not been updated on the stale replica.
2. No settlement convergence proof registry entry exists to block the stale settlement.

Both conditions hold under the current schema. Stale settlement lineage can outlive partition healing if the status update is not replayed to the stale replica.

### 7.3 Arbitration Lineage Divergence

`legitimacy-conflict-arbitration.ts` produces conflict arbitration results (`ESCALATED`, `ARBITRATED_BY_LINEAGE`, etc.) but does not write a binding convergence record. Arbitration lineage is evidence-only; divergence between two arbitration results on the same conflict is not resolved by a convergence proof.

### 7.4 Stale Settlement Acknowledgements

No append-only settlement acknowledgement registry exists. Settlement acknowledgements are not separately persisted from authority status updates. A stale settlement acknowledgement on a replica that has not received the authority status update (CONSUMED) cannot be invalidated by a convergence observation.

### 7.5 Reconciliation-Forced Settlement Convergence

Reconciliation cannot force settlement convergence. The `/reconcile` route is observability-only (classified in `EXECUTION_SURFACES.json`). It cannot write to `authority_registry.status` or any settlement lineage column. Reconciliation can classify settlement drift but cannot resolve it.

---

## Part 8 — Required Missing Primitives

The following primitives are structurally absent and required for convergence proof canonicality:

### 8.1 `topology_convergence_proof_registry`

A durable, append-only registry that persists one record per topology convergence event, binding:
- `convergence_proof_id` (PRIMARY KEY)
- `topology_hash` (the hash all participants agreed on)
- `convergence_epoch` (the epoch at which convergence was reached)
- `quorum_participant_ids` (JSON array of participating replica IDs)
- `quorum_threshold` (fraction required)
- `convergence_timestamp`
- `convergence_hash` (canonical hash of the entire convergence proof object)
- Evidence-only constraint columns

**Current state:** Absent. `topology_reconciliation_registry` records topology reconciliation classifications but does not constitute a convergence proof (it records per-PR merge signal, not per-replica convergence receipt).

### 8.2 Convergence Receipt Objects

A `convergence_receipt` type that each replica emits when it has received and validated a convergence proof. Required fields:
- `receipt_id`
- `convergence_proof_id` (FK to topology_convergence_proof_registry)
- `replica_id`
- `received_at`
- `local_topology_hash` (must match convergence_proof.topology_hash)
- `evidence_only: true`

**Current state:** Absent. No per-replica receipt type exists in the schema or source.

### 8.3 Replica Propagation Proofs

Per-replica acknowledgement that a tombstone, revocation, or supersession has been received. Required for:
- Lineage death dissemination verification
- Replay invalidation propagation verification
- Supersession convergence verification

**Current state:** `distributed-replay-convergence.ts` takes registry views as inputs but does not produce per-replica propagation receipts. `recursive-revocation-propagation.ts` produces evidence of propagation completeness but not per-replica receipts.

### 8.4 Convergence Epoch Bindings

A `continuity_epoch` column on `continuity_registry`, `authority_registry`, and the execution gate. Required for epoch-monotonic convergence ordering.

**Current state:** Absent across all migrations (0001–0047). Confirmed by prior analyses.

### 8.5 Stale Replica Quarantine Proofs

A mechanism to formally quarantine a stale replica — preventing it from contributing to convergence quorum — until it has been proven to have received the canonical convergence state. Required schema: a `stale_replica_quarantine_registry` with append-only semantics.

**Current state:** `distributed-topology-convergence.ts` classifies `PARTICIPANT_STALE` and `PARTICIPANT_UNTRUSTED`, but no quarantine registry exists. The stale participant continues to participate in future quorum elections.

### 8.6 Replay Convergence Proofs

A durable record produced when replay convergence is confirmed across all registries. Binds:
- `replay_convergence_proof_id`
- `convergence_proof_id` (FK)
- `replay_hash` (the agreed replay hash)
- `replay_epoch`
- `evidence_only: true`

**Current state:** Absent. `verifyDistributedReplayConvergence` returns a result struct but writes nothing to any registry.

### 8.7 Settlement Convergence Proofs

A record persisted when settlement invalidation has been confirmed across all replicas. Required to block stale settlement replay.

**Current state:** Absent. Settlement convergence is observational and advisory.

---

## Part 9 — Required Invariants

The following invariants are required by the convergence proof canon but are not currently encoded in the schema, triggers, or execution gate:

### INV-C1: DISTRIBUTED_CONVERGENCE_MONOTONICITY

```
∀ convergence_proof P1, P2:
  P2.convergence_epoch > P1.convergence_epoch
  → P2 supersedes P1
  → P1 cannot be re-elected as canonical
```

**Current state:** Not encoded. No `convergence_epoch` field in any registry. Prior convergence records cannot be superseded (append-only constraint prevents deletion, and no supersession marker exists).

### INV-C2: CONVERGENCE_IRREVERSIBILITY

```
∀ convergence_proof P:
  once P.convergence_hash is appended to topology_convergence_proof_registry,
  no subsequent operation may reduce the convergence state below P.epoch
```

**Current state:** Not encoded. Append-only constraint on evidence registries provides partial irreversibility, but authority/continuity status mutability allows the underlying legitimacy state to be reversed without revoking the convergence proof.

### INV-C3: STALE_REPLICA_CONVERGENCE_NULL

```
∀ convergence_proof election:
  if any participant in quorum is classified PARTICIPANT_STALE
  → convergence_result = NULL until stale participants are quarantined
```

**Current state:** Not encoded. `PARTICIPANT_STALE` is a classification; it does not block quorum satisfaction. A stale-majority quorum produces TOPOLOGY_CONVERGED.

### INV-C4: REPLAY_CONVERGENCE_EQUALITY

```
∀ replay_convergence_proof R, topology_convergence_proof T:
  R.convergence_epoch == T.convergence_epoch
  ∧ R.replay_hash is derived from T.topology_hash
  → R is canonically bound to T
  else → R = NULL
```

**Current state:** Not encoded. Replay convergence and topology convergence are computed by separate functions with no cross-binding requirement.

### INV-C5: EPOCH_CONVERGENCE_VALID

```
∀ execution E:
  E.continuity_epoch == canonical_epoch
  ∧ E.authority_epoch == canonical_epoch
  ∧ convergence_proof.epoch == canonical_epoch
  else → E = NULL
```

**Current state:** Not encoded. No epoch columns on execution or authority registries. The execution gate (`/execute`) does not include an EPOCH_VALID condition.

### INV-C6: SETTLEMENT_CONVERGENCE_VALID

```
∀ settlement_acknowledgement S:
  ∃ settlement_convergence_proof P: P.decision_id == S.decision_id
  ∧ P.convergence_epoch >= S.settlement_epoch
  else → S = NULL
```

**Current state:** Not encoded. No settlement convergence proof registry. Settlement acknowledgement processing does not require a convergence proof.

### INV-C7: CONVERGENCE_RECONCILIATION_CLOSURE

```
∀ reconciliation_closure_registry entry R:
  ∃ topology_convergence_proof_registry entry P:
    P.convergence_hash is included in R.closure_hash derivation
  else → R.reconciliation_equivalence_state = NULL
```

**Current state:** Not encoded. `reconciliation_closure_registry.closure_hash` is derived from reconciliation anchors without reference to a topology convergence proof. The two registries are parallel evidence streams.

---

## Part 10 — Final Determination

### 10.1 Is Convergence Canonical?

**Determination: PARTIAL**

Convergence is computed by deterministic functions (`verifyDistributedTopologyConvergence`, `verifyDistributedReplayConvergence`) that produce canonical hash-bound outputs given identical inputs. However, there is no persisted convergence proof record — the result is transient and not durable. A second invocation with different inputs (due to topology change) produces a different result without any supersession record. Convergence is locally canonical but not durable-canonically.

### 10.2 Is Convergence Topology-Independent?

**Determination: NO**

All convergence functions require registry views as inputs. The views are sourced from D1, which is partition-visible. Under partition, different nodes observe different views and produce contradictory convergence classifications. No replica-independent convergence substrate exists. Convergence is topology-observational.

### 10.3 Is Convergence Replay-Safe?

**Determination: PARTIAL**

The conformance suite `replay-neutrality-certification.json` correctly enforces that convergence functions do not consume replay state. The functions are replay-neutral. However:
- Replay-safety requires that REPLAY_CONVERGED blocks execution on stale replicas.
- No such gate exists; replay convergence observations are not bound to execution authorization.
- D1 restore resurrects a full replay window (see Race 3 above).

Convergence is replay-neutral in the observational layer but not replay-blocking in the execution layer.

### 10.4 Is Convergence Deterministic?

**Determination: LOCAL YES / DISTRIBUTED NO**

Given identical inputs, convergence computation is deterministic (canonical hash functions, fixed ordering). Under distributed conditions (stale visibility, epoch divergence, supersession races, partition healing), inputs differ across replicas and convergence outputs diverge. Distributed determinism requires invariants INV-C1 through INV-C7, none of which are currently encoded.

### 10.5 Is Convergence Irreversible?

**Determination: PARTIAL**

Evidence registries (`distributed_legitimacy_registry`, `federated_checkpoint_registry`, `topology_reconciliation_registry`, `reconciliation_closure_registry`, `cross_registry_reconciliation_registry`) are append-only via BEFORE UPDATE/DELETE triggers. Convergence evidence records survive rollback at the trigger level. However:
- D1 restore bypasses triggers and can remove records from the restore epoch onward.
- Authority and continuity status columns are mutable; reversing these reverses the underlying legitimacy state that convergence was premised on.
- No convergence supersession record exists; stale convergence records from prior epochs cannot be formally marked as superseded.

### 10.6 Is Convergence Epoch-Authoritative?

**Determination: NO**

No `continuity_epoch` column exists on any authoritative table. No `EPOCH_VALID` condition in the execution gate. No epoch monotonicity trigger. No epoch convergence record type. Epoch-authority is entirely absent from the convergence proof layer.

### 10.7 Is Convergence Recursively Reconcilable?

**Determination: PARTIAL**

`reconciliation_closure_registry` provides recursive reconciliation anchors. The `verifyDistributedReplayConvergence` function performs multi-view aggregation. However, recursive reconcilability requires that each reconciliation step can be verified against a prior convergence proof (INV-C7). This invariant is absent: reconciliation and convergence are parallel evidence streams with no formal consistency binding. A reconciliation may claim equivalence while topology convergence was never reached.

---

## Summary Classification Table

| Property | Determination | Blocking Gap |
|---|---|---|
| **Canonical** | PARTIAL | No durable convergence proof record; transient classification only |
| **Topology-independent** | NO | D1/partition-visible; stale-majority quorum produces false convergence |
| **Replay-safe** | PARTIAL | No convergence-gated execution barrier; D1 restore resurrects replay window |
| **Deterministic** | LOCAL YES / DISTRIBUTED NO | Stale visibility, epoch divergence, SUPERSEDED status absent |
| **Irreversible** | PARTIAL | Status column mutability; D1 restore bypasses append-only triggers |
| **Epoch-authoritative** | NO | No `continuity_epoch` column; no EPOCH_VALID gate; no epoch monotonicity trigger |
| **Recursively reconcilable** | PARTIAL | Reconciliation and convergence are unbound parallel streams (INV-C7 absent) |
| **Propagation-verifiable** | NO | No per-replica propagation receipts; no tombstone dissemination proofs |

---

## Gap Registry

| Gap ID | Description | Severity | Prior Evidence |
|---|---|---|---|
| CP-G1 | No `topology_convergence_proof_registry` | CRITICAL | TOMBSTONE_PROPAGATION_CANON.md |
| CP-G2 | No convergence receipt objects | CRITICAL | This analysis |
| CP-G3 | No per-replica propagation receipts | HIGH | TOMBSTONE_PROPAGATION_CANON.md |
| CP-G4 | No `continuity_epoch` column on any authoritative table | CRITICAL | governance-epoch-canon-analysis.md |
| CP-G5 | No stale replica quarantine registry | HIGH | This analysis |
| CP-G6 | No replay convergence proof records | HIGH | REPLAY_DEATH_BOUNDARY_CANON.md |
| CP-G7 | No settlement convergence proof registry | HIGH | governance-settlement-convergence-analysis.md |
| CP-G8 | Status column mutability (authority, continuity, validation, PREO) | CRITICAL | REPLAY_DEATH_BOUNDARY_CANON.md |
| CP-G9 | No EPOCH_VALID gate in execution barrier | CRITICAL | governance-epoch-canon-analysis.md |
| CP-G10 | Convergence and reconciliation are unbound parallel streams | HIGH | This analysis |
| CP-G11 | Stale-majority quorum produces valid convergence classification | CRITICAL | This analysis |
| CP-G12 | No SUPERSEDED status in continuity_registry schema | HIGH | continuity-supersession-analysis.md |
| CP-G13 | Epoch monotonicity trigger absent | HIGH | CONTINUITY_EPOCH_LEGITIMACY_ANALYSIS.md |
| CP-G14 | D1 restore bypasses append-only triggers (full replay resurrection) | CRITICAL | GOVERNANCE_REQUIREMENTS.json RIF-002 |
| CP-G15 | No settlement convergence enforcement path (reconcile = observability-only) | HIGH | governance-settlement-convergence-analysis.md |

---

## Required Invariants Summary

| Invariant ID | Name | Encoded? |
|---|---|---|
| INV-C1 | DISTRIBUTED_CONVERGENCE_MONOTONICITY | NO |
| INV-C2 | CONVERGENCE_IRREVERSIBILITY | NO |
| INV-C3 | STALE_REPLICA_CONVERGENCE_NULL | NO |
| INV-C4 | REPLAY_CONVERGENCE_EQUALITY | NO |
| INV-C5 | EPOCH_CONVERGENCE_VALID | NO |
| INV-C6 | SETTLEMENT_CONVERGENCE_VALID | NO |
| INV-C7 | CONVERGENCE_RECONCILIATION_CLOSURE | NO |

**All seven required convergence invariants are absent from the runtime.**

---

## Closure-State Classification

```
distributed convergence legitimacy:

CANONICAL:                  PARTIAL
TOPOLOGY_INDEPENDENT:       NO
REPLAY_SAFE:                PARTIAL
DETERMINISTIC:              LOCAL_ONLY
IRREVERSIBLE:               PARTIAL
EPOCH_AUTHORITATIVE:        NO
RECURSIVELY_RECONCILABLE:   PARTIAL
PROPAGATION_VERIFIABLE:     NO

distributed legitimacy convergence determinism
≠
single-node reconciliation visibility

Overall convergence proof canon status: OPEN
```

No convergence closure achieved. Seven invariants absent. Fifteen structural gaps identified. No existing implementation equivalent to the missing primitives was found across migrations 0001–0047 or source modules in `src/`.

---

*Evidence-only analysis. No authority created. No runtime state mutated. No execution authorized. No settlement executed. No governance automated. No topology mutated. No replay implemented.*
