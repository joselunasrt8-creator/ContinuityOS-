# Distributed Replay Death-Boundary Canon Analysis

**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** claude/replay-death-boundary-canon-I80q8  
**Date:** 2026-05-25  
**Scope:** Evidence-only analysis. No authority created, no state mutated, no execution widened.

---

## Executive Summary

Replay invalidation in MindShift is **partially canonical** but **not fully irreversible, topology-independent, or recursively reconcilable** under all distributed failure scenarios. The primary replay death-boundary is nonce exhaustion enforced by a DB-level unique PRIMARY KEY in `invocation_registry`. This is deterministic on a single D1 instance but is **not epoch-bound, not monotonically distributed, and not formally tombstoned** across federated replicas or under stale-majority visibility. Five specific structural gaps prevent replay invalidation from reaching full canonical death-boundary status.

---

## 1. Replay Death-Boundary Sources — What Exists

The codebase implements replay invalidation through four distinct mechanisms, each with different durability and distribution properties.

### 1.1 Nonce Exhaustion (Primary Mechanism)

`schema.sql:203–211` — `invocation_registry`:

```sql
PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)
```

The three-column primary key is the single strongest replay death-boundary in the system. Once an `(decision_id, validated_object_hash, invocation_nonce)` triple is inserted, the D1 UNIQUE constraint prevents re-insertion. This is:

- **Canonical:** yes — DB-enforced uniqueness
- **Irreversible:** yes — no `DELETE` trigger exists; records persist
- **Topology-independent:** **no** — bound to a single D1 instance; no cross-replica coordination

The `status` column (`NOT_USED → EXECUTED → REVOKED`) provides a state machine but is not guarded by a `CHECK` constraint or a direction-enforcing trigger. A status regression from `EXECUTED` to `NOT_USED` is not schema-blocked.

### 1.2 Authority Consumption (Secondary Mechanism)

`schema.sql:33–46` — `authority_registry` with `status TEXT NOT NULL`. `GOVERNANCE_REQUIREMENTS.json:25`:

> "authority cannot be reused after RESERVED/EXECUTED/CONSUMED transitions"

Authority CONSUMED status blocks reuse, but:
- No `CHECK` constraint prevents `UPDATE authority_registry SET status = 'ACTIVE'`
- No append-only trigger blocks status regression
- RESERVED authority is a **live intermediate state** with no time-bound guard against stale-replica visibility

### 1.3 Proof Anchoring (Tertiary Mechanism)

`schema.sql:159` — `proof_registry`:

```sql
UNIQUE(execution_id, decision_id, validated_object_hash)
UNIQUE(workflow_run_id)
```

`schema.sql:166–173` — `trg_proof_registry_decision_hash_guard` enforces `decision_hash = decision_id || char(31) || validated_object_hash`. Proof uniqueness is the strongest append-only guard in the schema because:

- The trigger fires `BEFORE INSERT` with `RAISE(ABORT, ...)`
- `proof_registry_duplicate_archive` absorbs duplicates without overwriting canonical proof
- `UNIQUE(workflow_run_id)` provides a workflow-scoped anchor

Proof anchoring is the **most irreversible** death-boundary mechanism because proof persists execution evidence independent of authority or nonce status.

### 1.4 Continuity Revocation Cascade (Quaternary Mechanism)

`schema.sql:17–29` — `continuity_registry` with `status TEXT` and `revoked_at TEXT`. `GOVERNANCE_REQUIREMENTS.json:37–40`:

> "Revoked or expired continuity returns NULL / cascade revocation to dependent rows"

Lineage revocation is a **death signal** for all downstream authority, validation, execution, and proof generation from that continuity chain. However:
- The revocation cascade is described in governance requirements and tests, not enforced by DB triggers
- No schema-level foreign key `ON DELETE CASCADE` exists between `continuity_registry` and `authority_registry`
- Revocation propagation depends on application-layer logic, making it **topology-observational** rather than **topology-enforced**

---

## 2. Replay Death-Boundary Derivation

Replay invalidation derives from a **hybrid** of mechanisms, not a single canonical source:

