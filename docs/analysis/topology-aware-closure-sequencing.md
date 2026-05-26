# MindShift — Topology-Aware Closure Sequencing (Post-Minimal `/govern` Ingress)

Status: **NON-OPERATIVE**  
creates_authority=false  
analysis-only

## 1. Structural Compression

### Compressed problem statement
You need a deterministic, fail-closed bridge from **proposal classification** to **governed execution eligibility**, while preserving:
- `proposal ≠ authority`
- `proposal ≠ execution`
- `validated_object == executed_object`
- lineage-bound replay safety under partition and reconciliation

### Canonical object planes (next-layer view)
1. **Candidate Plane**: non-executable proposal objects (`CANDIDATE`).
2. **Lineage Plane**: continuity/authority/replay/behavioral/topology references.
3. **Eligibility Plane**: derived verdict object (`ELIGIBLE` or deterministic NULL class).
4. **Settlement Plane**: distributed replay/cognition convergence state.
5. **Execution-Boundary Plane**: still non-executing mediation object that can be consumed later by canonical `/authority -> /compile -> /validate -> /execute -> /proof`.

### Minimal canonical schemas to unlock next closure
- `GovernCandidate` (immutable candidate envelope)
- `LineageBinding` (lineage hash links + revocation epoch)
- `ReplayStamp` (nonce domain + settlement class)
- `EligibilityVerdict` (policy + lineage + replay + topology predicates)
- `ConvergenceWitness` (partition-visible reconciliation evidence)
- `CognitionLineageBinding` (delegation chain + decay semantics)

All are **append-only**, versioned, hash-linked, and evidence-addressable.

---

## 2. Runtime Progression Analysis

### Current progression (compressed)
`proposal -> classify -> (future governed mediation) -> canonical execution path`

### Required progression (without collapsing proposal->execution)
1. **Classify candidate** (non-executable).
2. **Bind lineage bundle** (continuity + authority ancestry references only).
3. **Attach replay stamp** (domain-scoped, epoch-scoped, topology-visible).
4. **Run eligibility predicates** (VALID/AUTHORIZED/UNUSED/POLICY_VALID/REPLAY_SAFE/TOPOLOGY_VISIBLE/RECONCILABLE/EPOCH_VALID/CONVERGENCE_VALID).
5. **Issue execution-bound mediation object** (still non-authoritative).
6. Later, canonical runtime may consume mediation object through `/authority -> /compile -> /validate -> /execute -> /proof` only.

### Critical separation constraints
- Mediation object can **propose eligibility**, never execute.
- Authority inheritance must be explicit and lineage-bound; never implied by proposal origin.
- Any stale lineage reference deterministically downgrades to `QUARANTINED` or `NULL`.

---

## 3. Replay Convergence Frontier

### Next replay frontier beyond local nonce

#### A. Local vs global replay validity
- **Local validity**: object unused in local partition view.
- **Global validity**: no conflicting usage observed across quorum-visible partitions for settlement window.

A candidate may be `LOCAL_VALID` but `GLOBAL_UNSETTLED`.

#### B. Required replay settlement classes
- `REPLAY_CLEAR_LOCAL`
- `REPLAY_UNSETTLED_DISTRIBUTED`
- `REPLAY_CONFLICT_DETECTED`
- `REPLAY_QUARANTINED`
- `REPLAY_FINAL`
- `REPLAY_REVOKED_AFTER_RECONCILIATION`

#### C. Partition replay semantics
- Replay invalidation must propagate as append-only evidence, not mutable flags.
- Reconciliation may resurrect visibility of previously unseen conflicts; resurrection must force deterministic reclassification (`REPLAY_REVOKED_AFTER_RECONCILIATION`).
- No partition may elevate `UNSETTLED` to `FINAL` without quorum predicate.

#### D. Conflict ordering
1. Continuity epoch validity check
2. Authority lineage revocation check
3. Replay nonce conflict check
4. Topology visibility sufficiency check
5. Settlement classification

Ordering matters to prevent hidden authority from stale-but-unused objects.

---

## 4. Governed Execution Boundary Requirements

