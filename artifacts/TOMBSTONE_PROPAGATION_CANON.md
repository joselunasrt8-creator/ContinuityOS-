# Distributed Tombstone Propagation Canon Analysis

**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** claude/tombstone-propagation-analysis-ylZuY  
**Date:** 2026-05-25  
**Scope:** Evidence-only analysis. No authority created, no state mutated, no execution widened.

---

## Executive Summary

Tombstone propagation in MindShift is **partially canonical, locally monotonic, and not topology-independent** under the current schema. The system possesses a revocation propagation engine (`src/recursive-revocation-propagation.ts`) and a reconciliation layer (`src/cross-registry-legitimacy-reconciliation.ts`) that together constitute a tombstone dissemination substrate, but neither achieves full distributed canonicity. The primary tombstone signal—`continuity_registry.status = 'REVOKED'`—is **not append-only, not epoch-bound, not schema-enforced across dependent registries, and not topology-propagated** to stale replicas. Proof anchoring (`proof_registry` UNIQUE triggers) is the only structurally irreversible death-boundary in the current schema. Seven structural gaps prevent tombstone propagation from reaching canonical, topology-independent, recursively reconcilable status.

---

## 1. Tombstone Propagation Canon — Derivation Source

### 1.1 What tombstone propagation derives from

Tombstone dissemination in MindShift derives from a composite of three partially-independent sources:

**Source A — Continuity revocation status (`continuity_registry.status`):**
`schema.sql:17–29` — `status TEXT NOT NULL` with `revoked_at TEXT`. The `REVOKED` status value is the primary lineage tombstone signal. However:
- No `CHECK (status IN ('ACTIVE','REVOKED','EXPIRED'))` constraint enforces valid transitions
- No append-only trigger blocks `UPDATE continuity_registry SET status='ACTIVE', revoked_at=NULL`
- No trigger cascades REVOKED status to `authority_registry`, `aeo_registry`, `validation_registry`, `execution_registry`, or `proof_registry`

This makes revocation status **topology-observational**, not **topology-enforced**. A tombstone written to one D1 instance propagates only through application-layer reads of that status.

**Source B — Recursive revocation propagation engine (`src/recursive-revocation-propagation.ts`):**
The revocation propagation module implements BFS descendant traversal (`traverseDescendantRevocation()`), stale lineage collapse detection (`enforceStaleLineageCollapse()`), and distributed convergence verification (`verifyDistributedRevocationConvergence()`). The module is declared `evidence_only: true` throughout and explicitly rejects inputs containing forbidden fields (`creates_authority`, `mutates_registry`, `registry_mutation`, etc.). This means:

- Tombstone detection is **deterministic** (SHA-256 canonical hashing via `src/canonical.js`)
- Tombstone propagation is **observability-only** (no schema writes are issued)
- Tombstone convergence is **reported but not enforced** (`PROPAGATION_CONVERGENCE_FAILED` is a classification, not a blocking signal)

**Source C — Proof anchoring (`proof_registry`):**
`schema.sql:133–201` — `UNIQUE(execution_id, decision_id, validated_object_hash)`, `UNIQUE(workflow_run_id)`, `UNIQUE(decision_hash)`. The `trg_proof_registry_decision_hash_guard` trigger fires `BEFORE INSERT` and enforces `decision_hash = decision_id || char(31) || validated_object_hash`. The `trg_proof_registry_requires_valid_execution` trigger blocks proof insertion without a corresponding `EXECUTED` execution record. These two triggers make the proof anchor the **only structurally append-only death boundary** in the schema.

**Source D — Nonce exhaustion (`invocation_registry`):**
`schema.sql:203–211` — `PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)`. Once a triple is inserted, D1 prevents re-insertion. This is a replay tombstone, not a lineage tombstone. It is local to one D1 instance and is not propagated.

### 1.2 What tombstone propagation does NOT derive from

- **Anti-join observation:** No query structure formally anti-joins live lineage against a tombstone registry. Revocation is detected by reading the status column, not by anti-joining against a `lineage_tombstone_registry` table (which does not exist).
- **Explicit propagation records:** No `tombstone_propagation_registry` table exists. Propagation completeness is inferred by traversal of the revocation graph in `propagateRevocationLineage()`, not from persisted propagation receipts.
- **Proof anchoring:** Proof anchoring records execution evidence but does not emit a tombstone for the dead authority or continuity chain.
- **Epoch advancement:** Epoch is a runtime parameter (`TemporalLineageNode.epoch`), not a persisted field. No epoch column exists in `authority_registry`, `execution_registry`, or `proof_registry`. Epoch advancement cannot be detected from persisted state alone.
- **Quorum convergence:** `verifyDistributedRevocationConvergence()` computes hash agreement across `RevocationRegistryView` inputs but does not write a quorum record to any registry. Quorum state is ephemeral.

