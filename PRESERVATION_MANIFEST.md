# Runtime-Critical Preservation Manifest

Generated: 2026-05-21  
Status: Active — replaces speculative governance expansion  
Baseline: 1068 tests passing

---

## Runtime-Critical Categories Preserved

| Category | Enforcement |
|---|---|
| Authority lineage | `src/index.ts` /authority, /session, /continuity routes; migrations 0001-0045 |
| Validation lineage | /validate route; `governance/runtime/CANONICAL_OBJECT_REGISTRY.json` |
| Execution lineage | /compile, /execute routes; `governance/runtime/EXECUTION_SURFACES.json` |
| Proof integrity | /proof route; migration 0041_proof_replay_idempotency.sql |
| Replay protection | migration 0041; `governance/runtime/REPLAY_TESTS.json` |
| Continuity freshness | /continuity route; migration 0010; runtime continuity TTL tests |
| Reconciliation integrity | `runtime/reconciliation/`; `governance/runtime/RECONCILIATION_VERIFICATION_SPEC.json` |
| Sovereignty boundaries | `runtime/cloudflare-sovereignty.test.ts`; `BYPASS_PATHS.json`; `EXECUTION_SURFACES.json` |
| Workflow integrity | `governance/runtime/MERGE_GOVERNANCE_RULES.json`; `governance/runtime/BRANCH_PROTECTION_POLICY.json` |
| Append-only enforcement | migration 0004_enforcement_lock.sql; proof_registry constraints |
| Deterministic conformance | `runtime/governance/DEPLOY_POLICY.json`; conformance test suite |
| Read-only observability | /status, /health routes isolated; observability tests |

---

## Runtime-Critical Files

### Source
- `src/index.ts` — runtime worker entry point
- `src/legitimacy/` — legitimacy chain implementation
- `index.ts`, `server.js`, `worker.js`, `gateway.js` — entry points
- `tsconfig.json`, `package.json`, `wrangler.toml` — build configuration

### Migrations (ALL preserved — none deleted)
- `migrations/0001_init.sql` through `migrations/0045_execution_lineage_columns.sql`

### Tests (ALL preserved — none deleted)
- `tests/` — full test suite (1068 tests)
- `runtime/*.test.ts` — runtime-level tests

### Conformance Fixtures (preserved)
- `conformance/` — conformance test fixtures
- `schemas/` — schema definitions
- `schema.sql` — canonical schema
- `BYPASS_PATHS.json` — root bypass path registry
- `EXECUTION_SURFACES.json` — root execution surface registry
- `EXECUTION_SURFACE_CLASSIFICATION.md` — surface classification
- `GOVERNANCE_REQUIREMENTS.json` — governance requirements

### Governance Artifacts (preserved — referenced by tests)
- `governance/runtime/` — all runtime governance JSON files
- `governance/recursive/` — recursive governance containment models
- `governance/consensus/` — governance consensus spec
- `governance/cross-registry-*.json` — cross-registry reconciliation specs
- `governance/BYPASS_CAPABLE_SURFACES.json`
- `governance/CAPABILITY_RISK_CLASSIFICATION_V1.json`
- `governance/ROOT_AUTHORITY_CLASSIFICATION.json`
- `governance/SKILL_SURFACES_REGISTRY_V1.json`
- `governance/SOVEREIGNTY_ASSUMPTION_REGISTRY.json`
- `governance/mindshift-validation-bundle/governance/BYPASS_PATHS.json` (test-referenced)
- `governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json` (test-referenced)
- `governance/preo/` — PREO spec and validation rules
- `governance/sco/` — SCO spec and validation rules

### Docs (preserved — test-referenced)
- `docs/codex-execution-protocol.md`
- `docs/continuous-reconciliation-hardening.md`
- `docs/cryptographic-provenance-hardening.md`
- `docs/federated-legitimacy-reconciliation.md`
- `docs/identity-continuity-closure.md`
- `docs/recursive-reconciliation-traversal.md`

### Runtime Module Files (preserved)
- `runtime/` — runtime implementation, governance policies, surface maps
- `runtime/governance/` — DEPLOY_POLICY, PREO_POLICY, REPLAY_POLICY, SCHEMA_POLICY, SCO_POLICY
- `runtime/sovereignty/` — sovereignty containment rules
- `runtime/surfaces/` — BYPASS_PATHS, EXECUTION_SURFACES, OBSERVABILITY_SURFACES, SCHEMA_SURFACES
- `runtime/topology/` — topology manifest and schema reconciliation

---

## Active Maintenance Issues (preserved open)

