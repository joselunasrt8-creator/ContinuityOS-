# Invariant Coverage Matrix

**Issue:** #1621  
**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** claude/session-1621-sLWgC  
**Date:** 2026-05-31  
**Mode:** NON_OPERATIVE — derived exclusively from existing repository state. No authority created. No execution performed. No state mutated.

---

## Purpose

Establish repository-wide visibility into how each core ContinuityOS invariant is enforced (or not) across workflows, validators, PR governance, deployment boundaries, orchestration layers, and runtime surfaces.

This document is compression and coherence only. It does not introduce new architecture, new invariants, or new enforcement mechanisms.

---

## WARNING

> **This matrix is observational. It does not grant authority, create execution eligibility, or authorize any action.**  
> **Evidence of enforcement ≠ execution permission.**  
> **Coverage status reflects repository state as audited; it does not constitute a runtime claim.**

---

## Core Invariants

| ID | Invariant Statement |
|----|---------------------|
| INV-01 | If no valid object exists → nothing happens |
| INV-02 | Validation precedes execution |
| INV-03 | No authority → no object |
| INV-04 | No Proof-of-Transfer → no persistence |
| INV-05 | validated_object == executed_object |
| INV-06 | Default state = fail-closed |
| INV-07 | Mutation after validation invalidates eligibility |
| INV-08 | Replay safety maintained |
| INV-09 | Topology visibility maintained |
| INV-10 | Reconciliation remains deterministic |

---

## Coverage Matrix

### INV-01 — If no valid object exists → nothing happens

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `schema-validator.js` | Returns `NULL` status + `INVALID_RESULT` on any validation error; missing required fields → immediate rejection | Object passes without required fields | PASS |
| `governed-deploy.yml` | `/validate` stage: all predicates evaluated; `authority_valid`, `hash_equal`, `nonce_unique` must all pass before execution proceeds | Execution proceeds with invalid object | PASS |
| `merge-governance-check.yml` | No PREO → merge legitimacy `NULL`; no PREO_VALID → no merge | Merge proceeds without PREO | PASS |
| `src/governed-deploy.ts` | Eight ordered predicates; first failure short-circuits; missing authority → `authority_valid=false` terminates chain | Execution proceeds past first failed predicate | PASS |
| `src/lib/aeo-governance.ts` | Validates all 5 required AEO keys (intent, scope, validation, target, finality); returns frozen AEO or `null` | AEO constructed from partial keys | PASS |
| `runtime/control_graph_validator.ts` | `observability_only` mode; `runtime_authority=false`; no authority granted | Validator grants runtime authority | PASS |
| **Gap** | No object-level pre-flight check in `preo-candidate.yml` beyond field presence; semantic validity of `changed_files` content not validated | Malformed file list produces valid-looking PREO candidate | PARTIAL |

---

### INV-02 — Validation precedes execution

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `governed-deploy.yml` | Explicit stage sequence: Session → Continuity → Authority → Compile → **Validate** → Execute → Replay-check → Proof; no stage skippable | Stage order bypassed via workflow dispatch parameters | PASS |
| `prepare-governed-deploy.yml` | Session → Continuity → Authority → Compile → Nonce; execution not reached in prep stage | Prep stage invokes execution endpoint | PASS |
| `merge-governance-check.yml` | PREO candidate must exist and be `PREO_VALID` before merge legitimacy is granted; SCO required for governed paths | Merge legitimacy granted without PREO_VALID | PASS |
| `src/governed-deploy.ts` (DeployATAO predicates) | `policy_valid` and `hash_equal` checked before `replay_eligible` and `scope_constraints_met` | Hash check skipped | PASS |
| `governance/runtime/MERGE_GOVERNANCE_RULES.json` | "No PREO_VALID → no merge legitimacy" rule encoded explicitly | Rule bypassed by direct push | PASS (rule) / see bypass paths below |
| **Bypass path documented** | `runtime/runtime_mutation_bypass_paths.json` enumerates `direct_push`, `merge_without_PREO`, `admin_bypass`, `force_push`, `branch_protection_disabled`; MERGE_GOVERNANCE_RULES prohibits all explicitly | Branch protection disabled at GitHub level | DOCUMENTED — external dependency |

---