---

## 2. Stale Replica Tombstone Visibility

### 2.1 Can stale replicas execute tombstoned lineage?

**Yes.** No mechanism pushes tombstone signals to stale replicas. A stale replica retaining `continuity_registry.status = 'ACTIVE'` for a continuity chain that has been revoked on the canonical D1 primary will:

- Return that authority as valid when queried
- Accept validation requests referencing the revoked continuity
- Allow execution against the revoked authority if the nonce has not been inserted into its local `invocation_registry`

The reconciliation layer (`src/cross-registry-legitimacy-reconciliation.ts`) is `OBSERVABILITY_ONLY` (`creates_authority: false` on every output) and cannot push a status update to a stale replica. The `cross_registry_reconciliation_registry` table (`schema.sql:479–503`) records reconciliation snapshots with `replay_graph_hash` and `lineage_graph_hash` but itself cannot force downstream registry updates (it has `non_authoritative='true'` enforced by CHECK constraint at line 497).

### 2.2 Can stale replicas replay RESERVED authority?

**Yes.** `authority_registry.status = 'RESERVED'` has:
- No TTL enforcement at the schema layer (the `expiry TEXT NOT NULL` column exists but no trigger compares it to current time)
- No append-only trigger preventing status regression from RESERVED to ACTIVE
- No cross-replica invalidation push when RESERVED is consumed on another node

A stale replica that last observed a RESERVED authority before consumption can replay execution against it. The `invocation_registry` PK prevents exact-nonce replay if the nonce was already inserted on that instance, but a new nonce against the same decision_id succeeds if no prior nonce exists locally.

### 2.3 Can stale replicas accept stale proofs?

**Partially blocked.** The `trg_proof_registry_decision_hash_guard` and `trg_proof_registry_requires_valid_execution` triggers fire locally. A stale proof inserted against a stale execution record on a stale replica succeeds if the triggers are satisfied locally. The UNIQUE constraint prevents duplicate proof insertion on that instance, but does not communicate the canonical proof's existence to the stale replica.

### 2.4 Can stale replicas authorize stale settlement lineage?

**Yes.** No settlement primitive exists in the schema. The closest analog—proof anchoring—is instance-local. Settlement replay (proof re-submission) is blocked only on the D1 instance that already holds the canonical proof.

### 2.5 Can stale replicas resurrect superseded continuity?

**Yes.** No supersession record invalidates a revoked continuity chain on a stale replica. The `continuity_registry.parent_continuity_id` field tracks ancestry but not supersession. A stale replica that has not received a revocation propagation can continue to serve the old continuity chain as ACTIVE.

### 2.6 Can stale replicas survive reconciliation quarantine?

**Yes.** The `legitimacy_quarantine_registry` (`schema.sql:407–463`) is append-only and records quarantine evidence, but cannot reach across replica boundaries to enforce containment. The CHECK constraint `quarantine_authoritative='false'` (line 430) explicitly declares that quarantine records do not create authority. A stale replica that does not read the canonical quarantine registry is unaffected by its contents.

---

## 3. Tombstone Propagation Races

### 3.1 Tombstone vs. execution race

The most critical race: tombstone written on node A, execution in flight on node B.

**Mechanism:** Continuity revocation is written as `UPDATE continuity_registry SET status='REVOKED', revoked_at=<ts>` on node A. Node B is executing against the same continuity chain with a previously-fetched ACTIVE status. Node B proceeds to insert into `execution_registry` and then `proof_registry`.

**Outcome on node B:** Execution succeeds on node B because its local check of `continuity_registry.status` returned ACTIVE at read time. The proof trigger `trg_proof_registry_requires_valid_execution` fires but validates only that an `EXECUTED` execution record exists—it does not re-check continuity status. The revocation tombstone has not yet propagated to node B.

**Result:** EXECUTED proof on tombstoned lineage. This is a **race-window execution on revoked continuity**, undetected until reconciliation.

### 3.2 Tombstone vs. replay race

**Mechanism:** Tombstone written on canonical node. A second execution attempt (replay) proceeds on a stale node that has not yet seen the revocation.

**Outcome:** `invocation_registry` PK blocks exact-nonce replay if the nonce was previously inserted. A new nonce against the tombstoned authority succeeds on the stale node because:
1. `continuity_registry.status` is still ACTIVE on the stale node
2. `authority_registry.status` is still ACTIVE or RESERVED on the stale node
3. No `lineage_tombstone_registry` check is performed

**Result:** New-nonce replay on revoked lineage succeeds. The invocation nonce PK only prevents re-use of one specific nonce triple; it does not seal the authority against all replay.

### 3.3 Tombstone propagation lag

