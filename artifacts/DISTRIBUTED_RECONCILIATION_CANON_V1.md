# Distributed Reconciliation Canon v1

**Layer:** Distributed Legitimacy → Reconciliation → Topology Intelligence  
**Status:** Non-Operative (observational + analytical only)  
**Execution Posture:** Fail-closed, deterministic NULL semantics preserved

---

## 1. Canonical Reconciliation Principle

Distributed legitimacy converges only when every candidate execution object can be reconstructed into a single deterministic lineage view that satisfies:

`VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`

If any conjunct is unresolved, contradicted, stale, or non-visible under the current topology, canonical outcome is:

`NULL`

Reconciliation is therefore an **evidence-reduction process**, not an authority-creation process. It cannot mint authority, cannot imply execution permission, and cannot upgrade observability into legitimacy.

---

## 2. Canonical Traversal Graph

Canonical distributed traversal ordering for legitimacy reconstruction:

1. `intent` reference set (immutable proposal evidence)
2. authority bind set
3. ATAO derivation lineage
4. AEO canonicalized object lineage
5. validation decision lineage
6. execution-boundary attempt lineage
7. proof persistence lineage
8. continuity lineage (parent/child/revocation/supersession evidence)
9. reconciliation snapshots (cross-registry views)
10. topology visibility envelope (who could observe what, when)

Deterministic traversal rule:
- Traverse by `(lineage_depth, causal_time, object_hash, registry_id)` stable ordering.
- Ties are broken by canonical hash order only.
- Any cycle, missing parent, or non-deterministic edge ordering returns `RECONCILIABLE = false` → `NULL`.

---

## 3. Distributed Reconciliation Lifecycle

1. **Ingest**: collect immutable evidence slices from registries and validators.
2. **Normalize**: canonicalize object encodings and hash material.
3. **Lineage Stitching**: reconstruct parent/child/supersession/revocation edges.
4. **Topology Projection**: model visibility per zone, replica, and partition interval.
5. **Conflict Detection**: detect contradictory status, replay usage, epoch disagreement.
6. **Deterministic Merge**: apply merge lattice (Section 10).
7. **Convergence Classification**: classify state (Section 4).
8. **Continuity Restoration Attempt**: only via deterministic evidence completion.
9. **Fail-Closed Resolution**: unresolved ambiguity remains non-operative (`NULL/BLOCKED/QUARANTINED`).
10. **Append-Only Recording**: persist reconciliation evidence; never rewrite history.

---

## 4. Distributed Legitimacy States

Canonical state machine (analysis-only semantics):

- `UNSEEN`: evidence not yet visible
- `PARTIAL_VISIBLE`: some required evidence visible
- `TOPOLOGY_STALE`: visible but stale against newer lineage
- `CONFLICTED`: contradictory legitimacy claims
- `REPLAY_SUSPECT`: potential duplicate authority/object usage
- `RECONCILING`: deterministic merge in progress
- `RECONCILED_NULL`: deterministic fail-closed outcome
- `RECONCILED_VALID_NONEXEC`: legitimacy converged but not executable by this layer
- `QUARANTINED`: high-risk inconsistency requiring bounded escalation

Rule: reconciliation can move an object to a *classification*, never directly to runtime execution permission.

---

## 5. Failure Classification Matrix

| Failure Class | Trigger Condition | Deterministic Class | Canonical Output |
|---|---|---|---|
| split-brain legitimacy | disjoint registries each claim validity with incompatible lineage roots | `CONFLICTED` | `QUARANTINED` |
| orphan authority drift | authority has no recursively valid continuity parent | `CONFLICTED` | `NULL` |
| replay convergence failure | replay-safe result differs across visibility domains | `REPLAY_SUSPECT` | `BLOCKED` |
| stale lineage propagation | stale branch continues producing derived objects | `TOPOLOGY_STALE` | `NULL` |
| reconciliation divergence | deterministic merge yields non-identical outputs across nodes | `CONFLICTED` | `QUARANTINED` |
| detached proof lineage | proof exists but cannot bind to validated/executed object equality | `CONFLICTED` | `INVALID` |
| partition-finality disagreement | partitioned zones infer different finality classes | `CONFLICTED` | `BLOCKED` |
| causal legitimacy ambiguity | causal precedence cannot be established deterministically | `CONFLICTED` | `NULL` |
| topology visibility collapse | required topology observations unavailable/untrustworthy | `PARTIAL_VISIBLE` | `BLOCKED` |
| distributed replay resurrection | previously consumed legitimacy appears reusable on stale branch | `REPLAY_SUSPECT` | `QUARANTINED` |

---

## 6. Partition-Safe Legitimacy Rules

1. **No visibility, no legitimacy**: absence of required topology evidence forbids positive legitimacy assertion.
2. **Partition pessimism**: if partitions disagree, classify to least permissive shared outcome.
3. **No inferred finality**: proof presence does not imply global finality under partition.
4. **No authority from locality**: local VALID does not upgrade to distributed legitimacy.
5. **Recovery requires monotonic evidence**: restored links must add evidence, never overwrite prior lineage.
6. **Conflict persistence is legal**: unresolved split state remains blocked until deterministic resolver inputs arrive.

