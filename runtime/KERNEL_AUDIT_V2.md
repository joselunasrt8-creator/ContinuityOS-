# Kernel Audit V2 — Minimum Kernel Classification

Branch: `claude/v2-kernel-minimization-jyhccc`
Audit date: 2026-06-09
Scope: All source files in `src/` and `runtime/`
Method: Static import tracing + HTTP/transport primitive scan

---

## Classification Schema

| Label | Definition |
|---|---|
| **REQUIRED** | Part of the minimum kernel: authority → AEO → validate → execute → proof |
| **ADAPTER** | Surface-specific adapter (filesystem, D1, Cloudflare, GitHub, shell) |
| **OBSERVABILITY** | Read-only monitoring/evidence/metrics; no mutation capability |
| **DISCOVERY** | Topology reconciliation, federation, drift detection, PREO logic |
| **SEQUENCED** | Needed but not in first kernel extraction pass; requires further scoping |
| **REMOVE_CANDIDATE** | No confirmed production import, no test dependency, no governance manifest dependency |

---

## Kernel Boundary Rule

The kernel is **transport-independent and interface-bound**. It receives effect
interfaces (`validator_context`, `executor`) but never server transport or runtime
handles.

A function is **not kernel code** if it accepts any of:
`Request`, `Response`, `URL`, `Headers`, `Env`, `D1Database`,
HTTP method, route path, or any Cloudflare-specific handle.

Kernel properties:
- May evaluate read-only registry/filesystem observations through declared interfaces
- May invoke the executor only after a VALID Ω-validator result
- Must not receive server transport/runtime handles

---

## Minimum Kernel Execution Path

```
authority → AEO → validate → execute → proof

src/canonical.js
  └── runtime/legitimacy/validators/schema-validator.js
      └── src/lib/filesystem-aeo.ts
          └── src/lib/filesystem-write-gateway.ts  (capture, compile, execute-boundary)
              └── src/lib/filesystem-aeo-validator.ts  (Ω: 10-step validation)
                  └── src/lib/filesystem-write-runtime-gateway.ts  (mandatory composition)
```

---

## src/ — Top-Level Files

| File | Classification | Rationale |
|---|---|---|
| `src/canonical.js` | **REQUIRED** | `canonicalize` + `sha256Hex`; pure; `authority: true`; no transport primitives |
| `src/canonical-authority.js` | **REQUIRED** | Authority registry; enforces exactly one canonical authority module |
| `src/canonical.d.ts` | **REQUIRED** | Type declarations for canonical.js |
| `src/causal-legitimacy-clocks.ts` | **REQUIRED** | `CausalLegitimacyClockResult`; pure state machine; no transport |
| `src/result.ts` | **REQUIRED** | Pure result type utilities |
| `src/legitimacy-conflict-arbitration.ts` | **REQUIRED** | Pure arbitration hash computation |
| `src/index.ts` | **ADAPTER** | 9,339-line Cloudflare Workers entrypoint; owns `Request`, `Response`, `URL`, `Env`, `D1Database`; routes 102 endpoints; first minimization target for V2 extraction |
| `src/telemetry.ts` | **OBSERVABILITY** | Evidence emission; no mutation capability |
| `src/legitimacy-telemetry.ts` | **OBSERVABILITY** | Evidence-only telemetry classification |
| `src/install-base-dependency-dashboard.ts` | **OBSERVABILITY** | Install-base metrics |
| `src/temporal-legitimacy-replay-visualization.ts` | **OBSERVABILITY** | Replay visualization; no mutation |
| `src/install_base/report.mjs` | **OBSERVABILITY** | Install-base usage report |
| `src/continuity-lineage-graph.ts` | **DISCOVERY** | Topology lineage graph |
| `src/continuity-lineage-closure-hardening.ts` | **DISCOVERY** | Closure hardening for lineage; delegates to canonical |
| `src/distributed-topology-convergence.ts` | **DISCOVERY** | Topology convergence analysis |
| `src/distributed-topology-divergence-observer.ts` | **DISCOVERY** | Topology divergence observation |
| `src/distributed-topology-visualization-projection.ts` | **DISCOVERY** | Visualization projection; read-only |
| `src/distributed-replay-convergence.ts` | **DISCOVERY** | Distributed replay convergence |
| `src/cross-registry-legitimacy-reconciliation.ts` | **DISCOVERY** | Cross-registry reconciliation |
| `src/distributed-continuity-lineage-reconciliation.ts` | **DISCOVERY** | Continuity lineage reconciliation |
| `src/surface-graph-reconciliation.ts` | **DISCOVERY** | Surface graph reconciliation |
| `src/recursive-revocation-propagation.ts` | **DISCOVERY** | Revocation propagation; delegates to canonical |
| `src/recursive-semantic-drift-detection.ts` | **DISCOVERY** | Drift detection |
| `src/governance-routing.ts` | **SEQUENCED** | Governance route classification; not in first extraction |
| `src/governance-complexity-budgeting.ts` | **SEQUENCED** | Complexity budgeting |
| `src/governance-module-boundary-enforcement.ts` | **SEQUENCED** | Module boundary rules |
| `src/governed-deploy.ts` | **SEQUENCED** | Deploy governance |
| `src/economic-governance.ts` | **SEQUENCED** | Economic governance model |
| `src/economic-governance.js` | **SEQUENCED** | Compiled output of economic-governance.ts |
| `src/dependency-criticality-analysis.ts` | **SEQUENCED** | Dependency analysis |
| `src/inter-surface-coordination.ts` | **SEQUENCED** | Surface coordination |
| `src/legitimacy-surface-closure-map.ts` | **SEQUENCED** | Surface closure mapping |
| `src/runtime-checkpoint-restoration.ts` | **SEQUENCED** | Checkpoint restoration |
| `src/runtime-topology-intelligence.ts` | **SEQUENCED** | Topology intelligence |

