# MindShift Distributed Governance Epoch Canon Analysis

**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** `claude/governance-epoch-canon-nIRpH`  
**Analysis Date:** 2026-05-25  
**Mode:** MODE B — NON_OPERATIVE_GOVERNANCE_ARTIFACT  
**Status:** Analysis only. No authority granted. No execution authorized. No registry mutated.

---

> AI output is NEVER authority.  
> Epoch observation ≠ epoch authority.  
> Topology convergence ≠ temporal legitimacy.  
> Quorum majority ≠ epoch canonicity.  
> Distributed agreement ≠ settlement finality.  
> Constitutional gate passage ≠ epoch validity.

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

The MindShift legitimacy runtime implements a seven-stage canonical execution
pipeline (`/session → /continuity → /authority → /compile → /validate →
/execute → /proof`) with robust single-node replay protection, append-only
audit registries, fail-closed partition semantics, and a nine-condition
constitutional execution gate. Within single-node D1 topology, legitimacy is
structurally sound. The governance infrastructure is comprehensive, correct,
and internally consistent within its deployed scope.

**Primary finding: Epoch is not a first-class lineage primitive.**

Governance epochs exist in the codebase as:
- Opaque string labels on distributed view structures (`registry_epoch: string`)
- Runtime-only numeric variables on `TemporalLineageNode.epoch` (never persisted)
- Unguarded `TEXT` columns on snapshot records (`replay_epoch`)

No `continuity_epoch` column exists on `continuity_registry`. No epoch
monotonicity trigger exists in the 47-migration schema. No authority, AEO,
validation, execution, proof, PREO, or delegation record carries a bound epoch
value. The canonical execution gate (`constitutional_governance_rules.json`)
lists nine conditions — `VALID`, `AUTHORIZED`, `UNUSED`, `POLICY_VALID`,
`CANONICAL_LINEAGE_CONTINUITY`, `TEMPORALLY_VALID`, `STATE_CONSISTENT`,
`SOVEREIGNTY_VALID`, `CONSTITUTIONALLY_VALID` — but not `EPOCH_VALID`. This
is the structural root of the epoch gap: the gate that governs execution does
not enforce epoch binding.

**Secondary finding: Supersession is topology-derived, not status-authoritative.**

The `continuity_registry` has no `SUPERSEDED` status in its canonical enum.
Parent continuity remains `ACTIVE` after child creation. Supersession is
inferred by anti-join at read time. The execute barrier checks `status='ACTIVE'`
directly, making it unable to detect superseded lineage without topology
resolution.

**Tertiary finding: Settlement authority is correctly absent but unbound.**

All distributed consensus artifacts are explicitly `creates_authority: false`,
`non_authoritative: true`. The `GOVERNANCE_CONSENSUS_SPEC.json` confirms 14
drift classes, none epoch-specific. No settlement protocol, finality bundle,
or epoch-bound settlement propagation mechanism exists. This is consistent
with single-node topology, but means settlement-time legitimacy analysis
yields `NULL` — not a defect, but a structural boundary condition.

**Quaternary finding: Constitutional gate omits EPOCH_VALID.**

The `constitutional_governance_rules.json` canonical execution gate is the
definitive enforcement point for all legitimacy conditions. Its current nine
conditions do not include `EPOCH_VALID`. This means epoch validity is not a
constitutional invariant; it is unenforceable at the execution gate until
explicitly added.

**Quinary finding: Bootstrap epoch is BREAK_GLASS.**

The `break_glass_containment_semantics.json` defines genesis authority as
observability-only and non-executable. The `bootstrap_sovereignty_registry`
is append-only and evidence-only. No immutable bootstrap epoch anchor exists
that can prove "the genesis epoch was epoch 0." Bootstrap epoch legitimacy
requires external anchor or operator assertion — structurally `BREAK_GLASS`.

**Governance legitimacy under the six target properties:**

| Property | Current Status | Primary Gap |
|---|---|---|
| VALID | PARTIAL | Epoch obliviousness in all lineage tables; gate lacks EPOCH_VALID |
| REPLAY-SAFE | PARTIAL | Nonce protects single-node; stale-epoch replay undetected |
| TOPOLOGY-VISIBLE | CLOSED | Comprehensive inventory; fail-closed drift classification |
| TEMPORALLY-BOUNDED | OPEN | No epoch column; TTL exists but is epoch-unbound |
| RECONCILABLE | PARTIAL | Single-epoch reconciliation deterministic; cross-epoch absent |
| EPOCH_VALID | OPEN | Not a schema primitive on any authoritative table; not in gate |

---

## 2. Epoch Legitimacy Classification Matrix

Each governance primitive is classified against six closure states:

- **CLOSED** — invariant fully enforced by schema, trigger, or code
- **CONTAINED** — enforced for the observed perimeter; gaps exist at boundary
- **PARTIAL** — enforcement exists but has structural holes
- **OPEN** — no enforcement; gap is structurally reachable
- **NULL** — undefined or unreachable in current runtime
- **BREAK_GLASS** — requires manual operator intervention to establish legitimacy

### 2.1 Core Lineage Epoch Binding

| Primitive | Class | Evidence | Critical Gap |
|---|---|---|---|
| Continuity lineage integrity (single-node) | CLOSED | `verifyContinuityLineage`, append-only triggers | — |
| Continuity epoch binding | OPEN | No `continuity_epoch` column | EC-01 |
| Continuity supersession detection | PARTIAL | Anti-join query at read time | Not status-authoritative (EC-S1) |
| Continuity supersession enforcement | OPEN | No `SUPERSEDED` status; parent stays `ACTIVE` | EC-S2 |
| Authority epoch inheritance | OPEN | `authority_registry` has no `continuity_epoch` | EC-02 |
| Delegated authority epoch binding | OPEN | `delegated_authority_registry` has no epoch column | EC-04 |
| Stale reservation dead-lineage | OPEN | `RESERVED` authority from epoch N executable in epoch N+k | EC-05 |
| AEO / PREO epoch anchoring | OPEN | `preo_registry` has no `continuity_epoch` or `epoch_anchor_hash` | EC-03 |
| Validation epoch inheritance | OPEN | `validation_registry` carries no epoch column | EC-02 |
| Invocation epoch gate | OPEN | `invocation_registry` PK has no epoch dimension | EC-06 |

