# Stage 2 Distributed Legitimacy Enforcement Plan v1

**Artifact Type:** Stage 2 Distributed Legitimacy Enforcement Plan  
**Status:** NON_OPERATIVE PLANNING ARTIFACT  
**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** `claude/stage2-distributed-legitimacy-plan-2qUYH`  
**Date:** 2026-05-26

---

## Context

Stage 1 governed CI/CD enforcement was completed and merged via PR #1439 (2026-05-26), closing issues #1432–#1437. Stage 1 proved `validated_object_hash == executed_object_hash` within a single governed CI/CD surface.

Stage 2 must determine whether distributed legitimacy can remain deterministic when multiple validators, registries, proofs, replay records, topology observers, and reconciliation paths disagree under partial visibility, stale lineage, replay pressure, topology fragmentation, asynchronous reconciliation, partition conditions, and causal ambiguity.

This plan maps the existing substrate, defines the canonical state vocabulary, formalizes all required semantic models, sequences implementation slices, and identifies gaps. It does not implement, mutate, deploy, create authority, or claim distributed convergence is established.

---

## 1. Executive Determination

**Stage 2 Readiness Classification: PARTIAL**

### What Stage 1 Closed
- Governed execution hash binding enforcement (`validated_object_hash == executed_object_hash`) within one governed CI/CD surface
- Replay consumption registry runtime enforcement
- Governed proof artifact writer and persistence runtime
- Direct deploy bypass detection and audit runtime
- Local validator invocation adapter with VALID/NULL semantics
- Full CONF-CICD-01 through CONF-CICD-15 conformance suite

### What Stage 2 Must Now Prove
- Local correctness does NOT imply distributed legitimacy coherence
- `LOCAL_VALID` cannot silently become `GLOBAL_VALID` without topology-visible convergence evidence
- Consumed replay eligibility remains consumed across partition heal, reconciliation, and anti-entropy repair
- Conflict-set settlement preserves losing branch evidence
- Proof visibility does not create authority
- Reconciliation cannot create authority
- Epoch mismatch prevents `CONVERGENCE_VALID`
- All finality classifications remain recursively reconcilable

### What Must Remain NULL Until Distributed Convergence Is Established
- Execution eligibility under partition-local proof only
- `GLOBAL_VALID` classification without topology-visible quorum evidence
- `CONVERGENCE_VALID` without epoch binding
- Replay eligibility after any replay consumption event (including under partition or stale registry)
- Settlement finality without conflict-set evidence preservation

---

## 2. Stage 2 Scope Boundary

### Includes
- Distributed validator evidence (ValidatorAttestationEnvelope)
- Topology-visible finality classification (LOCAL_VALID / GLOBAL_VALID distinction)
- Partition-finality ambiguity model
- Distributed replay convergence and anti-entropy repair rules
- Proof-finality convergence (downgrade / upgrade events, append-only)
- Conflict-set detection, preservation, and settlement
- Epoch / settlement / convergence coupling
- Reconciliation state machine (OBSERVED → FINALIZED / NULL)
- Causal legitimacy clocks and happens-before ordering
- Cross-registry reconciliation determinism
- Revocation liveness downgrade propagation
- Stage 2 conformance matrix (CONF-DIST-01 through CONF-DIST-15)

