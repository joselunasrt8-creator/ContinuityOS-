# V3 Minimal Continuity-Core Boundary Specification

**Branch:** `claude/v3-core-boundary-spec-sifbeu`
**Spec date:** 2026-06-09
**Scope:** Repository-wide subsystem classification for V3 kernel extraction
**Prerequisite audits:**
- `runtime/KERNEL_AUDIT_V2.md` — V2 kernel classification (REQUIRED / ADAPTER / OBSERVABILITY / DISCOVERY / SEQUENCED)
- `runtime/V2_PHASE3_INDEX_AUDIT.md` — `src/index.ts` cluster-by-cluster analysis
**Runtime changes:** None. Classification and boundary definition only.

---

## Context

V1 proved one live governed execution surface: filesystem-write.

The proven chain is:

```
Agent
→ ATAO
→ AEO
→ Ω Validation
→ Execution Boundary
→ Proof
Else NULL
```

Current invariants — must survive V3:

```
If no valid object exists → nothing happens.
validated_object == executed_object.
```

V2 has been reducing the runtime shell rather than expanding capability:

- Phase 1 — kernel classification / intent-context split
- Phase 2 — filesystem-write route adapter extraction
- Phase 3 — `src/index.ts` responsibility audit (36 clusters, ~8,851 lines)
- Phase 4 — runtime observability adapter extraction

V2 conclusion: the kernel is classified and the shell is thinning.

V3 objective: **extract the kernel** — define the portable `continuity-core` boundary,
separate it from the Cloudflare runtime shell, and establish the conformance interface
between TypeScript and Rust implementations.

---

## V3 Classification Schema

This spec uses the V2 schema extended with three V3-specific categories:

| Label | Definition |
|---|---|
| `CONTINUITY-CORE` | Portable kernel — survives every cloud, database, route, and adapter swap |
| `SURFACE-ADAPTER` | Transport-level routing, HTTP parsing, response formatting, auth wiring |
| `STORAGE-ADAPTER` | Database-specific read/write: D1, SQLite, Postgres |
| `OPTIONAL-OBSERVABILITY` | Evidence emission and metrics; must never influence VALID / NULL |
| `OFFLINE-DISCOVERY` | Topology reconciliation, federation, drift detection; offline / async only |
| `FREEZE` | Implemented but not on the hot path; retain without modification |
| `REMOVE-CANDIDATE` | No confirmed production import, test dependency, or governance manifest dependency |

Status modifiers applied per file:

| Status | Meaning |
|---|---|
| `implemented` | File exists and is confirmed reachable from the execution chain |
| `tested` | Covered by a test suite in `tests/` or `runtime/*.test.ts` |
| `merged` | Change is on a merged branch (confirmed from V2 audit trail) |
| `planned` | Explicitly scoped for V3; file does not yet exist |
| `research-only` | File exists; not reachable from execution chain; may be archived |

---

## Proven Execution Chain (Frozen)

The following chain is the entire hot path. Nothing in this spec modifies it.

```
src/canonical.js                              canonicalize + sha256Hex
  └── runtime/legitimacy/validators/
         schema-validator.js                  structural Ω validator
      └── src/lib/filesystem-aeo.ts           ATAO → AEO materialization
          └── src/lib/filesystem-write-gateway.ts
                                              capture / compile / execute boundary
              └── src/lib/filesystem-aeo-validator.ts
                                              10-step Ω policy evaluator → VALID | NULL
                  └── src/lib/filesystem-write-runtime-gateway.ts
                                              mandatory composition gate → proof
```

---

## Section 1 — continuity-core

The portable core contains **only what survives every cloud, database, route, and adapter swap**.
A function belongs here if and only if it accepts no `Request`, `Response`, `URL`,
`Headers`, `Env`, `D1Database`, HTTP method, route path, or any cloud-specific handle.

### 1.1 Rust Implementation (`continuity-core/src/`)