| Issue | Category | Reason Preserved |
|---|---|---|
| #358 | Mutation surface exhaustiveness | Enforce all mutation surfaces declared/authorized |
| #360 | D1 migration governance | Govern D1 migration as declared mutation surface |
| #367 | NULL/fail-closed semantics | Unify result semantics across runtime |
| #380 | Branch protection | Enable main branch protection (GitHub setting) |
| #382 | Release provenance | Define artifact attestation boundary |
| #383 | Reverse-closure map | Map remaining unauthorized mutation paths |
| #584 | Cloudflare sovereignty | Contain Cloudflare production authority bypass |
| #607 | Validation failure semantics | Canonicalize execute/validate failure return values |
| #695 | Adversarial surface verification | Adversarial verification of execution surface closure |

---

## Non-Runtime Artifacts Removed/Archived

### Closed Issues (not_planned — speculative/expansion)
- #569–#572: Speculative FATE/digital-twin additions
- #580: FATE expansion (would add new runtime routes — forbidden)
- #590, #608, #610: Non-operative placeholders
- #615–#618, #624–#629: Skill governance (non-operative)
- #630–#684: Agent/agentic governance expansion cluster
- #655–#671: Training/sim/research extraction issues

### Closed Issues (completed — superseded by spine PRs)
- #307 → #838 (sovereignty boundary)
- #356, #361 → #826 (workflow integrity)
- #357, #370 → #871 (read-only observability)
- #365, #368 → #885/#868 (conformance/lineage)
- #369 → #835 (reconciliation integrity)
- #435 → spine closure (#868–#885)
- #444, #445, #446 → #868/#885 (lineage/conformance)
- #528 → #838 + BYPASS_PATHS.json

### Closed Issues (duplicate/overlap)
- #359 → duplicate of #358 (mutation surface map)
- #365, #366 → completed/not_planned refactors
- #587 → duplicate of #584 (Cloudflare sovereignty)

### Deleted Files
- `archive/runtime-reference-collapse/` — duplicate JSON files + external PDFs
- `governance/mindshift-validation-bundle/archive/MINDSHIFT_REPO_OBJECTS.zip` — large bundle not referenced by tests
- `docs/ai-generated-artifact-governance-spec.md` — speculative governance essay
- `docs/multi-agent-coordination.md` — speculative multi-agent planning
- `docs/github-governed-agent-execution-layer.md` — speculative agent layer
- `docs/governance-consensus-infrastructure.md` — speculative consensus essay
- `docs/passive-legitimacy-observability-layer.md` — speculative observability layer
- `docs/external-positioning-compression.md` — external positioning artifact
- `docs/issue-853-issue-graph-cleanup.md` — planning doc for closed issue
- `docs/regression-report.md` — historical report
- `docs/runtime-contraction-report.md` — historical report
- `docs/failure-mode-canon.md` — duplicate of failure-mode-canon-v1.md
- `docs/control-graph-bootstrap.md` — bootstrap artifact
- `docs/control-graph-taxonomy.md` — taxonomy artifact
- `docs/control-graph-visualization-artifacts.md` — visualization artifact
- `docs/install-base-compression.md` — planning artifact
- `docs/install-base-telemetry.md` — planning artifact
- `docs/integration_manifest.md` — manifest artifact
- `docs/registry-relationship-map.md` — large redundant relationship map
- `docs/runtime-reference-collapse.md` — reference collapse artifact
- `docs/control-graph/neo4j-control-graph-closure.md` — neo4j speculative
- `docs/neo4j/*.md` (5 files) — neo4j speculative docs
- `docs/install-base/README.md`, `docs/install-base/governed-github-deploy-readiness.md` — install-base artifacts

### Relocated 2026-06-19 (root → `artifacts/inventory/`, indexed, history preserved)
Observational/assessment documents with no runtime, test, workflow, or script
reader. See `artifacts/inventory/INDEX.md` and
`archive/DELETION_REPORT_2026-06-19.md`.
- `ARTIFACT_INVENTORY.md`, `INVENTORY_SOURCE_MAP.md`, `DRIFT_ANALYSIS.md`
- `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`, `REPOSITORY_REDUCTION_ASSESSMENT.md`, `LIGHTWEIGHT_REDUCTION_ASSESSMENT.md`
- `AGENT_BYPASS_INVENTORY.json`, `PHASE3_EXECUTION_SURFACE_INVENTORY.json`

### Untracked 2026-06-19 (regenerable; kept on disk, added to `.gitignore`)
- `worker-configuration.d.ts` — `npx wrangler types`
- `graph/topology-viewer.html` — `npm run graph:view`
- `graph/runtime-topology.sample.json` — `npm run graph:runtime`

---

## Preserved Invariants

```text
runtime-critical work > conceptual expansion
transcript ≠ canon
archive evidence ≠ runtime authority
observability ≠ authority
telemetry ≠ proof
metrics ≠ execution permission
one invariant = one canonical issue
merged closure work must not remain open
if no valid runtime gap exists → close issue
```

---

## Validation

- Tests: 1068 passing, 0 failing
- TypeScript: `npx tsc --noEmit` clean
- No migrations removed
- No conformance fixtures removed
- No test-referenced docs removed
- No runtime semantics changed
