# V2 Phase 3 — Index Audit: Responsibility Classification

**Branch:** `claude/v2-phase3-index-audit-mjodl3`
**File audited:** `src/index.ts`
**File size:** 9,071 lines / ~867 KB
**Audit scope:** All major responsibility clusters
**Output:** Classification table + extraction candidate selection
**Runtime changes:** None. No code moved. Audit only.

---

## Classification Legend

| Label | Meaning |
|---|---|
| `REQUIRED` | Kernel-adjacent execution path — must remain reachable from fetch handler |
| `ADAPTER` | Transport, HTTP, Cloudflare, D1 wiring — already partially extracted |
| `OBSERVABILITY` | Metrics, telemetry, diagnostics — evidence-only, non-authoritative |
| `DISCOVERY` | Topology, reconciliation, federation — read traversal across registries |
| `SEQUENCED` | Legitimate future extraction target — not yet ready due to entanglement |
| `REMOVE_CANDIDATE` | No runtime dependency — classification only |

---

## Cluster Map

### 1. Lineage Verification Kernel
**Lines:** 27–69  
**Size:** ~50 lines  
**Functions:** `canonicalLineageHash`, `verifyLineageOrigin`  
**Purpose:** Computes and verifies causal lineage origin hashes across compile → validate → execute → proof stages. Enforces that every stage carries a canonical hash of its parent stage.  
**Dependencies:** None (pure computation)  
**Classification:** `REQUIRED`  
**Extraction feasibility:** Not extractable — directly called from `/validate`, `/execute`, `/proof` handlers. Kernel invariant.  
**Risk:** CRITICAL — must not be moved or split.

---

### 2. Governance Types + Policy Registry
**Lines:** 74–145  
**Size:** ~75 lines  
**Types/constants:** `GovernCandidate`, `GovernedToolEnvelope`, `AgentToolCallATAO`, `PolicyClass`, `POLICY_REGISTRY`, `classifyToolSurface`, `policyClassDigest`  
**Purpose:** Defines the governance type surface and the two-class policy registry (`TOOL_RUNTIME_MUTATION`, `TOOL_RECONCILIATION_READONLY`). Classifies incoming tool surfaces against known policy classes.  
**Dependencies:** `sha256Hex`, `canonicalize`  
**Classification:** `REQUIRED`  
**Extraction feasibility:** Types belong at this level. Policy classification is kernel-adjacent. Could be split into a types file, but risk is non-zero.  
**Risk:** MEDIUM — policy misclassification would affect governance gate behavior.

---

