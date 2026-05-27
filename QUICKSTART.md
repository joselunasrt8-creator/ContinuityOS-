# ContinuityOS Quickstart

**Status:** NON_OPERATIVE — documentation only  
**Covers:** Stage 1 (Governed CI/CD) + Stage 2 (Distributed Legitimacy)

---

## WARNING

> **Visibility ≠ authority.**  
> **Reconciliation ≠ authority.**  
> **Proof existence ≠ finality.**  
> **Topology visibility ≠ legitimacy.**  
> **Conformance ≠ execution authority.**

No classification state, topology snapshot, reconciliation outcome, or conformance test passage grants execution eligibility on its own. Execution requires a valid MindShift authority lineage.

---

## Core Invariant

```text
If no valid object exists → nothing happens
```

```text
validated_object == executed_object
```

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
→ eligible for consideration
Else → NULL
```

Each predicate must be independently proven. No predicate substitutes for another.

---

## Canonical Runtime Flow

```text
/session
→ /continuity
→ /authority
→ /compile   (produces AEO with validated_object_hash)
→ /validate  (returns VALID or NULL)
→ /execute   (through non-bypassable boundary)
→ /proof     (append-only lineage evidence)
```

All state-changing execution surfaces must route through this lifecycle.

---

## Stage 1: Governed CI/CD (Completed)

Stage 1 proved `validated_object_hash == executed_object_hash` within a single governed CI/CD surface.

### Developer Workflow (Repeatable)

1. **Request authority**: `POST /authority`
2. **Compile deterministic AEO**: `POST /compile`
   - Record `decision_id` and `validated_object_hash`
3. **Validate exact object**: `POST /validate`
   - Must return `status="VALID"` and `result="VALID"`
4. **Execute via boundary**: `POST /execute`
   - Production target is `governed-deploy.yml`
5. **Persist proof**: `POST /proof`
   - Proof anchors execution and object lineage

Do not reorder or skip steps.

### VALID Path

Execution proceeds only when:
- Authority/session/continuity checks pass
- Compile output hash unchanged through validation/execution
- Validation returns `VALID`
- Execution admitted through `/execute` boundary
- Proof persistence succeeds

### NULL Path

Runtime returns `NULL` (and blocks mutation) when any guard fails:
- Missing, expired, or revoked authority or broken lineage
- `validated_object_hash` mismatch
- Replay signal (reused nonce, consumed authority, duplicate lineage)
- Execution attempt without prior `VALID`
- Proof write orphaned or inconsistent with execution lineage

`NULL` is the correct safety outcome for ambiguity, staleness, replay, and bypass attempts.

### Replay Behavior

Replay protection is active by design:
- Replaying consumed authority → `NULL`
- Replaying invocation nonce → `NULL`
- Replaying identical execution lineage → `NULL`
- Duplicate or ambiguous proof lineage → `NULL`

**Reference:** `docs/governed-deploy-quickstart.md`

---

## Stage 2: Distributed Legitimacy

Stage 2 extends Stage 1 guarantees to distributed topology. Local correctness does not imply distributed legitimacy coherence.

```text
local correctness ≠ distributed legitimacy coherence
```

### Distributed Legitimacy Lifecycle

```text
LOCAL_VALID
→ [topology-visible convergence required]
→ CONVERGENCE_VALID
→ [all GLOBAL_VALID predicates independently satisfied]
→ GLOBAL_VALID candidate
```

`LOCAL_VALID` cannot skip directly to `GLOBAL_VALID`. The `CONVERGENCE_VALID` intermediate state must be established with topology-visible quorum evidence.

### 12-State Legitimacy Vocabulary

Full definitions in `docs/stage2-legitimacy-vocabulary.md`.

| State | Execution Implication |
|-------|----------------------|
| `GLOBAL_VALID` | All predicates satisfied; not execution eligibility by itself |
| `LOCAL_VALID` | Single-surface evidence; NOT distributed finality |
| `PARTITION_SUSPENDED` | NULL execution eligibility |
| `STALE_VISIBLE` | NULL execution eligibility; evidence preserved |
| `AMBIGUOUS` | NULL execution eligibility |
| `CONVERGENCE_VALID` | Candidate for GLOBAL_VALID; not execution authority |
| `FINALIZED` | Replay permanently consumed |
| `NULL` | Absolute prohibition on execution |

### NULL Conditions

The following conditions produce mandatory `NULL`:

- `LOCAL_VALID` treated as `GLOBAL_VALID` without topology-visible convergence evidence
- Topology visibility incomplete for a global claim
- Causal ancestry missing or inverted
- Replay divergence unresolved
- Stale lineage remains active
- Proof lineage detached
- Partition prevents convergence proof
- Conflict-set settlement ambiguous
- Epoch validity unresolved
- Reconciliation attempts to create authority

### Non-Authority Guarantees

Stage 2 components provide evidence and classification. They do not create authority.

| Component | What It Does | What It Cannot Do |
|-----------|-------------|------------------|
| Reconciliation engine | Classifies legitimacy state | Create authority |
| Topology snapshot | Reports visibility evidence | Create legitimacy |
| Causal clock | Orders events deterministically | Grant execution eligibility |
| ValidatorAttestationEnvelope | Records attestation evidence | Issue authority |
| ConflictSetEnvelope | Records settlement evidence | Erase losing branches |
| Conformance suite | Verifies invariants | Grant execution eligibility |

### Reconciliation

The reconciliation state machine produces classifications. It does not create authority, restore consumed replay state, or grant execution eligibility.

```text
reconciliation ≠ authority
reconciliation ≠ convergence
```

States: `OBSERVED` → `PENDING` → `RECONCILING` → (`CONFLICTED` | `CONVERGED`) → `FINALIZED` or `NULL`

**Reference:** `docs/reconciliation-state-machine.md`

### Topology Visibility

Topology visibility is a required input for `GLOBAL_VALID` classification. Topology invisibility returns `NULL` or `AMBIGUOUS`.

```text
topology visibility ≠ legitimacy
topology visibility ≠ authority
```

**Reference:** `docs/topology-visibility-semantics.md`

### Causal Legitimacy Clocks

Causal legitimacy clocks enforce happens-before ordering for legitimacy events. Causal ambiguity returns `AMBIGUOUS`. Causal inversion returns `NULL`.

```text
causal evidence ≠ execution authority
```

**Reference:** `docs/causal-legitimacy-clock-semantics.md`

### Proof Finality

Proof existence does not imply finality. Detached proof (no reconstructable continuity lineage) returns `NULL`. All downgrade/upgrade events are append-only and immutable.

```text
proof existence ≠ finality
proof visibility ≠ execution authority
```

### Conflict-Set Settlement

Losing branches are preserved permanently. No losing branch may be deleted or overwritten. If no deterministic winner can be identified by causal ordering → `NULL`.

---

## Conformance

Stage 1 and Stage 2 conformance suites both run non-operatively. Test passage does not create authority.

| Suite | File | Checks |
|-------|------|--------|
| Stage 1 (CI/CD) | `conformance/suites/cicd-stage1-conformance.json` | CONF-CICD-01–15 |
| Stage 2 (Distributed) | `conformance/suites/stage2-distributed-legitimacy-conformance.json` | CONF-DIST-01–15 |

**Reference:** `docs/stage2-conformance-matrix.md`

---

## Cross-References

| Document | Topic |
|----------|-------|
| `docs/stage2-legitimacy-vocabulary.md` | 12-state vocabulary and LOCAL_VALID vs GLOBAL_VALID |
| `docs/reconciliation-state-machine.md` | Reconciliation state machine |
| `docs/topology-visibility-semantics.md` | Topology visibility semantics |
| `docs/causal-legitimacy-clock-semantics.md` | Causal legitimacy clock semantics |
| `docs/stage2-conformance-matrix.md` | CONF-DIST-01–15 overview |
| `docs/governed-deploy-quickstart.md` | Stage 1 governed deploy walkthrough |
| `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md` | Full Stage 2 plan |
| `docs/glossary.md` | Canonical terminology |
| `docs/governance/legitimacy-glossary.md` | Extended legitimacy glossary |
