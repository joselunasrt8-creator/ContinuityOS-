# Continuity Epoch Legitimacy Analysis

**Branch:** `claude/continuity-epoch-legitimacy-93OvA`  
**Scope:** Epoch legitimacy analysis — structural findings, required schema additions, required invariants, and closure classification  
**Boundary:** Evidence-only analysis. No execution authority created. No mutation surface widened. No deployment capability added.

---

## 0. Canonical Axioms (Preserved Throughout)

```
If no valid object exists → nothing happens

validated_object == executed_object

No valid continuity lineage
  → no valid authority
  → no valid execution

All persisted lineage must remain recursively reconcilable.

Execution eligibility:
  VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID
  ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE
  → else NULL
```

---

## 1. Structural Findings

### 1.1 `continuity_epoch` Does Not Exist in the Current Schema

The `continuity_registry` table has no epoch column:

```sql
-- current continuity_registry columns:
continuity_id, identity_id, session_id, parent_continuity_id,
continuity_hash, canonical_continuity, status,
issued_at, expires_at, revoked_at
-- MISSING: continuity_epoch, epoch_seq, epoch_binding_hash
```

The concept appears in three places, but none are authoritative:

| Location | Field | Type | Status |
|---|---|---|---|
| `DistributedContinuityRegistryView` | `registry_epoch` | `string` | Opaque label; not enforced |
| `execution_snapshot_registry` | `replay_epoch` | `TEXT` | Opaque string; no monotonicity guard |
| `TemporalLineageNode` | `epoch` | `number` | Runtime-only; never persisted |

**Finding:** epoch exists only as an informal label on distributed view structures and snapshot records. It is never bound to the authoritative continuity lineage itself. This creates a gap: epoch advancement can occur while all dependent objects (authority, AEO, validation, execution, proof) remain epoch-oblivious.

### 1.2 Registry Epoch Is Determined by Plurality Vote, Not Lineage Authority

`evaluateContinuityLineageConvergence` (in `src/distributed-continuity-lineage-reconciliation.ts`) derives `canonical_epoch` by finding the `registry_hash` held by the most replica views:

```typescript
// selects whichever registry_hash appears most often
let topHash = ''
let topCount = 0
for (const [h, count] of hashCounts.entries()) {
  if (count > topCount) { topCount = count; topHash = h }
}
// canonical_epoch = epoch of the plurality-holding view
```

This is topology observation masquerading as lineage authority. A majority coalition of stale replicas can report a stale epoch as canonical without the lineage ever having advanced. **Epoch ≠ topology observation** — but the current runtime treats them as equivalent.

### 1.3 Delegated Authority Has No Epoch Inheritance

`delegated_authority_registry` (migration `0030`) carries:

```sql
delegation_lineage_hash, delegation_root_hash, delegated_replay_chain_hash
```

None bind to a `continuity_epoch`. A delegation issued in epoch N may be exercised in epoch N+k with no schema-level rejection. The delegation chain hash does not include epoch state, so a delegated authority crossing an epoch boundary is structurally indistinguishable from one that does not.

### 1.4 PRE Objects Are Not Epoch-Anchored

`preo_registry` columns:

```sql
preo_id, decision_id, authority_id, continuity_id,
reviewed_hash, reviewed_tree_hash, merge_commit_sha,
canonical_preo, status, created_at
-- MISSING: continuity_epoch, epoch_anchor_hash
```

A PREO is a snapshot of a reviewed object at a specific tree state. If the continuity lineage advances to a new epoch after PREO creation, the PREO carries no information about which epoch it was generated under. Post-epoch PRE objects are structurally valid objects without any epoch mismatch signal.

### 1.5 Proofs Are Not Epoch-Sensitive