All nine Rust source files are `implemented`. None are yet covered by cross-language
conformance tests (see V3 sequence, step 5).

| File | Capability | Lines | Status |
|---|---|---|---|
| `canonicalization.rs` | Deterministic JSON serialization | 177 | `implemented` |
| `hashing.rs` | SHA-256 canonical hash | 93 | `implemented` |
| `aeo_validation.rs` | AEO exact-field validation | 97 | `implemented` |
| `replay.rs` | Replay state machine | 52 | `implemented` |
| `proof.rs` | Proof envelope contract | 74 | `implemented` |
| `lineage.rs` | Lineage hash verification | 118 | `implemented` |
| `types.rs` | Shared type definitions | 138 | `implemented` |
| `reconciliation.rs` | Reconciliation invariants | 37 | `implemented` |
| `lib.rs` | Crate entry point and public API | 249 | `implemented` |

**Gap:** `hashing.rs` does not yet include a pure-Rust implementation of the DSSE
provenance envelope from `src/index.ts` lines 1807–1983. This is a conformance gap
for V3 step 4.

### 1.2 TypeScript Candidates (move into continuity-core interface or port to Rust)

These TypeScript files are `REQUIRED` in the V2 kernel audit and contain no
transport or storage handles. They define the portable interface that the Rust
implementation must conform to.

| File | Capability | Lines | V2 Status | V3 Action |
|---|---|---|---|---|
| `src/canonical.js` | `canonicalize` + `sha256Hex`; pure; `authority: true` | 207 | `REQUIRED` `merged` | Define as `continuity-core` TypeScript interface |
| `src/lib/filesystem-aeo.ts` | `FilesystemAEO` types; `materializeFilesystemAEO`; `computeFilesystemAEOHash` | 278 | `REQUIRED` `merged` | Mirror in Rust; port AEO materialization rules |
| `src/lib/filesystem-aeo-validator.ts` | 10-step Ω policy evaluator; `FilesystemValidatorContext` interface | 638 | `REQUIRED` `merged` | Define Ω contract; port pure steps 1–2, 9 to Rust |
| `src/lib/filesystem-write-gateway.ts` | `captureFilesystemWriteATAO`; `compileFilesystemWriteAEO`; `executeFilesystemWrite` | 332 | `REQUIRED` `merged` | Define exact-object execution boundary contract |
| `src/lib/filesystem-write-runtime-gateway.ts` | `runFilesystemWriteGatewayAction`; mandatory composition gate | 153 | `REQUIRED` `merged` | Define composition gate contract |
| `src/lib/aeo-governance.ts` | Canonical AEO shape validation; pure | 46 | `REQUIRED` `merged` | Include in continuity-core TypeScript interface |
| `src/lib/proof-finality-metadata.ts` | Append-only proof lifecycle; `creates_authority: false` | 187 | `REQUIRED` `merged` | Port proof envelope contract to Rust |
| `src/runtime/lineage/verifyLineageOrigin.ts` | Lineage origin hash verification | ~50 | `REQUIRED` `merged` | Port lineage verification to Rust |

Additional pure-kernel files included in the continuity-core boundary:

