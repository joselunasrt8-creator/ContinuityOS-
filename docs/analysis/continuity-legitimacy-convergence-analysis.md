# Continuity Legitimacy Convergence Analysis
## Issues #1219 · #1220 — Topology-Independent Continuity Determinism / Authoritative Supersession Semantics

---

## 1. Structural Baseline

### 1.1 Primary Legitimacy Path

The active legitimacy derivation path runs:

```
session_registry
  → continuity_registry (ACTIVE, not expired, not revoked)
    → authority_registry
      → aeo_registry
        → validation_registry
          → execution_registry
            → proof_registry
```

Defined in `src/reconciliation/reconciliation-invariants.ts:760` (`REGISTRY_TRAVERSAL_ORDER`).

### 1.2 Continuity Identity Resolution

`src/runtime/continuity/verifyContinuityLineage.ts:16` — `verifyContinuityLineage()` is the runtime leaf-election function. It:

1. Validates session is ACTIVE and unexpired.
2. Begins at the supplied `input.continuity` node.
3. Walks parent chain via `continuityById` Map (lines 39–44), checking each ancestor for ACTIVE status.
4. Returns `{ ok: true, lineage, lineage_hash }` only when the full chain is clean.

**Leaf freshness is implicit**: there is no check that the supplied node has no children. Any ACTIVE node with no child in the caller's visible set is treated as the current leaf.

### 1.3 Canonical Status Vocabulary

From `src/runtime/continuity/verifyContinuityLineage.ts:1`:

```typescript
export type ContinuityStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | string
```

`SUPERSEDED` does not exist as a canonical status. The open `string` suffix is a type-system artifact, not a canonical extension point.

### 1.4 Schema Fields Present

```typescript
ContinuityNode {
  continuity_id, session_id, identity_id?,
  parent_continuity_id?, continuity_hash,
  status, expires_at?, revoked_at?
}
```

Fields **absent**: `superseded_by`, `superseded_at`, `continuity_epoch`.

### 1.5 Distributed Reconciliation Engine

`src/distributed-continuity-lineage-reconciliation.ts` — evidence-only reconciliation:

- Deduplicates entries across registry views by `continuity_id` (last-write wins across views, lines 559–564).
- Detects orphans via parent-lookup (lines 241–257).
- Traverses ancestry for cycles and depth (lines 268–291).
- Evaluates distributed convergence by comparing `registry_hash` across views (lines 351–410).
- Replay eligibility: rejects revoked/expired entries (lines 295–323); no SUPERSEDED check.

### 1.6 Closure Hardening Engine

`src/continuity-lineage-closure-hardening.ts` — per-entry ancestry traversal that halts on revoked or expired ancestor (lines 347–366). No SUPERSEDED halt logic.

### 1.7 Replay Convergence Engine

`src/distributed-replay-convergence.ts` — hashes replay, lineage, chronology, revocation, and topology dimensions separately across views; detects disagreement per dimension. Convergence requires all views to produce identical per-dimension hashes. No epoch binding.

### 1.8 Control Graph (Observability Layer)

`runtime/control_graph_continuity.ts` — `ContinuityNode` contains only structural fields (`node_id`, `parent_id`, topology/reconciliation/continuity hashes). No status field, no SUPERSEDED concept. `runtime_authority: false` on all envelopes.

### 1.9 Reconciliation Invariants

`src/reconciliation/reconciliation-invariants.ts` — defines 30+ invariants. The continuity-chain invariants (`CONTINUITY_HASH_VALID`, `CONTINUITY_SESSION_VALID`, `CONTINUITY_IDENTITY_VALID`, `CONTINUITY_PARENT_ANCESTRY`) do not include:

- `SINGLE_ACTIVE_CHILD`
- `SUPERSESSION_MONOTONICITY`
- `DETERMINISTIC_LEAF_ELECTION`
- `CONTINUITY_EPOCH_BINDING`

`AUTHORITY_CONTINUITY_VALID` (line 453) checks `continuity_registry.status = 'REVOKED'` but not `status = 'SUPERSEDED'`.

---

## 2. Closed Properties

The following properties are **fully closed** under the current implementation.

### 2.1 Execution Fail-Closed

All execution barriers enforce `validated_object == executed_object`. The exact-object invariant (`EXECUTION_DECISION_OBJECT_MATCH`, line 249) is CRITICAL severity. No execution proceeds without a matching validation record.

