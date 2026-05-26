# MindShift Distributed Partition-Finality Canon Assignment

## Scope and framing

This analysis defines canonical distributed legitimacy behavior under asynchronous partition conditions.

It distinguishes:

- **Local runtime correctness** (single-node validity checks).
- **Distributed legitimacy convergence** (cross-topology finality across delayed, partial, or conflicting evidence).

Canonical base invariant remains:

- If no valid object exists → nothing happens.

And execution admissibility remains:

- `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`.
- Else → `NULL`.

## 1) Partition-finality taxonomy

### State set

- **TENTATIVE_FINAL**: Object is locally valid but lacks sufficient topology visibility for canonical settlement.
- **LOCAL_FINAL**: Object is final for a bounded local partition scope only; cannot authorize global exclusivity.
- **PARTITIONED_FINAL**: Object reached quorum in a partition but conflict possibility remains because federation/global checkpoints are incomplete.
- **RECONCILIATION_PENDING**: Object is paused from finality promotion until reconciliation graph closure is computed.
- **SPLIT_BRAIN_VISIBLE**: Contradictory ACTIVE lineage or epoch claims are simultaneously observable.
- **TOPOLOGY_AMBIGUOUS**: Evidence graph is insufficient to establish a single canonical causal order.
- **GLOBAL_FINAL**: Object is topology-visible, replay-safe, conflict-free, and recursively reconcilable across required federation boundaries.
- **REVOKED_FINALITY**: Previously non-global final object is deterministically downgraded after revocation/supersession evidence.

### Finality ordering

Canonical monotone partial order:

`TENTATIVE_FINAL/LOCAL_FINAL/PARTITIONED_FINAL -> RECONCILIATION_PENDING -> GLOBAL_FINAL`

with downgrade edges:

- Any non-global state -> `REVOKED_FINALITY` upon valid revocation lineage.
- Any state -> `SPLIT_BRAIN_VISIBLE` when competing canonical candidates coexist.
- Any state -> `TOPOLOGY_AMBIGUOUS` when ordering constraints are underdetermined.

### Authoritative rule

- Local legitimacy is **never** sufficient for global authority inheritance.
- Distributed convergence is authoritative only at `GLOBAL_FINAL`.
- Partition ambiguity must fail closed to `NULL` for mutation/execution eligibility.

## 2) Distributed legitimacy state model

Each candidate object carries a state vector:

- `object_hash`
- `lineage_root`
- `continuity_epoch`
- `authority_id`
- `replay_nonce`
- `topology_view_id`
- `checkpoint_set`
- `revocation_frontier`
- `reconciliation_status`
- `finality_state`

Canonical predicate:

`LEGITIMATE_DISTRIBUTED(object) :=`

`VALID(object)`
`∧ AUTHORIZED(object)`
`∧ UNUSED(object.replay_nonce)`
`∧ POLICY_VALID(object)`
`∧ TOPOLOGY_VISIBLE(object, topology_view_id)`
`∧ RECONCILABLE(object, checkpoint_set, revocation_frontier)`
`∧ NO_CONFLICTING_CANON(lineage_root, continuity_epoch)`

Else deterministic result class in `{NULL, INVALID, BLOCKED, QUARANTINED}`.

## 3) Finality downgrade/upgrade canon

### Upgrade gates

1. **Syntactic + semantic validity** (`VALID`).
2. **Authority lineage closure** (continuity ancestry complete).
3. **Replay gate** (`UNUSED`, nonce/epoch monotonicity satisfied).
4. **Topology visibility threshold** (required federation observers/checkpoints visible).
5. **Conflict exclusion** (no concurrent winning branch for same exclusivity domain).
6. **Reconciliation closure** (recursive lineage reconcilable).

Only then: `GLOBAL_FINAL`.

### Downgrade gates

Immediate downgrade from any non-revoked state when:

- Late revocation supersedes authority lineage.
- Higher canonical epoch proves branch staleness.
- Divergent checkpoint set invalidates assumed causal order.
- Split-brain evidence appears for same exclusivity key.

Downgrade target:

- `REVOKED_FINALITY` if supersession/revocation proved.
- `RECONCILIATION_PENDING` if evidence incomplete but not contradictory.
- `SPLIT_BRAIN_VISIBLE` / `TOPOLOGY_AMBIGUOUS` if contradictory or underdetermined.

## 4) Split-brain reconciliation semantics

### Detection class

`SPLIT_BRAIN_VISIBLE` iff at least two candidates satisfy local validity but conflict on exclusivity dimensions:

- same `continuity lineage scope`, or
- same `authority consumption scope`, or
- same `replay nonce domain`, or
- incompatible federation checkpoint ancestry.

### Containment canon