| File | Capability | V2 Status |
|---|---|---|
| `src/lib/adapter-contract.ts` | Generic adapter boundary; shape/hash integrity; proof receipts | `REQUIRED` `merged` |
| `src/lib/causal-clock.ts` | Lamport-style causal ordering | `REQUIRED` `merged` |
| `src/lib/causal-legitimacy-clock.ts` | Vector clock comparison | `REQUIRED` `merged` |
| `src/lib/conflict-set.ts` | Conflict classification; canonical tie-break | `REQUIRED` `merged` |
| `src/lib/distributed-replay-convergence-enforcement.ts` | Replay legitimacy rules + execution boundary | `REQUIRED` `merged` |
| `src/lib/epoch-substrate.ts` | Epoch finality states and transitions | `REQUIRED` `merged` |
| `src/lib/finality-classification.ts` | Finality state machine; partition admission | `REQUIRED` `merged` |
| `src/lib/quorum-attestation.ts` | Quorum evaluation from weighted attestations | `REQUIRED` `merged` |
| `src/lib/reconciliation-determinism.ts` | Registry head selection; reconciliation finality | `REQUIRED` `merged` |
| `src/lib/reconciliation-state-machine.ts` | Reconciliation state machine; legal-transition table | `REQUIRED` `merged` |
| `src/lib/replay-convergence.ts` | Distributed replay states; anti-entropy merge | `REQUIRED` `merged` |
| `src/lib/revocation-liveness.ts` | Revocation channel SLA evaluation | `REQUIRED` `merged` |
| `src/lib/topology-visibility.ts` | Topology snapshot classification (6 states) | `REQUIRED` `merged` |
| `src/runtime/continuity/verifyContinuityLineage.ts` | Continuity lineage verification | `REQUIRED` `merged` |
| `src/runtime/deployment/verifyDeploymentProof.ts` | Deployment proof verification | `REQUIRED` `merged` |
| `src/runtime/deployment/verifyDeploymentProvenance.ts` | Deployment provenance verification | `REQUIRED` `merged` |
| `src/runtime/deployment/verifyRollbackLineage.ts` | Rollback lineage verification | `REQUIRED` `merged` |
| `src/reconciliation/reconciliation-invariants.ts` | Core reconciliation invariants | `REQUIRED` `merged` |
| `src/reconciliation/fate-tests.ts` | Fate-test predicates | `REQUIRED` `merged` |
| `src/reconciliation/mutation-surface-exhaustiveness.ts` | Mutation surface exhaustiveness checks | `REQUIRED` `merged` |
| `src/reconciliation/traversal-hash.ts` | Traversal hash computation | `REQUIRED` `merged` |

### 1.3 continuity-core Invariant Contracts

The following contracts must be explicitly represented in both the TypeScript interface
and the Rust implementation. Conformance tests (V3 step 5) prove equivalence.

```
NULL classification:
  If no valid AEO exists → validation returns NULL → nothing is executed.

VALID gate:
  validated_object == executed_object
  (AEO hash from Ω validator output must match AEO hash used at execution boundary)

Proof envelope:
  Every execution produces an append-only proof.
  Proof receipt cannot be generated without passing the VALID gate.

Lineage binding:
  Every stage (compile → validate → execute → proof) carries a canonical hash
  of its parent stage. Lineage failures are not recoverable — they return NULL.

Authority state:
  Authority is read-only at execution time.
  No authority is created or modified by the execution chain.

Replay prevention:
  A nonce consumed by a VALID execution cannot be reused.
  Replay attempts return NULL, not an execution failure.
```

---

## Section 2 — Surface Adapters

Surface adapters own transport, routing, HTTP parsing, response formatting, and
auth header handling. They must not be imported by continuity-core.

| File | Adapter Role | Lines | Status |
|---|---|---|---|
| `src/lib/filesystem-write-route-adapter.ts` | Filesystem-write HTTP route; reference surface adapter | 284 | `implemented` `merged` |
| `src/lib/runtime-observability-adapter.ts` | Observability HTTP routes; evidence emission | 236 | `implemented` `merged` |
| `src/lib/cloudflare-adapter.ts` | `CloudflareWorkerExecutor` callback; Cloudflare-specific execution wiring | 138 | `implemented` `merged` |
| `src/lib/github-issue-comment-gateway.ts` | GitHub HTTP surface adapter | 429 | `implemented` `sequenced` |
| `src/lib/runtime-discovery-adapter.ts` | Cross-registry reconciliation routes | — | `planned` |
| `src/lib/agent-tool-invocation-adapter.ts` | `POST /agent/tool-call` route handler | — | `planned` |
| `src/lib/aeo-compile-adapter.ts` | `POST /gateway/tool/compile` route handler | — | `planned` |
| `src/lib/runtime-route-adapter.ts` | Generic route dispatch abstraction | — | `planned` |
| `src/lib/cloudflare-worker-adapter.ts` | Cloudflare Worker fetch handler shell | — | `planned` |

