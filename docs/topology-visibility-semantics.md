# Topology Visibility Semantics

**Artifact Type:** Stage 2 Canonical Documentation  
**Status:** NON_OPERATIVE — documentation only  
**Implemented By:** Slice I (PR #1452)  
**Anchor Plan:** `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md` §3 (Topology Intelligence)  
**Key Module:** `src/runtime-topology-intelligence.ts`

---

## Purpose

This document defines the canonical topology visibility semantics enforced in Stage 2. It specifies how topology observations relate (and do not relate) to legitimacy classification, and establishes the non-authority boundary of all topology-derived information.

---

## WARNING

> **Topology visibility ≠ legitimacy.**  
> **Topology visibility ≠ authority.**  
> **Topology observation cannot create execution eligibility.**  
> **Graph adjacency ≠ execution permission.**

Topology visibility is evidence. It supports legitimacy classification as one required input. It cannot independently establish legitimacy, create authority, validate objects, or authorize execution.

```text
visualization = visibility, not authority
```

If a topology graph view disagrees with runtime registry state, **runtime registry state wins**.

---

## Topology Visibility as a Classification Gate

Topology visibility is a required but not sufficient input for `GLOBAL_VALID` classification.

```text
topology_invisible
→ NULL or AMBIGUOUS
→ never GLOBAL_VALID
```

The topology visibility guard blocks `GLOBAL_VALID` when:
- Any required topology node is unreachable
- Topology snapshot hash cannot be confirmed
- Topology visibility is incomplete for the claimed scope

**Conformance check:** CONF-DIST-09  
**Fixture:** `tests/fixtures/stage2/topology_invisible.json`

---

## Topology Visibility Thresholds

| Visibility State | Classification Impact |
|-----------------|----------------------|
| Full topology visible; quorum reachable | Allows `CONVERGENCE_VALID` candidate evaluation |
| Partial topology visible; quorum incomplete | `LOCAL_VALID` or `AMBIGUOUS`; blocks `GLOBAL_VALID` |
| Topology node unreachable | `GLOBAL_VALID` → `PARTITION_SUSPENDED` |
| Topology snapshot stale | `GLOBAL_VALID` → `STALE_VISIBLE` or `AMBIGUOUS` |
| Topology snapshot hash mismatch | `NULL` |
| No topology visibility | `NULL` or `AMBIGUOUS` |

---

## Partition Detection Inputs

The topology layer provides the following partition detection signals to the finality classification registry:

- Topology visibility snapshot delta (node disappearance or unreachability)
- Quorum attestation gap (expected validators not responding)
- Epoch disagreement between topology nodes
- Competing legitimacy roots from diverged registry states
- Causal clock ordering inconsistency

These signals are evidence inputs. Receiving a signal does not create authority.

---

## Topology and GLOBAL_VALID

`GLOBAL_VALID` requires topology-visible convergence evidence as one of its mandatory predicates:

```text
GLOBAL_VALID requires:
  topology_visible_convergence_confirmed
  ∧ quorum_attestation_present
  ∧ epoch_valid
  ∧ no_conflicting_root
  ∧ causal_ordering_unambiguous
```

Topology visibility satisfies only the `topology_visible_convergence_confirmed` predicate. All other predicates must be independently proven.

---

## Topology Observation vs Authority

| Topology Can | Topology Cannot |
|-------------|----------------|
| Observe node reachability | Create authority |
| Snapshot topology state | Validate objects |
| Detect partition conditions | Authorize execution |
| Supply visibility evidence | Create proof |
| Signal epoch disagreement | Mutate runtime registries |
| Detect competing roots | Override runtime state |

This boundary is a runtime enforcement invariant, not merely a guideline.

---

## ValidatorAttestationEnvelope and Topology

Validator attestations include a `topology_snapshot_hash` field. This links the attestation to a specific topology state at the time of attestation.

```text
attestation_type: 'EVIDENCE' | 'OBSERVATION'
// never 'AUTHORITY'
```

- Attestation from a topology-invisible validator → `OBSERVATIONAL` classification only
- Stale attestations (epoch mismatch) are rejected
- Quorum disagreement → `GLOBAL_VALID` blocked → `AMBIGUOUS` or `CONFLICTED`
- Validator attestation evidence ≠ authority

**Conformance check:** CONF-DIST-06  
**Fixture:** `tests/fixtures/stage2/quorum_disagreement.json`

---

## Topology and Reconciliation

Topology visibility is a required input to reconciliation convergence determinations. However:

- Topology visibility does not determine reconciliation outcome
- Topology visibility does not resolve conflict-set settlement
- Topology visibility does not restore consumed replay eligibility
- Topology agreement does not substitute for epoch validity or causal ordering

```text
reconciliation ≠ authority
topology visibility ≠ convergence
```

---

## Non-Authoritative Guarantees

The topology visibility layer guarantees:

- Topology graphs do not create authority
- Topology graphs do not validate objects
- Topology graphs do not execute actions
- Topology graphs do not create proof
- Topology graphs do not mutate registries
- Topology graphs do not override runtime state
- Topology snapshots are derived visibility evidence only
- Runtime registry state supersedes topology projection state

---

## Cross-References

| Related Document | Topic |
|-----------------|-------|
| `docs/stage2-legitimacy-vocabulary.md` | Classification states |
| `docs/reconciliation-state-machine.md` | Reconciliation state machine |
| `docs/causal-legitimacy-clock-semantics.md` | Causal ordering and topology |
| `docs/topology/legitimacy-topology.md` | Topology visualization layer |
| `docs/topology/execution-surface-map.md` | Execution surface topology |
| `docs/topology/neo4j-runtime-topology.md` | Neo4j topology boundary |
| `docs/stage2-conformance-matrix.md` | CONF-DIST-09 |
| `docs/legitimacy-topology-classification.md` | Legitimacy topology classification |
