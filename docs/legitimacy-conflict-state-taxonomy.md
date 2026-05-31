# Legitimacy Conflict State Taxonomy

**Artifact Type:** Planning — NON_OPERATIVE  
**Status:** NON_OPERATIVE — documentation only  
**Issue:** #1643  
**Parent:** #1640 Runtime Topology Intelligence Planning, #1641 Classified Observation Object Spec, #1642 Topology Emission Boundary Planning

---

## Purpose

This document defines canonical conflict-state vocabulary for Runtime Topology Intelligence and distributed reconciliation planning. It establishes precise meanings for each conflict state, distinguishes superficially similar states, and specifies their effects on execution eligibility, propagation, and reconciliation requirements.

---

## WARNING

> **Ambiguity must be classified, not collapsed into legitimacy.**  
> **Observation uncertainty ≠ legitimacy failure.**  
> **Temporary partition ≠ permanent unresolved state.**  
> **Proof absence ≠ proof invalidity.**  
> **Lineage missing ≠ lineage revoked.**  
> **Local unknown ≠ topology-wide conflict.**  
> **Evidence conflict ≠ deterministic convergence.**

No conflict state grants execution eligibility. Conflict states are classifications of uncertainty or failure. Resolution of a conflict state does not independently create authority.

---

## Core Invariant

```text
Ambiguity must be classified, not collapsed into legitimacy.
```

Every ambiguous or conflicting observation must be assigned an exact conflict-state label. Vague failure states or synthetic convergence are prohibited.

---

## Taxonomy

### LEGITIMACY_UNKNOWN

**Definition:** The local node lacks sufficient verified lineage evidence to produce any legitimacy classification for the observed object.

**Distinction from UNRESOLVED:** LEGITIMACY_UNKNOWN precedes any reconciliation attempt. No reconciliation has been initiated or attempted. Evidence is absent or too sparse for evaluation to begin. UNRESOLVED arises after reconciliation has been attempted and found inconclusive.

**Triggering Conditions:**
- No lineage evidence present at local node
- Topology snapshot insufficient to reach a lineage anchor
- Object observed but proof chain not yet propagated to local node
- First observation of an object before any reconciliation cycle

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `evidence_inventory`: list of evidence types present (may be empty)
- `last_reconciliation_attempt`: null (none attempted)

**Execution Eligibility Effect:** NULL. No eligibility determination possible.

**Propagation Effect:** Propagate as LEGITIMACY_UNKNOWN. Do not suppress. Receiving nodes must not interpret absence of classification as legitimacy.

**Reconciliation Requirement:** Initiate lineage fetch. If evidence arrives and reconciliation completes deterministically, transition out of LEGITIMACY_UNKNOWN. If reconciliation is attempted and inconclusive, transition to UNRESOLVED.

**Example Classified Observation Object:**
```json
{
  "object_id": "deploy-abc123",
  "conflict_state": "LEGITIMACY_UNKNOWN",
  "observation_timestamp": "2026-05-31T00:00:00Z",
  "source_node_id": "node-7",
  "evidence_inventory": [],
  "last_reconciliation_attempt": null,
  "execution_eligibility": "NULL"
}
```

---

### UNRESOLVED

**Definition:** Reconciliation has been attempted, but available evidence is insufficient for deterministic legitimacy classification.

**Distinction from LEGITIMACY_UNKNOWN:** UNRESOLVED follows at least one reconciliation attempt. Evidence exists but is contradictory, incomplete, or inconclusive. LEGITIMACY_UNKNOWN means no reconciliation has been attempted yet.

**Distinction from CONFLICTED:** UNRESOLVED means evidence is insufficient to classify — there may be no competing roots, just missing or ambiguous evidence. CONFLICTED means competing artifacts or observations produce incompatible classifications simultaneously.

