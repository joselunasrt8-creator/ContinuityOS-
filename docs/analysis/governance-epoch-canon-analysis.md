# MindShift Distributed Governance Epoch Canon Analysis

**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** `claude/governance-epoch-canon-cDyUE`  
**Analysis Date:** 2026-05-25  
**Mode:** MODE B — NON_OPERATIVE_GOVERNANCE_ARTIFACT  
**Status:** Analysis only. No authority granted. No execution authorized. No registry mutated.

---

> AI output is NEVER authority.  
> Epoch observation ≠ epoch authority.  
> Topology convergence ≠ temporal legitimacy.  
> Quorum majority ≠ epoch canonicity.  
> Distributed agreement ≠ settlement finality.

---

## Canonical Invariants (Preserved Throughout)

```
If no valid object exists → nothing happens

validated_object == executed_object

No valid continuity lineage
  → no valid authority
  → no valid execution

All persisted legitimacy lineage must remain recursively reconcilable.

VALID
∧ AUTHORIZED
∧ UNUSED
∧ POLICY_VALID
∧ REPLAY_SAFE
∧ TOPOLOGY_VISIBLE
∧ EPOCH_VALID
Else → NULL
```

These invariants are reproduced from `runtime/invariants/canonical_invariants.json`,
`runtime/math/legitimacy_calculus.json`, and `GOVERNANCE_REQUIREMENTS.json`.
This analysis does not modify them.

---

## 1. Executive Summary

The MindShift legitimacy runtime implements a principled single-node governance
substrate with robust replay protection, append-only audit registries, fail-closed
partition semantics, and a deterministic seven-stage lineage state machine. Within
these constraints, single-node legitimacy is structurally sound.

**The primary finding of this analysis is that epoch is not a first-class lineage
primitive.** Governance epochs exist only as:

- Opaque string labels on distributed view structures (`registry_epoch: string`)
- Runtime-only numeric variables on `TemporalLineageNode.epoch` (never persisted)
- Unguarded `TEXT` columns on snapshot records (`replay_epoch`)

No `continuity_epoch` column exists on `continuity_registry`. No epoch monotonicity
trigger exists anywhere in the 47-migration schema. No authority, AEO, validation,
execution, proof, PREO, or delegation record carries a bound epoch value. As a
result, epoch advancement — if and when the system operates across multiple epochs —
is invisible to every downstream object in the canonical lineage. Objects created
in epoch N remain structurally valid in epoch N+k, creating latent dead-lineage
paths that bypass the execution gate undetected.

**Secondary finding:** Continuity supersession is topology-derived, not
status-authoritative. A parent continuity whose child has been created remains
`status='ACTIVE'` indefinitely. The system detects supersession only by anti-join
query at read time, not by an authoritative status write at mutation time. This
creates a gap: the parent continuity can authorize execution during the window
between child creation and any subsequent revocation — a window with no explicit
duration bound.

**Tertiary finding:** Settlement authority does not exist. The conflict arbitration
and convergence detection subsystems are explicitly and correctly marked
`creates_authority: false`. All distributed consensus artifacts are observational.
No settlement protocol, settlement propagation mechanism, or topology-independent
finality bundle is implemented. This is consistent with the single-node deployment
assumption, but renders epoch-bound settlement analysis moot until settlement
primitives are introduced.

**Governance legitimacy under the six target properties:**

| Property | Current Status | Gap |
|---|---|---|
| VALID | PARTIAL | Epoch obliviousness in all lineage tables |
| REPLAY-SAFE | PARTIAL | Stale-epoch replay undetected; nonce protection covers single-node |
| TOPOLOGY-VISIBLE | CLOSED | Comprehensive inventory, fail-closed drift classification |
| TEMPORALLY-BOUNDED | OPEN | No epoch column; TTL exists but epoch-unbound |
| RECONCILABLE | PARTIAL | Single-epoch reconciliation deterministic; cross-epoch classification absent |
| EPOCH_VALID | OPEN | Epoch not a schema primitive on any authoritative table |

---

## 2. Epoch Legitimacy Classification Matrix

Each governance primitive is classified against six closure states:

- **CLOSED** — invariant fully enforced by schema, trigger, or code
- **CONTAINED** — enforced for the observed perimeter; gaps exist at boundary
- **PARTIAL** — enforcement exists but has structural holes
- **OPEN** — no enforcement; gap is structurally reachable
- **NULL** — undefined or unreachable in current runtime
- **BREAK_GLASS** — requires manual operator intervention to establish legitimacy