### INV-03 — No authority → no object

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `governed-deploy.yml` | `/authority` endpoint checked with expiry validation; `ACTIVE` + non-expired required; failure terminates workflow | Expired authority accepted | PASS |
| `src/governed-deploy.ts` | `authority_valid` predicate: `status=ACTIVE && !isExpired(expiry)`; first predicate in chain | Authority check skipped | PASS |
| `runtime/authority_expiration_policy.json` | 15-minute (prep) / 1-hour (deploy) TTL enforced | Authority window extended without policy update | PASS |
| `runtime/sovereignty/root_authority_containment_rules.json` | Root authority boundaries prevent lateral authority escalation | Authority bypass through non-sovereign surface | PASS |
| `runtime/sovereignty/root-authority-containment.js` | Recursive containment enforcement; lateral escalation blocked | Containment traversal incomplete | PASS |
| `governance/runtime/AEO_REQUIREMENTS.json` | `finality.proof_required=true` and `validation.workflow` binding required | AEO constructed without finality binding | PASS |
| `runtime/federated_authority_rules.json` | Cross-federation authority delegation rules; delegation bounded | Federated delegation exceeds declared scope | PASS |
| `tests/fate/authority-lifecycle-consumption.test.mjs` | Tracks authority consumption and expiry across lifecycle | Test coverage gap for edge cases | PASS |
| `tests/fate/issue-584-cloudflare-authority-bypass-containment.test.mjs` | Verifies authority bypass via Cloudflare surface is contained | New bypass paths introduced without tests | PASS |

---

### INV-04 — No Proof-of-Transfer → no persistence

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `governed-deploy.yml` | `/proof` stage is terminal; binds `run_id`, `commit_sha`, `workflow`, `aeo_hash`; proof required before run completes | Proof stage skipped; execution record persists without proof | PASS |
| `migrations/0022_proof_quarantine_registry.sql` | Proof quarantine registry enforces proof presence before record promotion | Registry INSERT bypasses proof check | PASS |
| `migrations/0039_cross_registry_reconciliation_registry.sql` | Cross-registry proof lineage required for reconciliation records | Reconciliation record persists without proof binding | PASS |
| `tests/fate/proof-lineage-enforcement.test.mjs` | Verifies `UNIQUE(execution_id, decision_id, validated_object_hash)`; orphaned proof → `NULL/INVALID`; duplicate → `proof_replay` | Uniqueness constraint not enforced at DB level | PASS |
| `tests/issue-1464-openclaw-govern-lineage-validate-proof.test.mjs` | `/proof` enforces govern lineage; `govern_ancestry_missing` → fail-closed | Govern lineage not checked on proof emission | PASS |
| `runtime/control_graph_registry.ts` | Proof and execution lineage registry abstraction; lineage binding required | Registry write without lineage binding | PASS |
| **Gap** | `governed-release.yml` produces release artifacts classified as `evidence_only=true`, `creates_execution=false`; no PoT required for release records. Intentional by design (evidence-only surface). | Misclassification of release artifact as requiring PoT | PASS (by design) |

---

### INV-05 — validated_object == executed_object

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `governed-deploy.yml` | `validated_object_hash` bound at `/validate` stage; same hash verified at `/execute` stage; mismatch → execution denied | Hash verified against different object version | PASS |
| `src/governed-deploy.ts` | `hash_equal` predicate: `validated_object_hash` must match request hash; `replay_eligible` predicate checks no prior proof exists for hash | Object mutation between validate and execute stages | PASS |
| `src/lib/distributed-replay-convergence-enforcement.ts` | `execution_boundary_integrity`: `validated_replay_lineage_hash` must equal `executed_replay_lineage_hash` | Lineage hash mismatch not detected | PASS |
| `src/distributed-replay-convergence.ts` | Replay hash mismatch (`detect_replay_hash_mismatch`) → `REPLAY_REGISTRY_MISMATCH`; lineage mismatch → classification `NULL` | Mismatch classified as non-fatal | PASS |
| `runtime/schema-validator.js` | Returns normalized `validated_object` + hash for downstream binding; downstream consumers bind to this hash | Downstream consumer recomputes hash independently | PASS |
| `governed-deploy.yml` (replay protection check) | Second execute attempt must return `INVALID` with `replay_detected` or `authority_not_reserved` | Authority reuse permitted for second execute | PASS |

