# Distributed Governance Canon Analysis

**Branch:** `claude/continuity-epoch-legitimacy-93OvA`  
**Scope:** Canonical distributed governance frontier — structural analysis, closure classification, failure topology, and determinism gaps  
**Boundary:** Evidence-only. No authority created. No runtime mutated. No governance finalized. No execution authorized.

```
AI output is NEVER authority.
Governance proposal ≠ governance legitimacy.
Visibility ≠ governance authority.
Policy existence ≠ policy legitimacy.
Convergence ≠ governance finality.
Finality ≠ governance settlement.
```

---

## 1. Governance Frontier Summary

The distributed legitimacy runtime has established a well-formed canonical execution chain and an extensive observability substrate. Governance legitimacy is, however, not yet recursively self-contained. The frontier boundary lies at the intersection of four structural gaps:

1. **Governance objects are not epoch-bound.** Policy mutation, PREO issuance, and SCO application carry no `continuity_epoch` — the same gap identified in the epoch analysis propagates fully into the governance layer.

2. **Recursive governance enforcement is advisory, not required.** The ENFORCED_BOUNDARY_ROADMAP is at Stage 2 (advisory checks). Stage 3 (required status checks), Stage 4 (branch-protected enforcement), Stage 5 (runtime-boundary enforcement), and Stage 6 (non-bypassable enforcement) are all planned but not yet active.

3. **Governance settlement has no canonical object type.** Execution has proof. Governance has no equivalent — no `GovernanceSettlementObject`, no settlement lineage, no settlement proof.

4. **Distributed governance conflict resolution escalates to human review but has no conversion protocol.** `CONFLICT_REQUIRES_HUMAN_REVIEW` is a terminal classification state but the path from human review result back into a bounded governance object (required by INV-015) is not defined.

---

## 2. Established Governance Layers

### 2.1 Canonical Execution Chain Governance

**Closure State: CONTAINED**

The five-stage execution chain (`/session → /continuity → /authority → /compile → /validate → /execute → /proof`) is defined, classified, and enforcement-locked at the runtime level. Core invariants are schema-trigger-enforced:

- `trg_proof_registry_requires_valid_execution` — proof requires executed execution_id
- `trg_proof_registry_decision_hash_guard` — decision_hash integrity
- `UNIQUE(decision_id, validated_object_hash)` — object identity integrity
- Append-only triggers on all authoritative registries

Established invariants: `validated_object == executed_object`, nonce single-use, proof uniqueness, continuity revocation cascade.

**Failure conditions still open:** Epoch-stale authority exercise, stale reservation dead-lineage (see EC-05 from epoch analysis), pre-execution epoch equality check absent.

### 2.2 Observability/Authority Separation

**Closure State: CLOSED** (within defined scope)

`CONTROL_GRAPH_*_MODE = "observability_only"` is enforced across all control graph modules. The `GOVERNANCE_CONSENSUS_SPEC.json` explicitly states:

```json
"observer_agreement_authorizes_execution": false,
"federated_compatibility_inherits_authority": false
```

The `minimal_civilization_invariants.json` encodes INV-010: `visibility != authority`. The `legitimacy-conflict-arbitration.ts` module is boundary-enforced: it classifies but never overwrites legitimacy state.

**Failure conditions:** `OBSERVABILITY_TO_AUTHORITY_ESCALATION` drift class exists in the recursive governance taxonomy — the boundary is known but not yet machine-enforced at the branch-protection layer.

### 2.3 Append-Only Registry Governance

**Closure State: CONTAINED**

All authoritative registries have `BEFORE UPDATE / BEFORE DELETE` triggers raising `ABORT`. The `evidence_only = 'true'`, `mutation_capable = 'false'` CHECK constraints are schema-level. This prevents retroactive legitimacy rewriting.

**Remaining gap:** Append-only prevents deletion; it does not prevent a new forward record that semantically inverts a prior record (e.g., a new SCO reverting governance policy). This is governance semantic rollback via forward mutation — structurally permitted by append-only semantics.

### 2.4 Federation Evidence Containment

**Closure State: CONTAINED**

`FEDERATED_RECONCILIATION_SPEC.json` establishes:

```json
"remote_evidence_can_grant_legitimacy": false,
"remote_evidence_can_narrow_acceptance_only": true,
"local_validation_remains_mandatory": true
```

The federation boundary is declared: `portable_evidence_not_portable_authority`. The `federated_revocation_observability_registry` is append-only and observability-only. Federation routes are all GET (read-only).

