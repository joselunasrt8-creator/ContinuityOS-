# Causal Legitimacy Clock Semantics

**Artifact Type:** Stage 2 Canonical Documentation  
**Status:** NON_OPERATIVE — documentation only  
**Implemented By:** Slice J (PR #1468)  
**Anchor Issues:** #1338, #1346  
**Key Module:** `src/causal-legitimacy-clocks.ts`

---

## Purpose

This document defines the causal legitimacy clock semantics implemented in Stage 2. It formalizes happens-before ordering for legitimacy events, classification coupling rules, and the authority-safety boundary of all causal evidence.

---

## WARNING

> **Causal evidence ≠ execution authority.**  
> **Causal ordering reconstruction ≠ replay mutation.**  
> **Clock visibility ≠ legitimacy.**

The causal legitimacy clock layer is evidence-only. Clock evidence may explain ordering and may downgrade or suspend finality classifications. Clock evidence must not upgrade execution eligibility independently.

Wall-clock time alone is insufficient for legitimacy ordering. Visibility must not imply authority. Reconciliation must not rewrite historical legitimacy ordering.

---

## Canonical Legitimacy Event Order

The canonical happens-before chain for legitimacy events is:

```text
session_event
→ continuity_event
→ authority_event
→ compile_event (AEO)
→ validation_event
→ execution_event
→ proof_event
→ classification_event
```

A downstream event must not be classified as globally final if its required upstream causal ancestry is missing, stale, forked, or ambiguous.

---

## Classification Coupling Rules

Causal clock evidence maps to finality classifications as follows:

| Causal Condition | Classification |
|-----------------|----------------|
| Complete causal ancestry + sufficient topology visibility | `GLOBAL_VALID` candidate |
| Complete local causal ancestry + insufficient topology visibility | `LOCAL_VALID` |
| Missing causal parent | `AMBIGUOUS` or `NULL` |
| Stale causal parent visibility | `STALE_VISIBLE` |
| Partition prevents causal reconstruction | `PARTITION_SUSPENDED` |
| Causal inversion detected | `NULL` |
| Competing nonce chronology across partitions | `AMBIGUOUS` or `PARTITION_SUSPENDED` |
| Revocation happens-before validation | `NULL` or non-global classification |
| Proof without execution ancestry | `AMBIGUOUS` or `NULL` |

**Conformance check:** CONF-DIST-13  
**Fixture:** `tests/fixtures/stage2/causal_ambiguity.json`

---

## Happens-Before Rules by Event Class

### Session and Continuity Events

- Continuity creation must happen-before authority issuance
- Continuity revocation must be causally visible before any downstream authority can be `GLOBAL_VALID`
- Broken continuity lineage → `NULL` for all downstream classifications

### Authority Events

- Authority issuance must happen-before AEO compilation
- Authority revocation must be causally propagated before validation
- Stale authority visibility → `STALE_VISIBLE` for dependent objects

### Validation Events

- Validation must happen-after authority issuance (confirmed by causal ancestry)
- Validation result must precede execution event
- Revocation event happens-before validation → validation cannot be `GLOBAL_VALID`

### Execution Events

- Execution must happen-after validated `VALID` classification
- Execution event must happen-before proof event
- Execution without validated causal ancestor → `NULL`

### Proof Events

- Proof must happen-after execution event
- Proof finality classification must happen-after proof event
- Detached proof (no reconstructable execution ancestry) → `AMBIGUOUS` or `NULL`

### Replay Nonce Events

- Nonce consumption must happen-before any later replay rejection or proof-finality claim
- If two partitions observe conflicting nonce chronology → `AMBIGUOUS` or `PARTITION_SUSPENDED`; not `GLOBAL_VALID`
- Consumed nonce is permanently consumed; causal ordering reconstruction must not un-consume it

---

## Causal Ambiguity Failure Classes

| Class | Description | Classification |
|-------|-------------|----------------|
| `CAUSAL_INVERSION` | Downstream event precedes required upstream event | `NULL` |
| `STALE_REPLAY_RESURRECTION` | Consumed nonce claimed via stale causal ancestry | `NULL` |
| `TEMPORAL_LEGITIMACY_COLLAPSE` | Causal chain broken by epoch advance | `STALE_VISIBLE` |
| `PROOF_FINALITY_AMBIGUITY` | Proof finality claimed without confirmed execution ancestry | `AMBIGUOUS` |
| `DETACHED_EXECUTION_CHRONOLOGY` | Execution event not traceable to authority issuance | `NULL` |
| `MISSING_CAUSAL_PARENT` | Required parent event absent from causal frontier | `AMBIGUOUS` |
| `CONFLICTING_NONCE_CHRONOLOGY` | Partition-divergent nonce consumption records | `AMBIGUOUS` or `PARTITION_SUSPENDED` |

---

## Authority-Safety Guarantees

The causal legitimacy clock layer must not:

- Create authority
- Restore authority
- Consume replay state
- Un-consume replay state
- Generate proof
- Make execution eligible
- Convert visibility into legitimacy
- Replace validator result semantics

```text
causal evidence ≠ execution authority
```

---

## Topology Visibility Requirements

Causal ordering claims include the following topology evidence fields:

- Observed causal parents
- Missing causal parents
- Causal frontier or horizon
- Partition visibility state
- Stale parent indicators
- Conflicting chronology indicators
- Linked registry evidence

No global classification may be made from incomplete causal visibility.

---

## Interaction with Partition-Finality Classifications

The causal clock layer couples to partition-finality as follows:

- Partition-finality registry may reference causal clock evidence as an input
- No registry may treat clock presence alone as proof of global convergence
- Causal clock references are evidence inputs to the following registries:
  - `src/lib/finality-classification.ts` (finality classification)
  - `src/lib/conflict-set.ts` (conflict-set detection)
  - `src/lib/quorum-attestation.ts` (quorum attestation)

**Related issues:** #1340, #1342, #1343, #1344, #1345

---

## Cross-References

| Related Document | Topic |
|-----------------|-------|
| `docs/stage2-legitimacy-vocabulary.md` | Classification states |
| `docs/reconciliation-state-machine.md` | Reconciliation and causal ordering |
| `docs/topology-visibility-semantics.md` | Topology and causal ancestry |
| `docs/stage2-conformance-matrix.md` | CONF-DIST-13 |
| `docs/epoch-reconciliation-settlement-semantics.md` | Epoch-bound causal ordering |
| `docs/distributed-temporal-convergence-closure-analysis.md` | Temporal convergence analysis |