**Surface adapters must never influence:**
- VALID / NULL classification
- authority state
- execution eligibility
- proof legitimacy

**`src/index.ts`** (8,851 lines) remains the reference Cloudflare adapter shell for V2.
V3 reduces it by extracting the planned adapters above. It is not deleted until all
kernel-adjacent clusters (clusters 1, 2, 8, 11, 13, 14, 25, 27, 28, 29 from
`V2_PHASE3_INDEX_AUDIT.md`) are confirmed stable in their extracted positions.

---

## Section 3 — Storage Adapters

Storage adapters own D1 table bootstrap, registry reads/writes, append-only trigger
setup, proof persistence, nonce persistence, and authority registry reads.
They must accept only abstract executor interfaces — never inject `D1Database`
handles into the continuity-core boundary.

| File | Storage Role | Lines | Status |
|---|---|---|---|
| `src/lib/d1-storage-adapter.ts` | D1 query execution binding | 144 | `implemented` `merged` |
| `src/lib/topology-epoch.ts` | D1-specific epoch classification (holds `D1Database` handle) | 87 | `implemented` — extract from kernel |
| `src/lib/storage-adapter.ts` | Abstract storage interface | — | `planned` |
| `src/lib/sqlite-storage-adapter.ts` | SQLite executor binding | — | `planned` |
| `src/lib/postgres-storage-adapter.ts` | Postgres executor binding | — | `planned` |

`src/index.ts` clusters classified as storage-adapter work (from Phase 3 audit):

| Cluster | Lines | Content | Target file |
|---|---|---|---|
| 16 — Schema / D1 Bootstrap | 2056–2360 | `ensureSchema`, `activateAppendOnlyRegistryEnforcement`, DDL | `d1-storage-adapter.ts` |
| 21 — Proof Quarantine / Archive | 5651–5780 | Bootstrap-time duplicate proof detection | `d1-storage-adapter.ts` |
| 36 — Govern Nonce Bootstrap | 9059–9071 | `govern_nonce_registry` DDL + migration | `d1-storage-adapter.ts` |

---

## Section 4 — Optional Observability

These modules are evidence-only and must never influence `VALID / NULL`,
authority, execution eligibility, or proof legitimacy. They may be omitted from
a minimal runtime deployment without changing governed behavior.

| File | Purpose | Lines | Status |
|---|---|---|---|
| `src/telemetry.ts` | Evidence emission; no mutation capability | — | `implemented` `merged` |
| `src/legitimacy-telemetry.ts` | Evidence-only telemetry classification | 120 | `implemented` `merged` |
| `src/install-base-dependency-dashboard.ts` | Install-base metrics | 555 | `implemented` `freeze` |
| `src/temporal-legitimacy-replay-visualization.ts` | Replay visualization; read-only | 352 | `implemented` `freeze` |
| `src/install_base/report.mjs` | Install-base usage report | — | `implemented` `freeze` |
| `src/lib/behavioral-authority-surfaces.ts` | Surface classification evidence | 131 | `implemented` `merged` |
| `src/telemetry/append-only-ingestion-pipeline.ts` | Append-only evidence pipeline | — | `implemented` `freeze` |
| `src/visualizer/topology-graph-viewer.ts` | Topology graph visualization | — | `implemented` `freeze` |
| `runtime/temporal_lineage_replay_inspector.ts` | Temporal lineage replay inspection | — | `implemented` `freeze` |
| `runtime/runtime_surface_scanner.mjs` | Runtime surface scanner | — | `implemented` `freeze` |
| `runtime/surface_inventory_reconciler.mjs` | Surface inventory | — | `implemented` `freeze` |
| `runtime/adoption/adoption_tracker.mjs` | Adoption tracking | — | `implemented` `freeze` |
| `runtime/control_graph_*.ts` (20 files) | Control graph projection; read-only graph construction | — | `implemented` `freeze` |