### 2.2 Revocation Cascade

`REVOCATION_RECURSIVE` (line 600) and `REVOCATION_CONTINUITY_CASCADE` (line 619) enforce:
- All descendant continuities of a REVOKED node must be recursively revoked.
- All authorities bound to a REVOKED continuity must be revoked or consumed.

These are enforced by SQL invariants at reconciliation time and by `verifyRevocationPropagationCompleteness()` in the distributed engine.

### 2.3 Cycle and Depth Protection

Both `verifyContinuityLineage` (lines 29, 38) and `traverseContinuityAncestry` (lines 287–318) detect cycles and depth overflow and fail closed. Cycle detection is `fatal` severity in drift classification.

### 2.4 Replay Resistance

`REPLAY_NONCE_CONSUMED`, `REPLAY_AUTHORITY_CONSUMED`, `REPLAY_INVOCATION_SINGLE_USE`, `REPLAY_PROOF_UNIQUE` invariants enforce single-use semantics at execution time. `verifyReplayLineageEligibility` rejects detached, revoked, and expired replays.

### 2.5 Authority Non-Issuance in Topology Layer

`runtime/control_graph_authority.ts` enforces `runtime_authority: false` on all records. Quorum convergence (`src/distributed-topology-convergence.ts`) explicitly forbids `majority_as_authority` and `implicit_consensus` in boundary-violation fields (lines 161–176 of the distributed reconciliation engine).

### 2.6 Evidence-Only Isolation

All distributed reconciliation artifacts carry `evidence_only: true` and `creates_authority: false`. Boundary violation detection in both reconciliation engines blocks any input containing mutation-surface fields.

### 2.7 Canonical Hashing Determinism

`src/canonical.js` provides a self-contained, deterministic SHA-256 implementation with sorted key normalization. All distributed hash comparisons route through this single canonical implementation.

---

## 3. Open Properties

The following properties are **structurally open** — not derivable from current authoritative lineage state.

### 3.1 Leaf Election Is Topology-Observational

`verifyContinuityLineage` does not verify the supplied node is the leaf. The caller determines which node is "current" based on its local topology view. A stale replica that does not yet observe a child continuity will elect the parent as current. The parent status is still `ACTIVE`; there is no authoritative signal that it has been superseded.

**Gap**: Leaf freshness = absence-of-child-in-local-view, not = authoritative status field.

### 3.2 No SUPERSEDED Status in Schema

`ContinuityStatus` has no `SUPERSEDED` value. Without this:
- A parent that has been superseded by a child cannot signal its own supersession independently of child visibility.
- Any replica that cannot see the child will authorize the parent.

**Gap**: Authoritative supersession is impossible to encode in the current schema.

### 3.3 No `superseded_by` / `superseded_at` / `continuity_epoch` Fields

The fields required for topology-independent lineage reconstruction are entirely absent from `ContinuityNode`. Without them:
- Leaf election cannot be performed from a single row read.
- Epoch binding for replay is not possible.
- Reconstruction of supersession chain requires multi-row traversal.

**Gap**: Schema is insufficient for authoritative supersession semantics.

### 3.4 Atomic Parent→Child Transition Not Enforced

No write boundary enforces:
```
INSERT child
+ UPDATE parent → SUPERSEDED
```
as a single atomic operation. A partial write creates a window where the child exists but the parent is still ACTIVE — both visible to different replicas simultaneously as valid leaf candidates.

**Gap**: Sibling fork race window exists in the absence of atomic supersession transition.

### 3.5 Distributed Convergence Is Hash-Observational

`evaluateContinuityLineageConvergence` (line 351) determines convergence by comparing `registry_hash` values across views. A replica that has not yet received the child continuity will compute a different registry_hash and be classified as diverged — but during the propagation window, it will still authorize the parent node as ACTIVE.

**Gap**: Convergence classification is observational; it does not prevent authorization during the window of divergence.

### 3.6 Replay Eligibility Has No Epoch Binding

`verifyReplayLineageEligibility` checks `isRevokedOrExpired` (status + revoked_at + expires_at). It does not check whether the replay is bound to the current continuity epoch lineage. A replay associated with a superseded-but-not-revoked parent remains eligible under the current check.

**Gap**: Replay authorization is not epoch-bound; superseded lineage can authorize replays.