---

## 7. Replay Convergence Semantics

Replay convergence requires equivalence across domains for the tuple:

`(authority_identity, validated_object_hash, execution_surface, replay_nonce_scope, continuity_epoch)`

Canonical replay rules:

- **Reuse detection**: any repeated tuple with incompatible nonce/epoch is replay unsafe.
- **Consumptive monotonicity**: once consumed anywhere with canonical proof binding, eligible status can only decrease (never increase).
- **Resurrection ban**: stale replicas cannot reauthorize consumed tuple; classify as distributed replay resurrection.
- **Equivalence closure**: transformed encodings that canonicalize to same hash are replay-equivalent.
- **Ambiguous consumption**: if consumption proof is detached or topology-invisible, outcome is `BLOCKED`, not valid.

---

## 8. Cross-Registry Reconciliation Semantics

Cross-registry reconciliation operates on append-only evidence joins:

- continuity registry
- authority registry
- validation lineage registry
- execution/proof registries
- topology observation registry

Join constraints:

1. lineage must be recursively reconstructable from roots.
2. every edge must be hash-verifiable or signature-verifiable.
3. any missing mandatory edge yields `RECONCILABLE = false`.
4. reconciliation records are snapshots, not mutation directives.
5. backfill may add missing historical evidence but may not alter prior event meaning.

---

## 9. Topology Visibility Requirements

A legitimacy claim is topology-visible only if:

- visibility domain set is explicitly enumerated.
- observation timestamps are causally orderable.
- partition intervals are recorded.
- stale horizon is bounded (known maximum staleness window).
- observer trust class is policy-valid for that claim type.
- hidden/unknown domains are represented as uncertainty, not ignored.

Minimum topology evidence envelope:

`{observer_id, domain_id, observed_hash, observed_status, observed_at, causal_anchor, partition_context}`

Without this envelope, `TOPOLOGY_VISIBLE = false`.

---

## 10. Deterministic Convergence Conditions

Convergence is canonical only when all conditions hold:

1. Canonical object identity agreement across registries.
2. Recursive continuity lineage closure.
3. Authority derivation closure (no orphan authority).
4. `validated_object == executed_object` proof-bounded equality.
5. Replay consumption monotonicity agreement.
6. Policy-valid scope agreement.
7. Topology visibility sufficiency.
8. Deterministic merge reproducibility.

Deterministic merge lattice (least permissive wins):

`VALID > RECONCILED_VALID_NONEXEC > RECONCILED_NULL > BLOCKED > INVALID > QUARANTINED`

When nodes disagree, select greatest lower bound in this lattice.

---

## 11. Reconciliation Failure Modes

- **Merge Non-Determinism**: input ordering ambiguity causes divergent outputs.
- **Lineage Hole**: missing parent/supersession/revocation edge.
- **Hash Alias Instability**: non-canonical serialization produces false divergence.
- **Epoch Skew**: continuity epochs incomparable across domains.
- **Visibility Mirage**: apparent majority excludes dark/stale zones.
- **Proof Drift**: proof object exists but binding tuple incomplete.
- **Replay Shadowing**: replay blocked in one domain, unseen in another.
- **Policy Version Drift**: policy-validity computed under inconsistent policy snapshots.

All failure modes are non-operative and fail closed.

---

## 12. Canonical Distributed Invariants

1. If no valid object exists → nothing happens.
2. `validated_object == executed_object` is mandatory wherever execution evidence exists.
3. No valid continuity lineage → no valid authority → no valid execution.
4. Persisted legitimacy lineage remains recursively reconcilable.
5. Local correctness does not imply distributed legitimacy coherence.
6. Visibility does not imply authority.
7. Reconciliation does not imply convergence.
8. Proof does not imply finality.
9. Capability does not imply authority.
10. Any unresolved distributed ambiguity yields deterministic non-operative output.

---

## 13. Open Frontier Gaps

1. Canonical partition-finality model not yet closed.
2. Cross-domain epoch harmonization semantics incomplete.
3. Deterministic supersession precedence under concurrent forks unresolved.
4. Replay death-boundary federation semantics incomplete.
5. Observer trust weighting canon under adversarial topology unresolved.
6. Deterministic causal tie-breaking under clock uncertainty incomplete.
7. Distributed proof compaction while preserving append-only lineage unresolved.
8. Reconciliation telemetry standardization for independent validator reproducibility incomplete.

---

## 14. Recommended Canonical Next Layers

1. **Partition-Finality Canon**: formal finality classes under partition and merge.
2. **Replay Tombstone Federation Canon**: distributed replay death propagation semantics.
3. **Lineage Supersession Canon**: fork arbitration and precedence determinism.
4. **Topology Trust Canon**: observer classes, trust attenuation, adversarial handling.
5. **Causal Ordering Canon**: deterministic ordering under uncertain clocks.
6. **Reconciliation Evidence Canon**: standard append-only snapshot schema.
7. **Convergence Test Vector Canon**: deterministic, replay-safe distributed fixtures.
8. **Fail-Closed Runtime Interface Canon**: explicit non-operative handoff contract from reconciliation layer to execution boundary.

This document is intentionally non-operative and does not create authority, execution permission, or deployment capability.
