# MindShift Distributed Partition-Finality Semantics

## Scope and non-goals

This specification defines **formal partition-finality semantics** for distributed legitimacy convergence in MindShift.

It is explicitly bounded to:
- legitimacy classification semantics
- fail-closed convergence behavior
- split-brain and reconciliation outcomes
- proof finality under partial visibility

It does **not** introduce runtime mutation paths, authority widening, execution automation, or validator bypass.

---

## 1) Partition-finality state machine

### 1.1 State set

Terminal classification outcomes for any attempted legitimacy decision:

- `LOCAL_VALID`
- `GLOBAL_VALID`
- `AMBIGUOUS`
- `STALE_VISIBLE`
- `PARTITION_SUSPENDED`
- `NULL`

### 1.2 Required predicates

Let:

- `V` = `VALID`
- `A` = `AUTHORIZED`
- `U` = `UNUSED`
- `P` = `POLICY_VALID`
- `R` = `REPLAY_SAFE`
- `T` = `TOPOLOGY_VISIBLE`
- `C` = `RECONCILABLE`
- `Q` = quorum condition satisfied for the configured federation profile
- `G` = global registry convergence evidence present
- `L` = lineage freshness within allowed staleness horizon
- `X` = conflict-free registry view (no unresolved competing canonical head)

Base invariant remains:

`V ∧ A ∧ U ∧ P ∧ R ∧ T ∧ C` else `NULL`.

Distributed-finality extends this with `Q ∧ G ∧ L ∧ X` to reach `GLOBAL_VALID`.

### 1.3 Transition rules

From proposal/validation attempt:

1. If `¬V ∨ ¬A ∨ ¬U ∨ ¬P ∨ ¬R` → `NULL`.
2. Else if `¬T` and partition evidence exists → `PARTITION_SUSPENDED`.
3. Else if `T ∧ V ∧ A ∧ U ∧ P ∧ R ∧ C` and (`¬Q ∨ ¬G ∨ ¬X`) → `LOCAL_VALID` only if local domain policy allows bounded local acceptance; otherwise `AMBIGUOUS`.
4. Else if lineage is visible but stale (`¬L` with evidence) → `STALE_VISIBLE`.
5. Else if `V ∧ A ∧ U ∧ P ∧ R ∧ T ∧ C ∧ Q ∧ G ∧ L ∧ X` → `GLOBAL_VALID`.
6. At any point unresolved contradictory proof/lineage claims force `AMBIGUOUS`.

### 1.4 Monotonicity constraints

- `GLOBAL_VALID` is monotonic only while no later revocation/reorg evidence invalidates `L`, `X`, or `C`.
- `LOCAL_VALID` is **non-terminal globally** and must be upgradable/downgradable on reconciliation.
- `PARTITION_SUSPENDED`, `AMBIGUOUS`, and `STALE_VISIBLE` are fail-closed and non-executable for global side effects.

---

## 2) When local legitimacy is insufficient

`LOCAL_VALID` is insufficient whenever **any** of these hold:

1. Federation policy requires multi-domain quorum for execution class.
2. Registry head cannot be proven unique beyond local partition.
3. Revocation channels are delayed beyond policy freshness bounds.
4. Conflicting authority lineage exists in another visible shard/federate.
5. Replay pressure indicates concurrent claim attempts against same authority object.
6. Proof arrival is incomplete for mandatory predecessor edges in recursive lineage.

In all such cases: no global finality; execution must remain blocked or scoped to non-global side effects by policy.

---

## 3) When global legitimacy may be accepted

`GLOBAL_VALID` is acceptable only if:

1. Canonical validity predicates hold (`V,A,U,P,R,T,C`).
2. Quorum threshold satisfied (`Q`) for configured federation mode (e.g., 2/3 weighted, unanimous for high-risk classes).
3. Global convergence evidence (`G`) proves same canonical object hash and lineage head across quorum set.
4. No unresolved competing head (`X`).
5. Freshness and revocation horizon satisfied (`L`).
6. Proof envelope is complete enough to verify transitive reconciliability of lineage.

If any condition drops post-fact, classification must degrade deterministically (`GLOBAL_VALID → AMBIGUOUS` or `STALE_VISIBLE` or `NULL`).

---

## 4) Split-brain collapse rules

