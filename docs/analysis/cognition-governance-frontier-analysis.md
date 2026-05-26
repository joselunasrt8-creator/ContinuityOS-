# Distributed Cognition Legitimacy Convergence — Frontier Analysis

**Branch:** `claude/cognition-legitimacy-analysis-hOj6a`  
**Mode:** MODE B — STRUCTURED ARTIFACT ONLY  
**Status:** NON-OPERATIVE  
**Scope:** Cognition-governance layer analysis — distributed cognitive legitimacy convergence across sessions, behavioral files, memory surfaces, delegation chains, and replay inheritance  
**Boundary:** Evidence-only analysis. No execution authority created. No mutation surface widened. No deployment capability added. No implementation. No schema changes.

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

### Expanded Cognition Invariant (Subject of This Analysis)

```
Behavioral mutation capable of altering future execution eligibility
must itself become legitimacy-governed.
```

### Distributed Cognition Invariant

```
persistent cognition
=
distributed mutable governance state
```

### Canonical Closed Layers (Not Reinvented Here)

The following layers are already formally closed. This analysis extends them
into cognition-governance space; it does not reopen or replace them:

| Closed Layer | Canonical Location |
|---|---|
| Distributed replay convergence | `src/lib/reconciliation-determinism.ts`, `standards/replay-semantics-v1.md` |
| Cross-registry reconciliation determinism | `src/lib/reconciliation-determinism.ts`, migration `0045` |
| Causal legitimacy clocks | `src/lib/causal-clock.ts` |
| Partition-finality semantics | `PARTITION_FINALITY_SEMANTICS.md` |
| Epoch substrate semantics | `src/lib/epoch-substrate.ts`, `docs/epoch-substrate-semantics.md` |
| Finality classification registries | `src/lib/finality-classification.ts` |
| Quorum attestation semantics | `src/lib/quorum-attestation.ts` |
| Revocation liveness | `src/lib/revocation-liveness.ts` |
| Topology replay classification | `docs/topology-replay-classification-alignment-1362.md` |

---

## 1. Runtime Cognition Topology Map

### 1.1 Definition

*Cognition* in the MindShift runtime denotes the distributed, mutable decision-making
state that governs whether an execution attempt is eligible, which object is valid,
and what authority lineage is recognized. Cognition is not a single module — it is
a property of the entire governance surface: every file, route, registry, and
policy document that can influence execution eligibility is a cognition surface.

This extends the canonical runtime spine:

```
intent
  → cognition governance          ← NEW LAYER (this analysis)
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

### 1.2 Behavioral Propagation Paths

The runtime propagates cognition state through the following paths:

```
[Behavioral surface mutation]
  → alters cognition state
    → alters execution eligibility evaluation
      → may alter future authority scope
        → may alter AEO object hash
          → may alter validation result
            → alters execution outcome
              → alters proof lineage
                → alters reconciliation convergence

[Memory surface mutation]
  → alters persistent state read by governance predicates
    → may alter replay-safety determination
      → may alter TOPOLOGY_VISIBLE evaluation
        → alters convergence_valid determination

[Delegation event]
  → alters authority inheritance boundary
    → may propagate stale cognition into subagent scope
      → subagent executes under inherited (possibly stale) cognition state