`proof_registry` carries `continuity_hash` and `authority_lineage` but no epoch binding. Two proofs — one from epoch N and one from epoch N+1 — are distinguished only by their `continuity_id` and `continuity_hash`. If the continuity object is the same (i.e., the continuity lineage advanced but this specific `continuity_id` was not revoked), both proofs are structurally identical in their epoch dimension.

### 1.6 Stale Reservations Have No Epoch Death Signal

Authority status transitions: `ACTIVE → RESERVED → EXECUTED → CONSUMED`

The schema enforces single-use via nonce and hash uniqueness, but no column marks the epoch under which a reservation was made. An authority reserved in epoch N with status `RESERVED` is eligible for execution in epoch N+k as long as:
- status = RESERVED (or ACTIVE)
- continuity_id points to an ACTIVE continuity record
- nonce is unused

If epoch advancement does not cascade a revocation to the authority record, the reservation survives indefinitely across epoch boundaries. This is a **dead lineage** path: the authority traces back to a pre-epoch lineage root but the epoch advancement is not reflected in any column the execution gate checks.

### 1.7 Execution Barriers Have No Epoch Equality Check

The execution gate checks: `VALID ∧ AUTHORIZED ∧ UNUSED ∧ REPLAY_SAFE`

None of these check epoch equality between:
- the epoch at validation time
- the epoch at execution time

The `execution_snapshot_registry.replay_epoch` is stored after execution succeeds, making it a record of fact rather than a pre-execution barrier.

### 1.8 Distributed Replicas Can Authorize Stale Epochs

`inspectTemporalLineageReplay` flags epoch disagreement:

```typescript
if (node.epoch !== input.expectedEpoch) {
  issues.push({ class: 'epoch-induced', code: 'epoch_disagreement', ... })
}
```

But `expectedEpoch` is a caller-supplied parameter — it is not derived from the authoritative lineage. A distributed replica can pass any `expectedEpoch` value. If the replica is isolated from the advancing replica set, it can present its locally-current (but globally-stale) epoch as expected and pass its own epoch check. The `fail_closed_epoch_disagreement` flag surfaces this but does not block execution.

### 1.9 Epoch Monotonicity Is Not Enforced

`registry_epoch` is typed as `string` in `DistributedContinuityRegistryView`. `replay_epoch` is a `TEXT` column. Neither has a schema constraint requiring strictly increasing values. Lexicographic ordering of string epochs is an assumption, not an invariant.

### 1.10 Epoch Rollback Is Not Explicitly Prohibited

No trigger or constraint prevents inserting a `registry_epoch` value lower than a previously seen value. The `cross_registry_reconciliation_registry` table has no `min_observed_epoch` or `epoch_monotonicity_hash` column, so there is no durable record of the highest epoch ever observed, making rollback detection impossible from stored state alone.

### 1.11 Reconciliation Has No Epoch Conflict Class

`cross_registry_reconciliation_registry.drift_classes` is a free-text field. Epoch conflicts are not modeled as a first-class drift class. Two reconciliation records from different epochs cannot be classified as being in different legitimacy classes by the schema — they appear as two reconciliation runs with different hashes.

---

## 2. Required Schema Additions

### 2.1 `continuity_epoch` on `continuity_registry`

```sql
ALTER TABLE continuity_registry
  ADD COLUMN continuity_epoch         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE continuity_registry
  ADD COLUMN epoch_issued_at          TEXT;
ALTER TABLE continuity_registry
  ADD COLUMN epoch_binding_hash       TEXT;

-- Monotonicity guard: child epoch >= parent epoch
CREATE TRIGGER IF NOT EXISTS trg_continuity_epoch_monotonic
BEFORE INSERT ON continuity_registry
WHEN NEW.parent_continuity_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM continuity_registry p
  WHERE p.continuity_id = NEW.parent_continuity_id
    AND p.continuity_epoch > NEW.continuity_epoch
)
BEGIN
  SELECT RAISE(ABORT, 'continuity_epoch must be >= parent epoch (monotonic)');
END;
```