When split-brain detected (multiple competing canonical heads for same authority/execution lineage scope):

1. Freeze new global finalization in affected scope.
2. Classify competing branches as `AMBIGUOUS` unless one branch is cryptographically/causally dominated by policy-defined tie-break.
3. Allowed deterministic collapse tie-break sequence:
   - highest reconciliability score (max verified ancestry coverage)
   - strongest quorum weight
   - earliest authoritative commit timestamp with signed clock domain attestation
   - lexicographic hash tie-break as last resort
4. Losing branches become `NULL` for execution purposes but remain append-only as historical evidence.
5. Any prior `LOCAL_VALID` depending on losing branch degrades to `NULL` or `STALE_VISIBLE` per visibility of replacement lineage.

---

## 5) Stale lineage suspension rules

A lineage is `STALE_VISIBLE` when visible but outside freshness/revocation confidence bounds.

Rules:

1. Staleness alone does not imply invalid history; it implies insufficient confidence for finality.
2. `STALE_VISIBLE` blocks progression to `GLOBAL_VALID`.
3. If staleness coexists with active partition uncertainty, prefer `PARTITION_SUSPENDED`.
4. If stale lineage later reconciles with conflict-free fresh head, reclassify via normal state machine.
5. If stale lineage is superseded by revocation, degrade directly to `NULL`.

---

## 6) Proof finality under partial visibility

Proof finality classes:

- `PROOF_LOCAL_FINAL`: proof valid locally, insufficient federation visibility.
- `PROOF_GLOBAL_FINAL`: proof validated against quorum-visible converged lineage.
- `PROOF_CONTINGENT`: proof structurally valid but topology/revocation uncertainty unresolved.

Mapping to legitimacy outcomes:

- `PROOF_GLOBAL_FINAL` can support `GLOBAL_VALID` (with full predicates).
- `PROOF_LOCAL_FINAL` supports at most `LOCAL_VALID`.
- `PROOF_CONTINGENT` maps to `AMBIGUOUS` or `PARTITION_SUSPENDED` depending on partition evidence.

Asynchronous proof arrival rule:

- Late-arriving proof may upgrade `AMBIGUOUS/LOCAL_VALID` to `GLOBAL_VALID` only if it does not violate `UNUSED` and replay constraints.
- Late-arriving revocation proof must downgrade deterministically, never silently preserve prior global status.

---

## 7) Quorum/federation legitimacy requirements

Define federation policy profiles per execution risk class:

1. **Local-only profile**: allows `LOCAL_VALID` side effects strictly within local containment boundary.
2. **Federated standard profile**: requires weighted quorum + cross-domain convergence.
3. **High-assurance profile**: requires stronger quorum, lower staleness tolerance, mandatory revocation channel liveness proofs.

Each profile must specify:

- quorum math and weights
- maximum lineage age
- required topology visibility set
- minimum proof edge completeness
- downgrade behavior when liveness degrades

---

## 8) Reconciliation after partition healing

Post-healing deterministic reconciliation procedure:

1. Merge observed registries into append-only candidate graph.
2. Recompute canonical head per governed scope using split-brain tie-break rules.
3. Re-evaluate all non-global states (`LOCAL_VALID`, `AMBIGUOUS`, `STALE_VISIBLE`, `PARTITION_SUSPENDED`).
4. Promote to `GLOBAL_VALID` only where full predicates now hold.
5. Emit reconciliation proofs linking pre-heal and post-heal classifications.
6. Persist downgrade/upgrade events as immutable lineage transitions.

No destructive rewrite of history: only additive evidence and state-transition records.

---

## 9) Missing runtime objects / registry fields

To operationalize semantics, add or confirm these objects/fields (issue-ready targets):

1. **Partition epoch object**
   - `partition_epoch_id`
   - `scope`
   - `detected_at`
   - `resolved_at`
   - `visibility_bitmap`

2. **Finality classification record**
   - `object_hash`
   - `classification` (`LOCAL_VALID|GLOBAL_VALID|AMBIGUOUS|STALE_VISIBLE|PARTITION_SUSPENDED|NULL`)
   - `predicate_snapshot` (serialized V/A/U/P/R/T/C/Q/G/L/X)
   - `decided_at`
   - `supersedes_decision_id`