`verifyDistributedRevocationConvergence()` (`recursive-revocation-propagation.ts:612–689`) detects lag by comparing `registry_hash` values across `RevocationRegistryView` inputs. When views disagree, the function returns `CONVERGENCE_PARTIAL` (majority agrees) or `CONVERGENCE_FAILED` (no majority). Neither result triggers a write to any registry or a propagation push. Lag is classified and reported; it is not resolved.

**Lag window vulnerability:** During the interval between tombstone write on the canonical node and hash convergence across all replicas, the diverging replicas remain execution-eligible. The size of this window is bounded only by reconciliation invocation frequency, which is not time-bounded in the schema.

### 3.4 Stale-majority lineage election

`classifyDistributedQuorum()` (`temporal_lineage_replay_inspector.ts:57–73`) returns `STALE_REPLAY` when any replica has `authority_status = 'STALE'` or `replay_state = 'REPLAYED'`. This is a detection classification, not a blocking signal. No schema trigger prevents execution when `STALE_REPLAY` is the quorum classification.

**Critical vulnerability:** If a majority of replicas retain stale-ACTIVE status for a tombstoned lineage, quorum classification returns `PARTIAL_VISIBILITY` (not `AGREED_INVALID`), and execution eligibility is not schema-blocked. Stale majority can elect a dead lineage as effectively live.

### 3.5 Rollback-before-propagation

Authority status is mutable (no append-only trigger on `authority_registry`). If a transaction rolls back after writing `status='RESERVED'` but before inserting into `invocation_registry`, the authority reverts to ACTIVE. If a tombstone was written in a concurrent transaction during this window, the rollback may silently resurrect the authority to ACTIVE, overriding the tombstone intent if the revocation was applied to a stale authority copy.

### 3.6 Reconciliation-before-propagation race

`reconcileCrossRegistryLegitimacy()` (`cross-registry-legitimacy-reconciliation.ts`) computes reconciliation hashes but does not block execution. A reconciliation run that observes `STALE_REGISTRY` drift returns an evidence artifact with `classification='STALE_REGISTRY'` but does not prevent subsequent execution on the stale registry. Propagation must complete independently.

### 3.7 Sibling fork propagation ambiguity

`schema.sql` permits multiple `continuity_registry` children of the same `parent_continuity_id` (no constraint blocks multiple non-REVOKED children). Two sibling continuity chains can both be ACTIVE simultaneously. If one sibling is tombstoned, propagation must reach only that sibling's descendants. However:

- `traverseDescendantRevocation()` traverses the graph from revoked roots
- If both siblings have descendants, the traversal correctly isolates the revoked subtree
- But: a stale replica may not have the sibling's revocation reflected, leading to ambiguous lineage election (which sibling is canonical?)

`classifyDistributedQuorum()` returns `REVOKED_CONFLICT` when `hasRevoked && (hasUnknown || hasAuthorized)`. This is the correct classification for sibling fork ambiguity but it is not a blocking signal.

### 3.8 Stale epoch propagation races

Epoch is a runtime parameter (`TemporalReplayInspectionInput.expectedEpoch`), not a persisted field. When epoch advances on the canonical node, stale replicas operating at the old epoch have no way to detect the advancement from persisted state alone. `inspectTemporalLineageReplay()` returns `fail_closed_epoch_disagreement: true` when `node.epoch !== input.expectedEpoch`, but this requires the caller to supply the correct `expectedEpoch`. A stale replica that supplies a stale `expectedEpoch` will not detect the disagreement.

---

## 4. Propagation Irreversibility

### 4.1 Does tombstone propagation survive rollback?

**Partially.** The status-column tombstone (`continuity_registry.status = 'REVOKED'`) does not survive rollback of its own write transaction. No append-only trigger prevents this. A database-level rollback that reverses the revocation write restores `status='ACTIVE'` and `revoked_at=NULL`.

The proof anchor (`proof_registry`) is irreversible because:
1. No `DELETE` trigger exists — proof rows cannot be deleted
2. The duplicate archive (`proof_registry_duplicate_archive`) absorbs re-insertions
3. The `trg_proof_registry_decision_hash_guard` blocks hash-mismatched re-insertion

However, proof anchoring records successful execution, not lineage death. A rolled-back revocation leaves no trace in the proof registry.

### 4.2 Does tombstone propagation survive D1 restore?

**No, for status-column tombstones.** A D1 point-in-time restore to a snapshot predating the revocation write silently restores the tombstoned lineage to ACTIVE. No append-only registry record of the revocation itself survives the restore unless a separate append-only `tombstone_event_registry` exists — which it does not.

**Partially, for proof anchors.** If the D1 restore predates the proof insertion, the proof is lost. If it postdates the proof insertion, the proof survives.