```

### 1.3 Replay Inheritance Edges

Cognition replay inheritance — what cognition state is carried forward across
session boundaries — flows through:

| Source | Target | Inheritance Mechanism | Replay Risk |
|---|---|---|---|
| `continuity_registry` | `authority_registry` | `continuity_id` FK | Stale continuity carries stale cognition scope |
| `authority_registry` | `aeo_registry` | `authority_id` FK | Authority-scoped cognition inherited by AEO |
| `aeo_registry` | `validation_registry` | `aeo_id` FK | Validated cognition state binds execution |
| `validation_registry` | `execution_registry` | `validation_id` FK | Execution inherits validated cognition state |
| `execution_registry` | `proof_registry` | `execution_id` FK | Proof persists execution-time cognition state |
| `governance/runtime/*.json` | All routes | File read at runtime init | Stale policy file = stale global cognition |
| `AGENTS.md` | Agent session init | Behavioral instruction inheritance | Behavioral drift across agent restarts |

### 1.4 Cognition Continuity Lineage

The cognition lineage is currently **implicit**. No table tracks cognition-state
identity across session boundaries. The closest approximation is the continuity
chain (`continuity_registry.parent_continuity_id`), but this tracks identity
continuity, not behavioral cognition state.

**Finding CG-01:** Cognition lineage is implicit. No registry records:
- which behavioral files were active at session start
- whether governance JSON files have mutated between sessions
- whether policy predicates have changed between delegation issuance and delegation exercise

### 1.5 Heartbeat Continuity Edges

No `HEARTBEAT.md` file exists in this repository. The heartbeat continuity
concept — a persistent liveness signal for cognition state — is an **unresolved
surface**. Currently, the closest mechanism is:

- `continuity_registry.expires_at` — passive expiry (not a liveness signal)
- `revocation_liveness` module — tracks revocation propagation, not cognition liveness

**Gap CG-HB-01:** No heartbeat continuity primitive exists. Cognition liveness
across long-running sessions is not governed.

---

## 2. Behavioral Authority Surface Inventory

All surfaces below are assessed against five cognition-governance dimensions:

| Dimension | Definition |
|---|---|
| `mutation_capable` | Can this surface alter future execution eligibility? |
| `replay_influence` | Does it affect replay-safety determination? |
| `authority_contamination_risk` | Can stale state propagate as valid authority? |
| `cognition_drift_risk` | Can behavioral divergence accumulate undetected? |
| `reconciliation_visibility` | Is mutation visible to cross-registry reconciliation? |

### 2.1 Existing Surfaces

#### `AGENTS.md`

```
status:                    EXISTS (dev/agent behavioral instruction surface)
mutation_capable:          YES — alters agent cognition scope and behavioral defaults
replay_influence:          INDIRECT — changes behavioral assumptions before session init
authority_contamination:   MEDIUM — stale behavioral instructions can persist across sessions
cognition_drift_risk:      HIGH — mutations are not epoch-bound or version-tracked
reconciliation_visibility: NONE — no registry tracks AGENTS.md content hash
governance_predicate:      ABSENT — not subject to legitimacy predicate
```

**Finding CG-02:** `AGENTS.md` mutations are invisible to the reconciliation
layer. An agent operating under a stale version of `AGENTS.md` is
indistinguishable from one operating under the current version. No cognition
hash exists for this surface.

#### `governance/runtime/*.json` (DEPLOY_POLICY, PREO_POLICY, REPLAY_POLICY, SCO_POLICY, SCHEMA_POLICY, TOPOLOGY_RECONCILIATION)

```
status:                    EXISTS (6 policy files)
mutation_capable:          YES — alter execution gate predicates globally
replay_influence:          YES — REPLAY_POLICY directly governs replay-safety evaluation
authority_contamination:   HIGH — stale DEPLOY_POLICY can authorize stale deployments
cognition_drift_risk:      HIGH — policy files can diverge across distributed nodes
reconciliation_visibility: PARTIAL — topology_manifest.json references these files but does not hash-verify at runtime
governance_predicate:      PARTIAL — marked evidence_only=true but mutation is not lineage-gated
```

**Finding CG-03:** `governance/runtime/*.json` files are marked `evidence_only=true`
and `executable=false`, but their content directly shapes the cognition state of
every route handler. If these files mutate between sessions (e.g., via PR merge
without governance workflow), the runtime operates under updated cognition without
a legitimacy transition record.

#### `runtime/legitimacy/legitimacy_inheritance_model.json`

```
status:                    EXISTS
mutation_capable:          YES — defines inheritance rules for all downstream objects
replay_influence:          YES — inheritance rules determine what cognition replay is permitted
authority_contamination:   HIGH — if inheritance rules expand, stale objects may become eligible
cognition_drift_risk:      MEDIUM — changes require reasoning about all downstream effects
reconciliation_visibility: NONE — not referenced by reconciliation_registry
governance_predicate:      ABSENT
```

#### `runtime/governance/governance_calculus.json`

```
status:                    EXISTS
mutation_capable:          YES — defines the mutation legitimacy function itself
replay_influence:          YES — alters what counts as replay-safe
authority_contamination:   CRITICAL — if the calculus is mutated, all subsequent determinations are contaminated
cognition_drift_risk:      CRITICAL — self-referential: governs governance
reconciliation_visibility: NONE
governance_predicate:      ABSENT — governance self-mutation is GAP-005 (P0)
```

#### `src/index.ts` (route definitions)

```
status:                    EXISTS
mutation_capable:          YES — route additions/removals alter execution surface
replay_influence:          YES — new routes may bypass existing replay controls
authority_contamination:   HIGH — undeclared execution surfaces bypass topology visibility check
cognition_drift_risk:      HIGH — route drift creates unreconciled execution surface
reconciliation_visibility: PARTIAL — topology_containment_axioms.json flags undeclared surfaces → NULL, but detection requires active topology scan
governance_predicate:      PARTIAL — governed by topology_containment_axioms, not by legitimacy predicates
```

#### `schema.sql` and migrations (`0001`–`0045`)

```
status:                    EXISTS
mutation_capable:          YES — schema mutations alter what cognition state is persisted
replay_influence:          YES — column additions may introduce replay ambiguity
authority_contamination:   MEDIUM — additive migrations are low risk; destructive would be critical
cognition_drift_risk:      LOW — migrations are append-only by convention
reconciliation_visibility: PARTIAL — migration_governance_registry tracks governance, not cognition state
governance_predicate:      PARTIAL — SCO policy governs schema mutations
```

### 2.2 Absent Surfaces (Unresolved Gaps)

The following surfaces are specified in the cognition-governance frontier but
**do not exist** in this repository. Their absence is itself a governance finding.

#### `SOUL.md` — ABSENT

```
status:                    ABSENT
hypothetical_role:         Persistent identity/behavioral character specification for agent sessions
authority_contamination:   UNDEFINED — no surface = no containment boundary
cognition_drift_risk:      UNDEFINED
required_governance:       Would require: content hash binding, epoch anchoring, revocation propagation
finding:                   CG-GAP-SOUL — no persistent behavioral identity surface exists; behavioral identity defaults to implicit session state
```

#### `HEARTBEAT.md` — ABSENT

```
status:                    ABSENT
hypothetical_role:         Liveness attestation for cognition continuity across session gaps
authority_contamination:   UNDEFINED
cognition_drift_risk:      UNDEFINED — liveness gaps are ungoverned
required_governance:       Would require: TTL binding, continuity_id linkage, revocation on lapse
finding:                   CG-GAP-HB — no cognition liveness primitive exists; cognition continuity silently lapses
```

#### `BOOTSTRAP.md` — ABSENT

```
status:                    ABSENT
hypothetical_role:         Governance of cognition initialization at session/runtime start
authority_contamination:   UNDEFINED — bootstrap cognition is ungoverned
cognition_drift_risk:      HIGH — initialization drift is not detectable
required_governance:       Would require: deterministic bootstrap hash, epoch binding at init time
finding:                   CG-GAP-BOOT — cognition bootstrap is ungoverned; startup behavioral state is not legitimacy-tracked
```

#### Memory registries / delegation manifests — ABSENT

```
status:                    ABSENT as first-class cognition surfaces
hypothetical_role:         Persistent cognition state across delegation chains
finding:                   CG-GAP-MEM — no cognition memory registry exists; cross-session behavioral state is not lineage-tracked
```

---

## 3. Distributed Cognition Failure Taxonomy

Extends the 12-class taxonomy in `PARTITION_FINALITY_SEMANTICS.md` into
cognition-governance space. The existing partition-finality failure classes govern
execution objects; the following govern cognition state.

| Class | Name | Definition | Risk |
|---|---|---|---|
| CF-01 | Cognition Split-Brain | Two concurrent sessions operate under mutually incompatible behavioral assumptions with no quorum mechanism to resolve | CRITICAL |
| CF-02 | Replay Resurrection | A previously expired or superseded cognition state is re-instantiated without a new legitimacy lineage | HIGH |
| CF-03 | Stale Behavioral Propagation | A behavioral surface mutation propagates to downstream sessions before reconciliation is complete, causing some sessions to observe new cognition and others to observe old | HIGH |
| CF-04 | Orphan Cognition Lineage | A session's cognition state references a continuity ancestor that has been revoked, but the revocation has not propagated to the behavioral surface | HIGH |
| CF-05 | Delegation Drift | A delegated subagent's cognition diverges from the delegating agent's cognition across a session gap; neither detects the divergence | HIGH |
| CF-06 | Topology-Desynchronized Cognition | The runtime's route topology and the governance topology map diverge; execution occurs on surfaces not visible to the legitimacy evaluator | HIGH |
| CF-07 | Cognition Replay Inversion | Replay of an earlier cognition state produces different execution eligibility than the original evaluation, due to behavioral surface mutations since the original | MEDIUM |
| CF-08 | Heartbeat Replay Loop | A lapsed cognition liveness signal is re-presented as current, causing the evaluator to treat stale cognition as live | HIGH |
| CF-09 | Authority Contamination Through Memory | A session inherits behavioral assumptions from a prior session's persistent memory state that no longer has a valid authority lineage | HIGH |
| CF-10 | Behavioral Epoch Skew | A behavioral surface mutation occurs across an epoch boundary; sessions in different epochs evaluate different cognition states as authoritative | MEDIUM |
| CF-11 | Delegation Depth Overflow | A delegation chain exceeds its authorized depth, but no schema constraint enforces maximum delegation depth; cognition authority propagates beyond its permitted boundary | MEDIUM |
| CF-12 | Cognition Partition Without Finality | A network partition separates cognition state without a finality mechanism; after reconnection, no deterministic rule resolves which cognition state is authoritative | CRITICAL |

**Observation:** CF-01 and CF-12 are the highest-severity classes and represent
the primary unsolved closure target of this analysis.

---

## 4. Cognition Replay-Risk Matrix

Extends `standards/replay-semantics-v1.md`. The existing replay semantics govern
execution object replay; the following extend those semantics to behavioral surfaces.

| Surface | Replay Inheritance Exposure | Stale Window | Deterministic Reconstruction | Expiry Enforcement | NULL-Resolution |
|---|---|---|---|---|---|
| `AGENTS.md` | HIGH — no version binding | Unbounded | NO — content is unversioned | NO | NO — no legitimacy gate |
| `governance/runtime/REPLAY_POLICY.json` | HIGH — governs all replay decisions | Unbounded | PARTIAL — file-level, no hash pinning | NO | NO |
| `governance/runtime/DEPLOY_POLICY.json` | HIGH — governs deploy surface | Unbounded | PARTIAL | NO | NO |
| `runtime/legitimacy/legitimacy_inheritance_model.json` | HIGH — governs all inheritance rules | Unbounded | NO | NO | NO |
| `runtime/governance/governance_calculus.json` | CRITICAL — governs governance itself | Unbounded | NO | NO | NO |
| `src/index.ts` routes | HIGH — undeclared routes bypass replay scope | Unbounded | PARTIAL — topology scan required | NO | PARTIAL (topology axiom) |
| `continuity_registry` | LOW — hash-bound, expiry-enforced | `expires_at` | YES — deterministic | YES | YES — revocation cascades |
| `authority_registry` | LOW — nonce-bound | `expires_at` | YES | YES | YES |
| `aeo_registry` | LOW — hash-bound | AEO scope | YES | YES | YES |
| `validation_registry` | LOW — nonce-bound | AEO scope | YES | YES | YES |
| `execution_registry` | MINIMAL — post-proof | proof binding | YES | YES | YES |
| `proof_registry` | MINIMAL — append-only | — | YES | N/A | YES |

**Finding CG-04:** The behavioral surface layer (AGENTS.md, governance JSON, runtime config)
has **no replay protection** — no nonce binding, no expiry enforcement, no deterministic
reconstruction, and no NULL-resolution path. This contrasts sharply with the execution
object layer, where all of these controls exist. The behavioral surface is the cognition
replay attack surface.

---

## 5. Delegation Governance Analysis

Extends `runtime/legitimacy/legitimacy_inheritance_model.json`.

### 5.1 Current Delegation Model

The existing inheritance model defines:

```json
{
  "remote_proof_does_not_create_local_authority": true,
  "execution_inherits_validation_constraints": true,
  "proof_inherits_execution_constraints": true,
  "reconciliation_inherits_topology_constraints": true
}
```

These govern object inheritance within the execution spine. They do not govern
cognition inheritance across delegation events.

### 5.2 Delegation Lineage Tracing

The current `delegated_authority_registry` (migration `0030`) carries:

```sql
delegation_lineage_hash, delegation_root_hash, delegated_replay_chain_hash
```

None of these fields bind to:
- the cognition state at delegation issuance time
- the behavioral surface hash at delegation issuance time
- the policy predicate versions in effect at delegation issuance time

**Finding CG-05:** A delegated authority's cognition context is not captured at
issuance time. A subagent exercising a delegation cannot verify that the cognition
assumptions under which the delegation was granted still hold at exercise time.
This is cognition authority contamination by temporal drift.

### 5.3 Inherited Authority Scope Boundaries

The delegation model defines what the subagent **can** do. It does not define
what cognition state the subagent **inherits**. These are distinct:

```
authority scope = what operations are permitted
cognition scope = what behavioral assumptions govern eligibility evaluation
```

A subagent inheriting a delegation inherits the authority scope. Whether it also
inherits the delegating agent's cognition state is undefined. If it does not
inherit cognition state, it may evaluate eligibility under different behavioral
assumptions — creating delegation drift (CF-05).

### 5.4 Replay Boundaries at Delegation Handoff

Extending `standards/replay-semantics-v1.md`:

Replay scope currently binds: `identity_id, session_id, continuity_id, decision_id,
validated_object_hash, invocation_nonce, target_environment`

It does not bind:
- `delegation_id` — which delegation authorized this subagent
- `cognition_hash` — what behavioral state was in effect at delegation issuance
- `delegator_continuity_id` — what continuity the delegator held at issuance

**Finding CG-06:** Replay scope does not cover the delegation boundary. A subagent
that replays a previously executed operation cannot verify that the delegation under
which the original execution occurred is the same delegation currently in effect.

### 5.5 Withheld Authority Semantics

Extending the existing forbidden inheritance patterns:

| Inheritance | Status | Rationale |
|---|---|---|
| `delegation_inherits_delegator_full_authority` | FORBIDDEN | Already in inheritance model |
| `delegation_inherits_delegator_cognition_state` | UNDEFINED | Not in inheritance model; should be EXPLICIT |
| `delegation_inherits_delegator_behavioral_surface_hash` | UNDEFINED | No mechanism exists |
| `subagent_cognition_outlives_delegation_expiry` | FORBIDDEN (desired) | No enforcement exists |
| `delegation_extends_across_epoch_boundary_without_re-issuance` | UNDEFINED | Gap from CG-06 |

---

## 6. Cognition Partition-Finality Model

Extends `PARTITION_FINALITY_SEMANTICS.md`. The existing partition-finality model
defines terminal states for execution objects under network partition. The following
extends those semantics to cognition state.

### 6.1 Cognition State Machine

```
PROPOSED_COGNITION
  → (behavioral surface loaded, no validation)
    → LOCAL_COGNITION_VALID
      → (quorum confirms behavioral state matches global)
        → GLOBAL_COGNITION_VALID
          → (reconciliation settles, no drift)
            → SETTLED_COGNITION  [terminal, positive]
          → (reconciliation detects drift)
            → AMBIGUOUS_COGNITION
              → (drift resolved, quorum re-established)
                → GLOBAL_COGNITION_VALID
              → (drift irresolvable)
                → QUARANTINED_COGNITION  [terminal, negative]
        → (quorum check not yet complete)
          → OBSERVATIONAL_COGNITION  [non-authoritative]
      → (behavioral surface known stale, replacement known)
        → STALE_COGNITION  [terminal, negative]
      → (partition detected, cannot reach quorum)
        → PARTITIONED_COGNITION
          → (partition resolves, reconciliation converges)
            → GLOBAL_COGNITION_VALID
          → (partition resolves, irreconcilable split)
            → QUARANTINED_COGNITION  [terminal, negative]

Any path not listed above → NULL_COGNITION [terminal, negative]
```

### 6.2 Transition Rules

Extending the monotonicity constraints from `PARTITION_FINALITY_SEMANTICS.md`:

| Rule | Statement |
|---|---|
| C-MONO-1 | Cognition state transitions are monotonic: no state may transition to a less-settled state except via explicit revocation |
| C-MONO-2 | SETTLED_COGNITION is irreversible without a new cognition legitimacy lineage |
| C-MONO-3 | QUARANTINED_COGNITION is terminal: no execution may proceed under quarantined cognition |
| C-FALLBACK | If cognition state cannot be determined → NULL_COGNITION → execution blocked |

### 6.3 Collapse Rules

Extending split-brain collapse from `PARTITION_FINALITY_SEMANTICS.md`:

```
If two sessions hold LOCAL_COGNITION_VALID with conflicting behavioral surface hashes:
  → Neither is GLOBAL_COGNITION_VALID
  → Both transition to AMBIGUOUS_COGNITION
  → Tie-break sequence:
      1. Highest epoch wins (extends causal legitimacy clock semantics)
      2. Oldest continuity_id wins (extends continuity lineage authority)
      3. If still tied → QUARANTINED_COGNITION (fail-closed)
```

### 6.4 Quorum Requirements by Cognition Risk Class

Extending the quorum model from `src/lib/quorum-attestation.ts`:

| Cognition Risk Class | Quorum Requirement |
|---|---|
| Behavioral surface read (observational) | No quorum required |
| Policy predicate evaluation | Local quorum (1 of N) |
| Cognition state transition | Majority quorum (N/2 + 1) |
| Behavioral surface mutation | Supermajority (2N/3 + 1) |
| Cognition revocation | Unanimous (N of N) |

---

## 7. Cognitive Topology Intelligence Assessment

### 7.1 Behavioral Lineage Graph

The behavioral lineage graph is currently **implicit** in the repository structure.
The explicit governance graph covers execution objects (session → continuity →
authority → AEO → validation → execution → proof). Behavioral surfaces are not
nodes in this graph.

**Required extension:** Add behavioral surface nodes:

```
[AGENTS.md hash]
  ↓ (session init time)
[session_id]
  ↓ (continuity issuance)
[continuity_id]
  ↓ (authority issuance)
[authority_id, scoped by cognition_hash at authority issuance time]
  ↓ ...
```

Without this graph, `AGENTS.md` mutations are invisible to the lineage graph.

### 7.2 Cognition Replay Graph

Extending the replay graph concepts from `docs/topology/lineage-traversal.mmd`:

A cognition replay graph would trace: given a replay attempt, what behavioral
state was in effect at the time of original execution, and does that behavioral
state still hold?

Currently, no such graph exists. The replay scope (nonce, continuity_id, hash)
does not include any behavioral surface snapshot.

### 7.3 Delegation Propagation Graph

The delegation propagation graph tracks cognition state as it flows through
delegation chains. Currently, `delegated_authority_registry` captures the
authority lineage but not the cognition lineage at each delegation hop.

**Drift density characterization:**

```
Drift density = (number of delegation hops) × (time since delegation issuance)
             × (number of behavioral surface mutations since issuance)
```

No current mechanism measures or bounds drift density.

### 7.4 Cognition Reconciliation Topology Gaps

From `docs/governance/runtime-topology-map.md`, the current reconciliation
topology covers:

- `cross_registry_reconciliation_registry` — execution object reconciliation
- `drift_registry` — execution drift detection

Neither covers:
- behavioral surface drift (policy file mutations between sessions)
- cognition state divergence across distributed replicas
- delegation cognition drift across session boundaries

**Gap CG-TOPO-01:** Cognition state is not a node in the reconciliation topology.
Behavioral surface mutations are invisible to the reconciliation layer.

---

## 8. Canon Closure Matrix

### 8.1 Stabilized Cognition Layers (CLOSED)

| Layer | Evidence of Closure |
|---|---|
| Session legitimacy | `session_registry`, route `/session`, migration `0010` |
| Continuity legitimacy | `continuity_registry`, INVARIANT-001, `standards/revocation-semantics-v1.md` |
| Authority legitimacy | `authority_registry`, nonce binding, scope constraints |
| AEO exact-object discipline | `aeo_registry`, `standards/aeo-predicate-v1.json`, hash binding |
| Validation integrity | `validation_registry`, INVARIANT-002 |
| Execution proof persistence | `proof_registry`, INVARIANT-005 |
| Revocation propagation | `src/lib/revocation-liveness.ts`, INVARIANT-003 |
| Replay determinism | `standards/replay-semantics-v1.md`, INVARIANT-004 |
| Quorum attestation | `src/lib/quorum-attestation.ts` |
| Epoch substrate | `src/lib/epoch-substrate.ts`, migration `0045` |
| Causal legitimacy clocks | `src/lib/causal-clock.ts` |
| Finality classification | `src/lib/finality-classification.ts` |
| Conflict set registry | `src/lib/conflict-set.ts` |
| Cross-registry reconciliation determinism | `src/lib/reconciliation-determinism.ts` |
| Partition-finality semantics | `PARTITION_FINALITY_SEMANTICS.md` |
| Topology replay classification | `docs/topology-replay-classification-alignment-1362.md` |
| Validator classification evidence | Migration `0043` |

### 8.2 Partially Closed Cognition Layers

| Layer | Partial Closure Evidence | Remaining Gap |
|---|---|---|
| Drift detection | `drift_registry`, `legitimacy_drift_propagation_registry` | Behavioral surface drift not covered |
| Federation | `federated_revocation_observability_registry` | Cognition quorum across federated nodes not defined |
| Replay semantics | `standards/replay-semantics-v1.md` | Delegation boundary not in replay scope |
| Governance self-mutation | `governance/recursive/` | GAP-005 (P0) — not closed |
| Execution surface exhaustiveness | `EXECUTION_SURFACE_CLASSIFICATION.md` | GAP-004 (P1) — incomplete |

### 8.3 Open Cognition Layers (Unresolved Frontier)

| Layer | Status | Finding |
|---|---|---|
| Behavioral surface legitimacy governance | OPEN | CG-02, CG-03, CG-04 |
| Cognition lineage registry | OPEN | CG-01 — no registry exists |
| Delegation cognition inheritance | OPEN | CG-05, CG-06 |
| Cognition partition-finality | OPEN | Section 6 defines; no implementation |
| Distributed behavioral reconciliation | OPEN | CG-TOPO-01 |
| Heartbeat continuity primitive | OPEN | CG-GAP-HB |
| Cognition bootstrap governance | OPEN | CG-GAP-BOOT |
| Persistent behavioral identity surface | OPEN | CG-GAP-SOUL |
| Cognition memory registry | OPEN | CG-GAP-MEM |
| Behavioral epoch binding | OPEN | CG-10 (CF-10) |

---

## 9. Highest-Leverage Unresolved Frontier

### 9.1 Determination

Of all open cognition layers, the single highest-leverage next closure target is:

**Behavioral Surface Legitimacy Governance**

Rationale:

1. **Root cause of most other gaps.** CG-01 through CG-06 all trace back to the
   absence of legitimacy predicates on behavioral surfaces. If behavioral surfaces
   are not governed by legitimacy predicates, no downstream governance closure
   can be complete.

2. **Closes the cognition invariant.** The expanded cognition invariant states:
   "Behavioral mutation capable of altering future execution eligibility must itself
   become legitimacy-governed." This invariant is entirely unenforceable without
   behavioral surface legitimacy governance.

3. **Extends existing closed layers without reopening them.** Behavioral surface
   legitimacy governance applies the already-closed legitimacy predicate model
   (`VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE
   ∧ RECONCILABLE ∧ EPOCH_VALID ∧ CONVERGENCE_VALID`) to a new class of objects.
   No existing closed layer is reopened.

4. **Blocks the highest-severity failure classes.** CF-01 (cognition split-brain),
   CF-03 (stale behavioral propagation), CF-09 (authority contamination through
   memory), and CF-12 (cognition partition without finality) are all enabled by
   ungoverned behavioral surfaces.

5. **Required predicate extension (not reinvention).** The existing governance
   calculus (`runtime/governance/governance_calculus.json`) already defines:
   `f(authority, validation, continuity, topology, replay, proof, governance)`.
   Behavioral surface legitimacy governance adds:
   `+ cognition_hash + behavioral_epoch_binding` to this function — an additive
   extension, not a replacement.

### 9.2 Required Predicate for Behavioral Surface Governance

A behavioral surface is legitimacy-governed if and only if:

```
behavioral_surface_valid(s) ≡
  CONTENT_HASH_KNOWN(s)
  ∧ EPOCH_BOUND(s)
  ∧ CONTINUITY_ANCHORED(s)
  ∧ RECONCILIATION_VISIBLE(s)
  ∧ REVOCATION_PROPAGATABLE(s)
  ∧ REPLAY_EXPIRY_DEFINED(s)
  → else NULL_COGNITION
```

Where:
- `CONTENT_HASH_KNOWN(s)` — the content hash of surface `s` is recorded in a cognition registry
- `EPOCH_BOUND(s)` — the surface is bound to a specific epoch at the time of cognition state establishment
- `CONTINUITY_ANCHORED(s)` — the surface's hash is part of the continuity lineage of the session that loaded it
- `RECONCILIATION_VISIBLE(s)` — mutations to the surface are detectable by the reconciliation layer
- `REVOCATION_PROPAGATABLE(s)` — a surface revocation propagates downstream (as per `standards/revocation-semantics-v1.md`)
- `REPLAY_EXPIRY_DEFINED(s)` — the surface has a defined expiry for replay-safety purposes

---

## 10. Recommended Issue Decomposition Sequence

The following issues extend the existing sequence (#1364–#1381). Each issue is
scoped to a single closure unit, consistent with the established pattern.

### Issue #1382: Cognition Lineage Registry

```
surface:            docs/analysis/, schema.sql
risk_class:         P2
closure_condition:  A cognition_lineage_registry table exists that records, for each session, the content hashes of all behavioral surfaces active at session initialization
bypass_condition:   Session operates under behavioral assumptions with no lineage record
required_predicates:
  - CONTENT_HASH_KNOWN for AGENTS.md, governance/runtime/*.json, runtime/**/*.json
  - EPOCH_BOUND at session init time
  - CONTINUITY_ANCHORED via continuity_id FK