### 3. ATAO Material Construction
**Lines:** 152–195  
**Size:** ~45 lines  
**Functions:** `normalizeATAORiskClass`, `buildAgentToolCallATAOMaterial`, `captureAgentToolCallATAO`  
**Purpose:** Builds and persists Agent Tool Authorization Objects (ATAOs) to the D1 `agent_tool_call_atao_registry`. Captures agent identity, session binding, proposed action, and risk class.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`, `canonicalRecord`, `isPlainRecord`  
**Classification:** `SEQUENCED`  
**Extraction feasibility:** Naturally belongs in `src/lib/agent-tool-gateway.ts` alongside the existing gateway module. Well-isolated. Blocked only by the need to export `Env` type.  
**Risk:** LOW — append-only DB write with no kernel side effects.

---

### 4. Govern Candidate Parsing + Predicate Validators
**Lines:** 197–236  
**Size:** ~40 lines  
**Functions:** `parseGovernCandidate`, `resolveGovernPolicyPredicate`, `validateGovernPolicyPredicate`, `resolveGovernTopologyPredicate`, `validateGovernTopologyPredicate`  
**Purpose:** Parses and validates incoming `/govern` request bodies. Enforces strict field allowlist. Validates policy class and topology attestation hash formats.  
**Dependencies:** None (pure parse/validate)  
**Classification:** `ADAPTER`  
**Extraction feasibility:** Could live in `src/lib/filesystem-write-route-adapter.ts` or a new `src/lib/govern-request-adapter.ts`. Low risk but low value; the block is small.  
**Risk:** LOW

---

### 5. Agent Tool Invocation Handler
**Lines:** 259–410  
**Size:** ~155 lines  
**Functions:** `agentToolInvocationNull`, `ensureAgentToolInvocationRegistry`, `handleAgentToolInvocationBoundary`  
**Purpose:** Handles `POST /agent/tool-call`. Validates the full chain: ATAO capture → session → continuity → authority → compiled AEO → validation → execution → proof. Creates an invocation record only after all checks pass.  
**Dependencies:** `env.DB`, `selectAEOTemplate`, all registry tables  
**Classification:** `ADAPTER`  
**Extraction feasibility:** This is transport-level wiring for the agent tool invocation route. Could extract to `src/lib/agent-tool-invocation-adapter.ts`. Moderate coupling to shared utility functions.  
**Risk:** MEDIUM — touches multiple registry tables across a single transaction.

---

### 6. Agent Tool Gateway Handlers (Intercept / Propose / Authority Review / ATAO Lookup)
**Lines:** 412–632  
**Size:** ~225 lines  
**Functions:** `ensureAgentToolGatewaySchema`, `handleAgentToolGatewayIntercept`, `handleAgentToolGatewayPropose`, `handleAgentToolGatewayAuthorityReview`, `handleAgentToolGatewayATAO`  
**Purpose:** Handles the four gateway sub-routes: observation capture, CIP proposal creation, authority review dispatching, and ATAO retrieval. Routes to `conductAuthorityReview` from `src/lib/authority-review.ts`.  
**Dependencies:** `env.DB`, `interceptToolCall` (from `lib/agent-tool-gateway.ts`), `conductAuthorityReview` (from `lib/authority-review.ts`), `captureAgentToolCallATAO`  
**Classification:** `ADAPTER`  
**Extraction feasibility:** The four route handlers are already partially delegating to extracted lib modules. Full extraction requires moving `captureAgentToolCallATAO` first (see cluster 3).  
**Risk:** MEDIUM

---

### 7. AEO Compile Handler
**Lines:** 633–773  
**Size:** ~145 lines  
**Functions:** `gatewayCompileNull`, `parseGatewayJsonRecord`, `deriveGatewaySurfaceType`, `riskClassForGatewayTemplate`, `templateRiskLevel`, `canonicalGatewayCompileAeo`, `handleAgentToolGatewayCompile`  
**Purpose:** Handles `POST /gateway/tool/compile`. Looks up ATAO, resolves authority, derives AEO surface type and risk class, builds a `CanonicalAEO`, stores it in `aeo_registry`, and returns a hash-verified compiled object.  
**Dependencies:** `env.DB`, `selectAEOTemplate`, `sha256Hex`, `canonicalize`, `canonicalRecord`  
**Classification:** `ADAPTER`  
**Extraction feasibility:** Could join `src/lib/filesystem-write-route-adapter.ts` or a new `src/lib/aeo-compile-adapter.ts`. Moderate size, moderate coupling.  
**Risk:** MEDIUM — AEO compilation is a prerequisite for execution.

---

### 8. Governed Envelope Lineage Verifiers
**Lines:** 778–868  
**Size:** ~90 lines  
**Functions:** `canonicalGovernProjectionFromCandidate`, `canonicalGovernProjectionFromAeo`, `computeGovernProjectionHash`, `compareGovernProjectionHashes`, `isOpenClawOriginPayload`, `resolvePersistedGovernedEnvelopeId`, `requiresGovernEnvelopeLineage`, `resolveGovernEnvelopeLineage`, `verifyGovernedToolEnvelopeLinkage`  
**Purpose:** Verifies that govern envelope lineage is intact for `/execute` and `/proof`. Ensures that OpenClaw-originated payloads carry a canonical govern projection hash that matches the compiled AEO.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `REQUIRED`  
**Extraction feasibility:** Cannot be safely extracted — called directly in the `/execute` and `/proof` kernel paths. Moving these would introduce an import boundary that could mask lineage failures.  
**Risk:** HIGH if moved.

---

### 9. Route Constants + Surface Inventory
**Lines:** 885–1185  
**Size:** ~300 lines  
**Contents:** All route string constants, `AGENT_TOOL_GOVERNED_SUPPORT_SURFACES`, `NON_EXECUTABLE_OBSERVABILITY_ROUTES`, `CANONICAL_RUNTIME_ROUTES`, `EXECUTABLE_RUNTIME_ROUTES`, telemetry route constants  
**Purpose:** Declares the full route surface inventory as frozen TypeScript constants. Used by the fetch handler and by containment/topology scanning functions.  
**Dependencies:** None (constants)  
**Classification:** `ADAPTER`  
**Extraction feasibility:** Could be extracted to `src/lib/adapter-contract.ts` alongside the existing adapter contract. Very low risk.  
**Risk:** LOW

---

### 10. Topology Epoch Admission
**Lines:** 935–946  
**Size:** ~15 lines  
**Function:** `enforceTopologyEpochAdmission`  
**Purpose:** Thin adapter wrapper around `classifyTopologyEpochAdmission` from `src/lib/topology-epoch.js`. Enforces topology epoch consistency before execution admission.  
**Dependencies:** `classifyTopologyEpochAdmission` (already extracted)  
**Classification:** `ADAPTER`  
**Extraction feasibility:** Already delegating to extracted module. Could be inlined.  
**Risk:** VERY LOW

---

### 11. Schema Diagnostic + Error Classification
**Lines:** 1194–1528  
**Size:** ~340 lines  
**Types/functions:** `schemaDiagnosticReason`, many type aliases for drift classes, `SchemaDiagnosticReason`  
**Purpose:** Defines the comprehensive type taxonomy for drift classes, lineage failure reasons, schema diagnostic codes, and reconciliation statuses. Used throughout the kernel and observability paths.  
**Dependencies:** None (types and string classification)  
**Classification:** `REQUIRED`  
**Extraction feasibility:** Types are used pervasively. Moving to a shared types file is possible but creates a large number of import edges.  
**Risk:** MEDIUM — type-only, but referenced everywhere.

---

### 12. Recursive Governance Containment Observer
**Lines:** 1529–1750  
**Size:** ~225 lines  
**Functions:** `recursiveGovernanceContainmentStatusFlags`, `canonicalGovernanceContinuityBinding`, `buildGovernanceContainmentObject`, `governanceSemanticProjection`, `detectGovernanceSemanticDivergence`, `classifyGovernanceMutation`, `buildRecursiveGovernanceContainmentObservation`, `ensureRecursiveGovernanceContainmentRegistry`, `appendRecursiveGovernanceContainmentObservation`  
**Purpose:** Observes recursive governance structure from URL query parameters. Builds a containment envelope tracking semantic divergence, governance topology, and continuity binding. Purely observational — no authority, no execution.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `OBSERVABILITY`  
**Extraction feasibility:** Self-contained. No kernel dependencies. Good candidate for eventual extraction to `src/lib/runtime-observability-adapter.ts`.  
**Risk:** LOW

---

### 13. Core Utilities
**Lines:** 1751–1805  
**Size:** ~55 lines  
**Functions:** `json`, `body`, `authorized`, `hasDb`, `isPlainRecord`, `normalizeCanonicalValue`, `canonicalRecord`, `canonicalize`, `toCanonicalAeo`, `sha256Hex`  
**Purpose:** Foundational helpers used throughout the entire file. `canonicalize` is the deterministic JSON serializer. `sha256Hex` is the canonical hash function. `json` is the HTTP response factory.  
**Dependencies:** Web Crypto API  
**Classification:** `REQUIRED`  
**Extraction feasibility:** These are infrastructure primitives. They cannot be moved without updating every import site in the file.  
**Risk:** HIGH if touched — affects every other cluster.

---

### 14. Cryptographic / DSSE Provenance Utilities
**Lines:** 1807–1983  
**Size:** ~180 lines  
**Functions:** `base64ToBytes`, `utf8Bytes`, `concatBytes`, `dsseLengthPrefixed`, `dssePreAuthenticationEncoding`, `constantTimeEqual`, `hmacSha256`, `canonicalProvenancePayload`, `envelopeFromInput`, `validateDsseProvenanceEnvelope`, `validateRequestProvenanceAttestation`  
**Purpose:** Implements DSSE (Dead Simple Signing Envelope) verification and HMAC-SHA256 attestation. Validates cryptographic provenance envelopes on `/execute` and `/proof`.  
**Dependencies:** Web Crypto API, `sha256Hex`, `canonicalize`  
**Classification:** `REQUIRED`  
**Extraction feasibility:** Cryptographically sensitive. Could be extracted to a `src/lib/provenance-crypto.ts` but must be treated as kernel-adjacent.  
**Risk:** HIGH — provenance forgery risk if incorrectly refactored.

---

### 15. Deploy Target / Execution Snapshot / Deployment Provenance Helpers
**Lines:** 1984–2055  
**Size:** ~75 lines  
**Functions:** `canonicalDeployTarget`, `executionSnapshotFrom`, `missingExecutionSnapshotFields`, `deploymentProvenanceFrom`, `missingDeploymentProvenance`, `proofDecisionHash`  
**Purpose:** Parses and normalizes incoming `/execute` and `/proof` request bodies into typed structs. Validates required fields for execution snapshots and deployment provenance.  
**Dependencies:** None (pure parse/normalize)  
**Classification:** `REQUIRED`  
**Extraction feasibility:** Could be moved to `src/lib/filesystem-write-runtime-gateway.ts` or a new helpers module. Low complexity.  
**Risk:** LOW — no state mutations.

---

### 16. Schema Management / D1 Bootstrap
**Lines:** 2056–2360  
**Size:** ~305 lines  
**Functions:** `assertSchemaAvailableReadOnly`, `ensureSchema`, `activateAppendOnlyRegistryEnforcement`, `ensureRequiredSchemaColumns`, `columnType`, `tableColumns`  
**Purpose:** Bootstraps all D1 SQLite tables, indexes, and append-only triggers on cold start. `ensureSchema` is the primary DDL executor; `activateAppendOnlyRegistryEnforcement` installs the immutability triggers. `assertSchemaAvailableReadOnly` is a lightweight check for observability routes.  
**Dependencies:** `env.DB`  
**Classification:** `ADAPTER`  
**Extraction feasibility:** Could be extracted to `src/lib/d1-storage-adapter.ts` alongside existing D1 adapter code. Already partially isolated.  
**Risk:** MEDIUM — DDL errors at boot time are fatal.

---

### 17. Runtime Evolution Consensus
**Lines:** 2363–2680  
**Size:** ~320 lines  
**Functions:** `ensureRuntimeEvolutionConsensusRegistry`, `validateRuntimeEvolutionConsensusRegistry`, `runtimeEvolutionConsensusHashMaterial`, `runtimeEvolutionApprovalHash`, `runtimeEvolutionApprovalLineageHash`, `orderedMaintainerSet`, `approvalsFromInput`, `buildRuntimeEvolutionConsensusEnvelope`, `classifyRuntimeEvolutionDrift`, `verifyRuntimeEvolutionConsensus`, `appendRuntimeEvolutionConsensusObservation`, `runtimeEvolutionConsensusInputFromUrl`  
**Purpose:** Verifies maintainer approval consensus for runtime evolution events (PREO/SCO). Computes canonical consensus hashes, classifies drift against approved maintainer sets, and stores evidence in `runtime_evolution_consensus_registry`.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`, `mergeActorRegistry`  
**Classification:** `OBSERVABILITY`  
**Extraction feasibility:** Self-contained with a clear boundary. Could extract to `src/lib/runtime-observability-adapter.ts` (observability section) or a dedicated `src/lib/runtime-evolution-consensus-adapter.ts`.  
**Risk:** LOW-MEDIUM — references `mergeActorRegistry` external JSON import.