---

### INV-06 — Default state = fail-closed

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| All GitHub Actions workflows | `set -euo pipefail` in all inline shell scripts; any command failure terminates job | Shell script missing strict mode | PASS |
| `schema-validator.js` | Unknown field → `additionalProperties=false` rejection; any validation error → `NULL` status | Permissive schema allows unexpected fields | PASS |
| `governed-deploy.yml` | Non-`workflow_dispatch` invocation → hard fail; missing `WORKER_URL`/`API_KEY` → hard fail | Trigger validation skipped | PASS |
| `constitutional-integrity.yml` | Unknown file classification → `fail-closed`; unexpanded route list required | Unknown classification defaults to open | PASS |
| `merge-governance-check.yml` | Ambiguous PREO status → merge legitimacy `NULL`; unknown head_sha mismatch → `NULL` | Ambiguity resolves to merge-permitted | PASS |
| `runtime/continuous_reconciliation_orchestrator.mjs` | `status !== VALID` → `QUARANTINED`; empty input → `NULL`; `authority_granting=false` always | Orchestrator grants authority on partial validity | PASS |
| `runtime/reconciliation/quarantine-containment-engine.js` | `fail_closed_on_ambiguity=true`; contamination propagates downstream | Contamination contained locally only | PASS |
| `src/lib/distributed-replay-convergence-enforcement.ts` | Empty evidence domains → violated rules list non-empty; `compound_predicate_satisfied=false` | Missing evidence treated as no constraint | PASS |
| `src/distributed-replay-convergence.ts` | Empty input → `classification=NULL`; no implicit valid classification | Null input returns any valid-looking state | PASS |
| `runtime/cross_registry_authority_reconciliation.mjs` | `creates_authority=false` always; ambiguity → evidence-only | Reconciliation grants authority on convergence | PASS |

---

### INV-07 — Mutation after validation invalidates eligibility

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `src/governed-deploy.ts` | `replay_eligible` predicate checks no prior proof exists; if object mutated after validate but before execute, hash mismatch fails `hash_equal` | Hash recomputed against mutated object | PASS |
| `governed-deploy.yml` | `validated_object_hash` captured at validate stage; execute stage re-verifies hash; divergence → hard fail | Hash binding skipped at execute stage | PASS |
| `runtime/continuous_reconciliation_orchestrator.mjs` | `append_only=true`; reconciliation detects drift against `declared_inventory`; drift → `INVALID` status → quarantine | Reconciliation misses in-flight mutation | PASS |
| `merge-governance-check.yml` | PREO `head_sha` must match current PR head; any mutation to PR after PREO creation → PREO invalid | PREO head_sha not re-checked at merge | PASS |
| `src/skill-surfaces/registry-validator.mjs` | Canonical hash computed at validation time; downstream must bind to same hash | Registry entry updated without re-validation | PASS |
| `tests/fate/proof-lineage-enforcement.test.mjs` | Mutation after validation causes `validated_object_hash` mismatch → `UNIQUE` constraint on `(execution_id, decision_id, validated_object_hash)` prevents new proof on mutated object | Test does not cover concurrent mutation race | PASS |
| **Gap** | No explicit cross-workflow signal if a PR is updated after PREO generation but before `merge-governance-check.yml` re-evaluates. Mitigated by `head_sha` binding in PREO, which causes failure at check time. | PREO head_sha staleness window between push and check re-run | MITIGATED |

---