### 3.7 Reconciliation Invariants Have No Supersession Checks

`AUTHORITY_CONTINUITY_VALID` checks only `status = 'REVOKED'`. An authority bound to a SUPERSEDED parent (status still ACTIVE) passes this invariant. No invariant class `SUPERSESSION_CONFLICT`, `SIBLING_FORK_DETECTED`, `SUPERSEDED_PARENT_ACTIVE`, or `DEAD_RESERVATION_LINEAGE` exists.

**Gap**: Reconciliation cannot detect supersession-class violations because the canonical states do not include SUPERSEDED.

### 3.8 Split-Brain Convergence Is Probabilistic

Under partition, two replicas may independently see different children — or see only the parent — and produce conflicting leaf elections. Both elections pass `verifyContinuityLineage` if each child is ACTIVE in its respective partition. Resolution depends on partition healing and full propagation convergence.

**Gap**: Split-brain produces non-deterministic legitimacy outcomes until topology heals.

---

## 4. Remaining Convergence Gaps

In order of structural severity:

| # | Gap | Mechanism | Determinism Impact |
|---|-----|-----------|-------------------|
| G1 | No SUPERSEDED status | Schema | Root cause of all topology coupling |
| G2 | No `superseded_by`/`superseded_at`/`continuity_epoch` fields | Schema | Prevents self-contained row-level leaf derivation |
| G3 | No atomic parent→child write boundary | Transaction semantics | Creates sibling fork race window |
| G4 | Leaf election is caller-supplied, not schema-derived | `verifyContinuityLineage` | Stale replicas elect stale parents |
| G5 | Replay eligibility ignores SUPERSEDED | `verifyReplayLineageEligibility` | Superseded lineage can authorize replays |
| G6 | `AUTHORITY_CONTINUITY_VALID` ignores SUPERSEDED | Reconciliation invariants | Authorities on superseded continuity pass |
| G7 | No `SINGLE_ACTIVE_CHILD` invariant | Invariant registry | Sibling forks are undetectable |
| G8 | No `SUPERSESSION_MONOTONICITY` invariant | Invariant registry | Re-activation of SUPERSEDED is undetected |
| G9 | Distributed convergence is hash-observational | `evaluateContinuityLineageConvergence` | Authorization windows exist during propagation |
| G10 | No epoch binding in replay | `verifyReplayLineageEligibility` | Cross-epoch replay eligible |

---

## 5. Required Invariants

The following canonical invariants are required to achieve closure. None currently exist.

### INV-1: TOPOLOGY_INDEPENDENT_LEAF
```
If continuity.status != ACTIVE
→ continuity cannot authorize legitimacy
```
Derivable from a single row read. No child visibility required.

### INV-2: SINGLE_ACTIVE_CHILD
```
For any ACTIVE parent continuity:
COUNT(children WHERE status = ACTIVE) <= 1
```
Enforced at write time by a UNIQUE constraint or atomic check on `parent_continuity_id` + ACTIVE status.

### INV-3: SUPERSESSION_MONOTONICITY
```
If continuity.status == SUPERSEDED:
  status transitions to ACTIVE are forbidden
```
Must be enforced as an irreversible state transition — no UPDATE path from SUPERSEDED → ACTIVE exists.

### INV-4: DETERMINISTIC_LEAF_ELECTION
```
For all replicas R1, R2:
  R1.resolveLeaf(lineage_root) == R2.resolveLeaf(lineage_root)
  iff R1 and R2 have observed the same authoritative supersession chain
```
Derivable from `superseded_by` fields traversal without anti-join.

### INV-5: CONTINUITY_EPOCH_BINDING
```
replay.continuity_epoch == active_continuity.continuity_epoch
```
Replays bound to a superseded epoch must be rejected regardless of the superseded continuity's revocation status.

### INV-6: AUTHORITATIVE_SUPERSESSION
```
If continuity.status == SUPERSEDED
→ continuity cannot authorize legitimacy
→ regardless of child visibility
```
Required in: `verifyContinuityLineage`, `verifyReplayLineageEligibility`, `AUTHORITY_CONTINUITY_VALID`.

### INV-7: SUPERSESSION_BINDING
```
authorities, proofs, replays, reservations
must remain bound to continuity epoch lineage

Any record bound to a SUPERSEDED epoch:
→ is ineligible for new execution
→ is ineligible for new replay
```