---

### 18. Legitimacy Graph Traversal
**Lines:** 2681–4813  
**Size:** ~2,135 lines  
**Functions:** `legitimacyGraphStatusFlags`, `registryDiscontinuityDrift`, `canonicalRegistryNodeModel`, and ~35 additional graph traversal and reconciliation functions  
**Purpose:** The largest single cluster. Traverses all major registries (session, continuity, authority, AEO, validation, execution, proof, invocation) to build a legitimacy graph. Computes reconciliation schedules, reports, checkpoints, and portable legitimacy bundles. Produces deterministic traversal hashes.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `DISCOVERY`  
**Extraction feasibility:** Too large for a single extraction step. Requires decomposition into sub-clusters (graph traversal, checkpoint derivation, report generation, portable bundle construction). `SEQUENCED` for multi-step extraction.  
**Risk:** HIGH due to size. Each sub-cluster has lower risk individually.

---

### 19. Federation / Distributed Reconciliation
**Lines:** 4814–5580  
**Size:** ~770 lines  
**Functions:** `canonicalPortableLegitimacyBundle`, `reconciliationMerkleEvidence`, `deterministicReconciliationSnapshot`, `deterministicTraversalHash`, `deterministicReconciliationReport`, `deterministicReconciliationCheckpoint`, `buildDistributedLegitimacyEnvelope`, `buildFederatedCheckpoint`, `buildFederatedLineageEnvelope`, `verifyDistributedLineageCompatibility`, `deriveRuntimeSemanticFingerprint`, `compareFederationSemantics`, `buildFederationCompatibilityEnvelope`, `buildFederatedSovereigntyEnvelope`, `verifyFederatedSovereigntyEquivalence`, `compareFederatedCheckpoints`, `deriveCheckpointConsensus`, `classifyTopologyDrift`, `buildFederatedReconciliationEnvelope`, `portableLegitimacyBundleFromResult`, `verifyFederatedLegitimacyBundle`, `reconciliationWitnessEnvelope`, `classifyFederatedTrust`, and ~15 more  
**Purpose:** Builds cross-runtime federation envelopes. Computes sovereignty checkpoints, distributed legitimacy bundles, conformance compatibility, and federated governance compression. All outputs are evidence-only and non-authoritative.  
**Dependencies:** `sha256Hex`, `canonicalize`, `env.PROVENANCE_HMAC_SECRET`  
**Classification:** `DISCOVERY`  
**Extraction feasibility:** Target: `src/lib/runtime-discovery-adapter.ts`. Large but well-bounded. All outputs are read-only federation evidence. Could be extracted as a unit.  
**Risk:** MEDIUM — large surface area, but no authority or execution mutations.