### INV-08 — Replay safety maintained

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `governed-deploy.yml` | `REPLAY_ID` generated from `repo|workflow|run_id|attempt|sha|ref|decision_id|validated_object_hash|nonce`; second execute → `INVALID` + `replay_detected` | Replay ID collides across distinct runs | PASS |
| `prepare-governed-deploy.yml` | Nonce generated per invocation; `expiry=15min`; prevents reuse | Nonce reused across invocations | PASS |
| `src/lib/distributed-replay-convergence-enforcement.ts` | 7 evidence domains required: `nonce_lineage`, `proof_ancestry`, `continuity_lineage`, `topology_visible`, `causal_ordering`, `reconciliation_freshness_ms`, `partition_status` | Missing evidence domain accepted as satisfied | PASS |
| `src/distributed-replay-convergence.ts` | `hasChronologyResurrection` (monotonic timestamp check); `detect_replay_hash_mismatch`; `detect_registry_mismatch`; `detect_lineage_mismatch` | Monotonic ordering not enforced on causal events | PASS |
| `constitutional-integrity.yml` | `drift_replay_id` generated deterministically from `repo|workflow|run_id|attempt|sha|ref` | Replay ID not compared against prior run | PASS |
| `sco-candidate.yml` | `SCO_REPLAY_ID` from `repo|workflow|run_id|attempt|head_sha|base_sha` | Replay ID not persisted in registry | PARTIAL |
| `runtime/reconciliation/cross-registry-reconciliation-engine.js` | Deterministic hashing of registry contents; `replay_neutral=true` | Cross-registry reconciliation modifies state | PASS |
| `migrations/0005_invocation_registry.sql` | Invocation tracking prevents replay at persistence layer | Invocation registry not checked before execution | PASS |
| `tests/fate/proof-lineage-enforcement.test.mjs` | Duplicate proof → `proof_replay` classification; `UNIQUE` constraint enforced | Proof replay succeeds with new nonce | PASS |
| **Gap** | `sco-candidate.yml` generates `SCO_REPLAY_ID` but does not persist it to a replay registry. Replay detection for SCO candidates depends on PREO head_sha binding at merge-governance-check time, not at SCO generation time. | Duplicate SCO candidates generated for same head_sha without detection at generation time | PARTIAL |

---

### INV-09 — Topology visibility maintained

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `runtime/continuous_reconciliation_orchestrator.mjs` | Scans `observed_inventory` against `declared_inventory`; drift → `INVALID`; checkpoint deterministic hash | Observed inventory scan incomplete | PASS |
| `runtime/reconciliation/topology-reconciliation-engine.js` | 14-surface canonical traversal order; detects `UNDECLARED_RUNTIME_SURFACE`, `TOPOLOGY_EQUIVALENCE_DRIFT`, `MUTATION_SURFACE_EXPANSION`; merge signals include `UNDECLARED_EXECUTION_SURFACE` | New execution surface added without topology update | PASS |
| `constitutional-integrity.yml` | Detects constitutional drift in `governance/` and `src/runtime/*`; unknown classification → fail-closed; forbidden: new POST/PUT/DELETE handlers | Drift detection misses non-canonical route expansion | PASS |
| `src/lib/distributed-replay-convergence-enforcement.ts` | `topology_visible` domain required in evidence; `false` → `REPLAY_PARTITION_SUSPENDED` | Topology visibility not checked before replay evaluation | PASS |
| `merge-governance-check.yml` | Generates `TOPOLOGY_RECONCILIATION_SIGNAL`; `direct_merge_authority=false`, `evidence_only=true`, `remote_authority_denied=true` | Topology signal consumed as authority grant | PASS |
| `runtime/runtime_surface_scanner.mjs` | Observes runtime execution surfaces; surfaces in `EXECUTION_SURFACES.json` compared against live state | Surface scanner misses dynamically registered surfaces | PASS |
| `governance/runtime-topology-reconciliation.json` | Topology reconciliation policy; defines equivalence detection behavior | Policy applied inconsistently across surfaces | PASS |
| `docs/topology/` (multiple files) | Topology visibility semantics, replay classification alignment, and topology classification documented | Documentation diverges from implementation | PASS (docs exist) |
| **Gap** | `EXECUTION_SURFACES.json` and `runtime-topology.json` are static files; they must be manually updated when new surfaces are added. The workflow (`constitutional-integrity.yml`) compares against the declared list, so an undeclared surface could exist until the next workflow run. | New surface active before next integrity scan | MITIGATED (scan on every PR) |

---

### INV-10 — Reconciliation remains deterministic