The `legitimacy_quarantine_registry` (append-only, with `trg_legitimacy_quarantine_registry_no_update` and `_no_delete` triggers) provides a durable quarantine record if a quarantine was written before the restore point. But quarantine records are not revocation records; they record containment classification, not lineage death.

### 4.3 Does tombstone propagation survive migration downgrade?

**No formal analysis possible.** The `migration_governance_registry` (`schema.sql:561–599`) is append-only and records migration governance artifacts, but a schema downgrade that removes the `revoked_at` column from `continuity_registry` or removes the REVOKED status from the authority status machine would destroy the tombstone signal at the schema level. No migration governance record prevents this.

### 4.4 Does tombstone propagation survive stale replica resurrection?

**No.** A stale replica that is brought back online after extended dormancy retains its last-known state. If revocation was written during the dormancy window, the replica resurrects with stale-ACTIVE lineage. Reconciliation must detect and classify this, but cannot force status correction (observability-only constraint).

### 4.5 Does tombstone propagation survive delayed reconciliation?

**No — during the delay window.** Reconciliation is the only mechanism that exposes tombstone state to other system components. If reconciliation is delayed, the tombstone is invisible to dependent registries.

### 4.6 Does tombstone propagation survive topology partition healing?

**Inconsistently.** When a partition heals, the `verifyDistributedRevocationConvergence()` function will compute `CONVERGENCE_PARTIAL` or `CONVERGENCE_REACHED` based on hash agreement. If the canonical revocation hash is the majority hash, convergence is classified as `CONVERGENCE_PARTIAL` or `CONVERGENCE_REACHED`. But convergence classification does not trigger a push of the tombstone to lagging replicas. The lagging replicas must independently poll and apply the reconciled state.

---

## 5. Replay Death Dissemination

### 5.1 Does replay invalidation propagate canonically?

**Partially.** Replay invalidation through nonce exhaustion (`invocation_registry` PK) is canonical on the D1 instance that holds the record. It does not propagate to other instances. Replay invalidation through continuity revocation is neither canonical (reversible status) nor propagated.

### 5.2 Does replay invalidation remain replica-relative?

**Yes, structurally.** The `invocation_registry` PK is per-instance. A nonce exhausted on instance A is not exhausted on instance B unless B attempts insertion of the same triple independently.

### 5.3 Does replay invalidation survive stale topology?

**No.** A stale replica that has not processed the revocation sees its local `invocation_registry` as the complete replay death record. New nonces against revoked authority succeed.

### 5.4 Does replay invalidation survive epoch transition?

**No — at the schema layer.** Epoch is not persisted. An authority created in epoch N can be replayed in epoch N+1 from a stale replica's perspective because no epoch column in `authority_registry` provides a comparison point.

**Partial — at the runtime layer.** `inspectTemporalLineageReplay()` emits `fail_closed_epoch_disagreement: true` when the caller-supplied `expectedEpoch` disagrees with `node.epoch`. This is a deterministic fail-closed signal at the runtime layer, contingent on the caller having correct epoch knowledge.

### 5.5 Does replay invalidation survive supersession rollback?

**No.** If a supersession event (new continuity chain replacing old) is rolled back, the superseded chain's revocation is also rolled back (no append-only protection). The superseded chain re-activates. Any replay death records that depended on the revocation remain absent from the schema (no `replay_death_registry` exists).

### 5.6 Does replay invalidation survive stale settlement replay?

**Not applicable in current schema.** No settlement primitive exists. If the proof registry is treated as the settlement layer, proof anchoring provides strong replay protection on the canonical D1 instance. Stale settlement replay against a stale replica is not blocked by any persisted record.

---

## 6. Tombstone + Epoch Interaction

### 6.1 Epoch-bound tombstones

The current schema has **no epoch-bound tombstones**. No epoch column exists in `continuity_registry`, `authority_registry`, `execution_registry`, or `proof_registry`. A tombstone written in epoch N is indistinguishable from one written in epoch N+1 at the schema layer.

### 6.2 Stale epoch tombstone gaps

`inspectTemporalLineageReplay()` detects `epoch_disagreement` when `node.epoch !== input.expectedEpoch`. This provides a runtime-layer signal that a replay node is in the wrong epoch. However:

- No persisted epoch binding allows this check to be performed without the caller supplying `expectedEpoch`
- A stale replica supplying a stale `expectedEpoch` fails to detect the disagreement
- No tombstone is written when epoch disagreement is detected — the result is `fail_closed_epoch_disagreement: true` with `deterministic_conclusion: 'NULL'`, but no death record

### 6.3 Epoch rollback resurrection