| Primitive | Class | Evidence | Critical Gap |
|---|---|---|---|
| Continuity lineage (single-node) | CLOSED | `verifyContinuityLineage`, append-only triggers | — |
| Continuity epoch binding | OPEN | No `continuity_epoch` column on `continuity_registry` | EC-01 |
| Continuity supersession (detection) | PARTIAL | Anti-join query detects leaf topology | Not status-authoritative (EC-S1) |
| Continuity supersession (enforcement) | OPEN | No `SUPERSEDED` status in canonical schema; parent stays `ACTIVE` | EC-S2 |
| Authority epoch inheritance | OPEN | `authority_registry` has no `continuity_epoch` column | EC-02 |
| Authority delegation epoch binding | OPEN | `delegated_authority_registry` has no epoch column | EC-04 |
| Stale reservation death | OPEN | `RESERVED` authority from epoch N executable in epoch N+k | EC-05 |
| AEO / PREO epoch anchoring | OPEN | `preo_registry` has no `continuity_epoch` or `epoch_anchor_hash` | EC-03 |
| Validation epoch inheritance | OPEN | `validation_registry` carries no epoch column | EC-02 |
| Execution barrier (epoch equality) | OPEN | Barrier checks VALID ∧ AUTHORIZED ∧ UNUSED — not EPOCH_VALID | EC-06 |
| Proof epoch sensitivity | OPEN | Proofs from epoch N and N+1 are structurally identical | EC-07 |
| Replay idempotency (single-node) | CLOSED | Nonce PRIMARY KEY on `invocation_registry` | — |
| Replay epoch barrier | OPEN | No stale-epoch replay detection in `verifyReplayLineageEligibility` | EC-11 |
| Epoch monotonicity enforcement | OPEN | No trigger; `registry_epoch` is `string` type | EC-10 |
| Epoch monotonicity registry | OPEN | `epoch_monotonicity_registry` table does not exist | EC-10 |
| Reconciliation epoch classification | OPEN | No `epoch_conflict_class` on `cross_registry_reconciliation_registry` | EC-08 |
| Distributed epoch authority | OPEN | Canonical epoch derived by plurality vote, not monotonicity record | EC-09 |
| Distributed replica epoch gate | OPEN | Replica may authorize execution under stale epoch | EC-12 |
| Quorum classification | CONTAINED | `classifyDistributedQuorum()` classifies 7 states; no epoch input | Epoch not a quorum dimension |
| Topology visibility | CLOSED | 15-section canonical inventory; all drift classes defined | — |
| Partition handling | CLOSED | All partition modes → NULL (fail-closed) | — |
| Settlement authority | NULL | No settlement protocol; arbitration is `creates_authority: false` | Design gap, not bug |
| Bootstrap epoch legitimacy | BREAK_GLASS | Genesis epoch derivable only from external anchor or operator assertion | EC-B1 |
| Rollback detection (within D1) | CLOSED | Append-only triggers block in-database rollback | — |
| Rollback detection (cross-system) | OPEN | No external anchor prevents DB restore, git force-push, PR revert | EC-R1 |

---

## 3. Topology Dependency Map

The canonical legitimacy topology is defined in
`runtime/topology/topology_ontology.json` and
`runtime/root_authority_boundaries.json`:

```
/session
  → /continuity    [continuity_registry]
    → /authority   [authority_registry]
      → /compile   [aeo_registry]
        → /validate [validation_registry, preo_registry]
          → /execute [execution_registry, invocation_registry]
            → /proof  [proof_registry]
              → /reconcile [cross_registry_reconciliation_registry]
```

### 3.1 Epoch Flow Through Topology

Under the current schema, epoch does **not** flow through this topology:

```
continuity_registry.status = 'ACTIVE'          ← no epoch column
  → authority_registry.status = 'ACTIVE'        ← no epoch column
    → aeo_registry.status = 'COMPILED'          ← no epoch column
      → preo_registry.status = 'ACTIVE'         ← no epoch column
        → validation_registry.status = 'VALID'  ← no epoch column
          → execution_registry (record)          ← no epoch column
            → proof_registry (record)            ← no epoch column
```

Epoch advancement at `continuity_registry` — if it were persisted — would
propagate to dependent tables only through active invalidation (revocation
cascade). Without `continuity_epoch` on `continuity_registry`, no cascade
trigger can fire on epoch change. The lineage topology is epoch-blind.

### 3.2 Epoch Observation Points (Non-Authoritative)

| Location | Field | Authority |
|---|---|---|
| `DistributedContinuityRegistryView.registry_epoch` | `string` | Observational only |
| `execution_snapshot_registry.replay_epoch` | `TEXT` | Post-execution record |
| `TemporalLineageNode.epoch` | `number` | Runtime-only, never persisted |
| `inspectTemporalLineageReplay` input `expectedEpoch` | `number` | Caller-supplied |

None of these are authoritative. All are observational or advisory.

### 3.3 Topology Containment Axioms (Existing)

From `runtime/topology/topology_containment_axioms.json`:

```
undeclared_execution_surface → NULL
topology_drift → reconciliation_required
proofless_mutation → INVALID
boundary_escape → sovereignty_failure
orphan_lineage → containment_required
```

**Missing axiom:**

```
epoch_advancement_without_lineage_column → OPEN
cross_epoch_authority_exercise → STALE_EPOCH
epoch_rollback_undetected → NULL
```

### 3.4 D1 Topology Dependency

The entire persistence layer is a single Cloudflare D1 SQLite instance. This means:

- All epoch state (if persisted) exists in a single linearizable store
- Multi-instance epoch divergence is not currently possible by deployment topology
- Epoch race conditions are D1-transaction-level races, not distributed consensus races
- Partition scenarios arise only at the D1–Worker boundary, not across D1 replicas

The distributed epoch analysis below applies to the deployed topology only if
horizontal scaling, D1 read replicas, or multi-instance deployment is introduced.
Under current single-instance topology, epoch races are serializable within D1
transactions.