`src/index.ts` clusters to be moved to `src/lib/runtime-observability-adapter.ts`
(Phase 4, already scoped):

| Cluster | Lines | Content |
|---|---|---|
| 22 — Telemetry / Install-Base | 5782–5998 | `emitTelemetry`, `installBaseGovernanceMetrics`, `recordDrift` |
| 23 — Continuous FATE | 5998–6070 | Stress scenario envelopes; `/fate/*` routes |
| 12 — Recursive Governance Containment Observer | 1529–1750 | Containment observation; no authority |
| 17 — Runtime Evolution Consensus | 2363–2680 | Maintainer approval evidence |
| 30 — Runtime Surface Containment | 6914–7037 | Route enumeration and classification |
| 31 — Root Authority Containment | 7038–7215 | Authority drift detection; evidence-only |
| 34 — Governance Consensus Observer | 7534–7579 | Consensus envelope; `/observer/consensus/*` |

---

## Section 5 — Offline Discovery / Reconciliation

Discovery logic traverses registries across runtimes to build topology graphs,
reconciliation reports, and federation envelopes. It is offline and async — it
must never block or influence the execution hot path.

| File / Cluster | Purpose | Lines | Status |
|---|---|---|---|
| `src/distributed-topology-convergence.ts` | Topology convergence analysis | 832 | `implemented` `freeze` |
| `src/distributed-continuity-lineage-reconciliation.ts` | Continuity lineage reconciliation | 791 | `implemented` `freeze` |
| `src/surface-graph-reconciliation.ts` | Surface graph reconciliation | 591 | `implemented` `freeze` |
| `src/recursive-revocation-propagation.ts` | Revocation propagation | 1,261 | `implemented` `freeze` |
| `src/continuity-lineage-closure-hardening.ts` | Lineage closure hardening | 938 | `implemented` `freeze` |
| `src/cross-registry-legitimacy-reconciliation.ts` | Cross-registry reconciliation | — | `implemented` `freeze` |
| `src/distributed-replay-convergence.ts` | Distributed replay convergence | — | `implemented` `freeze` |
| `src/runtime/federation/reconcileFederatedLegitimacy.ts` | Federation reconciliation | — | `DISCOVERY` `freeze` |
| `runtime/continuous_reconciliation_orchestrator.mjs` | Continuous reconciliation | — | `implemented` `freeze` |
| `runtime/cross_registry_authority_reconciliation.mjs` | Cross-registry authority | — | `implemented` `freeze` |
| `runtime/federated_sovereignty_drift_coordinator.mjs` | Federated sovereignty drift | — | `implemented` `freeze` |
| `runtime/topology_lineage_registry.mjs` | Topology lineage registry | — | `implemented` `freeze` |
| `runtime/reconciliation_scheduler.mjs` | Reconciliation scheduler | — | `implemented` `freeze` |
| `runtime/recursive_drift_propagation_engine.mjs` | Recursive drift propagation | — | `implemented` `freeze` |
| `runtime/recursive_quarantine_orchestrator.mjs` | Recursive quarantine | — | `implemented` `freeze` |
| `runtime/reconciliation/cross-registry-reconciliation-engine.js` | Cross-registry engine | — | `implemented` `freeze` |
| `runtime/reconciliation/drift-propagation-engine.js` | Drift propagation | — | `implemented` `freeze` |
| `runtime/reconciliation/quarantine-containment-engine.js` | Quarantine containment | — | `implemented` `freeze` |
| `runtime/reconciliation/topology-reconciliation-engine.js` | Topology reconciliation | — | `implemented` `freeze` |

`src/index.ts` clusters to be extracted to `src/lib/runtime-discovery-adapter.ts`
(Phase 5, sequenced after Phase 4):