required_tests:
  - FATE: cognition-lineage-registry-session-binding
  - FATE: cognition-lineage-registry-surface-hash-capture
  - FATE: cognition-lineage-registry-epoch-binding
required_proofs:
  - Session with mismatched cognition hash → execution blocked
  - Session with unknown behavioral surface → NULL_COGNITION
```

### Issue #1383: Behavioral Surface Replay Semantics

```
surface:            standards/replay-semantics-v1.md extension, src/lib/
risk_class:         P1
closure_condition:  Replay scope includes behavioral_surface_hash and behavioral_epoch; replay of an execution attempt under a different behavioral surface hash → NULL
bypass_condition:   Replay succeeds despite behavioral surface mutation between original execution and replay attempt
required_predicates:
  - behavioral_surface_hash in replay scope binding
  - behavioral_epoch monotonicity in replay scope
required_tests:
  - FATE: behavioral-surface-replay-rejection-on-hash-mismatch
  - FATE: behavioral-surface-replay-epoch-binding
required_proofs:
  - Replay attempt with stale behavioral surface hash → NULL
  - Replay attempt with correct behavioral surface hash → permitted
```

### Issue #1384: Delegation Cognition Inheritance Boundaries

```
surface:            delegated_authority_registry schema, legitimacy_inheritance_model.json
risk_class:         P2
closure_condition:  Delegated authority records capture cognition_hash at issuance time; subagent exercises delegation only if local cognition_hash matches issuance-time cognition_hash
bypass_condition:   Delegation exercised after behavioral surface mutation without cognition re-verification
required_predicates:
  - cognition_hash at delegation issuance = cognition_hash at delegation exercise
  - OR: explicit cognition re-verification before exercise