### 2.2 Execution Gate Epoch Coverage

| Gate Condition | In Constitutional Gate | Epoch-Covering? | Gap |
|---|---|---|---|
| VALID | YES | PARTIAL — validation is epoch-blind | EC-06 |
| AUTHORIZED | YES | PARTIAL — authority is epoch-blind | EC-02 |
| UNUSED | YES | PARTIAL — nonce is epoch-blind | EC-11 |
| POLICY_VALID | YES | PARTIAL — policies have no epoch scope | EC-06 |
| CANONICAL_LINEAGE_CONTINUITY | YES | PARTIAL — continuity has no epoch column | EC-01 |
| TEMPORALLY_VALID | YES | PARTIAL — TTL enforced; epoch not enforced | EC-06 |
| STATE_CONSISTENT | YES | PARTIAL — state consistency check has no epoch dimension | EC-08 |
| SOVEREIGNTY_VALID | YES | PARTIAL — sovereignty has no epoch input | — |
| CONSTITUTIONALLY_VALID | YES | PARTIAL — no constitutional epoch invariant | — |
| **EPOCH_VALID** | **NO** | **ABSENT** | **EC-06 (root)** |

### 2.3 Replay and Reconciliation

| Primitive | Class | Evidence | Critical Gap |
|---|---|---|---|
| Replay idempotency (single-node) | CLOSED | Nonce PRIMARY KEY on `invocation_registry` | — |
| Replay epoch barrier | OPEN | No stale-epoch replay detection in `verifyReplayLineageEligibility` | EC-11 |
| Epoch monotonicity enforcement | OPEN | No trigger; `registry_epoch` is `string` type | EC-10 |
| Epoch monotonicity registry | OPEN | `epoch_monotonicity_registry` table does not exist | EC-10 |
| Reconciliation epoch classification | OPEN | No `epoch_conflict_class` on `cross_registry_reconciliation_registry` | EC-08 |
| Distributed epoch authority | OPEN | Canonical epoch derived by plurality vote, not monotonicity record | EC-09 |
| Distributed replica epoch gate | OPEN | Replica may authorize execution under stale epoch | EC-12 |
| Lineage hash epoch component | OPEN | `lineageHash()` does not include epoch | EC-11 |

### 2.4 Topology and Settlement

| Primitive | Class | Evidence | Critical Gap |
|---|---|---|---|
| Quorum classification | CONTAINED | `classifyDistributedQuorum()` classifies 7 states; no epoch input | Epoch not a quorum dimension |
| Topology visibility | CLOSED | 15-section canonical inventory; all drift classes defined | — |
| Partition handling | CLOSED | All partition modes → NULL (fail-closed) | — |
| Settlement authority | NULL | No settlement protocol; arbitration is `creates_authority: false` | Design boundary, not bug |
| Consensus drift classification | CONTAINED | 14 drift classes; none epoch-specific | No `EPOCH_DIVERGENCE` drift class |
| Bootstrap epoch legitimacy | BREAK_GLASS | Genesis epoch derivable only from external anchor or operator assertion | EC-B1 |

### 2.5 Rollback Detection

| Primitive | Class | Evidence | Critical Gap |
|---|---|---|---|
| Rollback detection (within D1) | CLOSED | Append-only triggers block in-database rollback | — |
| Rollback detection (DB restore) | OPEN | No external cryptographic anchor | EC-R1 |
| Rollback detection (git force-push) | OPEN | No governance artifact hash anchored in D1 | EC-R1 |
| Rollback detection (schema downgrade) | PARTIAL | App fails on missing columns only if columns were added | EC-R1 |
| Rollback irreversibility detection | OPEN | No `epoch_monotonicity_registry` to prove "epoch was at least N" | EC-R1 |

---

## 3. Topology Dependency Map

### 3.1 Canonical Lineage Topology

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

### 3.2 Epoch Flow Through Current Topology

Under the current schema, epoch does **not** flow through this topology:

```
continuity_registry.status = 'ACTIVE'          ← no continuity_epoch column
  → authority_registry.status = 'ACTIVE'        ← no continuity_epoch column
    → aeo_registry.status = 'COMPILED'          ← no continuity_epoch column
      → preo_registry.status = 'ACTIVE'         ← no continuity_epoch column
        → validation_registry.status = 'VALID'  ← no continuity_epoch column
          → execution_registry (record)          ← no continuity_epoch column
            → proof_registry (record)            ← no continuity_epoch column
              → cross_registry_reconciliation    ← no epoch_conflict_class column
```

The constitutional gate (`constitutional_governance_rules.json`) fires at the
`/execute` boundary. It enforces nine conditions. None bind epoch. Epoch
advancement at the `continuity_registry` level — if it were persisted — could
propagate to dependent tables only through active invalidation (revocation
cascade or new `SUPERSEDED` status). Without `continuity_epoch` as a persisted
column, no cascade trigger can fire on epoch change. The topology is epoch-blind
from `/continuity` through `/proof`.

### 3.3 Topology Containment Axioms (Existing)

From `runtime/topology/topology_containment_axioms.json`:

```
undeclared_execution_surface → NULL
topology_drift → reconciliation_required
proofless_mutation → INVALID
boundary_escape → sovereignty_failure
orphan_lineage → containment_required
```

**Missing axioms for epoch governance:**

```
epoch_advancement_without_continuity_epoch_column → OPEN
cross_epoch_authority_exercise → STALE_EPOCH (undetected)
epoch_rollback_without_external_anchor → undetectable
epoch_stale_lineage_first_use → NULL (required, absent)
superseded_parent_authorization → SUPERSEDED_EPOCH_BYPASS (undetected)
```

### 3.4 Infrastructure Topology Dependency

The `runtime/sovereignty/infrastructure_authority_graph.json` maps three
infrastructure scopes: Cloudflare, GitHub, and local. Epoch state, if persisted,
lives entirely in the single Cloudflare D1 instance.

This means:
- All epoch state exists in a single linearizable store (no distributed D1
  epoch divergence under current topology)