Epoch rollback (resetting `expectedEpoch` to a prior value) is not detectable from persisted state. A tombstone written at epoch N+1 cannot be distinguished from a future tombstone at epoch N+1 if the epoch rolls back to N and then advances again. No monotonic epoch record prevents this.

### 6.4 Epoch monotonicity interaction

No `epoch_monotonicity_registry` exists. Epoch monotonicity is asserted in governance documentation but not enforced by any DB-level constraint. The `TEMPORAL_DRIFT` quorum classification (returned when `temporalSet.size > 1`) detects timestamp disagreement across replicas but not epoch regression.

### 6.5 Stale-majority epoch visibility

If a majority of replicas are at epoch N and the canonical node has advanced to epoch N+1, `classifyDistributedQuorum()` returns `TEMPORAL_DRIFT` (because `temporalSet.size > 1`). This classifies the divergence but does not invalidate epoch-N authority on the stale-majority replicas. Tombstones written at epoch N+1 are invisible to the stale majority.

### 6.6 Cross-epoch tombstone replay

A tombstone written at epoch N is valid at epoch N+1 if continuity revocation is persistent. But without a persisted epoch binding on the tombstone, there is no guarantee that a cross-epoch replay cannot reference an epoch-N authority as still-valid on an epoch-N replica while the canonical node is at epoch N+1.

---

## 7. Settlement Tombstone Propagation

### 7.1 Stale settlement lineage propagation

No `settlement_registry`, `settlement_acknowledgement_registry`, or `arbitration_registry` table exists in `schema.sql`. Settlement is not a first-class primitive. The `proof_registry` serves as the de facto terminal settlement record.

Under this interpretation:
- **Stale settlement lineage propagation:** Not blocked. An execution against superseded continuity that produces a proof on a stale replica creates a stale settlement proof. This proof is locally anchored on the stale replica but is not the canonical proof on the primary.
- **Superseded settlement proofs:** Not blocked at the schema layer before execution. After execution, the proof UNIQUE constraint prevents duplicate proofs on the same instance but does not invalidate the stale proof.

### 7.2 Superseded settlement proofs

The `proof_registry_duplicate_archive` (`schema.sql:181–198`) absorbs duplicate proof insertions. However, this archive is populated only when a duplicate is detected on the same D1 instance. A stale replica that generates a proof for superseded lineage inserts it into its local `proof_registry` without conflict (if no prior proof exists locally). This stale proof may not be archived or quarantined without reconciliation.

### 7.3 Stale arbitration lineage persistence

Not applicable. No arbitration primitive exists.

### 7.4 Reconciliation-based settlement quarantine

`reconcileCrossRegistryLegitimacy()` computes `classification='REVOCATION_DIVERGENCE'` when revocation hashes differ across views. This is the appropriate classification for a stale settlement proof scenario. However, the reconciliation artifact is `evidence_only: true` and `creates_authority: false`, so it cannot canonically quarantine the stale proof.

### 7.5 Stale settlement acknowledgement executability

Not applicable in current schema. If settlement acknowledgements were modeled as execution records, the `invocation_registry` PK would block exact-nonce re-execution. A new nonce against a stale settlement authority would not be blocked.

---

## 8. Required Missing Primitives

The following primitives are absent from the current schema and are required for tombstone propagation to be canonical, irreversible, topology-independent, and recursively reconcilable.

### 8.1 `tombstone_propagation_registry`

A dedicated append-only record of tombstone dissemination events:

```sql
CREATE TABLE tombstone_propagation_registry (
  propagation_id TEXT PRIMARY KEY,
  tombstone_id TEXT NOT NULL REFERENCES lineage_tombstone_registry(tombstone_id),
  target_node_id TEXT NOT NULL,
  propagation_hash TEXT NOT NULL UNIQUE,
  propagation_epoch INTEGER NOT NULL,
  propagation_status TEXT NOT NULL CHECK (propagation_status IN (
    'PROPAGATION_PENDING','PROPAGATION_CONFIRMED','PROPAGATION_FAILED','PROPAGATION_SUPERSEDED'
  )),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  propagated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TRIGGER trg_tombstone_propagation_registry_no_update
BEFORE UPDATE ON tombstone_propagation_registry
BEGIN SELECT RAISE(ABORT, 'tombstone_propagation_registry is append-only'); END;

CREATE TRIGGER trg_tombstone_propagation_registry_no_delete
BEFORE DELETE ON tombstone_propagation_registry
BEGIN SELECT RAISE(ABORT, 'tombstone_propagation_registry is append-only'); END;
```

### 8.2 `propagation_proof` objects

Each tombstone propagation event requires a propagation proof record binding:
- The tombstone hash
- The target replica ID
- The propagation epoch
- The propagation acknowledgement hash
- A replay-neutral, evidence-only declaration