required_tests:
  - FATE: delegation-cognition-hash-binding
  - FATE: delegation-exercise-cognition-mismatch-rejection
  - FATE: delegation-cognition-drift-detection
required_proofs:
  - Subagent with drift-mismatch cognition cannot exercise delegation
  - Subagent with matching cognition exercises delegation
```

### Issue #1385: Cognition Partition-Finality State Machine

```
surface:            PARTITION_FINALITY_SEMANTICS.md extension, src/lib/finality-classification.ts extension
risk_class:         P1
closure_condition:  The 8-state cognition partition-finality state machine from Section 6 is formally specified; QUARANTINED_COGNITION and NULL_COGNITION are terminal and block execution
bypass_condition:   Session continues execution under PARTITIONED_COGNITION or AMBIGUOUS_COGNITION
required_predicates:
  - All 8 cognition states formally defined
  - Collapse rules with tie-break sequence specified
  - Quorum requirements per cognition risk class defined
required_tests:
  - FATE: cognition-split-brain-detection-and-collapse
  - FATE: cognition-partition-finality-quorum-enforcement
  - FATE: cognition-quarantine-execution-block
required_proofs:
  - CF-01 (split-brain) → QUARANTINED_COGNITION
  - CF-12 (partition without finality) → QUARANTINED_COGNITION
  - SETTLED_COGNITION → execution permitted