| Cluster | Lines | Content |
|---|---|---|
| 18 — Legitimacy Graph Traversal | 2681–4813 | Registry traversal; reconciliation checkpoints; portable bundles |
| 19 — Federation / Distributed Reconciliation | 4814–5580 | Federation envelopes; sovereignty checkpoints |
| 20 — Revocation Topology | 5582–5651 | Revocation impact topology |
| 26 — Bootstrap / External Authority | 6321–6544 | External authority dependency reconciliation |
| 32 — Cross-Registry Reconciliation | 7218–7455 | Cross-registry snapshot; first extraction target in Phase 5 |
| 33 — Runtime Topology Snapshot | 7456–7533 | Deterministic route topology snapshot |

---

## Section 6 — Freeze (Research / Visualization / Economic)

These files exist and are not on the execution hot path. They are frozen:
no modification, no deletion until dependency proof is established.

| File | Purpose | Lines | Status |
|---|---|---|---|
| `src/economic-governance.ts` | Economic governance model | 99 | `research-only` `freeze` |
| `src/governance-complexity-budgeting.ts` | Complexity budgeting | — | `research-only` `freeze` |
| `src/governance-module-boundary-enforcement.ts` | Module boundary rules | — | `research-only` `freeze` |
| `src/governed-deploy.ts` | Deploy governance | — | `research-only` `freeze` |
| `src/dependency-criticality-analysis.ts` | Dependency analysis | — | `research-only` `freeze` |
| `src/inter-surface-coordination.ts` | Surface coordination | 445 | `research-only` `freeze` |
| `src/legitimacy-surface-closure-map.ts` | Surface closure mapping | — | `research-only` `freeze` |
| `src/runtime-checkpoint-restoration.ts` | Checkpoint restoration | — | `research-only` `freeze` |
| `src/runtime-topology-intelligence.ts` | Topology intelligence | — | `research-only` `freeze` |
| `src/distributed-topology-visualization-projection.ts` | Visualization projection | 427 | `research-only` `freeze` |
| `src/lib/predicate-registry.ts` | Topology predicate lookup (requires D1 interface) | 159 | `research-only` `freeze` |
| `src/lib/capability-risk-classification.js` | Risk surface classification | 28 | `research-only` `freeze` |
| `src/lib/legitimacy-governance.js` | Legitimacy governance | 183 | `research-only` `freeze` |
| `src/lib/skill-provenance-revocation.js` | Skill provenance revocation | 80 | `research-only` `freeze` |
| `src/skill-metadata/validator.mjs` | Agent skill metadata validation | — | `research-only` `freeze` |
| `src/skill-surfaces/registry-validator.mjs` | Execution surface registry validation | — | `research-only` `freeze` |
| `runtime/portable_legitimacy_bundle_generator.mjs` | Legitimacy bundle generation | — | `research-only` `freeze` |
| `runtime/merge-object-hash.mjs` | Merge object hash | — | `research-only` `freeze` |
| `runtime/sovereignty/root-authority-containment.js` | Root authority containment | — | `research-only` `freeze` |
| `archive/` (all files) | Research-era archive artifacts | — | `research-only` `freeze` |
| `artifacts/` (all files) | Generated snapshots and registry exports | — | `research-only` `freeze` |

**Rule:** Frozen files may not be deleted without a dependency proof showing
confirmed absence from: production import chain, test dependency, and governance
manifest dependency.

---

## Section 7 — Remove Candidates

No files are classified `REMOVE-CANDIDATE` in this pass. Deletion candidates require
a separate import-tracing pass confirming absence from all three dependency classes
above. Candidates for the tracing pass:

- Compiled `.js` outputs where a `.ts` source exists in the same directory
- Duplicate registry snapshot JSON files in `artifacts/`
- `src/economic-governance.js` (apparent compiled output of `economic-governance.ts`)

---

## Section 8 — Highest-Leverage V3 Sequence

These eight steps are ordered by dependency; each step unblocks the next.

### Step 1 — Extract discovery adapter (unblocked)