**Triggering Conditions:**
- Reconciliation attempted; evidence threshold not reached
- Lineage anchor found but proof chain incomplete
- Quorum evidence present but below policy threshold
- Topology partially visible; global confirmation not possible

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `evidence_inventory`: list of evidence types present
- `last_reconciliation_attempt`: timestamp of most recent attempt
- `reconciliation_attempt_count`
- `evidence_gap_description`: why evidence is insufficient

**Execution Eligibility Effect:** NULL. Suspended pending resolution.

**Propagation Effect:** Propagate as UNRESOLVED with evidence inventory. Receiving nodes must not upgrade to any valid state without fresh evidence.

**Reconciliation Requirement:** Retry reconciliation. Escalate to CONFLICTED if competing roots are discovered. Transition to LEGITIMACY_UNKNOWN is not permitted (state may not regress to pre-reconciliation classification).

**Resolvable by Lineage Recovery:** Yes, if missing lineage evidence arrives and reconciliation can complete deterministically.

---

### CONFLICTED

**Definition:** Multiple observations or artifacts produce incompatible legitimacy classifications simultaneously, indicating a real split in the distributed view.

**Distinction from UNRESOLVED:** CONFLICTED means two or more competing valid-looking claims exist and cannot both be true. UNRESOLVED means the evidence is insufficient to classify — there is no second competing claim, just absence or ambiguity.

**Distinction from AUTHORITY_DIVERGENCE:** CONFLICTED applies at the observation or artifact level (competing observations of the same object). AUTHORITY_DIVERGENCE applies at the authority-lineage level (competing legitimate authority chains).

**Triggering Conditions:**
- Two or more nodes report incompatible legitimacy states for the same object
- Competing proof artifacts exist with valid signatures but incompatible claims
- Split-brain registry state produces two legitimate-looking roots

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `conflicting_claims`: list of competing claim identifiers and their sources
- `conflict_set_id`
- `settlement_status`: `PENDING` | `IN_PROGRESS` | `NULL`

**Execution Eligibility Effect:** NULL. Execution suspended for all parties to the conflict until settlement.

**Propagation Effect:** Propagate as CONFLICTED with full conflict-set metadata. Do not suppress either claim. Both claims must be preserved for settlement evaluation.

**Reconciliation Requirement:** Initiate conflict-set settlement. Requires precedence artifact evaluation. Cannot be resolved by lineage recovery alone.

**Resolvable by Lineage Recovery:** No. Requires precedence artifact evaluation.

**Requires Precedence Artifact Evaluation:** Yes.

---

### PARTITION_SUSPECTED

**Definition:** Missing lineage or proof may be caused by partial topology visibility rather than actual absence or revocation. The node cannot distinguish between network partition and genuine proof absence.

**Distinction from PARTITION_CONFIRMED:** PARTITION_SUSPECTED is a hypothesis based on circumstantial evidence (topology gaps, unreachable nodes, quorum gaps). PARTITION_CONFIRMED is established when positive partition evidence is collected (e.g., explicit unreachability confirmation, conflicting epoch reports from multiple nodes).

**Distinction from LEGITIMACY_FAILURE:** PARTITION_SUSPECTED explicitly preserves the possibility that the legitimacy claim is valid but temporarily invisible. LEGITIMACY_FAILURE (NULL state) means a required invariant has been determined to be false.

**Triggering Conditions:**
- One or more topology nodes unreachable
- Quorum attestation gap (expected validators not responding)
- Lineage or proof missing but node reachability incomplete
- Topology snapshot delta shows node disappearance

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `unreachable_nodes`: list of nodes not responding
- `topology_snapshot_timestamp`
- `partition_hypothesis_basis`: description of circumstantial evidence

**Execution Eligibility Effect:** Suspended (not NULL). Execution must not proceed until partition hypothesis is resolved.

**Propagation Effect:** Propagate as PARTITION_SUSPECTED. Do not treat as NULL. Do not treat as valid.

**Reconciliation Requirement:** Await topology restoration or collect positive partition evidence to transition to PARTITION_CONFIRMED.

**Resolvable by Lineage Recovery:** Potentially, if partition heals and missing evidence arrives.