3. **Quorum attestation envelope**
   - `federation_profile_id`
   - `member_attestations[]`
   - `weight_total`
   - `weight_approved`
   - `quorum_met`

4. **Revocation liveness evidence**
   - `channel_id`
   - `last_observed_at`
   - `max_allowed_silence_ms`
   - `within_sla`

5. **Conflict set registry**
   - `conflict_set_id`
   - `lineage_scope`
   - `competing_heads[]`
   - `collapse_rule_applied`
   - `winner_head_hash`

6. **Proof finality envelope extensions**
   - `proof_visibility_scope`
   - `proof_finality_class`
   - `proof_arrival_order_index`
   - `reconciliation_dependency_ids[]`

---

## 10) Runtime invariant additions

Additive invariants (without weakening canonical ones):

1. `GLOBAL_VALID ⇒ LOCAL_VALID predicates true at decision time`.
2. `GLOBAL_VALID ⇒ Q ∧ G ∧ L ∧ X`.
3. `PARTITION_SUSPENDED ⇒ ¬T or topology confidence below policy threshold`.
4. `STALE_VISIBLE ⇒ lineage visible ∧ freshness violated`.
5. `AMBIGUOUS ⇒ at least one unresolved competing legitimacy claim`.
6. `Any downgrade from GLOBAL_VALID must emit immutable downgrade proof event`.
7. `No execution classification may skip NULL on hard predicate failure`.
8. `Reconciliation must be replay-neutral: previously consumed authority remains consumed`.

---

## 11) Validator boundary implications

Validator must remain fail-closed and bounded:

1. Distinguish structural validity from distributed finality.
2. Return deterministic classification evidence for non-final states.
3. Forbid execution escalation from observability-only signals.
4. Require explicit federation profile selection for global claims.
5. Treat missing topology data as insufficiency (`PARTITION_SUSPENDED` or `AMBIGUOUS`), never implicit pass.

No widening of authority surface is required; only classification enrichment and gating strictness.

---

## 12) Failure taxonomy

1. **Topology failures**: partition, asymmetric visibility, stale peer map.
2. **Lineage failures**: stale head, orphan branch, non-reconcilable ancestry.
3. **Authority failures**: revoked authority not yet propagated, duplicate consumption.
4. **Proof failures**: delayed proof, contradictory proof, incomplete proof DAG.
5. **Consensus failures**: quorum below threshold, conflicting weighted majorities.
6. **Policy failures**: profile mismatch, stale tolerance breach, scope mismatch.
7. **Replay pressure failures**: concurrent reuse attempts, duplicate execution intent.

Each failure class must map deterministically to one of:
`NULL`, `PARTITION_SUSPENDED`, `STALE_VISIBLE`, or `AMBIGUOUS`.

---

## 13) Issue-ready implementation plan (analysis only)

1. **Spec artifact issue**
   - Add `partition_finality_semantics.md` into governance docs.
   - Define formal predicate table and transition matrix.

2. **Data model issue**
   - Add finality classification registry and conflict-set registry migration.
   - Add quorum attestation and revocation liveness fields.

3. **Validator issue**
   - Extend validation output to include partition-finality classification + predicate snapshot.
   - Preserve existing `VALID/NULL` core semantics; add classification layer, not replacement.

4. **Proof issue**
   - Extend proof schema with local/global/contingent finality class and visibility scope.
   - Add deterministic downgrade/upgrade proof events.

5. **Reconciliation issue**
   - Implement partition-heal reconciliation job/procedure as append-only transition emitter.
   - Enforce split-brain collapse tie-break ordering.

6. **Policy issue**
   - Introduce federation profiles and risk-class mapping.
   - Document quorum/staleness thresholds and downgrade actions.

7. **Conformance issue**
   - Add deterministic conformance vectors for partition scenarios:
     - delayed revocation
     - asynchronous proof arrival
     - conflicting registries
     - partial topology visibility

8. **Observability issue**
   - Add read-only endpoints/telemetry for classification state and reconciliation evidence.
   - Ensure observability remains non-authoritative and non-mutating.

All issues should explicitly preserve canonical invariants:
- no valid object => no effect
- validated object equals executed object
- no continuity lineage => no authority => no execution
- recursively reconcilable persisted lineage
- fail-closed NULL on predicate failure

