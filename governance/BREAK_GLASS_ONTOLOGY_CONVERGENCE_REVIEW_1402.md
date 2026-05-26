# BREAK_GLASS Ontology and Cross-Surface Convergence Review (Issue #1402)

## Scope and guardrails
- Analysis-only review over override-capable and replay/reconciliation/topology surfaces.
- No deploy/workflow execution/D1 mutation/authority creation performed.
- Invariants preserved:
  - `visibility != authority`
  - `BREAK_GLASS != canonical deploy authority`
  - consumed override lineage remains consumed

## 1) Canonical BREAK_GLASS ontology

### Canonical terms (formalized)
- **BREAK_GLASS**: emergency override classification that is evidence-visible but non-canonical and non-promotable by default; cannot bootstrap execution legitimacy.
- **BREAK_GLASS_DEPLOY**: deploy risk class requiring explicit lineage binding and replay block checks before standard deploy predicates can pass.
- **BREAK_GLASS_RELEASE**: release classification path in governed release workflow; always recorded as evidence and hard-blocked from canonical release progression.
- **override lineage**: explicit references (authority/continuity/provenance/release identifiers) that bind override evidence to origin context.
- **emergency lineage**: subset of override lineage carrying explicit break-glass justification and containment semantics.
- **bounded override**: override accepted only as quarantined/evidence state, with no authority promotion side effects.
- **non-canonical lineage**: lineage classified as BREAK_GLASS/NON_CANONICAL where terminal outcome is auditability, not canonical authority.
- **evidence-visible lineage**: lineage retained for observability/provenance and replay checks even when authority collapses to NULL.
- **replay-invalid lineage**: lineage blocked due to nonce/proof/provenance reuse or duplicate identity constraints.
- **topology-visible override**: override detectable in topology/reconciliation inventories but still non-authoritative.
- **quarantined override**: override state that is preserved as containment evidence and cannot transition to canonical execution eligibility.
- **expired override lineage**: override lineage with elapsed authority validity; deterministic NULL for authority-dependent operations.

### Existing vs divergent vs missing vs overloaded
- **Already explicit**:
  - `BREAK_GLASS_DEPLOY` and dedicated fail-closed reasons (`break_glass_unbound`, `break_glass_replay_blocked`).
  - `BREAK_GLASS` release classification with explicit canonical prohibition.
  - Root authority containment posture: classification is not authorization.
- **Divergent naming**:
  - Release uses `BREAK_GLASS`; deploy uses `BREAK_GLASS_DEPLOY`; sovereignty inventory also uses `BREAK_GLASS_AUTHORITY` / containment labels.
- **Missing explicit shared enum**:
  - No single cross-surface ontology object that normalizes override state names, lifecycle phases, and terminal NULL causes.
- **Overloaded concepts**:
  - “classification” is used as risk labeling, containment signal, and release outcome; semantics are aligned but vocabulary is fragmented.

## 2) Canonical vs non-canonical semantics
- Current repo semantics: BREAK_GLASS is never canonical in governed release.
- Deploy semantics do not automatically promote BREAK_GLASS; they require additional lineage constraints and still pass through standard authority/continuity/replay predicates.
- No current bounded promotion rule is implemented; promotion is effectively forbidden unless a future explicit lineage-bound policy object defines it.
- Required proof constraints for any future bounded promotion (not implemented):
  1. immutable lineage graph binding (authority + continuity + override justification),
  2. replay consumption evidence,
  3. topology visibility quorum,
  4. reconciliation-safe conflict collapse proof,
  5. deterministic downgrade-to-NULL conditions.

## 3) Replay convergence semantics
- Deploy surface enforces replay invalidation via `nonce_unique` and `replay_eligible` (`!proofExists`) plus break-glass replay-specific block.
- Release surface enforces duplicate provenance rejection (`release_id`, tag/SHA/hash/attestation consistency checks).
- Consumed lineage behavior is consistent with invariant: once replay-detected/consumed, result remains NULL/invalid path.
- Anti-entropy repair and duplicate collapse are represented in reconciliation/topology policy artifacts as replay-neutral evidence handling; no authority creation path is present.

## 4) Proof/provenance semantics
- Minimum evidence currently enforced on release path:
  - release tag, source commit provenance, PR association, status checks, artifact hash, and deterministic provenance object.
- Evidence can persist while authority is denied:
  - BREAK_GLASS releases are recorded/uploaded as artifacts while canonical progression is blocked.
- Proof survivability across downgrade:
  - Evidence artifacts remain observable even when classification becomes `BREAK_GLASS`/`NON_CANONICAL_RELEASE`/`NULL`.
- Provenance persistence is append-only/audit-oriented on release provenance and root-authority containment inventories.

