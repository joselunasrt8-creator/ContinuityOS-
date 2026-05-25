# Distributed Governance Canon Analysis

**Repository:** mindshift-demo  
**Branch:** claude/governance-canon-analysis-DHY2s  
**Analysis Date:** 2026-05-25  
**Mode:** MODE B — STRUCTURED ARTIFACT  
**Status:** NON_OPERATIVE_GOVERNANCE_ARTIFACT — analysis only, no authority granted

---

> AI output is NEVER authority.  
> Governance proposal ≠ governance legitimacy.  
> Visibility ≠ governance authority.  
> Policy existence ≠ policy legitimacy.  
> Convergence ≠ governance finality.  
> Finality ≠ governance settlement.

---

## 1. Governance Frontier Summary

MindShift implements a deterministic legitimacy runtime for AI-assisted execution systems. The canonical path is:

```
/session → /continuity → /authority → /compile → /validate → /execute → /proof
```

The canonical invariant is:

```
VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE
Else → NULL
```

This analysis enumerates the closure status of 18 governance layers across the distributed legitimacy frontier. The system demonstrates strong single-node legitimacy enforcement. Its open frontiers concentrate in three areas: **distributed topology conditions** (partition, asynchrony, split-brain), **recursive governance legitimacy** (self-mutation of governance artifacts), and **root authority containment** (Cloudflare/GitHub credential escape).

### Frontier Summary Table

| # | Governance Layer | Closure State | Risk Level |
|---|-----------------|---------------|------------|
| 1 | Governance Authority Lineage | PARTIAL | HIGH |
| 2 | Policy Mutation Legitimacy | OPEN | CRITICAL |
| 3 | Distributed Governance Convergence | OPEN | CRITICAL |
| 4 | Governance Replay Safety | PARTIAL | HIGH |
| 5 | Governance Supersession Semantics | OPEN | HIGH |
| 6 | Governance Epoch Semantics | OPEN | HIGH |
| 7 | Governance Settlement Authority | OPEN | CRITICAL |
| 8 | Topology-Independent Governance Authority | OPEN | CRITICAL |
| 9 | Governance Partition-Finality | NULL | CRITICAL |
| 10 | Governance Rollback Impossibility | PARTIAL | HIGH |
| 11 | Governance Reconciliation Canon | PARTIAL | HIGH |
| 12 | Recursive Governance Legitimacy | OPEN | CRITICAL |
| 13 | Governance Proof Lineage | CONTAINED | MEDIUM |
| 14 | Governance Mutation Containment | PARTIAL | HIGH |
| 15 | Distributed Policy Arbitration | NULL | CRITICAL |
| 16 | Governance Continuity Inheritance | PARTIAL | HIGH |
| 17 | Governance Temporal Determinism | PARTIAL | HIGH |
| 18 | Governance Conflict Settlement | NULL | CRITICAL |

**Closure State Distribution:**

- CLOSED: 0
- CONTAINED: 1 (5.6%)
- PARTIAL: 7 (38.9%)
- OPEN: 6 (33.3%)
- NULL: 3 (16.7%)
- BREAK_GLASS: 1 (5.6%)

---

## 2. Established Governance Layers

### 2.1 Single-Node Legitimacy Path (CONTAINED)

**What is established:**

The canonical execution path (`/session → /continuity → /authority → /compile → /validate → /execute → /proof`) is structurally enforced across the runtime. The following invariants are implemented:

- **Exact-object discipline:** `validated_object == executed_object`. The `proof_registry` trigger validates `decision_hash = decision_id || char(31) || validated_object_hash`. Any post-validation mutation produces `HASH_MISMATCH → NULL`.
- **Single-use nonce binding:** `invocation_registry` PRIMARY KEY on `(decision_id, validated_object_hash, invocation_nonce)` prevents nonce reuse within the same D1 instance.
- **Proof persistence:** `proof_registry` is append-only (BEFORE UPDATE/DELETE triggers raise ABORT). Proofs cannot be deleted.
- **Authority state machine:** Authority objects transition `RESERVED → EXECUTED → CONSUMED`. Consumed authority cannot re-authorize.
- **Fail-closed responses:** All declared bypass paths (`BYPASS_PATHS.json`, 24 entries) are classified and assigned NULL responses.

**Evidence files:** `schema.sql`, `migrations/0041_proof_replay_idempotency.sql`, `migrations/0042_proof_execution_lineage_binding.sql`, `GOVERNANCE_REQUIREMENTS.json`, `BYPASS_PATHS.json`.

### 2.2 Execution Surface Inventory (PARTIAL)

**What is established:**

`EXECUTION_SURFACES.json` declares 13 classified surfaces with `state_changing`, `risk_class`, and `required_controls` fields. `LEGACY_SURFACES.md` quarantines deprecated surfaces. The `migration_governance_registry` (`migration 0047`) appends surface declarations for D1 migration events. `runtime_surface_containment_registry` (`migration 0032`) tracks runtime surface containment evidence.

**What remains open:** Surface exhaustiveness is actively tracked as GAP-004 (P1, OPEN) and issue #358. The declarative inventory has no runtime enforcement loop that rejects undeclared surfaces dynamically at the topology layer — enforcement is policy-time only.

### 2.3 Append-Only Registry Integrity (CONTAINED)

**What is established:**

Seventeen registries enforce append-only semantics via SQLite `BEFORE UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT, ...)`. This includes `proof_registry`, `observability_registry`, `drift_registry`, `attestation_registry`, `external_authority_registry`, `bootstrap_sovereignty_registry`, and all propagation/quarantine/closure registries.

**Scope boundary:** Append-only is enforced within the single D1 database instance. Cross-instance and cross-region append-only guarantees are not established (see Layer 3, Layer 9).

### 2.4 Governance Proof Lineage (CONTAINED)

**What is established:**

The `proof_registry` binds `(workflow_run_id, decision_hash)` uniquely. Migration `0042` adds `execution_id` foreign key binding. Migration `0043` (`workflow_integrity_lineage`) links proof to workflow run lineage. The `PREO_SPEC` requires review evidence before merge legitimacy is granted. Cryptographic provenance attestations (`attestation_registry`, migration `0015`) bind `envelope_hash` uniquely.

**Remaining gap:** The proof lineage is verifiable within D1 but has no cross-topology proof export or federated proof anchoring. A proof generated in one replica has no canonical mechanism to be recognized as authoritative by another replica.

---

## 3. Open Governance Frontiers

### 3.1 Policy Mutation Legitimacy (OPEN)