---

### PARTITION_CONFIRMED

**Definition:** Partition evidence is positively confirmed. Topology is definitively split, preventing global legitimacy verification. The object cannot reach GLOBAL_VALID until partition heals.

**Triggering Conditions:**
- Multiple nodes independently confirm unreachability of the same set of nodes
- Conflicting epoch reports received from nodes on different partition sides
- Explicit partition detection signal from topology monitoring layer

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `partition_evidence`: collected confirmation evidence
- `affected_nodes`
- `partition_onset_timestamp`

**Execution Eligibility Effect:** NULL for global execution. May allow LOCAL_VALID execution if domain policy permits bounded local acceptance.

**Propagation Effect:** Propagate as PARTITION_CONFIRMED with partition evidence. Local partition views may diverge.

**Reconciliation Requirement:** No reconciliation possible until partition heals. Upon healing, fresh topology-visible quorum evidence required before any upgrade.

---

### LINEAGE_MISSING

**Definition:** The required lineage chain for the observed object cannot be located in any accessible topology node. No revocation signal is present — lineage is simply absent.

**Distinction from LINEAGE_STALE:** LINEAGE_MISSING means the lineage cannot be found at all. LINEAGE_STALE means lineage was found but its epoch or freshness is beyond the allowed staleness horizon.

**Distinction from LINEAGE_CONFLICTED:** LINEAGE_MISSING means no lineage is present. LINEAGE_CONFLICTED means multiple incompatible lineage chains are present.

**Distinction from REVOKED_LINEAGE_DETECTED:** LINEAGE_MISSING means the lineage is absent with no revocation signal. REVOKED_LINEAGE_DETECTED means a revocation artifact or signal is positively present.

**Triggering Conditions:**
- Lineage anchor not found in accessible topology
- Proof chain has a missing predecessor edge
- Object references a parent lineage node that does not exist in the registry

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `missing_lineage_anchor`: identifier of the expected but absent lineage node
- `last_known_lineage_timestamp`

**Execution Eligibility Effect:** NULL.

**Propagation Effect:** Propagate as LINEAGE_MISSING. Do not infer legitimacy from absence.

**Reconciliation Requirement:** Lineage recovery must be attempted. Transition to LEGITIMACY_UNKNOWN or UNRESOLVED if recovery is inconclusive. Transition to a valid state only if lineage is fully recovered and all predicates are satisfied.

**Resolvable by Lineage Recovery:** Yes, if lineage evidence arrives.

---

### LINEAGE_STALE

**Definition:** Lineage was found but its epoch or freshness timestamp is beyond the allowed staleness horizon. The lineage is visible but ineligible.

**Distinction from LINEAGE_MISSING:** LINEAGE_STALE means the lineage exists but is outdated. LINEAGE_MISSING means no lineage is present.

**Triggering Conditions:**
- Lineage epoch does not match current epoch
- Lineage freshness timestamp exceeds policy staleness bound
- Epoch has advanced without lineage renewal

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `lineage_epoch`: epoch recorded in the stale lineage
- `current_epoch`
- `staleness_delta`

**Execution Eligibility Effect:** NULL. Stale lineage is ineligible for any execution claim.

**Propagation Effect:** Propagate as LINEAGE_STALE (equivalent to STALE_VISIBLE). Do not treat as current.

**Reconciliation Requirement:** A new lineage with current epoch is required. Recovery of the old lineage does not resolve this state.

**Resolvable by Lineage Recovery:** No. A new object or renewed lineage is required.

---

### LINEAGE_CONFLICTED

**Definition:** Multiple incompatible lineage chains exist for the same object. At least two distinct lineage anchors claim authority over the same object, and they cannot both be valid.

**Triggering Conditions:**
- Two or more lineage anchors found for the same object in different registry shards
- Lineage graph traversal finds a fork with two valid-looking branches

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `conflicting_lineage_anchors`: list of competing lineage identifiers
- `conflict_set_id`