- Epoch race conditions are D1-transaction-level races, not distributed consensus
  races — serializable within D1 transactions
- Multi-instance epoch divergence requires horizontal scaling, D1 read replicas,
  or multi-instance deployment (not currently deployed)
- Partition scenarios arise only at the D1–Worker boundary, not across D1 replicas

The distributed epoch analysis in Section 4 applies to the deployed topology
only if horizontal scaling is introduced.

### 3.5 Constitutional Gate Topology Position

The constitutional execution gate fires at the `/execute` stage:

```
/validate → [VALID result persisted] → /execute → [constitutional_gate]
```

The gate location means that any epoch column added to `continuity_registry`
must be propagated through `authority_registry`, `validation_registry`, and
`execution_registry` (or be derivable from them) before the gate can enforce
`EPOCH_VALID`. An epoch column on `continuity_registry` alone is necessary
but not sufficient — the gate also requires an epoch equality check at
execution time against the canonical current epoch.

---

## 4. Epoch Race-Condition Matrix

### 4.1 Single-Node Races (Current Topology)

| Race ID | Race | Participants | Current Outcome | Detectable? | Drift Class |
|---|---|---|---|---|---|
| R-1 | Epoch advance + RESERVED authority execution | Thread A: epoch advances; Thread B: exercises RESERVED authority | B proceeds if it reads pre-advancement state | No — no epoch column | None emitted |
| R-2 | PREO straddles epoch boundary | PREO submitted epoch N; epoch advances during review; PREO stored | PREO structurally valid in N+1 | No — no epoch on PREO | None emitted |
| R-3 | Delegation issued epoch N, exercised epoch N+1 | Delegation created; epoch advances; delegation exercised | Delegation proceeds | No — no epoch on delegation | None emitted |
| R-4 | Concurrent authority creation at epoch boundary | Two threads create authorities during epoch transition | Both created; neither epoch-stamped | No — no epoch column | None emitted |
| R-5 | Stale nonce reservation across epoch | Nonce reserved epoch N; consumed epoch N+1 | Consumed if nonce unused | No — nonce is epoch-blind | None emitted |
| R-6 | Sibling continuity fork | Two child continuities created under same parent simultaneously | Both ACTIVE; anti-join indeterminate | No — no SIBLING_FORK trigger | None emitted |
| R-7 | Parent ACTIVE after child creation | Child created; parent remains ACTIVE; parent exercises authority | Both parent and child are valid authority sources | Partial — anti-join at read time only | None emitted |

### 4.2 Distributed Races (Future Multi-Instance Topology)

| Race ID | Race | Participants | Current Outcome | Detectable? |
|---|---|---|---|---|
| R-8 | Concurrent epoch issuance | Two replicas propose epoch N+1 simultaneously | No epoch proposal mechanism exists | NULL (mechanism absent) |
| R-9 | Stale epoch propagation | Replica A at epoch N; Replica B at epoch N+1 | Plurality vote may elect N as canonical | Misclassification (EC-09) |
| R-10 | Delayed supersession | Parent ACTIVE; child created but not propagated to replica | Replica authorizes from parent | No — supersession not status-authoritative |
| R-11 | Settlement-before-epoch visibility | Settlement committed; epoch not visible at receiving replica | Settlement proceeds against stale epoch | NULL — no settlement protocol |
| R-12 | Rollback-before-reconciliation | DB restored to pre-epoch state; reconciliation runs | Restored state is structurally valid | No — no external anchor |
| R-13 | Epoch resurrection via replay | Replay uses authority from revoked epoch | Proceeds if continuity_id still ACTIVE, nonce unused | No — epoch not in replay eligibility |
| R-14 | Epoch drift across federated replicas | Two federated runtimes at different epochs | Federated legitimacy snapshot is epoch-blind | No — federation has no epoch field |
| R-15 | Partitioned epoch divergence | Network split; each partition advances epoch independently | Both produce valid-looking legitimacy | Contained — partition → NULL fail-closed |

### 4.3 Consensus Drift Classes vs. Epoch Drift Classes

The `GOVERNANCE_CONSENSUS_SPEC.json` defines 14 drift classes. None are
epoch-specific:

| Existing Drift Class | Epoch Relevance | Missing Epoch Drift Class |
|---|---|---|
| OBSERVER_DIVERGENCE | Partial — observers may be at different epochs | EPOCH_OBSERVER_DIVERGENCE |
| QUORUM_AMBIGUITY | Partial — quorum epoch is ambiguous | EPOCH_QUORUM_AMBIGUITY |
| SEMANTIC_DIVERGENCE | Partial — semantic divergence may be epoch-driven | EPOCH_SEMANTIC_DIVERGENCE |
| OBSERVER_REPLAY_RESURRECTION | Closest — stale replay, not epoch-specific | EPOCH_STALE_REPLAY_RESURRECTION |
| SEMANTIC_REPLAY | Closest — semantic replay, not epoch-bounded | EPOCH_BOUNDED_REPLAY |
| FEDERATED_EQUIVALENCE_DRIFT | Partial | EPOCH_FEDERATED_DIVERGENCE |
| (none) | — | EPOCH_ROLLBACK_DETECTED |
| (none) | — | EPOCH_STALE_MAJORITY |
| (none) | — | EPOCH_DEAD_LINEAGE |
| (none) | — | STALE_EPOCH_REPLAY |
| (none) | — | SUPERSESSION_EPOCH_BYPASS |

**14 existing drift classes cover topology, semantic, and replay divergence.
Zero cover epoch divergence specifically.**

### 4.4 Race-Condition Summary

R-1 through R-7 are serializable at D1 transaction level but produce incorrect
outcomes because the epoch column does not exist to enforce epoch equality.
The races are undetectable by any current invariant.

R-8 through R-14 apply to future multi-instance deployments. R-15 is correctly
handled fail-closed by existing partition rules.

---

## 5. Replay-Boundary Analysis

### 5.1 Existing Replay Barriers