### 2.2 Epoch Columns on All Epoch-Dependent Tables

Every table that carries `continuity_id` must also carry the epoch under which that continuity was valid at record creation time:

| Table | Column to Add |
|---|---|
| `authority_registry` | `continuity_epoch INTEGER` |
| `aeo_registry` | `continuity_epoch INTEGER` |
| `validation_registry` | `continuity_epoch INTEGER` |
| `execution_registry` | `continuity_epoch INTEGER` |
| `proof_registry` | `continuity_epoch INTEGER` |
| `preo_registry` | `continuity_epoch INTEGER`, `epoch_anchor_hash TEXT` |
| `delegated_authority_registry` | `continuity_epoch INTEGER`, `delegation_epoch_hash TEXT` |
| `invocation_registry` | `continuity_epoch INTEGER` |

### 2.3 Epoch Conflict Class on `cross_registry_reconciliation_registry`

```sql
ALTER TABLE cross_registry_reconciliation_registry
  ADD COLUMN epoch_conflict_class TEXT
    CHECK (epoch_conflict_class IS NULL
        OR epoch_conflict_class IN (
          'EPOCH_EQUIVALENT',
          'EPOCH_DIVERGED',
          'EPOCH_ROLLBACK_DETECTED',
          'EPOCH_PARTIAL_VISIBILITY',
          'EPOCH_STALE_MAJORITY',
          'NULL'
        ));
ALTER TABLE cross_registry_reconciliation_registry
  ADD COLUMN canonical_epoch_observed INTEGER;
ALTER TABLE cross_registry_reconciliation_registry
  ADD COLUMN min_epoch_observed       INTEGER;
ALTER TABLE cross_registry_reconciliation_registry
  ADD COLUMN max_epoch_observed       INTEGER;
```

### 2.4 Epoch Monotonicity Registry (append-only)

```sql
CREATE TABLE IF NOT EXISTS epoch_monotonicity_registry (
  epoch_record_id       TEXT PRIMARY KEY,
  lineage_root_id       TEXT NOT NULL,
  prior_epoch           INTEGER NOT NULL,
  advanced_epoch        INTEGER NOT NULL,
  epoch_advancement_hash TEXT NOT NULL UNIQUE,
  continuity_id         TEXT NOT NULL,
  evidence_only         TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral        TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable      TEXT NOT NULL CHECK (mutation_capable='false'),
  creates_authority     TEXT NOT NULL CHECK (creates_authority='false'),
  created_at            TEXT NOT NULL,
  CHECK (advanced_epoch > prior_epoch)
);

CREATE TRIGGER IF NOT EXISTS trg_epoch_monotonicity_registry_no_update
BEFORE UPDATE ON epoch_monotonicity_registry
BEGIN
  SELECT RAISE(ABORT, 'epoch_monotonicity_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_epoch_monotonicity_registry_no_delete
BEFORE DELETE ON epoch_monotonicity_registry
BEGIN
  SELECT RAISE(ABORT, 'epoch_monotonicity_registry is append-only');
END;
```

---

## 3. Required Invariants

### I-1: Epoch Inheritance
> Every object whose existence depends on a continuity_id must inherit and persist the `continuity_epoch` of that continuity record at the time of object creation.

### I-2: Epoch Monotonicity
> `continuity_epoch` must be strictly non-decreasing across any parent→child continuity chain. A child continuity with epoch < parent epoch is structurally invalid.

### I-3: Epoch Rollback Impossibility
> No update or delete may reduce the `continuity_epoch` on any record. The `epoch_monotonicity_registry` must contain a record for every epoch advancement, and the absence of such a record implies the epoch has never been higher than 0.

### I-4: Replay Epoch Binding
> Replay eligibility requires: `replay.continuity_epoch == current canonical continuity_epoch`. A replay candidate whose epoch < canonical epoch is classified as `STALE_EPOCH_REPLAY` and is ineligible regardless of continuity_id status.