**Remaining gap:** Federation evidence can narrow acceptance — the semantics of "narrowing" are not formally bounded. Under adversarial conditions, a federation partner could submit evidence that narrows acceptance to zero for a legitimate object, producing a denial-of-governance attack.

### 2.5 Fail-Closed Semantics

**Closure State: CLOSED** (within defined scope)

`fail_closed_on_ambiguity = true` is enforced across:
- `legitimacy_quarantine_registry`
- `migration_governance_registry`
- `governance_consensus_infrastructure` (required flag)
- Legitimacy conflict arbitration (NULL result on boundary violation)

Ambiguous governance states produce NULL, not probabilistic legitimacy.

---

## 3. Open Governance Frontiers

### 3.1 Governance Self-Mutation (GAP-005)

**Closure State: OPEN**

**Current state:** PREO and SCO objects exist as governance primitives. `governance_mutation_control.json` defines 11 mutation classes (GM-0 through GM-10). `constitutional_boundary.json` identifies constitutional paths requiring PREO + SCO + full FATE regression.

**Gap:** The recursive governance chain — governance changes requiring themselves to traverse the canonical execution chain before becoming effective — is defined in specification but not enforced by schema triggers or required status checks. The `ENFORCED_BOUNDARY_ROADMAP` Stage 3 (required status checks for governance mutations) is planned but not active.

**Consequence:** A GM-8 `EXECUTION_BOUNDARY_CHANGE` or GM-5 `CANONICALIZATION_CHANGE` can currently be merged without a PREO or SCO if branch protection is not yet enforcing required checks.

**Failure class:** `SELF_AUTHORIZATION_LOOP` (INV-011) — governance rules can currently be changed without going through governed legitimacy validation.

### 3.2 Governance Epoch Semantics

**Closure State: OPEN**

**Current state:** No `governance_epoch`, `policy_epoch`, or `schema_epoch` exists on any governance artifact. The same structural gap identified in the continuity epoch analysis applies here: governance mutations have no lineage-authoritative epoch binding.

**Gap:** A PREO issued under policy version N may be applied under policy version N+1 without detection. An SCO that changes canonicalization semantics carries no epoch anchor — the hash it commits is computed under the old semantics, but it may be applied when new semantics are active.

**Consequence:** Governance supersession is semantically defined (a new SCO supersedes an old one) but structurally undetectable — two SCOs cannot be ordered by their governance epoch because no governance epoch exists.

**Failure class:** `GOVERNANCE_LINEAGE_ORPHANED`, `GOVERNANCE_EQUIVALENCE_MISMATCH`.

### 3.3 Governance Settlement Authority

**Closure State: NULL**

**Current state:** No `GovernanceSettlementObject` type exists. No `governance_settlement_registry` table exists. No governance settlement proof is defined.

**Gap:** The canonical execution chain produces an execution proof: `proof_registry` records that a specific object was validated and executed under a specific authority lineage. There is no equivalent for governance changes: no record proves that a governance mutation (e.g., an SCO applying a canonicalization change) was:
- validly proposed
- validly reviewed (PREO)
- validly applied to the runtime
- finalized with proof of application

**Consequence:** Governance mutation finality cannot be proven. The lineage from "SCO proposed" to "SCO applied to production governance" has no proof object. This means governance change legitimacy cannot be recursively verified.

**Failure class:** `PROOFLESS_FINALITY` (INV-006 applied to governance layer).

### 3.4 Governance Partition-Finality

**Closure State: OPEN**

**Current state:** The consensus spec declares `observer_agreement_authorizes_execution: false`. The `GOVERNANCE_CONSENSUS_SPEC.json` routes are all read-only observer routes. No governance partition-finality protocol exists.

**Gap:** Under a network partition:
- Replica A (majority partition): continues operating with governance state at time T₀
- Replica B (minority partition): receives a governance change (SCO) at T₁ > T₀
- Partition heals at T₂

At T₂, replicas A and B have divergent governance state. No deterministic finality protocol exists to determine which governance state is authoritative. The `cross_registry_reconciliation_registry` has `containment_status IN ('RECONCILED', 'RECONCILIATION_REQUIRED')` but no `PARTITION_GOVERNANCE_CONFLICT` class.

**Consequence:** Post-partition governance state is undetermined. An execution authorized under Replica A's governance at T₀ may be invalid under Replica B's governance at T₁. If both executions occur, `validated_object == executed_object` may hold locally on each replica while the global governance legitimacy remains in conflict.