| Barrier | Mechanism | Location | Epoch-Aware? |
|---|---|---|---|
| Nonce single-use | `invocation_registry` PRIMARY KEY | migration 0041 | No |
| Execution hash uniqueness | `UNIQUE(workflow_run_id)` on `proof_registry` | Triggers | No |
| Continuity revocation check | `verifyContinuityLineage` status check | `src/runtime/continuity/verifyContinuityLineage.ts` | No |
| Temporal ordering check | `non_monotonic_replay_timestamp` detection | `temporal_lineage_replay_inspector.ts:107` | No |
| Orphan ancestry detection | `orphan_replay_ancestry` detection | `temporal_lineage_replay_inspector.ts:88` | No |
| Topology hash mismatch | `topology_regeneration_mismatch` detection | `temporal_lineage_replay_inspector.ts:104` | No |
| Authority TTL | `authority_registry.expiry` column | execute gate | Partial — time-bounded, not epoch-bounded |
| Continuity TTL | `continuity_registry.expires_at` | `verifyContinuityLineage` | Partial — time-bounded, not epoch-bounded |

**All existing replay barriers are epoch-blind.**

### 5.2 Missing Replay Barriers

| Gap | Description | Effect |
|---|---|---|
| Epoch equality check | `verifyReplayLineageEligibility` does not compare `replay.continuity_epoch` to canonical epoch | Stale-epoch replay proceeds if nonce unused |
| SUPERSEDED continuity barrier | `verifyContinuityLineage` checks `status='ACTIVE'` only; SUPERSEDED parent is still ACTIVE | Superseded-lineage replay proceeds |
| Lineage hash epoch component | `lineageHash()` does not include epoch | Identical hashes across epoch boundaries |
| Distributed epoch gate | `expectedEpoch` is caller-supplied; no lineage-derived source of truth | Stale replica passes its own epoch check |
| Replay epoch drift class | No `STALE_EPOCH_REPLAY` in `CONTINUITY_LINEAGE_DRIFT_CLASSES` | Epoch drift has no named classification |

### 5.3 Dead-Lineage Replay Path (Structural)

The most critical gap is the **dead-lineage replay path**:

```
Authority created: epoch N, status=RESERVED, nonce unused
                   ↓
Epoch advances: N → N+1
continuity_epoch not propagated (column doesn't exist)
                   ↓
Constitutional gate checks:
  VALID                      ✓ (validation row still VALID)
  AUTHORIZED                 ✓ (authority still ACTIVE/RESERVED)
  UNUSED                     ✓ (nonce first use)
  POLICY_VALID               ✓ (no policy references epoch)
  CANONICAL_LINEAGE_CONTINUITY ✓ (continuity still ACTIVE)
  TEMPORALLY_VALID           ✓ (not expired by TTL)
  STATE_CONSISTENT           ✓ (state tables consistent)
  SOVEREIGNTY_VALID          ✓ (no sovereignty event)
  CONSTITUTIONALLY_VALID     ✓ (no constitutional invariant covers epoch)
  EPOCH_VALID                — CHECK ABSENT FROM GATE
                   ↓
Execution proceeds. Authority from epoch N is consumed in epoch N+1.
```

This is structurally indistinguishable from a valid execution. No trigger fires.
No invariant is violated. No drift class is emitted. The gate passes all nine
conditions correctly under its own invariants.

### 5.4 Replay Window Boundaries

Under current schema, replay eligibility is bounded by:

| Boundary | Mechanism | Epoch-Bound? |
|---|---|---|
| Nonce single-use | `invocation_registry` PK | No |
| Continuity TTL | `expires_at` | No |
| Authority TTL | `expiry` | No |
| Explicit revocation | `revoked_at` write | No |

Replay eligibility is **not** bounded by epoch, supersession, or epoch
monotonicity record.

---

## 6. Supersession Determinism Analysis

### 6.1 Current Supersession Mechanism

Supersession is determined by anti-join query at read time
(from `resolveCurrentContinuityIdentity`):

```sql
SELECT c.continuity_id ...
FROM continuity_registry c
WHERE c.status='ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM continuity_registry child
    WHERE child.parent_continuity_id = c.continuity_id
      AND child.status='ACTIVE'
  )
```

| Property | Value | Gap |
|---|---|---|
| Authoritative | No — topology-derived at query time | EC-S2 |
| Deterministic | Yes — under D1 serializable reads | — |
| Atomic with child creation | No — child INSERT does not UPDATE parent status | EC-S2 |
| Epoch-aware | No — no epoch column | EC-01 |
| Persistent | No — computed on each query | EC-S2 |
| Detectable by execute barrier | No — barrier checks `status='ACTIVE'` | EC-S2 |

### 6.2 Supersession Status Gap

`ContinuityStatus` enum: `"ACTIVE" | "REVOKED" | "EXPIRED"`

`SUPERSEDED` exists only in `src/lib/skill-provenance-revocation.js` — scoped
to skill provenance revocation, not core continuity. It is absent from:

- `schemas/continuity.schema.json` enum
- `src/runtime/continuity/verifyContinuityLineage.ts` type
- Any migration-defined CHECK constraint
- The authority invalidation check (`AUTHORITY_CONTINUITY_VALID`)
- The proof archival check (`ORPHAN_PROOF_ARCHIVED`)
- `classifyDistributedQuorum()` — supersession is not a quorum dimension

### 6.3 Supersession Ordering Determinism

| Scenario | Deterministic? | Reason |
|---|---|---|
| Single child creation | Yes | D1 serializable |
| Concurrent child creation (sibling fork) | No | No `UNIQUE(parent_continuity_id) WHERE status='ACTIVE'` trigger |
| Child creation + parent revocation | Yes | Revocation supersedes supersession |
| Supersession across distributed replicas | No | Requires local D1 topology read |
| Epoch-aware supersession | N/A | Epoch not a supersession input |

### 6.4 Sibling Fork Condition

Because `UNIQUE(parent_continuity_id)` is not constrained for `ACTIVE` status,
concurrent governance mutation at the continuity level produces:

```
parent continuity_id = C1 (status=ACTIVE)
   ↓                          ↓
child C2 created          child C3 created (concurrent)
(status=ACTIVE)           (status=ACTIVE)
```

Both C2 and C3 are simultaneously `ACTIVE`. The anti-join query:
- Returns C2 if C3 has no active children and C2 does
- Returns C3 if C2 has no active children and C3 does
- Returns C1 if neither C2 nor C3 have active children