---

## src/lib/ — Library Modules

| File | Classification | Rationale |
|---|---|---|
| `src/lib/filesystem-aeo.ts` | **REQUIRED** | `FilesystemAEO` type definitions, `materializeFilesystemAEO`, `computeFilesystemAEOHash`; pure; no transport |
| `src/lib/filesystem-aeo-validator.ts` | **REQUIRED** | 10-step Ω validator; all I/O through declared read-only interfaces (`FilesystemValidatorContext`); no direct HTTP/DB — see Validator Reasoning Flag below |
| `src/lib/filesystem-write-gateway.ts` | **REQUIRED** | `captureFilesystemWriteATAO`, `compileFilesystemWriteAEO`, `executeFilesystemWrite`; pure pipeline stages; `FilesystemWriteExecutor` is the adapter-boundary type |
| `src/lib/filesystem-write-runtime-gateway.ts` | **REQUIRED** | `runFilesystemWriteGatewayAction`; mandatory composition gate; the only path to an EXECUTED filesystem-write proof |
| `src/lib/authority-review.ts` | **REQUIRED** | Authority approval flow: Proposal → ApprovedReview → ATAO; pure state machine |
| `src/lib/aeo-governance.ts` | **REQUIRED** | Canonical AEO shape validation and normalization; pure; delegates to canonical |
| `src/lib/proof-finality-metadata.ts` | **REQUIRED** | Append-only proof lifecycle events; `creates_authority: false`; `restores_replay: false`; pure |
| `src/lib/adapter-contract.ts` | **REQUIRED** | Generic adapter boundary; enforces shape/hash integrity; emits proof receipts; no HTTP/transport primitives (executor is injected, not called here) |
| `src/lib/causal-clock.ts` | **REQUIRED** | Lamport-style causal ordering; pure |
| `src/lib/causal-legitimacy-clock.ts` | **REQUIRED** | Vector clock comparison and concurrent ordering detection; pure |
| `src/lib/conflict-set.ts` | **REQUIRED** | Conflict classification and canonical tie-break; pure |
| `src/lib/distributed-replay-convergence-enforcement.ts` | **REQUIRED** | Replay legitimacy rules (5 rules + execution boundary); evidence-only; pure |
| `src/lib/epoch-substrate.ts` | **REQUIRED** | Epoch finality states and state machine transitions; pure |
| `src/lib/finality-classification.ts` | **REQUIRED** | Finality state machine and partition admission; pure |
| `src/lib/quorum-attestation.ts` | **REQUIRED** | Quorum evaluation from weighted attestations; pure |
| `src/lib/reconciliation-determinism.ts` | **REQUIRED** | Registry head selection and reconciliation finality; pure |
| `src/lib/reconciliation-state-machine.ts` | **REQUIRED** | Reconciliation state machine with legal-transition table; pure |
| `src/lib/replay-convergence.ts` | **REQUIRED** | Distributed replay states and anti-entropy merge; pure |
| `src/lib/revocation-liveness.ts` | **REQUIRED** | Revocation channel SLA evaluation; evidence-only; pure |
| `src/lib/topology-visibility.ts` | **REQUIRED** | Topology snapshot classification (6 states); pure |
| `src/lib/cloudflare-adapter.ts` | **ADAPTER** | `CloudflareWorkerExecutor` callback; HTTP evidence binding; routes Cloudflare-specific execution |
| `src/lib/d1-storage-adapter.ts` | **ADAPTER** | `D1Executor` callback; D1 query evidence binding; routes D1-specific execution |
| `src/lib/topology-epoch.ts` | **ADAPTER** | Receives `D1Database` directly; D1-specific epoch classification; not kernel-pure |
| `src/lib/github-issue-comment-gateway.ts` | **ADAPTER** | GitHub HTTP surface adapter; SEQUENCED for next proven loop |
| `src/lib/behavioral-authority-surfaces.ts` | **OBSERVABILITY** | Surface classification evidence; `creates_authority: false`; pure |
| `src/lib/agent-tool-gateway.ts` | **SEQUENCED** | `selectAEOTemplate` needs D1 via `AEOTemplateDB` interface; not transport-pure; needed but not in first kernel extraction |
| `src/lib/predicate-registry.ts` | **SEQUENCED** | Topology-only lookup; requires `PredicateRegistryDB` (D1 interface); not kernel-pure |
| `src/lib/capability-risk-classification.js` | **SEQUENCED** | Risk surface classification; further scoping needed |
| `src/lib/legitimacy-governance.js` | **SEQUENCED** | Legitimacy governance; delegates to canonical; further scoping needed |
| `src/lib/skill-provenance-revocation.js` | **SEQUENCED** | Skill provenance revocation; delegates to canonical; further scoping needed |