**Failure class:** `GOVERNANCE_CONSENSUS_FRAGMENTATION`, `TEMPORAL_SPLIT_BRAIN` (at governance layer).

### 3.5 Governance Rollback Impossibility

**Closure State: PARTIAL**

**Established:** Append-only registry triggers prevent deletion and update of governance records. A prior SCO cannot be deleted.

**Remaining gap:** Semantic rollback via forward mutation is not prevented. An SCO₂ can reverse the governance effects of SCO₁ by applying the inverse transformation. This is:
- Structurally valid (SCO₂ is a new append)
- Semantically a rollback of SCO₁
- Not distinguishable from forward governance evolution

No `GOVERNANCE_ROLLBACK_DETECTED` drift class exists. No monotonicity constraint on governance policy version exists. A governance epoch (missing — see 3.2) would provide the ordering primitive needed to detect semantic rollback.

**Failure class:** `REPLAY_SEMANTICS_DRIFT` at governance layer.

### 3.6 Distributed Policy Arbitration

**Closure State: OPEN**

**Current state:** `legitimacy-conflict-arbitration.ts` classifies conflicts deterministically. Terminal states: `CONFLICT_UNRESOLVABLE`, `CONFLICT_REQUIRES_HUMAN_REVIEW`.

**Gap:** `CONFLICT_REQUIRES_HUMAN_REVIEW` escalates to human review, but:
1. No bounded human review input format exists (INV-015 requires human judgment to be "converted into bounded decision objects" — no such conversion protocol is specified)
2. The result of human review must itself traverse the canonical execution chain to produce a governance effect, but the path from review result to executable governance object is not defined
3. Under distributed topology, two human reviewers may produce conflicting review objects simultaneously — producing a second-order governance conflict

**Failure class:** `POLICY_ARBITRATION_AMBIGUITY`, `HUMAN_STEERING_COLLAPSE` (INV-015).

### 3.7 Governance Continuity Inheritance

**Closure State: PARTIAL**

**Established:** `continuity_assumptions.json` identifies `POLICY_CONTINUITY` and `SCHEMA_CONTINUITY` as required assumption classes. Both are marked OPEN.

**Gap:** When continuity advances (new `continuity_id` child), governance policy state is not inherited as part of the continuity object. A new continuity chain begins with no record of which governance version it was created under. An authority issued under the new continuity may operate under a different policy than the session originally expected.

**Consequence:** Policy continuity breaks silently at continuity advancement boundaries — the exact moment when governance inheritance matters most.

**Failure class:** `GOVERNANCE_LINEAGE_ORPHANED`.

### 3.8 Governance Temporal Determinism

**Closure State: OPEN**

**Current state:** `causal-legitimacy-clocks.ts` provides causal ordering for legitimacy events (replay_step, revocation_step, proof_step ordering). The `temporal_lineage_replay_inspector.ts` checks epoch consistency.

**Gap:** Governance mutations (PREO, SCO applications) are not included in the causal legitimacy clock. A PREO and an SCO that arrive at different replicas in different orders produce different governance states, but:
- No governance_step exists in `CausalLegitimacyEvent`
- No `governance_happens_before_hash` exists in `CausalLegitimacyClockResult`
- The causal clock does not cover governance object ordering

**Consequence:** Two replicas can have causally divergent governance states that produce identical causal clock hashes because governance mutations are outside the clock's scope.

**Failure class:** `TEMPORAL_SPLIT_BRAIN` at governance layer, `GOVERNANCE_TOPOLOGY_DIVERGENCE`.

### 3.9 Governance Conflict Settlement

**Closure State: NULL**

**Current state:** `CONFLICT_REQUIRES_HUMAN_REVIEW` is the terminal unresolvable state. No Governance Conflict Settlement Protocol (GCSP) exists.

**Gap:** A GCSP requires:
1. A defined canonical format for human review input (bounded by INV-015)
2. A review outcome that is itself a governance object subject to the canonical chain
3. A settlement proof that records the conflict, the human review result, and the resolution
4. Conflict settlement records must be append-only and recursively reconcilable

None of these exist. The current system can detect and classify governance conflicts but cannot produce a deterministic, provable resolution.

**Failure class:** `GOVERNANCE_SETTLEMENT_AMBIGUITY`, structural NULL.

---

## 4. Governance Failure Topology

### 4.1 Governance Replay Resurrection