**Execution Eligibility Effect:** NULL.

**Propagation Effect:** Propagate as LINEAGE_CONFLICTED with full conflict metadata. Both branches must be preserved.

**Reconciliation Requirement:** Requires precedence artifact evaluation to determine which lineage is authoritative. Cannot be resolved by lineage recovery alone.

**Resolvable by Lineage Recovery:** No. Requires precedence artifact evaluation.

**Requires Precedence Artifact Evaluation:** Yes.

---

### PROOF_MISSING

**Definition:** The required proof artifact for the observed object is absent. No invalid proof is present — proof is simply not found.

**Distinction from PROOF_INVALID:** PROOF_MISSING means no proof artifact is present. PROOF_INVALID means a proof artifact exists but fails verification.

**Distinction from PROOF_DIVERGENCE:** PROOF_MISSING means proof is absent. PROOF_DIVERGENCE means multiple proof artifacts are present with incompatible claims.

**Triggering Conditions:**
- Required proof artifact not found in accessible topology
- Proof chain has a missing node
- Object claims proof binding that is not present

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `expected_proof_id`: identifier of the expected proof artifact
- `proof_type`: type of proof expected

**Execution Eligibility Effect:** NULL.

**Propagation Effect:** Propagate as PROOF_MISSING. Do not infer validity from absence.

**Reconciliation Requirement:** Proof fetch must be attempted. If proof arrives and passes verification, state may be resolved. If proof cannot be found after exhaustive topology search, escalate to NULL.

**Resolvable by Lineage Recovery:** Potentially, if proof artifact is co-located with lineage evidence.

---

### PROOF_INVALID

**Definition:** A proof artifact for the observed object is present but fails cryptographic or semantic verification.

**Distinction from PROOF_MISSING:** PROOF_INVALID means the proof exists but is wrong. PROOF_MISSING means no proof exists.

**Triggering Conditions:**
- Proof signature verification fails
- Proof binds to a different object or epoch than claimed
- Proof predicate evaluation returns false

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `proof_id`
- `verification_failure_reason`

**Execution Eligibility Effect:** NULL. An invalid proof is equivalent to no proof.

**Propagation Effect:** Propagate as PROOF_INVALID with verification failure details. Do not suppress.

**Reconciliation Requirement:** No recovery possible from PROOF_INVALID. A new proof is required.

**Resolvable by Lineage Recovery:** No. A new proof artifact is required.

---

### PROOF_DIVERGENCE

**Definition:** Multiple proof artifacts are present for the same object, and they produce incompatible claims. At least two proofs exist, each valid in isolation, but they cannot both be correct.

**Triggering Conditions:**
- Two or more proof artifacts found for the same object with incompatible epoch, hash, or predicate bindings
- Proof divergence signal emitted by proof comparison layer

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `divergent_proof_ids`: list of competing proof identifiers
- `divergence_description`: what claims are incompatible

**Execution Eligibility Effect:** NULL.

**Propagation Effect:** Propagate as PROOF_DIVERGENCE with all divergent proof identifiers.

**Reconciliation Requirement:** Requires precedence artifact evaluation to determine which proof is authoritative.

**Requires Precedence Artifact Evaluation:** Yes.

---

### REVOKED_LINEAGE_DETECTED

**Definition:** A revocation artifact or revocation signal is present and indicates that the lineage for this object has been revoked. Revocation must be verified before final invalidation.

**Distinction from LINEAGE_MISSING:** REVOKED_LINEAGE_DETECTED means a positive revocation signal exists. LINEAGE_MISSING means lineage is absent with no revocation signal.

**Triggering Conditions:**
- Revocation artifact found in revocation registry
- Revocation signal propagated from authority node
- Lineage node explicitly marked as revoked in topology

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `revocation_artifact_id`
- `revocation_signal_source`
- `revocation_verification_status`: `PENDING` | `CONFIRMED` | `DISPUTED`

**Execution Eligibility Effect:** NULL while verification is pending. NULL permanently upon confirmation.