Without propagation proof objects, tombstone dissemination cannot be distinguished from tombstone non-receipt. The current `federated_revocation_observability_registry` (`schema.sql:275–295`) records revocation evidence but does not record propagation confirmation.

### 8.3 `stale_replica_lineage_quarantine`

A mechanism to record that a specific replica has been identified as holding stale lineage:

```sql
CREATE TABLE stale_replica_lineage_quarantine (
  quarantine_id TEXT PRIMARY KEY,
  replica_node_id TEXT NOT NULL,
  stale_continuity_id TEXT NOT NULL,
  stale_lineage_hash TEXT NOT NULL,
  canonical_tombstone_id TEXT NOT NULL,
  quarantine_epoch INTEGER NOT NULL,
  quarantine_status TEXT NOT NULL CHECK (quarantine_status IN (
    'QUARANTINE_ACTIVE','QUARANTINE_RESOLVED','QUARANTINE_UNRESOLVABLE'
  )),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  quarantine_authoritative TEXT NOT NULL CHECK (quarantine_authoritative='false'),
  created_at TEXT NOT NULL
);
```

This extends the existing `legitimacy_quarantine_registry` to include replica-specific isolation records.

### 8.4 `replay_death_dissemination_proof` objects

Replay death is currently implicit (nonce exhaustion + authority status). Explicit replay death dissemination proofs bind:
- The dead nonce triple `(decision_id, validated_object_hash, invocation_nonce)`
- The continuity chain at time of death
- The epoch at time of death
- The propagation target replica
- An evidence-only, append-only declaration

Without these proofs, replay death on one replica cannot be verified as having propagated to another.

### 8.5 `tombstone_epoch_bindings`

Epoch binding on tombstones requires adding an `epoch` column to the existing tombstone signal infrastructure:

```sql
ALTER TABLE continuity_registry ADD COLUMN tombstone_epoch INTEGER;
ALTER TABLE authority_registry ADD COLUMN tombstone_epoch INTEGER;
```

Or, within a `lineage_tombstone_registry` (see section 10.3 in the REPLAY_DEATH_BOUNDARY_CANON analysis), an `epoch` column that persists the canonical epoch at time of tombstone creation.

### 8.6 `topology_convergence_proofs`

The `verifyDistributedRevocationConvergence()` function computes convergence state but does not persist it. A `topology_convergence_proof` record would bind:
- The convergence epoch
- The canonical revocation topology hash at convergence
- The set of converged replica IDs
- The propagation_id
- An evidence-only, append-only declaration

Without convergence proofs, there is no auditable record that convergence occurred.

### 8.7 `irreversible_dissemination_markers`

An irreversible dissemination marker on the tombstoned continuity record would bind the tombstone timestamp and epoch in an append-only column:

```sql
ALTER TABLE continuity_registry ADD COLUMN tombstone_marker TEXT;
-- trg_continuity_tombstone_marker_immutable: once SET, cannot be updated to NULL
```

This column, backed by a trigger, would prevent rollback from silently erasing tombstone evidence.

---

## 9. Required Invariants

The following invariants are required for canonical tombstone propagation but are not formally declared or enforced in the current codebase.

### TOMBSTONE_PROPAGATION_MONOTONICITY

```
∀ t1 < t2: tombstoned(lineage, t1) → tombstoned(lineage, t2)
```

**Current status:** Not satisfied. `continuity_registry.status = 'REVOKED'` can be reversed by `UPDATE continuity_registry SET status='ACTIVE'` (no append-only trigger). Tombstone is not monotonic at the schema layer.

### STALE_REPLICA_TOMBSTONE_NULL

```
stale_replica(R) ∧ tombstoned(lineage, canonical) → execution(lineage, R) = NULL
```

**Current status:** Not satisfied. Stale replicas receive no tombstone push signal. Reconciliation is observability-only. A stale replica can execute tombstoned lineage.

### DISTRIBUTED_TOMBSTONE_CONVERGENCE

```
∀ replicas R1, R2: converge(tombstone(lineage, R1), tombstone(lineage, R2)) → identical result
```

**Current status:** Partially satisfied. `verifyDistributedRevocationConvergence()` detects non-convergence and returns `CONVERGENCE_FAILED`. It does not enforce convergence. `AMBIGUOUS` quorum in `classifyDistributedQuorum()` has no required resolution path.

### REPLAY_DEATH_PROPAGATION

```
replay_dead(lineage, canonical) → replay_dead(lineage, ∀ replicas)
```

**Current status:** Not satisfied. Replay death is local to the D1 instance holding the `invocation_registry` record. No cross-replica propagation mechanism exists.

### EPOCH_BOUND_PROPAGATION

```
tombstone(lineage, epoch=N) → ∀ replicas: tombstone_epoch(lineage) ≥ N
```