### Objective
Progress from candidate classification to **execution-bound proposal mediation** without execution authority creation.

### Predicates that must stabilize first
1. Canonical lineage binding (candidate->continuity->authority ancestry).
2. Replay domain settlement semantics.
3. Revocation propagation semantics.
4. Topology visibility minimums.
5. Deterministic eligibility class mapping.

### Observational-only layers that should remain non-authoritative
- Topology telemetry
- Partition health views
- Drift observability
- Cognition behavior metrics

### Mandatory fail-closed boundaries
- Missing lineage link => `NULL`.
- Replay unsettled above risk threshold => `QUARANTINED`.
- Topology visibility insufficient => `BLOCKED`.
- Policy predicate drift => `INVALID`.

### Proof-binding requirements
Eligibility mediation must include:
- exact canonical hash of candidate
- lineage binding hash set
- replay settlement class + evidence refs
- predicate vector snapshot
- epoch and convergence window

This prevents post-verdict mutation and protects `validated_object == executed_object`.

---

## 5. Cognition-Governance Integration

### Behavioral authority surfaces
High-risk surfaces:
- delegated subagent proposals
- policy-shaping behavioral mutations
- adaptive scoring that affects eligibility

### Required cognition lineage bindings
Bind cognition lineage into govern lineage at:
1. proposal shaping origin
2. delegation hop chain
3. behavioral policy contribution
4. replay stamp inheritance

### Cognition-derived authority decay
Any cognition-derived eligibility signal must:
- have explicit TTL/epoch bounds
- require fresh continuity anchoring after expiry
- be non-transitive by default across delegation hops

### Cognition replay contamination controls
- Cognition outputs reuse same replay object domain unless explicitly re-materialized with new lineage.
- Delegated cognition artifacts inherit replay quarantine if parent lineage quarantined.
- Behavioral drift events become replay-relevant evidence if they alter future eligibility decisions.

### Quarantine boundaries
- Unverifiable delegation lineage => cognition quarantine.
- Split-brain cognition verdicts under low topology visibility => quarantine.
- Stale cognition policy snapshot vs current epoch => blocked.

---

## 6. Distributed Cognition Convergence Determinism

### Deterministic semantics needed

#### A. Cognition reconciliation ordering
1. Continuity/epoch admissibility
2. Delegation lineage validity
3. Replay contamination check
4. Policy snapshot compatibility
5. Quorum visibility check
6. Settlement class assignment

#### B. Cognition settlement classes
- `COG_LOCAL_ACCEPTED`
- `COG_UNSETTLED`
- `COG_DIVERGENT`
- `COG_QUARANTINED`
- `COG_FINAL`
- `COG_REVOKED_AFTER_RECONCILIATION`

#### C. Split-brain resolution
Use deterministic tie-break tuple:
`(epoch, continuity_depth, lineage_weight, quorum_visibility, canonical_hash)`

No semantic-free wall-clock tie-breaks.

#### D. Topology-visible drift
Drift classification must be visible as evidence objects:
- `DRIFT_OBSERVED`
- `DRIFT_POLICY_RELEVANT`
- `DRIFT_EXECUTION_ELIGIBILITY_IMPACTING`

Only the last class can block eligibility, and only through explicit predicates.

---

## 7. Failure Taxonomy Expansion

### Additional deterministic rejection/quarantine classes
- `LINEAGE_DETACHED`
- `LINEAGE_STALE`
- `LINEAGE_ORPHANED`
- `LINEAGE_REVOKED_UNSEEN`
- `REPLAY_PARTITION_CONFLICT`
- `REPLAY_RESURRECTION_CONFLICT`
- `TOPOLOGY_INSUFFICIENT_VISIBILITY`
- `COGNITION_DELEGATION_GAP`
- `COGNITION_DRIFT_UNSETTLED`
- `CONVERGENCE_UNPROVEN`

Each class must map to:
- invariant violated
- required evidence bundle
- admissible remediation path
- whether remediation requires fresh proposal object

---

## 8. Canonical Closure Dependency Graph