---

## 4. Epoch Race-Condition Matrix

The following races are classified by detectability and current outcome.

### 4.1 Single-Node Races (Current Topology)

| Race | Participants | Current Outcome | Detectable? |
|---|---|---|---|
| R-1: Epoch advance + RESERVED authority execution | Thread A advances epoch; Thread B exercises RESERVED authority | B proceeds if it reads pre-advancement state | No — no epoch column |
| R-2: PREO review straddles epoch boundary | PREO submitted epoch N; epoch advances to N+1 during review; PREO stored | PREO structurally valid in N+1 with no error signal | No — no epoch on PREO |
| R-3: Delegation issued epoch N, exercised epoch N+1 | Delegation created; epoch advances; delegation exercised | Delegation proceeds with no mismatch signal | No — no epoch on delegation |
| R-4: Concurrent authority creation at epoch boundary | Two threads create authorities simultaneously during epoch transition | Both may be created; neither is epoch-stamped | No — no epoch column |
| R-5: Stale nonce reservation across epoch | Nonce reserved epoch N; nonce consumed epoch N+1 | Consumed if nonce was unused; no epoch check | No — nonce is epoch-blind |

### 4.2 Distributed Races (Potential Future Topology)

| Race | Participants | Current Outcome | Detectable? |
|---|---|---|---|
| R-6: Concurrent epoch issuance | Two replicas propose epoch N+1 simultaneously | No epoch proposal mechanism exists | NULL (mechanism absent) |
| R-7: Stale epoch propagation | Replica A at epoch N; Replica B at epoch N+1 | Plurality vote elects N as canonical | Misclassification (EC-09) |
| R-8: Delayed supersession | Parent continuity ACTIVE; child created; child not propagated to replica | Replica authorizes from parent | No — supersession not status-authoritative |
| R-9: Settlement-before-epoch visibility | Settlement committed to authority; epoch not visible at receiving replica | Settlement proceeds against stale epoch | NULL — no settlement protocol |
| R-10: Rollback-before-reconciliation | DB restored to pre-epoch state; reconciliation runs against restored state | Restored state is structurally valid; epoch rollback undetected | No — no external anchor |
| R-11: Epoch resurrection via replay | Replay uses authority from revoked epoch | Replay proceeds if continuity_id still ACTIVE | No — epoch not in replay eligibility check |
| R-12: Epoch drift across federated replicas | Two federated runtimes at different epochs | Federated legitimacy snapshot is epoch-blind | No — federation has no epoch field |
| R-13: Partitioned epoch divergence | Network split; each partition advances epoch independently | Both partitions produce valid-looking legitimacy | NULL — partition → NULL (fail-closed) |

### 4.3 Race-Condition Summary

All R-1 through R-5 are serializable at the D1 transaction level but produce
incorrect outcomes because the epoch column does not exist to enforce the
epoch equality check. The races are not detectable by any current invariant.

R-6 through R-12 apply to future multi-instance deployments. R-13 is
correctly handled fail-closed by the existing partition rules.

---

## 5. Replay-Boundary Analysis

### 5.1 Existing Replay Barriers

The following replay barriers are currently enforced:

| Barrier | Mechanism | Location |
|---|---|---|
| Nonce single-use | `invocation_registry` PRIMARY KEY | `migrations/0041_proof_replay_idempotency.sql` |
| Execution hash uniqueness | `UNIQUE(workflow_run_id)` on `proof_registry` | Triggers |
| Continuity revocation check | `verifyContinuityLineage` status check | `src/runtime/continuity/verifyContinuityLineage.ts:35` |
| Temporal ordering check | `non_monotonic_replay_timestamp` detection | `temporal_lineage_replay_inspector.ts:107` |
| Orphan ancestry detection | `orphan_replay_ancestry` detection | `temporal_lineage_replay_inspector.ts:88` |
| Topology hash mismatch | `topology_regeneration_mismatch` detection | `temporal_lineage_replay_inspector.ts:104` |

### 5.2 Missing Replay Barriers

| Gap | Description | Effect |
|---|---|---|
| Epoch equality check | `verifyReplayLineageEligibility` does not compare `replay.continuity_epoch` to `canonical.continuity_epoch` | Stale-epoch replay proceeds if nonce unused |
| SUPERSEDED continuity barrier | `verifyContinuityLineage` only checks `status='ACTIVE'`; SUPERSEDED parent is still ACTIVE | Superseded-lineage replay proceeds |
| Lineage hash epoch component | `lineageHash()` does not include epoch | Identical hashes across epoch boundaries |
| Distributed epoch gate | `expectedEpoch` is caller-supplied; no lineage-derived source of truth | Stale replica passes its own epoch check |
| Replay epoch classification | No `STALE_EPOCH_REPLAY` in `CONTINUITY_LINEAGE_DRIFT_CLASSES` | Epoch drift has no named classification |

### 5.3 Dead-Lineage Replay Path

The most critical gap is the **dead-lineage replay path**:

```
Authority created: epoch N, status=RESERVED, nonce unused
                   ↓
Epoch advances: N → N+1
continuity_epoch not propagated (column doesn't exist)
                   ↓
Execution gate checks:
  status='RESERVED'         ✓ (still RESERVED)
  continuity status='ACTIVE' ✓ (parent still ACTIVE)
  nonce unused               ✓ (first use)
  EPOCH_VALID                — CHECK ABSENT
                   ↓
Execution proceeds. Authority from epoch N is consumed in epoch N+1.
```

This is structurally indistinguishable from a valid execution under the current
schema. No trigger fires. No invariant is violated. No drift class is emitted.

### 5.4 Replay Window Boundaries

Under current schema, replay eligibility is bounded by:

- Nonce: permanent (nonce is globally unique once used)
- TTL: `continuity_registry.expires_at` (time-based)
- Revocation: explicit `revoked_at` write

Replay eligibility is **not** bounded by:

- Epoch: no epoch column on any registry
- Supersession: parent remains ACTIVE after child creation
- Epoch monotonicity record: table does not exist

---

## 6. Supersession Determinism Analysis

### 6.1 Current Supersession Mechanism

Supersession is determined by anti-join query at read time:

```sql
-- resolveCurrentContinuityIdentity (src/index.ts:2629–2655)
SELECT c.continuity_id ...
FROM continuity_registry c
WHERE c.status='ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM continuity_registry child
    WHERE child.parent_continuity_id = c.continuity_id
      AND child.status='ACTIVE'
  )
```

**Properties of this mechanism:**

| Property | Value |
|---|---|
| Authoritative? | No — topology-derived at query time |
| Deterministic? | Yes — under D1 serializable reads |
| Atomic with child creation? | No — child INSERT does not UPDATE parent status |
| Epoch-aware? | No — no epoch column |
| Persistent? | No — computed on each query |
| Detectable by execute barrier? | No — barrier checks `status='ACTIVE'`, not topology leaf |

### 6.2 Supersession Status Gap

`ContinuityStatus` enum: `"ACTIVE" | "REVOKED" | "EXPIRED"`

`SUPERSEDED` exists only in `src/lib/skill-provenance-revocation.js` — scoped to
skill provenance revocation, not core continuity. It is not in:

- `schemas/continuity.schema.json` enum
- `src/runtime/continuity/verifyContinuityLineage.ts` type
- Any migration-defined CHECK constraint
- The authority invalidation check (`AUTHORITY_CONTINUITY_VALID`)
- The proof archival check (`ORPHAN_PROOF_ARCHIVED`)
- The `classifyDistributedQuorum()` function

### 6.3 Supersession Ordering Determinism

Under single D1 instance, supersession ordering is deterministic:

- Child `issued_at` timestamp determines ordering
- `ORDER BY issued_at DESC, continuity_id DESC` establishes total order among siblings
- D1 serializable writes prevent concurrent insertions from producing ambiguous sibling state

**Non-determinism risks:**

| Scenario | Deterministic? | Reason |
|---|---|---|
| Single child creation | Yes | D1 serializable |
| Concurrent child creation (forked lineage) | No | No sibling-fork detection trigger; two ACTIVE children possible |
| Child creation + parent revocation | Yes | Revocation supercedes supersession |
| Supersession across distributed replicas | No | Mechanism requires local D1 topology read |
| Epoch-aware supersession | N/A | Epoch not a supersession input |

### 6.4 Concurrent Epoch Proposals and Legitimacy Forking

Because epoch is not a persisted field and supersession is not status-authoritative,
concurrent governance mutation at the continuity level can produce:

```
parent continuity_id = C1 (status=ACTIVE)
   ↓                          ↓
child C2 created          child C3 created
(status=ACTIVE)           (status=ACTIVE)
```

Both C2 and C3 are simultaneously `ACTIVE`. The anti-join query:
- Returns C2 if C3 has no active child and C2 does
- Returns C3 if C2 has no active child and C3 does
- Returns neither if both have no active children (returns C1 instead)

This is a **sibling fork condition** with no detection invariant in the current
schema. No `SIBLING_FORK_DETECTED` drift class exists. No trigger enforces the
`UNIQUE(parent_continuity_id) WHERE status='ACTIVE'` invariant.

---

## 7. Epoch Rollback Analysis

### 7.1 Rollback Resistance Within D1

All registry tables enforce append-only semantics via triggers:

```sql
-- Example from proof_registry
CREATE TRIGGER trg_proof_registry_no_update BEFORE UPDATE ON proof_registry
BEGIN SELECT RAISE(ABORT, 'proof_registry is append-only'); END;
CREATE TRIGGER trg_proof_registry_no_delete BEFORE DELETE ON proof_registry
BEGIN SELECT RAISE(ABORT, 'proof_registry is append-only'); END;
```

Within D1, epoch rollback is impossible without bypassing these triggers. This is
the correct and sufficient defense for single-node operation.

### 7.2 Rollback Paths That Bypass D1 Triggers

| Rollback Path | Detection | Mitigation |
|---|---|---|
| D1 database restore from backup | None — restored state is structurally valid | No external cryptographic anchor |
| Git force-push rewriting governance artifacts | None | No governance artifact content hash anchored in D1 |
| PR revert re-introducing superseded policy | None at schema level | Code review only |
| Operator migration rollback | None | No epoch_monotonicity_registry to prove "epoch was at least N" |
| Schema migration downgrade | Partial — app would fail on missing columns | Only if columns were added |