**Propagation Effect:** Propagate as REVOKED_LINEAGE_DETECTED. Do not suppress. All nodes must process the revocation signal.

**Reconciliation Requirement:** Verify revocation artifact. If confirmed, transition to NULL (terminal). If disputed, transition to LINEAGE_CONFLICTED for precedence evaluation.

**Resolvable by Lineage Recovery:** No. A revocation signal overrides lineage recovery.

---

### AUTHORITY_DIVERGENCE

**Definition:** Two or more competing legitimate authority chains exist for the same object. The divergence is at the authority level, not merely the observation or proof level.

**Distinction from CONFLICTED:** AUTHORITY_DIVERGENCE is a specific class of CONFLICTED where the conflict is between authority chains rather than individual observations or artifacts.

**Triggering Conditions:**
- Two or more authority lineages both satisfy required predicates for the same object
- Authority fork detected in root authority registry
- Competing root authority claims received from different federation members

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `divergent_authority_chains`: list of competing authority identifiers
- `divergence_detection_method`

**Execution Eligibility Effect:** NULL. No execution possible while authority is diverged.

**Propagation Effect:** Propagate as AUTHORITY_DIVERGENCE. Both chains must be preserved for settlement.

**Reconciliation Requirement:** Requires precedence artifact evaluation at the authority level. Cannot be resolved by lineage recovery or proof fetch alone.

**Resolvable by Lineage Recovery:** No. Requires authority-level precedence evaluation.

**Requires Precedence Artifact Evaluation:** Yes.

---

### REPLAY_DIVERGENCE

**Definition:** Competing replay records or replay identifiers exist for the same execution slot. Two or more replay artifacts claim authority over the same replay position, indicating a potential double-execution or replay collision.

**Triggering Conditions:**
- Two or more replay identifiers map to the same execution slot
- Replay convergence check detects conflicting replay state across nodes
- Replay nonce collision detected

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `conflicting_replay_ids`: list of competing replay identifiers
- `execution_slot_id`
- `replay_collision_evidence`

**Execution Eligibility Effect:** NULL. All parties to the replay collision are ineligible for execution.

**Propagation Effect:** Propagate as REPLAY_DIVERGENCE with full collision evidence.

**Reconciliation Requirement:** Requires precedence artifact evaluation to determine which replay record is authoritative. The losing replay record must be permanently invalidated.

**Requires Precedence Artifact Evaluation:** Yes.

---

### TOPOLOGY_DRIFT

**Definition:** The topology view at the local node has diverged from the topology view at one or more remote nodes. The divergence may not indicate a legitimacy failure, but it prevents global legitimacy verification until the topology view is reconciled.

**Distinction from PARTITION_SUSPECTED:** TOPOLOGY_DRIFT means topology views are inconsistent but network connectivity may be intact. PARTITION_SUSPECTED means topology visibility is incomplete due to suspected network partition.

**Triggering Conditions:**
- Topology snapshot hash mismatch between nodes
- Topology inventory differs in node count or edge set
- Epoch disagreement in topology snapshot

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `local_topology_hash`
- `remote_topology_hash`
- `drift_delta_description`

**Execution Eligibility Effect:** GLOBAL_VALID blocked. LOCAL_VALID may remain depending on domain policy.

**Propagation Effect:** Propagate as TOPOLOGY_DRIFT with hash comparison evidence.

**Reconciliation Requirement:** Topology reconciliation required before global legitimacy classification can proceed. Topology must converge to a consistent hash before CONVERGENCE_VALID can be evaluated.

**Resolvable by Lineage Recovery:** No. Topology reconciliation is a separate process from lineage recovery.

---

### CLASSIFICATION_CONFLICT

**Definition:** Two or more classification subsystems or nodes have independently classified the same object with incompatible legitimacy states that cannot both be correct simultaneously.