---

## src/runtime/ — Runtime Verification Modules

| File | Classification | Rationale |
|---|---|---|
| `src/runtime/lineage/verifyLineageOrigin.ts` | **REQUIRED** | Lineage origin verification; used by kernel execution sequence |
| `src/runtime/continuity/verifyContinuityLineage.ts` | **REQUIRED** | Continuity lineage verification; no transport |
| `src/runtime/deployment/verifyDeploymentProof.ts` | **REQUIRED** | Deployment proof verification |
| `src/runtime/deployment/verifyDeploymentProvenance.ts` | **REQUIRED** | Deployment provenance; no transport |
| `src/runtime/deployment/verifyRollbackLineage.ts` | **REQUIRED** | Rollback lineage verification |
| `src/runtime/federation/reconcileFederatedLegitimacy.ts` | **DISCOVERY** | Federation reconciliation |

---

## src/reconciliation/ — Reconciliation Invariants

| File | Classification | Rationale |
|---|---|---|
| `src/reconciliation/reconciliation-invariants.ts` | **REQUIRED** | Core reconciliation invariants; pure |
| `src/reconciliation/fate-tests.ts` | **REQUIRED** | Fate-test predicates; pure |
| `src/reconciliation/mutation-surface-exhaustiveness.ts` | **REQUIRED** | Mutation surface exhaustiveness checks; pure |
| `src/reconciliation/traversal-hash.ts` | **REQUIRED** | Traversal hash computation; delegates to canonical |

---

## src/skill-metadata/ and src/skill-surfaces/

| File | Classification | Rationale |
|---|---|---|
| `src/skill-metadata/validator.mjs` | **SEQUENCED** | Agent skill metadata validation |
| `src/skill-surfaces/registry-validator.mjs` | **SEQUENCED** | Execution surface registry validation |

---

## src/visualizer/

| File | Classification | Rationale |
|---|---|---|
| `src/visualizer/topology-graph-viewer.ts` | **OBSERVABILITY** | Topology graph visualization; read-only |

---

## src/telemetry/

| File | Classification | Rationale |
|---|---|---|
| `src/telemetry/append-only-ingestion-pipeline.ts` | **OBSERVABILITY** | Append-only evidence pipeline; no mutation |

---

## runtime/ — Governance and Reconciliation Engine Files