A governance object (PREO or SCO) can potentially be resubmitted after a governance epoch advancement (if epoch were defined — currently neither exists) because:
- PRE Objects have no `governance_invocation_nonce`
- The `invocation_registry` (which prevents replay for execution objects) does not cover governance objects
- A PREO that was VALID_FOR_AUTHORITY_BINDING could be replayed to authorize a second governance action

**Classification:** `OBSERVER_REPLAY_RESURRECTION` (from GOVERNANCE_CONSENSUS_SPEC drift classes)

### 4.2 Policy Drift Divergence

Under distributed topology, two replicas may apply policy updates in different orders. Since no governance causal clock exists (gap 3.8), the divergence is not detectable as an ordering failure — both replicas appear RECONCILED from their local perspective while holding semantically different policies.

**Classification:** `GOVERNANCE_EQUIVALENCE_MISMATCH`

### 4.3 Split-Brain Governance Authority

Under partition, each partition may independently issue governance objects (PREO, SCO applications). Both partitions' governance lineages are locally valid. Upon reconciliation, two structurally valid but semantically incompatible governance lineages exist with no deterministic resolution mechanism.

**Classification:** `GOVERNANCE_CONSENSUS_FRAGMENTATION`

### 4.4 Topology-Relative Governance

Governance authority (PREO validity, SCO application validity) currently depends on continuity lineage being ACTIVE. Continuity lineage validity depends on session validity. Session validity has expiry. Under partition or topology change, sessions may expire, invalidating continuity, invalidating governance authority mid-operation.

**Classification:** `GOVERNANCE_TOPOLOGY_DIVERGENCE` — governance authority is topology-relative, not topology-independent.

### 4.5 Governance Rollback via Forward Mutation

An SCO₂ semantically inverting SCO₁ is append-only compliant but constitutes a governance semantic rollback. No detection exists. No `governance_epoch` exists to establish monotonic policy ordering.

**Classification:** `REPLAY_SEMANTICS_DRIFT`, `GOVERNANCE_PARENT_HASH_MISMATCH`

### 4.6 Detached Governance Mutation

A governance mutation (schema change, validator update, policy update) applied to the runtime without a corresponding SCO or PREO produces a detached governance mutation: the runtime state diverges from the declared governance state. The `ENFORCED_BOUNDARY_ROADMAP` Stage 2 advisory checks detect this but do not block it.

**Classification:** `GOVERNANCE_LINEAGE_ORPHANED`

### 4.7 Stale Governance Propagation

A governance change (e.g., a canonicalization version update via SCO) may propagate to some replicas and not others. Replicas operating under old canonicalization semantics will produce different hashes for the same objects as replicas operating under new semantics. This produces silent validation divergence.

**Classification:** `VALIDATOR_OUTPUT_DRIFT`, `SCHEMA_SEMANTICS_DRIFT`

### 4.8 Governance Settlement Ambiguity

When a governance conflict is escalated to human review, the review result has no canonical format, no binding to a governance object, and no proof. The settlement is effectively off-chain from the governance legitimacy perspective.

**Classification:** `GOVERNANCE_SETTLEMENT_AMBIGUITY`

### 4.9 Recursive Governance Instability

If a governance change modifies the governance mutation rules themselves (GM-10: `CANONICAL_INVARIANT_CHANGE`), the new rules may retroactively alter the legitimacy of prior governance changes. This is a recursive instability: the legitimacy of the governance change that changed the governance rules depends on which version of the governance rules is authoritative at evaluation time.

**Classification:** `RECURSIVE_CONTAINMENT_REQUIRED`

### 4.10 Distributed Governance Deadlock

Under strict recursive governance requirements (GAP-005), a governance change requires a PREO which requires a governance-of-governance review which requires its own PREO, potentially producing an infinite recursion. A deadlock occurs when no governance change can be applied because the governance of governance requires a governance change that requires governance of governance.

This is the governance bootstrap problem: the recursive containment model requires an escape hatch (break-glass root authority) but the break-glass path is itself a governance bypass.

**Classification:** `RECURSIVE_CONTAINMENT_REQUIRED`, `BREAK_GLASS` closure state

---

## 5. Governance Closure Dependencies