---

### 20. Revocation Topology
**Lines:** 5582–5651  
**Size:** ~70 lines  
**Functions:** `topologyNode`, `collectRevokedLineage`, `detectOrphanedExecutions`, `deriveRevocationTopology`, `traceRevocationImpact`, `createObservabilityEnvelope`  
**Purpose:** Derives the revocation impact topology for a given reconciliation anchor. Collects revoked continuity chains and orphaned executions, then assembles an observability envelope.  
**Dependencies:** `env.DB`, `sha256Hex`  
**Classification:** `DISCOVERY`  
**Extraction feasibility:** Could co-locate with `src/lib/runtime-discovery-adapter.ts`. Depends on `ReconciliationAnchor` type from the legitimacy graph cluster.  
**Risk:** LOW-MEDIUM

---

### 21. Proof Quarantine / Archive Diagnostics
**Lines:** 5651–5780  
**Size:** ~130 lines  
**Functions:** `proofLineageMaterial`, `canonicalProofLineageHash`, `deterministicProofQuarantineId`, `sortProofLineageRows`, `quarantineHistoricalProofDuplicates`, `backfillProofDecisionHashes`, `validateProofArchiveCompatibility`, `proofRegistryStabilized`  
**Purpose:** Bootstrap-time diagnostic that detects and quarantines duplicate proof records. Validates proof archive compatibility. Called only during `ensureSchema` bootstrap, not during request handling.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `OBSERVABILITY`  
**Extraction feasibility:** Bootstrap-only. Could extract to `src/lib/d1-storage-adapter.ts` or standalone bootstrap utility. Low coupling to runtime request paths.  
**Risk:** LOW

---

### 22. Telemetry / Install-Base Metrics ← **PRIMARY EXTRACTION CANDIDATE**
**Lines:** 5782–5998  
**Size:** ~220 lines  
**Functions:** `emitBootstrapDiagnostic`, `emitTelemetry`, `emitInstallBaseTelemetryEvidence`, `emitInstallBaseTelemetryEvidenceBestEffort`, `deterministicRatio`, `installBaseGovernanceMetrics`, `boundedObservabilityWindow`, `installBaseEventTrend`, `governanceObservabilityEvidence`, `recordDrift`  
**Purpose:** All telemetry emission and metrics derivation. `emitTelemetry` appends to `observability_registry`. `emitInstallBaseTelemetryEvidence` appends to `install_base_telemetry_registry`. `installBaseGovernanceMetrics` queries event counts and computes governance dependency ratios. `governanceObservabilityEvidence` assembles the full observability response for `/observability/governance/*` routes. `recordDrift` appends to `drift_registry`.  
**Dependencies:** `env.DB`, `canonicalize` only  
**Target file:** `src/lib/runtime-observability-adapter.ts`  
**Classification:** `OBSERVABILITY`  
**Extraction feasibility:** HIGH. See detailed extraction analysis below.  
**Risk:** LOW

---

### 23. Continuous FATE (Failure and Threat Enumeration)
**Lines:** 5998–6070  
**Size:** ~75 lines  
**Functions:** `continuousFateFlags`, `continuousFateStressDepth`, `continuousFateDriftTaxonomy`, `continuousFateStressClasses`, `ensureContinuousFATERegistry`, `buildFATEStressScenario`, `buildContinuousFATEEnvelope`, `appendContinuousFATEObservation`  
**Purpose:** Builds deterministic stress scenario envelopes for the `/fate/*` observability routes. Classifies governance drift survivability, sovereignty escape probes, and topology stability. Evidence-only.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `OBSERVABILITY`  
**Extraction feasibility:** Self-contained. Could extract to `src/lib/runtime-observability-adapter.ts` alongside cluster 22.  
**Risk:** LOW

---