- No conflicting branch may execute additional state mutations under global authority assumption.
- Conflicted candidates enter legitimacy quarantine.
- Only reconciliation may release quarantine.

### Arbitration ordering

1. Reject non-reconcilable lineage (orphan, invalid ancestry).
2. Apply revocation frontier (hard invalidate revoked branches).
3. Apply epoch monotonicity (highest valid epoch only if ancestry-consistent).
4. Apply checkpoint compatibility.
5. Apply deterministic tie-breaker (`canonical hash order`) only after 1-4.

If winner unresolved: `NULL` for execution surface.

## 5) Replay invalidation semantics

Replay invalidation boundary is distributed, not local-only.

A replay candidate is invalid if any of the following is true:

- nonce already consumed in any reconciled partition branch.
- candidate epoch < canonical settled epoch for lineage root.
- candidate depends on revoked authority lineage.
- candidate references checkpoint set incompatible with canonical branch.

Rule: stale topology visibility cannot resurrect consumed authority.

## 6) Quorum + federation legitimacy rules

### Quorum disagreement

- Quorum signals are evidence, not authority by themselves.
- Quorum with stale visibility yields at most `PARTITIONED_FINAL`.

### Federation divergence

- Remote evidence may be imported as observability material.
- Remote authority is not inherited unless local canonical policy admits it and reconciliation closure succeeds.

### Observer disagreement

- Contradictory observers elevate to topology-visible conflict class.
- Conflict class must block execution promotion to `GLOBAL_FINAL`.

## 7) Topology-visible conflict classification

Canonical drift classes required for observability and rejection determinism:

1. `partition_finality_divergence`
2. `stale_quorum_visibility`
3. `split_brain_legitimacy`
4. `asynchronous_reconciliation_instability`
5. `replay_epoch_partition_drift`
6. `topology_finality_ambiguity`
7. `distributed_checkpoint_divergence`
8. `federation_visibility_mismatch`
9. `delayed_revocation_visibility`
10. `local_global_legitimacy_divergence`
11. `reconciliation_finality_conflict`
12. `topology_partition_authority_survival`

Each class is fail-closed: cannot authorize execution while unresolved.

## 8) Distributed reconciliation ordering model

Canonical reconciliation pass order:

1. Ingest evidence append-only.
2. Verify cryptographic and schema validity.
3. Build causal DAG by lineage + epoch + checkpoint ancestry.
4. Mark revocation closures.
5. Detect exclusivity collisions (authority/replay domains).
6. Compute deterministic branch admissibility.
7. Emit state transitions with proofs.
8. Promote only conflict-free candidates to `GLOBAL_FINAL`.

Determinism requirement: identical evidence set → identical finality map.

## 9) Local vs global legitimacy canon

- **Local legitimacy**: object can be processed for tentative handling inside a partition.
- **Global legitimacy**: object can survive cross-partition reconciliation and exclusivity checks.

Therefore:

- `LOCAL_FINAL != GLOBAL_FINAL`
- `reconciliation complete != finality guaranteed`
- `visibility partial != legitimacy canonical`

## 10) Partition-heal convergence semantics

Upon partition heal:

1. Freeze promotion of partition-scoped finals.
2. Exchange checkpoint + revocation frontier deltas.
3. Recompute canonical DAG.
4. Downgrade invalidated branches deterministically.
5. Emit reconciliation proofs for all changed finality states.
6. Re-open execution only for `GLOBAL_FINAL` objects.

No rollback resurrection:

- once authority is globally consumed/revoked on canonical branch, healed partitions cannot resurrect it.

## Determinism answer to key question

Can runtime guarantee topology-independent deterministic distributed legitimacy convergence under asynchronous partition conditions?

**Answer**: only if finality authority is restricted to `GLOBAL_FINAL` and all partition-scoped states remain non-authoritative for execution escalation. Otherwise legitimacy remains partially observational and must fail closed to `NULL` for contested mutations.

## Acceptance criteria mapping

- Distributed finality states canonically defined: satisfied via taxonomy.
- Local vs global legitimacy formally separated: satisfied via dual-state canon.
- Split-brain classifiable: satisfied via conflict classes + containment.
- Replay eligibility partition-safe: satisfied via distributed invalidation boundary.
- Stale visibility cannot resurrect authority: explicit invalidation rule.
- Reconciliation deterministic under partition: canonical pass order + identical-input determinism.
- Contradictory states topology-visible: explicit `SPLIT_BRAIN_VISIBLE` / drift classes.
- Partition-heal convergence canonical: heal sequence defined.
- Topology ambiguity fails closed: `TOPOLOGY_AMBIGUOUS -> NULL` for execution.
- Distributed convergence formally modelable: state vector + predicates.