---

## 6. Required Schema Changes

### 6.1 `continuity_registry` — New Fields

```sql
superseded_by      TEXT REFERENCES continuity_registry(continuity_id) NULL,
superseded_at      TEXT NULL,       -- ISO-8601 timestamp
continuity_epoch   TEXT NOT NULL,   -- canonical epoch identifier
```

`superseded_by` must be set atomically with child creation. `superseded_at` records the instant of transition. `continuity_epoch` encodes the canonical lineage generation.

### 6.2 Status Enum Extension

```sql
-- continuity_registry.status
CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED', 'EXPIRED'))
```

`SUPERSEDED` becomes a canonical, terminal status — no transition back to ACTIVE.

### 6.3 Unique Active Child Constraint

```sql
CREATE UNIQUE INDEX uq_continuity_single_active_child
  ON continuity_registry (parent_continuity_id)
  WHERE status = 'ACTIVE' AND parent_continuity_id IS NOT NULL;
```

This is the principal enforcement mechanism for `SINGLE_ACTIVE_CHILD`. Combined with the atomic write boundary, it prevents sibling fork creation.

### 6.4 TypeScript Type Extensions

```typescript
export type ContinuityStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED" | "EXPIRED"

export type ContinuityNode = {
  // existing fields ...
  status: ContinuityStatus
  superseded_by?: string | null       // continuity_id of successor
  superseded_at?: string | null       // ISO-8601
  continuity_epoch: string            // canonical epoch
}
```

### 6.5 `verifyContinuityLineage` — Status Check Extension

```typescript
// Current (line 35):
if ((current.revoked_at || "") || current.status !== "ACTIVE")
  return { ok: false, reason: "revoked_continuity_lineage" }

// Required:
if (current.status !== "ACTIVE")
  return { ok: false, reason: "revoked_continuity_lineage" }
// (SUPERSEDED is not ACTIVE; this check already gates it — 
//  but ContinuityFailureReason must add "superseded_continuity_lineage"
//  as a distinct reason for observability.)
```

### 6.6 `verifyReplayLineageEligibility` — Epoch Check Extension

```typescript
// Required additional check:
if (entry.continuity_epoch !== replay.continuity_epoch) {
  return { eligible: false, ineligibility_reason: 'replay_epoch_mismatch' }
}
```

---

## 7. Required Reconciliation Classes

The following drift and reconciliation classes must be added to close the supersession gap:

| Class | Description |
|-------|-------------|
| `SUPERSESSION_CONFLICT` | Both parent and child are ACTIVE simultaneously |
| `SIBLING_FORK_DETECTED` | Two or more ACTIVE children share the same parent |
| `SUPERSEDED_PARENT_ACTIVE` | Parent is ACTIVE but has a SUPERSEDED-or-ACTIVE child |
| `AUTHORITY_CONTINUITY_SUPERSEDED` | Authority is bound to a SUPERSEDED continuity |
| `DEAD_RESERVATION_LINEAGE` | Reservation or replay bound to a superseded epoch |
| `REPLAY_EPOCH_DRIFT` | Replay epoch does not match current active epoch |
| `ORPHANED_SUPERSESSION_CHAIN` | `superseded_by` reference resolves to absent continuity |
| `STALE_REPLICA_AUTHORIZATION` | Authorization issued by a replica that missed supersession |

These extend `CONTINUITY_LINEAGE_DRIFT_CLASSES` in `src/distributed-continuity-lineage-reconciliation.ts` and `CLOSURE_DRIFT_CLASSES` in `src/continuity-lineage-closure-hardening.ts`.

---

## 8. Remaining Distributed Race Windows

Even after schema extension and atomic write enforcement, the following races survive:

### RW-1: Asynchronous Supersession Propagation Window
**Scenario**: Parent is atomically set to SUPERSEDED with child creation. Replica A observes child + SUPERSEDED parent. Replica B observes only the old ACTIVE parent (propagation lag).

**During window**: Replica B can authorize the superseded parent. The row-level SUPERSEDED status eliminates this race *only when the row has propagated*.

**Residual risk**: Propagation lag. Duration bounded by replica sync interval.

**Mitigation**: Stale replica *with the superseded row* is safe. Stale replica *without the superseded row* (pure lag) still elects the parent. Authoritative supersession narrows the window from "until child is seen" to "until superseded parent row is seen" — a smaller propagation unit but not zero.