### 24. Recursive Governance Classification + Proof
**Lines:** 6072–6165  
**Size:** ~95 lines  
**Functions:** `recursiveMutationRequiresSCO`, `deriveRecursiveGovernanceHash`, `isRecursiveMutationClass`, `buildRecursiveGovernanceEnvelope`, `classifyRecursiveMutation`, `verifyRecursiveGovernanceIntegrity`, `detectRecursiveGovernanceDrift`, `buildRecursiveGovernanceProof`, `buildRecursiveGovernanceCheckpoint`, `appendRecursiveGovernanceEvidence`  
**Purpose:** Classifies incoming governance mutations (via URL parameters) and produces a recursive governance proof and checkpoint. Verifies that every mutation of the system itself passes a legitimacy check.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `OBSERVABILITY` (with governance gate function)  
**Extraction feasibility:** The pure functions (`buildRecursiveGovernanceEnvelope`, `classifyRecursiveMutation`, `verifyRecursiveGovernanceIntegrity`) are extractable. The DB-writing `appendRecursiveGovernanceEvidence` could join an observability adapter.  
**Risk:** LOW-MEDIUM — must preserve the admission boundary at `enforceRecursiveGovernanceBoundary`.

---

### 25. Runtime Sovereignty
**Lines:** 6162–6320  
**Size:** ~160 lines  
**Functions:** `canonicalRuntimeSurface`, `deriveRuntimeSurfaceHash`, `runtimeSelfIntegrityCheckpoint`, `canonicalSovereigntyRoutes`, `runtimeSovereigntyIdentityMaterial`, `generateRuntimeSovereigntyManifest`, `runtimeSovereigntyRegistryRow`, `appendRuntimeSovereigntyCheckpoint`, `classifyRuntimeSovereigntyDrift`, `freezeRuntimeSovereignty`, `runtimeSovereigntyManifestReadOnly`, `assertRuntimeSovereigntyCanonical`  
**Purpose:** Computes the canonical runtime surface hash and verifies it against `env.CANONICAL_RUNTIME_SURFACE_HASH` on every request (startup integrity check). Freezes a sovereignty manifest in a `WeakMap` keyed to `env.DB` to avoid recomputation.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`, `env.CANONICAL_RUNTIME_SURFACE_HASH`  
**Classification:** `REQUIRED`  
**Extraction feasibility:** `runtimeSelfIntegrityCheckpoint` is called first in every request. Moving it introduces an import-time dependency that could mask initialization failures.  
**Risk:** HIGH — this is the startup gate. Must not be refactored without careful audit.

---

### 26. Bootstrap / External Authority Reconciliation
**Lines:** 6321–6544  
**Size:** ~225 lines  
**Functions:** `bootstrapTrustHash`, `buildExternalAuthorityDependency`, `canonicalExternalAuthorityRegistry`, `bootstrapDependencyNode`, `canonicalBootstrapDependencies`, `buildBootstrapSovereigntyManifest`, `bootstrapSovereigntyFlags`, `classifyBootstrapSovereigntyDrift`, `buildBootstrapLineageCheckpoint`, `appendBootstrapSovereigntyCheckpoint`, `classifyExternalAuthorityDrift`, `externalAuthorityObservationFromUrl`, `appendExternalAuthorityObservation`, `buildInfrastructureDependencyReconciliation`  
**Purpose:** Defines the canonical set of external authority dependencies (GitHub Actions, OIDC, workflow dispatch) and verifies them for drift at the `/runtime/sovereignty/external-authority` and `/runtime/sovereignty/infrastructure-reconciliation` observability routes.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `DISCOVERY`  
**Extraction feasibility:** Could extract to `src/lib/runtime-discovery-adapter.ts`. Well-bounded. No kernel mutations.  
**Risk:** LOW

---

### 27. Recursive Governance Boundary Enforcement
**Lines:** 6545–6625  
**Size:** ~80 lines  
**Functions:** `issueRuntimeGovernanceLock`, `consumeRecursiveGovernanceReplay`, `enforceRecursiveGovernanceBoundary`, `buildRecursiveGovernanceEnvelopeFromRecord`, `appendFederatedTrustObservation`, `appendRevocationTopologyObservation`, `appendFederatedReconciliationObservation`, `appendFederatedSovereigntyConsensusObservation`, `appendFederationConformanceObservation`, `appendGovernanceCompressionObservation`  
**Purpose:** Issues and enforces governance lock objects for the `POST /governance/recursive/admit` route. Prevents replay of governance mutations by atomically inserting a lock record. Also provides append helpers for federated observation persistence.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `REQUIRED`  
**Extraction feasibility:** `enforceRecursiveGovernanceBoundary` has a mutation side effect (lock issuance). The append helpers are observability-only and could separate.  
**Risk:** MEDIUM — governance lock is a kernel-adjacent write.

---

### 28. Proof Resolution + Replay Detection Helpers
**Lines:** 6627–6757  
**Size:** ~130 lines  
**Functions:** `proofExecutionLineageMatches`, `resolveCanonicalProofEvidence`, `proofAmbiguityReplayEvidence`, `proofReplayEvidence`, `rejectWithTelemetry`, `hasColumn`, `isExpired`, `isFresh`  
**Purpose:** Resolves canonical proof from candidates, detects ambiguous lineage, and constructs structured replay evidence objects. `rejectWithTelemetry` is a helper that emits telemetry and returns the rejection response atomically. `isExpired` / `isFresh` enforce temporal validity windows.  
**Dependencies:** `env.DB`, `emitTelemetry`, `recordDrift`, `canonicalize`  
**Classification:** `REQUIRED`  
**Extraction feasibility:** `rejectWithTelemetry` depends on `emitTelemetry` and `recordDrift`. If the telemetry cluster (22) is extracted first, these could then be cleanly extracted as a unit.  
**Risk:** MEDIUM — `rejectWithTelemetry` is called at every rejection point in the kernel.

---

### 29. PREO / Deployment Provenance Validation
**Lines:** 6789–6913  
**Size:** ~125 lines  
**Functions:** `preoGovernanceEnabled`, `ensurePreoSchema`, `preoTableExists`, `validatePreoLineage`, `deploymentPreoLineage`, `validateDeploymentProvenance`  
**Purpose:** Validates PREO (Pre-execution Runtime Evidence Object) lineage for governed deployments. `validateDeploymentProvenance` is called from both `/execute` and `/proof` to verify that deployment provenance fields are consistent with the compiled AEO.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `REQUIRED`  
**Extraction feasibility:** Kernel-adjacent. `validateDeploymentProvenance` is called in the `/execute` and `/proof` hot path.  
**Risk:** HIGH if moved — provenance validation is a critical gate.

---

### 30. Runtime Surface Containment
**Lines:** 6914–7037  
**Size:** ~125 lines  
**Functions:** `containmentFlags`, `ensureRuntimeSurfaceContainmentRegistry`, `hiddenSurfaceProbeFromUrl`, `runtimeSurfaceInventory`, `classifyContainmentSurfaces`, `classifyRuntimeSurfaceContainmentDrift`, `deploymentSurfaceHash`, `buildSovereigntyContainmentEnvelope`, `appendRuntimeSurfaceContainmentCheckpoint`  
**Purpose:** Enumerates all runtime routes from URL parameters and classifies each as executable, observable, or containment-violating. Detects hidden execution surfaces and undeclared mutation routes.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `OBSERVABILITY`  
**Extraction feasibility:** Self-contained. Could join `src/lib/runtime-observability-adapter.ts`.  
**Risk:** LOW

---

### 31. Root Authority Containment
**Lines:** 7038–7215  
**Size:** ~180 lines  
**Functions:** `rootAuthorityFlags`, `classifyRootAuthoritySurface`, `canonicalizeRootAuthorityInventory`, `hashRootAuthorityTopology`, `computeAuthorityContainmentBoundary`, `detectRootAuthorityDrift`, `buildRootAuthorityContainmentEnvelope`, `ensureRootAuthorityObservabilityRegistry`, `appendRootAuthorityObservation`, `rootAuthorityInventoryFromUrl`  
**Purpose:** Enumerates root authority surfaces (OIDC issuer, external authority surface, canonical route hash, governance workflow) and verifies them against expected baseline values. Detects drift classes such as `root_authority_source_drift`, `external_authority_drift`, `canonical_route_surface_drift`.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `OBSERVABILITY`  
**Extraction feasibility:** Could join `src/lib/runtime-observability-adapter.ts` or `src/lib/runtime-discovery-adapter.ts`.  
**Risk:** LOW

---

### 32. Cross-Registry Reconciliation
**Lines:** 7218–7455  
**Size:** ~240 lines  
**Functions:** `crossRegistryRouteFlags`, `crossRegistryRecordId`, `crossRegistryField`, `sortCrossRegistryRecords`, `oneCrossRegistry`, `crossRegistryEdge`, `truthyEvidenceEscalation`, `parseCrossRegistryCanonicalObject`, `crossRegistryCanonicalObjectHash`, `crossRegistryAuthorityHistoricallyValid`, `crossRegistryLineageObject`, `crossRegistryContinuityDrift`, `buildCrossRegistryReconciliationSnapshot`, `fetchCrossRegistryState`, `appendCrossRegistryReconciliationSnapshot`  
**Purpose:** Fetches current state across all registries and builds a cross-registry reconciliation snapshot. Detects continuity drift, orphaned lineage edges, and broken authority-session linkage. Serves the `/registry/reconcile/*` routes.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `DISCOVERY`  
**Extraction feasibility:** Bounded and well-isolated. Target: `src/lib/runtime-discovery-adapter.ts`. No kernel mutations.  
**Risk:** LOW

---

### 33. Runtime Topology Snapshot
**Lines:** 7456–7533  
**Size:** ~80 lines  
**Functions:** `topologyRouteFlags`, `runtimeTopologyNodeObject`, `sortTopologyObjects`, `enumerateRuntimeTopologySnapshot`, `classifyRuntimeTopologySnapshot`, `buildRuntimeTopologyReconciliationEnvelope`, `appendRuntimeTopologySnapshot`  
**Purpose:** Builds a deterministic snapshot of all runtime routes and classifies them into a topology object. Detects topology drift and appends evidence to `runtime_topology_registry`.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `DISCOVERY`  
**Extraction feasibility:** Could extract to `src/lib/runtime-discovery-adapter.ts`.  
**Risk:** LOW

---

### 34. Governance Consensus Observer
**Lines:** 7534–7579  
**Size:** ~50 lines  
**Functions:** `consensusGeneratedAt`, `consensusRouteFlags`, `decodeConsensusEnvelope`, `semanticHashForConsensus`, `buildGovernanceConsensusEnvelope`, `appendGovernanceConsensusEvidence`  
**Purpose:** Builds a governance consensus envelope from query parameters and stores it. Used by `/observer/consensus/*` routes. Evidence-only.  
**Dependencies:** `env.DB`, `sha256Hex`, `canonicalize`  
**Classification:** `OBSERVABILITY`  
**Extraction feasibility:** Could extract to `src/lib/runtime-observability-adapter.ts`.  
**Risk:** LOW

---

### 35. Main Fetch Handler + Route Dispatch
**Lines:** 7580–9057  
**Size:** ~1,480 lines  
**Structure:** Single `fetch()` export default containing all route dispatch logic as sequential `if (url.pathname === ...)` branches.  
**Purpose:** HTTP transport entry point. Dispatches all requests to their handlers. Performs startup integrity check on every request via `runtimeSelfIntegrityCheckpoint`. Houses the canonical runtime routes (`/session`, `/continuity`, `/authority`, `/compile`, `/validate`, `/execute`, `/proof`) as inline implementations.  
**Dependencies:** All clusters above  
**Classification:** `ADAPTER`  
**Extraction feasibility:** The canonical runtime route handlers (`/session`, `/continuity`, `/authority`, `/compile`, `/validate`, `/execute`, `/proof`) are REQUIRED kernel paths embedded inline. They cannot be extracted without introducing adapter abstraction risk. The observability route dispatches (clusters 22, 30, 31, 33) could eventually be delegated to adapter modules.  
**Risk:** HIGH if kernel routes are moved. LOW if only observability dispatches are delegated.

---

### 36. Govern Nonce Schema Bootstrap
**Lines:** 9059–9071  
**Size:** ~15 lines  
**Function:** `ensureGovernNonceRegistrySchema`  
**Purpose:** Creates and migrates the `govern_nonce_registry` table. Handles a schema evolution from the v1 table (no `nonce_domain` column) to the v2 schema. Called during `POST /govern` handling.  
**Dependencies:** `env.DB`  
**Classification:** `ADAPTER`  
**Extraction feasibility:** Could merge into `src/lib/d1-storage-adapter.ts`.  
**Risk:** LOW

---

## Extraction Candidate Analysis

### Selected Candidate: Telemetry / Install-Base Metrics Cluster

**Target module:** `src/lib/runtime-observability-adapter.ts`  
**Source lines:** 5782–5998 (~220 lines)  
**Type dependencies:** `TelemetryEventType` (line 1204), `InstallBaseTelemetryEventType` (nearby), `Env`

#### Why this cluster

| Criterion | Status |
|---|---|
| Bounded | Yes — 10 functions, ~220 lines, clear start/end |
| Low risk | Yes — all writes are append-only INSERT to observability/drift registries |
| Well-isolated | Yes — inward dependencies are only `env.DB` and `canonicalize` |
| Non-kernel | Yes — no authority, no execution, no proof mutations |
| Extraction-ready | Yes — no circular dependencies, no shared mutable state |

#### Dependency graph (inward only)

```
emitBootstrapDiagnostic     → env.DB, canonicalize
emitTelemetry               → env.DB
emitInstallBaseTelemetryEvidence → env.DB, canonicalize
emitInstallBaseTelemetryEvidenceBestEffort → emitInstallBaseTelemetryEvidence, emitTelemetry
deterministicRatio          → (pure math)
installBaseGovernanceMetrics → env.DB, deterministicRatio
boundedObservabilityWindow  → (pure URL param parse)
installBaseEventTrend       → env.DB
governanceObservabilityEvidence → env.DB, installBaseGovernanceMetrics, installBaseEventTrend
recordDrift                 → env.DB, canonicalize
```

All outward consumers (`rejectWithTelemetry`, `/execute`, `/proof`, bootstrap handlers, observability route dispatches) import from `index.ts` directly today. After extraction, they would import from `src/lib/runtime-observability-adapter.ts`.

#### Call sites in index.ts (outward)

- `emitTelemetry` — called from `/authority`, `/compile`, `/validate`, `/execute`, `/proof`, and `rejectWithTelemetry`
- `emitInstallBaseTelemetryEvidenceBestEffort` — called from `/compile`, `/validate`, `/execute`, `/proof`
- `emitBootstrapDiagnostic` — called from `ensureSchema`
- `installBaseGovernanceMetrics` — called from `/install-base/metrics` route handler
- `governanceObservabilityEvidence` — called from `/observability/governance/*` route handler
- `recordDrift` — called from `/federation/reconcile/topology`, `rejectWithTelemetry`
- `boundedObservabilityWindow` — called from `/observability/governance` route handler

#### What does NOT move

- `TelemetryEventType` and `InstallBaseTelemetryEventType` type aliases — remain in `index.ts` for now (or move to a types file in a later phase)
- `rejectWithTelemetry` — depends on `emitTelemetry` and `recordDrift`; extract in the phase after this one once the adapter boundary stabilizes

#### Risk assessment

| Risk vector | Rating | Notes |
|---|---|---|
| Kernel behavior change | NONE | All functions are write-to-observability only |
| Authority issuance change | NONE | Telemetry is never checked by authority gate |
| Execution legitimacy change | NONE | `emitInstallBaseTelemetryEvidenceBestEffort` swallows errors by design |
| Proof legitimacy change | NONE | Observability writes do not affect proof acceptance |
| Replay safety change | NONE | Telemetry tables are append-only; no nonce logic |
| Schema change | NONE | No DDL changes — tables already created by `ensureSchema` |

---

## Discovery Cluster: Next Sequenced Target

After the observability extraction is complete, the second-priority target is:

**Cross-Registry Reconciliation** (cluster 32, lines 7218–7455)  
Target: `src/lib/runtime-discovery-adapter.ts`

This cluster shares the same isolation profile as the telemetry cluster — no kernel mutations, append-only evidence writes, inward-only dependencies. It is slightly more complex (~240 lines, 15 functions) and depends on type aliases defined in the schema diagnostic block (cluster 11), which is why it is sequenced after the simpler observability extraction.

---

## Full Classification Summary

| # | Cluster | Lines | Size | Classification | Extraction |
|---|---|---|---|---|---|
| 1 | Lineage Verification Kernel | 27–69 | 50 | `REQUIRED` | No |
| 2 | Governance Types + Policy Registry | 74–145 | 75 | `REQUIRED` | No |
| 3 | ATAO Material Construction | 152–195 | 45 | `SEQUENCED` | After cluster 6 |
| 4 | Govern Candidate Parsing | 197–236 | 40 | `ADAPTER` | Low priority |
| 5 | Agent Tool Invocation Handler | 259–410 | 155 | `ADAPTER` | Sequenced |
| 6 | Agent Tool Gateway Handlers | 412–632 | 225 | `ADAPTER` | Sequenced |
| 7 | AEO Compile Handler | 633–773 | 145 | `ADAPTER` | Sequenced |
| 8 | Governed Envelope Lineage Verifiers | 778–868 | 90 | `REQUIRED` | No |
| 9 | Route Constants + Surface Inventory | 885–1185 | 300 | `ADAPTER` | Low priority |
| 10 | Topology Epoch Admission | 935–946 | 15 | `ADAPTER` | Inline candidate |
| 11 | Schema Diagnostic + Type Taxonomy | 1194–1528 | 340 | `REQUIRED` | Types file (future) |
| 12 | Recursive Governance Containment Observer | 1529–1750 | 225 | `OBSERVABILITY` | Sequenced |
| 13 | Core Utilities | 1751–1805 | 55 | `REQUIRED` | No |
| 14 | Cryptographic / DSSE Provenance | 1807–1983 | 180 | `REQUIRED` | High risk |
| 15 | Deploy Target / Snapshot Helpers | 1984–2055 | 75 | `REQUIRED` | Low risk future |
| 16 | Schema Management / D1 Bootstrap | 2056–2360 | 305 | `ADAPTER` | `d1-storage-adapter.ts` |
| 17 | Runtime Evolution Consensus | 2363–2680 | 320 | `OBSERVABILITY` | Sequenced |
| 18 | Legitimacy Graph Traversal | 2681–4813 | 2135 | `DISCOVERY` | Multi-step |
| 19 | Federation / Distributed Reconciliation | 4814–5580 | 770 | `DISCOVERY` | `runtime-discovery-adapter.ts` |
| 20 | Revocation Topology | 5582–5651 | 70 | `DISCOVERY` | With cluster 19 |
| 21 | Proof Quarantine / Archive Diagnostics | 5651–5780 | 130 | `OBSERVABILITY` | `d1-storage-adapter.ts` |
| **22** | **Telemetry / Install-Base Metrics** | **5782–5998** | **220** | **`OBSERVABILITY`** | **← SELECTED** |
| 23 | Continuous FATE | 5998–6070 | 75 | `OBSERVABILITY` | With cluster 22 |
| 24 | Recursive Governance Classification | 6072–6165 | 95 | `OBSERVABILITY` | After cluster 22 |
| 25 | Runtime Sovereignty | 6162–6320 | 160 | `REQUIRED` | No |
| 26 | Bootstrap / External Authority | 6321–6544 | 225 | `DISCOVERY` | `runtime-discovery-adapter.ts` |
| 27 | Governance Boundary Enforcement | 6545–6625 | 80 | `REQUIRED` | Partial |
| 28 | Proof Resolution + Replay Helpers | 6627–6757 | 130 | `REQUIRED` | After cluster 22 |
| 29 | PREO / Deployment Provenance Validation | 6789–6913 | 125 | `REQUIRED` | No |
| 30 | Runtime Surface Containment | 6914–7037 | 125 | `OBSERVABILITY` | `runtime-observability-adapter.ts` |
| 31 | Root Authority Containment | 7038–7215 | 180 | `OBSERVABILITY` | `runtime-observability-adapter.ts` |
| 32 | Cross-Registry Reconciliation | 7218–7455 | 240 | `DISCOVERY` | `runtime-discovery-adapter.ts` |
| 33 | Runtime Topology Snapshot | 7456–7533 | 80 | `DISCOVERY` | `runtime-discovery-adapter.ts` |
| 34 | Governance Consensus Observer | 7534–7579 | 50 | `OBSERVABILITY` | `runtime-observability-adapter.ts` |
| 35 | Main Fetch Handler + Route Dispatch | 7580–9057 | 1480 | `ADAPTER` | Observability dispatches only |
| 36 | Govern Nonce Schema Bootstrap | 9059–9071 | 15 | `ADAPTER` | `d1-storage-adapter.ts` |

---

## Reduction Roadmap

Ordered by feasibility and risk. Each phase is independent unless noted.

### Phase 4 (Next): Observability Adapter Extraction
Extract clusters 22, 23, 30, 31, 34 into `src/lib/runtime-observability-adapter.ts`.  
Start with cluster 22 alone (lowest risk, highest call-site coverage).  
**Unblocked. Ready now.**

### Phase 5: Discovery Adapter Extraction
Extract clusters 32, 33, 26, 19, 20 into `src/lib/runtime-discovery-adapter.ts`.  
Start with cluster 32 (smallest, most isolated).  
**Unblocked after Phase 4 stabilizes.**

### Phase 6: D1 Adapter Consolidation
Extract clusters 16, 21, 36 into `src/lib/d1-storage-adapter.ts`.  
Schema bootstrap is already partially there.  
**Unblocked. Low risk.**

### Phase 7: Agent Gateway Consolidation
Extract clusters 3, 5, 6, 7 into `src/lib/agent-tool-gateway.ts` (extend existing).  
**Sequenced — cluster 3 must precede 5 and 6.**

### Phase 8: Legitimacy Graph Decomposition
Decompose cluster 18 (2135 lines) into sub-clusters:
- Graph traversal core
- Reconciliation report/checkpoint derivation
- Portable bundle construction
**Multi-step. High risk. Requires dedicated audit.**

---

## Closure Condition

This audit is complete when:
- [x] Every major `src/index.ts` responsibility is classified
- [x] One extraction candidate is identified and justified
- [x] Future reduction work is prioritized
- [ ] Extraction of cluster 22 (Observability Adapter) is implemented (Phase 4)
