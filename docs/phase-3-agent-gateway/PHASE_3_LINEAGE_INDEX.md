# Phase 3 Lineage Index

**Status:** Documentation only. Non-operative.
**Scope:** Issue-to-PR mapping for Phase 3 agent gateway implementation slices.

This document is a static reference index. It records the correspondence between
issues, pull requests, artifact types/functions, file paths, and test coverage for
each Phase 3 implementation slice. It does not implement, execute, authorize, prove,
or validate any runtime behavior. No claim of authority, execution permission, proof
generation, or enforcement is made or implied by any entry below.

---

## Index

| Slice | Issue(s) | PR(s) | Artifact | File | Tests |
|-------|----------|-------|----------|------|-------|
| AEO Template Registry | #1771 | #1771 | `selectAEOTemplate`, `AEOTemplate`, `AEOTemplateDB` | `src/lib/agent-tool-gateway.ts` | `tests/issue-1627-aeo-template-registry.test.mjs` |
| Template Resolution | #1774 | #1774 | `resolveAgentToolTemplate`, `AgentToolAEOTemplateDefinition` | `src/lib/agent-tool-gateway.ts` | `tests/issue-1773-agent-tool-aeo-template-resolution.test.mjs` |
| Validator Binding | #1776 | #1776 | `createValidatorBinding`, `ValidatorBinding` | `src/lib/agent-tool-gateway.ts` | `tests/issue-1775-template-bound-validator-binding.test.mjs` |
| Predicate Registry | #1778 | #1778 | `resolvePredicateDefinition`, `PredicateDefinition` | `src/lib/predicate-registry.ts` | `tests/issue-1777-predicate-registry-resolution.test.mjs` |
| PredicateDefinition Purity Preflight | #1781 | #1781 | `validatePredicateDefinitionPurity`, `PurePredicateDefinition` | `src/lib/predicate-registry.ts` | `tests/issue-1777-predicate-registry-resolution.test.mjs` |
| Gateway ATAO → AEO Compile | #1783, #1787 | #1783, #1787 | POST `/gateway/tool/compile` | `src/index.ts` | `tests/issue-1627-gateway-tool-compile.test.mjs` |
| Predicate Verification Contract | #1789, #1792 | #1792 | `createPredicateVerificationContract`, `PredicateVerificationContract` | `src/lib/agent-tool-gateway.ts` | `tests/issue-1789-predicate-verification-contract.test.mjs` |
| Ω Validator Input Envelope | #1790, #1794 | #1794 | `createOmegaValidatorInputEnvelope`, `OmegaValidatorInputEnvelope` | `src/lib/agent-tool-gateway.ts` | `tests/issue-1790-omega-validator-input-envelope.test.mjs` |
| Ω Validator Outcome Formation | #1791, #1797 | #1797 | `evaluateOmegaValidator`, `OmegaValidatorOutcome`, `OmegaValidatorEvaluationContext` | `src/lib/agent-tool-gateway.ts` | `tests/issue-1791-omega-validator-evaluation.test.mjs` |
| Execution-Boundary Proof Artifact Capture | #1791B, #1799 | #1799 | `captureExecutionBoundaryProof`, `ExecutionBoundaryProof` | `src/lib/agent-tool-gateway.ts` | `tests/issue-1791-execution-boundary-proof-capture.test.mjs` |

---

## Detailed Entries

---

### #1771 → AEO Template Registry

| Field | Value |
|-------|-------|
| **Issue** | #1771 (parent: #1627 Phase 3A) |
| **PR** | #1771 (`claude/aeo-template-registry-1627-Uehxt`) |
| **Artifact type** | `AEOTemplate` · `AEOTemplateStatus` · `AEORiskClass` · `AEOTemplateSelectResult` · `AEOTemplateNullReason` · interface `AEOTemplateDB` |
| **Artifact function** | `selectAEOTemplate` |
| **File path** | `src/lib/agent-tool-gateway.ts` |
| **Migration** | `migrations/0067_aeo_template_registry.sql` |
| **Spec** | `docs/phase-3-agent-gateway/PHASE_3A_AGENT_GATEWAY_SPECIFICATION.md` |
| **Tests** | `tests/issue-1627-aeo-template-registry.test.mjs` |