This is a **sibling fork condition** with no detection invariant. No
`SIBLING_FORK_DETECTED` drift class exists. No trigger enforces single-leaf
topology.

### 6.5 Epoch Transition and Supersession Coupling

Under a future epoch-aware model, epoch advancement and supersession must be
atomic. The required invariant:

```
epoch_advancement(from_epoch N to N+1) requires:
  new_continuity(epoch=N+1) created atomically with
  parent_continuity(epoch=N).status → SUPERSEDED
```

Without this coupling, the window between child creation and supersession
propagation creates a legitimacy fork: two continuity objects at different
epochs are simultaneously ACTIVE. The fork is invisible to the execution gate.

---

## 7. Epoch Rollback Analysis

### 7.1 Rollback Resistance Within D1

All registry tables enforce append-only semantics via triggers:

```sql
CREATE TRIGGER trg_proof_registry_no_update BEFORE UPDATE ON proof_registry
BEGIN SELECT RAISE(ABORT, 'proof_registry is append-only'); END;

CREATE TRIGGER trg_proof_registry_no_delete BEFORE DELETE ON proof_registry
BEGIN SELECT RAISE(ABORT, 'proof_registry is append-only'); END;
```

This pattern is repeated across all 22 governance registries. Within D1,
epoch rollback is impossible without bypassing these triggers. This is the
correct and sufficient defense for single-node in-database operations.

### 7.2 Rollback Paths That Bypass D1 Triggers

| Rollback Path | Detection | Mitigation |
|---|---|---|
| D1 database restore from backup | None — restored state is structurally valid | No external cryptographic anchor |
| Git force-push rewriting governance artifacts | None | No governance artifact content hash anchored in D1 |
| PR revert re-introducing superseded policy | None at schema level | Code review only |
| Operator migration rollback | None | No `epoch_monotonicity_registry` to prove "epoch was at least N" |
| Schema migration downgrade | Partial — app fails on missing columns | Only if columns were added post-epoch-advancement |
| Cloudflare dashboard D1 edit | None — D1 console bypasses triggers | Trigger enforcement is application-layer only |

### 7.3 Missing Rollback Detection Primitive

The critical missing primitive is `epoch_monotonicity_registry`:

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
  mutation_capable       TEXT NOT NULL CHECK (mutation_capable='false'),
  creates_authority      TEXT NOT NULL CHECK (creates_authority='false'),
  created_at             TEXT NOT NULL,
  CHECK (advanced_epoch > prior_epoch)
);
```

Without this table there is no durable record that epoch N was ever reached.
A DB restore to epoch N-1 is indistinguishable from the system never having
reached epoch N.

### 7.4 Rollback Irreversibility Risk

| Question | Answer |
|---|---|
| Is legitimacy rollback possible under current schema? | Yes — DB restore silently produces prior-epoch state |
| Is rollback detectable? | No — no external anchor, no monotonicity record |
| Can it become irreversible? | Yes — see split-validity condition below |

**Split-validity condition:** External consumers who cached proofs from epoch N
hold valid proof lineage references to execution records. If the internal D1
registry is restored to epoch N-1, those execution records no longer exist.
The proof lineage cannot be validated against the restored registry. Neither
side detects the discrepancy structurally — external proofs reference records
the database no longer knows about, and the database sees no anomaly (its
records are internally consistent at N-1).

---

## 8. Governance Time Model Analysis

### 8.1 Time Sources in Current Runtime

| Source | Type | Trustworthy | Enforced |
|---|---|---|---|
| `continuity_registry.issued_at` | ISO text | Monotonic within D1 inserts (assumed) | Not enforced by constraint |
| `continuity_registry.expires_at` | ISO text | TTL boundary | Enforced by `verifyContinuityLineage` |
| `authority_registry.expiry` | ISO text | Authority TTL | Enforced by execute gate |
| `TemporalLineageNode.timestamp` | ISO text | Runtime-only | Not persisted |
| `execution_snapshot_registry.replay_epoch` | TEXT | Post-execution label | Not enforced |
| `clock_skew_failure_modes.json` max_allowed_skew_ms | 300000ms | Clock policy | Policy only, not trigger |

### 8.2 Temporal Governance Rules vs. Epoch Coverage

From `runtime/temporal_governance_rules.json`:

```json
{
  "invariants": {
    "previously_valid_not_currently_valid": "previously_valid != currently_valid",
    "expired_authority": "NULL",
    "expired_lineage": "NULL",
    "expired_proof": "NULL",
    "stale_delegation": "NULL",
    "clock_skew_beyond_policy": "NULL",
    "delayed_replay": "NULL",
    "expired_continuity": "NULL"
  }
}
```

This rule set covers eight temporal invariants. **Missing:**

```
epoch_stale_lineage: "NULL"
cross_epoch_authority_exercise: "NULL"
stale_epoch_replay: "NULL"
epoch_rollback_detected: "NULL"
```

The `temporal_governance_rules.json` is the authoritative register of temporal
NULL conditions. Epoch stale lineage is not a registered temporal invariant.
An object that is not expired, not revoked, and not a duplicate, but originates
from a prior epoch, has no registered NULL pathway.

### 8.3 Governance Time Ordering Properties

| Property | Status | Evidence |
|---|---|---|
| Monotonic within D1 | PARTIAL | `issued_at` ordering assumed, not enforced by constraint |
| Partially ordered | YES | Parent→child lineage provides partial order |
| Observational | YES — currently | `TemporalLineageNode.epoch` is runtime-only, never persisted |
| Topology-relative | YES | `resolveCurrentContinuityIdentity` depends on local D1 read |
| Rollbackable | YES | DB restore silently re-establishes prior time state |
| Canonical across replicas | NO | No mechanism for replicas to agree on canonical time |
| Epoch-indexed | NO | No epoch column in any lineage table |

### 8.4 Legitimacy Decay Model Gap

From `runtime/temporal/legitimacy_decay_model.json`, defined decay classes:

- `expired_authority` — authority TTL exceeded
- `stale_validation` — validation against stale object state
- `expired_proof` — proof lineage outside retention window
- `revoked_continuity` — explicit revocation propagated
- `temporal_lineage_drift` — ordering divergence detected

**Missing decay class:**

```
epoch_stale_lineage:
  Objects created in a prior epoch that remain structurally eligible
  despite epoch advancement. TTL has not expired. Continuity is ACTIVE.
  Nonce is unused. All gate conditions pass. Object is dead-lineage.