```

### Issue #1386: Behavioral Surface Reconciliation Visibility

```
surface:            cross_registry_reconciliation_registry, drift_registry
risk_class:         P2
closure_condition:  Behavioral surface mutations are a first-class drift class in drift_registry; reconciliation detects and reports behavioral surface divergence across distributed nodes
bypass_condition:   Two sessions operate under different behavioral surface hashes; reconciliation reports convergence
required_predicates:
  - RECONCILIATION_VISIBLE for all behavioral surfaces
  - behavioral_surface_drift as drift class in drift_registry
required_tests:
  - FATE: behavioral-surface-drift-detection
  - FATE: behavioral-surface-drift-reconciliation-class
  - FATE: behavioral-surface-convergence-after-reconciliation
required_proofs:
  - Behavioral surface divergence detected → drift_registry record
  - Drift record exists → reconciliation required before execution
```

### Issue #1387: Heartbeat Continuity Primitive

```
surface:            continuity_registry, new: cognition_liveness_registry
risk_class:         P3
closure_condition:  A cognition liveness primitive exists; sessions that exceed liveness TTL transition to STALE_COGNITION; execution blocked under stale cognition
bypass_condition:   Long-running session continues executing without liveness re-verification
required_predicates:
  - Cognition TTL defined per session type
  - Liveness signal bound to continuity_id
  - TTL expiry → STALE_COGNITION → execution blocked