| Workflow / Surface | Enforcement Point | Failure Mode | Coverage Status |
|--------------------|-------------------|--------------|-----------------|
| `runtime/reconciliation/topology-reconciliation-engine.js` | 14-surface canonical traversal order hardcoded; deterministic hashing; no timestamp-based ordering | Traversal order changes across runs | PASS |
| `runtime/continuous_reconciliation_orchestrator.mjs` | `checkpoint` = deterministic hash of reconciliation state; idempotent: same payload → same checkpoint | Non-deterministic hash function used | PASS |
| `runtime/recursive_quarantine_orchestrator.mjs` | Quarantine hash deterministic on `reconciliation.status !== VALID`; `replay_neutral=true`, `append_only=true` | Quarantine state differs across identical inputs | PASS |
| `runtime/control_graph_validator.ts` | `validator_id = "validator:" + topologyHash + ":" + validationHash`; `continuity_hash` derived deterministically | Hash function not collision-resistant | PASS |
| `src/distributed-replay-convergence.ts` | Causal indices (not timestamps) used for ordering; `closureComplete` requires all `parent_object_ids` present | Timestamp-based ordering reintroduced | PASS |
| `runtime/cross_registry_authority_reconciliation.mjs` | Deterministic reconciliation preventing replay attacks; `evidence_only` classification | Non-deterministic resolution of conflicting registry states | PASS |
| `migrations/0052_epoch_registry.sql` | Epoch-based ordering for determinism across distributed nodes | Epoch registry not consulted during reconciliation | PASS |
| `tests/fate/canonical-runtime-topology-reconciliation.test.mjs` | Verifies topology reconciliation correctness and determinism | Reconciliation test uses non-canonical fixture | PASS |
| `governance/cross_registry_reconciliation.json` | `may_authorize_execution=false`; reconciliation cannot produce authority as side-effect | Reconciliation result interpreted as authority grant | PASS |

---

## Audit Summary

### By Invariant

| Invariant | Coverage Status | Open Items |
|-----------|-----------------|------------|
| INV-01 — No valid object → nothing happens | **PASS** (with PARTIAL on PREO semantic validation) | Semantic validation of `changed_files` content in PREO |
| INV-02 — Validation precedes execution | **PASS** (external GitHub branch protection dependency documented) | Branch protection enforcement is external to this repo |
| INV-03 — No authority → no object | **PASS** | None |
| INV-04 — No PoT → no persistence | **PASS** (evidence-only release surface by design) | None |
| INV-05 — validated_object == executed_object | **PASS** | None |
| INV-06 — Default state = fail-closed | **PASS** | None |
| INV-07 — Mutation after validation invalidates | **PASS** (PREO staleness window mitigated) | PREO staleness window between push and re-run |
| INV-08 — Replay safety maintained | **PASS** (SCO replay registration PARTIAL) | SCO_REPLAY_ID not persisted to replay registry at generation time |
| INV-09 — Topology visibility maintained | **PASS** (static surface files require manual update) | `EXECUTION_SURFACES.json` updated manually; scan on every PR mitigates |
| INV-10 — Reconciliation remains deterministic | **PASS** | None |

### By Surface

| Surface | Invariants Covered | Notes |
|---------|-------------------|-------|
| `governed-deploy.yml` | INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08 | Strongest enforcement chain in the repo |
| `merge-governance-check.yml` | INV-01, INV-02, INV-05, INV-06, INV-07, INV-09 | PREO head_sha binding covers INV-07 |
| `constitutional-integrity.yml` | INV-06, INV-09 | Drift detection on canonical routes |
| `conformance.yml` | INV-06 | Evidence-only; non-operative invariant |
| `governed-release.yml` | INV-02, INV-04, INV-06, INV-08 | Evidence-only; no authority creation |
| `prepare-governed-deploy.yml` | INV-02, INV-03, INV-08 | Pre-stage for governed-deploy |
| `preo-candidate.yml` | INV-01, INV-02 | PARTIAL on semantic content validation |
| `sco-candidate.yml` | INV-02, INV-07, INV-08 | PARTIAL on SCO_REPLAY_ID persistence |
| `schema-validator.js` | INV-01, INV-05, INV-06 | Core object validation layer |
| `src/governed-deploy.ts` | INV-01, INV-02, INV-03, INV-05, INV-07, INV-08 | Type-safe predicate chain |
| `runtime/control_graph_validator.ts` | INV-01, INV-09, INV-10 | Observability-only validator |
| `src/lib/distributed-replay-convergence-enforcement.ts` | INV-05, INV-08, INV-09 | 7-domain evidence enforcement |
| `src/distributed-replay-convergence.ts` | INV-05, INV-08, INV-10 | Replay convergence classification |
| `runtime/continuous_reconciliation_orchestrator.mjs` | INV-06, INV-07, INV-09, INV-10 | Append-only, replay-neutral |
| `runtime/reconciliation/topology-reconciliation-engine.js` | INV-09, INV-10 | 14-surface deterministic traversal |
| `runtime/reconciliation/quarantine-containment-engine.js` | INV-06, INV-10 | Fail-closed contamination propagation |
| `src/lib/aeo-governance.ts` | INV-01, INV-03 | AEO construction validation |
| Migration stack (0005–0055) | INV-04, INV-08, INV-10 | Persistence layer enforcement |