**Current status:** Not satisfied. Epoch is not persisted in any registry column. Tombstone epoch binding requires schema changes.

### TOMBSTONE_DISSEMINATION_IRREVERSIBILITY

```
tombstone_disseminated(lineage) → ¬∃ operation: ¬tombstone_disseminated(lineage)
```

**Current status:** Not satisfied. Revocation status is mutable. D1 restore can erase tombstone records. No append-only trigger on `continuity_registry` or `authority_registry` prevents reversal.

### PROPAGATION_RECONCILIATION_CLOSURE

```
reconcile(tombstone_views) → single canonical tombstone propagation outcome
∀ drift: reconcile(drift) → deterministic resolution
```

**Current status:** Not satisfied. `AMBIGUOUS` quorum and `CONVERGENCE_FAILED` convergence are terminal classifications in the current code with no required resolution path. Reconciliation is observability-only and cannot force state convergence.

---

## 10. Distributed Tombstone Convergence

### 10.1 Can replicas deterministically converge on one dead-lineage state?

**Under ideal conditions:** Yes. D1 is single-writer; all writes to the primary serialize. If all replicas read from the primary and propagation is synchronous, convergence is guaranteed.

**Under distributed failure scenarios:**

| Scenario | Convergence? | Reason |
|---|---|---|
| Network partition | No | Stale replica retains ACTIVE status; no push mechanism |
| Stale replicas | No | `PARTIAL_VISIBILITY` quorum; no forced reconciliation |
| Async propagation | Eventual | Bounded by reconciliation frequency, not time-guaranteed |
| Delayed reconciliation | No | Observability-only; cannot force state |
| Epoch advancement | No | Epoch not persisted; stale replica cannot detect advancement |
| Stale-majority visibility | No | `STALE_REPLAY` or `PARTIAL_VISIBILITY` classification; not blocked |
| Rollback | No | Status column is mutable; rollback erases tombstone |
| Sibling fork ambiguity | Partial | `REVOKED_CONFLICT` detected; no forced resolution |
| D1 restore | No | Restore predating tombstone silently resurrects lineage |

### 10.2 Can replicas deterministically converge on one replay-invalid state?

**No, distributedly.** Nonce exhaustion is local. Replay invalidity on one instance is invisible to others until the nonce is independently exhausted on each instance or until the authority is revoked and that revocation converges.

### 10.3 Can replicas deterministically converge on one settlement-invalid state?

**Not applicable.** No settlement primitive exists. Under the proof-registry-as-settlement interpretation, proof UNIQUE constraints converge only on the single D1 instance that holds the canonical proof.

### 10.4 Can replicas deterministically converge on one canonical tombstone propagation outcome?

**No, without additional primitives.** The existing `verifyDistributedRevocationConvergence()` function provides the computational substrate for convergence detection (majority hash agreement), but:

- Convergence detection does not trigger propagation
- `CONVERGENCE_PARTIAL` (majority agrees, minority does not) is not resolved
- `CONVERGENCE_FAILED` (no majority) has no required action
- No `tombstone_propagation_registry` records per-replica acknowledgements
- No `topology_convergence_proof` persists a convergence event

---

## 11. Final Determination

| Property | Status | Primary Evidence |
|---|---|---|
| **Canonical** | Partial | `invocation_registry` PK and `proof_registry` UNIQUE triggers are canonical on one D1 instance; continuity/authority status are not canonical (mutable, reversible) |
| **Irreversible** | Partial | `proof_registry` is irreversible (UNIQUE + trigger pair); `continuity_registry.status` and `authority_registry.status` are reversible (no append-only trigger) |
| **Topology-independent** | No | All tombstone signals are instance-local; no cross-replica push mechanism; stale replicas retain stale-ACTIVE status indefinitely |
| **Replay-safe** | Partial | Exact-nonce replay blocked by `invocation_registry` PK; new-nonce replay on revoked authority not blocked; supersession replay not blocked |
| **Deterministic** | Partial | Single-node: deterministic (SHA-256 canonical hashing, BFS traversal). Distributed: `AMBIGUOUS` quorum has no required resolution path; epoch disagreement requires caller-supplied expectedEpoch |
| **Epoch-authoritative** | No | Epoch is a runtime parameter; no epoch column in any registry table; cross-epoch tombstone replay not blocked at schema layer |
| **Recursively reconcilable** | No | Reconciliation is observability-only; `AMBIGUOUS` and `CONVERGENCE_FAILED` are terminal unresolved classifications; no required reconciliation action |

### Summary Verdict

Tombstone propagation in MindShift is **locally deterministic and partially irreversible** through the DB-level constructs in `proof_registry` and `invocation_registry`. It is **not topology-independent, not epoch-authoritative, and not recursively reconcilable** under distributed failure scenarios including stale replicas, network partitions, epoch divergence, rollback, and delayed reconciliation.

