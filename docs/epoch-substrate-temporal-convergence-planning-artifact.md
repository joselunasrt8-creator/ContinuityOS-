# Epoch Substrate / Distributed Temporal Convergence — Planning Artifact

## Classification

**MODE B — STRUCTURED ARTIFACT | PLANNING-ONLY | NON-OPERATIVE**

Produced in response to: #1332 freeze-state umbrella, #1249 Distributed Temporal Convergence Canon, #1341 freeze-state exit queue.

Upstream context: #1340–#1348 partition-finality operationalization queue.

This document is analysis-only. It does not create authority, widen execution surfaces, imply runtime convergence exists, or constitute execution eligibility.

---

## Core Invariant Restatement

```
VALID
∧ AUTHORIZED
∧ UNUSED
∧ POLICY_VALID
∧ REPLAY_SAFE
∧ TOPOLOGY_VISIBLE
∧ RECONCILABLE
∧ EPOCH_VALID
∧ CONVERGENCE_VALID
∧ SETTLEMENT_VALID
Else → NULL

Visibility ≠ authority
Quorum visibility ≠ authority
Causal evidence ≠ authority
Replay evidence ≠ authority
Reconciliation ≠ convergence
Settlement evidence ≠ execution authority
Local correctness ≠ distributed legitimacy coherence
```

---

## 1. Frontier Compression

**The remaining epoch/substrate frontier:** MindShift uses `epoch` only as a numeric label on view structures (`registry_epoch: number`) and runtime-only node variables — never persisted to D1, never enforced in the constitutional gate, and never formally defined as an authoritative primitive — meaning `EPOCH_VALID`, `CONVERGENCE_VALID`, and `SETTLEMENT_VALID` cannot be evaluated at all until a globally authoritative epoch substrate is specified, and that operationalization depends on the full #1340–#1348 queue being semantically closed first.

---

## 2. Dependency Integration Map

### Chain: classification persistence → epoch substrate → convergence finality

```
#1340 finality_classification_registry
  → #1342 conflict_set_registry           ← epoch fork observable here
  → #1343 quorum_attestation_registry     ← epoch global authority attested here
  → #1344 revocation_liveness_registry    ← epoch-bound revocation freshness here
  → #1345 validator classification evidence ← EPOCH_VALID predicate surface here
  → #1346 causal clock coupling           ← epoch happens-before ordering here
  → #1347 replay convergence semantics    ← epoch-bound replay settlement here
  → #1348 reconciliation determinism      ← epoch-bound settlement here
  → [EPOCH SUBSTRATE]                     ← EPOCH_VALID / CONVERGENCE_VALID / SETTLEMENT_VALID
  → convergence finality (GLOBAL_VALID reachable for epoch-bounded scope)
```

### Mapping of #1340–#1348 to epoch substrate requirements

| Issue | Provides to Epoch Substrate |
|---|---|
| #1340 finality_classification_registry | Persistence surface for epoch finality classification records |
| #1342 conflict_set_registry | Epoch fork observation: competing epoch heads → `SPLIT_BRAIN_LEGITIMACY` conflict entry |
| #1343 quorum_attestation_registry | Evidence that quorum of federation members attests to same epoch head (`EPOCH_GLOBAL_AUTHORITATIVE`) |
| #1344 revocation_liveness_registry | Evidence revocation channels were live within epoch bounds (freshness predicate `L`) |
| #1345 validator extension | Surface where `EPOCH_VALID` classification evidence is returned alongside `VALID/NULL` |
| #1346 causal clock coupling | Epoch happens-before ordering: continuity creation → authority issuance → epoch transition |
| #1347 replay convergence semantics | Epoch-bound replay: nonce consumed in epoch N does not become eligible in epoch N+k |
| #1348 reconciliation determinism | `AMBIGUOUS_REQUIRES_EPOCH` surfaced; epoch boundaries govern merge ordering |