**Non-claims:**
- Does not produce an AEO; template selection is a lookup, not a compile step.
- Does not execute any tool or agent action.
- Does not grant or imply execution authority.
- Does not generate a proof object.
- Does not bind a validator; binding is a separate surface (#1776).
- `selectAEOTemplate` returning a result is not admission; admission requires the full gateway flow.

---

### #1774 → Template Resolution

| Field | Value |
|-------|-------|
| **Issue** | #1774 (refs #1773) |
| **PR** | #1774 (`codex/implement-closure-slice-for-issue-#1773`) |
| **Artifact type** | `AgentToolAEOTemplateDefinition` · `AgentToolAEOTemplateStatus` · interface `AgentToolAEOTemplateDB` |
| **Artifact function** | `resolveAgentToolTemplate` |
| **File path** | `src/lib/agent-tool-gateway.ts` |
| **Migration** | `migrations/0068_agent_tool_aeo_template_registry.sql` |
| **Tests** | `tests/issue-1773-agent-tool-aeo-template-resolution.test.mjs` |

**Non-claims:**
- Does not produce a `ValidatorBinding`; binding is a separate surface (#1776).
- Does not execute the resolved template.
- Does not produce an AEO; resolution is lookup only.
- Does not grant execution authority.
- A resolved `AgentToolAEOTemplateDefinition` is not an admission decision.

---

### #1776 → Validator Binding

| Field | Value |
|-------|-------|
| **Issue** | #1776 (refs #1775) |
| **PR** | #1776 (`codex/implement-template-bound-validator-binding`) |
| **Artifact type** | `ValidatorBinding` |
| **Artifact function** | `createValidatorBinding` |
| **File path** | `src/lib/agent-tool-gateway.ts` |
| **Tests** | `tests/issue-1775-template-bound-validator-binding.test.mjs` |

**Non-claims:**
- Does not execute validation; a `ValidatorBinding` is a structural record, not a validation result.
- Does not produce a `PredicateVerificationContract`; contract formation is a separate surface (#1789/#1792).
- Does not grant execution authority.
- Does not generate proof.
- Fail-closed on blank or mismatched fields; `null` return is not a recoverable state.

---

### #1778 → Predicate Registry

| Field | Value |
|-------|-------|
| **Issue** | #1778 (refs #1777) |
| **PR** | #1778 (`codex/implement-phase-3a-predicate-registry`) |
| **Artifact type** | `PredicateDefinition` · `PredicateRegistryStatus` · `PredicatePurityViolation` · interface `PredicateRegistryDB` |
| **Artifact function** | `resolvePredicateDefinition` |
| **File path** | `src/lib/predicate-registry.ts` |
| **Migration** | `migrations/0069_predicate_registry.sql` |
| **Tests** | `tests/issue-1777-predicate-registry-resolution.test.mjs` |

**Non-claims:**
- Does not enforce purity; purity preflight is a separate surface (#1781).
- Does not execute predicates.
- Does not create a `ValidatorBinding`.
- Does not grant execution authority.
- Does not generate proof.
- Registry lookup is not predicate evaluation.

---

### #1781 → PredicateDefinition Purity Preflight

| Field | Value |
|-------|-------|
| **Issue** | #1781 |
| **PR** | #1781 (`codex/add-validator-pre-flight-enforcement-for-predicates`) |
| **Artifact type** | `PurePredicateDefinition` (intersection: `PredicateDefinition & { side_effects_allowed: false }`) |
| **Artifact function** | `validatePredicateDefinitionPurity` |
| **File path** | `src/lib/predicate-registry.ts` |
| **Migration** | `migrations/0070_predicate_definition_purity.sql` |
| **Tests** | `tests/issue-1777-predicate-registry-resolution.test.mjs` (extended, +100 cases) |

**Non-claims:**
- Does not execute predicates; purity is a structural property check, not predicate evaluation.
- Does not create a `ValidatorBinding`.
- Does not produce a `PredicateVerificationContract`.
- Does not grant execution authority.
- Does not generate proof.
- `PurePredicateDefinition` is a type constraint, not an execution permission.

---

### #1783 / #1787 → Gateway ATAO → AEO Compile

| Field | Value |
|-------|-------|
| **Issues** | #1783, #1787 |
| **PR #1783** | `codex/add-non-deploy-gateway-compile-path` — adds POST `/gateway/tool/compile` route |
| **PR #1787** | `codex/add-non-deploy-gateway-compile-path-desaww` — governed gateway compile flow; inventory and test reconciliation |
| **Artifact** | POST `/gateway/tool/compile` (HTTP route, fail-closed) |
| **File paths** | `src/index.ts` (route); `runtime/MUTATION_SURFACE_EXHAUSTIVENESS.json`; `runtime/unauthorized_mutation_path_closure_audit.json`; `runtime/unauthorized_mutation_surface_inventory.json` |
| **Tests** | `tests/issue-1627-gateway-tool-compile.test.mjs`; `tests/fate/canonical-runtime-topology-reconciliation.test.mjs`; `tests/fate/issue-838-runtime-sovereignty-boundary-closure.test.mjs` |

**Non-claims:**
- Compile ≠ execution. Producing an AEO from an ATAO does not authorize execution of that AEO.
- Does not persist the compiled AEO; compilation is a bounded transformation step.
- Does not grant execution authority.
- Does not generate a proof object.
- Null ATAO → null AEO; the route is fail-closed.
- Route existence does not imply deployment governance; governance surfaces are tracked separately.

---

### #1789 / #1792 → Predicate Verification Contract

| Field | Value |
|-------|-------|
| **Issues** | #1789 (spec), #1792 (implementation PR) |
| **PR** | #1792 (`claude/phase-3-boundary-planning-ZWMgX`) |
| **Artifact type** | `PredicateVerificationContract` |
| **Artifact function** | `createPredicateVerificationContract` |
| **File path** | `src/lib/agent-tool-gateway.ts` |
| **Tests** | `tests/issue-1789-predicate-verification-contract.test.mjs` (13 TCs) |

**Non-claims:**
- Does not execute predicates; the contract binds template identity to predicate identity by structural consistency check only.
- Does not produce an `OmegaValidatorInputEnvelope`; envelope formation is a separate surface (#1790/#1794).
- Does not create execution authority.
- Does not generate a proof object.
- Fail-closed on null inputs, blank fields, cross-field hash mismatch, lineage version mismatch, and purity violation.
- Contract formation is not admission; admission requires the full Ω Validator evaluation chain.

---

### #1790 / #1794 → Ω Validator Input Envelope

| Field | Value |
|-------|-------|
| **Issues** | #1790 (spec), #1794 (implementation PR) |
| **PR** | #1794 (`claude/issue-1790-l2B6F`) |
| **Artifact type** | `OmegaValidatorInputEnvelope` |
| **Artifact function** | `createOmegaValidatorInputEnvelope` |
| **File path** | `src/lib/agent-tool-gateway.ts` |
| **Tests** | `tests/issue-1790-omega-validator-input-envelope.test.mjs` (15 TCs) |

**Non-claims:**
- Does not execute the Ω Validator; the envelope is an immutable input artifact, not an evaluation.
- Does not produce an `OmegaValidatorOutcome`; outcome formation is a separate surface (#1791/#1797).
- Does not create execution authority.
- Does not generate a proof object.
- Envelope is deterministic and frozen; post-formation mutation returns null on re-verification.
- Fail-closed on null contract, blank fields, and contract hash mismatch.
- An `OmegaValidatorInputEnvelope` is not an admission decision.

---

### #1791 / #1797 → Ω Validator Outcome Formation

| Field | Value |
|-------|-------|
| **Issues** | #1791 (spec), #1797 (implementation PR) |
| **PR** | #1797 (`claude/omega-validator-evaluation-rIroL`) |
| **Artifact types** | `OmegaValidatorEvaluationContext` · `OmegaValidatorOutcome` |
| **Artifact function** | `evaluateOmegaValidator` |
| **File path** | `src/lib/agent-tool-gateway.ts` |
| **Tests** | `tests/issue-1791-omega-validator-evaluation.test.mjs` (16 TCs) |

**Non-claims:**
- VALID outcome ≠ execution permission. `OmegaValidatorOutcome.result === "VALID"` does not authorize execution of any action.
- Does not execute any agent action or tool call.
- Does not produce an `ExecutionBoundaryProof`; proof capture is a separate surface (#1791B/#1799).
- Does not create execution authority.
- Does not persist state.
- Fail-closed: envelope integrity is recomputed before evaluation; tampered envelopes return null.
- `evaluateOmegaValidator` delegates boundary logic to `checkOmegaValidatorBoundary`; it does not itself define boundary semantics.

---

### #1791B / #1799 → Execution-Boundary Proof Artifact Capture

| Field | Value |
|-------|-------|
| **Issues** | #1791B (spec), #1799 (implementation PR) |
| **PR** | #1799 (`claude/execution-boundary-proof-capture-byNAt`) |
| **Artifact type** | `ExecutionBoundaryProof` |
| **Artifact function** | `captureExecutionBoundaryProof` |
| **File path** | `src/lib/agent-tool-gateway.ts` |
| **Tests** | `tests/issue-1791-execution-boundary-proof-capture.test.mjs` |

**Non-claims:**
- `ExecutionBoundaryProof.creates_authority` is always `false`. The proof artifact does not create, extend, or imply execution authority.
- Proof artifact ≠ authority. Capturing a proof does not grant permission to execute anything.
- VALID outcome ≠ executed action. A VALID `OmegaValidatorOutcome` is required to enter proof capture, but that is not equivalent to having executed the action.
- Does not persist proof to any database or registry.
- Does not generate cryptographic signatures; `outcome_id` recomputation is an integrity check, not a signature scheme.
- Does not execute any agent action or tool call.
- Fail-closed on null outcome, non-VALID result, blank fields, and `outcome_id` integrity mismatch.
- Proof capture is a boundary observability artifact. It records that a VALID outcome was formed at the execution boundary; it does not record that execution occurred, because execution is outside the scope of this surface.

---

## Migration Surface

| Migration | PR | Purpose |
|-----------|----|---------|
| `migrations/0067_aeo_template_registry.sql` | #1771 | AEO template registry schema |
| `migrations/0068_agent_tool_aeo_template_registry.sql` | #1774 | Agent-tool-scoped template registry schema |
| `migrations/0069_predicate_registry.sql` | #1778 | Predicate registry schema |
| `migrations/0070_predicate_definition_purity.sql` | #1781 | Predicate definition purity constraint |

Migrations are schema definitions only. They do not execute predicates, produce proofs, or grant authority.

---

## Invariants Preserved Across All Slices

The following invariants hold across every entry in this index. They are stated here for reference; they are not enforced by this document.

- **Capability ≠ authority.** No artifact in this index grants execution authority.
- **Validation ≠ execution.** Validator acceptance is an admission decision for a bounded object, not execution of that object.
- **VALID outcome ≠ executed action.** A VALID `OmegaValidatorOutcome` records that boundary conditions were met, not that execution occurred.
- **Proof ≠ authority.** An `ExecutionBoundaryProof` is an observability artifact; `creates_authority` is always `false`.
- **Compile ≠ deploy.** Producing an AEO from an ATAO does not constitute deployment or execution.
- **Registry lookup ≠ predicate evaluation.** Resolving a `PredicateDefinition` from the registry does not evaluate it.
- **Contract ≠ admission.** A `PredicateVerificationContract` records structural consistency; it is not an admission decision.
- **Envelope ≠ evaluation.** An `OmegaValidatorInputEnvelope` is an immutable input artifact; it is not an evaluation result.

---

*This document contains no runtime behavior, no authority, no execution surface, and no proof generation. It is a static index for Phase 3 lineage traceability.*