### 7.3 Missing Rollback Detection Primitives

The critical missing primitive is the `epoch_monotonicity_registry`:

```sql
-- Required table (does not exist):
CREATE TABLE epoch_monotonicity_registry (
  epoch_record_id        TEXT PRIMARY KEY,
  lineage_root_id        TEXT NOT NULL,
  prior_epoch            INTEGER NOT NULL,
  advanced_epoch         INTEGER NOT NULL,
  epoch_advancement_hash TEXT NOT NULL UNIQUE,
  continuity_id          TEXT NOT NULL,
  evidence_only          TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral         TEXT NOT NULL CHECK (replay_neutral='true'),
  creates_authority      TEXT NOT NULL CHECK (creates_authority='false'),
  created_at             TEXT NOT NULL,
  CHECK (advanced_epoch > prior_epoch)
);
```

Without this table:
- There is no durable record that epoch N was ever reached
- A DB restore to epoch N-1 is indistinguishable from the system never having
  reached epoch N
- Rollback detection is impossible from stored state alone

### 7.4 Rollback Irreversibility Risk

**Is legitimacy rollback reversible?** Under current schema: yes — a DB restore
silently produces a prior-epoch state that is structurally valid.

**Is it detectable?** No — no external anchor, no monotonicity record.

**Can it become irreversible?** Yes, if:
- External consumers cached proofs from epoch N
- Those proofs reference execution records that no longer exist post-restore
- The proof lineage cannot be validated against the restored registry state

This creates a split-validity condition: external consumers hold valid epoch-N
proofs; the internal registry is at epoch N-1. Neither side detects the
discrepancy structurally.

---

## 8. Governance Time Model Analysis

### 8.1 Time Sources in Current Runtime

| Source | Type | Trustworthy? | Enforced? |
|---|---|---|---|
| `continuity_registry.issued_at` | ISO text | Monotonic within D1 inserts | Not enforced by constraint |
| `continuity_registry.expires_at` | ISO text | TTL boundary | Enforced by `verifyContinuityLineage` |
| `authority_registry.expiry` | ISO text | Authority TTL | Enforced by execute gate |
| `TemporalLineageNode.timestamp` | ISO text | Runtime-only | Not persisted |
| `execution_snapshot_registry.replay_epoch` | TEXT | Post-execution label | Not enforced |
| `clock_skew_failure_modes.json` max_allowed_skew_ms | 300000ms | Clock policy | Policy only |

### 8.2 Governance Time Ordering Properties

| Property | Status | Evidence |
|---|---|---|
| Monotonic within D1 | PARTIAL | `issued_at` ordering assumed, not enforced by constraint |
| Partially ordered | YES | Parent→child lineage provides partial order |
| Observational | YES — currently | `TemporalLineageNode.epoch` is runtime-only |
| Topology-relative | YES | `resolveCurrentContinuityIdentity` depends on local D1 read |
| Rollbackable | YES | DB restore silently re-establishes prior time state |
| Canonical across replicas | NO | No mechanism for replicas to agree on canonical time |
| Epoch-indexed | NO | No epoch column in lineage tables |

### 8.3 Legitimacy Decay Model

From `runtime/temporal/legitimacy_decay_model.json`, decay classes exist for:

- `expired_authority` — authority TTL exceeded
- `stale_validation` — validation performed against stale object state
- `expired_proof` — proof lineage outside retention window
- `revoked_continuity` — explicit revocation propagated
- `temporal_lineage_drift` — ordering divergence detected

**Missing decay class:** `epoch_stale_lineage` — objects created in a prior epoch
that remain structurally eligible despite epoch advancement.

### 8.4 Clock Skew Policy

`clock_skew_failure_modes.json` declares:

```json
"max_allowed_skew_ms": 300000,
"beyond_policy": "NULL"
```

Clock skew beyond 300 seconds (5 minutes) produces NULL. Active time
synchronization is forbidden (consistent with the no-mutation constraint).
The 300-second window defines the temporal boundary for epoch straddling: any
two events within this window may be epoch-ambiguous.

### 8.5 Governance Time Model Classification

**Current model:** Partial order based on `issued_at` timestamps with TTL bounds.

**Is governance time monotonic?** Within D1: effectively yes (insert timestamps
increment). Formally: not enforced.

**Is governance time canonical?** No — `registry_epoch` is derived by plurality
vote from distributed view structures. Plurality is not a canonical source.

**Is governance time reversible?** Yes — DB restore is undetected.

**Is governance time epoch-indexed?** No — epoch does not exist as a column in
any lineage table.

---

## 9. Highest-Leverage Closure Targets

Ordered by leverage (single change enabling maximum downstream invariants):

### Target 1 — EC-01 + EC-10: `continuity_epoch` Column + Monotonicity Trigger

**Why highest leverage:**

```
continuity_registry.continuity_epoch (INTEGER, NOT NULL)
+ monotonicity trigger (child.epoch >= parent.epoch)
```