### Excludes
- Production deployment
- Authority creation of any kind
- Consensus protocol implementation (separately scopeable)
- Hosted federation service
- Enterprise platformization
- Phase 3 external adoption (#1419–#1428)
- Distributed cognition convergence (#1416, #1407) — deferred to Phase 2+ or Phase 3

---

## 3. Current Repo Substrate Map

### Finality Classification Registry
- **Status:** PARTIAL
- **Files:** `src/lib/finality-classification.ts`, `migrations/0048_finality_classification_registry.sql`, `tests/fate/issue-1340-finality-classification-registry.test.mjs`
- **Issues:** #1340 (OPEN)
- **Gaps:** No GLOBAL_VALID guard requiring topology-visible convergence evidence; no epoch-binding check; no CONVERGENCE_VALID state; CONF-DIST-01 fixture missing

### Partition-Finality Semantics
- **Status:** PARTIAL
- **Files:** `PARTITION_FINALITY_SEMANTICS.md`, `docs/distributed-finality-arbitration-canon.md`, `docs/epoch-fork-stale-majority-failure-canon.md`, `sandbox/distributed/partition-sim.ts`
- **Issues:** #1337 (closed/duplicate), #1418 (OPEN — frontier closure)
- **Gaps:** No runtime finality downgrade event emission; partition detection inputs not wired to classification registry

### Epoch Registry
- **Status:** PRESENT
- **Files:** `src/lib/epoch-substrate.ts`, `migrations/0052_epoch_registry.sql`, `tests/fate/issue-1249-epoch-registry.test.mjs`, `docs/epoch-substrate-semantics.md`, `docs/epoch-reconciliation-settlement-semantics.md`, `docs/epoch-replay-convergence-semantics.md`
- **Issues:** Referenced by #1418
- **Gaps:** Epoch ↔ settlement ↔ CONVERGENCE_VALID coupling not enforced in classification registry

### Conflict-Set Registry
- **Status:** PRESENT
- **Files:** `src/lib/conflict-set.ts`, `migrations/0049_conflict_set_registry.sql`, `tests/fate/issue-1342-conflict-set-registry.test.mjs`
- **Issues:** #1348 (OPEN)
- **Gaps:** No ConflictSetEnvelope typed object; losing-branch evidence retention rule not enforced; no CONF-DIST-10 fixture

### Quorum Attestation Envelope
- **Status:** PARTIAL
- **Files:** `src/lib/quorum-attestation.ts`, `migrations/0050_quorum_attestation_registry.sql`, `tests/fate/issue-1343-quorum-attestation-registry.test.mjs`
- **Issues:** Not covered by a dedicated open issue at envelope-object level
- **Gaps:** ValidatorAttestationEnvelope not defined as typed object; no CONF-DIST-06 fixture; federation topology snapshot missing

### Distributed Replay Convergence
- **Status:** PRESENT
- **Files:** `src/distributed-replay-convergence.ts`, `src/lib/replay-convergence.ts`, `tests/fate/issue-1347-replay-convergence.test.mjs`, `sandbox/distributed/replay-race.ts`, `tests/issue-1152-distributed-replay-convergence.test.mjs`
- **Issues:** #1347 (OPEN)
- **Gaps:** Anti-entropy repair rules not formalized; replay resurrection detection incomplete; CONF-DIST-03 and CONF-DIST-15 fixtures missing

### Topology Intelligence
- **Status:** PRESENT
- **Files:** `src/runtime-topology-intelligence.ts`, `runtime-topology.json`, `graph/runtime-topology-extractor.ts`, `tools/topology/extract-runtime-topology.ts`, `docs/topology/`
- **Issues:** #1352 (OPEN), #1408 (OPEN)
- **Gaps:** Topology snapshot not linked to finality classification gating at runtime; CONF-DIST-09 fixture missing

### Cross-Registry Reconciliation
- **Status:** PRESENT
- **Files:** `runtime/control_graph_reconciliation.ts`, `runtime/reconciliation/cross-registry-reconciliation-engine.js`, `runtime/reconciliation/topology-reconciliation-engine.js`, `src/reconciliation/reconciliation-invariants.ts`, `src/cross-registry-legitimacy-reconciliation.ts`
- **Issues:** #1339 (OPEN), #1348 (OPEN), #1405 (OPEN)
- **Gaps:** No CONF-DIST-08 fixture; canonical registry traversal order not formally locked as code constant

### Proof Finality Metadata
- **Status:** PARTIAL
- **Files:** `runtime/control_graph_proof.ts`, `schemas/proof.schema.json`, `mindshift/proof.schema.json`, `migrations/0042_proof_execution_lineage_binding.sql`, `tests/fate/proof-lineage-enforcement.test.mjs`
- **Issues:** #1414 (OPEN)
- **Gaps:** No `finality_metadata` field in proof schema; no downgrade/upgrade event type; CONF-DIST-07 and CONF-DIST-14 fixtures missing

### Revocation Liveness Evidence
- **Status:** PRESENT
- **Files:** `migrations/0051_revocation_liveness_registry.sql`, `sandbox/distributed/revocation-delay.ts`
- **Issues:** No dedicated implementation issue
- **Gaps:** Propagation enforcement not wired to finality classification; CONF-DIST-12 fixture missing

### Causal Legitimacy Clocks
- **Status:** PARTIAL
- **Files:** `src/lib/causal-clock.ts` (minimal)
- **Issues:** #1338 (OPEN), #1346 (OPEN)
- **Gaps:** Happens-before legitimacy ordering not enforced; causal clock ↔ partition-finality coupling (#1346) not implemented

### Stage 1 Governed CI/CD Conformance
- **Status:** PRESENT / COMPLETE
- **Files:** `conformance/suites/cicd-stage1-conformance.json`, `tests/cicd-stage1-conformance.test.mjs`, `tests/fixtures/cicd/`
- **Issues:** #1437 (CLOSED via PR #1439)
- **Gaps:** None for Stage 1 scope

---

## 4. Stage 2 Dependency Graph

```
B. Epoch Registry (0052)
   └─ must precede: A, C

A. Finality Classification Registry (0048) ← B
   └─ must precede: E, F, G, H, K, L

C. Partition-Finality Semantics ← B, A
   └─ must precede: E, F, H, K

D. Quorum / ValidatorAttestationEnvelope ← A
   └─ must precede: L

E. Conflict-Set Registry ← A, D
   └─ must precede: H

F. Distributed Replay Convergence ← A
   └─ must precede: H

G. Proof Finality Metadata ← A, B
   └─ must precede: H

H. Revocation Liveness Evidence ← A
   └─ must precede: L (via propagation)

I. Causal Legitimacy Clocks ← A, B
   └─ must precede: C

J. Reconciliation State Machine ← A, B, C, E, F, G, H, I
   └─ must precede: L

K. Topology Visibility Enforcement ← A, D
   └─ must precede: L

L. Stage 2 Conformance Matrix ← ALL

Forced ordering:
B → A → (C, D, F, G, H, I in parallel) → E → J → K → L
```

---

## 5. Canonical Stage 2 State Vocabulary

| State | Definition | Execution Implication |
|-------|-----------|----------------------|
| `GLOBAL_VALID` | Validated and executed across all visible topology with quorum attestation, within current epoch | Eligible for execution; all predicates satisfied |
| `LOCAL_VALID` | Validated and executed on a single governed CI/CD surface; global convergence not confirmed | Local execution only; NOT eligible for distributed finality claims |
| `PARTITION_VALID` | Valid within a single partition; global topology not visible | NOT eligible for global execution claims |
| `PARTITION_SUSPENDED` | Was valid; partition conditions detected; suspended pending resolution | NULL execution eligibility |
| `STALE_VISIBLE` | Epoch advanced or revocation propagated; observable but ineligible; terminal | NULL execution eligibility; evidence preserved |
| `AMBIGUOUS` | Topology visible but convergence evidence contradictory or incomplete | NULL execution eligibility |
| `OBSERVATIONAL` | Observed via topology; proof-binding not confirmed | NULL execution eligibility |
| `CONFLICTED` | Two or more competing legitimate roots; split-brain | NULL execution eligibility |
| `SETTLEMENT_CANDIDATE` | Deterministic winning candidate identified; settlement in progress | NULL until CONVERGENCE_VALID |
| `CONVERGENCE_VALID` | Topology-visible convergence confirmed; epoch valid; quorum evidence present | Eligible for GLOBAL_VALID promotion |
| `FINALIZED` | Executed; proof persisted; append-only log closed; epoch locked | Execution complete; replay permanently consumed |
| `NULL` | Any required invariant fails | Absolute prohibition on execution |

### Required Transition Guards
- `LOCAL_VALID` → `GLOBAL_VALID`: forbidden without passing through `CONVERGENCE_VALID` with topology-visible quorum evidence
- Any state → `GLOBAL_VALID`: requires topology_visible_convergence AND quorum_attestation AND epoch_valid AND no_conflicting_root AND causal_ordering_unambiguous
- `FINALIZED` → any valid state: forbidden (only `STALE_VISIBLE` allowed)
- `NULL` → any valid state: forbidden (new object required)
- `RECONCILING` → `FINALIZED`: forbidden (must pass through `CONVERGED`)

---

## 6. Local vs Global Legitimacy Semantics

```
LOCAL_VALID:
  validated_object_hash == executed_object_hash
  ∧ governed_cicd_surface_confirmed
  ∧ replay_safe_locally

GLOBAL_VALID:
  LOCAL_VALID
  ∧ topology_visible_convergence_confirmed
  ∧ quorum_attestation_present
  ∧ epoch_valid
  ∧ no_conflicting_root
  ∧ causal_ordering_unambiguous
```

### Required Rules
1. `LOCAL_VALID` cannot silently become `GLOBAL_VALID` — explicit topology-visible confirmation required
2. Partition-local validity cannot authorize global finality under any circumstances
3. Observational visibility cannot create any legitimacy state
4. Unresolved topology ambiguity must return `NULL` or `AMBIGUOUS`; never `GLOBAL_VALID`
5. No reconciliation, anti-entropy repair, or partition healing can elevate `LOCAL_VALID` to `GLOBAL_VALID` without fresh topology-visible quorum evidence
6. Causal ordering ambiguity prevents finality

---

## 7. Partition-Finality Ambiguity Model

### Partition Detection Inputs
- Topology visibility snapshot delta (node disappearance / unreachability)
- Quorum attestation gap (expected validators not responding)
- Epoch disagreement between topology nodes
- Competing legitimacy roots from diverged registry states
- Causal clock ordering inconsistency

### Finality Downgrade Conditions
- Any topology node unreachable → `GLOBAL_VALID` → `PARTITION_SUSPENDED`
- Competing root detected → `GLOBAL_VALID` → `CONFLICTED`
- Epoch advance without convergence → `GLOBAL_VALID` → `STALE_VISIBLE`
- Revocation event propagated → any valid state → `STALE_VISIBLE`
- Causal ordering becomes ambiguous → `CONVERGENCE_VALID` → `AMBIGUOUS`

### Finality Upgrade Conditions (must satisfy all)
- Full topology visibility restored AND quorum evidence collected AND epoch matches → path to `CONVERGENCE_VALID` → `GLOBAL_VALID`
- Settlement confirmed with losing-branch evidence preserved → path from `CONFLICTED` → `SETTLEMENT_CANDIDATE` → `CONVERGENCE_VALID`

### Stale Lineage Collapse
- Any lineage node whose epoch has advanced beyond current without renewal → `STALE_VISIBLE`; non-reversible; new object required

### Required Rule
Partition-local validity must not become global finality without topology-visible convergence evidence.

---

## 8. Distributed Replay Convergence Model

### Core Rules
- Once a nonce is consumed on any topology node, consumption propagates as an append-only event to all nodes
- On partition heal: union of all consumed sets = permanently consumed; no nonce is restored
- Anti-entropy repair propagates missing consumption events; it never un-consumes a nonce
- Replay resurrection attempt → `REPLAY_RESURRECTION` event → `NULL`
- Stale proof reuse detected during reconciliation → `STALE_PROOF_REUSE` → `NULL`
- Cross-registry replay record is the authoritative consumption source
- Reconciliation ordering must process replay consumption events before any execution eligibility determination

### Replay Conflict Classes
- `DUPLICATE_NONCE` — same nonce observed from multiple topology nodes
- `PARTITION_DIVERGENCE` — divergent consumption states after partition
- `STALE_PROOF_REUSE` — consumed proof re-submitted via stale registry
- `REPLAY_RESURRECTION` — attempt to use consumed nonce after partition heal or reconciliation

### Required Rule
Consumed replay eligibility is never restored by retry, proof reuse, reconciliation ambiguity, partition healing, or stale registry replay.

---

## 9. Validator Federation / Quorum Evidence Model

### ValidatorAttestationEnvelope (Candidate Object)
```typescript
interface ValidatorAttestationEnvelope {
  validator_id: string;
  epoch_id: string;
  object_hash: string;
  classification: FinalityClassification;
  topology_snapshot_hash: string;
  causal_clock: CausalClockVector;
  attestation_type: 'EVIDENCE' | 'OBSERVATION'; // never 'AUTHORITY'
  timestamp_utc: string;
  signature: string;
}
```

### Required Rules
- `attestation_type` must never be `'AUTHORITY'`
- Stale attestations (epoch mismatch) must be rejected
- Attestation from topology-invisible validator → `OBSERVATIONAL` only
- Quorum disagreement → `GLOBAL_VALID` blocked → `AMBIGUOUS` or `CONFLICTED`
- validator attestation evidence ≠ authority

---

## 10. Conflict-Set Settlement Model

### ConflictSetEnvelope (Candidate Object)
```typescript
interface ConflictSetEnvelope {
  conflict_id: string;
  detected_at: string;
  competing_roots: CompetingRoot[];
  winning_root?: string;
  losing_roots: string[];         // append-only; never deleted
  settlement_state: ConflictSettlementState;
  settlement_evidence: object;
  epoch_id: string;
}
```

### Required Rules
- All competing roots must be stored and preserved permanently
- No losing branch may be deleted or overwritten
- If no deterministic winner can be identified by causal ordering → `NULL`
- Competing roots with identical causal clocks → `NULL` (cannot settle deterministically)
- conflict settlement must preserve evidence, not erase losing branches

---

## 11. Distributed Proof-Finality Model

### ProofFinalityMetadata (Candidate Field)
```typescript
interface ProofFinalityMetadata {
  proof_id: string;
  finality_classification: FinalityClassification;
  topology_snapshot_hash: string;
  epoch_id: string;
  downgrade_events: ProofDowngradeEvent[];  // append-only
  upgrade_events: ProofUpgradeEvent[];       // append-only
  detached: boolean;
  detach_reason?: string;
}
```

### Required Rules
- Detached proof (no reconstructable continuity lineage) → `NULL`
- All downgrade/upgrade events appended to immutable arrays; never overwritten
- Proof exists but topology diverges → `AMBIGUOUS`
- Two proofs for same execution → `CONFLICTED`
- proof visibility ≠ authority
- proof existence ≠ distributed finality

---

## 12. Reconciliation State Machine

| State | Entry Condition | Exit Condition | Replay Implication | Proof Implication |
|-------|----------------|----------------|-------------------|-------------------|
| `OBSERVED` | Object seen on any node | Evidence accumulated | Replay eligibility unknown | Proof binding unconfirmed |
| `PENDING` | Reconciliation initiated; insufficient evidence | Evidence threshold or timeout | Suspended | Pending |
| `PARTITIONED` | Partition detected | Healed or timeout | Suspended; no restoration | Downgraded |
| `RECONCILING` | Active cross-registry traversal | Traversal complete | Consumed states preserved | Lineage reconstructing |
| `CONFLICTED` | Competing roots found | Settlement initiated or NULL | NULL | In conflict-set |
| `SETTLEMENT_CANDIDATE` | Deterministic winner identified | Settlement confirmed or rejected | NULL during settlement | Lineage converging |
| `CONVERGED` | Single root confirmed; topology agrees | Epoch binding confirmed | Consumed states propagated | Finality confirmed |
| `FINALIZED` | Epoch binding confirmed; GLOBAL_VALID | Epoch advance → STALE_VISIBLE | Permanently consumed | Finalized; append-only |
| `REVOKED` | Revocation received and propagated | Terminal | Permanently revoked | Revoked |
| `NULL` | Any required invariant fails | Terminal | NULL | NULL |

### Forbidden Transitions
- `FINALIZED` → any valid state
- `NULL` → any valid state
- `REVOKED` → any valid state
- `CONVERGED` → `GLOBAL_VALID` without epoch binding
- `RECONCILING` → `FINALIZED` (must pass through `CONVERGED`)
- Any state → `GLOBAL_VALID` without topology-visible quorum evidence

### Required Rule
The reconciliation state machine produces classifications, not authority. No state transition creates execution eligibility independently.

---

## 13. Stage 2 Implementation Slice Ordering

### Slice A — Stage 2 Planning Artifact *(this document)*
- **Objective:** Produce bounded non-operative Stage 2 plan
- **Files Touched:** `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md`
- **Tests Required:** None
- **Prerequisites:** PR #1439 merged
- **Issue Coverage:** #1418 (planning precursor)

### Slice B — Finality Classification Registry Hardening
- **Objective:** Enforce LOCAL_VALID ≠ GLOBAL_VALID; add CONVERGENCE_VALID state; add epoch-binding check
- **Files Likely Touched:** `src/lib/finality-classification.ts`, new migration for CONVERGENCE_VALID column, `tests/fate/issue-1340-finality-classification-registry.test.mjs`
- **Tests Required:** CONF-DIST-01 fixture; epoch-binding enforcement test; topology-guard test
- **Prerequisites:** Slice A
- **Issue Coverage:** #1340
- **Acceptance Criteria:** LOCAL_VALID cannot silently become GLOBAL_VALID; CONVERGENCE_VALID state reachable; GLOBAL_VALID requires topology evidence
- **NULL Conditions:** Classification attempt without required evidence → NULL

### Slice C — Epoch Registry + Settlement Coupling
- **Objective:** Wire epoch registry to settlement and convergence classification; epoch mismatch → NULL
- **Files Likely Touched:** `src/lib/epoch-substrate.ts`, `src/lib/finality-classification.ts`
- **Tests Required:** CONF-DIST-11 (epoch mismatch → NULL); settlement epoch ordering test
- **Prerequisites:** Slice B
- **Issue Coverage:** #1418 (epoch/settlement/convergence coupling)

### Slice D — ValidatorAttestationEnvelope + Quorum Evidence Model
- **Objective:** Define `ValidatorAttestationEnvelope` typed object; implement quorum evidence model; enforce attestation ≠ authority
- **Files Likely Touched:** `src/lib/quorum-attestation.ts`, new `src/lib/validator-attestation-envelope.ts`, extended `migrations/0050`
- **Tests Required:** CONF-DIST-06 (quorum disagreement prevents GLOBAL_VALID); attestation ≠ authority test
- **Prerequisites:** Slices B, C
- **Issue Coverage:** New issue — see Section 16

### Slice E — ConflictSetEnvelope + Settlement Determinism
- **Objective:** Define `ConflictSetEnvelope` typed object; implement deterministic settlement; enforce losing-branch preservation
- **Files Likely Touched:** `src/lib/conflict-set.ts`, new `src/lib/conflict-set-envelope.ts`
- **Tests Required:** CONF-DIST-05 (conflicting proof roots → CONFLICTED); CONF-DIST-10 (settlement preserves losing branch)
- **Prerequisites:** Slices B, D
- **Issue Coverage:** #1348

### Slice F — Distributed Replay Convergence + Anti-Entropy Rules
- **Objective:** Formalize anti-entropy repair rules; implement replay resurrection detection; partition replay drift model
- **Files Likely Touched:** `src/distributed-replay-convergence.ts`, `src/lib/replay-convergence.ts`
- **Tests Required:** CONF-DIST-03; CONF-DIST-15
- **Prerequisites:** Slice B
- **Issue Coverage:** #1347

### Slice G — Proof Finality Metadata + Downgrade/Upgrade Events
- **Objective:** Add `ProofFinalityMetadata` to proof schema; implement append-only downgrade/upgrade events; detached proof → NULL
- **Files Likely Touched:** `runtime/control_graph_proof.ts`, `schemas/proof.schema.json`, `mindshift/proof.schema.json`, new migration
- **Tests Required:** CONF-DIST-02; CONF-DIST-07; CONF-DIST-14
- **Prerequisites:** Slices B, C
- **Issue Coverage:** #1414

### Slice H — Reconciliation State Machine + Downgrade/Upgrade Events
- **Objective:** Implement reconciliation state machine; wire revocation liveness downgrade; enforce reconciliation ≠ authority
- **Files Likely Touched:** `runtime/control_graph_reconciliation.ts`, `runtime/reconciliation/cross-registry-reconciliation-engine.js`, `src/reconciliation/reconciliation-invariants.ts`
- **Tests Required:** CONF-DIST-04; CONF-DIST-08; CONF-DIST-12
- **Prerequisites:** Slices B, E, F, G
- **Issue Coverage:** #1339, #1405

### Slice I — Topology Visibility Enforcement
- **Objective:** Wire topology snapshot to finality classification gating; topology invisibility → NULL or AMBIGUOUS
- **Files Likely Touched:** `src/runtime-topology-intelligence.ts`, `src/lib/finality-classification.ts`
- **Tests Required:** CONF-DIST-09
- **Prerequisites:** Slices B, D
- **Issue Coverage:** #1352, #1408

### Slice J — Causal Legitimacy Clocks
- **Objective:** Implement happens-before legitimacy ordering; causal ambiguity detection; couple to partition-finality
- **Files Likely Touched:** `src/lib/causal-clock.ts` (expand), new `src/lib/causal-legitimacy-clock.ts`
- **Tests Required:** CONF-DIST-13
- **Prerequisites:** Slices B, C
- **Issue Coverage:** #1338, #1346

### Slice K — Stage 2 Conformance Matrix
- **Objective:** Create `conformance/suites/stage2-distributed-legitimacy-conformance.json`; wire to runner; create all CONF-DIST fixtures
- **Files Likely Touched:** `conformance/suites/` (new), `conformance/runner.mjs`, `tests/fixtures/stage2/` (new), `tests/fate/` (new)
- **Tests Required:** All CONF-DIST-01 through CONF-DIST-15
- **Prerequisites:** ALL preceding slices
- **Issue Coverage:** New issue — see Section 16

### Slice L — Docs / Quickstart Sync
- **Objective:** Update `docs/` to reflect Stage 2 vocabulary and reconciliation state machine
- **Files Likely Touched:** `docs/distributed-finality-arbitration-canon.md`, `docs/epoch-reconciliation-settlement-semantics.md`
- **Prerequisites:** Slices B–K
- **Issue Coverage:** #1423

---

## 14. Stage 2 Conformance Matrix

| ID | Check | Expected Classification | Required Fixture | Related Issue | Required Module |
|----|-------|------------------------|-----------------|---------------|----------------|
| CONF-DIST-01 | Local valid does not imply global valid | LOCAL_VALID (not promoted) | `fixtures/stage2/local_valid_no_global_promotion.json` | #1340 | `src/lib/finality-classification.ts` |
| CONF-DIST-02 | Partition-local proof downgraded on partition detection | PARTITION_SUSPENDED | `fixtures/stage2/partition_proof_downgrade.json` | #1418 | `runtime/control_graph_proof.ts` |
| CONF-DIST-03 | Replay consumed in partition remains consumed after healing | NULL (replay attempt) | `fixtures/stage2/replay_consumed_partition_heal.json` | #1347 | `src/distributed-replay-convergence.ts` |
| CONF-DIST-04 | Stale lineage collapses to STALE_VISIBLE | STALE_VISIBLE | `fixtures/stage2/stale_lineage_collapse.json` | #1415 | `runtime/control_graph_reconciliation.ts` |
| CONF-DIST-05 | Conflicting proof roots create CONFLICTED | CONFLICTED | `fixtures/stage2/conflicting_proof_roots.json` | #1348 | `src/lib/conflict-set.ts` |
| CONF-DIST-06 | Quorum disagreement prevents GLOBAL_VALID | AMBIGUOUS or CONFLICTED | `fixtures/stage2/quorum_disagreement.json` | New issue | `src/lib/quorum-attestation.ts` |
| CONF-DIST-07 | Detached proof cannot finalize | NULL | `fixtures/stage2/detached_proof.json` | #1414 | `runtime/control_graph_proof.ts` |
| CONF-DIST-08 | Reconciliation cannot create authority | No execution eligibility from reconciliation alone | `fixtures/stage2/reconciliation_no_authority.json` | #1405 | `runtime/reconciliation/cross-registry-reconciliation-engine.js` |
| CONF-DIST-09 | Topology invisibility returns NULL / AMBIGUOUS | NULL or AMBIGUOUS | `fixtures/stage2/topology_invisible.json` | #1352 | `src/runtime-topology-intelligence.ts` |
| CONF-DIST-10 | Settlement preserves losing branch evidence | STALE_VISIBLE (losing branch retained) | `fixtures/stage2/settlement_losing_branch.json` | #1348 | `src/lib/conflict-set.ts` |
| CONF-DIST-11 | Epoch mismatch prevents CONVERGENCE_VALID | NULL or STALE_VISIBLE | `fixtures/stage2/epoch_mismatch.json` | #1418 | `src/lib/epoch-substrate.ts` |
| CONF-DIST-12 | Revocation liveness downgrade propagates | STALE_VISIBLE propagated | `fixtures/stage2/revocation_liveness_downgrade.json` | New issue | `migrations/0051` runtime |
| CONF-DIST-13 | Causal ordering ambiguity prevents finality | AMBIGUOUS | `fixtures/stage2/causal_ambiguity.json` | #1338, #1346 | `src/lib/causal-legitimacy-clock.ts` |
| CONF-DIST-14 | Proof downgrade / upgrade is append-only | Events immutable in log | `fixtures/stage2/proof_downgrade_append_only.json` | #1414 | `runtime/control_graph_proof.ts` |
| CONF-DIST-15 | Partition healing does not restore replay eligibility | NULL (replay attempt post-heal) | `fixtures/stage2/partition_heal_no_replay_restore.json` | #1347 | `src/distributed-replay-convergence.ts` |

---

## 15. Risk Register

| Risk | Mitigation | Related Slice | Closure Condition |
|------|-----------|--------------|------------------|
| Treating local validity as global | CONF-DIST-01 fixture; explicit LOCAL_VALID guard in classification registry | Slice B | Test passes; guard confirmed in review |
| Topology visibility becoming authority | Non-authority constraint in topology snapshot; CONF-DIST-09 | Slice I | Test passes; no topology path grants execution eligibility |
| Reconciliation creating authority | Explicit authority guard in reconciliation engine; CONF-DIST-08 | Slice H | Test passes; no authority output from state machine |
| Proof existence treated as finality | Detached proof → NULL; CONF-DIST-07; proof finality metadata required | Slice G | Test passes; detached proof confirmed → NULL |
| Replay resurrection after partition heal | Anti-entropy replay rules enforce permanent consumption; CONF-DIST-03, CONF-DIST-15 | Slice F | Both tests pass |
| Stale lineage remaining active | Stale lineage collapse → STALE_VISIBLE; epoch advance trigger; CONF-DIST-04 | Slices B, C, H | Test passes |
| Validator quorum becoming authority source | ValidatorAttestationEnvelope type = 'EVIDENCE' only; CONF-DIST-06 | Slice D | Test passes; no attestation path grants authority |
| Conflict settlement erasing evidence | ConflictSetEnvelope losing_roots append-only; CONF-DIST-10 | Slice E | Test passes; losing branch confirmed present |
| Epoch mismatch ignored | Epoch binding check in CONVERGENCE_VALID guard; CONF-DIST-11 | Slice C | Test passes; epoch mismatch confirmed → NULL |
| Conformance fixtures becoming operative | Fixtures are read-only JSON; runner is test-only; no runtime path from fixture to execution | Slice K | Runner remains non-operative; test-only gate |

---

## 16. Missing Issue Analysis

| Subject | Covered By | Status | Recommended Title If Missing |
|---------|-----------|--------|------------------------------|
| ValidatorAttestationEnvelope typed object + non-authority constraint | #1343 (partially) | PARTIAL | **ValidatorAttestationEnvelope Definition and Non-Authority Attestation Constraints** |
| ConflictSetEnvelope typed object + losing-branch retention | #1342 / #1348 (partially) | PARTIAL | **ConflictSetEnvelope Definition and Losing-Branch Evidence Retention** |
| Stage 2 distributed conformance suite (CONF-DIST-01–15) | No single issue | MISSING | **Stage 2 Distributed Legitimacy Conformance Suite (CONF-DIST-01 through CONF-DIST-15)** |
| Revocation liveness propagation enforcement | No dedicated implementation issue | MISSING | **Revocation Liveness Downgrade Propagation Enforcement and CONF-DIST-12 Fixture** |
| Proof-finality metadata (downgrade/upgrade events) | #1414 | OPEN — covered | No new issue needed |
| Reconciliation downgrade/upgrade wiring | #1405, #1339 | OPEN — partially covered | No new issue needed if #1405 expanded |
| Epoch/settlement/convergence coupling | #1418 | OPEN — covered | No new issue needed |
| Local/global legitimacy semantics | #1418, #1340 | OPEN — covered | No new issue needed |
| Topology visibility gating GLOBAL_VALID | #1352 | OPEN — partially covered | No new issue if #1352 scoped to include runtime gate |

### Recommended New Issues (4)
1. **ValidatorAttestationEnvelope Definition and Non-Authority Attestation Constraints** — define typed envelope, non-authority guard, CONF-DIST-06 fixture
2. **ConflictSetEnvelope Definition and Losing-Branch Evidence Retention** — define typed envelope, losing-branch preservation, CONF-DIST-10 fixture
3. **Stage 2 Distributed Legitimacy Conformance Suite (CONF-DIST-01 through CONF-DIST-15)** — `conformance/suites/stage2-distributed-legitimacy-conformance.json`, all 15 fixtures, runner integration
4. **Revocation Liveness Downgrade Propagation Enforcement and CONF-DIST-12 Fixture** — wire `0051_revocation_liveness_registry` to finality classification; propagation enforcement

---

## 17. Recommended First Stage 2 PR

**Recommended first implementation PR:**  
`feat(stage2): finality classification registry hardening — LOCAL_VALID/GLOBAL_VALID distinction and CONVERGENCE_VALID state (Slice B)`

**Anchor issue:** #1340

**Supporting issues:** #1418, #1347, #1348, #1405, #1440, #1441, #1442, #1443

**Causal-clock context (not primary for Slice B):** #1338, #1346

**Scope:**  
- Harden `src/lib/finality-classification.ts` to enforce LOCAL_VALID ≠ GLOBAL_VALID without topology evidence
- Add CONVERGENCE_VALID state to classification enum and registry
- Add epoch-binding check stub (for Slice C coupling)
- Add CONF-DIST-01 fixture: `tests/fixtures/stage2/local_valid_no_global_promotion.json`
- Add test asserting GLOBAL_VALID cannot be reached without topology evidence
- New migration (0053) adding CONVERGENCE_VALID to classification CHECK constraint and GLOBAL_VALID → must-supersede-CONVERGENCE_VALID trigger

**Non-goals:**  
No quorum evidence model, no reconciliation state machine, no distributed replay rules, no authority creation, no production deployment, no claim that distributed convergence is complete

**Expected tests:**  
- Extended `tests/fate/issue-1340-finality-classification-registry.test.mjs`
- New `tests/fate/stage2-conf-dist-01.test.mjs`
- No regression: `node conformance/runner.mjs` passes Stage 1 suite

---

## 18. Final Readiness Checklist

- [x] Stage 2 scope defined (Section 2)
- [x] Stage 1 closure incorporated (Section 1; PR #1439 confirmed merged)
- [x] Dependency graph mapped (Section 4)
- [x] Local/global legitimacy distinction defined (Sections 5, 6)
- [x] Partition ambiguity model defined (Section 7)
- [x] Replay convergence model defined (Section 8)
- [x] Proof-finality model defined (Section 11)
- [x] Reconciliation state machine defined (Section 12)
- [x] Validator federation / quorum model defined (Section 9)
- [x] Conflict-set settlement model defined (Section 10)
- [x] Implementation slices ordered (Section 13)
- [x] Conformance matrix defined (Section 14)
- [x] Missing issues identified (Section 16)
- [x] Risk register documented (Section 15)
- [x] No authority created
- [x] No execution performed
- [x] No deployment performed
- [x] No claim that distributed convergence is complete

---

## Final Output

**Recommended first Stage 2 PR:**  
`feat(stage2): finality classification registry hardening — LOCAL_VALID/GLOBAL_VALID distinction and CONVERGENCE_VALID state (Slice B)`

**Recommended anchor issue:** #1340

**Recommended supporting issues:** #1418, #1347, #1348, #1405, #1440, #1441, #1442, #1443

**Recommended new issues:**
1. ValidatorAttestationEnvelope Definition and Non-Authority Attestation Constraints
2. ConflictSetEnvelope Definition and Losing-Branch Evidence Retention
3. Stage 2 Distributed Legitimacy Conformance Suite (CONF-DIST-01 through CONF-DIST-15)
4. Revocation Liveness Downgrade Propagation Enforcement and CONF-DIST-12 Fixture