| Mechanism | Source | DB-Enforced | Distributed | Monotonic | Epoch-Bound |
|---|---|---|---|---|---|
| Nonce exhaustion | `invocation_registry` PK | Yes | No | Implicit | No |
| Authority CONSUMED | `authority_registry.status` | No (no trigger) | No | No | No |
| Proof uniqueness | `proof_registry` UNIQUE triggers | Yes | No | Yes | No |
| Continuity revocation | `continuity_registry.status` | No | No | No | No |
| Epoch disagreement | `inspectTemporalLineageReplay()` | No | Yes | No | Partial |

The boundary is **not purely derived from nonce consumption**. It is a composite of four independent layers, each with different enforcement guarantees. Under distributed failure, these layers can disagree.

---

## 3. RESERVED Authority Replay Analysis

`authority_registry.status = 'RESERVED'` is the most vulnerable intermediate state.

**RESERVED authority survival analysis:**

- **Survives supersession?** Unknown — no supersession record invalidates RESERVED status in schema
- **Survives epoch transition?** Yes (unconstrained) — epoch is tracked only in `TemporalLineageNode.epoch` (runtime parameter, not persisted)
- **Survives stale replicas?** Yes — stale replica retains last-known authority status; no invalidation push exists
- **Survives rollback?** Potentially yes — no append-only trigger on `authority_registry`; a row-level rollback restores ACTIVE from RESERVED
- **Survives stale-majority visibility?** Yes — `classifyDistributedQuorum()` returns `PARTIAL_VISIBILITY` when unknown states exist, but execution is not blocked by this classification in schema
- **Survives reconciliation lag?** Yes — reconciliation is `OBSERVABILITY_ONLY`; it cannot force authority CONSUMED

**Critical finding:** RESERVED authority has no TTL enforcement at the schema level. `expiry TEXT NOT NULL` exists in `authority_registry` but no `CHECK` constraint or trigger enforces expiry at query time. Expired RESERVED authority remains readable as RESERVED unless application logic checks `expiry`.

---

## 4. Replay Death Proof Requirements

The runtime currently **does not require** explicit replay death objects, replay death registries, or supersession replay proofs. Replay invalidation is implicit:

- Nonce status `EXECUTED` = implicit replay death record
- `proof_registry` UNIQUE = implicit proof anchor
- `continuity_registry.status = REVOKED` = implicit lineage tombstone

The `cross_registry_reconciliation_registry` (`schema.sql:479–503`) contains a `replay_graph_hash` field, indicating intent to record a snapshot of replay state at reconciliation time, but:
- No table stores individual replay death records
- No table stores lineage tombstones keyed to superseded continuity_ids
- No table stores epoch-bound replay invalidation proofs

**What is missing for canonical replay death proofs:**
- A `replay_death_registry` table with append-only enforcement
- A replay death record containing: `(decision_id, validated_object_hash, invocation_nonce, death_epoch, death_cause, lineage_hash, continuity_id, supersession_id)`
- A `trg_replay_death_registry_no_update` and `trg_replay_death_registry_no_delete` pair
- Replay death records linked to `cross_registry_reconciliation_registry` via `replay_graph_hash`

---

## 5. Distributed Replay Race Analysis

`temporal_lineage_replay_inspector.ts:57–73` — `classifyDistributedQuorum()`:

```typescript
if (hasStaleReplay) return 'STALE_REPLAY'
if (temporalSet.size > 1) return 'TEMPORAL_DRIFT'
if (hasRevoked && (hasUnknown || hasAuthorized)) return 'REVOKED_CONFLICT'
if (hasUnknown) return 'PARTIAL_VISIBILITY'
if (statusSet.size === 1 && hasAuthorized) return 'AGREED_VALID'
if (statusSet.size === 1 && hasRevoked) return 'AGREED_INVALID'
return 'AMBIGUOUS'
```

**Race analysis by scenario:**

### Child creation vs. execution
No schema relationship enforces that a parent authority must be CONSUMED before child authority is created. The `continuity_registry.parent_continuity_id` field allows parent-child chains but no trigger blocks child execution while parent is in RESERVED state.