### I-5: Delegated Authority Epoch Inheritance
> A delegated authority must carry the epoch of the parent authority at delegation time. Exercise of the delegation across an epoch boundary (delegated epoch < current continuity epoch) must fail with `DELEGATION_EPOCH_STALE`.

### I-6: PREO Epoch Anchoring
> A PREO must carry the `continuity_epoch` in effect at review time. A PREO with epoch < current continuity epoch is `EPOCH_STALE_PREO` and must not proceed to execution validation.

### I-7: Execution Barrier Epoch Equality
> Before execution, the runtime must verify:
> `snapshot.continuity_epoch == continuity_registry[continuity_id].continuity_epoch`
> Inequality → NULL, drift class `EXECUTION_EPOCH_MISMATCH`.

### I-8: Stale Reservation Death
> An authority in status `RESERVED` whose `continuity_epoch < current canonical epoch` is `DEAD_LINEAGE`. It must be blocked at the execution gate and logged as drift class `STALE_RESERVATION_DEAD_LINEAGE`. It must not be eligible for execution even if the continuity_id remains ACTIVE.

### I-9: Distributed Replica Epoch Authorization Boundary
> A distributed replica may not authorize execution under an epoch it cannot prove is the current canonical epoch. Proof of canonical epoch requires: a quorum of replicas with matching `continuity_epoch` AND a monotonicity record in `epoch_monotonicity_registry`. Absence of quorum → `EPOCH_PARTIAL_VISIBILITY` → NULL.

### I-10: Reconciliation Epoch Conflict Classification
> Every `cross_registry_reconciliation_registry` record must classify its `epoch_conflict_class`. If `max_epoch_observed > min_epoch_observed` across participating views, the conflict class must be `EPOCH_DIVERGED` or `EPOCH_STALE_MAJORITY`. A record with `epoch_conflict_class = NULL` is structurally incomplete.

---

## 4. Replay Implications

### 4.1 Pre-epoch Replay Is Currently Undetected

Under the current schema, a replay attempt using an authority from epoch N-1 against a system in epoch N will fail only if:
- The `invocation_nonce` was already used (nonce replay block), OR
- The `continuity_id` was explicitly revoked

It will NOT fail if:
- The continuity_id remains ACTIVE (revocation was not cascaded)
- The nonce has not been used yet (first attempt in new epoch)
- The authority status is RESERVED (not yet CONSUMED)

This is the dead-lineage replay path: structurally valid objects from a prior epoch remaining executable after epoch advancement.

### 4.2 Required Replay Eligibility Extension

`verifyReplayLineageEligibility` must be extended to check:

```typescript
// Required addition:
if (entry.continuity_epoch !== undefined
    && canonical_epoch !== undefined
    && entry.continuity_epoch < canonical_epoch) {
  return { eligible: false, ineligibility_reason: 'stale_epoch_replay' }
}
```

New drift class required: `STALE_EPOCH_REPLAY` in `CONTINUITY_LINEAGE_DRIFT_CLASSES`.

### 4.3 Replay Lineage Hash Must Include Epoch

The current `lineage_hash` in `ContinuityReplayRecord` does not incorporate epoch. A replay lineage hash computed identically in two different epochs would match despite representing different legitimacy states. Epoch must be a component of lineage hash derivation.

---

## 5. Reconciliation Implications

### 5.1 Reconciliation Cannot Currently Classify Epoch Conflicts

`cross_registry_reconciliation_registry.drift_classes` is a free-text field. Without `epoch_conflict_class`, two registry views — one at epoch 3, one at epoch 5 — are reconciled with `RECONCILIATION_REQUIRED` but the reconciliation record carries no structural information about why they diverged. This blocks deterministic conflict resolution.

### 5.2 Reconciliation Closure Requires Epoch Class Partitioning

All registries participating in a reconciliation run must be classified into epoch equivalence classes:

