# Deadweight Removal Audit

## Scope

This audit records the first narrow deadweight-removal slice after V3 closure. The slice is intentionally deletion-only for provably unreferenced artifacts, plus one legacy marker for a duplicate documentation snapshot that still has documentation references.

Out of scope and preserved:

- `src/index.ts`
- validator behavior
- `executeWithAdapter`
- replay/proof/lineage semantics
- demo/portability behavior
- FATE tests
- runtime mutation, authority, validation, execution, or proof semantics

## Deleted files

| Deleted file | Classification | Evidence for deletion |
|---|---|---|
| `docs/issues/first-installable-path.md` | Stale issue draft | `rg -n "docs/issues/first-installable-path.md|first-installable-path.md" -g '!node_modules' -g '!package-lock.json' .` returned no references. The draft described an initial `npm run demo` path that now exists elsewhere, so the draft itself was non-operative and unreferenced. |
| `schemas/skill_surfaces_registry_v1.json` | Unused schema contradicted by canonical fixture | `rg -n "schemas/skill_surfaces_registry_v1.json|skill_surfaces_registry_v1.json" -g '!node_modules' -g '!package-lock.json' .` returned only the schema file's own `$id`. The current canonical registry fixture is `governance/SKILL_SURFACES_REGISTRY_V1.json`, and it contains `registry_semantics`, which the removed schema's `additionalProperties: false` would reject. Tests import the canonical governance registry and the runtime validator directly, not this schema. |
| `scripts/fix-data-url-imports.mjs` | Dead one-shot helper script | `rg -n "scripts/fix-data-url-imports.mjs|fix-data-url-imports.mjs" -g '!node_modules' -g '!package-lock.json' .` returned no references. No package script, runtime file, test, or demo imports or executes it. |
| `scripts/execution_surface_closure_scanner.mjs` | Dead helper script superseded by current FATE coverage | `rg -n "scripts/execution_surface_closure_scanner.mjs|execution_surface_closure_scanner.mjs" -g '!node_modules' -g '!package-lock.json' .` returned no references. Current mutation-surface closure is exercised through FATE suites and `runtime/AUTHORITATIVE_MUTATION_SURFACE_FATE_REGISTRY.json`, not this unreferenced report generator. |

## Kept files that looked removable

| Kept file or family | Why it looked removable | Why it stayed |
|---|---|---|
| `runtime/MUTATION_SURFACE_EXHAUSTIVENESS.json` | Looks partially superseded by `runtime/AUTHORITATIVE_MUTATION_SURFACE_FATE_REGISTRY.json` for execution-capable surfaces. | Kept because it is still referenced by runtime/governance docs and directly read by FATE/topology tests including `tests/fate/mutation-surface-exhaustiveness.test.mjs`, `tests/fate/issue-695-adversarial-execution-verification.test.mjs`, and `tests/fate/canonical-runtime-topology-reconciliation.test.mjs`. |
| Root one-shot audit and assessment docs | They are stale, non-operative, or superseded by closure work. | Kept because `docs/audits/repo-consolidation-audit-1891.md` already classifies this family as sequenced: many are declared in generated registries or cited as lineage evidence, so deleting them would create stale governance/runtime references. |
| `docs/governance/invariant-registry.md` | Duplicate documentation snapshot overlapping `docs/invariant-registry.md`. | Kept and marked `LEGACY / Non-Operative` because several docs still cite or extend it. Deleting it would violate the rule to mark referenced stale docs as legacy instead of removing them. |
| Other zero-reference helper scripts (`local-validator-adapter.mjs`, `mindshift_evidence_collector.sh`, `reconcile-proof-schema-hashes.mjs`, `runtime_contraction_validator.mjs`, `runtime_reference_reconciler.mjs`) | Exact-name reference scans show no package/test imports for some of them. | Kept because their operational/governance purpose is less certain, several can mutate reports or runtime topology, and this first PR intentionally avoids deleting anything uncertain. |
| All FATE tests and fixtures | Some are not part of the current demo path. | Kept by hard constraint: do not remove FATE tests, and do not remove fixtures without a per-suite retirement decision. |

## Validation commands

Required validation for this slice:

```sh
node --import tsx --test tests/fate/issue-1936-authoritative-mutation-surface-fate-suite.test.mjs
node --import tsx --test tests/fate/issue-1940-filesystem-e2e-execution-proof.test.mjs
npm run demo
npm test
```

## Semantic impact

This change removes only unreferenced non-runtime artifacts and marks one referenced duplicate doc as legacy. It does not change runtime code, validator behavior, adapter execution, replay state, proof generation, lineage append behavior, or demo/portability code.