**Distinction from CONFLICTED:** CONFLICTED refers to conflicting observations or artifacts about an object's underlying state. CLASSIFICATION_CONFLICT refers to conflicting outputs of the classification process itself, which may arise from different evidence sets, classification versions, or policy divergence.

**Triggering Conditions:**
- Node A classifies object as GLOBAL_VALID; Node B classifies same object as NULL
- Classification version mismatch produces incompatible outputs for the same evidence
- Federation member applies different policy thresholds, producing incompatible results

**Required Metadata:**
- `observation_timestamp`
- `source_node_id`
- `conflicting_classifications`: list of `{node_id, classification, policy_version}` tuples
- `classification_basis_delta`: description of what differs between the classification inputs

**Execution Eligibility Effect:** NULL. Classification conflict is treated as AMBIGUOUS until resolved.

**Propagation Effect:** Propagate as CLASSIFICATION_CONFLICT with full classification comparison.

**Reconciliation Requirement:** Determine whether the conflict arises from evidence divergence (resolve by evidence reconciliation) or policy divergence (resolve by policy alignment). Requires precedence artifact evaluation if evidence is identical but classifications differ.

**Resolvable by Lineage Recovery:** Possibly, if the conflict stems from one node having incomplete lineage evidence.

**Requires Precedence Artifact Evaluation:** Conditionally — if evidence is identical but classifications still differ.

---

## Execution Eligibility Summary

| Conflict State | Execution Eligibility | Suspends | Invalidates |
|---------------|----------------------|----------|-------------|
| LEGITIMACY_UNKNOWN | NULL | Yes | No |
| UNRESOLVED | NULL | Yes | No |
| CONFLICTED | NULL | Yes | No (pending settlement) |
| PARTITION_SUSPECTED | Suspended | Yes | No |
| PARTITION_CONFIRMED | NULL (global); LOCAL_VALID possible | Yes | No (global) |
| LINEAGE_MISSING | NULL | Yes | No |
| LINEAGE_STALE | NULL | No | Yes |
| LINEAGE_CONFLICTED | NULL | Yes | No (pending settlement) |
| PROOF_MISSING | NULL | Yes | No |
| PROOF_INVALID | NULL | No | Yes |
| PROOF_DIVERGENCE | NULL | Yes | No (pending settlement) |
| REVOKED_LINEAGE_DETECTED | NULL (pending/confirmed) | Yes | Yes (on confirmation) |
| AUTHORITY_DIVERGENCE | NULL | Yes | No (pending settlement) |
| REPLAY_DIVERGENCE | NULL | Yes | No (pending settlement) |
| TOPOLOGY_DRIFT | GLOBAL_VALID blocked | Yes (global) | No |
| CLASSIFICATION_CONFLICT | NULL (treated as AMBIGUOUS) | Yes | No |

**Suspends:** Execution is suspended pending resolution. The object may become eligible upon resolution.  
**Invalidates:** Execution eligibility is permanently removed regardless of resolution.

---

## Reconciliation Requirement Summary

| Conflict State | Resolvable by Lineage Recovery | Requires Precedence Artifact Evaluation |
|---------------|-------------------------------|----------------------------------------|
| LEGITIMACY_UNKNOWN | Yes | No |
| UNRESOLVED | Yes | No |
| CONFLICTED | No | Yes |
| PARTITION_SUSPECTED | Potentially | No |
| PARTITION_CONFIRMED | No (partition must heal) | No |
| LINEAGE_MISSING | Yes | No |
| LINEAGE_STALE | No (new object required) | No |
| LINEAGE_CONFLICTED | No | Yes |
| PROOF_MISSING | Potentially | No |
| PROOF_INVALID | No (new proof required) | No |
| PROOF_DIVERGENCE | No | Yes |
| REVOKED_LINEAGE_DETECTED | No | No (revocation overrides) |
| AUTHORITY_DIVERGENCE | No | Yes |
| REPLAY_DIVERGENCE | No | Yes |
| TOPOLOGY_DRIFT | No (topology reconciliation required) | No |
| CLASSIFICATION_CONFLICT | Possibly | Conditionally |

