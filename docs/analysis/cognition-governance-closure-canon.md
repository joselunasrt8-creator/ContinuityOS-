# Cognition-Governance Closure Canon

**Branch:** `claude/cognition-governance-closure-CcDA2`  
**Mode:** MODE B — STRUCTURED ARTIFACT ONLY  
**Status:** NON-OPERATIVE  
**Scope:** Canonical closure sequencing and dependency ordering for the cognition-governance frontier established in issue #1397 and formalized in `cognition-governance-frontier-analysis.md` (commit 8631423).  
**Parent Document:** `docs/analysis/cognition-governance-frontier-analysis.md`  
**Boundary:** Evidence-only analysis. No execution authority created. No mutation surface widened. No deployment capability added. No implementation. No schema changes. No runtime semantics altered.

```
creates_authority:  false
executable:         false
mutation_capable:   false
```

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
  ∧ EPOCH_VALID ∧ CONVERGENCE_VALID
  → else NULL
```

### Expanded Cognition Invariant (Closure Target of This Document)

```
Behavioral mutation capable of altering future execution eligibility
must itself become legitimacy-governed.
```

### Distributed Cognition Invariant (From Parent Document)

```
persistent cognition
=
distributed mutable governance state
```

### Relation to Parent Document

The frontier analysis (`cognition-governance-frontier-analysis.md`) is a
**discovery document**: it maps what exists, names failure classes, identifies
gaps, and proposes closure issues #1382–#1388.

This closure canon is a **sequencing and dependency document**: it takes every
finding from the frontier analysis and converts it into (a) a formal closure
condition anchored to existing closed layers, (b) a dependency ordering that
makes the closure sequence executable without reopening settled layers, (c) a
fail-closed boundary definition at each open layer, and (d) a replay-boundary
priority that prevents closure work from being done in an order that creates
new replay exposure.

This document does not reopen, replace, or contradict any finding in the
frontier analysis. It extends every table, matrix, and model in that document
with additional columns that convert description into sequencing.

### Already-Closed Layers (Attachment Points — Not Reopened)

| Closed Layer | Canonical Location |
|---|---|
| Session legitimacy | `session_registry`, route `/session`, migration `0001` |
| Continuity legitimacy | `continuity_registry`, INVARIANT-001, migration `0010` |
| Authority legitimacy | `authority_registry`, nonce binding, migration `0026` |
| AEO exact-object discipline | `aeo_registry`, `src/lib/aeo-governance.ts` |
| Validation integrity | `validation_registry`, INVARIANT-002 |
| Execution proof persistence | `proof_registry`, INVARIANT-005 |
| Revocation propagation | `src/lib/revocation-liveness.ts`, INVARIANT-003 |
| Replay determinism (nonce-based) | `standards/replay-semantics-v1.md`, `src/lib/replay-convergence.ts` |
| Quorum attestation | `src/lib/quorum-attestation.ts`, migration `0050` |
| Epoch substrate | `src/lib/epoch-substrate.ts`, migration `0052` |
| Causal legitimacy clocks | `src/lib/causal-clock.ts` |
| Finality classification | `src/lib/finality-classification.ts` |
| Conflict set registry | `src/lib/conflict-set.ts` |
| Cross-registry reconciliation determinism | `src/lib/reconciliation-determinism.ts` |
| Partition-finality semantics | `PARTITION_FINALITY_SEMANTICS.md` |
| Topology replay classification | `docs/topology-replay-classification-alignment-1362.md` |
| Validator classification evidence | Migration `0045` |

---

## 1. Runtime Cognition Topology Map

### 1.1 Definition (Inherited from Frontier Analysis)

Cognition in the MindShift runtime is the distributed, mutable decision-making
state that governs execution eligibility. Every file, route, registry, and policy
document that can influence execution eligibility is a cognition surface.

The cognition-extended runtime spine:

```
intent
  → cognition governance          ← CLOSURE TARGET (this canon)
  → authority
  → ATAO
  → AEO
  → validation
  → execution
  → proof
  → continuity
  → reconciliation
  → distributed legitimacy convergence