### Supersession vs. replay
No supersession table exists. If lineage A is superseded by lineage B and a stale replica still sees A as ACTIVE, a replay of A's authority against A's invocation_nonce succeeds on that replica. The `invocation_registry` PK prevents exact-nonce replay, but a **new nonce** against the superseded authority is not blocked by schema.

### Stale authority execution
`classifyDistributedQuorum()` returns `PARTIAL_VISIBILITY` when any replica returns `UNKNOWN`. This is classified as drift but not as a blocking signal at the schema layer. Execution can proceed on a node that sees `AGREED_VALID` while other nodes see `UNKNOWN`.

### Replay-before-reconciliation
`control_graph_reconciliation.ts` is `OBSERVABILITY_ONLY` and sets `replay_detected: false` unconditionally (`line 73`). Reconciliation never produces a replay-blocking signal. A replay that occurs before reconciliation completes is invisible to the reconciliation result.

### Rollback-before-replay-death
Authority status is mutable (no append-only trigger). A rollback restoring `authority_registry.status = 'ACTIVE'` from `'RESERVED'` is schema-permissible. This resurrects a dead authority without creating a new nonce, enabling replay if the original nonce was never inserted into `invocation_registry`.

### Epoch transition replay
Epoch is a runtime parameter passed to `inspectTemporalLineageReplay(input.expectedEpoch)`. Epoch is not persisted in any registry table. A stale replica operating in epoch N cannot detect that the canonical epoch has advanced to N+1. Cross-epoch authority reuse is not blocked by any persisted epoch binding.

### Stale settlement replay
No settlement acknowledgement table exists. Settlement replay analysis is not applicable to current schema — this is a missing primitive.

---

## 6. Replay Irreversibility Assessment

**Can replay invalidation be reversed?**

| Mechanism | Reversible? | Why |
|---|---|---|
| Nonce exhaustion | No — PK constraint | Cannot re-insert same PK; cannot update nonce |
| Authority CONSUMED | Yes — no append-only trigger | `UPDATE authority_registry SET status='ACTIVE'` is schema-permissible |
| Proof uniqueness | No — UNIQUE + trigger | `trg_proof_registry_decision_hash_guard` blocks; duplicate archive absorbs |
| Continuity revocation | Yes — no append-only trigger | `UPDATE continuity_registry SET status='ACTIVE', revoked_at=NULL` is permissible |

**Replay invalidation is not universally irreversible.** Two of four mechanisms are reversible at the schema layer. `proof_registry` is the only fully irreversible death anchor.

**Can replay invalidation disappear after rollback?**
Yes — if authority status is rolled back before `invocation_registry` receives a record (e.g., during a failed execution before nonce insertion), the replay death boundary disappears.

**Can replay invalidation be topology-dependent?**
Yes — `PARTIAL_VISIBILITY` and `AMBIGUOUS` quorum states mean that some nodes observe replay invalidation while others do not. No cross-replica synchronization mechanism forces convergence.

**Can stale replicas resurrect invalidated authority?**
Yes — a stale replica retaining `authority_registry.status = 'ACTIVE'` can serve that record as valid until reconciliation propagates. Reconciliation is observability-only and cannot force the update.

---

## 7. Replay + Supersession Interaction

No supersession table, supersession record, or supersession identifier exists in the schema. The closest analogs are:
- `continuity_registry.parent_continuity_id` — tracks ancestry but not supersession
- `continuity_registry.status = 'REVOKED'` — marks lineage death but not the superseding lineage

**Gaps in supersession→replay interaction:**

- **Superseded lineage replay:** An authority bound to superseded (but not yet revoked) continuity can replay because REVOKED status requires explicit application-layer action.
- **Sibling fork replay divergence:** Two continuity children of the same parent can both be ACTIVE simultaneously (no constraint prevents multiple non-revoked children). Sibling authority objects can execute in parallel with divergent replay boundaries.
- **Supersession propagation lag:** Revocation of a parent continuity cascades to children only through application logic, not DB triggers. During propagation lag, child authority replay is schema-permissible.
- **Replay death-boundary monotonicity:** No formal `REPLAY_DEATH_MONOTONICITY` invariant exists. The nonce PK provides local monotonicity but cross-lineage monotonicity is not enforced.
- **Replay invalidation convergence:** `AMBIGUOUS` quorum state has no required resolution path. An `AMBIGUOUS` result is not a terminal state with a defined convergence procedure.