**Gap:** Governance artifacts (`GOVERNANCE_REQUIREMENTS.json`, `BYPASS_PATHS.json`, `EXECUTION_SURFACES.json`, workflow YAML files) are committed to source control. Changes to these artifacts follow the SCO (Source Control Ontology) and PREO (Pull Request Review Evidence) flow. However, the SCO/PREO flow itself is implemented by GitHub Actions workflows — which are also governance artifacts. A mutation to `governed-deploy.yml` or `merge-governance-check.yml` must pass through `merge-governance-check.yml` to be legitimate, but the check is defined in the file being changed.

**Registered as:** GAP-005 (Governance Self-Mutation, P0, OPEN).

**Failure mode:** A PR that modifies `merge-governance-check.yml` to weaken its own validation passes the check it modifies. No out-of-band validation circuit exists to detect this.

**Missing:** An immutable external governance checksum registry, or a split-brain check where a separate, non-self-modifying authority validates any mutation to the governance check itself.

### 3.2 Distributed Governance Convergence (OPEN)

**Gap:** The system is deployed as a single Cloudflare Worker with a single D1 database. All legitimacy registries exist in this single instance. The `distributed-topology-convergence.ts` and `distributed-replay-convergence.ts` source files exist in `src/`, and the `topology_reconciliation_registry` schema exists in `migrations/0033`. However, no multi-instance deployment topology is declared in `wrangler.toml`, and no quorum or consensus protocol is implemented for cross-instance state.

**Failure mode:** If the system is scaled horizontally (multiple Worker instances against a replicated D1 or external database), the single-use nonce guarantee (`invocation_registry` PRIMARY KEY) degrades to a race condition. Two instances can each observe a nonce as unused and both proceed past the replay gate before either writes the used record.

**Missing:** A distributed consensus gate (e.g., atomic compare-and-swap, distributed lock, or single-writer quorum) over nonce consumption before authority proceeds to execution.

### 3.3 Governance Supersession Semantics (OPEN)

**Gap:** When a governance artifact is superseded (a new version of `GOVERNANCE_REQUIREMENTS.json` replaces an old one), there is no formal supersession record that marks the prior version as inactive. The `governance/runtime/` directory accumulates evidence files, but there is no canonical supersession registry linking `version N-1 → version N` with a governing authority chain.

**Failure mode:** Governance replay resurrection — a prior governance artifact version is re-presented as authoritative because no signed tombstone marks it as superseded. A node that has cached the prior version cannot independently determine that it has been superseded without access to the full source history.

**Missing:** A `governance_supersession_registry` that appends signed supersession records with `(prior_hash, successor_hash, superseding_authority, timestamp)`, append-only enforced.

### 3.4 Governance Epoch Semantics (OPEN)

**Gap:** The runtime has no declared epoch mechanism. Epochs bound the time window within which a governance object is authoritative. Without epochs, an authority object issued at `2026-04-15` with `expires_at: 2026-12-31` has only a local expiry field — but no epoch transition that invalidates all prior governance state globally and forces re-authentication.

**Failure mode:** Stale governance propagation — a governance object that has logically expired (due to a policy change, a revocation event, or a governance migration) continues to be treated as valid by nodes that have not received the revocation signal. Without epoch transitions, there is no mechanism to force a global re-validation of all outstanding authority objects.

**Missing:** An `governance_epoch_registry` with epoch boundaries, transition authority, and an epoch-aware validation gate that rejects authority objects issued in a prior epoch after epoch transition.

### 3.5 Governance Settlement Authority (OPEN)

**Gap:** When two governance artifacts conflict (e.g., `GOVERNANCE_REQUIREMENTS.json` declares a requirement that `BYPASS_PATHS.json` has classified as NULL, but a new PR re-introduces the path under a different classification), the system has no canonical settlement authority — no designated arbiter that produces a binding resolution with proof.

**Failure mode:** Governance settlement ambiguity — two legitimate governance artifacts produce contradictory instructions. Without a settlement authority, the runtime either halts (fail-closed, correct but unavailable) or selects one artifact heuristically (incorrect, creates policy drift divergence).

**Missing:** A `governance_conflict_settlement_registry` with a canonical arbitration protocol and a binding settlement proof that references both conflicting artifacts and the resolving authority.

### 3.6 Topology-Independent Governance Authority (OPEN)

**Gap:** All governance authority is currently topology-bound to the single Cloudflare Worker + D1 instance. Governance decisions are legitimate only within the context of this specific infrastructure deployment. There is no topology-independent authority layer (e.g., a governance object that is valid regardless of which node processes it).

**Failure mode:** Topology-relative governance — a governance object is legitimate on node A but not on node B, because node B does not have access to the D1 instance that registered the authority. The legitimacy of the governance object becomes a function of network topology, not of its intrinsic content.

**Missing:** A topology-independent authority format (e.g., a self-contained signed governance bundle with embedded proof, verifiable without D1 access) combined with a canonical federation protocol for cross-topology recognition.

---

## 4. Governance Failure Topology

### 4.1 Detected Failure Patterns

| Failure Mode | Layer | Detection Status | Containment Status |
|---|---|---|---|
| Governance replay resurrection | Supersession, Replay Safety | PARTIAL | OPEN |
| Policy drift divergence | Policy Mutation, Convergence | DETECTED (drift_registry) | OPEN (no enforcement) |
| Split-brain governance authority | Partition-Finality, Settlement | NULL | NULL |
| Topology-relative governance | Topology-Independence | DETECTED | OPEN |
| Governance rollback conditions | Rollback Impossibility | PARTIAL | PARTIAL |
| Detached governance mutation | Mutation Containment | PARTIAL | PARTIAL |
| Stale governance propagation | Epoch Semantics | NOT DETECTED | NULL |
| Governance settlement ambiguity | Settlement Authority | NOT DETECTED | NULL |
| Recursive governance instability | Recursive Legitimacy | PARTIAL | OPEN |
| Distributed governance deadlock | Convergence, Partition-Finality | NOT DETECTED | NULL |
| Policy arbitration ambiguity | Policy Arbitration | NOT DETECTED | NULL |
| Governance authority orphaning | Authority Lineage | PARTIAL | PARTIAL |

### 4.2 Highest-Severity Failure Topologies

**F-1: Split-Brain Governance (NULL/NULL)**

Condition: D1 database becomes unreachable for one partition while another partition continues processing. Each partition independently advances its nonce registry. When connectivity restores, both partitions have consumed nonces that the other considers valid-and-unused. No reconciliation protocol exists to determine which partition's authority chain is canonical.

Impact: Dual execution of the same decision, violation of the single-use nonce invariant, two distinct proofs for the same authority object.

**F-2: Governance Self-Mutation (OPEN/OPEN)**

Condition: A PR modifies the governance check workflow file. The check runs against the modified version of itself. Malicious or erroneous weakening passes its own check.

Impact: Governance bootstrap corruption — the legitimacy of all subsequent governance decisions depends on the corrupted check.