```

### 8.5 Clock Skew and Epoch Ambiguity Window

`clock_skew_failure_modes.json` declares `max_allowed_skew_ms: 300000`
(5 minutes). This defines the temporal ambiguity window: any two events
within 5 minutes may be epoch-ambiguous — an event classified as epoch N
may actually have occurred in epoch N+1 under an adversarial or misconfigured
clock. The 5-minute window is the temporal boundary for epoch straddling.

### 8.6 Governance Time Model Classification

| Time Property | Classification |
|---|---|
| Is governance time monotonic? | PARTIAL — assumed, not enforced |
| Is governance time canonical? | NO — `registry_epoch` derived by plurality vote |
| Is governance time reversible? | YES — DB restore is undetected |
| Is governance time epoch-indexed? | NO — epoch absent from all lineage tables |
| Is governance time topology-relative? | YES — supersession derived from local topology read |
| Is governance time observational? | YES — `TemporalLineageNode.epoch` never persisted |

---

## 9. Highest-Leverage Closure Targets

Ordered by leverage (single change enabling maximum downstream invariants):

### Target 1 — EC-01 + EC-10: `continuity_epoch` Column + Monotonicity Trigger

**Why highest leverage:**

```sql
continuity_registry.continuity_epoch (INTEGER NOT NULL)
+ trg_continuity_epoch_monotonic
```

This single change enables mechanical closure of:

| Gap | How Enabled |
|---|---|
| EC-02 | Dependent tables inherit epoch at creation |
| EC-05 | `STALE_RESERVATION_DEAD_LINEAGE` becomes a `WHERE authority.continuity_epoch < current_epoch` predicate |
| EC-06 | Execution barrier `EPOCH_VALID` becomes a column comparison |
| EC-07 | Proofs are distinguishable across epochs |
| EC-08 | Reconciliation epoch conflict classification becomes `MAX(epoch) != MIN(epoch)` |
| EC-10 | `epoch_monotonicity_registry` can be populated from the trigger |
| EC-11 | Replay eligibility gains a deterministic epoch comparison |
| EC-R1 | Rollback detection becomes structurally possible |

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

This migration:
- Creates no authority
- Does not widen any execution surface
- Does not mutate any existing record (DEFAULT 0 backfills silently)
- Does not alter replay semantics
- Does not introduce any settlement mechanism

### Target 2 — EC-S2: `SUPERSEDED` Status + Atomic Parent Transition

**Why second:**

```typescript
export type ContinuityStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "SUPERSEDED"
```

With atomic child INSERT + parent `status='SUPERSEDED'` UPDATE:

- Execute barrier blocks superseded parent at `CANONICAL_LINEAGE_CONTINUITY`
- `AUTHORITY_CONTINUITY_SUPERSEDED` invariant becomes enforceable
- `ORPHAN_PROOF_SUPERSEDED` invariant becomes enforceable
- Sibling-fork detection trigger can be added
- `classifyDistributedQuorum()` gains supersession as a quorum dimension

**Required change:**

```sql
-- Atomic child creation with parent supersession
BEGIN TRANSACTION;
INSERT INTO continuity_registry (..., status) VALUES (..., 'ACTIVE');
UPDATE continuity_registry
  SET status='SUPERSEDED', superseded_at=?1, superseded_by=?2
  WHERE continuity_id=?3 AND status='ACTIVE';
COMMIT;
```

### Target 3 — EC-10: `epoch_monotonicity_registry` Table

**Why third:**

The append-only `epoch_monotonicity_registry` is the only primitive that can
prove "epoch has been at least N." Without it, rollback detection is
impossible from stored state. With it:

- EC-R1 (cross-system rollback detection) becomes structurally possible
- EC-09 (plurality-vote epoch authority) can be replaced by monotonicity record
- EC-12 (distributed replica epoch gate) gains a quorum-independent authority source

### Target 4 — Gate Extension: Add `EPOCH_VALID` to Constitutional Gate

**Why fourth:**

The `constitutional_governance_rules.json` canonical execution gate must be
extended:

```json
"canonical_execution_gate": [
  "VALID", "AUTHORIZED", "UNUSED", "POLICY_VALID",
  "CANONICAL_LINEAGE_CONTINUITY", "TEMPORALLY_VALID",
  "STATE_CONSISTENT", "SOVEREIGNTY_VALID", "CONSTITUTIONALLY_VALID",
  "EPOCH_VALID"
]
```

And the invariants block extended:

```json
"epoch_stale_lineage": "NULL",
"cross_epoch_authority_exercise": "NULL",
"stale_epoch_replay": "NULL"
```

Without this gate extension, epoch validity cannot be enforced at the
execution boundary even if the epoch column exists on the registry tables.
The gate is the enforcement point; the column alone is necessary but not
sufficient.

### Target 5 — EC-11: Epoch Comparison in `verifyReplayLineageEligibility`

**Why fifth:**

Once Target 1 exists, adding the epoch equality check is a two-line change:

```typescript
if (entry.continuity_epoch !== undefined
    && canonical_epoch !== undefined
    && entry.continuity_epoch < canonical_epoch) {
  return { eligible: false, ineligibility_reason: 'stale_epoch_replay' }
}
```

This closes the dead-lineage replay path.

### Target 6 — EC-13: Epoch Drift Classes in Consensus Spec

**Why sixth:**

Add epoch-specific drift classes to `GOVERNANCE_CONSENSUS_SPEC.json`:

```json
"drift_classes": [
  ...(existing 14),
  "EPOCH_DIVERGENCE",
  "EPOCH_ROLLBACK_DETECTED",
  "EPOCH_STALE_MAJORITY",
  "EPOCH_DEAD_LINEAGE",
  "STALE_EPOCH_REPLAY",
  "SUPERSESSION_EPOCH_BYPASS"
]
```

And add epoch-stale variants to `temporal_governance_rules.json`:

```json
"epoch_stale_lineage": "NULL",
"cross_epoch_authority_exercise": "NULL",
"stale_epoch_replay": "NULL"
```

---

## 10. Required Missing Primitives

### 10.1 Schema Primitives

#### `continuity_epoch` on All Lineage Tables

```sql
-- continuity_registry (primary)
continuity_epoch   INTEGER NOT NULL DEFAULT 0
epoch_issued_at    TEXT
epoch_binding_hash TEXT