---

## 8. Replay + Epoch Interaction

`temporal_lineage_replay_inspector.ts:81–83`:

```typescript
if (node.epoch !== input.expectedEpoch) {
  issues.push({ class: 'epoch-induced', code: 'epoch_disagreement', ... })
}
```

`inspectTemporalLineageReplay()` returns `fail_closed_epoch_disagreement: true` when any node has an unexpected epoch. This is a deterministic signal, but:

- Epoch is a **runtime parameter**, not a persisted field in any registry table
- No `epoch_registry` table exists
- `authority_registry`, `validation_registry`, `execution_registry`, and `proof_registry` have no `epoch` column
- Epoch rollback (resetting `expectedEpoch` to a previous value) is not detectable from persisted state
- Cross-epoch authority reuse cannot be blocked from DB schema alone

**Epoch-replay interaction findings:**

| Question | Finding |
|---|---|
| Is replay invalidation epoch-bound? | No — epoch is runtime-only, not persisted |
| Survives epoch rollback? | Yes — no persisted epoch binding to compare against |
| Survives stale epoch replicas? | Yes — stale replica cannot detect epoch advancement |
| Survives stale epoch quorum election? | Yes — quorum classification uses `authority_timestamp` not epoch field |
| Survives cross-epoch authority reuse? | Yes — no epoch column in authority_registry blocks this |

---

## 9. Settlement Replay Analysis

No `settlement_registry`, `settlement_acknowledgement_registry`, or `arbitration_registry` table exists in `schema.sql`. Settlement is not implemented as a first-class primitive.

The closest settlement analog is `proof_registry` as the terminal execution evidence record. Under this interpretation:

- **Settlement acknowledgement replay:** Blocked by `UNIQUE(execution_id, decision_id, validated_object_hash)` — a second proof for the same execution is archived, not accepted
- **Stale settlement proofs replay:** Not applicable — no TTL on proof records; all proof records are permanent evidence
- **Superseded settlement lineage replay:** Not blocked — if the continuity chain is superseded but not revoked, a new proof can be generated against the superseded lineage
- **Stale arbitration replay:** Not applicable — no arbitration primitive exists

**Settlement replay analysis conclusion:** If `proof_registry` is treated as the settlement layer, proof anchoring provides strong replay protection via UNIQUE constraints and the `trg_proof_registry_decision_hash_guard` trigger. However, the upstream execution and authority layers remain vulnerable to the races described in sections 5–8.

---

## 10. Required Missing Primitives

The following primitives are absent from the current schema and codebase:

### 10.1 `replay_death_registry`

A dedicated append-only table recording each replay death event:

```sql
CREATE TABLE replay_death_registry (
  death_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  death_cause TEXT NOT NULL CHECK (death_cause IN (
    'NONCE_EXHAUSTED','AUTHORITY_CONSUMED','PROOF_ANCHORED',
    'CONTINUITY_REVOKED','SUPERSESSION_INVALIDATED','EPOCH_ADVANCED'
  )),
  supersession_id TEXT,
  death_timestamp TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  created_at TEXT NOT NULL
);
```

With append-only triggers to prevent deletion or update.

### 10.2 `replay_epoch_registry`

A persisted epoch record binding each authority/execution to a canonical epoch at time of creation:

```sql
CREATE TABLE replay_epoch_registry (
  epoch_id TEXT PRIMARY KEY,
  epoch_number INTEGER NOT NULL,
  epoch_hash TEXT NOT NULL UNIQUE,
  decision_id TEXT,
  continuity_id TEXT,
  epoch_anchor_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true')
);
```

### 10.3 `lineage_tombstone_registry`

A dedicated append-only record of superseded or dead lineage chains:

```sql
CREATE TABLE lineage_tombstone_registry (
  tombstone_id TEXT PRIMARY KEY,
  continuity_id TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  superseded_by TEXT,
  tombstone_cause TEXT NOT NULL,
  tombstone_epoch INTEGER,
  created_at TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true')
);
```

### 10.4 Append-Only Triggers on `authority_registry` and `continuity_registry`