---

## Key Distinctions

### Observation uncertainty vs. legitimacy failure

- **Observation uncertainty**: LEGITIMACY_UNKNOWN, UNRESOLVED, PARTITION_SUSPECTED, LINEAGE_MISSING, PROOF_MISSING — the legitimacy claim may be valid but cannot yet be confirmed. These states suspend rather than invalidate.
- **Legitimacy failure**: PROOF_INVALID, LINEAGE_STALE, REVOKED_LINEAGE_DETECTED (confirmed) — the legitimacy claim has been determined to be invalid. These states invalidate.

### Temporary partition vs. permanent unresolved state

- **Temporary**: PARTITION_SUSPECTED, PARTITION_CONFIRMED — partition conditions may heal, restoring eligibility for verification.
- **Permanent**: LINEAGE_STALE, PROOF_INVALID — these states cannot be reversed by reconciliation. A new object is required.

### Proof absence vs. proof invalidity

- **PROOF_MISSING**: no proof artifact found; recovery possible if proof propagates.
- **PROOF_INVALID**: proof found but verification fails; no recovery, new proof required.

### Lineage missing vs. lineage revoked

- **LINEAGE_MISSING**: lineage absent with no revocation signal; recovery possible.
- **REVOKED_LINEAGE_DETECTED**: positive revocation signal present; revocation takes precedence over lineage recovery.

### Local unknown vs. topology-wide conflict

- **LEGITIMACY_UNKNOWN**: local node lacks evidence; may not reflect global state.
- **CONFLICTED**, **AUTHORITY_DIVERGENCE**, **CLASSIFICATION_CONFLICT**: conflict is topology-wide; multiple nodes are in disagreement.

### Evidence conflict vs. deterministic convergence

- **Evidence conflict**: CONFLICTED, LINEAGE_CONFLICTED, PROOF_DIVERGENCE, AUTHORITY_DIVERGENCE — competing claims exist simultaneously.
- **Deterministic convergence**: achievable only after settlement confirms a single authoritative claim and all competing claims are invalidated.

---

## Propagation Rules

1. No conflict state may be suppressed or silently dropped during propagation.
2. Receiving nodes must not upgrade a conflict state to a valid state without fresh evidence.
3. LEGITIMACY_UNKNOWN must not be interpreted as NULL or as a valid state.
4. States involving competing claims (CONFLICTED, LINEAGE_CONFLICTED, PROOF_DIVERGENCE, AUTHORITY_DIVERGENCE) must propagate all competing claim identifiers.
5. REVOKED_LINEAGE_DETECTED propagates with highest priority; it overrides any co-propagated valid classification.
6. PARTITION_CONFIRMED propagates with partition evidence; receiving nodes in different partition shard may see different views.

---

## Non-Goals

- No implementation.
- No runtime mutation.
- No authority creation.
- No proof generation.
- No reconciliation execution claim.
- No topology convergence claim.

This document is planning-only and does not imply execution eligibility or legitimacy state change for any object.

---

## Cross-References

| Document | Relation |
|----------|---------|
| `docs/stage2-legitimacy-vocabulary.md` | Canonical 12-state legitimacy vocabulary; conflict states are sub-classifications within AMBIGUOUS and NULL |
| `docs/reconciliation-state-machine.md` | Reconciliation transitions that consume conflict states |
| `PARTITION_FINALITY_SEMANTICS.md` | Partition-finality state machine; PARTITION_SUSPECTED and PARTITION_CONFIRMED feed into this |
| `docs/topology-visibility-semantics.md` | Topology visibility as classification gate; TOPOLOGY_DRIFT relates to topology snapshot hash mismatch |
| `runtime/legitimacy/` | Runtime legitimacy enforcement modules |
| `governance/SOVEREIGNTY_DRIFT_TAXONOMY.json` | Sovereignty drift taxonomy; AUTHORITY_DIVERGENCE relates to sovereignty drift classes |