This single change enables:
- EC-02: All dependent tables inherit epoch at creation (mechanical derivation)
- EC-05: `STALE_RESERVATION_DEAD_LINEAGE` becomes a `WHERE authority.continuity_epoch < current_epoch` predicate
- EC-06: Execution barrier epoch equality becomes a column comparison
- EC-07: Proofs are distinguishable across epochs
- EC-08: Reconciliation epoch conflict classification becomes `MAX(epoch) != MIN(epoch)`
- EC-10: Rollback detection becomes structurally possible
- EC-11: Replay eligibility gains a deterministic epoch comparison
- EC-R1: `epoch_monotonicity_registry` can be populated from the trigger

**Required migration:**

```sql
ALTER TABLE continuity_registry
  ADD COLUMN continuity_epoch   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE continuity_registry
  ADD COLUMN epoch_issued_at    TEXT;
ALTER TABLE continuity_registry
  ADD COLUMN epoch_binding_hash TEXT;

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

### Target 2 — EC-S2: `SUPERSEDED` Status + Atomic Parent Transition

**Why second:**

Adding `SUPERSEDED` to `ContinuityStatus` and making child creation atomic with
parent status update:
- Closes the execute-barrier gap (superseded parent blocked at barrier)
- Closes the authority invalidation gap (`AUTHORITY_CONTINUITY_SUPERSEDED` invariant)
- Closes the proof archival gap (`ORPHAN_PROOF_SUPERSEDED` invariant)
- Enables sibling-fork detection trigger
- Enables `classifyDistributedQuorum()` to include supersession as a quorum dimension

**Required changes:**

```typescript
// ContinuityStatus type
export type ContinuityStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "SUPERSEDED"

// schema enum
"status": { "enum": ["ACTIVE", "REVOKED", "EXPIRED", "SUPERSEDED"] }

// child creation: atomic with parent status update
BEGIN TRANSACTION;
INSERT INTO continuity_registry (..., status) VALUES (..., 'ACTIVE');
UPDATE continuity_registry SET status='SUPERSEDED', superseded_at=?1, superseded_by=?2
  WHERE continuity_id=?3 AND status='ACTIVE';
COMMIT;
```

### Target 3 — EC-10: `epoch_monotonicity_registry` Table

**Why third:**

The append-only `epoch_monotonicity_registry` is the only structural primitive that
can prove "epoch has been at least N." Without it, rollback detection is impossible
from stored state. With it:
- EC-R1 (cross-system rollback detection) becomes structurally possible
- EC-09 (plurality-vote epoch authority) can be replaced by monotonicity record authority
- EC-12 (distributed replica epoch gate) gains a quorum-independent authority source

### Target 4 — EC-08: Epoch Conflict Class on Reconciliation Registry

**Why fourth:**

Adding `epoch_conflict_class` to `cross_registry_reconciliation_registry` allows
reconciliation to partition views into epoch equivalence classes. Cross-epoch
reconciliation produces `EPOCH_DIVERGED` and does not proceed to `RECONCILED`.
This closes the reconciliation indeterminism gap without requiring any new
table.

### Target 5 — EC-11: Epoch Comparison in `verifyReplayLineageEligibility`

**Why fifth:**

Once Target 1 exists (epoch column on continuity_registry), adding the epoch
equality check to replay eligibility is a two-line code change:

```typescript
if (entry.continuity_epoch !== undefined
    && canonical_epoch !== undefined
    && entry.continuity_epoch < canonical_epoch) {
  return { eligible: false, ineligibility_reason: 'stale_epoch_replay' }
}
```

This closes the dead-lineage replay path.

---

## 10. Required Missing Primitives

### 10.1 Schema Primitives

#### `continuity_epoch` on All Lineage Tables

```sql
-- continuity_registry (primary)
continuity_epoch   INTEGER NOT NULL DEFAULT 0
epoch_issued_at    TEXT
epoch_binding_hash TEXT

-- All dependent tables
authority_registry:        continuity_epoch INTEGER
aeo_registry:              continuity_epoch INTEGER
validation_registry:       continuity_epoch INTEGER
execution_registry:        continuity_epoch INTEGER
proof_registry:            continuity_epoch INTEGER
preo_registry:             continuity_epoch INTEGER, epoch_anchor_hash TEXT
delegated_authority_registry: continuity_epoch INTEGER, delegation_epoch_hash TEXT
invocation_registry:       continuity_epoch INTEGER
```

#### `epoch_conflict_class` on Reconciliation Registry

```sql
ALTER TABLE cross_registry_reconciliation_registry
  ADD COLUMN epoch_conflict_class TEXT
    CHECK (epoch_conflict_class IS NULL OR epoch_conflict_class IN (
      'EPOCH_EQUIVALENT', 'EPOCH_DIVERGED', 'EPOCH_ROLLBACK_DETECTED',
      'EPOCH_PARTIAL_VISIBILITY', 'EPOCH_STALE_MAJORITY', 'NULL'
    ));
ALTER TABLE cross_registry_reconciliation_registry
  ADD COLUMN canonical_epoch_observed INTEGER;
ALTER TABLE cross_registry_reconciliation_registry
  ADD COLUMN min_epoch_observed       INTEGER;
ALTER TABLE cross_registry_reconciliation_registry
  ADD COLUMN max_epoch_observed       INTEGER;
