# Distributed Legitimacy Canon Integration & Closure Plan

## Scope & framing

This document is a canon-level integration analysis for distributed legitimacy ontology stabilization. It is intentionally **non-executing** and **non-mutating**: no authority widening, no runtime bypasses, no autonomous reconciliation semantics.

The analysis preserves the current fail-closed doctrine:

- If no valid object exists → nothing happens.
- `validated_object == executed_object`.
- No valid continuity lineage → no valid authority → no valid execution.
- Execution eligibility remains `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID`; else `NULL`.

---

## 1) Canonical ontology integration map

### 1.1 Integration layers

1. **Object layer** (proposal/intent objects, lineage anchors).
2. **Legitimacy evaluation layer** (`/validate`, policy constraints, replay checks).
3. **Execution layer** (`/execute`, bounded to validated object identity).
4. **Proof layer** (`/proof`, append-only lineage evidence).
5. **Reconciliation layer** (cross-topology coherence checks).
6. **Distributed convergence layer** (global coherence attainment, never implied by local success).

### 1.2 Integration links

- **Authority binding** depends on continuity lineage validity.
- **Validation** depends on deterministic object identity and policy guards.
- **Execution** is admissible only for the exact validated object digest.
- **Proof persistence** produces topology-visible evidence only; proof existence is not equivalent to authority.
- **Reconciliation** classifies lineage relation across partitions and replicas.
- **Convergence** is a terminal distributed property requiring explicit reconciliation evidence.

### 1.3 Non-collapse rules

- Visibility does not imply authority.
- Settlement does not imply convergence.
- Local validity does not imply global validity.
- Proof presence does not imply legitimacy finality.

---

## 2) Distributed legitimacy state model

## 2.1 Canonical enum proposal

```ts
export enum DistributedLegitimacyState {
  OPEN = "OPEN",
  PARTIAL = "PARTIAL",
  AMBIGUOUS = "AMBIGUOUS",
  CONVERGED = "CONVERGED",
  STALE_VISIBLE = "STALE_VISIBLE",
  RECONCILABLE = "RECONCILABLE",
  CONVERGENCE_VALID = "CONVERGENCE_VALID",
  OBSERVATIONAL = "OBSERVATIONAL",
  BREAK_GLASS = "BREAK_GLASS",
  LOCAL_VALID = "LOCAL_VALID",
  GLOBAL_VALID = "GLOBAL_VALID",
  NULL = "NULL"
}
```

## 2.2 Semantic boundaries (authoritative)

- **OPEN**: active distributed lifecycle, no terminal judgement.
- **PARTIAL**: incomplete topology visibility but bounded lineage segment exists.
- **AMBIGUOUS**: causal ordering or lineage interpretation is non-unique.
- **CONVERGED**: reconciliation indicates no unresolved distributed divergence.
- **STALE_VISIBLE**: state is visible but known stale relative to newer lineage.
- **RECONCILABLE**: divergence exists yet deterministic reconciliation path is available.
- **CONVERGENCE_VALID**: convergence claim has passed canonical convergence checks.
- **OBSERVATIONAL**: evidence-only state, non-authoritative by design.
- **BREAK_GLASS**: explicit emergency containment marker; never grants implicit execution rights.
- **LOCAL_VALID**: single-surface validity holds.
- **GLOBAL_VALID**: cross-topology validity holds.
- **NULL**: deterministic fail-closed terminal for ineligible legitimacy.

## 2.3 Upgrade/downgrade semantics

- Upgrades require explicit evidence transitions; no inferred jumps.
- Downgrades are mandatory when new evidence invalidates prior certainty.
- `GLOBAL_VALID → LOCAL_VALID` is allowed under partition loss.
- `CONVERGED → RECONCILABLE/AMBIGUOUS` is allowed if later conflicting lineage appears.
- Any unresolved policy breach or replay breach forces `NULL`.

## 2.4 Topology/visibility/reconciliation requirements by state