Status regression protection:

```sql
CREATE TRIGGER trg_authority_status_no_regression
BEFORE UPDATE ON authority_registry
WHEN (
  (OLD.status = 'CONSUMED' AND NEW.status != 'CONSUMED') OR
  (OLD.status = 'REVOKED' AND NEW.status != 'REVOKED') OR
  (OLD.status = 'EXECUTED' AND NEW.status = 'ACTIVE')
)
BEGIN
  SELECT RAISE(ABORT, 'authority_registry status regression blocked');
END;
```

### 10.5 Epoch Column on Authority and Execution Tables

```sql
ALTER TABLE authority_registry ADD COLUMN epoch INTEGER;
ALTER TABLE execution_registry ADD COLUMN epoch INTEGER;
ALTER TABLE proof_registry ADD COLUMN epoch INTEGER;
```

---

## 11. Required Formal Invariants

The following invariants are required but not formally declared or enforced in the current codebase:

### REPLAY_DEATH_MONOTONICITY

```
∀ t1 < t2: replay_dead(object, t1) → replay_dead(object, t2)
```

**Current status:** Partially satisfied by `invocation_registry` PK (nonce cannot be re-inserted). **Not satisfied** for authority status (reversible) or continuity revocation (reversible).

### SUPERSEDED_REPLAY_NULL

```
superseded(lineage) → replay(authority ∈ lineage) = NULL
```

**Current status:** Not enforced. No supersession primitive. Revocation is required but not automatic.

### EPOCH_REPLAY_EQUALITY

```
epoch(canonical) ≠ epoch(replay_attempt) → replay_attempt = NULL
```

**Current status:** Partially satisfied by `fail_closed_epoch_disagreement` in `inspectTemporalLineageReplay()`. **Not satisfied** at schema layer — epoch is not persisted.

### DISTRIBUTED_REPLAY_CONVERGENCE

```
∀ replicas R1, R2: converge(replay_dead(object, R1), replay_dead(object, R2)) → same result
```

**Current status:** Not satisfied. `AMBIGUOUS` and `PARTIAL_VISIBILITY` quorum states have no defined convergence procedure. `OBSERVABILITY_ONLY` reconciliation cannot force convergence.

### REPLAY_IRREVERSIBILITY

```
replay_dead(object) → ¬∃ operation: ¬replay_dead(object)
```

**Current status:** Not satisfied. Authority status and continuity status are mutable without append-only protection.

### STALE_REPLICA_REPLAY_NULL

```
stale_replica(object) ∧ replay_dead(object, canonical) → replica_execution(object) = NULL
```

**Current status:** Not satisfied. Stale replicas have no mechanism to receive invalidation signals. Reconciliation is observability-only.

### REPLAY_BOUNDARY_RECONCILIATION

```
∀ replicas: reconcile(replay_boundaries) → single canonical replay boundary
```

**Current status:** Partially satisfied by `cross_registry_reconciliation_registry.replay_graph_hash` field. **Not satisfied** — no replay boundary convergence algorithm exists; `AMBIGUOUS` is a terminal classification with no required action.

---

## 12. Distributed Replay Convergence Analysis

**Can replicas deterministically converge on one replay boundary?**

Under ideal conditions (no partitions, no lag): **Yes.** D1 is a single-writer database; all writes serialize through one primary. If all reads go to primary, replay state is consistent.

Under distributed failure scenarios:

| Scenario | Convergence? | Why Not |
|---|---|---|
| Partition | No | Replica retains stale authority status; no invalidation push |
| Stale replicas | No | `PARTIAL_VISIBILITY` quorum; no forced reconciliation |
| Delayed reconciliation | No | Reconciliation is observability-only; cannot force state |
| Asynchronous propagation | Eventual | Depends on reconciliation frequency and application retry |
| Epoch advancement | No | Epoch not persisted; stale replica cannot detect epoch change |
| Stale majority | No | `classifyDistributedQuorum()` returns `STALE_REPLAY` but does not block |
| Rollback | No | Authority and continuity status are mutable |
| Sibling continuity fork | No | Multiple non-revoked children permitted |