## 5) Cross-surface convergence map
- **Governed deploy (`src/governed-deploy.ts`)**
  - Authority/continuity: ACTIVE + non-expired required.
  - Replay: nonce/proof + break-glass replay guard.
  - Proof visibility: indirectly required via replay predicate and downstream proof route.
  - Topology visibility: not authoritative here.
  - Canonicality: workflow/environment/hash/scope bound.
  - Terminal NULL/fail: deterministic reason codes.
- **Governance routing (`src/governance-routing.ts`)**
  - Authority resolution only, evidence-only, boundary-protected.
  - Unknown/ambiguous/missing/revoked/consumed/expired => NULL.
  - Explicitly rejects authority/execution/proof creation attempts.
- **Governed release (`.github/workflows/governed-release.yml`)**
  - BREAK_GLASS is hard non-canonical; cannot become canonical candidate.
  - Replay/provenance integrity checks deterministic and fail-closed.
  - Evidence persisted as artifacts and proposed patch only.
- **Topology intelligence (`runtime/governance/TOPOLOGY_RECONCILIATION_POLICY.json`)**
  - Evidence-only, replay-neutral, direct merge authority false.
- **Reconciliation / partition / rollback lineage surfaces (runtime JSON+scripts)**
  - Broad NULL-on-ambiguity posture and replay-neutral containment semantics.

### Divergence boundaries
1. **Vocabulary divergence** across BREAK_GLASS labels (deploy vs release vs sovereignty).
2. **Partition-finality state taxonomy** requested by issue (`LOCAL_VALID`, `GLOBAL_VALID`, etc.) is not a unified runtime enum today.
3. **Cross-surface shared canonicality contract** exists implicitly, not as one machine-readable ontology map.

## 6) Partition-finality behavior matrix (derived)
- `LOCAL_VALID`: local evidence may be structurally valid but non-authoritative globally unless lineage/quorum conditions bind.
- `GLOBAL_VALID`: currently unreachable for BREAK_GLASS without explicit future lineage-bound promotion policy (absent).
- `AMBIGUOUS`: deterministic NULL.
- `STALE_VISIBLE`: evidence may remain visible; authority/execution eligibility collapses to NULL.
- `PARTITION_SUSPENDED`: fail-closed / no execution authority synthesis.
- `NULL`: terminal state for unresolved lineage/replay/authority/topology ambiguity.

## 7) Reconciliation semantics
- Conflict sets are handled as evidence reconciliation, not authority synthesis.
- Stale override claims collapse to NULL/non-canonical outcomes.
- Replay-neutral merge semantics are asserted in topology/reconciliation governance artifacts.
- Tie-break authority is not inferred from visibility; unresolved conflict remains NULL.
- Invariant satisfied: reconciliation does not create authority.

## 8) Canonical/non-canonical transition rules (current)
1. Canonical candidate requires full lineage/provenance constraints pass.
2. BREAK_GLASS classification bypasses canonical candidate status and is terminally non-canonical for governed release.
3. Replay or lineage inconsistency transitions to NULL/INVALID and cannot self-heal into authority.
4. Visibility retention (artifacts/inventories) is allowed post-downgrade.

## 9) NULL-condition matrix (deterministic)
- Replayed override lineage -> NULL/INVALID.
- Stale override lineage -> NULL.
- Hidden override execution attempt -> boundary violation -> NULL.
- Topology-invisible override -> containment drift / merge legitimacy NULL.
- Split-brain override claims -> ambiguity/divergence -> NULL.
- Reconciliation ambiguity -> NULL.
- Missing proof lineage / provenance mismatch -> NULL.
- Continuity discontinuity -> invalid continuity -> NULL.
- Unauthorized canonical promotion attempt -> non-canonical/NULL.
- Replay-repair inconsistency -> NULL.

## 10) Highest-leverage bounded closure recommendations
1. Add a **single machine-readable ontology enum** file shared by deploy/release/reconciliation/topology for BREAK_GLASS states and transition causes.
2. Add **partition-finality canonical enum** mapping (`LOCAL_VALID`, `GLOBAL_VALID`, `AMBIGUOUS`, `STALE_VISIBLE`, `PARTITION_SUSPENDED`, `NULL`) with explicit non-authority semantics.
3. Add **cross-surface reason-code normalization table** (alias mapping only, additive) to eliminate vocabulary drift without changing validators.
4. Add tests asserting:
   - BREAK_GLASS never canonical in release workflow,
   - BREAK_GLASS_DEPLOY requires lineage binding + replay block,
   - reconciliation/topology outputs cannot set authority-creating flags.

## Implementation eligibility determination
- **Bounded implementation status: SUSPENDED (NULL)** for behavioral/runtime changes.
- Reason: semantics are largely convergent in fail-closed direction, but cross-surface ontology and partition-finality enums are not yet canonically unified as executable shared contracts; implementing behavior now risks implicit authority interpretation drift.
- **Permitted now (additive only):** documentation/spec canonicalization and reason-code normalization metadata.