-- All dependent tables (propagated from continuity at creation)
authority_registry:           continuity_epoch INTEGER
aeo_registry:                 continuity_epoch INTEGER
validation_registry:          continuity_epoch INTEGER
execution_registry:           continuity_epoch INTEGER
proof_registry:               continuity_epoch INTEGER
preo_registry:                continuity_epoch INTEGER, epoch_anchor_hash TEXT
delegated_authority_registry: continuity_epoch INTEGER, delegation_epoch_hash TEXT
invocation_registry:          continuity_epoch INTEGER
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
| 'stale-epoch-replay'
| 'supersession-epoch-bypass'
| 'sibling-fork-detected'
```

### 10.4 Lineage Object Extensions

#### Proof Structure Epoch Binding

```typescript
interface ProofObject {
  // existing fields ...
  continuity_epoch: number       // epoch at proof issuance
  epoch_binding_hash: string     // hash(continuity_epoch ∥ proof_id ∥ execution_id)
}
```

#### Authority Object Epoch Binding

```typescript
interface AuthorityObject {
  // existing fields ...
  continuity_epoch: number       // epoch at authority issuance
  // stale check: authority.continuity_epoch < current_epoch → DEAD_LINEAGE → NULL
}
```

### 10.5 Temporal Boundary Definitions

| Boundary | Definition | Currently Enforced? |
|---|---|---|
| Authority TTL | `authority.expiry` | Yes |
| Continuity TTL | `continuity.expires_at` | Yes |
| Clock skew tolerance | 300000ms | Policy only |
| Epoch-scope authority window | `authority.continuity_epoch == continuity.continuity_epoch` | No — column absent |
| Delegation epoch window | `delegation.continuity_epoch == current continuity_epoch` | No — column absent |
| PREO epoch window | `preo.continuity_epoch == current continuity_epoch` | No — column absent |
| Replay epoch window | `replay.continuity_epoch == canonical continuity_epoch` | No — column absent |

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
  1. Write epoch_monotonicity_registry record (append-only evidence)
  2. Insert child continuity: continuity_epoch = advanced_epoch
  3. Update parent status → SUPERSEDED (atomic with step 2)
  4. Cascade: RESERVED authorities with continuity_epoch < advanced_epoch
       → classify as DEAD_LINEAGE → NULL at execute gate
  5. Cascade: PREO with epoch < advanced_epoch → EPOCH_STALE_PREO
  6. Cascade: delegations with epoch < advanced_epoch → DELEGATION_EPOCH_STALE

At replay gate:
  require: object.continuity_epoch == continuity_registry[continuity_id].continuity_epoch
  else:    STALE_EPOCH_REPLAY → NULL
```

### 10.8 Proof Structure for Epoch Boundary Evidence

```typescript
interface EpochBoundaryProof {
  epoch_record_id:        string    // from epoch_monotonicity_registry
  prior_epoch:            number    // epoch being superseded
  advanced_epoch:         number    // new canonical epoch
  epoch_advancement_hash: string    // hash(prior_epoch ∥ advanced_epoch ∥ continuity_id)
  continuity_id:          string    // root continuity for this epoch
  evidence_only:          'true'    // never authoritative
  replay_neutral:         'true'    // epoch boundary does not authorize replay
  creates_authority:      'false'   // epoch advancement ≠ authority creation
  created_at:             string
}
```

---

## 11. Final Determination

### 11.1 Epoch Authority Classification

**Are governance epochs authoritative?**

> **NO — currently observational.**

Epoch exists as an informal label on distributed view structures
(`registry_epoch: string`) and a runtime-only variable (`TemporalLineageNode.epoch`).
It is not persisted in any lineage table. It does not bind any dependent object.
It does not gate execution — the constitutional execution gate has no `EPOCH_VALID`
condition. The `temporal_governance_rules.json` has no epoch-stale invariant.
Epoch observation does not equal epoch authority.

**Path to authoritative:** Add `continuity_epoch INTEGER` to `continuity_registry`
with a monotonicity trigger, and add `EPOCH_VALID` to the constitutional gate.
Both are required. The column alone creates epoch data without enforcement;
the gate condition alone has nothing to check.

---

### 11.2 Epoch Topology-Relativity

**Are epochs topology-relative?**

> **YES — and incorrectly so.**

The canonical epoch is currently derived by plurality vote of `registry_epoch`
values across distributed view structures. A majority coalition of stale replicas
can elect a stale epoch as canonical. `replica_divergence_rules.json` explicitly
classifies `consensus_implementation` as `out_of_scope` and
`automatic_reconciliation: false`. Epoch must derive authority from a
monotonicity record, not from topology count. The current design conflates
topology observation with lineage authority.

---

### 11.3 Epoch Replay Safety

**Are epochs replay-safe?**

> **NO — dead-lineage replay path exists.**

Stale-epoch replay (authority from epoch N exercised in epoch N+k) is
undetected when:
- `continuity_id` remains `ACTIVE` (no revocation cascade was triggered)
- Invocation nonce is unused (first attempt in new epoch)
- Authority status is `RESERVED` or `ACTIVE`
- All nine constitutional gate conditions pass (they do, because epoch is absent)

The nonce barrier and append-only triggers protect against re-use and mutation.
They do not protect against first-use across epoch boundaries.

---

### 11.4 Epoch Determinism

**Are epoch transitions deterministic?**

> **PARTIAL.**

Under single-instance D1: epoch ordering is serializable within transactions.
Concurrent sibling continuity creation has no detection trigger, but D1
serializable writes limit the concurrency window.

At the distributed topology boundary: canonical epoch is non-deterministically
derived by plurality vote. The `replica_divergence_rules.json`
(`automatic_reconciliation: false`) means replicas at different epochs
do not self-correct. Epoch transitions across replicas are non-deterministic.

