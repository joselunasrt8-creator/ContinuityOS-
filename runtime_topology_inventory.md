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