- `LOCAL_VALID` requires local lineage and local policy satisfaction.
- `GLOBAL_VALID` requires multi-topology reconciliation proofs.
- `CONVERGED` requires absence of unreconciled branches.
- `STALE_VISIBLE` requires visibility plus monotonic newer competing branch.
- `RECONCILABLE` requires machine-deterministic merge path with no authority escalation.
- `OBSERVATIONAL` requires read-only evidence posture.

## 2.5 Authority & proof implications

- Authority eligibility is gated by canonical execution path and never by observability.
- Proof objects are append-only evidence; they certify occurrence/evaluation, not automatic distributed legitimacy.

---

## 3) Canonical invariant registry proposal

## 3.1 Namespace structure

`INV.DIST.<DOMAIN>.<NNNN>`

- `DIST`: distributed legitimacy domain.
- `<DOMAIN>` examples: `SEM`, `TOPO`, `AUTH`, `RCON` (reconciliation), `REPLAY`, `PROOF`.
- `<NNNN>` zero-padded numeric ID for stable references.

## 3.2 Initial canonical registry

- `INV.DIST.SEM.0001`: local correctness ≠ distributed legitimacy coherence.
- `INV.DIST.AUTH.0002`: visibility ≠ authority.
- `INV.DIST.RCON.0003`: reconciliation ≠ convergence.
- `INV.DIST.RCON.0004`: persisted legitimacy lineage must remain recursively reconcilable.
- `INV.DIST.TOPO.0005`: execution legitimacy must remain topology-visible.
- `INV.DIST.REPLAY.0006`: replay eligibility remains lineage-bound.

## 3.3 Validator/conformance integration model

- Validator emits violated invariant IDs on deterministic rejection.
- Conformance vectors bind expected outcomes to invariant IDs.
- Runtime telemetry includes invariant IDs as first-class fields (not free text only).

## 3.4 Enforcement relationships

- **Hard-block invariants** (e.g., replay/authority) map directly to `NULL`.
- **Classifying invariants** (e.g., stale-visible) map to non-terminal distributed states.
- No invariant may silently mutate another invariant’s meaning.

---

## 4) Distributed failure taxonomy proposal

## 4.1 Failure family schema

`FAIL.DIST.<FAMILY>.<NAME>` with severity and containment class.

## 4.2 Canonical taxonomy

- `FAIL.DIST.COHERENCE.SPLIT_BRAIN_LEGITIMACY`
- `FAIL.DIST.CONVERGENCE.REPLAY_CONVERGENCE_FAILURE`
- `FAIL.DIST.AUTH.ORPHAN_AUTHORITY_DRIFT`
- `FAIL.DIST.PROOF.DETACHED_PROOF_LINEAGE`
- `FAIL.DIST.STALENESS.STALE_VISIBLE_DIVERGENCE`
- `FAIL.DIST.CAUSAL.CAUSAL_AMBIGUITY`
- `FAIL.DIST.RCON.RECONCILIATION_DIVERGENCE`
- `FAIL.DIST.TOPO.TOPOLOGY_FRAGMENTATION`

## 4.3 Severity model

- `S0` informational observational mismatch.
- `S1` bounded divergence, reconcilable.
- `S2` authority-risking divergence requiring containment.
- `S3` execution-integrity risk; fail-closed blocking required.

## 4.4 Downgrade & reconciliation classification

- Any `S2+` failure downgrades distributed legitimacy out of `GLOBAL_VALID/CONVERGED`.
- Reconciliation classes:
  - `AUTO_RECONCILABLE`
  - `MANUAL_GOVERNANCE_REVIEW`
  - `NON_RECONCILABLE`

## 4.5 Observability/containment semantics

- All distributed failures must be topology-visible via read-only evidence endpoints.
- No failure class may trigger implicit authority; containment remains non-executing.

---

## 5) Topology-state separation matrix

