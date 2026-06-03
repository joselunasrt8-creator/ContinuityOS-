# Runtime Topology Inventory

This document is a static topology inventory generated from repository structure and text-pattern classification only.
It is observational and non-authoritative.

## Coverage
- Routes: `src/routes/**`, `src/index.ts`
- Registries: files containing `registry`
- Validators: files containing `validate`/`validator`
- Execution surfaces: files containing `execute`/`deploy`/mutation semantics
- Proof writers: files containing `proof`
- Replay surfaces: files containing `replay`
- Continuity references: files containing `continuity`
- Authority references: files containing `authority`
- Reconciliation modules: files containing `reconciliation`
- Finality/partition modules: files containing `finality` or `partition`

## Closure status model
- OPEN
- PARTIAL
- CONTAINED
- CLOSED
- BREAK_GLASS

## Artifact role model
Allowed `artifact_role` values:
- `runtime`
- `workflow`
- `script`
- `migration`
- `test`
- `fixture`
- `doc`
- `generated`
- `topology_metadata`
- `config`
- `unknown`

Allowed `risk_scope` values:
- `production_runtime`
- `governance_runtime`
- `ci_workflow`
- `test_only`
- `documentation_only`
- `metadata_only`
- `generated_only`
- `unknown`

## Production closure relevance rules
Nodes include `production_closure_relevant` for closure heatmap precision.

Rules:
- If `artifact_role` in `[test, fixture, doc, generated, topology_metadata]`, then `production_closure_relevant=false`.
- `runtime`, `workflow`, `script`, and `migration` are production closure relevant.
- `config` is production closure relevant only when `mutation_capable=true`.

Tests/docs/fixtures/generated/topology metadata are observational evidence, not production mutation surfaces.

## Inventory summary
Generated output is committed at:
- `graph/runtime-topology.sample.json`

The sample includes per-surface closure status, production-relevance-aware summary counts, and edge relation evidence.

## Canonical constraints preserved
- topology extraction ≠ legitimacy validation
- graph observation ≠ execution permission
- visibility ≠ authority
- no runtime mutation performed

## Governed support surface reconciliation (#1606)

The following Agent Gateway and Agent Tool routes are inventory-visible governed support surfaces. They are not canonical execution routes and do not expand the canonical `/session → /continuity → /authority → /compile → /validate → /execute → /proof` chain.

| Route | Classification | Mutation capability | Execution capability | Deployment capability | Creates authority | Creates ATAO | Proof required | Replay characteristics | Topology visibility classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/agent/tool-call` | `governed_support_surface` | `true` | `false` | `false` | `false` | `false` | `true` | Proof-bound single-use invocation nonce; duplicate ATAO/decision/object/nonce lineage returns `NULL`. | `inventory_visible_governed_support_surface` |
| `/gateway/tool/intercept` | `governed_support_surface` | `true` | `false` | `false` | `false` | `false` | `false` | Append-only observation/proposal evidence; no execution nonce is consumed and no execution replay eligibility is created. | `inventory_visible_governed_support_surface` |
| `/gateway/tool/propose` | `governed_support_surface` | `false` | `false` | `false` | `false` | `false` | `false` | Proposal lookup only; no support lineage append, execution nonce consumption, or replay eligibility creation. | `inventory_visible_governed_support_surface` |
| `/gateway/authority/review` | `governed_support_surface` | `true` | `false` | `false` | `false` | `true` | `false` | Append-only review lineage; approved reviews may form ATAO support objects but do not create authority or execution replay state. | `inventory_visible_governed_support_surface` |
| `/gateway/tool/compile` | `governed_support_surface` | `true` | `false` | `false` | `false` | `false` | `false` | Deterministic compile-only hash reuse; existing AEO compile returns the existing canonical object without execution or proof creation. | `inventory_visible_governed_support_surface` |

Reconciliation invariants:
- `execution_capability=false` for every scoped support route.
- `creates_authority=false` for every scoped support route.
- `deployment_capability=false` for every scoped support route.
- `canonical_execution_expansion=false` for every scoped support route.
- Support route visibility is inventory evidence only; it is not authority, validation, proof, deployment, or execution permission.