### RW-2: Split-Brain During Partition
**Scenario**: Partition occurs between the atomic write boundary and full propagation. Two replicas each believe they have the canonical ACTIVE leaf.

**Residual risk**: Under hard partition, two independent child continuities may be created with the same parent — if the unique-active-child constraint is per-node, not distributed. Distributed enforcement of `SINGLE_ACTIVE_CHILD` requires distributed coordination (2PC or consensus write) or post-hoc reconciliation via `SIBLING_FORK_DETECTED`.

**Classification**: This race **survives authoritative supersession introduction** unless the unique constraint is enforced at the distributed write coordinator level.

### RW-3: Epoch Ambiguity on Concurrent Epoch Advancement
**Scenario**: Two clients concurrently derive a new child continuity from the same ACTIVE parent before either write commits.

**During window**: Both writes may attempt `INSERT child + UPDATE parent → SUPERSEDED`. The first to commit wins; the second must fail on the unique-active-child constraint.

**Residual risk**: The second write must be fully rejected, not partially applied. Requires transactional isolation (SERIALIZABLE) on the `(parent_continuity_id, status=ACTIVE)` predicate.

### RW-4: Replay Epoch Drift Under Delayed Revocation
**Scenario**: A continuity is superseded but not yet revoked. Replay records bound to the superseded epoch are still technically not-revoked. Without explicit epoch checking, they remain eligible.

**Residual risk**: Survives unless replay eligibility enforces `replay.continuity_epoch == current_epoch` (Gap G10).

---

## 9. Closure-State Assessment

### Q1 — Can legitimacy become fully derivable from `continuity.status` + `superseded_by` + `continuity_epoch` without anti-join traversal?

**Answer: YES — structurally possible, not yet achieved.**

After the schema extension in §6: A single row read of `continuity.status = ACTIVE AND superseded_by IS NULL` is sufficient to confirm the node is the current leaf. Anti-join traversal (`NOT EXISTS active child`) is replaced by a positive-field check. This is topology-independent.

**Current state**: NOT derivable. Schema lacks the required fields.

### Q2 — What races remain after authoritative SUPERSEDED introduction?

Race windows RW-1 through RW-4 survive (§8). The propagation lag window (RW-1) narrows but does not close. Split-brain fork creation (RW-2) requires distributed constraint enforcement beyond the schema change alone.

### Q3 — Can stale replicas still authorize stale continuity under delayed propagation / partial visibility / partition?

**Yes, under current implementation.** After schema extension with SUPERSEDED status, stale authorization is possible only if the stale replica has not yet received the superseded parent row. Once the SUPERSEDED row propagates, the stale replica rejects the parent without needing child visibility. The race window is proportional to replica propagation lag, not to child propagation lag.

**Partition conditions (RW-2)**: Two replicas behind a hard partition may each independently create a child continuity. The `SINGLE_ACTIVE_CHILD` unique constraint prevents this only if it is enforced at the distributed write coordinator.

### Q4 — Does authoritative supersession eliminate advisory VALID responses / stale parent election / dead reservation lineage?

- **Advisory VALID responses**: Eliminated once SUPERSEDED propagates to the replica. Not eliminated during propagation lag.
- **Stale parent election**: Eliminated once SUPERSEDED row is visible. Still possible during propagation lag (RW-1).
- **Dead reservation lineage**: Eliminated only after `CONTINUITY_EPOCH_BINDING` invariant (INV-5) is enforced in replay eligibility.

### Q5 — What transactional semantics are required for `INSERT child + UPDATE parent → SUPERSEDED` to remain deterministic?

Requires:
1. SERIALIZABLE isolation on the predicate `parent_continuity_id = X AND status = 'ACTIVE'`.
2. Unique constraint on `(parent_continuity_id) WHERE status = 'ACTIVE'` as a guard (§6.3).
3. Both operations within a single transaction boundary — no intermediate committed state where child exists but parent is still ACTIVE.

Without SERIALIZABLE isolation, two concurrent writers can pass the uniqueness predicate check before either commits.

### Q6 — Must supersession become monotonic and irreversible?

**Yes, unconditionally.**