**Target:** `src/lib/runtime-discovery-adapter.ts`

Extract `src/index.ts` cluster 32 (cross-registry reconciliation, lines 7218–7455)
as the first unit. Then clusters 33, 26, 20, 19 in order. Cluster 18 (legitimacy
graph, 2135 lines) requires decomposition into sub-clusters before extraction.

Criterion for completion: the `runtime-discovery-adapter.ts` module handles all
`/registry/reconcile/*`, `/topology/*`, and `/runtime/sovereignty/*` routes without
importing from the kernel clusters (1, 2, 8, 11, 13, 14, 25, 27, 28, 29).

### Step 2 — Consolidate D1/storage access (unblocked)

**Target:** `src/lib/d1-storage-adapter.ts` (extend existing)

Move clusters 16, 21, 36 from `src/index.ts` into `d1-storage-adapter.ts`.
Define `src/lib/storage-adapter.ts` as the abstract interface that all
storage adapters must implement.

Criterion for completion: `D1Database` handle does not appear in any continuity-core
file. All DDL and bootstrap is owned by the storage adapter layer.

### Step 3 — Define continuity-core TypeScript interface (unblocked after steps 1–2)

**Target:** `continuity-core/src/` (TypeScript interface package, new)
or a `src/lib/continuity-core.ts` interface module.

Produce a single TypeScript module that re-exports only the files listed in
Section 1.2 as the public continuity-core interface. No transport, no DB, no
Cloudflare-specific types permitted in the module's public API.

The interface must explicitly represent the six contracts in Section 1.3.

Criterion for completion: `tsc --noEmit` succeeds on the interface module with
zero transport or storage type references.

### Step 4 — Mirror interface in Rust (sequenced after step 3)

**Target:** `continuity-core/src/` (extend existing Rust crate)

Map each TypeScript interface member from step 3 to an existing or new Rust
function/type. Identify gaps (the DSSE provenance envelope is the known gap; see
Section 1.1).

Criterion for completion: every function in the continuity-core TypeScript
interface has a named counterpart in the Rust crate.

### Step 5 — Add conformance tests (sequenced after step 4)

**Target:** `conformance/` or `tests/continuity-core/`

For each function pair (TypeScript / Rust), add a test that feeds identical input
and asserts identical output. Hash functions must produce byte-for-byte identical
output.

Priority order:
1. `canonicalize` / `canonicalization::canonicalize`
2. `sha256Hex` / `hashing::sha256_hex`
3. `materializeFilesystemAEO` / `aeo_validation::materialize`
4. `validateFilesystemAEO` (steps 1–2 only — structural/structural hash) / `aeo_validation::validate`
5. `verifyLineageOrigin` / `lineage::verify_origin`

Criterion for completion: conformance test suite passes with identical outputs
across TS and Rust for all five function pairs above.

### Step 6 — Keep Cloudflare / D1 as reference adapter only (sequenced after step 5)

`src/index.ts` is renamed or refactored to `src/adapters/cloudflare-worker.ts`.
It becomes the reference surface adapter. It imports from the continuity-core
interface module (step 3) and the storage adapter (step 2), not from kernel files
directly.

Criterion for completion: `src/index.ts` no longer exists as a file; all routes
are dispatched from the adapter shell.

### Step 7 — Add SQLite / Postgres adapters (sequenced after step 6)

**Targets:** `src/lib/sqlite-storage-adapter.ts`, `src/lib/postgres-storage-adapter.ts`

Both implement the abstract storage interface defined in step 2. A minimal
integration test suite demonstrates that the proven execution chain passes on
each backend.

Criterion for completion: `filesystem-write` governed execution succeeds with
SQLite backend in CI.

### Step 8 — Only then consider new governed surfaces (sequenced after step 7)

No new execution surfaces are proposed in this specification. V3 does not add
capability. V3 extracts the kernel so that future surfaces can be added portably.

---