The distinction between single-node lineage invalidation and distributed lineage death dissemination is the critical gap:

- **Single-node invalidation:** Achievable today through `continuity_registry.status = 'REVOKED'` (application-layer) + `invocation_registry` PK (schema-layer) + `proof_registry` UNIQUE triggers (schema-layer).
- **Distributed death dissemination:** Not achievable without: (1) append-only triggers on `continuity_registry` and `authority_registry`; (2) a `tombstone_propagation_registry` with per-replica propagation receipts; (3) a persisted `epoch` binding on tombstones; (4) a convergence enforcement mechanism beyond observability-only reconciliation; (5) explicit `replay_death_dissemination_proof` objects.

### Seven Structural Gaps

1. **Status-column mutability** — `continuity_registry.status` and `authority_registry.status` have no append-only trigger; tombstone signals are reversible
2. **Missing `tombstone_propagation_registry`** — No per-replica propagation receipt; dissemination completeness is unverifiable
3. **Missing persisted epoch binding** — Epoch is runtime-only; epoch-bound tombstones cannot be represented or verified at the schema layer
4. **Observability-only reconciliation** — `CONVERGENCE_FAILED` and `AMBIGUOUS` are terminal unresolved states with no enforcement action
5. **No cross-replica push mechanism** — Stale replicas receive no invalidation signal; they retain stale-ACTIVE state until independently reconciled
6. **Missing `replay_death_dissemination_proof` objects** — Replay death is implicit and local; cross-replica proof of replay death does not exist
7. **Missing `topology_convergence_proof` records** — Convergence is computed ephemerally; no audit record of convergence events survives for verification

Closing gaps 1–3 would move tombstone propagation from **partially canonical** to **locally canonical and irreversible**. Closing all seven gaps would move it from **locally canonical** to **distributedly canonical, topology-independent, and recursively reconcilable**.

---

## Appendix: Key File and Line Locations

| Location | Relevance |
|---|---|
| `schema.sql:17–29` | `continuity_registry` — primary lineage tombstone signal; mutable status; no append-only trigger |
| `schema.sql:33–46` | `authority_registry` — mutable status; no append-only trigger; no epoch column |
| `schema.sql:133–201` | `proof_registry` — strongest irreversible death anchor; UNIQUE constraints + trigger pair |
| `schema.sql:166–173` | `trg_proof_registry_decision_hash_guard` — canonical proof insert guard |
| `schema.sql:203–211` | `invocation_registry` — nonce exhaustion PK; local replay tombstone |
| `schema.sql:407–463` | `legitimacy_quarantine_registry` — append-only quarantine; quarantine_authoritative=false |
| `schema.sql:479–503` | `cross_registry_reconciliation_registry` — replay_graph_hash field; non_authoritative=true |
| `schema.sql:523–535` | `trg_proof_registry_requires_valid_execution` — proof requires EXECUTED execution record |
| `src/recursive-revocation-propagation.ts:328–387` | `traverseDescendantRevocation()` — BFS descendant traversal |
| `src/recursive-revocation-propagation.ts:418–468` | `enforceStaleLineageCollapse()` — active-descendant-of-revoked detection |
| `src/recursive-revocation-propagation.ts:612–689` | `verifyDistributedRevocationConvergence()` — hash-majority convergence computation |
| `src/recursive-revocation-propagation.ts:694–809` | `classifyRevocationDrift()` — 9-class drift taxonomy |
| `src/recursive-revocation-propagation.ts:990–1000` | `propagateRevocationLineage()` — evidence_only guard; forbidden field rejection |
| `src/cross-registry-legitimacy-reconciliation.ts:88–107` | `reconcileCrossRegistryLegitimacy()` — evidence_only=true; creates_authority=false |
| `runtime/temporal_lineage_replay_inspector.ts:57–73` | `classifyDistributedQuorum()` — 7-state quorum classification |
| `runtime/temporal_lineage_replay_inspector.ts:80–83` | Epoch disagreement detection; fails closed; epoch not persisted |
| `runtime/temporal_lineage_replay_inspector.ts:132–145` | `fail_closed_epoch_disagreement`; `deterministic_conclusion: 'NULL'` on drift |
| `GOVERNANCE_GAP_REGISTRY.md:46–56` | GAP-001 — Identity Continuity Hardening, status OPEN |
| `GOVERNANCE_GAP_REGISTRY.md:78–90` | GAP-003 — Cross-Registry Reconciliation Integrity, status OPEN |
| `artifacts/REPLAY_DEATH_BOUNDARY_CANON.md` | Prior replay death boundary analysis; five gaps identified |