```
epoch_class(registry_view) = continuity_epoch
```

Reconciliation is only deterministic within an epoch class. Cross-epoch reconciliation (views from different epochs being merged) must produce `EPOCH_DIVERGED` and must not proceed to `RECONCILED` until epoch equality is established.

### 5.3 Epoch Stale Majority Is Harder to Detect Than Simple Divergence

A network partition where N-1 replicas are at epoch 4 and 1 replica is at epoch 5 will produce:
- `canonical_epoch = 4` (plurality vote)
- The single advanced replica is classified as diverged

This is the inverse of correct behavior: the advanced replica holds the legitimate epoch, but the current convergence algorithm elects the stale majority as canonical. **Majority vote is not epoch authority.**

Correct behavior: epoch is authoritative by monotonicity record, not by count. The `epoch_monotonicity_registry` record for epoch 5 is the authoritative signal regardless of quorum.

---

## 6. Distributed Race Analysis

### 6.1 Concurrent Epoch Advancement + Authority Exercise

**Race condition:**
1. Thread A: epoch advances (continuity_epoch N → N+1)
2. Thread B: authority reserved in epoch N is submitted for execution
3. Thread A's epoch write and Thread B's execution gate check are not atomic

**Current outcome:** Thread B proceeds if it reads epoch N before the advancement completes. No isolation boundary exists at the execution gate for epoch reads.

**Required:** Execution gate must read `continuity_epoch` from `continuity_registry` within the same atomic transaction that checks authority validity.

### 6.2 Concurrent Delegation + Epoch Advancement

A delegation issued at epoch N is cloned to a child authority at epoch N. If epoch advances to N+1 between delegation issuance and delegation exercise, the delegated authority carries epoch N while the system is at epoch N+1. Under invariant I-5, this is `DELEGATION_EPOCH_STALE`.

Current schema: delegation has no epoch column, so this race produces no observable error signal.

### 6.3 PREO Review Straddling Epoch Boundary

A PREO is submitted for review when epoch = N. Review takes time. Epoch advances to N+1 during review. The PREO is accepted and stored with status ACTIVE. At execution gate, the PREO's epoch (N) is less than current epoch (N+1). Under invariant I-6, this is `EPOCH_STALE_PREO`.

Current schema: no epoch on PREO, so this is undetectable at the execution gate.

### 6.4 Stale Replica Authorizing Execution

A replica that has not received the epoch N+1 advancement may still serve authority lookups using epoch N state. If execution is gated only on local replica state, the replica can authorize an execution that the canonical epoch would reject.

Current system: distributed quorum classification in `inspectTemporalLineageReplay` flags `STALE_REPLAY` if `authority_status === 'STALE'` — but `STALE` is not a defined authority_status value in the schema. The comparison is against a free-text field, making this detection unreliable.

---

## 7. Closure Classification

### 7.1 Open Closure Items

| ID | Class | Location | Severity |
|---|---|---|---|
| EC-01 | `EPOCH_COLUMN_MISSING` | `continuity_registry` | **Critical** — no epoch in lineage root |
| EC-02 | `EPOCH_INHERITANCE_GAP` | All epoch-dependent tables | **Critical** — epoch oblivious to dependents |
| EC-03 | `PREO_EPOCH_UNANCHORED` | `preo_registry` | **High** — PRE objects cross epoch boundary silently |
| EC-04 | `DELEGATION_EPOCH_UNBOUND` | `delegated_authority_registry` | **High** — delegations survive epoch advancement |
| EC-05 | `STALE_RESERVATION_DEAD_LINEAGE` | `authority_registry` | **High** — RESERVED authorities from prior epochs are executable |
| EC-06 | `EXECUTION_BARRIER_EPOCH_MISSING` | `execution_snapshot_registry` | **High** — no pre-execution epoch equality check |
| EC-07 | `PROOF_EPOCH_OBLIVIOUS` | `proof_registry` | **Medium** — proofs from different epochs are structurally identical |
| EC-08 | `RECONCILIATION_EPOCH_CLASS_ABSENT` | `cross_registry_reconciliation_registry` | **Medium** — epoch conflicts not classified |
| EC-09 | `MAJORITY_VOTE_EPOCH_AUTHORITY` | convergence evaluation | **High** — epoch determined by count, not monotonicity record |
| EC-10 | `EPOCH_MONOTONICITY_NOT_ENFORCED` | schema/triggers | **Critical** — no durable monotonicity guarantee |
| EC-11 | `REPLAY_EPOCH_BIND_ABSENT` | `verifyReplayLineageEligibility` | **High** — stale epoch replay undetected |
| EC-12 | `DISTRIBUTED_REPLICA_EPOCH_GATE_ABSENT` | distributed execution path | **High** — replica may authorize stale epoch |