**One replay boundary:** Only achievable if a single `invocation_registry` PK record exists and all replicas read from the same D1 primary. Not guaranteed under any of the listed failure scenarios.

**One dead-lineage state:** Not achievable without a persisted lineage tombstone registry and an append-only enforcement mechanism.

**One authority eligibility state:** Not achievable without append-only authority status and cross-replica invalidation.

**One canonical execution eligibility outcome:** Partially achievable — `proof_registry` UNIQUE constraints provide the strongest canonical anchor, but only after execution, not before.

---

## 13. Final Determination

| Property | Status | Evidence |
|---|---|---|
| **Canonical** | Partial | Nonce PK and proof UNIQUE are canonical; authority/continuity status are not |
| **Irreversible** | Partial | Proof anchoring is irreversible; authority/continuity status are mutable |
| **Replay-safe** | Partial | Nonce exhaustion prevents exact-nonce replay; supersession replay and stale-authority replay are not blocked |
| **Topology-independent** | No | Replay death boundary is D1-instance-local; no cross-replica enforcement |
| **Deterministic** | Partial | Single-node deterministic; distributed quorum can reach `AMBIGUOUS` with no resolution path |
| **Epoch-authoritative** | No | Epoch is a runtime parameter, not persisted; no epoch column in any registry table |
| **Recursively reconcilable** | No | `cross_registry_reconciliation_registry` tracks reconciliation hash but cannot force state; `AMBIGUOUS` is a terminal unresolved classification |

### Summary Verdict

Replay invalidation in MindShift is **locally canonical and partially irreversible** through DB-level constraints (`invocation_registry` PK, `proof_registry` UNIQUE triggers). It is **not topology-independent, not epoch-authoritative, and not recursively reconcilable** under distributed failure scenarios.

The five structural gaps that prevent full canonical death-boundary status are:

1. **Authority and continuity status mutability** — no append-only trigger prevents status regression
2. **Missing persisted epoch binding** — epoch is a runtime parameter with no schema column
3. **Missing replay death registry** — no dedicated append-only record of replay death events
4. **Missing lineage tombstone registry** — supersession has no first-class schema representation
5. **Observability-only reconciliation** — reconciliation cannot force convergence; `AMBIGUOUS` quorum has no defined resolution path

The strongest existing replay death-boundary is the `proof_registry` append-only anchor with the `trg_proof_registry_decision_hash_guard` trigger. Closing the five gaps above would move replay invalidation from **locally canonical** to **distributedly canonical** and from **partially irreversible** to **fully irreversible**.

---

## Appendix: Key File Locations

| File | Relevance |
|---|---|
| `schema.sql:203–211` | `invocation_registry` — primary nonce death boundary |
| `schema.sql:133–201` | `proof_registry` — strongest append-only anchor |
| `schema.sql:33–46` | `authority_registry` — mutable status, no append-only trigger |
| `schema.sql:17–29` | `continuity_registry` — mutable status, no append-only trigger |
| `schema.sql:479–503` | `cross_registry_reconciliation_registry` — replay_graph_hash field |
| `runtime/control_graph_replay.ts:31` | `CONTROL_GRAPH_REPLAY_MODE = "observability_only"` |
| `runtime/control_graph_replay.ts:148–158` | `verifyReplayNeutrality()` — identity-based, not epoch-based |
| `runtime/temporal_lineage_replay_inspector.ts:57–73` | `classifyDistributedQuorum()` — 7-state classification |
| `runtime/temporal_lineage_replay_inspector.ts:132` | `fail_closed_epoch_disagreement` — epoch signal, not epoch binding |
| `runtime/control_graph_reconciliation.ts:73` | `replay_detected: false` — unconditional; reconciliation never blocks replay |
| `runtime/governance/REPLAY_POLICY.json:16` | `enforcement: "replay_neutral_topology"` |
| `GOVERNANCE_GAP_REGISTRY.md:46–56` | GAP-001 — Identity Continuity Hardening, status OPEN |
| `GOVERNANCE_GAP_REGISTRY.md:78–90` | GAP-003 — Cross-Registry Reconciliation Integrity, status OPEN |
| `GOVERNANCE_REQUIREMENTS.json:21–26` | `replay_resistance` requirements |