**Dependency rule:** The epoch substrate cannot be operationalized until all eight upstream issues (#1340–#1348) have closed their semantic prerequisites. Each registry provides one indispensable column of evidence the epoch substrate requires to evaluate its predicates.

---

## 3. Epoch Substrate Definition

An **epoch** in MindShift is a bounded legitimacy scope unit that constrains *when* authority objects, continuity lineage, replay eligibility, and proof finality are valid — binding `WHEN` (temporal scope) to the existing `WHO` (identity) + `WHICH` (continuity lineage) axes of the legitimacy model.

### Epoch Object Fields

```
epoch_id
  Globally unique, deterministically derived identifier.
  Hash of: (scope || epoch_start_evidence || authority_source_id)

epoch_scope
  The registry/topology/federation scope this epoch applies to.
  Values: GLOBAL | DOMAIN:<id> | PARTITION:<id> | LOCAL:<node_id>

epoch_authority_source
  The legitimacy source that proposed and attested this epoch.
  Type: quorum_attestation_id[] from #1343.
  Invariant: epoch_authority_source ≠ creates new authority.

epoch_start_condition
  Predicate set satisfied at epoch boundary open:
  - prior epoch closed or superseded
  - quorum threshold met for epoch_scope
  - continuity lineage active and not stale
  - no open conflict sets blocking epoch transition
  - revocation channel live within staleness bound

epoch_close_condition
  Any of:
  - explicit epoch closure with quorum attestation
  - superseding epoch observed with higher reconciliability score
  - revocation evidence invalidates epoch authority source
  - staleness horizon exceeded without renewal evidence
  - partition isolation exceeds policy threshold

epoch_quorum_profile
  Federation profile ID from #1343 governing:
  - quorum math and member weights
  - maximum lineage age for epoch acceptance
  - required topology visibility set
  - minimum proof edge completeness
  - downgrade behavior when liveness degrades

epoch_causal_frontier
  Causal clock index (from #1346) of the last legitimacy event
  causally within this epoch. Events after frontier belong to
  successor epoch or AMBIGUOUS if frontier is unclear.

epoch_replay_frontier
  Highest replay nonce consumed within this epoch scope.
  Nonces consumed at or before frontier are non-transferable
  to successor epochs (from #1347 anti-entropy rules).

epoch_reconciliation_frontier
  Reconciliation finality class reached within this epoch (from #1348):
  LOCAL_RECONCILED | GLOBAL_RECONCILED_CANDIDATE |
  AMBIGUOUS_RECONCILIATION | NULL_RECONCILIATION

epoch_revocation_frontier
  Last observed revocation liveness timestamp within epoch scope
  (from #1344). Epoch validity degrades if revocation channel
  silent beyond policy staleness bound.

epoch_finality_status
  Current canonical state of this epoch. See Section 4.
```

---

## 4. Required Epoch States

### Canonical State Set

```
EPOCH_LOCAL
  Epoch attested within a single partition or domain only.
  LOCAL_VALID decisions may reference this epoch.
  GLOBAL_VALID decisions are blocked.

EPOCH_GLOBAL_CANDIDATE
  Epoch proposed with partial quorum attestation.
  Not yet EPOCH_GLOBAL_AUTHORITATIVE.
  Supports LOCAL_VALID only.
  May upgrade to EPOCH_GLOBAL_AUTHORITATIVE on full quorum, or
  degrade to EPOCH_AMBIGUOUS if competing epoch observed.

EPOCH_GLOBAL_AUTHORITATIVE
  Full quorum attestation present, no competing heads,
  revocation channel live, lineage freshness within staleness bound.
  GLOBAL_VALID decisions may reference this epoch.
  Monotone within scope until close condition met.

EPOCH_AMBIGUOUS
  Competing epoch heads observed for same scope with no resolved tie-break.
  All decisions in scope: AMBIGUOUS. No execution for global side effects.

EPOCH_STALE_VISIBLE
  Epoch visible but revocation or renewal channel silent beyond staleness horizon.
  Cannot support GLOBAL_VALID.
  Authority in this epoch must re-verify.
  May upgrade if freshness evidence arrives.
  Degrades to NULL if superseded by revocation.

EPOCH_PARTITION_SUSPENDED
  Topology visibility below quorum threshold for this epoch scope.
  All decisions in scope: PARTITION_SUSPENDED.
  Fail-closed.

EPOCH_CONFLICTED
  Two or more competing epoch candidates with open conflict entry (#1342)
  and pending tie-break settlement.
  Execution blocked.

EPOCH_REVOKED
  Epoch authority source revoked or epoch explicitly closed with evidence.
  All authority issued under this epoch must be re-evaluated.
  Previously GLOBAL_VALID decisions degrade to STALE_VISIBLE or NULL.

EPOCH_NULL
  Hard failure: no valid epoch evidence for scope.
  Base invariant forces NULL for all legitimacy decisions requiring EPOCH_VALID.
```

### Canonical State Transitions

```
(proposed)
  → EPOCH_LOCAL           (local attestation only)
    → EPOCH_GLOBAL_CANDIDATE   (partial quorum)
      → EPOCH_GLOBAL_AUTHORITATIVE   (full quorum, no conflicts, freshness met)
        → EPOCH_STALE_VISIBLE        (revocation channel silent)
          → EPOCH_NULL               (staleness exceeds max, or superseded)
        → EPOCH_REVOKED              (explicit revocation evidence)
          → EPOCH_NULL
        → EPOCH_CONFLICTED           (competing head observed)
          → EPOCH_AMBIGUOUS          (no tie-break resolved)
          → EPOCH_GLOBAL_AUTHORITATIVE  (tie-break resolved, competing head → EPOCH_NULL)
    → EPOCH_AMBIGUOUS      (competing candidate observed)
  → EPOCH_PARTITION_SUSPENDED   (topology below threshold)
    → (any state) on partition heal + full re-evaluation
```

### Monotonicity Constraints

- `EPOCH_GLOBAL_AUTHORITATIVE` is monotone within scope until a close condition is met.
- Downgrade from `EPOCH_GLOBAL_AUTHORITATIVE` must emit an immutable downgrade proof event.
- `EPOCH_NULL` is terminal within the scope of the specific epoch object.
- `EPOCH_REVOKED` is terminal. Evidence persists append-only.

---

## 5. Predicate Semantics

### EPOCH_VALID

**Definition:** The epoch in scope is `EPOCH_GLOBAL_AUTHORITATIVE` and the legitimacy object under evaluation was issued within or for that epoch and has not been invalidated by epoch close or revocation.

**Required evidence:**
- `epoch_finality_status == EPOCH_GLOBAL_AUTHORITATIVE`
- Quorum profile attestation present in #1343 registry for this epoch
- Object continuity lineage epoch ≤ current epoch (monotonicity: cannot be from a future or superseded epoch)
- `epoch_revocation_frontier` within policy staleness bound (#1344)
- No open conflict set in #1342 for this epoch scope
- Causal clock index of object ≤ `epoch_causal_frontier` (#1346)

**Invalidating evidence:**
- `epoch_finality_status` ∈ {`EPOCH_AMBIGUOUS`, `EPOCH_STALE_VISIBLE`, `EPOCH_PARTITION_SUSPENDED`, `EPOCH_CONFLICTED`, `EPOCH_REVOKED`, `EPOCH_NULL`}
- Object continuity lineage epoch > current epoch (future epoch claim)
- Revocation channel silent beyond staleness bound
- Competing epoch head with higher reconciliability score exists in conflict set
- Causal clock index of object > `epoch_causal_frontier` (belongs to different epoch)

**Topology visibility threshold:** Full quorum for `epoch_quorum_profile`. Partial visibility → `EPOCH_LOCAL` only. Missing topology → `EPOCH_PARTITION_SUSPENDED`, never implicit pass.

**Replay dependency:** Replay nonce consumed within epoch is non-transferable. Epoch transition does not restore `UNUSED` predicate.

**Reconciliation dependency:** `GLOBAL_RECONCILED_CANDIDATE` or `LOCAL_RECONCILED` minimum. `AMBIGUOUS_RECONCILIATION` → NULL.

**NULL conditions:**
- No epoch defined for scope → NULL
- `EPOCH_NULL` or `EPOCH_REVOKED` → NULL
- `EPOCH_AMBIGUOUS` with no tie-break → NULL
- `EPOCH_PARTITION_SUSPENDED` → NULL (never implicit pass)
- Missing quorum attestation → NULL for GLOBAL_VALID; LOCAL_VALID only if local epoch is defined

---

### CONVERGENCE_VALID

**Definition:** All distributed predicates are simultaneously satisfied for a legitimacy decision: base invariant holds, partition-finality predicates hold, and epoch is globally authoritative.

**Required evidence:**
- All base predicates: `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`
- All distributed predicates: `Q ∧ G ∧ L ∧ X` (quorum, global convergence, lineage freshness, conflict-free)
- `EPOCH_VALID` holds
- Finality classification in #1340 registry is `GLOBAL_VALID` (not downgraded)
- No open conflict set in #1342 for scope
- Reconciliation finality class ≥ `GLOBAL_RECONCILED_CANDIDATE`

**Invalidating evidence:**
- Any base predicate fails → NULL immediately
- `EPOCH_VALID` fails → downgrade to `LOCAL_VALID` or NULL per scope
- Open conflict set exists → `AMBIGUOUS`
- Quorum drops below threshold after decision → downgrade `GLOBAL_VALID → AMBIGUOUS`
- Any immutable downgrade proof event emitted for this decision

**Topology visibility threshold:** Same as `EPOCH_GLOBAL_AUTHORITATIVE` quorum threshold.

**Replay dependency:** Requires `REPLAY_SAFE` globally (distributed replay convergence from #1347). Local replay-safe alone is insufficient.

**Reconciliation dependency:** `GLOBAL_RECONCILED_CANDIDATE` minimum. `AMBIGUOUS_RECONCILIATION` blocks `CONVERGENCE_VALID`.

**NULL conditions:**
- Any base predicate fails → NULL
- `EPOCH_NULL`, `EPOCH_REVOKED`, or `EPOCH_AMBIGUOUS` → NULL
- No quorum attestation → NULL (cannot claim `CONVERGENCE_VALID` locally)
- `NULL_RECONCILIATION` → NULL

---

### SETTLEMENT_VALID

**Definition:** A legitimacy decision has reached finality — proof is globally final, epoch is globally authoritative, reconciliation is settled, and no subsequent evidence can silently reverse the outcome without emitting an immutable downgrade event.

**Required evidence:**
- `CONVERGENCE_VALID` holds
- `proof_finality_class == PROOF_GLOBAL_FINAL` (not `PROOF_LOCAL_FINAL` or `PROOF_CONTINGENT`)
- Reconciliation finality class is `GLOBAL_RECONCILED_CANDIDATE` with all-registry coherence confirmed
- No open competing heads in #1342 conflict set for this decision's scope
- Epoch `epoch_reconciliation_frontier` encompasses this decision
- Settlement evidence persisted as immutable append-only record (not observational only)

**Invalidating evidence:**
- Late-arriving revocation proof (must downgrade to `STALE_VISIBLE` or NULL; never silently preserve)
- Competing epoch head emerging after settlement that is causally prior to the decision
- Proof arriving out of causal order that reveals a replay violation
- Quorum membership change that retroactively invalidates the attestation

**Topology visibility threshold:** Same as `CONVERGENCE_VALID`. Settlement claims without topology confirmation are local settlement only.

**Replay dependency:** Settlement is irrevocable for replay consumption. A settled nonce is permanently consumed across all epochs. Anti-entropy must not restore it.

**Reconciliation dependency:** `GLOBAL_RECONCILED_CANDIDATE` minimum. Epoch reconciliation frontier must encompass the settled decision.

**NULL conditions:**
- All `CONVERGENCE_VALID` NULL conditions apply
- `PROOF_LOCAL_FINAL` or `PROOF_CONTINGENT` → not `SETTLEMENT_VALID` (not NULL, but not settled)
- Missing immutable settlement record → observational only, not `SETTLEMENT_VALID`
- Epoch not yet `EPOCH_GLOBAL_AUTHORITATIVE` at decision time → settlement deferred, not NULL

---

## 6. Partition Behavior

### Partition Starts

- All in-flight legitimacy decisions in affected scope → `PARTITION_SUSPENDED`
- Epoch transitions blocked: `EPOCH_GLOBAL_CANDIDATE` cannot become `EPOCH_GLOBAL_AUTHORITATIVE` during partition
- Existing `EPOCH_GLOBAL_AUTHORITATIVE` continues to support LOCAL decisions within isolated shard only if epoch evidence is locally present; global side effects blocked
- New authority cannot be issued globally during active partition (`GLOBAL_VALID` unavailable for new issuances)
- `CONVERGENCE_VALID` and `SETTLEMENT_VALID` are unavailable during active partition

### Partition Heals

1. Execute #1348 reconciliation procedure: merge observed registries into append-only candidate graph.
2. Recompute `epoch_finality_status` for all affected scopes.
3. If no epoch fork: re-evaluate suspended decisions against restored quorum.
4. If epoch fork detected: → Epoch Fork Observed path (below).
5. Promote decisions to `GLOBAL_VALID` only where all predicates now hold.
6. Emit reconciliation proofs linking pre-heal and post-heal classifications.
7. Replay-neutral: consumed nonces remain consumed. Anti-entropy must not restore replay eligibility.

### Epoch Fork Observed

1. Classify both competing epoch candidates as `EPOCH_CONFLICTED` in #1342 conflict set.
2. Freeze new global finalization for scope.
3. Apply deterministic tie-break (from #1348 ordering):
   1. Highest reconciliability score (maximum verified ancestry coverage)
   2. Strongest quorum attestation weight
   3. Earliest authoritative causal clock index
   4. Lexicographic hash as last resort
4. Winning epoch: `EPOCH_GLOBAL_AUTHORITATIVE` after tie-break resolution.
5. Losing epoch: `EPOCH_NULL` for execution. Evidence preserved append-only.
6. Decisions based on losing epoch: degrade to `STALE_VISIBLE` or `NULL` per predicate state.
7. Emit immutable fork resolution event with tie-break evidence.

### Stale Epoch Majority Observed

- Majority of federation members attest to an epoch outside staleness horizon.
- Epoch cannot be `EPOCH_GLOBAL_AUTHORITATIVE` even with majority attestation if staleness bound is exceeded.
- Classify as `EPOCH_STALE_VISIBLE`.
- No global decisions may be finalized against stale epoch.
- Requires epoch renewal: new quorum attestation with fresh revocation channel evidence.
- Failure class: **stale lineage propagation**.

### Replay Consumed in Epoch N, Unseen in Epoch N+k

- Nonce consumed in epoch N is permanently consumed globally: `UNUSED = false`.
- Partition may cause shard A to have consumed the nonce while shard B has not observed it.
- On heal: shard B learns of consumption via anti-entropy from #1347.
- Shard B's in-flight authority using that nonce: `PARTITION_SUSPENDED → NULL` on heal.
- Shard B cannot claim the authority was never used because it did not see the consumption.
- No replay restoration under any epoch transition.
- Failure class: **replay convergence failure**.

### Revocation Observed in One Epoch but Not Another

- Revocation in shard A must propagate to shard B before shard B may claim `EPOCH_GLOBAL_AUTHORITATIVE` for any authority in that lineage.
- Shard B decisions against the revoked authority: `STALE_VISIBLE` until revocation propagates.
- `revocation_liveness_registry` (#1344) tracks per-shard propagation evidence.
- If revocation channel silent beyond staleness bound: `EPOCH_STALE_VISIBLE` for affected scope.
- Late-arriving revocation must downgrade prior `GLOBAL_VALID` decisions → `STALE_VISIBLE` or `NULL`. Never silent preservation.
- Emit immutable downgrade proof event.

### Reconciliation Settlement Crosses Epoch Boundary

- Settlement outcome `AMBIGUOUS_REQUIRES_EPOCH` from #1348: epoch boundary must be resolved before settlement can proceed.
- If epoch N closes and settlement did not complete within epoch N: settlement deferred to epoch N+1 only if continuity lineage carries through and replay frontier is respected.
- Decision cannot be re-evaluated in epoch N+1 as if epoch N never existed.
- Causal clock index of the decision must fall within the settled epoch's causal frontier.
- If causal ordering is ambiguous across epoch boundary: `AMBIGUOUS` until epoch tie-break resolved.
- Replay nonces consumed in epoch N are permanently consumed regardless of settlement deferral.

---

## 7. Failure-Class Mapping

| Epoch Failure Mode | Canonical Failure Class | Terminal Routing |
|---|---|---|
| Competing epoch heads unresolved | Split-brain legitimacy | `AMBIGUOUS → NULL` (no execution) |
| Stale epoch majority attested | Stale lineage propagation | `EPOCH_STALE_VISIBLE → no GLOBAL_VALID` |
| Replay nonce consumed in epoch N, unseen in epoch N+k | Replay convergence failure | `NULL` for unseen-side authority |
| Registry reconciliation crosses epoch boundary without tie-break | Reconciliation divergence | `AMBIGUOUS_REQUIRES_EPOCH → deferred` |
| Causal ordering ambiguous across epoch transition | Causal ordering ambiguity | `AMBIGUOUS → no finality` |
| Epoch quorum disagrees on canonical epoch head | Partition-finality disagreement | `EPOCH_PARTITION_SUSPENDED → fail-closed` |
| Proof issued under revoked epoch | Detached proof lineage | `STALE_VISIBLE → downgrade event` |
| Local epoch accepted as global authority | Local/global legitimacy mismatch | `EPOCH_LOCAL → no GLOBAL_VALID` |
| Epoch visibility partial: some topology nodes unseen | Topology invisibility | `EPOCH_PARTITION_SUSPENDED` until topology restored |
| Authority issued under expired or stale epoch | Orphan authority drift | `NULL` or `STALE_VISIBLE` per predicate state |

---

## 8. Issue Decomposition (Candidate GitHub Issues — Text Only, Do Not Create)

### Issue G: Define Globally Authoritative Epoch Substrate Semantics

**Title:** Define globally authoritative epoch substrate: epoch object model, state machine, and predicate bindings

**Purpose:** Establish the formal semantic definition of what an epoch is in MindShift — its authoritative structure, canonical states, lifecycle, and binding to the existing legitimacy predicate set. Foundational spec that all downstream epoch-bound issues depend on.

**Scope:** Epoch object model (all 11 fields); canonical epoch state machine (9 states + transitions); binding of epoch to existing predicates `VALID ∧ ... ∧ RECONCILABLE`; spec artifact only.

**Non-goals:** Does not create runtime authority. Does not add D1 migrations. Does not modify existing canonical chain. Does not implement quorum consensus.

**Dependencies:** #1340, #1342, #1343, #1344, #1345, #1346, #1347, #1348 (upstream semantic prerequisites); `PARTITION_FINALITY_SEMANTICS.md`; `docs/analysis/governance-epoch-canon-analysis.md` (existing gap analysis).

**Affected invariants:** All nine base predicates. `EPOCH_VALID` is additive — does not replace existing predicates. `previously_valid != currently_valid` from `temporal_governance_rules.json`.

**Acceptance criteria:** Epoch object model is formally defined with all 11 fields. State machine covers all 9 states with deterministic transitions. Epoch binds to `VALID/NULL` gate additively (no replacement). NULL conditions for `EPOCH_VALID` are exhaustively enumerated. Spec explicitly states `epoch observation ≠ epoch authority`.

**NULL conditions:** No epoch defined for scope → NULL. Any non-`EPOCH_GLOBAL_AUTHORITATIVE` state → NULL for global claims. Missing quorum attestation → NULL.

---

### Issue H: Define EPOCH_VALID, CONVERGENCE_VALID, and SETTLEMENT_VALID Predicate Semantics

**Title:** Define EPOCH_VALID, CONVERGENCE_VALID, and SETTLEMENT_VALID predicate semantics, evidence requirements, and NULL routing

**Purpose:** Formally specify the three new distributed legitimacy predicates that extend the base invariant for distributed finality. Complete evidence requirements, invalidating conditions, topology thresholds, replay dependencies, reconciliation dependencies, and NULL routing.

**Scope:** Full predicate specification for all three predicates. Coupling to #1340 and #1345. Spec artifact only.

**Non-goals:** Does not implement predicate evaluation logic. Does not add D1 migrations. Does not widen validator authority surface.

**Dependencies:** Issue G (epoch substrate definition); #1340–#1348; `PARTITION_FINALITY_SEMANTICS.md`.

**Affected invariants:** Extended canonical invariant: `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE ∧ EPOCH_VALID ∧ CONVERGENCE_VALID ∧ SETTLEMENT_VALID else NULL`.

**Acceptance criteria:** Three complete predicate specifications with required-evidence lists, invalidating-evidence lists, and NULL routing. Predicate hierarchy explicit: `SETTLEMENT_VALID ⊃ CONVERGENCE_VALID ⊃ EPOCH_VALID ⊃ base invariant`. `PROOF_LOCAL_FINAL` cannot satisfy `SETTLEMENT_VALID`.

**NULL conditions:** See predicate NULL conditions in Section 5.

---

### Issue I: Define Epoch-Bound Replay Convergence Semantics

**Title:** Epoch-bound replay convergence: nonce non-transferability across epochs, anti-entropy rules, and cross-epoch replay NULL routing

**Purpose:** Specify that replay eligibility is permanently bound to the epoch in which a nonce was consumed, and that anti-entropy never restores replay eligibility across epoch boundaries.

**Scope:** Nonce non-transferability rule; epoch replay frontier semantics; anti-entropy rules that preserve consumed state; cross-partition replay convergence under epoch disagreement; epoch-transition replay audit procedure; spec artifact only.

**Non-goals:** Does not implement anti-entropy runtime. Does not modify `invocation_nonce` schema. Does not restore replay eligibility under any condition.

**Dependencies:** Issue G (epoch substrate); #1347 (distributed replay convergence semantics); #1346 (causal clock coupling for nonce ordering).

**Affected invariants:** `REPLAY_SAFE` predicate globally. `UNUSED` predicate under epoch transition. `replay_neutral_reconciliation` from #1348.

**Acceptance criteria:** Every cross-epoch replay scenario maps deterministically to `NULL` or `PARTITION_SUSPENDED`. Consumed nonce is permanently consumed regardless of epoch transition. Anti-entropy cannot unconsume nonce. Stale proof reuse in different epoch → `STALE_VISIBLE|NULL`.

**NULL conditions:** Nonce consumed in any epoch for same authority object → `UNUSED=false` permanently → NULL for re-use.

---

### Issue J: Define Epoch-Bound Reconciliation Settlement Semantics

**Title:** Epoch-bound reconciliation settlement: epoch boundary merge rules, settlement deferral, and AMBIGUOUS_REQUIRES_EPOCH resolution

**Purpose:** Specify how reconciliation settlement interacts with epoch boundaries — when settlement defers to a successor epoch, when it must classify as NULL, and how the `AMBIGUOUS_REQUIRES_EPOCH` outcome from #1348 is resolved.

**Scope:** Epoch boundary merge rules; settlement deferral criteria; causal frontier enforcement across epochs; successor epoch continuity requirements; spec artifact only.

**Non-goals:** Does not implement reconciliation engine. Does not create settlement authority. Reconciliation cannot authorize execution.

**Dependencies:** Issue G (epoch substrate); Issue H (`SETTLEMENT_VALID` predicate); #1348 (reconciliation determinism).

**Affected invariants:** `RECONCILABLE` predicate. `all persisted lineage must remain recursively reconcilable`. `SETTLEMENT_VALID` predicate.

**Acceptance criteria:** Every `AMBIGUOUS_REQUIRES_EPOCH` outcome has a deterministic resolution path or routes to NULL. Settlement deferral to successor epoch preserves all causal ordering and replay constraints. Causal clock index of deferred decision must fall within successor epoch's causal frontier.

**NULL conditions:** Epoch boundary ambiguous for decision → NULL until epoch tie-break resolved. Causal ordering ambiguous across epoch boundary → NULL.

---

### Issue K: Define Epoch Fork and Stale Majority Failure Canon

**Title:** Epoch fork and stale epoch majority failure canon: detection, tie-break, downgrade, and NULL routing

**Purpose:** Formally specify the canonical failure taxonomy for epoch-specific failure modes — epoch forks, stale epoch majority, epoch revocation — and their deterministic mapping to epoch states and required downgrade events. Integrates with #1194 distributed legitimacy failure canon.

**Scope:** Epoch fork detection criteria; stale majority definition and staleness threshold; tie-break ordering for epoch conflict resolution; downgrade event requirements; integration with #1194 taxonomy as `FAIL.DIST.EPOCH.*` identifiers; spec artifact only.

**Non-goals:** Does not implement fork detection runtime. Does not modify quorum consensus. No new authority created from fork resolution.

**Dependencies:** Issue G (epoch substrate state machine); #1342 (conflict set registry); #1343 (quorum attestation); #1194 (distributed legitimacy failure canon v1).

**Affected invariants:** Monotonicity of `EPOCH_GLOBAL_AUTHORITATIVE`. Downgrade immutability rule. `previously_valid != currently_valid`.

**Acceptance criteria:** Fork maps deterministically to `EPOCH_CONFLICTED` → tie-break → winner `EPOCH_GLOBAL_AUTHORITATIVE`, loser `EPOCH_NULL`. Stale epoch majority maps to `EPOCH_STALE_VISIBLE`. Every downgrade emits immutable proof event. Failure modes integrate into #1194 taxonomy as `FAIL.DIST.EPOCH.*` identifiers.

**NULL conditions:** Epoch fork with no resolvable tie-break → `EPOCH_AMBIGUOUS` → NULL for all decisions in scope.

---

### Issue L: Define Epoch Substrate Conformance Vectors for FATE

**Title:** Epoch substrate conformance test vectors for FATE: EPOCH_VALID paths, fork scenarios, stale majority, cross-epoch replay, settlement deferral

**Purpose:** Produce deterministic test vectors covering epoch substrate failure modes and predicate evaluation paths so the FATE suite can verify epoch-bound behavior without runtime mutation.

**Scope:** Vectors for: `EPOCH_VALID` true/false paths; epoch fork detection and tie-break; stale epoch majority → `EPOCH_STALE_VISIBLE`; cross-epoch replay nonce reuse → NULL; settlement deferral with causal frontier enforcement; partition healing with epoch re-evaluation; spec artifact only.

**Non-goals:** Does not implement test harness. Does not create new FATE test files. Does not modify existing passing tests.

**Dependencies:** Issues G, H, I, J, K (all epoch semantic issues); existing FATE suite patterns in `tests/fate/`.

**Affected invariants:** All epoch predicate invariants. Replay-neutral reconciliation. Downgrade immutability.

**Acceptance criteria:** At minimum 12 deterministic test vectors covering canonical epoch failure modes. Each vector specifies input predicate state, expected classification output, and expected NULL routing. All vectors are deterministic and non-operative.

---

## 9. Implementation Readiness Determination

**Status: NOT READY for epoch substrate implementation. READY FOR SPEC-ONLY PR.**

**Rationale:**

All eight upstream prerequisites (#1340–#1348) remain `OPEN | PLANNING ARTIFACT (Non-operative)`. No prerequisite registry exists in D1. The epoch substrate additionally has no:
- D1 persistence surface (`epoch_registry` table does not exist)
- Constitutional gate enforcement (`EPOCH_VALID` absent from execution gate — confirmed by `docs/analysis/governance-epoch-canon-analysis.md`)
- Canonical state machine in runtime
- `continuity_epoch` column on `continuity_registry` (identified as minimum required in epoch canon analysis)

The spec-only layer (Issues G–L above) can be produced as analysis artifacts and planning documents, following the same non-operative pattern established by #1340–#1348. These spec artifacts constitute the semantic closure prerequisite for future bounded implementation.

**When implementation becomes eligible:** After Issues G–L are accepted as spec PRs AND #1340–#1344 registry migrations are implemented AND #1345 validator extension is implemented AND #1346–#1348 formalizations are accepted.

---

## 10. Highest-Leverage Next Action

**Update #1332 freeze-state exit queue with epoch substrate dependency** — specifically, add Issues G through L as the next dependency layer in the #1332 freeze-state exit queue, positioned after #1340–#1348, to make the epoch substrate a formal dependency of convergence finality closure and ensure the freeze-state artifact reflects the full semantic prerequisite graph before any implementation resumes.

---

## NULL Conditions Summary

Planning must return NULL instead of recommending epoch-related implementation when:

1. **#1340–#1348 not yet semantically closed** — epoch substrate depends on all eight upstream prerequisites
2. **No epoch defined for scope** — cannot evaluate `EPOCH_VALID`
3. **`EPOCH_NULL`, `EPOCH_REVOKED`, or `EPOCH_AMBIGUOUS`** — NULL for all decisions requiring `EPOCH_VALID`
4. **`EPOCH_PARTITION_SUSPENDED`** — fail-closed; never implicit pass
5. **Missing quorum attestation** — NULL for global claims
6. **Epoch fork with no resolvable tie-break** — `EPOCH_AMBIGUOUS` → NULL in scope
7. **Stale epoch majority beyond staleness horizon** — `EPOCH_STALE_VISIBLE` → no `GLOBAL_VALID`
8. **Cross-epoch replay nonce reuse** — `UNUSED=false` permanently → NULL
9. **`AMBIGUOUS_REQUIRES_EPOCH` without tie-break** → NULL until epoch boundary resolved
10. **Local epoch accepted as global authority** — `EPOCH_LOCAL` cannot support `GLOBAL_VALID`

---

```
Planning result:
The epoch substrate is entirely unoperationalized — existing only as a numeric view label
with no D1 persistence, no constitutional gate enforcement, and no formal predicate
definition — making EPOCH_VALID, CONVERGENCE_VALID, and SETTLEMENT_VALID unevaluable
until the full #1340–#1348 queue closes and six epoch-specific spec issues (G–L) are
accepted.

Next highest-leverage non-operative action:
Update #1332 freeze-state exit queue to register Issues G–L as the epoch substrate
dependency layer, making the temporal convergence frontier formally visible as the
next sequenced closure target after partition-finality operationalization.

Execution eligibility:
NULL unless separately authorized through valid MindShift authority lineage.
```