required_tests:
  - FATE: cognition-liveness-ttl-enforcement
  - FATE: cognition-liveness-lapse-stale-classification
  - FATE: cognition-liveness-renewal-re-validation
required_proofs:
  - Session past TTL → execution blocked
  - Session with valid liveness → execution permitted
```

### Issue #1388: Governance Calculus Cognition Extension

```
surface:            runtime/governance/governance_calculus.json, src/lib/aeo-governance.ts
risk_class:         P1
closure_condition:  The governance calculus function includes cognition_hash and behavioral_epoch_binding as required parameters; omission → NULL
bypass_condition:   Execution proceeds without cognition_hash in governance calculus evaluation
required_predicates:
  - governance_calculus(authority, validation, continuity, topology, replay, proof, governance, cognition_hash, behavioral_epoch) = VALID | NULL
  - cognition_hash absence → NULL
required_tests:
  - FATE: governance-calculus-cognition-hash-required
  - FATE: governance-calculus-behavioral-epoch-binding
  - FATE: governance-calculus-null-on-missing-cognition
required_proofs:
  - Execution attempt without cognition_hash → NULL
  - Execution attempt with valid cognition_hash → eligible for further evaluation
```

---

## Appendix A: Extended Invariant Registry

Extends `docs/governance/invariant-registry.md`. The following invariants are
PROPOSED (non-operative, pending closure):

```
INVARIANT-011 (PROPOSED)
Name: Behavioral Surface Governance
Rule: Any behavioral surface capable of altering execution eligibility
      must be legitimacy-governed before it can influence execution outcomes