```
Governance Settlement
  └── requires: GovernanceSettlementObject [NULL — does not exist]
        └── requires: Governance Proof Lineage [PARTIAL]
              └── requires: SCO Application Proof [OPEN]
                    └── requires: Governance Epoch Binding [OPEN]
                          └── requires: continuity_epoch on continuity_registry [CRITICAL — EC-01]

Recursive Governance Legitimacy
  └── requires: Required Status Checks (Stage 3) [OPEN]
        └── requires: PREO/SCO as required checks [advisory only]
              └── requires: Branch Protection Enforcement (Stage 4) [planned]

Governance Partition-Finality
  └── requires: Governance Partition-Finality Protocol [NULL — does not exist]
        └── requires: Governance Causal Clock [OPEN]
              └── requires: governance_step in CausalLegitimacyEvent [missing]

Distributed Policy Arbitration
  └── requires: Governance Conflict Settlement Protocol [NULL]
        └── requires: Bounded Human Review Format [OPEN — INV-015]
              └── requires: Review outcome as governance object [not defined]

Governance Temporal Determinism
  └── requires: Governance Causal Clock [OPEN]
        └── requires: governance_epoch + governance_happens_before_hash [missing]
```

---

## 6. Governance Determinism Gaps

| Gap ID | Domain | Description | Severity |
|---|---|---|---|
| GD-01 | Epoch | No `governance_epoch` on any governance artifact | **Critical** |
| GD-02 | Settlement | No `GovernanceSettlementObject` type exists | **Critical** |
| GD-03 | Causal Ordering | Governance mutations outside causal legitimacy clock | **High** |
| GD-04 | Replay | PREO/SCO have no `governance_invocation_nonce` | **High** |
| GD-05 | Recursive Enforcement | Stage 3+ enforcement is planned, not required | **High** |
| GD-06 | Rollback | No `GOVERNANCE_ROLLBACK_DETECTED` drift class or detection | **High** |
| GD-07 | Partition-Finality | No governance partition-finality protocol | **High** |
| GD-08 | Conflict Settlement | `CONFLICT_REQUIRES_HUMAN_REVIEW` has no conversion protocol | **High** |
| GD-09 | Policy Inheritance | `POLICY_CONTINUITY` and `SCHEMA_CONTINUITY` are OPEN | **Medium** |
| GD-10 | Topology Dependence | Governance authority depends on session/continuity topology | **Medium** |
| GD-11 | Federation Narrowing | "Narrowing acceptance" semantics are not formally bounded | **Medium** |
| GD-12 | Governance Bootstrap | Recursive containment model requires break-glass escape | **Medium** |

---

## 7. Recursive Governance Legitimacy

### Current State: PARTIAL

**Established:**
- `RECURSIVE_GOVERNANCE_CONTAINMENT_MODEL.json` defines the governance equivalence model
- `governance_invariant`: "If governance legitimacy cannot be recursively proven, governance evolution itself is invalid"
- Immutable semantic freeze list identifies 10 invariants that must not drift
- `RECURSIVE_GOVERNANCE_DRIFT_TAXONOMY.json` classifies 15 drift classes with containment result: `merge_legitimacy=NULL; proof_authority=NULL; execution_authority=NULL`
- PREO and SCO primitives exist

**Missing:**
- The recursive proof chain: no `governance_proof_registry` records that governance changes traversed the canonical chain with proof
- No `governance_lineage_hash` on governance artifacts themselves (the model defines the hash as a concept but it is not a column in any table)
- Recursive depth limit: recursive governance review of governance review of governance review is potentially unbounded
- Bootstrap authority: who governs the first governance object in a new runtime?

**Failure condition:** `RECURSIVE_CONTAINMENT_REQUIRED` — any governance mutation class GM-8, GM-9, or GM-10 that modifies the recursive containment rules themselves creates an escaping recursion.

**Required for closure:**
1. `governance_proof_registry` table (append-only, evidence-only, proof-binding for governance mutations)
2. `governance_invocation_nonce` on PREO and SCO objects
3. `governance_epoch` binding (depends on EC-01)
4. Maximum recursive depth constraint on governance review chains
5. Bootstrap governance authority defined as root authority with observable audit trail

---

## 8. Governance Settlement Semantics

### Current State: NULL

**Definition required:**

Governance settlement is the point at which a governance change:
1. Has completed the canonical execution chain as a governed object
2. Has been proven (a governance settlement proof exists)
3. Cannot be retroactively undone without a subsequent governed governance change
4. Is universally visible to all replicas (or the conflict is classified and quarantined)

**None of these conditions are currently deterministically provable.**

**Required canonical object:**

