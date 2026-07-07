# Issue #2280 — Canonical Execution Surface Registry Audit

## Intent and scope

This audit answers whether the repository already contains a complete canonical execution surface registry. It treats implementation evidence as authoritative and narrows #2280 to the smallest missing closure evidence.

Affected files for this slice:

- `EXECUTION_SURFACES.json`
- `tests/execution-surface-registry-metadata.test.mjs`
- `docs/issue-2280-execution-surface-registry-audit.md`

Preserved invariants:

- No second execution surface registry is introduced.
- No runtime route, validator, proof generator, replay path, authority path, workflow behavior, or deployment behavior is changed.
- The root `EXECUTION_SURFACES.json` remains the canonical source named by the existing registry files.
- Evidence-only inventories remain non-authoritative and replay-neutral.

Mutation-capable surfaces touched by this slice: none. This slice mutates only repository evidence and validation tests.

Replay implications: none for runtime execution. Added metadata records replay semantics already required by existing controls.

Proof requirements: per-surface `proof_requirements` metadata is now explicit in the canonical registry.

Validation requirements: per-surface `validation_requirements` metadata is now explicit and enforced by a targeted registry metadata test.

Unresolved ambiguity: The repository intentionally retains derivative/projection copies for governance/runtime/bundle consumers. They are not new canonical registries, but they remain duplicate definitions in the broad artifact family.

## 1. Execution surface audit

| Surface family | Registry evidence | Classification | Finding |
| --- | --- | --- | --- |
| Runtime canonical routes | `EXECUTION_SURFACES.json` lists `runtime_execute_route` with `/session`, `/continuity`, `/authority`, `/compile`, `/validate`, `/execute`, and `/proof`. `runtime/surfaces/EXECUTION_SURFACES.json` also declares these seven routes as a derivative runtime view. | COMPLETE | Canonical runtime route surface exists; metadata completion was the only missing evidence. |
| Mutation-capable workflow deploy | `github_governed_deploy_workflow` and `github_production_deploy` classify governed deployment workflow surfaces. | DUPLICATED | Two entries address the same workflow path; both are bounded by the same controls. This is duplicate evidence, not a missing registry. |
| Authority-preparation workflow | `github_prepare_governed_deploy_workflow` and `prepare_governed_deploy` classify preparation workflow surfaces. | DUPLICATED | Two entries address the same workflow path; the governance projection includes more rationale. |
| D1 schema and migrations | `d1_schema_and_migrations` declares schema migration as governed infrastructure mutation with legitimacy-column controls. | COMPLETE | Surface is declared and now has explicit capability metadata. |
| Package and Wrangler deploy configuration | `package_manager_scripts` and `wrangler_configuration` declare execution-adjacent deployment/configuration surfaces. | COMPLETE | Surfaces are declared with direct deploy guard expectations. |
| Legacy/demo/webhook surfaces | `legacy_demo_entrypoints` and `static_demo_webhook_objects` declare demo/legacy boundaries. | COMPLETE | Surfaces are classified as non-production/non-executable boundaries. |
| Evidence-only inventories | `runtime_closure_inventory`, `database_write_surface_inventory`, and `workflow_package_deploy_inventory` are evidence-only and non-authoritative. | COMPLETE | They are replay-neutral and cannot authorize execution. |
| External evidence boundaries | `runtime/external_execution_surfaces.json` and related adoption/conformance evidence exist outside the canonical registry. | PARTIAL | Existing evidence identifies external surfaces; #2280 should not absorb #2283 ecosystem boundary scope. |
| GitHub Actions governance | `.github/workflows/merge-governance-check.yml` consumes `EXECUTION_SURFACES.json`; `.github/workflows/canonical-conformance.yml` supports #2282 conformance. | COMPLETE | Workflows validate existing registry/conformance evidence; no runtime redesign required. |

## 2. Registry completeness matrix

Required metadata now present on every canonical registry surface:

- `mutation_capable`
- `execution_capable`
- `deployment_capable`
- `replay_semantics`
- `authority_requirements`
- `proof_requirements`
- `validation_requirements`
- `governance_addressability`
- `evidence_only`
- `canonical_boundary_classification`

## 3. Missing metadata only

Before this slice, the registry already identified surfaces but did not specify the required metadata fields uniformly on every surface. This slice adds only those metadata fields to existing entries in `EXECUTION_SURFACES.json`.

## 4. Missing tests only

A targeted metadata-completeness test now fails if any surface in `EXECUTION_SURFACES.json` lacks the required surface-contract fields, if evidence-only surfaces are marked mutation/execution/deployment capable, or if basic capability metadata omits governance/proof/validation evidence. It is not a full semantic validator for every registry relationship.

## 5. Missing documentation only

This audit document records the closure analysis and candidate issue compression without creating a second registry.

## 6. Duplicate registry definitions

Duplicate/projection evidence remains present:

- `governance/runtime/EXECUTION_SURFACES.json` — derivative governance/runtime projection.
- `runtime/surfaces/EXECUTION_SURFACES.json` — derivative runtime view.
- `governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json` — generated validation-bundle copy.
- Legacy lowercase copies are referenced in inventory/reduction analysis as superseded or non-canonical candidates.

No duplicate canonical registry was introduced by this slice.

## 7. Cross-issue analysis and candidate issue compression

- #2238 Cross-Repo Determinism: registry completion supports deterministic surface enumeration but does not need to absorb cross-repo determinism semantics.
- #2282 Conformance Suite: existing conformance workflow/suite evidence is separate and completed; #2280 should consume that evidence rather than duplicate it.
- #2283 Ecosystem Boundary Specification: external evidence boundaries and ecosystem adoption surfaces belong primarily to #2283. #2280 should not broaden into external ecosystem specification.

Candidate compression: narrow #2280 to "canonical registry exists; close after uniform per-surface metadata and metadata test." This slice implements that closure evidence.

## 8. Final recommendation

IMPLEMENT THEN CLOSE.

The repository already contained the canonical execution surface registry. The only missing closure evidence was uniform required metadata plus a targeted metadata-completeness test. Issue disposition remains in this audit document, not in the canonical registry. That has been added without changing runtime behavior or introducing a second registry.