| File | Classification | Rationale |
|---|---|---|
| `runtime/legitimacy/validators/schema-validator.js` | **REQUIRED** | Generic Ω structural validator; validates ATAO, AEO, PREO, SCO, Authority, ContinuityObject, FederationEnvelope; pure; no transport |
| `runtime/aeo-governance.test.ts` | TEST | AEO governance test suite |
| `runtime/cloudflare-sovereignty.test.ts` | TEST | Cloudflare sovereignty test suite |
| `runtime/continuity-lineage-identity-convergence.test.ts` | TEST | Continuity lineage convergence tests |
| `runtime/continuous_reconciliation_orchestrator.mjs` | **DISCOVERY** | Continuous reconciliation orchestrator; delegates to canonical |
| `runtime/cross_registry_authority_reconciliation.mjs` | **DISCOVERY** | Cross-registry authority reconciliation |
| `runtime/federated_sovereignty_drift_coordinator.mjs` | **DISCOVERY** | Federated sovereignty drift coordination; delegates to canonical |
| `runtime/merge-object-hash.mjs` | **SEQUENCED** | Merge object hash computation |
| `runtime/portable_legitimacy_bundle_generator.mjs` | **SEQUENCED** | Legitimacy bundle generator; delegates to canonical |
| `runtime/reconciliation/cross-registry-reconciliation-engine.js` | **DISCOVERY** | Cross-registry reconciliation engine |
| `runtime/reconciliation/drift-propagation-engine.js` | **DISCOVERY** | Drift propagation engine |
| `runtime/reconciliation/quarantine-containment-engine.js` | **DISCOVERY** | Quarantine containment engine |
| `runtime/reconciliation/topology-reconciliation-engine.js` | **DISCOVERY** | Topology reconciliation engine; delegates to canonical |
| `runtime/reconciliation_scheduler.mjs` | **DISCOVERY** | Reconciliation scheduler |
| `runtime/recursive_drift_propagation_engine.mjs` | **DISCOVERY** | Recursive drift propagation; delegates to canonical |
| `runtime/recursive_quarantine_orchestrator.mjs` | **DISCOVERY** | Recursive quarantine orchestrator; delegates to canonical |
| `runtime/runtime_surface_scanner.mjs` | **OBSERVABILITY** | Runtime surface scanner; read-only |
| `runtime/sovereignty/root-authority-containment.js` | **SEQUENCED** | Root authority containment; further scoping needed |
| `runtime/surface_inventory_reconciler.mjs` | **OBSERVABILITY** | Surface inventory reconciliation; delegates to canonical |
| `runtime/temporal_lineage_replay_inspector.ts` | **OBSERVABILITY** | Temporal lineage replay inspection; read-only |
| `runtime/topology_lineage_registry.mjs` | **DISCOVERY** | Topology lineage registry; delegates to canonical |
| `runtime/adoption/adoption_tracker.mjs` | **OBSERVABILITY** | Adoption tracking; read-only |

---

## runtime/control_graph_* — Control Graph Projection

These files define the control graph projection model (authority, boundary,
conformance, continuity, drift, emitter, equivalence, federation, hooks,
integration, lineage, observability, projection, proof, reconciliation, registry,
replay, sovereignty, validator). They are read-only graph construction and
projection logic with no mutation capability.

| File | Classification |
|---|---|
| `runtime/control_graph_authority.ts` | **OBSERVABILITY** |
| `runtime/control_graph_boundary.ts` | **OBSERVABILITY** |
| `runtime/control_graph_conformance.ts` | **OBSERVABILITY** |
| `runtime/control_graph_continuity.ts` | **OBSERVABILITY** |
| `runtime/control_graph_drift.ts` | **OBSERVABILITY** |
| `runtime/control_graph_emitter.ts` | **OBSERVABILITY** |
| `runtime/control_graph_equivalence.ts` | **OBSERVABILITY** |
| `runtime/control_graph_federation.ts` | **OBSERVABILITY** |
| `runtime/control_graph_hooks.ts` | **OBSERVABILITY** |
| `runtime/control_graph_integration.ts` | **OBSERVABILITY** |
| `runtime/control_graph_lineage.ts` | **OBSERVABILITY** |
| `runtime/control_graph_observability.ts` | **OBSERVABILITY** |
| `runtime/control_graph_projection.ts` | **OBSERVABILITY** |
| `runtime/control_graph_proof.ts` | **OBSERVABILITY** |
| `runtime/control_graph_reconciliation.ts` | **OBSERVABILITY** |
| `runtime/control_graph_registry.ts` | **OBSERVABILITY** |
| `runtime/control_graph_registry_projection.ts` | **OBSERVABILITY** |
| `runtime/control_graph_replay.ts` | **OBSERVABILITY** |
| `runtime/control_graph_sovereignty.ts` | **OBSERVABILITY** |
| `runtime/control_graph_validator.ts` | **OBSERVABILITY** |