```
GovernanceSettlementObject {
  settlement_id: stable unique identifier
  governance_object_type: SCO | PREO
  governance_object_hash: sha256 of canonical governance object
  governance_execution_id: execution_id from execution_registry
  governance_proof_id: proof_id from governance_proof_registry
  governance_epoch: epoch at settlement time [requires GD-01]
  settlement_hash: sha256(settlement_id || governance_proof_id || governance_epoch)
  settled_at: ISO timestamp
  evidence_only: true
  creates_authority: false
}
```

**Without this object:** governance finality exists only as an informal convention, not a provable structural claim.

---

## 9. Highest-Leverage Governance Closures

### Priority 1: Governance Epoch Binding (GD-01)

Depends on EC-01 (adding `continuity_epoch` to `continuity_registry`). Once EC-01 is closed, add:
- `governance_epoch INTEGER` to PREO schema
- `governance_epoch INTEGER` to SCO schema
- `governance_epoch INTEGER` to `governance_proof_registry` (when created)

This unblocks GD-03, GD-04, GD-06, and GD-09 — four gaps become mechanically derivable.

### Priority 2: Governance Invocation Nonce (GD-04)

Add `governance_invocation_nonce` to PREO and SCO objects and to a `governance_invocation_registry`:

```sql
CREATE TABLE IF NOT EXISTS governance_invocation_registry (
  governance_object_hash TEXT NOT NULL,
  governance_object_type TEXT NOT NULL,
  governance_invocation_nonce TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (governance_object_hash, governance_invocation_nonce)
);
```

This blocks governance replay resurrection (failure mode 4.1) and enables deterministic governance idempotency.

### Priority 3: Required Governance Status Checks (GD-05)

Advance `ENFORCED_BOUNDARY_ROADMAP` from Stage 2 to Stage 3: make `merge-governance-check` a required status check for governance mutation PRs. This is the highest-leverage enforcement closure that does not require schema changes — it is a GitHub branch protection configuration.

### Priority 4: Governance Causal Clock Extension (GD-03)

Add `governance_step` to `CausalLegitimacyEvent` and `governance_happens_before_hash` to `CausalLegitimacyClockResult`. This brings governance mutations inside the causal ordering model and enables temporal governance determinism.

### Priority 5: GovernanceSettlementObject Definition (GD-02)

Define the canonical object type and `governance_proof_registry` table. This is the closure that makes governance finality provable.

---

## 10. Canonical Governance Recommendations

**R-01:** Add `governance_epoch` to all governance artifacts (PREO, SCO, governance_proof_registry) after EC-01 (continuity_epoch on continuity_registry) is closed. Epoch binding is the single primitive that enables GD-01, GD-06, GD-09, and GD-10 to be addressed.

**R-02:** Define `governance_invocation_nonce` for PREO and SCO objects, backed by `governance_invocation_registry`. Governance objects without nonce protection are replay-vulnerable.

**R-03:** Advance branch protection to Stage 3. Required governance status checks are the minimum required to make "governance mutation must be governed" (INV-011) non-bypassable at the merge boundary.

**R-04:** Define `GovernanceSettlementObject` and `governance_proof_registry` as the canonical governance finality primitive. Without this, governance change finality cannot be proven.

**R-05:** Extend `CausalLegitimacyEvent` to include `governance_step` and `governance_happens_before_hash`. Governance temporal ordering must be inside the causal clock.

**R-06:** Define the Governance Conflict Settlement Protocol (GCSP): bounded human review input format → review outcome as governance object → canonical chain traversal → settlement proof. This closes GD-08 and provides a deterministic path from `CONFLICT_REQUIRES_HUMAN_REVIEW` to resolution.

**R-07:** Define governance partition-finality semantics: which governance state is authoritative after partition heal? The monotonicity record (from R-01, `governance_epoch`) combined with the `epoch_monotonicity_registry` (from EC-10) provides the ordering primitive. The partition-finality rule: highest `governance_epoch` with a complete monotonicity record is authoritative.

**R-08:** Define maximum recursive depth for governance review chains. The recursive governance containment model currently has no depth bound, creating the risk of governance deadlock (failure mode 4.10).

**R-09:** Classify "federation evidence narrowing" formally. The `FEDERATED_RECONCILIATION_SPEC.json` allows remote evidence to narrow acceptance but does not bound how much narrowing is permitted. A narrowing floor (minimum acceptance rate) prevents denial-of-governance via federation evidence.

**R-10:** Define the governance bootstrap authority: the first governance object in a new runtime has no prior governance chain. This is structurally root authority. It must be classified in `root_authority_registry.json` as a `BREAK_GLASS` governance surface with observable audit trail.