### 7.2 Closed Invariants (Already Enforced)

These remain sound and must be preserved:

- `validated_object == executed_object` — enforced by hash comparison in execution gate
- Nonce single-use — enforced by `invocation_registry` primary key
- Proof uniqueness — enforced by `UNIQUE(workflow_run_id)` on `proof_registry`
- Continuity revocation cascade — `verifyContinuityLineage` checks status and revoked_at
- Append-only registries — triggers on all evidence-only tables
- `proof_registry` requires valid execution — `trg_proof_registry_requires_valid_execution`
- `decision_hash` integrity — `trg_proof_registry_decision_hash_guard`

---

## 8. Highest-Leverage Closure Target

**EC-01 + EC-10 together: Add `continuity_epoch INTEGER` to `continuity_registry` with a monotonicity trigger.**

This is the highest-leverage closure because:

1. Once `continuity_epoch` exists on the lineage root, every dependent table can inherit it at creation time (EC-02 through EC-07 become mechanical derivations).
2. The monotonicity trigger (EC-10) makes epoch rollback structurally impossible without the trigger being explicitly bypassed.
3. The execution gate epoch equality check (EC-06) becomes a simple column comparison rather than a cross-table lookup.
4. Stale-reservation dead-lineage detection (EC-05) becomes a `WHERE authority.continuity_epoch < continuity.continuity_epoch` predicate.
5. Reconciliation epoch conflict classification (EC-08) becomes a `MAX(epoch) != MIN(epoch)` check across participating views.
6. Replay lineage eligibility (EC-11) gains a deterministic epoch comparison rather than a status heuristic.

Without EC-01, every other closure item remains dependent on out-of-band coordination between callers — the lineage itself cannot be the authority on its own epoch.

---

## 9. Summary

**Primary finding:** `continuity_epoch` does not exist on `continuity_registry`. Epoch is observable only as an informal label on distributed view structures and as an opaque string in execution snapshots. It is not a first-class lineage primitive.

**Consequence:** Legitimacy is not deterministic once continuity supersession introduces authoritative epochs, because:
- Epoch advancement cannot be detected by dependent objects (authority, AEO, validation, execution, proof, PREO, delegation) — they carry no epoch column
- Stale reservations survive epoch advancement
- Distributed replicas can authorize stale epochs because epoch authority is determined by plurality vote rather than monotonicity record
- Reconciliation cannot classify epoch conflicts as a distinct drift class
- Replay eligibility does not include epoch comparison

**Resolution path:** EC-01 (add `continuity_epoch` to `continuity_registry` with monotonicity trigger) is the single closure that enables all other epoch-dependent invariants to be mechanically enforced. It is the correct first migration.

**Preserved invariants:** All existing closure invariants remain sound. This analysis proposes additions only. No existing replay resistance, nonce uniqueness, proof uniqueness, revocation cascade, or append-only enforcement is weakened.

```
evidence_only: true
creates_authority: false
executable: false
deployment_capable: false
mutation_capable: false
```