```

#### `superseded_at` and `superseded_by` on `continuity_registry`

```sql
ALTER TABLE continuity_registry ADD COLUMN superseded_at TEXT;
ALTER TABLE continuity_registry ADD COLUMN superseded_by TEXT
  REFERENCES continuity_registry(continuity_id);
```

### 10.2 Registry Primitives

#### `epoch_monotonicity_registry`

```sql
CREATE TABLE IF NOT EXISTS epoch_monotonicity_registry (
  epoch_record_id        TEXT PRIMARY KEY,
  lineage_root_id        TEXT NOT NULL,
  prior_epoch            INTEGER NOT NULL,
  advanced_epoch         INTEGER NOT NULL,
  epoch_advancement_hash TEXT NOT NULL UNIQUE,
  continuity_id          TEXT NOT NULL,
  evidence_only          TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral         TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable       TEXT NOT NULL CHECK (mutation_capable='false'),
  creates_authority      TEXT NOT NULL CHECK (creates_authority='false'),
  created_at             TEXT NOT NULL,
  CHECK (advanced_epoch > prior_epoch)
);

CREATE TRIGGER trg_epoch_monotonicity_registry_no_update
BEFORE UPDATE ON epoch_monotonicity_registry
BEGIN SELECT RAISE(ABORT, 'epoch_monotonicity_registry is append-only'); END;

CREATE TRIGGER trg_epoch_monotonicity_registry_no_delete
BEFORE DELETE ON epoch_monotonicity_registry
BEGIN SELECT RAISE(ABORT, 'epoch_monotonicity_registry is append-only'); END;
```

### 10.3 Type Primitives

#### `ContinuityStatus` Extension

```typescript
export type ContinuityStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "SUPERSEDED"
```

#### `EpochConflictClass` Type

```typescript
export type EpochConflictClass =
  | 'EPOCH_EQUIVALENT'
  | 'EPOCH_DIVERGED'
  | 'EPOCH_ROLLBACK_DETECTED'
  | 'EPOCH_PARTIAL_VISIBILITY'
  | 'EPOCH_STALE_MAJORITY'
  | 'NULL'
```

#### Drift Class Extension

```typescript
// Add to TemporalDriftClass:
| 'epoch-stale-lineage'
| 'epoch-rollback-detected'
| 'epoch-stale-majority'
| 'supersession-induced'
```

### 10.4 Lineage Object Extensions

#### Proof Structure Epoch Binding

```typescript
interface ProofObject {
  // existing fields ...
  continuity_epoch: number        // epoch at proof issuance
  epoch_binding_hash: string      // hash(continuity_epoch + proof_id + execution_id)
}
```

#### Authority Object Epoch Binding

```typescript
interface AuthorityObject {
  // existing fields ...
  continuity_epoch: number        // epoch at authority issuance
  // stale check: if authority.continuity_epoch < current_epoch → DEAD_LINEAGE
}
```

### 10.5 Temporal Boundary Definitions

| Boundary | Definition | Currently Enforced? |
|---|---|---|
| Authority TTL | `authority.expiry` | Yes |
| Continuity TTL | `continuity.expires_at` | Yes |
| Epoch-scope authority window | `authority.continuity_epoch == continuity.continuity_epoch` | No — column absent |
| Delegation epoch window | `delegation.continuity_epoch == current continuity_epoch` | No — column absent |
| PREO epoch window | `preo.continuity_epoch == current continuity_epoch` | No — column absent |
| Replay epoch window | `replay.continuity_epoch == current continuity_epoch` | No — column absent |

### 10.6 Supersession Mechanisms

| Mechanism | Required | Currently Exists? |
|---|---|---|
| Atomic child INSERT + parent UPDATE | Yes | No |
| `SUPERSEDED` status in schema enum | Yes | No (skill-provenance only) |
| `superseded_at` timestamp | Yes | No |
| `superseded_by` foreign key | Yes | No |
| Sibling-fork detection trigger | Yes | No |
| Execute barrier SUPERSEDED check | Yes | No |
| Authority invalidation on SUPERSEDED | Yes | No |
| Proof archival on SUPERSEDED | Yes | No |

### 10.7 Epoch Propagation Semantics

At epoch advancement (when epoch column exists):

```
epoch_advancement(continuity_id, prior_epoch, advanced_epoch):
  1. Write epoch_monotonicity_registry record
  2. Insert child continuity with continuity_epoch = advanced_epoch
  3. Update parent status to SUPERSEDED (atomic with step 2)
  4. Cascade: RESERVED authorities with continuity_epoch < advanced_epoch
     → classify as DEAD_LINEAGE (do not execute)
  5. Cascade: PREO with epoch < advanced_epoch → EPOCH_STALE_PREO
  6. Cascade: delegations with epoch < advanced_epoch → DELEGATION_EPOCH_STALE

At replay gate:
  require: object.continuity_epoch == continuity_registry[continuity_id].continuity_epoch
  else:    STALE_EPOCH_REPLAY → NULL