**F-3: Stale Governance Propagation (NULL/NULL)**

Condition: A governance policy is updated. A federated node (or a cached client) retains the prior policy and continues validating against it. No epoch transition or revocation signal forces re-validation.

Impact: Two nodes apply different policies to the same authority object, producing divergent legitimacy determinations.

**F-4: Distributed Governance Deadlock (NULL/NULL)**

Condition: Two governance nodes each hold a resource required by the other to complete a governance decision. Neither can proceed without the other's confirmation. No timeout, priority rule, or deadlock detection exists.

Impact: Governance liveness failure — no execution can proceed, but the system does not clearly signal why.

---

## 5. Governance Closure Dependencies

### 5.1 Dependency Graph

```
Governance Partition-Finality (NULL)
    ← requires: Distributed Governance Convergence (OPEN)
    ← requires: Governance Settlement Authority (OPEN)
    ← requires: Topology-Independent Governance Authority (OPEN)

Governance Settlement Authority (OPEN)
    ← requires: Distributed Policy Arbitration (NULL)
    ← requires: Governance Conflict Settlement Registry (MISSING)

Distributed Governance Convergence (OPEN)
    ← requires: Consensus Protocol (MISSING)
    ← requires: Topology-Independent Authority Format (MISSING)

Governance Conflict Settlement (NULL)
    ← requires: Governance Settlement Authority (OPEN)
    ← requires: Arbitration Protocol (MISSING)

Recursive Governance Legitimacy (OPEN)
    ← requires: Policy Mutation Legitimacy (OPEN)
    ← requires: Out-of-Band Governance Check (MISSING)

Governance Epoch Semantics (OPEN)
    ← requires: Governance Epoch Registry (MISSING)
    ← requires: Epoch-Aware Validation Gate (MISSING)

Governance Supersession Semantics (OPEN)
    ← requires: Governance Supersession Registry (MISSING)
    ← requires: Signed Tombstone Protocol (MISSING)
```

### 5.2 Blocking Dependencies (no upstream prerequisite exists)

The following closure targets have no existing prerequisite in the codebase and are therefore fully blocked on new canonical layer creation:

1. **Governance Epoch Registry** — no schema, no migration, no source file
2. **Governance Supersession Registry** — no schema, no migration, no source file
3. **Governance Conflict Settlement Registry** — no schema, no migration, no source file
4. **Distributed Consensus Gate** — no implementation (source file skeletons exist in `src/distributed-topology-convergence.ts` but no protocol implementation)
5. **Topology-Independent Authority Format** — no signed bundle format defined
6. **Out-of-Band Governance Check** — no external validation circuit for self-modifying governance workflows

---

## 6. Governance Determinism Gaps

### 6.1 Non-Deterministic Conditions Under Asynchrony

The runtime achieves determinism under single-node synchronous conditions. The following conditions break determinism under distributed asynchrony:

**G-1: Nonce Consumption Race**
Two workers read `invocation_registry` simultaneously. Both observe nonce as unused. Both proceed to execution. The second INSERT fails (PRIMARY KEY violation), but the first execution has already proceeded. The system has no rollback for a partially completed execution.

**G-2: Authority State Transition Race**
`authority_registry` tracks state transitions. Under concurrent access, two workers can both read `RESERVED` before either writes `EXECUTED`. Both transition to `EXECUTED`, producing two executions under the same authority.

**G-3: Proof Hash Race**
`proof_registry` enforces `UNIQUE(workflow_run_id, decision_hash)`. Under concurrent proof generation, the second INSERT fails, but the first proof has already been generated and the execution it proofs may have produced side effects.

**G-4: Reconciliation Ordering Ambiguity**
`continuous_reconciliation_orchestrator.mjs` schedules reconciliation events. Under asynchrony, reconciliation events for different registries may arrive out of order. The reconciliation result depends on the order of processing, but no canonical ordering is enforced.

### 6.2 Determinism Preservation Requirements

For the system to remain deterministic under distributed topology:

1. All nonce operations must be serialized through a single-writer gate.
2. Authority state transitions must use atomic compare-and-swap semantics.
3. Proof generation must be idempotent with respect to identical inputs (already partially addressed by `proof_replay_idempotency` migration, but only within a single D1 instance).
4. Reconciliation events must carry a globally ordered sequence number.

---

## 7. Recursive Governance Legitimacy

### 7.1 The Recursive Governance Problem

MindShift governance is self-referential: the governance system governs changes to itself. This creates the recursive governance legitimacy problem:

```
Governance artifact G is legitimate iff it was produced by a legitimate governance process.
The legitimacy of the governance process is defined by governance artifact G.
∴ G's legitimacy depends on G.
```

The system attempts to resolve this via the bootstrap sovereignty registry (`migration 0027`) and the PREO/SCO flow, which grounds legitimacy in human review evidence. However, the human review evidence is validated by the merge governance check workflow, which is itself a governance artifact subject to the same recursion.

### 7.2 Current Resolution Depth

The runtime resolves the recursion at depth 1: any governance mutation must pass through the merge governance check. But the merge governance check itself is not validated by an out-of-band authority. It is a BREAK_GLASS condition — trust is grounded in the assumption that the initial bootstrap state of the merge governance check was legitimate, and that no self-modifying mutation has occurred since.

This is not a failure — it is a necessary stopping point for any recursion. The gap is that the bootstrap legitimacy of the merge governance check has no cryptographic anchor (no signed hash of the initial workflow state committed to an external registry).

### 7.3 Recursive Legitimacy Chain (current)

```
Level 0 (BREAK_GLASS): GitHub admin credentials → direct push to protected branch
Level 1 (CONTAINED): merge-governance-check.yml validates PR merges
Level 2 (PARTIAL): preo-candidate.yml validates PREO evidence
Level 3 (PARTIAL): governed-deploy.yml validates deployment authority
Level 4 (CONTAINED): proof_registry captures immutable proof of execution
```

**Gap at Level 1:** The merge governance check is validated by itself. A break-glass event at Level 0 can replace Level 1 without Level 1 validation.

**Gap at Level 0:** Root authority (GitHub admin, Cloudflare account tokens) is classified as requiring audit trail (GAP-002, P0) but no technical enforcement prevents their use without an audit trail.

### 7.4 Recursive Legitimacy Invariant

For recursive governance legitimacy to hold:

```
∀ governance artifact G:
  G is legitimate
  iff ∃ governance authority A: A authorized G
  ∧ A is legitimate
  ∧ A ≠ G (no self-authorization)
  ∧ A was produced before G (temporal ordering)
  ∧ A is not superseded at time G was authorized
```

The current system satisfies this invariant within the single-node, single-epoch, non-self-modifying case. It does not satisfy it under distributed, multi-epoch, or self-modifying conditions.