---

### 11.5 Epoch Canonicality

**Are epochs canonical?**

> **NO.**

No epoch column exists on any authoritative lineage table. The
`epoch_monotonicity_registry` does not exist. There is no durable source of
truth for "the current canonical epoch." The `registry_epoch` field is a
`string` label on a view structure, not a lineage-bound integer on a
registry table.

---

### 11.6 Epoch Reversibility

**Are epochs reversible?**

> **YES — under current schema.**

Within D1: append-only triggers prevent in-database rollback. At system
boundaries (DB restore, git force-push, schema downgrade, Cloudflare console
D1 edit), epoch rollback is structurally undetected. No
`epoch_monotonicity_registry` exists to prove "epoch was at least N." No
external cryptographic anchor exists. Legitimacy rollback is structurally
possible and structurally invisible.

---

### 11.7 Epoch Monotonicity

**Is governance time monotonic?**

> **PARTIAL — assumed but not enforced.**

`issued_at` timestamps provide an assumed partial order within D1 inserts.
No constraint enforces that `child.issued_at >= parent.issued_at`. No trigger
enforces `child.continuity_epoch >= parent.continuity_epoch` (column does not
exist). The clock skew policy acknowledges non-monotonicity risk but does not
enforce monotonicity.

---

### 11.8 Settlement-Time Legitimacy Determination

**Can settlement authority exist without epoch binding?**

> **The question has no structural answer under current schema — settlement
> authority does not exist.**

All distributed consensus artifacts are correctly `creates_authority: false`,
`non_authoritative: true`, `evidence_only: true`. The `GOVERNANCE_CONSENSUS_SPEC.json`
defines 14 drift classes, none epoch-specific. No settlement protocol, finality
bundle, or topology-independent settlement propagation mechanism exists.

This is a **design boundary**, not a defect. Settlement-time legitimacy analysis
is `NULL` — not `OPEN` — because settlement primitives are explicitly out of scope
for the current substrate. The 14 consensus drift classes cover observer, semantic,
and replay divergence without epoch-aware settlement because settlement is not
intended to exist.

**Implication for epoch analysis:** If settlement primitives are introduced in the
future, they will inherit the epoch-blindness of the current substrate unless
`continuity_epoch` columns and the `EPOCH_VALID` gate condition are added first.
Settlement authority created from epoch-blind lineage is immediately subject to
all race conditions in Section 4.

---

### 11.9 Bootstrap Epoch Legitimacy Determination

**Do genesis epochs require BREAK_GLASS?**

> **YES.**

The `break_glass_containment_semantics.json` defines all bootstrap authority
as observability-only (`evidence_only: true`, `executable: false`,
`deployment_capable: false`). The `bootstrap_sovereignty_registry` is
append-only and evidence-only (`mutation_capable: 'false'`,
`remote_authority_denied: 'true'`). No immutable bootstrap epoch anchor
exists that can prove "the genesis epoch was epoch 0."

Genesis epoch legitimacy requires either:
- An external cryptographic anchor (outside current infrastructure scope)
- An operator assertion (break-glass authority, observable but not authoritative)

**Bootstrap epoch circular legitimacy:** Without a pre-existing
`epoch_monotonicity_registry`, the first epoch record cannot prove it is not
a rollback from a later epoch. The genesis record is self-referentially
legitimate only by assumption. This is the `BREAK_GLASS` classification — not
a structural error, but an acknowledged dependency on external or manual
authority to establish genesis legitimacy.

---

### 11.10 Composite Determination

```
VALID              PARTIAL — epoch obliviousness in all lineage tables;
                            constitutional gate lacks EPOCH_VALID condition
REPLAY-SAFE        PARTIAL — nonce protects single-node; stale-epoch
                            dead-lineage replay is undetected
TOPOLOGY-VISIBLE   CLOSED  — comprehensive inventory; fail-closed drift
                            classification; partition → NULL
TEMPORALLY-BOUNDED OPEN    — no epoch column; TTL-bounded but epoch-unbound;
                            8 temporal invariants registered, 0 epoch-stale
RECONCILABLE       PARTIAL — single-epoch reconciliation deterministic;
                            no epoch_conflict_class on reconciliation registry
EPOCH_VALID        OPEN    — not a schema primitive on any authoritative table;
                            absent from constitutional execution gate
```

**Composite:**

```
VALID ∧ REPLAY-SAFE ∧ TOPOLOGY-VISIBLE ∧ TEMPORALLY-BOUNDED ∧ RECONCILABLE ∧ EPOCH_VALID
= PARTIAL ∧ PARTIAL ∧ CLOSED ∧ OPEN ∧ PARTIAL ∧ OPEN
= OPEN
```

**Governance legitimacy cannot be confirmed as simultaneously VALID,
REPLAY-SAFE, TEMPORALLY-BOUNDED, and EPOCH_VALID under the current schema.**

The system is `TOPOLOGY-VISIBLE` and maintains strong single-node consistency.
Epoch as a first-class lineage primitive is absent. The resulting gaps are
structurally reachable — not merely theoretical — because the constitutional
execution gate has no `EPOCH_VALID` condition.

---

### 11.11 Minimum Required State

The minimum schema change that closes the primary gap without widening any
execution surface or creating any authority:

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

And the minimum gate extension:

```json
// constitutional_governance_rules.json
"canonical_execution_gate": [
  "VALID", "AUTHORIZED", "UNUSED", "POLICY_VALID",
  "CANONICAL_LINEAGE_CONTINUITY", "TEMPORALLY_VALID",
  "STATE_CONSISTENT", "SOVEREIGNTY_VALID", "CONSTITUTIONALLY_VALID",
  "EPOCH_VALID"
],
"invariants": {
  ...(existing),
  "epoch_stale_lineage": "NULL",
  "cross_epoch_authority_exercise": "NULL",
  "stale_epoch_replay": "NULL"
}
```

These changes:
- Create no authority
- Do not widen any execution surface
- Do not mutate any existing record (DEFAULT 0 backfills silently)
- Do not alter replay semantics for existing objects
- Do not introduce any settlement mechanism
- Enable all downstream epoch invariants to be enforced mechanically

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