```

### 1.2 Replay Inheritance Edges — Closure State Annotated

Extends Section 1.3 of the frontier analysis with `closure_state` and
`fail_closed_boundary` columns.

| Source | Target | Inheritance Mechanism | Replay Risk | Closure State | Fail-Closed Boundary |
|---|---|---|---|---|---|
| `continuity_registry` | `authority_registry` | `continuity_id` FK | Stale continuity carries stale cognition scope | CLOSED (INVARIANT-001) | Continuity validity gate |
| `authority_registry` | `aeo_registry` | `authority_id` FK | Authority-scoped cognition inherited by AEO | CLOSED | AEO hash binding gate |
| `aeo_registry` | `validation_registry` | `aeo_id` FK | Validated cognition state binds execution | CLOSED | Validation nonce gate |
| `validation_registry` | `execution_registry` | `validation_id` FK | Execution inherits validated cognition state | CLOSED | Execution legitimacy gate |
| `execution_registry` | `proof_registry` | `execution_id` FK | Proof persists execution-time cognition state | CLOSED | Proof append-only gate |
| `governance/runtime/*.json` | All routes | File read at runtime init | Stale policy file = stale global cognition | OPEN (Issue #1382, #1388) | **No current gate — NULL-propagation target** |
| `AGENTS.md` | Agent session init | Behavioral instruction inheritance | Behavioral drift across agent restarts | OPEN (Issue #1382) | **No current gate — NULL-propagation target** |
| `delegated_authority_registry` | Subagent session | Delegation lineage hash | Stale delegation cognition context | OPEN (Issue #1384) | **No current gate — cognition hash absent** |

### 1.3 Fail-Closed Boundary Semantics

A fail-closed boundary is the node in the propagation graph at which a NULL_COGNITION
determination must terminate and produce execution_blocked rather than passing through
silently. The current execution gate (`VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧
REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`) is the only current fail-closed
boundary. The closure canon designates two additional required boundaries:

1. **Session initialization gate** — at session creation, if any behavioral surface
   required by the session cannot be cognition-hash-verified, the session must not
   proceed beyond `LOCAL_COGNITION_VALID`. This gate is created by Issue #1382.

2. **Governance calculus gate** — at execution eligibility evaluation, if
   `cognition_hash` is absent from the governance calculus inputs, the result must
   be NULL. This gate is created by Issue #1388 and is the terminal fail-closed
   boundary.

### 1.4 Cognition Continuity Lineage Status

**Finding CG-01 (inherited):** Cognition lineage is implicit. No registry records
which behavioral files were active at session start, whether governance JSON files
have mutated between sessions, or whether policy predicates changed between
delegation issuance and exercise.

**Closure dependency:** Issue #1382 creates this registry. It chains to INVARIANT-001
(`continuity_registry.continuity_id`) and the epoch substrate (`src/lib/epoch-substrate.ts`).

---

## 2. Behavioral Authority Surface Inventory

### 2.1 Dimension Definitions (Inherited)

| Dimension | Definition |
|---|---|
| `mutation_capable` | Can this surface alter future execution eligibility? |
| `replay_influence` | Does it affect replay-safety determination? |
| `authority_contamination_risk` | Can stale state propagate as valid authority? |
| `cognition_drift_risk` | Can behavioral divergence accumulate undetected? |
| `reconciliation_visibility` | Is mutation visible to cross-registry reconciliation? |

### 2.2 Surface Inventory — Closure Columns Added

For each surface, three closure columns are added:
- `closure_blocker`: the single absent predicate that is the immediate blocker
- `closure_dependency`: which issue or closed layer must precede closure
- `legitimacy_predicate_requirement`: the `behavioral_surface_valid(s)` conjuncts required

#### `AGENTS.md`

```
mutation_capable:              YES
replay_influence:              INDIRECT
authority_contamination_risk:  MEDIUM
cognition_drift_risk:          HIGH
reconciliation_visibility:     NONE

closure_state:                 OPEN
closure_blocker:               CONTENT_HASH_KNOWN — no content hash is recorded anywhere
closure_dependency:            Issue #1382 (cognition lineage registry must exist first)
legitimacy_predicate_requirement:
  CONTENT_HASH_KNOWN(AGENTS.md)
  ∧ EPOCH_BOUND(AGENTS.md)          → depends on #1382 epoch binding
  ∧ CONTINUITY_ANCHORED(AGENTS.md)  → chains to INVARIANT-001
  ∧ RECONCILIATION_VISIBLE          → depends on #1386
  ∧ REVOCATION_PROPAGATABLE         → chains to INVARIANT-003
  ∧ REPLAY_EXPIRY_DEFINED            → depends on #1383
```

#### `governance/runtime/*.json` (6 policy files)

```
mutation_capable:              YES
replay_influence:              YES (REPLAY_POLICY.json governs all replay decisions)
authority_contamination_risk:  HIGH
cognition_drift_risk:          HIGH
reconciliation_visibility:     PARTIAL

closure_state:                 OPEN (PARTIAL for reconciliation_visibility)
closure_blocker:               CONTENT_HASH_KNOWN — files are not hash-pinned at runtime init
closure_dependency:            Issue #1382 (cognition lineage registry)
legitimacy_predicate_requirement:
  CONTENT_HASH_KNOWN(each policy file)
  ∧ EPOCH_BOUND at runtime initialization
  ∧ CONTINUITY_ANCHORED via session continuity_id
  ∧ RECONCILIATION_VISIBLE          → depends on #1386
  ∧ REPLAY_EXPIRY_DEFINED            → depends on #1383

closure_sequencing_note:
  REPLAY_POLICY.json must be the FIRST policy file closed because it governs
  all other replay decisions. Closing REPLAY_POLICY.json hash-binding before
  other policy files prevents replay window expansion during incremental closure.
```

#### `runtime/legitimacy/legitimacy_inheritance_model.json`

```
mutation_capable:              YES
replay_influence:              YES
authority_contamination_risk:  HIGH
cognition_drift_risk:          MEDIUM
reconciliation_visibility:     NONE

closure_state:                 OPEN
closure_blocker:               RECONCILIATION_VISIBLE — not referenced by any reconciliation registry
closure_dependency:            Issue #1382 (content hash), Issue #1386 (reconciliation class)
legitimacy_predicate_requirement:
  CONTENT_HASH_KNOWN
  ∧ RECONCILIATION_VISIBLE          → depends on #1386
  ∧ EPOCH_BOUND
  ∧ REPLAY_EXPIRY_DEFINED            → depends on #1383
```

#### `runtime/governance/governance_calculus.json`

```
mutation_capable:              YES (self-referential — governs governance)
replay_influence:              YES
authority_contamination_risk:  CRITICAL
cognition_drift_risk:          CRITICAL
reconciliation_visibility:     NONE

closure_state:                 OPEN (GAP-005, P0)
closure_blocker:               CONTENT_HASH_KNOWN and RECONCILIATION_VISIBLE (both absent)
closure_dependency:            Issues #1382, #1386 (prerequisites); Issue #1388 (closure)
legitimacy_predicate_requirement:
  CONTENT_HASH_KNOWN
  ∧ EPOCH_BOUND
  ∧ RECONCILIATION_VISIBLE
  ∧ REVOCATION_PROPAGATABLE
  ∧ REPLAY_EXPIRY_DEFINED

closure_sequencing_note:
  This surface must be the LAST behavioral surface closed (via Issue #1388)
  because the governance calculus is the terminal fail-closed gate. Closing it
  before its inputs (#1382–#1387) are settled risks governance calculus
  evaluation under partially-governed cognition.
```

#### `src/index.ts` (route definitions)

```
mutation_capable:              YES (route additions alter execution surface)
replay_influence:              YES
authority_contamination_risk:  HIGH
cognition_drift_risk:          HIGH
reconciliation_visibility:     PARTIAL

closure_state:                 PARTIAL (GAP-004, P1)
closure_blocker:               Undeclared routes bypass TOPOLOGY_VISIBLE gate
closure_dependency:            GAP-004 (execution surface exhaustiveness — pre-existing gap)
legitimacy_predicate_requirement:
  TOPOLOGY_VISIBLE for all routes
  ∧ route mutation is itself a behavioral surface mutation
     → requires CONTENT_HASH_KNOWN for route topology snapshot
     → depends on Issue #1386 (reconciliation visibility for behavioral surfaces)
```

#### Absent Surfaces (Findings CG-GAP-SOUL, CG-GAP-HB, CG-GAP-BOOT, CG-GAP-MEM)

```
SOUL.md:      ABSENT — no persistent behavioral identity surface
              closure_dependency: undefined (surface does not exist; governance of this
              surface is a post-closure concern, not a prerequisite)

HEARTBEAT.md: ABSENT — no cognition liveness primitive
              closure_dependency: Issue #1387 creates the cognition_liveness_registry
              that serves this role without requiring a behavioral file

BOOTSTRAP.md: ABSENT — cognition bootstrap ungoverned
              closure_dependency: Issue #1382 (cognition lineage registry at session init
              serves as bootstrap governance without requiring a behavioral file)

Memory registries: ABSENT as first-class cognition surfaces
              closure_dependency: Issue #1382 (cognition lineage registry subsumes
              this role for the purposes of session initialization governance)
```

---

## 3. Distributed Cognition Failure Taxonomy

Extends Section 3 of the frontier analysis. All 12 failure classes are inherited.
Three new columns are added: `priority`, `closure_precondition` (which issue must
close before this failure class becomes unachievable), and `fail_closed_outcome`
(which terminal cognition state is produced when this class is detected).

| Class | Name | Priority | Closure Precondition | Blocked By Issue | Fail-Closed Outcome |
|---|---|---|---|---|---|
| CF-01 | Cognition Split-Brain | P0 | Cognition state machine formalized | #1385 | QUARANTINED_COGNITION |
| CF-02 | Replay Resurrection | P1 | Behavioral surface hash in replay scope | #1383 | NULL_COGNITION |
| CF-03 | Stale Behavioral Propagation | P1 | Behavioral surface drift class in reconciliation | #1382, #1386 | STALE_COGNITION |
| CF-04 | Orphan Cognition Lineage | P2 | Cognition lineage registry with continuity FK | #1382 | NULL_COGNITION |
| CF-05 | Delegation Drift | P2 | Cognition hash captured at delegation issuance | #1384 | NULL_COGNITION |
| CF-06 | Topology-Desynchronized Cognition | P1 | Behavioral surfaces included in topology visibility | #1386, #1388 | NULL_COGNITION |
| CF-07 | Cognition Replay Inversion | P2 | Behavioral surface hash in replay scope binding | #1383 | NULL_COGNITION |
| CF-08 | Heartbeat Replay Loop | P2 | Cognition liveness TTL with replay expiry definition | #1387 | STALE_COGNITION |
| CF-09 | Authority Contamination Through Memory | P1 | Cognition lineage registry session binding | #1382 | NULL_COGNITION |
| CF-10 | Behavioral Epoch Skew | P2 | Behavioral epoch binding in cognition lineage | #1382, #1388 | AMBIGUOUS_COGNITION |
| CF-11 | Delegation Depth Overflow | P2 | Delegation depth in governance calculus extension | #1388 | NULL_COGNITION |
| CF-12 | Cognition Partition Without Finality | P0 | Cognition partition-finality state machine | #1385 | QUARANTINED_COGNITION |

**Priority rationale:** CF-01 and CF-12 are P0 because they represent irresolvable
split-brain and partitioned-cognition states that block all subsequent reconciliation.
CF-02, CF-03, CF-06, and CF-09 are P1 because they represent high-probability attack
surfaces on the replay and stale-propagation vectors. CF-04, CF-05, CF-07, CF-08,
CF-10, and CF-11 are P2 because they require specific delegation or temporal conditions
to manifest.

**Leverage observation:** Closing Issue #1382 alone makes CF-03, CF-04, CF-09, and
CF-10 unachievable in their primary vector. Closing Issue #1385 alone makes CF-01 and
CF-12 unachievable. No other single issue makes more than two failure classes
unachievable.

---

## 4. Cognition Replay-Risk Matrix

Extends Section 4 of the frontier analysis. Two new columns are added:
`closure_precondition` (which issue must close before NULL-resolution becomes
deterministic) and `replay_boundary_priority` (CRITICAL / HIGH / MEDIUM / LOW).
A `minimum_viable_replay_safety` flag marks the minimum set that must be closed
before downstream replay closure is meaningful.

| Surface | Replay Inheritance Exposure | Stale Window | NULL-Resolution | Closure Precondition | Replay Boundary Priority | Min Viable |
|---|---|---|---|---|---|---|
| `governance/runtime/REPLAY_POLICY.json` | HIGH | Unbounded | NO | #1382, #1383 | CRITICAL | YES |
| `AGENTS.md` | HIGH | Unbounded | NO | #1382, #1383 | HIGH | YES |
| `runtime/governance/governance_calculus.json` | CRITICAL | Unbounded | NO | #1382–#1387, #1388 | CRITICAL | YES |
| `governance/runtime/DEPLOY_POLICY.json` | HIGH | Unbounded | NO | #1382, #1383 | HIGH | NO |
| `runtime/legitimacy/legitimacy_inheritance_model.json` | HIGH | Unbounded | NO | #1382, #1383 | HIGH | NO |
| `src/index.ts` routes | HIGH | Unbounded | PARTIAL | #1386 | HIGH | NO |
| `continuity_registry` | LOW | `expires_at` | YES | Already closed | — | — |
| `authority_registry` | LOW | `expires_at` | YES | Already closed | — | — |
| `aeo_registry` | LOW | AEO scope | YES | Already closed | — | — |
| `validation_registry` | LOW | AEO scope | YES | Already closed | — | — |
| `execution_registry` | MINIMAL | proof binding | YES | Already closed | — | — |
| `proof_registry` | MINIMAL | — | YES | Already closed | — | — |

**Minimum viable replay safety set:** `REPLAY_POLICY.json`, `AGENTS.md`, and
`governance_calculus.json` must be the first three surfaces to receive content-hash
binding under Issue #1382. These three surfaces form the critical path: REPLAY_POLICY
governs all other replay decisions, AGENTS.md governs session behavioral scope, and
governance_calculus governs the final execution eligibility gate.

**Replay-boundary priority sequencing:** CRITICAL surfaces must receive hash binding
before HIGH surfaces. HIGH surfaces must receive hash binding before the governance
calculus extension (Issue #1388) is deployed. Deploying Issue #1388 before the HIGH
surfaces have hash binding means the governance calculus includes a `cognition_hash`
requirement that cannot yet be satisfied, creating a fail-closed state for all sessions.

---

## 5. Delegation Governance Analysis

### 5.1 Current Delegation Model (Inherited)

Existing `runtime/legitimacy/legitimacy_inheritance_model.json` governs object
inheritance within the execution spine. It does not govern cognition inheritance
across delegation events.

### 5.2 Canonical Closure Path for the Delegation Layer

The delegation closure depends on the following formal if-then sequence:

**Prerequisite:** Issue #1382 must be CLOSED first. The `cognition_hash` required
by delegation issuance records can only be computed after a `cognition_lineage_registry`
exists that records behavioral surface hashes at session initialization.

**Step 1 (Issue #1384):** `delegated_authority_registry` (migration `0030`) is
extended to capture `cognition_hash` and `behavioral_epoch` at delegation issuance
time. The closure predicate for this step:

```
cognition_hash(delegator, issuance_time) = cognition_hash(subagent, exercise_time)
∨ explicit_cognition_recertification(delegation_event)
→ else delegation_invalid
```

**Step 2 (Issue #1388 scope inclusion):** The governance calculus extension must
include `delegation_id` and `delegator_continuity_id` as additional inputs to the
cognition hash computation. This ensures the delegation boundary is covered by the
replay scope binding created in Issue #1383.

**Step 3 (Issue #1385 coordination):** The partition-finality state machine must
define what happens to delegation-scoped cognition when the session is in
PARTITIONED_COGNITION state. Delegation-scoped cognition must follow the same
collapse rules as session-scoped cognition.

### 5.3 Withheld Authority Semantics — Closure Progression

Extends Section 5.5 of the frontier analysis. Shows how each undefined pattern
resolves as issues close.

| Inheritance Pattern | Current Status | After #1382 | After #1384 | After #1388 |
|---|---|---|---|---|
| `delegation_inherits_delegator_full_authority` | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN |
| `delegation_inherits_delegator_cognition_state` | UNDEFINED | UNDEFINED | EXPLICIT (hash-bound) | EXPLICIT (calculus-enforced) |
| `delegation_inherits_delegator_behavioral_surface_hash` | UNDEFINED | COMPUTABLE | CAPTURED | ENFORCED |
| `subagent_cognition_outlives_delegation_expiry` | FORBIDDEN (desired, not enforced) | NOT ENFORCED | ENFORCED (hash mismatch) | ENFORCED (calculus gate) |
| `delegation_extends_across_epoch_boundary_without_re-issuance` | UNDEFINED | DETECTABLE | DETECTABLE | BLOCKED |

### 5.4 INVARIANT-013 Promotion (Finding CG-05)

INVARIANT-013 is promoted from PROPOSED to PENDING_CLOSURE with explicit dependency chain:

```
INVARIANT-013 (PENDING_CLOSURE)
Name: Delegation Cognition Binding
Rule: Delegated authority inherits the delegating agent's cognition hash at issuance time;
      cognition hash mismatch at exercise time → delegation invalid

Dependency chain:
  INVARIANT-001 (continuity legitimacy, CLOSED)
    ↓ continuity_id FK
  Issue #1382 (cognition lineage registry, cognition_hash computable)
    ↓ cognition_hash at issuance
  Issue #1384 (delegation cognition inheritance boundaries)
    ↓ hash binding at exercise
  INVARIANT-013 (CLOSED when #1384 is closed and #1382 is closed)

Source issue: #1384
Closed-layer chain: INVARIANT-001 → #1382 → #1384 → INVARIANT-013
Required test vector class: FATE delegation-cognition-hash-mismatch-rejection
```

---

## 6. Cognition Partition-Finality Model

### 6.1 State Machine (Inherited from Frontier Analysis Section 6.1)

Eight-state cognition partition-finality state machine:

```
PROPOSED_COGNITION
  → LOCAL_COGNITION_VALID
    → GLOBAL_COGNITION_VALID
      → SETTLED_COGNITION        [terminal, positive]
      → AMBIGUOUS_COGNITION
        → GLOBAL_COGNITION_VALID
        → QUARANTINED_COGNITION  [terminal, negative]
    → OBSERVATIONAL_COGNITION    [non-authoritative]
    → STALE_COGNITION            [terminal, negative]
    → PARTITIONED_COGNITION
      → GLOBAL_COGNITION_VALID
      → QUARANTINED_COGNITION    [terminal, negative]
  → NULL_COGNITION               [terminal, negative]
```

### 6.2 Closure Conditions Per State Transition

A state transition is "closed" when it has a deterministic precondition expression
anchored to existing closed layers, the precondition is evaluable against the closed
infrastructure, and the terminal states produce deterministic execution outcomes.

| Transition | Closure Condition | Closed-Layer Anchor | Issue |
|---|---|---|---|
| PROPOSED → LOCAL_COGNITION_VALID | `cognition_lineage_record(s) ∈ cognition_lineage_registry` | INVARIANT-001 | #1382 |
| LOCAL → GLOBAL_COGNITION_VALID | `quorum_attestation(cognition_hash) ≥ majority_threshold` | `src/lib/quorum-attestation.ts` | #1385 |
| GLOBAL → SETTLED_COGNITION | `reconciliation_converged ∧ ¬drift_detected` | `src/lib/reconciliation-determinism.ts` | #1385, #1386 |
| GLOBAL → AMBIGUOUS_COGNITION | `competing_cognition_hashes ∧ unresolved` | `src/lib/conflict-set.ts` | #1385 |
| AMBIGUOUS → QUARANTINED (tie-break) | `epoch_tie ∧ continuity_tie → fail-closed` | `src/lib/causal-clock.ts`, INVARIANT-001 | #1385 |
| LOCAL → STALE_COGNITION | `behavioral_surface_mutation_detected ∧ replacement_known` | `drift_registry` | #1382, #1386 |
| LOCAL → PARTITIONED_COGNITION | `¬TOPOLOGY_VISIBLE ∧ partition_evidence` | `PARTITION_FINALITY_SEMANTICS.md` | #1385 |
| PARTITIONED → GLOBAL (recovery) | `partition_resolved ∧ cognition_reconciled` | `src/lib/reconciliation-determinism.ts` | #1385 |
| Any unlisted path | → NULL_COGNITION | — | #1385 |

### 6.3 Terminal State Execution Gate Specifications

Each terminal state has a distinct execution gate with different audit implications:

| Terminal State | Execution Gate | Audit Record Created | Cognition Registry Entry |
|---|---|---|---|
| SETTLED_COGNITION | execution_permitted | YES (execution_registry) | YES (cognition_lineage_registry) |
| QUARANTINED_COGNITION | execution_blocked | YES (quarantine_record created) | YES (quarantine state recorded) |
| STALE_COGNITION | execution_blocked | NO new record | Stale state flagged in existing record |
| NULL_COGNITION | execution_blocked | NO record | NO record (silent fail-closed) |
| OBSERVATIONAL_COGNITION | non-authoritative — no execution permitted | NO | Observational flag only |

**Critical distinction:** QUARANTINED_COGNITION creates an immutable quarantine record
(evidence for reconciliation). NULL_COGNITION creates no record. This distinction
matters for replay and audit: a quarantined session can be investigated; a NULL session
has no audit trail. Both block execution, but only QUARANTINED produces reconcilable
evidence.

### 6.4 Quorum Requirements — Closed Layer Reuse

Extends Section 6.4 of the frontier analysis. Each quorum level is annotated with
the existing closed layer it reuses so no new quorum primitive is required.

| Cognition Risk Class | Quorum Requirement | Closed Layer Reused |
|---|---|---|
| Behavioral surface read (observational) | No quorum required | — |
| Policy predicate evaluation | Local quorum (1 of N) | `src/lib/quorum-attestation.ts` (evaluateWeightedQuorum with threshold=1/N) |
| Cognition state transition | Majority quorum (N/2+1) | `src/lib/quorum-attestation.ts` (standard threshold) |
| Behavioral surface mutation | Supermajority (2N/3+1) | `src/lib/quorum-attestation.ts` (high threshold) |
| Cognition revocation | Unanimous (N of N) | `src/lib/quorum-attestation.ts` (threshold=1.0) + INVARIANT-003 |

**Finding:** No new quorum primitive is required for the cognition partition-finality
state machine. All quorum levels reuse `src/lib/quorum-attestation.ts` with different
threshold configurations. Issue #1385 specifies the threshold mappings; it does not
introduce new infrastructure.

### 6.5 Collapse Tie-Break Grounding

The collapse tie-break sequence from Section 6.3 of the frontier analysis
(epoch wins → oldest continuity_id wins → QUARANTINED) is grounded as follows:

1. "Highest epoch wins" → grounded in `src/lib/epoch-substrate.ts` (already closed;
   `epoch_causal_frontier` comparison)
2. "Oldest continuity_id wins" → grounded in INVARIANT-001 (`continuity_registry`,
   parent_continuity_id chain; earliest causal_index from `src/lib/causal-clock.ts`)
3. "If still tied → QUARANTINED_COGNITION" → grounded in `src/lib/conflict-set.ts`
   (UNRESOLVED collapse rule → fail-closed)

This grounding is what makes the tie-break deterministic rather than arbitrary. Issue
#1385 references these three existing closed layers; it does not reopen any of them.

---

## 7. Cognitive Topology Intelligence Assessment

### 7.1 Graph Node Classification

All topology gaps identified in the frontier analysis are classified by `graph_node_type`,
assigned a `topology_attachment_point`, and linked to their `visibility_closure_dependency`.

| Graph Node | Type | Topology Attachment Point | Visibility Closure Dependency |
|---|---|---|---|
| `cognition_lineage_registry` node | ABSENT | `continuity_registry` (INVARIANT-001) + epoch substrate | Issue #1382 — creates this node |
| Behavioral surface hash node in replay graph | ABSENT | `standards/replay-semantics-v1.md` (closed) | Issue #1383 — adds behavioral_surface_hash to replay scope |
| Delegation cognition edge | ABSENT | `delegated_authority_registry` (migration 0030) | Issue #1384 — adds cognition_hash edge to delegation graph |
| Cognition state machine nodes | ABSENT | `PARTITION_FINALITY_SEMANTICS.md` (closed) | Issue #1385 — adds 8 cognition state nodes |
| Behavioral surface drift class node | ABSENT | `drift_registry` (partially closed) | Issue #1386 — adds behavioral_surface_drift as drift class |
| Cognition liveness node | ABSENT | `continuity_registry` (INVARIANT-001) | Issue #1387 — creates cognition_liveness_registry node |
| Governance calculus cognition extension node | ABSENT | `runtime/governance/governance_calculus.json` | Issue #1388 — adds cognition_hash parameter node |

**Dependency observation:** The `cognition_lineage_registry` node (Issue #1382) is the
mandatory first node. Without it, no other cognition graph node can be topology-visible,
because all other nodes depend on the cognition_hash that this registry computes.

### 7.2 TOPOLOGY_VISIBLE Redefinition for Behavioral Surfaces

The existing `TOPOLOGY_VISIBLE` predicate in the canonical invariant
(`VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`)
applies to execution objects. For behavioral surfaces, `TOPOLOGY_VISIBLE` requires a
distinct definition:

```
TOPOLOGY_VISIBLE(behavioral_surface s) ≡
  s ∈ cognition_lineage_registry.behavioral_surfaces
  ∧ content_hash(s) ∈ cognition_lineage_registry.surface_hashes
  ∧ s ∈ drift_registry.monitored_surfaces
```

This definition extends `TOPOLOGY_VISIBLE` without modifying its existing meaning for
execution objects. Issue #1382 satisfies the first two conjuncts. Issue #1386 satisfies
the third. Until both issues are closed, `TOPOLOGY_VISIBLE` for behavioral surfaces is
undefined, which means behavioral surfaces are not in the canonical invariant evaluation
— they pass through the execution gate without visibility check.

### 7.3 Drift Density Characterization (From Frontier Analysis Section 7.3)

```
Drift density = (delegation_hops) × (time_since_issuance)
              × (behavioral_surface_mutations_since_issuance)
```

Current state: no mechanism measures or bounds drift density.

After Issue #1384: `behavioral_surface_mutations_since_issuance` becomes computable
(from `cognition_lineage_registry` delta between issuance time and exercise time).

After Issue #1386: `behavioral_surface_mutations_since_issuance` becomes reconciliation-
visible (drift_registry records each mutation event).

After Issue #1388: drift density above a governance-calculus-defined threshold becomes
a blocking input to the execution eligibility gate.

---

## 8. Canon Closure Matrix

### 8.1 Format

The frontier analysis provides a three-table snapshot (17 CLOSED, 5 PARTIAL, 10 OPEN).
This closure canon extends it to 39 rows by adding the 7 issue-targeted closure rows
(#1382–#1388). New columns added:

- `closure_sequence_position`: total order (a layer at position N cannot be worked until
  all layers at positions 1 through N-1 are closed)
- `invariant_closure_condition`: for OPEN rows, the formal one-line predicate whose
  satisfaction transitions the row from OPEN to CLOSED
- `remaining_gap_expression`: for PARTIAL rows, the specific missing predicate fragment
- `closed_layer_anchor`: for OPEN rows, the existing closed layer this chains to

### 8.2 Stabilized Layers (CLOSED — Positions 1–17)

| Position | Layer | Evidence | Closed Layer Anchor |
|---|---|---|---|
| 1 | Session legitimacy | `session_registry`, migration 0001 | INVARIANT-001 |
| 2 | Continuity legitimacy | `continuity_registry`, INVARIANT-001 | (root) |
| 3 | Authority legitimacy | `authority_registry`, nonce binding | INVARIANT-001 |
| 4 | AEO exact-object discipline | `aeo_registry`, `aeo-governance.ts` | INVARIANT-002 |
| 5 | Validation integrity | `validation_registry`, INVARIANT-002 | INVARIANT-001 |
| 6 | Execution proof persistence | `proof_registry`, INVARIANT-005 | INVARIANT-002 |
| 7 | Revocation propagation | `revocation-liveness.ts`, INVARIANT-003 | INVARIANT-001 |
| 8 | Replay determinism (nonce-based) | `replay-semantics-v1.md`, INVARIANT-004 | INVARIANT-001 |
| 9 | Quorum attestation | `quorum-attestation.ts`, migration 0050 | INVARIANT-001 |
| 10 | Epoch substrate | `epoch-substrate.ts`, migration 0052 | INVARIANT-001 |
| 11 | Causal legitimacy clocks | `causal-clock.ts` | INVARIANT-001 |
| 12 | Finality classification | `finality-classification.ts` | Epoch substrate |
| 13 | Conflict set registry | `conflict-set.ts` | Quorum attestation |
| 14 | Cross-registry reconciliation determinism | `reconciliation-determinism.ts` | Conflict set |
| 15 | Partition-finality semantics | `PARTITION_FINALITY_SEMANTICS.md` | Positions 9–14 |
| 16 | Topology replay classification | `topology-replay-classification-alignment-1362.md` | Partition-finality |
| 17 | Validator classification evidence | Migration 0045 | INVARIANT-002 |

### 8.3 Partially Closed Layers (PARTIAL — Positions 18–22)

| Position | Layer | Partial Closure Evidence | Remaining Gap Expression |
|---|---|---|---|
| 18 | Drift detection | `drift_registry`, `legitimacy_drift_propagation_registry` | `¬(behavioral_surface_drift ∈ drift_registry.drift_classes)` |
| 19 | Federation legitimacy | `federated_revocation_observability_registry` | `¬(cognition_quorum_across_federated_nodes ∈ federation_profile)` |
| 20 | Replay semantics (delegation boundary) | `standards/replay-semantics-v1.md` | `¬(delegation_id ∈ replay_scope_binding) ∧ ¬(cognition_hash ∈ replay_scope_binding)` |
| 21 | Governance self-mutation (GAP-005) | `governance/recursive/` | `¬(governance_calculus_mutation ∈ governed_legitimacy_chain)` |
| 22 | Execution surface exhaustiveness (GAP-004) | `EXECUTION_SURFACE_CLASSIFICATION.md` | `∃ route r: r ∉ topology_manifest ∧ mutation_capable(r)` |

### 8.4 Open Cognition Layers (OPEN — Positions 23–32)

| Position | Layer | Status | Invariant Closure Condition | Closed Layer Anchor | Issue |
|---|---|---|---|---|---|
| 23 | Behavioral surface legitimacy governance | OPEN | `behavioral_surface_valid(s)` for all s ∈ behavioral_surfaces | INVARIANT-001, epoch substrate | #1382, #1383, #1386, #1388 |
| 24 | Cognition lineage registry | OPEN | `∀ session s: cognition_lineage_record(s) ∈ cognition_lineage_registry` | INVARIANT-001 | #1382 |
| 25 | Delegation cognition inheritance | OPEN | `cognition_hash(delegator, t_issuance) = cognition_hash(subagent, t_exercise) ∨ explicit_recertification` | Position 24 | #1384 |
| 26 | Cognition partition-finality | OPEN | `∀ cognition state s: s ∈ {SETTLED_COGNITION, GLOBAL_COGNITION_VALID} ∨ execution_blocked(s)` | Positions 9, 11, 15 | #1385 |
| 27 | Distributed behavioral reconciliation | OPEN | `behavioral_surface_mutation ∈ drift_registry ∧ divergence_detected → reconciliation_required` | Position 18 | #1386 |
| 28 | Heartbeat continuity primitive | OPEN | `session_past_cognition_ttl → STALE_COGNITION → execution_blocked` | Position 26, INVARIANT-001 | #1387 |
| 29 | Cognition bootstrap governance | OPEN | Session init requires `cognition_lineage_record` before route handler executes | Position 24 | #1382 |
| 30 | Behavioral epoch binding | OPEN | `behavioral_epoch(session) ≥ behavioral_epoch(parent_session)` ∧ `epoch_bound ∈ cognition_lineage_record` | Epoch substrate | #1382, #1388 |
| 31 | Cognition memory registry | OPEN | Subsumed by Position 24 (cognition lineage registry covers session-boundary cognition state) | INVARIANT-001 | #1382 |
| 32 | Persistent behavioral identity surface | OPEN | Not a prerequisite for closure; tracked as post-closure concern | — | Post-#1388 |

### 8.5 Issue-Targeted Closure Rows (Positions 33–39)

| Position | Issue | Layer Closed | Invariant Closure Condition | Prerequisites |
|---|---|---|---|---|
| 33 | #1382 | Cognition lineage registry (Position 24) | `cognition_lineage_record ∈ cognition_lineage_registry ∧ continuity_anchored ∧ epoch_bound` | Positions 1–17 (especially 2, 10) |
| 34 | #1383 | Behavioral surface replay semantics (Position 23 partial) | `behavioral_surface_hash ∈ replay_scope_binding ∧ stale_hash_replay_attempt → NULL` | Position 33 |
| 35 | #1384 | Delegation cognition inheritance (Position 25) | `cognition_hash(delegator, issuance) = cognition_hash(subagent, exercise) ∨ explicit_recertification` | Position 33 |
| 36 | #1385 | Cognition partition-finality (Position 26) | All 8 cognition states formalized; collapse rules grounded in Positions 10, 11, 13 | Position 33 |
| 37 | #1386 | Distributed behavioral reconciliation (Position 27) | `behavioral_surface_drift ∈ drift_registry.drift_classes ∧ divergence → reconciliation_required` | Position 33 |
| 38 | #1387 | Heartbeat continuity primitive (Position 28) | `cognition_liveness_ttl_expiry → STALE_COGNITION → execution_blocked` | Positions 33, 36 |
| 39 | #1388 | Governance calculus cognition extension (Position 23, final) | `governance_calculus(…, cognition_hash, behavioral_epoch) → VALID \| NULL; cognition_hash_absent → NULL` | Positions 33–38 |

---

## 9. Highest-Leverage Unresolved Frontier

### 9.1 Determination (Confirmed from Frontier Analysis Section 9)

The single highest-leverage next closure target is:

**Issue #1382 — Cognition Lineage Registry**

### 9.2 Leverage Score Methodology

Closing Issue #1382 makes the following rows actionable that are not currently actionable:

| Row | Layer | Directly Unblocked By #1382 |
|---|---|---|
| 24 | Cognition lineage registry | YES (creates this layer) |
| 25 | Delegation cognition inheritance | YES (cognition_hash becomes computable) |
| 26 | Cognition partition-finality | YES (cognition_hash required for state transitions) |
| 27 | Distributed behavioral reconciliation | YES (behavioral surfaces become hash-identifiable) |
| 28 | Heartbeat continuity primitive | YES (cognition_liveness_registry requires cognition_id) |
| 29 | Cognition bootstrap governance | YES (bootstrap cognition = session init cognition lineage record) |
| 30 | Behavioral epoch binding | YES (epoch binding column is in cognition lineage record) |
| 31 | Cognition memory registry | YES (subsumed by cognition lineage registry) |
| CF-03 | Stale behavioral propagation | YES (behavioral surface hash enables staleness detection) |
| CF-09 | Authority contamination through memory | YES (cognition lineage binds session to behavioral surface state) |

**Leverage count: 10 rows unblocked by a single issue.**

No other issue in the decomposition sequence unblocks more than 3 rows:
- #1383 unblocks: CF-02, CF-07 (2 rows)
- #1384 unblocks: Position 25, CF-05 (2 rows)
- #1385 unblocks: Position 26, CF-01, CF-12 (3 rows)
- #1386 unblocks: Position 27, Position 18 partial close (2 rows)
- #1387 unblocks: Position 28, CF-08 (2 rows)
- #1388 unblocks: Position 23 final close, CF-06, CF-11 (3 rows)

### 9.3 Fail-Closed Boundary Definition for #1382

The fail-closed boundary for Issue #1382 during incremental deployment is:

```
If session_init_attempt ∧ ¬cognition_lineage_record_exists(session_id):
  → session_state = LOCAL_COGNITION_VALID (not GLOBAL_COGNITION_VALID)
  → execution_eligibility_gate: behavioral surfaces treated as TOPOLOGY_VISIBLE=false
  → result: execution_blocked until cognition lineage record is created

NOT: silent pass-through
NOT: degrade to prior behavior
NOT: allow execution without cognition lineage record
```

This definition ensures that partial deployment of Issue #1382 is safe: a session
without a cognition lineage record is execution-blocked, not silently permitted.

### 9.4 Replay-Boundary Priority Anchoring

The behavioral surface replay expiry introduced by Issue #1383 must be epoch-relative,
not wall-clock-relative. This anchors to the already-closed epoch substrate
(`src/lib/epoch-substrate.ts`):

```
behavioral_surface_replay_expiry(session_id) =
  epoch_replay_frontier(active_epoch(session_id))

A replay attempt is behavioral-surface-safe iff:
  behavioral_surface_hash(replay_attempt) = behavioral_surface_hash(original_execution)
  ∧ behavioral_epoch(replay_attempt) ≤ behavioral_epoch(original_execution) + 1
```

Using epoch-relative expiry rather than wall-clock-relative expiry ensures behavioral
surface replay safety degrades correctly under epoch advancement without requiring a
separate TTL registry.

---

## 10. Recommended Issue Decomposition Sequence

### 10.1 Dependency Graph (Partial Order)

```
Issue #1382 (cognition lineage registry)
  │  — mandatory first; prerequisite for all others —
  ├──▶ Issue #1383 (behavioral surface replay semantics)
  │      depends on: #1382 (behavioral_surface_hash source)
  │      parallelizable with: #1384, #1385, #1386
  │
  ├──▶ Issue #1384 (delegation cognition inheritance boundaries)
  │      depends on: #1382 (cognition_hash at issuance)
  │      parallelizable with: #1383, #1385, #1386
  │
  ├──▶ Issue #1385 (cognition partition-finality state machine)
  │      depends on: #1382 (cognition_hash for state transitions)
  │               + PARTITION_FINALITY_SEMANTICS.md (closed, Position 15)
  │               + src/lib/quorum-attestation.ts (closed, Position 9)
  │               + src/lib/causal-clock.ts (closed, Position 11)
  │      parallelizable with: #1383, #1384, #1386
  │
  ├──▶ Issue #1386 (behavioral surface reconciliation visibility)
  │      depends on: #1382 (behavioral_surface_hash source for drift records)
  │      parallelizable with: #1383, #1384, #1385
  │
  └──▶ Issue #1387 (heartbeat continuity primitive)
         depends on: #1382 (cognition_liveness_registry needs cognition_id)
                  + #1385 (STALE_COGNITION state must be defined first)
         must follow: #1382, #1385
         must precede: #1388

Issue #1388 (governance calculus cognition extension)
  — mandatory last; depends on all of #1382–#1387 —
  depends on: #1382 (cognition_hash computable)
           + #1383 (behavioral_surface_hash replay-safe)
           + #1384 (delegation cognition hash binding)
           + #1385 (cognition state classification)
           + #1386 (behavioral surfaces reconciliation-visible)
           + #1387 (cognition liveness governed)
```

### 10.2 Canonical Serialized Closure Sequence

When dependencies are serialized into a total order:

| Step | Issue | Parallelizable With | Canonical Closure Predicate | Fail-Closed Invariant at This Boundary |
|---|---|---|---|---|
| 1 | #1382 | (none — mandatory first) | `∀ session s: cognition_lineage_record(s) ∈ cognition_lineage_registry ∧ continuity_anchored(s) ∧ epoch_bound(s)` | Session without cognition lineage record → execution_blocked |
| 2a | #1383 | #1384, #1385, #1386 | `behavioral_surface_hash ∈ replay_scope_binding ∧ ∀ replay r: stale_behavioral_hash(r) → NULL` | Replay attempt missing behavioral_surface_hash → NULL |
| 2b | #1384 | #1383, #1385, #1386 | `cognition_hash(delegator, t_issuance) = cognition_hash(subagent, t_exercise) ∨ explicit_recertification(d)` | Delegation exercise with mismatched cognition_hash → delegation_invalid |
| 2c | #1385 | #1383, #1384, #1386 | `∀ s: cognition_state(s) ∈ {SETTLED_COGNITION, GLOBAL_COGNITION_VALID} ∨ execution_blocked(s) ∧ {QUARANTINED → quarantine_record, NULL → no_record}` | Cognition state not determinable → NULL_COGNITION → execution_blocked |
| 2d | #1386 | #1383, #1384, #1385 | `∀ behavioral_surface s: drift_event(s) ∈ drift_registry ∧ divergence_detected(s) → reconciliation_required_before_execution` | Behavioral drift detected without reconciliation record → execution_blocked |
| 3 | #1387 | (none after 2c) | `cognition_liveness_ttl_expiry(session_id) → STALE_COGNITION → execution_blocked ∧ liveness_renewal_required` | Cognition TTL expired without renewal → STALE_COGNITION → execution_blocked |
| 4 | #1388 | (none — mandatory last) | `governance_calculus(authority, validation, continuity, topology, replay, proof, governance, cognition_hash, behavioral_epoch) → VALID \| NULL; cognition_hash_absent → NULL` | Execution attempt without cognition_hash in calculus → NULL |

### 10.3 Fail-Closed Invariants at Partial Deployment Boundaries

The following invariants must hold if a deployment window closes between steps:

**Between Steps 1 and 2 (after #1382, before #1383–#1386):**
- Sessions have cognition lineage records
- Behavioral surface hashes are computable but not yet in replay scope
- Behavioral surface drift is not yet reconciliation-visible
- **Required behavior:** execution is permitted but cognition_hash is not yet
  enforced by the execution gate; this is acceptable because #1382 alone does
  not narrow the gate — it establishes the evidence base for #1383–#1388 to use

**Between Steps 2 and 3 (after #1383–#1386, before #1387):**
- Behavioral surface hashes are in replay scope
- Delegation cognition hash is captured
- Cognition state machine is formalized
- Behavioral drift is reconciliation-visible
- Long-running sessions may operate without liveness TTL enforcement
- **Required behavior:** sessions past the intended TTL continue operating;
  this gap is bounded by the expectation that #1387 follows shortly; the
  risk window is characterized by CF-08 (heartbeat replay loop) remaining
  achievable

**Between Steps 3 and 4 (after #1387, before #1388):**
- All cognition inputs are governed
- The governance calculus does not yet include them as required inputs
- **Required behavior:** all cognition predicates are evaluated outside the
  calculus; execution is not yet gated on cognition_hash absence; this is
  the highest-risk partial deployment window and #1388 should be deployed
  with minimum delay after #1387

---

## Appendix A: Invariant Promotion Registry

Extends `docs/governance/invariant-registry.md`. All five invariants are
promoted from PROPOSED to PENDING_CLOSURE with dependency chains.

### INVARIANT-011 (PENDING_CLOSURE)

```
Name:    Behavioral Surface Governance
Rule:    Any behavioral surface capable of altering execution eligibility
         must be legitimacy-governed before it can influence execution outcomes

Source issue:          #1382 (establishes cognition lineage registry)
                       #1388 (adds cognition_hash to execution gate)
Closed-layer chain:    INVARIANT-001 → #1382 → #1383/#1386 → #1388 → INVARIANT-011
Required test class:   FATE behavioral-surface-governance-predicate-enforcement
Closed when:           #1388 is closed
```

### INVARIANT-012 (PENDING_CLOSURE)

```
Name:    Cognition Lineage Completeness
Rule:    Missing cognition lineage = STALE_COGNITION = NULL

Source issue:          #1382 (creates registry)
                       #1385 (defines STALE_COGNITION terminal state)
Closed-layer chain:    INVARIANT-001 → #1382 → #1385 → INVARIANT-012
Required test class:   FATE cognition-lineage-missing-stale-null-propagation
Closed when:           #1382 and #1385 are both closed
```

### INVARIANT-013 (PENDING_CLOSURE)

```
Name:    Delegation Cognition Binding
Rule:    Delegated authority inherits the delegating agent's cognition hash at
         issuance time; cognition hash mismatch at exercise time → delegation invalid

Source issue:          #1384
Closed-layer chain:    INVARIANT-001 → #1382 → #1384 → INVARIANT-013
Required test class:   FATE delegation-cognition-hash-mismatch-rejection
Closed when:           #1384 is closed (requires #1382 as prerequisite)
```

### INVARIANT-014 (PENDING_CLOSURE)

```
Name:    Cognition Liveness Integrity
Rule:    Expired cognition liveness = STALE_COGNITION;
         expired continuity cannot authorize cognition continuation

Source issue:          #1387
Closed-layer chain:    INVARIANT-001 → INVARIANT-003 → #1382 → #1385 → #1387 → INVARIANT-014
Required test class:   FATE cognition-liveness-ttl-enforcement
Closed when:           #1387 is closed (requires #1382 and #1385 as prerequisites)
```

### INVARIANT-015 (PENDING_CLOSURE)

```
Name:    Behavioral Epoch Monotonicity
Rule:    Behavioral epoch for a session cannot decrease;
         epoch rollback → NULL_COGNITION

Source issue:          #1382 (behavioral_epoch captured in cognition lineage record)
                       #1388 (behavioral_epoch enforced as monotone in governance calculus)
Closed-layer chain:    Epoch substrate → #1382 → #1388 → INVARIANT-015
Required test class:   FATE behavioral-epoch-rollback-null-propagation
Closed when:           #1388 is closed (requires #1382 as prerequisite)
```

---

## Appendix B: Canonical Closure Condition (Annotated)

Restates Appendix B from `cognition-governance-frontier-analysis.md` with each
conjunct annotated by source issue and closed-layer anchor.

```
Cognition-governance layer is closed when:

∀ behavioral surface s:
  CONTENT_HASH_KNOWN(s)            ← Issue #1382 (cognition_lineage_registry.surface_hash)
  ∧ EPOCH_BOUND(s)                 ← Issue #1382 (epoch binding in cognition_lineage_record)
                                      anchors to: epoch substrate (Position 10)
  ∧ CONTINUITY_ANCHORED(s)         ← Issue #1382 (continuity_id FK in cognition_lineage_record)
                                      anchors to: INVARIANT-001 (Position 2)
  ∧ RECONCILIATION_VISIBLE(s)      ← Issue #1386 (behavioral_surface_drift in drift_registry)
                                      anchors to: drift detection (Position 18)
  ∧ REVOCATION_PROPAGATABLE(s)     ← Issue #1382 (revocation propagation via INVARIANT-003)
                                      anchors to: INVARIANT-003 (Position 7)
  ∧ REPLAY_EXPIRY_DEFINED(s)       ← Issue #1383 (behavioral_surface_hash in replay_scope_binding)
                                      anchors to: replay determinism (Position 8)

∧ ∀ delegation event d:
  cognition_hash(delegator, issuance_time) = cognition_hash(subagent, exercise_time)
  ∨ explicit_cognition_recertification(d)
                                   ← Issue #1384 (delegation cognition hash binding)
                                      anchors to: INVARIANT-001, #1382

∧ ∀ session s:
  cognition_state(s) ∈ {GLOBAL_COGNITION_VALID, SETTLED_COGNITION}
  ∨ execution_blocked(s)           ← Issue #1385 (cognition partition-finality state machine)
                                      anchors to: Positions 9, 11, 13, 15

∧ governance_calculus includes cognition_hash ∧ behavioral_epoch as required inputs
                                   ← Issue #1388 (governance calculus cognition extension)
                                      anchors to: Issues #1382–#1387, runtime/governance/governance_calculus.json

→ distributed cognition legitimacy convergence achieved

Reconciliation dependency:
  All conjuncts must be recursively reconcilable via:
    cognition_lineage_registry (Issue #1382, chains to continuity_registry)
    drift_registry (Issue #1386, chains to cross_registry_reconciliation_registry)
  Neither registry creates authority. Both are evidence-only.
```

---

*Status: NON-OPERATIVE. Evidence-only. No authority created. No execution surface widened. No runtime semantics altered.*  
*creates_authority: false | executable: false | mutation_capable: false*  
*Parent: cognition-governance-frontier-analysis.md (commit 8631423)*
