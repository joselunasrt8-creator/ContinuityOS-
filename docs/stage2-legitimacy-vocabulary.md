# Stage 2 Legitimacy Vocabulary

**Artifact Type:** Stage 2 Canonical Documentation  
**Status:** NON_OPERATIVE — documentation only  
**Implemented By:** Slices B–K (PRs #1440–#1471)  
**Anchor Plan:** `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md`

---

## Purpose

This document defines the canonical 12-state legitimacy vocabulary used across all Stage 2 distributed legitimacy components. It reflects the implemented semantics in `src/lib/finality-classification.ts` and the Stage 2 conformance suite.

This document does not create authority, validate objects, execute actions, or imply that distributed convergence is established for any particular object.

---

## WARNING

> **Visibility ≠ authority.**  
> **Reconciliation ≠ authority.**  
> **Proof existence ≠ finality.**  
> **Topology visibility ≠ legitimacy.**  
> **Conformance ≠ execution authority.**

No classification state — including `GLOBAL_VALID` or `CONVERGENCE_VALID` — grants execution eligibility on its own. Execution eligibility requires a separately authorized valid MindShift authority lineage.

---

## 12-State Legitimacy Vocabulary

| State | Definition | Execution Implication |
|-------|-----------|----------------------|
| `GLOBAL_VALID` | Validated across all visible topology with quorum attestation, within current epoch, with topology-visible convergence evidence | NOT execution eligibility by itself; all predicates must be independently satisfied |
| `LOCAL_VALID` | Validated on a single governed CI/CD surface; global convergence not confirmed | Local evidence only; NOT eligible for distributed finality claims |
| `PARTITION_VALID` | Valid within a single partition; global topology not visible | NOT eligible for global execution claims |
| `PARTITION_SUSPENDED` | Was valid; partition conditions detected; suspended pending resolution | NULL execution eligibility |
| `STALE_VISIBLE` | Epoch advanced or revocation propagated; observable but ineligible; terminal | NULL execution eligibility; evidence preserved |
| `AMBIGUOUS` | Topology visible but convergence evidence contradictory or incomplete | NULL execution eligibility |
| `OBSERVATIONAL` | Observed via topology; proof-binding not confirmed | NULL execution eligibility |
| `CONFLICTED` | Two or more competing legitimate roots; split-brain detected | NULL execution eligibility |
| `SETTLEMENT_CANDIDATE` | Deterministic winning candidate identified; settlement in progress | NULL until `CONVERGENCE_VALID` established |
| `CONVERGENCE_VALID` | Topology-visible convergence confirmed; epoch valid; quorum evidence present | Candidate for `GLOBAL_VALID` promotion only; not execution authority |
| `FINALIZED` | Executed; proof persisted; append-only log closed; epoch locked | Execution complete; replay permanently consumed |
| `NULL` | Any required invariant fails | Absolute prohibition on execution |

---

## LOCAL_VALID vs GLOBAL_VALID

This distinction is the primary invariant of Stage 2.

```text
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

1. `LOCAL_VALID` cannot silently become `GLOBAL_VALID` — explicit topology-visible confirmation required (CONF-DIST-01)
2. Partition-local validity cannot authorize global finality under any circumstances
3. Observational visibility cannot create any legitimacy state
4. Unresolved topology ambiguity must return `NULL` or `AMBIGUOUS`; never `GLOBAL_VALID`
5. No reconciliation, anti-entropy repair, or partition healing can elevate `LOCAL_VALID` to `GLOBAL_VALID` without fresh topology-visible quorum evidence
6. Causal ordering ambiguity prevents finality (CONF-DIST-13)

**Conformance fixture:** `tests/fixtures/stage2/local_valid_no_global_promotion.json`  
**Test:** `tests/fate/stage2-conf-dist-01.test.mjs`

---

## Required Transition Guards

| Transition | Guard | Violation Result |
|-----------|-------|-----------------|
| `LOCAL_VALID` → `GLOBAL_VALID` | Forbidden without passing through `CONVERGENCE_VALID` with topology-visible quorum evidence | `NULL` |
| Any state → `GLOBAL_VALID` | Requires: `topology_visible_convergence ∧ quorum_attestation ∧ epoch_valid ∧ no_conflicting_root ∧ causal_ordering_unambiguous` | `NULL` |
| `FINALIZED` → any valid state | Forbidden; only `STALE_VISIBLE` allowed on epoch advance | `NULL` |
| `NULL` → any valid state | Forbidden; new object required | `NULL` |
| `RECONCILING` → `FINALIZED` | Forbidden; must pass through `CONVERGED` | `NULL` |
| Any state → `CONVERGENCE_VALID` | Requires epoch binding confirmed | `NULL` (CONF-DIST-11) |

---

## NULL Conditions

The following conditions produce a mandatory `NULL` classification:

- Any required invariant fails
- `LOCAL_VALID` treated as `GLOBAL_VALID` without topology-visible convergence evidence
- Partition-local validity asserted as global finality
- Topology visibility incomplete and global claim attempted
- Causal ancestry missing
- Replay divergence unresolved
- Stale lineage remains active
- Proof lineage detached (no reconstructable continuity lineage)
- Partition prevents convergence proof
- Conflict-set settlement ambiguous
- Epoch validity unresolved
- Settlement validity unresolved
- Reconciliation attempts to create authority
- Causal inversion detected

---

## Full Predicate Gate

```text
VALID
∧ AUTHORIZED
∧ UNUSED
∧ POLICY_VALID
∧ REPLAY_SAFE
∧ TOPOLOGY_VISIBLE
∧ RECONCILABLE
∧ EPOCH_VALID
∧ CONVERGENCE_VALID
→ GLOBAL_VALID candidate
Else → NULL
```

Each predicate must be proven independently. No predicate substitutes for another.

---

## Cross-References

| Component | Implementing Slice | Key File |
|-----------|------------------|---------|
| Finality classification registry | Slice B | `src/lib/finality-classification.ts` |
| Epoch/settlement coupling | Slice C | `src/lib/epoch-substrate.ts` |
| ValidatorAttestationEnvelope | Slice D | `src/lib/quorum-attestation.ts` |
| ConflictSetEnvelope | Slice E | `src/lib/conflict-set-envelope.ts` |
| Distributed replay convergence | Slice F | `src/lib/replay-convergence.ts` |
| Proof finality metadata | Slice G | `src/lib/proof-finality-metadata.ts` |
| Reconciliation state machine | Slice H | `runtime/reconciliation/cross-registry-reconciliation-engine.js` |
| Topology visibility enforcement | Slice I | `src/runtime-topology-intelligence.ts` |
| Causal legitimacy clocks | Slice J | `src/causal-legitimacy-clocks.ts` |
| Conformance matrix | Slice K | `conformance/suites/stage2-distributed-legitimacy-conformance.json` |

See also:
- `docs/reconciliation-state-machine.md`
- `docs/topology-visibility-semantics.md`
- `docs/causal-legitimacy-clock-semantics.md`
- `docs/stage2-conformance-matrix.md`