---

## 11. Governance Risk Ranking

| Rank | Gap | Closure State | Risk Level | Blocking |
|---|---|---|---|---|
| 1 | GD-01: Governance Epoch Missing | OPEN | **Critical** | GD-03, GD-06, GD-09, GD-10 |
| 2 | GD-02: GovernanceSettlementObject Missing | NULL | **Critical** | Governance finality provability |
| 3 | GD-05: Recursive Enforcement Advisory Only | PARTIAL | **High** | INV-011 closure |
| 4 | GD-04: No Governance Invocation Nonce | OPEN | **High** | Governance replay resurrection |
| 5 | GD-07: No Partition-Finality Protocol | OPEN | **High** | Distributed governance correctness |
| 6 | GD-08: No Conflict Settlement Protocol | NULL | **High** | INV-015 closure |
| 7 | GD-03: Governance Outside Causal Clock | OPEN | **High** | Temporal governance determinism |
| 8 | GD-06: No Governance Rollback Detection | OPEN | **High** | Policy monotonicity |
| 9 | GD-09: Policy/Schema Continuity Open | PARTIAL | **Medium** | Continuity inheritance |
| 10 | GD-10: Topology-Dependent Governance Authority | OPEN | **Medium** | Partition resilience |
| 11 | GD-11: Federation Narrowing Unbounded | OPEN | **Medium** | Denial-of-governance resistance |
| 12 | GD-12: Governance Bootstrap Undefined | PARTIAL | **Medium** | Break-glass formalization |

---

## 12. Remaining Governance Compression

The governance frontier compresses to four canonical unresolved primitives:

```
PRIMITIVE 1: governance_epoch
  Status: NULL (does not exist)
  Unlocks: epoch binding, rollback detection, temporal determinism,
           partition-finality ordering, policy continuity inheritance
  Depends on: EC-01 (continuity_epoch on continuity_registry)

PRIMITIVE 2: GovernanceSettlementObject + governance_proof_registry
  Status: NULL (does not exist)
  Unlocks: governance finality provability, recursive governance proof,
           settlement semantics, conflict resolution records
  Depends on: PRIMITIVE 1

PRIMITIVE 3: governance_invocation_nonce + governance_invocation_registry
  Status: NULL (does not exist)
  Unlocks: governance replay resistance, governance idempotency,
           deterministic governance object identity
  Independent of PRIMITIVE 1 and 2

PRIMITIVE 4: Required governance status checks (Stage 3+ enforcement)
  Status: PLANNED (advisory only)
  Unlocks: INV-011 (governance mutation must be governed) at the merge boundary
  Independent of PRIMITIVE 1, 2, and 3 — achievable through branch protection alone
```

**The canonical governance closure ordering:**

```
PRIMITIVE 3 (independent — implement first, no dependencies)
  → PRIMITIVE 4 (independent — branch protection configuration)
    → PRIMITIVE 1 (depends on EC-01 from epoch analysis)
      → PRIMITIVE 2 (depends on PRIMITIVE 1)
        → PARTITION FINALITY PROTOCOL (depends on PRIMITIVE 1 + PRIMITIVE 2)
          → CONFLICT SETTLEMENT PROTOCOL (depends on all above)
            → RECURSIVE GOVERNANCE LEGITIMACY CLOSED
```

---

## Layer Matrix

