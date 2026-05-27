# Reconciliation State Machine

**Artifact Type:** Stage 2 Canonical Documentation  
**Status:** NON_OPERATIVE — documentation only  
**Implemented By:** Slice H (PR #1451)  
**Anchor Plan:** `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md` §12  
**Key Module:** `runtime/reconciliation/cross-registry-reconciliation-engine.js`

---

## Purpose

This document defines the canonical reconciliation state machine implemented in Stage 2. It reflects the deterministic state transitions, forbidden transitions, and authority-safety guarantees enforced by the reconciliation engine.

---

## WARNING

> **Reconciliation ≠ authority.**  
> **Reconciliation ≠ convergence.**  
> **Reconciliation cannot create execution eligibility.**  
> **Reconciliation cannot restore consumed replay state.**

The reconciliation state machine produces classifications. No state transition creates execution eligibility independently. Reaching any reconciliation state — including `CONVERGED` or `FINALIZED` — does not grant authority.

---

## State Definitions

| State | Entry Condition | Exit Condition | Replay Implication | Proof Implication |
|-------|----------------|----------------|-------------------|-------------------|
| `OBSERVED` | Object seen on any topology node | Evidence accumulated | Replay eligibility unknown | Proof binding unconfirmed |
| `PENDING` | Reconciliation initiated; insufficient evidence | Evidence threshold or timeout | Suspended | Pending |
| `PARTITIONED` | Partition detected during reconciliation | Healed or timeout | Suspended; no restoration | Downgraded |
| `RECONCILING` | Active cross-registry traversal in progress | Traversal complete | Consumed states preserved | Lineage reconstructing |
| `CONFLICTED` | Competing roots found during traversal | Settlement initiated or NULL | NULL during settlement | In conflict-set |
| `SETTLEMENT_CANDIDATE` | Deterministic winner identified | Settlement confirmed or rejected | NULL during settlement | Lineage converging |
| `CONVERGED` | Single root confirmed; topology agrees | Epoch binding confirmed | Consumed states propagated | Finality confirmed |
| `FINALIZED` | Epoch binding confirmed; GLOBAL_VALID predicates met | Epoch advance → `STALE_VISIBLE` | Permanently consumed | Finalized; append-only |
| `REVOKED` | Revocation received and propagated | Terminal | Permanently revoked | Revoked |
| `NULL` | Any required invariant fails | Terminal | NULL | NULL |

---

## Forbidden Transitions

The following transitions are structurally prohibited and enforced at runtime:

| Forbidden Transition | Reason |
|---------------------|--------|
| `FINALIZED` → any valid state | Execution is complete; append-only |
| `NULL` → any valid state | New object required; no resurrection |
| `REVOKED` → any valid state | Revocation is terminal |
| `CONVERGED` → `GLOBAL_VALID` without epoch binding | Epoch binding must be independently proven |
| `RECONCILING` → `FINALIZED` | Must pass through `CONVERGED` first |
| Any state → `GLOBAL_VALID` without topology-visible quorum evidence | Topology evidence is non-negotiable |

---

## Downgrade Events

Downgrade events are append-only and immutable. They may be emitted by any reconciliation subsystem observing deteriorating conditions.

| Trigger | Resulting Classification |
|---------|------------------------|
| Partition detected | `GLOBAL_VALID` → `PARTITION_SUSPENDED` |
| Competing root detected | `GLOBAL_VALID` → `CONFLICTED` |
| Epoch advance without convergence | `GLOBAL_VALID` → `STALE_VISIBLE` |
| Revocation propagated | Any valid state → `STALE_VISIBLE` |
| Causal ordering becomes ambiguous | `CONVERGENCE_VALID` → `AMBIGUOUS` |
| Topology node unreachable | `GLOBAL_VALID` → `PARTITION_SUSPENDED` |

Downgrade events are recorded in the append-only downgrade event log. They are never overwritten.

---

## Upgrade Events

Upgrade events require satisfying all conditions simultaneously. They cannot bypass intermediate states.

| Path | Required Conditions |
|------|-------------------|
| `PARTITIONED` → `CONVERGENCE_VALID` candidate | Full topology visibility restored ∧ quorum evidence collected ∧ epoch matches |
| `CONFLICTED` → `SETTLEMENT_CANDIDATE` | Deterministic winner identified via causal ordering |
| `SETTLEMENT_CANDIDATE` → `CONVERGENCE_VALID` | Settlement confirmed ∧ losing-branch evidence preserved |
| `CONVERGENCE_VALID` → `GLOBAL_VALID` | All GLOBAL_VALID predicates independently satisfied |

---

## Stale Lineage Collapse

Any lineage node whose epoch has advanced beyond current without renewal collapses to `STALE_VISIBLE`. This transition is non-reversible. A new object is required to resume legitimacy.

```text
stale visible lineage ≠ active legitimacy lineage
```

**Conformance check:** CONF-DIST-04  
**Fixture:** `tests/fixtures/stage2/stale_lineage_collapse.json`

---

## Reconciliation and Replay

The reconciliation engine enforces permanent replay consumption:

- Once a nonce is consumed on any topology node, consumption propagates as an append-only event
- On partition heal: union of all consumed sets = permanently consumed; no nonce is restored
- Anti-entropy repair propagates missing consumption events; it never un-consumes a nonce
- Replay resurrection attempt → `NULL`

```text
consumed replay eligibility
must remain consumed
across reconciliation
```

**Conformance checks:** CONF-DIST-03, CONF-DIST-15  
**Fixtures:** `tests/fixtures/stage2/replay_consumed_partition_heal.json`, `tests/fixtures/stage2/partition_heal_no_replay_restore.json`

---

## Revocation Liveness Downgrade

The reconciliation engine wires revocation liveness propagation to finality classification:

- Revocation event received → emit downgrade event → all dependent states → `STALE_VISIBLE`
- Propagation is append-only and cannot be reversed
- Delayed revocation visibility still triggers downgrade when observed

**Conformance check:** CONF-DIST-12  
**Fixture:** `tests/fixtures/stage2/revocation_liveness_downgrade.json`

---

## Cross-References

| Related Document | Topic |
|-----------------|-------|
| `docs/stage2-legitimacy-vocabulary.md` | Full 12-state vocabulary |
| `docs/topology-visibility-semantics.md` | Topology visibility requirements for reconciliation |
| `docs/causal-legitimacy-clock-semantics.md` | Causal ordering requirements |
| `docs/stage2-conformance-matrix.md` | CONF-DIST-04, CONF-DIST-08, CONF-DIST-12 |
| `docs/epoch-reconciliation-settlement-semantics.md` | Epoch-bound settlement rules |
| `docs/continuous-reconciliation-hardening.md` | Hardening analysis |
| `artifacts/DISTRIBUTED_RECONCILIATION_CANON_V1.md` | Reconciliation canon |