```

---

## 11. Final Determination

### 11.1 Epoch Authority Classification

**Are governance epochs authoritative?**

> **NO — currently observational.**

Epoch exists as an informal label on distributed view structures and a runtime-only
variable in `TemporalLineageNode`. It is not persisted in any lineage table. It
does not bind any dependent object. It does not gate execution. Epoch observation
does not equal epoch authority.

**Path to authoritative:** Add `continuity_epoch INTEGER` to `continuity_registry`
with a monotonicity trigger. This is the minimum change that makes epoch
authoritative rather than observational.

---

### 11.2 Epoch Topology-Relativity

**Are epochs topology-relative?**

> **YES — and incorrectly so.**

Canonical epoch is currently derived by plurality vote of `registry_epoch` values
across distributed view structures. A majority coalition of stale replicas can
elect a stale epoch as canonical. Epoch should be authoritative by monotonicity
record, not by topology count. The current design conflates topology observation
with lineage authority.

---

### 11.3 Epoch Replay Safety

**Are epochs replay-safe?**

> **NO — dead-lineage replay path exists.**

Stale-epoch replay (authority from epoch N exercised in epoch N+k) is undetected
when:
- continuity_id remains ACTIVE (no revocation cascade triggered epoch advancement)
- invocation nonce is unused (first attempt in new epoch)
- authority status is RESERVED or ACTIVE

The nonce barrier and append-only triggers protect against re-use and mutation,
but they do not protect against first-use across epoch boundaries. No epoch
equality check exists in `verifyReplayLineageEligibility`.

---

### 11.4 Epoch Determinism

**Are epoch transitions deterministic?**

> **PARTIAL — deterministic within D1 transactions; non-deterministic at distributed
> topology boundary.**

Under single-instance D1, epoch ordering is serializable. Concurrent child
continuity creation (sibling fork) has no detection trigger, but D1 serializable
writes limit concurrency. At distributed topology, canonical epoch is
non-deterministically derived by plurality vote, which can elect stale state.

---

### 11.5 Epoch Canonicality

**Are epochs canonical?**

> **NO.**

No epoch column exists on any authoritative lineage table. The `continuity_registry`
has no `continuity_epoch`. The `epoch_monotonicity_registry` does not exist. There
is no durable source of truth for "the current canonical epoch."

---

### 11.6 Epoch Reversibility

**Are epochs reversible?**

> **YES — under current schema.**

Within D1, append-only triggers prevent in-database rollback. At system boundaries
(DB restore, git force-push, schema downgrade), epoch rollback is undetected.
No `epoch_monotonicity_registry` exists to prove "epoch was at least N."
No external cryptographic anchor exists. Legitimacy rollback is structurally
possible and structurally invisible.

---

### 11.7 Epoch Monotonicity

**Is governance time monotonic?**

> **PARTIAL — assumed but not enforced.**

`issued_at` timestamps provide an assumed partial order within D1. No constraint
enforces that `child.issued_at >= parent.issued_at`. No trigger enforces
`child.continuity_epoch >= parent.continuity_epoch` (column does not exist).
Clock skew policy (300s window) acknowledges non-monotonicity risk but does not
enforce monotonicity.

---

### 11.8 Composite Determination

```
VALID             PARTIAL — epoch obliviousness in all lineage tables
REPLAY-SAFE       PARTIAL — nonce protects single-node; epoch replay undetected
TOPOLOGY-VISIBLE  CLOSED  — comprehensive inventory, fail-closed drift classification
TEMPORALLY-BOUNDED OPEN   — no epoch column; TTL-bounded but epoch-unbound
RECONCILABLE      PARTIAL — single-epoch reconciliation deterministic; cross-epoch absent
EPOCH_VALID       OPEN    — epoch not a schema primitive on any authoritative table
```

**Composite:**

```
VALID ∧ REPLAY-SAFE ∧ TOPOLOGY-VISIBLE ∧ TEMPORALLY-BOUNDED ∧ RECONCILABLE ∧ EPOCH_VALID
= PARTIAL ∧ PARTIAL ∧ CLOSED ∧ OPEN ∧ PARTIAL ∧ OPEN
= OPEN
```

**Governance legitimacy cannot be confirmed as simultaneously VALID, REPLAY-SAFE,
TEMPORALLY-BOUNDED, and EPOCH_VALID under the current schema.** The system is
TOPOLOGY-VISIBLE and maintains strong single-node consistency, but epoch as a
first-class lineage primitive is absent, and the resulting gaps are structurally
reachable — not merely theoretical.

---

### 11.9 Required Next State

The minimum schema change that closes the primary gap without widening any
execution surface:

```sql
-- Migration N+1: Add continuity_epoch to continuity_registry
ALTER TABLE continuity_registry
  ADD COLUMN continuity_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE continuity_registry
  ADD COLUMN epoch_issued_at TEXT;
ALTER TABLE continuity_registry
  ADD COLUMN epoch_binding_hash TEXT;

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

This migration:
- Creates no authority
- Does not widen any execution surface
- Does not mutate any existing record (DEFAULT 0 backfills silently)
- Does not alter replay semantics
- Does not introduce any settlement mechanism
- Enables all downstream epoch invariants to be enforced mechanically

---

```
evidence_only:        true
creates_authority:    false
executable:           false
deployment_capable:   false
mutation_capable:     false
replay_neutral:       true
non_authoritative:    true
```