---

## Validator Reasoning Flag

**File:** `src/lib/filesystem-aeo-validator.ts → validateFilesystemAEO()`

### Step classification:

| Steps | Type | Description |
|---|---|---|
| 1 — Structural shape | STRUCTURAL | Exact key count and field order match; no semantic interpretation |
| 2 — AEO hash binding | STRUCTURAL | Canonical SHA256 recomputation; pure hash comparison |
| 3 — Authority lineage | POLICY EVALUATION | Decision lookup → ACTIVE status → lineage hash match |
| 4 — Policy binding | POLICY EVALUATION | Policy lookup → policy hash match |
| 5 — Scope/path/operation | POLICY EVALUATION | `matchesGlob` / `pathMatchesAny` — interprets path against policy patterns |
| 6 — Replay eligibility | POLICY EVALUATION | `nonceObs.value !== "UNUSED"` — decides replay state |
| 7 — Pre-state integrity | POLICY EVALUATION | `fileHashObs.value !== pre_write_hash` — decides pre-write hash match |
| 8 — Diff integrity | POLICY EVALUATION | `diffApplicabilityObs.value.applicable` — decides diff applicability |
| 9 — Finality requirements | STRUCTURAL | `proof_required`, `registry_required`, `replay_state_after_success` field checks |
| 10 — Eligibility decision | DECISION | Returns `VALID` with `aeo_hash` or `NULL` with `DenialResult` |

### Verdict

Steps 5, 6, 7, 8 involve contextual interpretation and decisions that go beyond
structural shape checking. The validator **interprets and decides** — it is a
policy evaluator, not a schema validator.

This is **intentional kernel behavior**. The kernel boundary is enforced by
the interface types (`FilesystemValidatorContext`), not by restricting the
validator to structural-only checks. All decisions go through read-only declared
interfaces:
- `ReadonlyAuthorityRegistry`
- `ReadonlyPolicyRegistry`
- `ReadonlyReplayRegistry`
- `ReadonlyFilesystemAdapter`
- `ReadonlyDiffInspector`
- `ReadonlyClock`

No HTTP/transport primitive enters through these interfaces. The validator is
**transport-independent and interface-bound**.

**No change required in this PR.** A future "kernel validator purity spec" issue
should formally document which steps constitute policy evaluation vs. structural
validation, and whether the distinction has operational consequences.

---

## V2 Extraction Sequence (forward reference)

This audit establishes classification. Extraction follows in subsequent PRs.

**Phase 1 (this PR):** Classify + enforce type boundary.
**Phase 2:** Extract `src/index.ts` route dispatch into adapter shell module.
  - Move observability route handlers out of the main fetch handler
  - Move schema stabilization, sovereignty diagnostics, telemetry emission out
  - Keep only: parse request → extract intent → construct context → call kernel → serialize result
**Phase 3:** Extract topology/PREO/deploy-provenance logic from adapter shell.
**Phase 4:** Assess SEQUENCED files for kernel inclusion or adapter assignment.
**Phase 5:** Identify REMOVE_CANDIDATE files via import tracing (no change until confirmed safe).

---

## Summary Counts

| Classification | src/ count | runtime/ count | Total |
|---|---|---|---|
| REQUIRED | 37 | 1 | 38 |
| ADAPTER | 5 | 0 | 5 |
| OBSERVABILITY | 7 | 22 | 29 |
| DISCOVERY | 11 | 10 | 21 |
| SEQUENCED | 12 | 3 | 15 |
| REMOVE_CANDIDATE | 0 | 0 | 0 |
| TEST | 0 | 3 | 3 |

No REMOVE_CANDIDATE files are identified in this first pass. Deletion candidates
require confirmed absence of production import, test dependency, and governance
manifest dependency — a separate tracing pass.