## Layer graph (dependency-ordered)
1. **L1: Candidate Lineage Binding Core** *(mandatory-first)*
2. **L2: Revocation & Lineage Propagation Semantics** *(depends on L1)*
3. **L3: Distributed Replay Settlement Classes** *(depends on L1, L2)*
4. **L4: Topology Visibility Predicate Framework** *(depends on L1; parallelizable with L3 early design)*
5. **L5: Deterministic Eligibility Verdict Object** *(depends on L3, L4)*
6. **L6: Cognition Lineage Binding + Decay Model** *(depends on L1, L4; parallelizable before L5 completion)*
7. **L7: Distributed Cognition Settlement/Finality** *(depends on L3, L6)*
8. **L8: Execution-Bound Mediation Object (non-authoritative)** *(depends on L5, L7)*

### Blocking dependencies
- Replay-finality semantics block trustworthy eligibility.
- Cognition lineage binding blocks safe delegated proposal mediation.
- Topology visibility predicates block partition-safe finalization.

---

## 9. Highest-Leverage Next Layer

### Recommended highest-leverage closure target
## **L1: Candidate Lineage Binding Core**

Why highest leverage:
- It is the prerequisite for replay settlement, revocation propagation, and cognition lineage safety.
- It prevents detached proposal propagation from ever entering eligibility mediation.
- It enforces fail-closed invariants early with minimal authority risk.

### L1 specification summary
- **Closure target**: immutable lineage-bound `GovernCandidate` + `LineageBinding` schemas.
- **Risk class**: Critical.
- **Invariant protected**: `proposal ≠ authority`, lineage prerequisite chain, recursive reconcilability.
- **Replay implications**: enables domain-correct replay keys and stale lineage replay rejection.
- **Reconciliation implications**: allows orphan/revoked lineage deterministic reclassification.
- **Partition-finality implications**: prevents partition-local assumptions from minting pseudo-valid candidates.
- **Required proofs**: lineage hash chain proof, revocation awareness proof, topology visibility footprint.
- **Recommended tests**:
  - detached lineage candidate rejected
  - stale lineage replay rejected across epoch shift
  - lineage revocation observed post-partition causes deterministic downgrade
  - orphan convergence never upgraded to executable mediation

---

## 10. Recommended Issue Sequence

1. **Issue A — Canonical Candidate & Lineage Binding Schemas**
   - Define immutable candidate envelope + lineage links + hash rules.
   - Add fail-closed parse/validation rules for missing lineage edges.

2. **Issue B — Lineage Revocation Propagation + Persistence Semantics**
   - Append-only revocation evidence model.
   - Deterministic lineage downgrade behavior on late revocation discovery.

3. **Issue C — Distributed Replay Settlement Taxonomy**
   - Introduce local/global replay state model and transition guards.
   - Define replay resurrection handling during reconciliation.

4. **Issue D — Topology Visibility Predicate Layer**
   - Formalize minimum visibility thresholds for eligibility classes.
   - Prevent partition-local promotion to finality.

5. **Issue E — Deterministic Eligibility Verdict Object**
   - Materialize predicate vector into immutable verdict object.
   - Enforce deterministic NULL/QUARANTINE mapping.

6. **Issue F — Cognition Lineage & Delegation Binding**
   - Bind delegated cognition artifacts to govern lineage.
   - Add decay and non-transitive inheritance defaults.

7. **Issue G — Distributed Cognition Settlement & Split-Brain Resolution**
   - Define cognition settlement/finality classes and ordering.
   - Add deterministic split-brain tie-break semantics.

8. **Issue H — Non-Authoritative Execution-Bound Mediation Object**
   - Create mediation object consumable only by canonical runtime path.
   - Explicitly prohibit direct execution authority grant.

9. **Issue I — Cross-Layer Conformance/Test Vectors**
   - Replay-partition vectors
   - lineage revocation vectors
   - cognition drift and delegation replay vectors
   - convergence/finality vectors

10. **Issue J — Proof Completeness & Observability Containment Audit**
   - Confirm every verdict and downgrade emits append-only evidence.
   - Verify observability routes remain non-mutating and non-authoritative.