### Potential Bypass Paths

The following bypass paths are explicitly documented in `runtime/runtime_mutation_bypass_paths.json` and prohibited in `governance/runtime/MERGE_GOVERNANCE_RULES.json`. They are listed here for completeness:

| Bypass Path | Prohibition Source | Mitigation |
|-------------|-------------------|------------|
| `direct_push` to governed branch | MERGE_GOVERNANCE_RULES | Branch protection (external dependency) |
| `merge_without_PREO` | MERGE_GOVERNANCE_RULES | Required status check: `merge-governance-check` |
| `merge_without_SCO` on governed paths | SCO_REQUIREMENTS, MERGE_GOVERNANCE_RULES | Required status check: `generate-sco-candidate` |
| `admin_bypass` of status checks | MERGE_GOVERNANCE_RULES | GitHub branch protection; external dependency |
| `force_push` to governed branch | MERGE_GOVERNANCE_RULES | Branch protection; external dependency |
| `branch_protection_disabled` | MERGE_GOVERNANCE_RULES | Must be enforced at GitHub organization level |

All three external-dependency bypass paths (direct_push, admin_bypass, force_push via branch_protection_disabled) share the same mitigation dependency: GitHub branch protection settings enforced at the organization or repository level. These cannot be guaranteed by in-repo workflow logic alone.

---

## Open Items

| ID | Invariant | Surface | Issue | Severity |
|----|-----------|---------|-------|----------|
| OI-01 | INV-01 | `preo-candidate.yml` | `changed_files` array content not semantically validated; field presence checked only | LOW |
| OI-02 | INV-08 | `sco-candidate.yml` | `SCO_REPLAY_ID` generated but not persisted to a replay registry; replay detection deferred to merge-governance-check head_sha binding | LOW |
| OI-03 | INV-02 | All | Branch protection enforcement is external to repository workflows; all three hard bypass paths depend on GitHub organization-level settings | EXTERNAL |
| OI-04 | INV-09 | `EXECUTION_SURFACES.json` | Static file requires manual update when new surfaces introduced; `constitutional-integrity.yml` scan on every PR mitigates but does not eliminate the window | LOW |

---

## Non-Goals

This document does not:

- Introduce new invariants
- Introduce new enforcement mechanisms
- Propose runtime rewrites
- Create new governance layers
- Expand the ontology
- Authorize any execution

---

## References

| File | Role |
|------|------|
| `governance/runtime/MERGE_GOVERNANCE_RULES.json` | Master merge governance rule set |
| `governance/runtime/PREO_REQUIREMENTS.json` | PREO binding requirements |
| `governance/runtime/SCO_REQUIREMENTS.json` | SCO scope requirements |
| `governance/runtime/AEO_REQUIREMENTS.json` | AEO construction requirements |
| `docs/invariant-registry.md` | Canonical invariant definitions |
| `runtime/runtime_mutation_bypass_paths.json` | Enumerated bypass paths |
| `EXECUTION_SURFACES.json` | Declared execution surfaces |
| `runtime/constitutional_governance_rules.json` | Constitutional invariants |
| `src/governed-deploy.ts` | Deploy predicate chain |
| `src/lib/distributed-replay-convergence-enforcement.ts` | Replay convergence enforcement |
| `tests/fate/proof-lineage-enforcement.test.mjs` | Proof lineage FATE tests |
| `tests/issue-1464-openclaw-govern-lineage-validate-proof.test.mjs` | Govern lineage proof tests |