---

## 8. Governance Settlement Semantics

### 8.1 Current Settlement Model

The system has no formal settlement protocol. Conflicts are implicitly resolved by:

1. **Fail-closed default:** When two governance artifacts conflict, the system defaults to NULL (nothing happens). This is correct but produces liveness failure.
2. **Last-write-wins:** For governance artifacts stored in source control, the most recent commit is canonical. This is not formally declared as a settlement protocol.
3. **Human arbitration:** Governance conflicts are escalated to human review via PR process. This is the only declared settlement mechanism, and it operates at BREAK_GLASS level.

### 8.2 Settlement Semantics Requirements

A canonical governance settlement protocol requires:

1. **Conflict detection:** A mechanism that identifies when two governance artifacts produce contradictory legitimacy determinations.
2. **Arbitration authority:** A designated authority with explicit capability to produce binding settlements (not derived from either conflicting artifact).
3. **Settlement proof:** An immutable record linking `(conflict_evidence, arbitration_authority, settlement_decision, settlement_hash)`.
4. **Propagation protocol:** A mechanism to ensure all nodes receive and acknowledge the settlement before proceeding.

None of these are currently implemented. The `legitimacy-conflict-arbitration.ts` source file exists in `src/` but its implementation status is not confirmed from the exploration report.

### 8.3 Governance Finality vs. Settlement

The distinction matters:

- **Finality:** A governance decision cannot be reversed. Partially achieved via append-only registries and proof immutability.
- **Settlement:** A governance conflict is resolved with a binding, propagated, acknowledged determination. Not implemented.

Finality without settlement produces a system where conflicting immutable records coexist with no canonical resolution.

---

## 9. Highest-Leverage Governance Closures

Ordered by (risk reduction × implementation feasibility):

### HLC-1: Governance Epoch Registry (Risk: CRITICAL → CONTAINED)