## Section 9 — Invariant Preservation Checklist

These two invariants from the proven V1 loop must be verifiable at every step of
the V3 sequence. Steps that cannot demonstrate invariant preservation must not merge.

```
[ ] If no valid object exists → nothing happens.
    Verification: NULL path test in conformance suite returns no proof receipt.

[ ] validated_object == executed_object.
    Verification: AEO hash from Ω validator output matches AEO hash at execution
    boundary in every execution proof record.
```

No step in the V3 sequence introduces:
- new runtime authority
- new execution surfaces
- changes to validator behavior
- changes to proof schema
- changes to replay or nonce logic

---

## Section 10 — Non-Goals

| Non-goal | Reason |
|---|---|
| Implement the Rust core | Not in scope; existing Rust crate is the foundation |
| Add new execution surfaces | V3 is extraction, not expansion |
| Change validator behavior | Ω validation contract is frozen |
| Change proof schema | Proof envelope contract is frozen |
| Delete files without dependency proof | Safety; a separate tracing pass is required |
| Move discovery / D1 / adapter code | Deferred to the V3 sequence steps |
| Implement the TypeScript conformance package | Step 3 scopes but does not implement it |

---

## Section 11 — Summary Classification Table

| Subsystem | Category | Files | Status |
|---|---|---|---|
| Filesystem governed execution chain | `CONTINUITY-CORE` | 8 TS files (Section 1.2 primary) | `implemented` `merged` |
| Pure kernel libraries | `CONTINUITY-CORE` | 22 TS files (Section 1.2 extended) | `implemented` `merged` |
| Rust core | `CONTINUITY-CORE` | 9 Rust files (Section 1.1) | `implemented` |
| Continuity-core TS interface | `CONTINUITY-CORE` | new module | `planned` (step 3) |
| Filesystem route adapter | `SURFACE-ADAPTER` | 1 (implemented) | `implemented` `merged` |
| Observability adapter | `SURFACE-ADAPTER` | 1 (implemented) | `implemented` `merged` |
| Discovery adapter | `SURFACE-ADAPTER` | 1 (planned) | `planned` (step 1) |
| Agent tool / AEO / GitHub adapters | `SURFACE-ADAPTER` | 3 (planned) | `planned` |
| Cloudflare adapter / index.ts | `SURFACE-ADAPTER` | 1 (8,851 lines) | `implemented` — reducing |
| D1 storage adapter | `STORAGE-ADAPTER` | 1 (implemented) | `implemented` `merged` |
| Abstract storage interface | `STORAGE-ADAPTER` | 1 (planned) | `planned` (step 2) |
| SQLite / Postgres adapters | `STORAGE-ADAPTER` | 2 (planned) | `planned` (step 7) |
| Observability evidence modules | `OPTIONAL-OBSERVABILITY` | ~30 files | `implemented` `freeze` |
| Control graph projections | `OPTIONAL-OBSERVABILITY` | 20 files | `implemented` `freeze` |
| Discovery / federation / topology | `OFFLINE-DISCOVERY` | ~20 files | `implemented` `freeze` |
| Economic governance / research | `FREEZE` | ~15 files | `research-only` |
| Archive / artifact snapshots | `FREEZE` | multiple dirs | `research-only` |
| Remove candidates | `REMOVE-CANDIDATE` | 0 confirmed | pending tracing pass |

---

## Closure Condition

This spec is satisfied when the repository has:

```
continuity-core
+ surface adapters
+ storage adapters
+ optional observability
+ offline discovery / reconciliation
```

and the boundary:

- Preserves: `if no valid object exists → nothing happens`
- Preserves: `validated_object == executed_object`
- Carries no Cloudflare runtime dependency into the portable core
- Has conformance tests proving TypeScript core ≡ Rust core for the five
  function pairs listed in Section 8 step 5

V3 closes when step 7 (SQLite adapter) passes in CI and this spec document
is the authoritative boundary definition referenced by all subsequent surface
additions.