INVARIANT-012 (PROPOSED)
Name: Cognition Lineage Completeness
Rule: Missing cognition lineage = STALE_COGNITION = NULL

INVARIANT-013 (PROPOSED)
Name: Delegation Cognition Binding
Rule: Delegated authority inherits the delegating agent's cognition hash at issuance time;
      cognition hash mismatch at exercise time → delegation invalid

INVARIANT-014 (PROPOSED)
Name: Cognition Liveness Integrity
Rule: Expired cognition liveness = STALE_COGNITION;
      expired continuity cannot authorize cognition continuation

INVARIANT-015 (PROPOSED)
Name: Behavioral Epoch Monotonicity
Rule: Behavioral epoch for a session cannot decrease; epoch rollback → NULL_COGNITION
```

---

## Appendix B: Canonical Closure Condition

```
Cognition-governance layer is closed when:

∀ behavioral surface s:
  behavioral_surface_valid(s)
  ∧ EPOCH_BOUND(s)
  ∧ CONTINUITY_ANCHORED(s)
  ∧ RECONCILIATION_VISIBLE(s)
  ∧ REVOCATION_PROPAGATABLE(s)
  ∧ REPLAY_EXPIRY_DEFINED(s)

∧ ∀ delegation event d:
  cognition_hash(delegator, issuance_time) = cognition_hash(subagent, exercise_time)
  ∨ explicit_cognition_re_verification(d)

∧ ∀ session s:
  cognition_state(s) ∈ {GLOBAL_COGNITION_VALID, SETTLED_COGNITION}
  ∨ execution_blocked(s)

→ distributed cognition legitimacy convergence achieved
```

---

*Status: NON-OPERATIVE. Evidence-only. No authority created. No execution surface widened.*  
*creates_authority: false | executable: false | mutation_capable: false*