| Layer | Closure State | Established Invariants | Missing Semantics | Failure Conditions | Replay Dependencies | Reconciliation Dependencies | Topology Dependencies | Required Canon Layer | Blocking Dependencies | Risk | Recommended Umbrella |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Governance Authority Lineage | PARTIAL | 5-stage chain, append-only, continuity cascade | Governance epoch, SCO/PREO proof | Epoch-stale authority, GAP-005 | PREO/SCO nonce absent | governance_proof_registry absent | Session/continuity expiry | governance_epoch, governance_proof_registry | EC-01 | High | GAP-005 |
| Policy Mutation Legitimacy | PARTIAL | GM-0..10 taxonomy, constitutional_boundary defined | Required enforcement (Stage 3+), SCO settlement proof | Self-authorization loop, detached mutation | Governance nonce absent | governance_invocation_registry absent | None direct | Stage 3 branch protection | None | High | GAP-005 |
| Distributed Governance Convergence | OPEN | Observer-only consensus, no auto-authority | Governance causal clock, governance_step | Policy drift divergence, split-brain governance | governance_step missing | governance_happens_before_hash absent | Partition topology | Governance causal clock | GD-01 | High | New issue |
| Governance Replay Safety | OPEN | Execution nonce (invocation_registry) | Governance invocation nonce | Governance replay resurrection | governance_invocation_nonce absent | governance_invocation_registry absent | None | governance_invocation_registry | None | High | GAP-005 |
| Governance Supersession Semantics | OPEN | Append-only prevents deletion | Semantic supersession ordering | Forward-mutation rollback, stale propagation | None | None | None | governance_epoch (GD-01) | EC-01 | High | New issue |
| Governance Epoch Semantics | OPEN | None | governance_epoch on all governance artifacts | Epoch-oblivious governance objects | N/A | N/A | N/A | governance_epoch | EC-01 | Critical | EC-01 umbrella |
| Governance Settlement Authority | NULL | None | GovernanceSettlementObject, governance_proof_registry | Proofless governance finality | Requires GD-04 | governance_proof_registry absent | None | GovernanceSettlementObject | GD-01, GD-04 | Critical | New issue |
| Topology-Independent Governance Authority | OPEN | Federation evidence containment | Topology-independent governance path | Session expiry under partition | N/A | Continuity topology hash | Session/continuity expiry | Partition-resilient governance continuity | GD-07 | Medium | New issue |
| Governance Partition-Finality | OPEN | Fail-closed ambiguity | Partition-finality protocol | Split-brain governance, undetermined post-partition state | N/A | governance_epoch ordering | Partition events | Governance partition-finality protocol | GD-01 | High | New issue |
| Governance Rollback Impossibility | PARTIAL | Append-only (delete/update) | Semantic rollback detection | Forward-mutation inversion of SCO | N/A | governance_epoch monotonicity | None | governance_epoch + monotonicity registry | GD-01 | High | EC-10 umbrella |
| Governance Reconciliation Canon | PARTIAL | cross_registry_reconciliation_registry | governance_lineage_hash as column, governance_epoch_conflict_class | Governance drift without epoch class | N/A | governance_epoch_conflict_class absent | Topology binding | governance_epoch on reconciliation records | GD-01 | Medium | GAP-003 |
| Recursive Governance Legitimacy | PARTIAL | Containment model, drift taxonomy, PREO/SCO | governance_proof_registry, recursive depth bound, bootstrap authority | Recursive instability, governance deadlock | governance_nonce | governance_proof_registry | None | GovernanceSettlementObject, depth bound | GD-01, GD-02 | High | GAP-005 |
| Governance Proof Lineage | PARTIAL | proof_registry (execution proof) | governance_proof_registry, governance_proof_id | Proofless governance mutation | GD-04 | governance_proof_registry absent | None | governance_proof_registry | GD-01 | Critical | GAP-005 |
| Governance Mutation Containment | PARTIAL | GM taxonomy, constitutional_boundary, advisory checks | Required enforcement (Stage 3+) | Ungoverned governance mutation | N/A | Cross-registry drift taxonomy | None | Stage 3 branch protection | None | High | GAP-005 |
| Distributed Policy Arbitration | OPEN | Conflict classification (13 classes), fail-closed NULL | GCSP, bounded human review format | Policy arbitration ambiguity, second-order conflict | N/A | Governance causal clock | Partition topology | GCSP definition | GD-01, GD-02, GD-03 | High | New issue |
| Governance Continuity Inheritance | PARTIAL | continuity_assumptions.json (defined) | POLICY_CONTINUITY, SCHEMA_CONTINUITY closure | Silent policy break at continuity boundary | governance_step | Continuity lineage | Continuity topology | governance_epoch + policy inheritance protocol | GD-01 | Medium | GAP-001 umbrella |
| Governance Temporal Determinism | OPEN | causal-legitimacy-clocks.ts (execution layer) | governance_step, governance_happens_before_hash | Causally divergent governance states | governance_step absent | governance_happens_before_hash absent | None | Governance causal clock extension | GD-01 | High | New issue |
| Governance Conflict Settlement | NULL | CONFLICT_REQUIRES_HUMAN_REVIEW (classification) | GCSP, bounded human review format, settlement proof | Settlement ambiguity, second-order conflict, proofless resolution | governance_nonce | settlement_registry absent | None | GovernanceSettlementObject + GCSP | GD-01, GD-02, GD-04 | High | New issue |

---

```
evidence_only: true
creates_authority: false
executable: false
deployment_capable: false
mutation_capable: false
fail_closed_on_ambiguity: true
```