| Dimension | OBSERVATIONAL | LOCAL_VALID | GLOBAL_VALID | CONVERGED | AUTHORITY_ELIGIBLE |
|---|---|---|---|---|---|
| Evidence visible | Yes | Yes | Yes | Yes | Yes |
| Local policy satisfied | Optional | Required | Required | Required | Required |
| Multi-topology coherence required | No | No | Yes | Yes | Path-dependent |
| Implies execution permission | No | No | No | No | Conditionally (with full canonical checks) |
| Proof exists | Optional | Optional | Optional | Usually | Required for post-exec lineage |

**Interpretation constraints**

- Observability is never authoritative.
- Authority eligibility is a separate gating decision, not a visibility derivative.
- Settlement/proof evidence cannot back-propagate authority.

---

## 6) Runtime-spine stabilization assessment

## 6.1 Proposed spine freeze

`/session → /continuity → /authority → /compile → /validate → /execute → /proof → /reconciliation → /distributed_convergence`

## 6.2 Closure assessment

- **Current closure status**: partially closed at `/proof`; distributed post-proof semantics are conceptually present but should be canonized as explicit phases.
- **Recommendation**: freeze traversal ordering with explicit post-proof layers (`/reconciliation`, `/distributed_convergence`) as legitimacy-evaluation surfaces, not mutation bypass paths.

## 6.3 Dependencies

- Reconciliation depends on proof lineage observability and topology snapshots.
- Distributed convergence depends on reconciliation closure conditions and invariant satisfaction.

## 6.4 Extensibility constraints

- Future layers may extend evidence/detail but cannot reorder or bypass pre-execution canonical gates.
- Any new execution surface must still satisfy canonical path invariants.

---

## 7) Semantic drift risks

1. Synonymous but divergent state labels (e.g., “settled” used as “converged”).
2. Local-success terminology reused for global legitimacy claims.
3. Failure labels without stable IDs causing policy inconsistency.
4. Proof-presence shorthand interpreted as authority.
5. Mixed downgrade policies across routes causing branch-specific semantics.
6. Reconciliation outcomes represented as prose-only, not machine-referenceable enums/IDs.

---

## 8) Recommended canon documents/issues

1. `docs/governance/canon-distributed-state-vocabulary.md`.
2. `docs/governance/canon-distributed-invariants-registry.md`.
3. `docs/governance/canon-distributed-failure-taxonomy.md`.
4. `docs/governance/canon-topology-state-separation.md`.
5. `docs/governance/canon-runtime-spine-freeze.md`.
6. Issue: “Adopt invariant ID wiring in validator and telemetry emissions.”
7. Issue: “Add conformance vectors for downgrade semantics across partitions.”
8. Issue: “Formalize reconciliation class outputs and convergence criteria schema.”

---

## 9) Closure readiness assessment

**Readiness level**: **Conditional-ready** for canon freeze, contingent on:

- Stable enum/state adoption with explicit downgrade rules.
- Invariant IDs integrated into validator + conformance.
- Failure taxonomy integrated into observability and containment.
- Explicit post-proof spine phases documented and test-bound.

Without these, distributed ontology expansion risks inconsistent semantics and topology fragmentation.

---

## 10) Remaining unresolved ontology gaps

1. Canonical distinction between “settled” and “converged” still under-specified.
2. Cross-partition causal ordering tie-break rules require normative definition.
3. Break-glass semantics need explicit non-authoritative boundaries and expiry logic.
4. Reconciliation evidence minimum schema (required fields, hashes, topology IDs) is not yet fixed.
5. Convergence validity proof format is not yet canonized for machine verification.
6. Drift remediation governance loop (detect → classify → approve → apply) lacks a single canonical contract.

---

## Deterministic eligibility guard (normative)

Distributed execution legitimacy remains admissible only when:

`VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID`

Else:

`NULL`

No observational path may elevate authority, and no post-validation mutation may alter the executed object identity.