If SUPERSEDED continuity can re-enter ACTIVE:
- Revocation cascades become unsound (a revoked-then-reactivated continuity re-opens dead authority lineages).
- Epoch ordering becomes non-monotonic.
- Replay lineage becomes ambiguous.

`SUPERSESSION_MONOTONICITY` (INV-3) must be enforced as a state machine constraint with no SUPERSEDED → ACTIVE transition path.

### Q7 — What canonical invariants are required for `SINGLE_ACTIVE_CHILD`, `DETERMINISTIC_LEAF_ELECTION`, `SUPERSESSION_MONOTONICITY`, `CONTINUITY_EPOCH_BINDING`?

See §5 (INV-1 through INV-7). All four required invariants are currently absent from the invariant registry in `src/reconciliation/reconciliation-invariants.ts`.

### Q8 — Can replay lineage remain deterministic without continuity epochs?

**No.** Without `continuity_epoch`, a replay record cannot be distinguished from a record created under a superseded lineage generation. Superseded-lineage replays are indistinguishable from current-lineage replays by current eligibility logic, which checks only status and hash equality — not generational binding.

### Q9 — What reconciliation classes are required for sibling forks / supersession conflicts / stale replica divergence / orphaned supersession chains / replay epoch drift?

See §7. Eight new reconciliation classes are required. None currently exist.

### Q10 — What remaining topology dependencies survive after canonical supersession?

After complete implementation of §5–§7:

1. **Propagation lag** (RW-1): Stale SUPERSEDED row not yet visible. This is irreducible in asynchronous replication — it is bounded by replica sync interval.
2. **Distributed constraint enforcement** (RW-2): `SINGLE_ACTIVE_CHILD` requires coordinator-level enforcement under partition.
3. **Epoch propagation** for replay: The `continuity_epoch` of a new child must propagate before replays bound to the new epoch are evaluated.
4. **Cross-registry hash consistency**: Convergence of `registry_hash` across replicas remains topology-observational for the purpose of detecting that supersession has propagated.

The first three dependencies are **irreducible in a fully asynchronous distributed system**. They can be bounded (by synchronous write paths or quorum reads) but not eliminated.

---

## 10. Highest-Leverage Closure Target

**G1 — Introduce `SUPERSEDED` as a canonical continuity status, with `superseded_by`, `superseded_at`, and `continuity_epoch` fields.**

This is the highest-leverage single change because:

1. It is the prerequisite for every other closure target.
2. It converts leaf election from observational (anti-join) to authoritative (status field read).
3. It enables single-row legitimacy determination on any replica that has received the superseded row.
4. It provides the epoch anchor for replay eligibility enforcement.
5. It enables six of the eight required reconciliation classes (§7) to become detectable.
6. It enables all five required invariants (INV-1 through INV-6) to be expressed and enforced.

**Second highest-leverage**: The atomic write boundary (§6.3 unique constraint + §6.5 transaction semantics). Without it, SUPERSEDED introduction creates TOCTOU between status write and child insertion.

---

## Final Classification

```
PARTIAL
```

**Justification**:

The system achieves:
- Fail-closed execution (CLOSED on execution mutation)
- Replay resistance (CLOSED on replay attacks)
- Revocation cascade (CLOSED on revocation propagation)
- Evidence-only distributed layer (CLOSED on authority non-issuance)

The system does not achieve:
- Topology-independent leaf election (OPEN)
- Authoritative supersession state (OPEN)
- Epoch-bound replay eligibility (OPEN)
- Sibling fork prevention (OPEN)
- Deterministic distributed legitimacy convergence (OPEN)

Current state: **topology-contained execution safety**.

Target state: **topology-independent continuity legitimacy**.

The gap between these states is structural — it requires schema extension, invariant introduction, and transactional boundary enforcement — not behavioral patching of the existing execution barriers.

---

*Analysis references:*
- `src/runtime/continuity/verifyContinuityLineage.ts`
- `src/distributed-continuity-lineage-reconciliation.ts`
- `src/continuity-lineage-closure-hardening.ts`
- `src/distributed-replay-convergence.ts`
- `src/distributed-topology-convergence.ts`
- `runtime/control_graph_continuity.ts`
- `runtime/control_graph_authority.ts`
- `runtime/control_graph_replay.ts`
- `runtime/control_graph_validator.ts`
- `src/reconciliation/reconciliation-invariants.ts`
- `src/canonical.js`
- Issues #1219, #1220