**What:** Add `governance_epoch_registry` table (append-only) with schema:
```sql
CREATE TABLE governance_epoch_registry (
  epoch_id TEXT PRIMARY KEY,
  epoch_sequence INTEGER NOT NULL UNIQUE,
  prior_epoch_id TEXT,
  transition_authority_id TEXT NOT NULL,
  transition_timestamp TEXT NOT NULL,
  epoch_boundary_hash TEXT NOT NULL,
  governance_artifacts_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Why:** Epochs bound the validity window of all governance objects. Without epochs, stale governance propagation and governance replay resurrection cannot be structurally prevented.

**Leverage:** Closes or significantly reduces: Stale Governance Propagation, Governance Replay Resurrection, Governance Epoch Semantics (OPEN → PARTIAL).

### HLC-2: Governance Supersession Registry (Risk: HIGH → CONTAINED)

**What:** Add `governance_supersession_registry` table (append-only) recording formal tombstones for superseded governance artifacts.

**Why:** Enables nodes to independently verify that a governance artifact is not a replay of a superseded version without access to full source history.

**Leverage:** Closes: Governance Supersession Semantics (OPEN → PARTIAL), reduces Governance Replay Resurrection.

### HLC-3: Out-of-Band Governance Bootstrap Anchor (Risk: CRITICAL → PARTIAL)

**What:** At bootstrap, compute and externally register a signed hash of the initial `merge-governance-check.yml` state. Store the hash in `bootstrap_sovereignty_registry`. Any subsequent mutation to the check must reference this anchor.

**Why:** Breaks the circular dependency in recursive governance legitimacy at Level 1. Provides a cryptographic ground truth for the governance check that is independent of the check itself.

**Leverage:** Closes: Recursive Governance Legitimacy (OPEN → PARTIAL), reduces Governance Self-Mutation risk.

### HLC-4: Distributed Nonce Serialization Gate (Risk: CRITICAL → PARTIAL)

**What:** Introduce a serialization gate for nonce consumption that is atomic at the D1 level. This is structurally available via SQLite's serialized write semantics within a single D1 instance. For multi-instance topologies, document that the system is NOT safe for horizontal scaling without a distributed lock layer.

**Why:** The current nonce PRIMARY KEY provides replay protection within single-writer D1. Under concurrent multi-worker access patterns this degrades. Documenting the topology boundary closes the determinism gap.

**Leverage:** Closes: Nonce Consumption Race (G-1), Governance Replay Safety (PARTIAL → CONTAINED for single-instance topology).

### HLC-5: Governance Conflict Detection Registry (Risk: CRITICAL → PARTIAL)

**What:** Add `governance_conflict_registry` (append-only) that records detected conflicts between governance artifacts, with fields for both conflicting artifact hashes, the detection timestamp, and detection authority.

**Why:** Cannot settle conflicts that are not formally detected. This is a prerequisite for any settlement protocol.

**Leverage:** Prerequisite for Governance Settlement Authority, Distributed Policy Arbitration.

---

## 10. Canonical Governance Recommendations

### R-1: Establish Governance Epoch Semantics
**Priority:** P0  
**Target layers:** Epoch Semantics, Stale Governance Propagation, Replay Resurrection  
**Action:** Implement `governance_epoch_registry` migration. Define epoch transition authority. Wire epoch validation into the authority compilation gate.

### R-2: Anchor Recursive Governance Bootstrap
**Priority:** P0  
**Target layers:** Recursive Governance Legitimacy, Policy Mutation Legitimacy  
**Action:** Compute and register a signed hash of the initial governance check workflow. Require any mutation to the governance check to reference this anchor in its PREO evidence.

### R-3: Implement Governance Supersession Registry
**Priority:** P1  
**Target layers:** Supersession Semantics, Replay Resurrection  
**Action:** Implement `governance_supersession_registry` migration. Define signed tombstone protocol. Require tombstone for any governance artifact replacement.

### R-4: Define and Document Topology Boundary
**Priority:** P1  
**Target layers:** Topology-Independent Authority, Distributed Convergence, Partition-Finality  
**Action:** Formally declare the system's topology assumptions in a `TOPOLOGY_BOUNDARY.json` governance artifact. Declare that multi-instance horizontal scaling requires a distributed consensus gate not currently implemented. This closes the topology dependency by making it explicit rather than implicit.

### R-5: Implement Governance Conflict Detection
**Priority:** P1  
**Target layers:** Governance Settlement Authority, Distributed Policy Arbitration, Governance Conflict Settlement  
**Action:** Implement `governance_conflict_registry`. Define conflict detection logic for governance artifact pairs. This is a prerequisite for settlement.

### R-6: Close Root Authority Containment (GAP-002)
**Priority:** P0 (already registered)  
**Target layers:** Authority Lineage, Governance Settlement Authority  
**Action:** Implement technical enforcement for root authority audit trail. A break-glass event that does not produce an audit record in `bootstrap_sovereignty_registry` must be detectable and flagged.

### R-7: Complete Execution Surface Exhaustiveness (GAP-004)
**Priority:** P1 (already registered)  
**Target layers:** Governance Mutation Containment, Policy Mutation Legitimacy  
**Action:** Add a runtime check (not just policy-time) that rejects requests from surfaces not declared in `EXECUTION_SURFACES.json`. The check should be a gate in the Worker route handler, not just a governance document.

---

## 11. Governance Risk Ranking

| Rank | Risk | Layer | Severity | Exploitability |
|------|------|-------|----------|----------------|
| 1 | Split-Brain Governance Authority | Partition-Finality | CRITICAL | LOW (requires multi-instance deployment) |
| 2 | Governance Self-Mutation | Policy Mutation Legitimacy | CRITICAL | MEDIUM (requires PR to governance workflow) |
| 3 | Root Authority Bypass | Authority Lineage | CRITICAL | LOW (requires root credential access) |
| 4 | Stale Governance Propagation | Epoch Semantics | CRITICAL | LOW (requires federated deployment) |
| 5 | Distributed Governance Deadlock | Convergence | CRITICAL | LOW (requires multi-instance deployment) |
| 6 | Governance Settlement Ambiguity | Settlement Authority | HIGH | MEDIUM (can be triggered by conflicting PRs) |
| 7 | Governance Supersession Replay | Supersession Semantics | HIGH | MEDIUM (requires access to prior artifact versions) |
| 8 | Policy Arbitration Ambiguity | Distributed Arbitration | HIGH | LOW (requires federated deployment) |
| 9 | Recursive Governance Instability | Recursive Legitimacy | HIGH | LOW (requires sustained self-modification campaign) |
| 10 | Authority Orphaning | Authority Lineage | HIGH | MEDIUM (requires continuity chain disruption) |
| 11 | Governance Rollback via Source Revert | Rollback Impossibility | MEDIUM | MEDIUM (requires git force-push or revert PR) |
| 12 | Drift Detection Without Enforcement | Mutation Containment | MEDIUM | LOW (drift is detected but not blocked) |

**Note on exploitability:** "LOW" does not mean "acceptable." It means the attack requires elevated access (root credentials, multi-instance deployment, or sustained campaign). These risks are highest-priority precisely because their exploitation would be catastrophic and potentially undetectable.

---

## 12. Remaining Governance Compression

### 12.1 What Is Already Compressed (Closed or Contained)

The following governance requirements are structurally resolved and require no additional closure work:

- **Exact-object discipline** (`validated_object == executed_object`): Closed via proof trigger hash validation.
- **Single-use nonce** (single-instance): Closed via `invocation_registry` PRIMARY KEY (within D1 writer serialization).
- **Proof immutability**: Closed via append-only triggers on `proof_registry`.
- **Execution surface declaration**: Contained via `EXECUTION_SURFACES.json` + `migration_governance_registry`.
- **Bypass path classification**: Contained via `BYPASS_PATHS.json` (24 entries classified, NULL responses declared).
- **Merge legitimacy gate**: Contained via `merge-governance-check.yml` + PREO requirement.
- **Authority state machine**: Contained via `RESERVED → EXECUTED → CONSUMED` transitions.
- **Drift detection**: Contained via `drift_registry` (append-only, detection coverage partial).

### 12.2 Governance Compression Remaining (Ordered)

| Compression Target | Current State | Required Closure | Blocking On |
|---|---|---|---|
| Governance Epoch Semantics | NULL (not implemented) | governance_epoch_registry + epoch gate | New migration + source file |
| Governance Supersession | NULL (not implemented) | governance_supersession_registry | New migration + source file |
| Recursive Legitimacy Anchor | BREAK_GLASS | Bootstrap hash anchor | External registry write |
| Topology Boundary Declaration | IMPLICIT | TOPOLOGY_BOUNDARY.json | New governance artifact |
| Governance Conflict Detection | NULL (not implemented) | governance_conflict_registry | New migration + source file |
| Root Authority Audit Trail | OPEN (GAP-002) | Technical enforcement | Auth layer modification |
| Distributed Consensus Gate | OPEN | Single-writer serialization doc or impl | Architecture decision |
| Surface Runtime Enforcement | OPEN (GAP-004) | Route handler gate | Source file modification |
| Settlement Protocol | NULL | Full arbitration protocol | All above |

### 12.3 Compression Priority

**Immediate (P0):** Epoch registry, recursive legitimacy anchor, root authority audit trail.  
**Short-term (P1):** Supersession registry, topology boundary declaration, governance conflict detection.  
**Medium-term (P2):** Surface runtime enforcement, distributed consensus gate documentation.  
**Long-term (requires architecture work):** Settlement protocol, distributed policy arbitration, topology-independent authority format.

---

## Governance Layer Matrix

### Layer 1: Governance Authority Lineage

| Field | Value |
|---|---|
| **Layer Name** | Governance Authority Lineage |
| **Current Closure State** | PARTIAL |
| **Established Invariants** | Authority state machine (RESERVED→EXECUTED→CONSUMED); authority bound to session→continuity chain; `authority_registry` records decision_id UNIQUE; proof requires execution lineage (migration 0042) |
| **Missing Semantics** | No topology-independent authority format; no cross-node authority recognition; no federated authority revocation enforcement |
| **Failure Conditions** | Root authority bypass (GAP-002); authority orphaning on continuity chain break; federated node cannot verify authority without D1 access |
| **Replay Dependencies** | invocation_nonce single-use binding (CONTAINED for single D1) |
| **Reconciliation Dependencies** | cross_registry_authority_reconciliation.mjs; cross_registry_reconciliation_registry |
| **Topology Dependencies** | Single D1 instance; authority is topology-bound |
| **Required Canon Layer** | Topology-independent authority format; federated revocation propagation protocol |
| **Blocking Dependencies** | Distributed Governance Convergence (OPEN); Root Authority Containment (GAP-002, P0) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | Root Authority Containment + Federated Authority Recognition |

### Layer 2: Policy Mutation Legitimacy

| Field | Value |
|---|---|
| **Layer Name** | Policy Mutation Legitimacy |
| **Current Closure State** | OPEN |
| **Established Invariants** | SCO/PREO flow required for source mutations; merge-governance-check validates PRs; branch protection declared |
| **Missing Semantics** | No out-of-band validation for self-modifying governance workflows; no cryptographic anchor for initial governance check state |
| **Failure Conditions** | Self-modifying governance PR weakens its own check (GAP-005); direct push bypasses PREO requirement (GAP-002) |
| **Replay Dependencies** | None established for governance artifacts (no supersession registry) |
| **Reconciliation Dependencies** | PREO evidence reconciliation; SCO mutation classification |
| **Topology Dependencies** | GitHub Actions topology; governance check runs in same workflow being checked |
| **Required Canon Layer** | Out-of-band governance check circuit; bootstrap hash anchor |
| **Blocking Dependencies** | Recursive Governance Legitimacy (OPEN); Bootstrap Sovereignty (BREAK_GLASS) |
| **Governance Risk Level** | CRITICAL |
| **Recommended Issue Umbrella** | GAP-005: Governance Self-Mutation |

### Layer 3: Distributed Governance Convergence

| Field | Value |
|---|---|
| **Layer Name** | Distributed Governance Convergence |
| **Current Closure State** | OPEN |
| **Established Invariants** | Source files exist (distributed-topology-convergence.ts, distributed-replay-convergence.ts); schema migration exists (topology_reconciliation_registry); convergence concepts defined |
| **Missing Semantics** | No quorum protocol; no consensus implementation; no multi-instance D1 topology declared; no convergence proof |
| **Failure Conditions** | Nonce consumption race under concurrent workers; authority state race; reconciliation ordering ambiguity |
| **Replay Dependencies** | Single-instance D1 nonce binding (CONTAINED); multi-instance nonce binding (OPEN) |
| **Reconciliation Dependencies** | continuous_reconciliation_orchestrator.mjs (implementation status unconfirmed) |
| **Topology Dependencies** | Single Cloudflare Worker + single D1; any horizontal scaling breaks current invariants |
| **Required Canon Layer** | Distributed consensus gate; topology boundary declaration; convergence proof |
| **Blocking Dependencies** | Topology-Independent Governance Authority (OPEN); Governance Settlement Authority (OPEN) |
| **Governance Risk Level** | CRITICAL |
| **Recommended Issue Umbrella** | Distributed Governance Convergence + Topology Boundary |

### Layer 4: Governance Replay Safety

| Field | Value |
|---|---|
| **Layer Name** | Governance Replay Safety |
| **Current Closure State** | PARTIAL |
| **Established Invariants** | invocation_nonce single-use (PRIMARY KEY); proof_replay_idempotency (UNIQUE decision_hash); authority CONSUMED state; proof deduplication archive |
| **Missing Semantics** | Multi-instance replay safety; governance artifact replay safety (no supersession registry); cross-epoch replay prevention |
| **Failure Conditions** | Nonce consumption race (G-1); governance artifact replay resurrection; stale authority replay across epoch boundary |
| **Replay Dependencies** | Single-instance D1 PRIMARY KEY (CONTAINED); multi-instance (OPEN) |
| **Reconciliation Dependencies** | control_graph_replay.ts; replay_coverage_mapping test |
| **Topology Dependencies** | Single D1 instance; replay safety degrades under horizontal scaling |
| **Required Canon Layer** | Governance epoch semantics; governance supersession registry; distributed nonce serialization |
| **Blocking Dependencies** | Governance Epoch Semantics (OPEN); Governance Supersession Semantics (OPEN) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | Governance Replay Safety + Epoch Semantics |

### Layer 5: Governance Supersession Semantics

| Field | Value |
|---|---|
| **Layer Name** | Governance Supersession Semantics |
| **Current Closure State** | OPEN |
| **Established Invariants** | None established; governance artifacts are updated via source control commits with no formal supersession record |
| **Missing Semantics** | No supersession registry; no signed tombstone protocol; no supersession proof |
| **Failure Conditions** | Governance replay resurrection (prior governance artifact presented as current); stale governance propagation |
| **Replay Dependencies** | None (supersession not implemented) |
| **Reconciliation Dependencies** | None (supersession not reconciled) |
| **Topology Dependencies** | None (supersession not topology-aware) |
| **Required Canon Layer** | governance_supersession_registry (new migration); signed tombstone format; supersession authority |
| **Blocking Dependencies** | Governance Epoch Semantics (OPEN); Governance Authority Lineage (PARTIAL) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | Governance Supersession + Replay Resurrection |

### Layer 6: Governance Epoch Semantics

| Field | Value |
|---|---|
| **Layer Name** | Governance Epoch Semantics |
| **Current Closure State** | OPEN |
| **Established Invariants** | None; `expires_at` field exists on authority objects (local expiry only) |
| **Missing Semantics** | No epoch registry; no epoch transition protocol; no epoch-aware validation gate; no global epoch boundary |
| **Failure Conditions** | Stale governance propagation; cross-epoch authority replay; governance state not invalidated on epoch transition |
| **Replay Dependencies** | Cross-epoch replay not prevented |
| **Reconciliation Dependencies** | No epoch-aware reconciliation |
| **Topology Dependencies** | Epoch transitions cannot be guaranteed to propagate atomically under asynchrony |
| **Required Canon Layer** | governance_epoch_registry (new migration); epoch transition authority; epoch-aware compile gate |
| **Blocking Dependencies** | None (can be implemented independently) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | Governance Epoch Semantics (new issue) |

### Layer 7: Governance Settlement Authority

| Field | Value |
|---|---|
| **Layer Name** | Governance Settlement Authority |
| **Current Closure State** | OPEN |
| **Established Invariants** | Fail-closed default (conflict → NULL); human arbitration via PR process (BREAK_GLASS level) |
| **Missing Semantics** | No conflict detection registry; no formal arbitration protocol; no settlement proof; no propagation protocol |
| **Failure Conditions** | Governance settlement ambiguity; conflicting immutable records with no resolution; liveness failure on conflict |
| **Replay Dependencies** | Settlement decisions have no replay protection (not implemented) |
| **Reconciliation Dependencies** | legitimacy-conflict-arbitration.ts (implementation status unconfirmed) |
| **Topology Dependencies** | Settlement requires all nodes to acknowledge; cannot guarantee under partition |
| **Required Canon Layer** | governance_conflict_registry; arbitration protocol; settlement proof schema |
| **Blocking Dependencies** | Distributed Governance Convergence (OPEN); Governance Conflict Detection (NULL) |
| **Governance Risk Level** | CRITICAL |
| **Recommended Issue Umbrella** | Governance Settlement + Conflict Resolution |

### Layer 8: Topology-Independent Governance Authority

| Field | Value |
|---|---|
| **Layer Name** | Topology-Independent Governance Authority |
| **Current Closure State** | OPEN |
| **Established Invariants** | None; all authority is topology-bound to single D1 instance |
| **Missing Semantics** | No self-contained signed authority bundle; no cross-topology recognition protocol; no federation authority format |
| **Failure Conditions** | Topology-relative governance; authority valid on node A, invalid on node B; D1 unreachability invalidates all in-flight authorities |
| **Replay Dependencies** | Topology-independent replay safety not established |
| **Reconciliation Dependencies** | federated_sovereignty_drift_coordinator.mjs; cross_registry_authority_reconciliation.mjs |
| **Topology Dependencies** | Entirely topology-dependent (by definition of the gap) |
| **Required Canon Layer** | Signed authority bundle format; topology-independent verification algorithm; canonical federation protocol |
| **Blocking Dependencies** | Distributed Governance Convergence (OPEN); Governance Settlement Authority (OPEN) |
| **Governance Risk Level** | CRITICAL |
| **Recommended Issue Umbrella** | Topology-Independent Authority (new issue) |

### Layer 9: Governance Partition-Finality

| Field | Value |
|---|---|
| **Layer Name** | Governance Partition-Finality |
| **Current Closure State** | NULL |
| **Established Invariants** | None; system has no partition-aware governance logic |
| **Missing Semantics** | No partition detection; no split-brain authority resolution; no partition-finality protocol; no quorum |
| **Failure Conditions** | Split-brain governance authority; dual execution of same decision; dual proofs for same authority; partition deadlock |
| **Replay Dependencies** | Partition healing can produce replay conditions not covered by single-instance nonce binding |
| **Reconciliation Dependencies** | No partition-aware reconciliation |
| **Topology Dependencies** | Entirely dependent on single-node assumption; any partition violates all established invariants |
| **Required Canon Layer** | Partition detection protocol; quorum-based authority gate; partition-finality proof; split-brain resolution protocol |
| **Blocking Dependencies** | All other distributed layers (OPEN/NULL); Governance Settlement Authority (OPEN) |
| **Governance Risk Level** | CRITICAL |
| **Recommended Issue Umbrella** | Governance Partition-Finality (new issue) |

### Layer 10: Governance Rollback Impossibility

| Field | Value |
|---|---|
| **Layer Name** | Governance Rollback Impossibility |
| **Current Closure State** | PARTIAL |
| **Established Invariants** | Append-only registries (17 tables); proof immutability; branch protection declared; no direct push to main |
| **Missing Semantics** | No protection against git history rewrite (force push) at root authority level; no protection against D1 database restore from backup; no detection of governance artifact rollback via revert PR |
| **Failure Conditions** | Git force-push by root authority rewrites governance history; D1 backup restore reverts registry state; revert PR re-introduces superseded governance artifact |
| **Replay Dependencies** | Rollback enables replay conditions for superseded governance artifacts |
| **Reconciliation Dependencies** | No rollback detection in reconciliation |
| **Topology Dependencies** | Rollback risk is lower under single-node (single D1 is auditable) but increases under federated topology |
| **Required Canon Layer** | Rollback detection via external audit anchor; revert PR governance check; backup restore governance gate |
| **Blocking Dependencies** | Root Authority Containment (GAP-002, P0) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | GAP-002: Root Authority Containment + Rollback Protection |

### Layer 11: Governance Reconciliation Canon

| Field | Value |
|---|---|
| **Layer Name** | Governance Reconciliation Canon |
| **Current Closure State** | PARTIAL |
| **Established Invariants** | cross_registry_reconciliation_registry (migration 0039); continuous_reconciliation_orchestrator.mjs; reconciliation_scheduler.mjs; cross_registry_authority_reconciliation.mjs; reconciliation_closure_registry (migration 0029) |
| **Missing Semantics** | No canonical ordering for reconciliation events; no reconciliation finality proof; no reconciliation epoch binding; reconciliation conflicts produce no settlement |
| **Failure Conditions** | Reconciliation ordering ambiguity (G-4); reconciliation conflicts with no resolution; reconciliation state diverges across nodes |
| **Replay Dependencies** | Reconciliation events have no replay protection |
| **Reconciliation Dependencies** | Self-referential: reconciliation reconciles reconciliation state |
| **Topology Dependencies** | Reconciliation assumes single D1; cross-instance reconciliation not implemented |
| **Required Canon Layer** | Reconciliation event sequence numbers; reconciliation finality proof; reconciliation epoch binding |
| **Blocking Dependencies** | Governance Epoch Semantics (OPEN); Governance Settlement Authority (OPEN) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | GAP-003: Cross-Registry Reconciliation |

### Layer 12: Recursive Governance Legitimacy

| Field | Value |
|---|---|
| **Layer Name** | Recursive Governance Legitimacy |
| **Current Closure State** | OPEN |
| **Established Invariants** | Bootstrap sovereignty registry (migration 0027); PREO requirement for merges; recursive governance containment model (governance/recursive/); governance mutation capability matrix |
| **Missing Semantics** | No cryptographic anchor for initial governance check state; no out-of-band validation circuit for self-modifying governance; no recursive legitimacy depth limit |
| **Failure Conditions** | Self-modifying governance PR weakens its own check (GAP-005); recursive governance instability under sustained self-modification; bootstrap legitimacy assumed, not verified |
| **Replay Dependencies** | Governance artifact replay at any recursion level re-legitimizes prior superseded governance |
| **Reconciliation Dependencies** | Recursive governance reconciliation not defined |
| **Topology Dependencies** | Recursion is topology-independent but amplifies all topology failures |
| **Required Canon Layer** | Bootstrap hash anchor; out-of-band governance validation circuit; recursion depth bound |
| **Blocking Dependencies** | Policy Mutation Legitimacy (OPEN); Governance Supersession Semantics (OPEN) |
| **Governance Risk Level** | CRITICAL |
| **Recommended Issue Umbrella** | GAP-005: Governance Self-Mutation + Recursive Legitimacy Anchor |

### Layer 13: Governance Proof Lineage

| Field | Value |
|---|---|
| **Layer Name** | Governance Proof Lineage |
| **Current Closure State** | CONTAINED |
| **Established Invariants** | proof_registry UNIQUE(workflow_run_id, decision_hash); proof trigger validates decision_hash = decision_id || char(31) || validated_object_hash; execution_id foreign key (migration 0042); workflow_integrity_lineage (migration 0043); PREO evidence requirement; cryptographic provenance attestations |
| **Missing Semantics** | Cross-topology proof recognition; federated proof anchoring; proof export format for topology-independent verification |
| **Failure Conditions** | Two proofs for same authority under multi-instance race; proof valid in D1 but not recognizable by federated node |
| **Replay Dependencies** | Proof deduplication (CONTAINED for single D1) |
| **Reconciliation Dependencies** | Proof lineage reconciliation via cross_registry_reconciliation_registry |
| **Topology Dependencies** | Single D1 proof store; cross-topology proof recognition not established |
| **Required Canon Layer** | Topology-independent proof format; federated proof anchoring protocol |
| **Blocking Dependencies** | Topology-Independent Governance Authority (OPEN) |
| **Governance Risk Level** | MEDIUM |
| **Recommended Issue Umbrella** | Federated Proof Anchoring (new issue) |

### Layer 14: Governance Mutation Containment

| Field | Value |
|---|---|
| **Layer Name** | Governance Mutation Containment |
| **Current Closure State** | PARTIAL |
| **Established Invariants** | Append-only registries; bypass path classification (24 entries); unauthorized_mutation_closure_registry; production_mutation_containment policy; execution surface inventory |
| **Missing Semantics** | Runtime enforcement of surface inventory (policy-time only, not runtime); drift detection without enforcement gate; mutation containment for governance artifacts themselves (vs. runtime artifacts) |
| **Failure Conditions** | Undeclared surface mutation (detected in BYPASS_PATHS.json but no dynamic enforcement); governance artifact mutation via root authority bypass; detached governance mutation (mutation without lineage) |
| **Replay Dependencies** | Mutation replay via superseded governance artifact |
| **Reconciliation Dependencies** | unauthorized_mutation_closure_registry; surface_inventory_reconciler.mjs |
| **Topology Dependencies** | Containment is policy-enforced only; runtime enforcement does not exist at topology layer |
| **Required Canon Layer** | Runtime surface enforcement gate (Worker route handler); governance artifact mutation containment check |
| **Blocking Dependencies** | GAP-004: Execution Surface Exhaustiveness (P1) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | GAP-004: Execution Surface Exhaustiveness + Runtime Enforcement |

### Layer 15: Distributed Policy Arbitration

| Field | Value |
|---|---|
| **Layer Name** | Distributed Policy Arbitration |
| **Current Closure State** | NULL |
| **Established Invariants** | None; no distributed policy arbitration mechanism exists |
| **Missing Semantics** | No arbitration protocol; no policy priority ordering; no conflict detection; no binding resolution |
| **Failure Conditions** | Policy arbitration ambiguity; two nodes apply different policies to same authority; policy conflict produces inconsistent legitimacy determinations across topology |
| **Replay Dependencies** | Arbitration decisions have no replay protection (not implemented) |
| **Reconciliation Dependencies** | None (arbitration not reconciled) |
| **Topology Dependencies** | Topology-dependent: requires all nodes to receive and acknowledge arbitration result |
| **Required Canon Layer** | Policy priority ordering; conflict detection; arbitration authority; binding resolution protocol |
| **Blocking Dependencies** | Governance Settlement Authority (OPEN); Distributed Governance Convergence (OPEN); Topology-Independent Authority (OPEN) |
| **Governance Risk Level** | CRITICAL |
| **Recommended Issue Umbrella** | Distributed Policy Arbitration (new issue) |

### Layer 16: Governance Continuity Inheritance

| Field | Value |
|---|---|
| **Layer Name** | Governance Continuity Inheritance |
| **Current Closure State** | PARTIAL |
| **Established Invariants** | continuity_registry with lineage tracking; session → continuity → authority dependency chain; continuity_lineage_closure_hardening.ts; continuity-lineage-identity-convergence test |
| **Missing Semantics** | No formal continuity inheritance protocol for governance mutations (what continuity does a new governance artifact inherit from prior?); no cross-epoch continuity handoff |
| **Failure Conditions** | Governance authority orphaning on continuity chain break; continuity revocation invalidates all downstream governance; no recovery path for orphaned governance continuity |
| **Replay Dependencies** | Prior continuity replay can re-legitimate orphaned governance |
| **Reconciliation Dependencies** | Continuity reconciliation via cross-registry reconciliation |
| **Topology Dependencies** | Continuity is D1-local; cross-topology continuity inheritance not established |
| **Required Canon Layer** | Governance continuity inheritance protocol; cross-epoch continuity handoff; orphaned governance detection |
| **Blocking Dependencies** | Governance Epoch Semantics (OPEN); Governance Authority Lineage (PARTIAL) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | GAP-001: Identity Continuity Hardening |

### Layer 17: Governance Temporal Determinism

| Field | Value |
|---|---|
| **Layer Name** | Governance Temporal Determinism |
| **Current Closure State** | PARTIAL |
| **Established Invariants** | `expires_at` on authority objects; `created_at` on registries; temporal_lineage_replay_inspector.ts; temporal-lineage test fixtures; temporal-legitimacy-replay-visualization.ts |
| **Missing Semantics** | No trusted time source; `datetime('now')` is node-local and unverifiable; no temporal ordering guarantee across nodes; no temporal attestation |
| **Failure Conditions** | Clock skew between nodes produces inconsistent temporal determinations; authority appears expired on one node and valid on another; temporal replay (authority re-presented before its local expiry has propagated) |
| **Replay Dependencies** | Temporal replay is a subset of governance replay; epoch semantics would bound temporal replay |
| **Reconciliation Dependencies** | Temporal reconciliation not established |
| **Topology Dependencies** | SQLite `datetime('now')` is node-local; no NTP attestation or trusted time oracle |
| **Required Canon Layer** | Trusted time attestation; temporal ordering protocol; clock skew tolerance declaration |
| **Blocking Dependencies** | Governance Epoch Semantics (OPEN) |
| **Governance Risk Level** | HIGH |
| **Recommended Issue Umbrella** | Governance Temporal Determinism (new issue) |

### Layer 18: Governance Conflict Settlement

| Field | Value |
|---|---|
| **Layer Name** | Governance Conflict Settlement |
| **Current Closure State** | NULL |
| **Established Invariants** | Fail-closed default (conflict → NULL); human arbitration at BREAK_GLASS level |
| **Missing Semantics** | No formal conflict settlement; no settlement proof; no propagation protocol; no settlement authority (distinct from conflicting authorities) |
| **Failure Conditions** | Governance settlement ambiguity; conflicting immutable records coexist with no resolution; liveness failure under sustained conflict; governance deadlock |
| **Replay Dependencies** | Settlement decisions have no replay protection (not implemented) |
| **Reconciliation Dependencies** | No settlement reconciliation |
| **Topology Dependencies** | Settlement requires all-nodes acknowledgment; cannot guarantee under partition |
| **Required Canon Layer** | governance_conflict_registry; settlement authority designation; settlement proof schema; propagation and acknowledgment protocol |
| **Blocking Dependencies** | All distributed layers (NULL/OPEN); Governance Settlement Authority (OPEN); Governance Conflict Detection (NULL) |
| **Governance Risk Level** | CRITICAL |
| **Recommended Issue Umbrella** | Governance Conflict Settlement (new issue) |

---

*This document is a NON_OPERATIVE_GOVERNANCE_ARTIFACT. It describes observed governance closure states. It does not grant authority, create policy, or authorize any execution. All closure targets require formal governance process to implement.*
