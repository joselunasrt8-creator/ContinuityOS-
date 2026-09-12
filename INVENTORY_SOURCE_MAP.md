# INVENTORY_SOURCE_MAP

**Artifact type:** `OBSERVATIONAL_ARTIFACT`
**Artifact class:** `inventory_source_declaration`
**Mode:** documentation-only — source-of-truth annotation
**Runtime effect:** none
**Legitimacy-state effect:** none
**Authority created:** none
**Execution semantics changed:** none
**Issue scope:** duplicate inventory closure (GAP-004 prerequisite)

-----

## Purpose

Declare the canonical source for each duplicate inventory family in the repository.

This document resolves the split-canonical-source problem identified in `DRIFT_ANALYSIS.md` and `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`. It does not mutate any JSON, schema, or runtime artifact. It does not create authority. It is evidence only.

Core invariant preserved:

```text
Ambiguous inventory source
→ unverifiable surface exhaustiveness
→ GAP-004 cannot close
→ NULL
```

-----

## Constraint

This document:

- annotates existing files
- declares source-of-truth per family
- marks non-canonical copies as generated / projection / legacy
- does not delete, merge, or modify any JSON file
- does not change any execution path
- does not change validation semantics

Non-operative remediation only. Mutation slices are separate bounded objects.

-----

## Family 1 — EXECUTION_SURFACES

### Determination: `ROOT_CANONICAL`

`EXECUTION_SURFACES.json` is the single declared and operative authority. The selection is semantic rather than locational: it is the most complete current inventory, carries the issue-2280 capability metadata, identifies the canonical route chain, and was already consumed by runtime-governance and migration enforcement tests. The previous topology was split: merge topology reconciliation consumed `runtime/surfaces/EXECUTION_SURFACES.json`, runtime discovery declared `governance/runtime/EXECUTION_SURFACES.json`, closure tests and regeneration consumed `runtime/execution_surfaces.json`, constitutional review required `governance/execution_surfaces.json`, while other enforcement tests consumed the root file.

All enforcement consumers now read the root canonical file. `EXECUTION_SURFACES_LINEAGE.json` classifies every remaining family member and binds its origin, source version, generation method, and verified content hash. `scripts/validate-execution-surfaces-authority.mjs` fails when a first-party code or workflow consumer names a non-canonical family member, when lineage is incomplete, or when a derivative changes without an explicit freshness update.

| File | Classification | Operative status |
|---|---|---|
| `EXECUTION_SURFACES.json` | **canonical source (`ROOT_CANONICAL`)** | Sole enforcement authority |
| `governance/runtime/EXECUTION_SURFACES.json` | `COMPATIBILITY_COPY` | Non-operative; retained for its legacy schema |
| `runtime/surfaces/EXECUTION_SURFACES.json` | `GENERATED_PROJECTION` | Evidence-only topology projection; not authority |
| `runtime/execution_surfaces.json` | `COMPATIBILITY_COPY` | Non-operative issue-342 schema |
| `governance/execution_surfaces.json` | `RETIRED_ARTIFACT` | Retained, but prohibited as an enforcement input |
| `governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json` | `GENERATED_PROJECTION` | Validation-bundle export; not authority |
| `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | `HISTORICAL_EVIDENCE` | Phase-closure evidence; not current authority |

The inventories remain semantically different. This reconciliation does **not** merge, union, or silently mutate their surface arrays. Any future semantic convergence requires a separate governed change. Declared canonical authority is therefore distinguished from operative consumption, and generated projection is explicitly distinguished from independent authority.

### Producer / consumer map

| Artifact | Producer or maintenance method | Current first-party consumers | Enforcement status |
|---|---|---|---|
| `EXECUTION_SURFACES.json` | Governed manual registry updates; no repository generator writes it | runtime discovery (`src/lib/runtime-discovery-adapter.ts`); governance workflows (`constitutional-integrity.yml`, `merge-governance-check.yml`); audit regeneration (`scripts/regenerate-governance-artifacts.mjs`); execution-surface, runtime-governance, migration, boundary, and FATE tests enumerated in `EXECUTION_SURFACES_LINEAGE.json` | Sole operative source |
| `governance/runtime/EXECUTION_SURFACES.json` | Manual legacy-schema compatibility projection | Presence/shape compatibility test; governance artifact registries and historical reports | Non-operative |
| `runtime/surfaces/EXECUTION_SURFACES.json` | Historical issue-838 topology projection | Topology-manifest hash test and `runtime/topology/topology_manifest.json` | Non-operative projection consumer explicitly allowlisted |
| `runtime/execution_surfaces.json` | Manual issue-342 compatibility projection | Governance artifact registries and historical inventory text | Non-operative |
| `governance/execution_surfaces.json` | No current producer; retained constitutional-history artifact | Governance artifact registries only | Retired; no enforcement consumption |
| `governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json` | Historical validation-bundle field projection; no current generator | Bundle/ownership registries and preservation documentation | Non-operative generated projection |
| `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | Phase 3 closure audit | Phase closure matrix and archival/assessment documentation | Historical evidence |

The topology manifest and canonical object/ownership registries *reference* derivatives to preserve topology and disposition; those registry references do not consume a derivative as execution authority. Documentation records status but cannot create enforcement authority. Validation of this map does not itself grant execution eligibility.

## Family 2 — BYPASS_PATHS

### Canonical Source

|File                      |Version|Role                                 |Basis                                                                                                                                                                                                                                                                                          |
|--------------------------|-------|-------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`BYPASS_PATHS.json` (root)|v2.0   |**Canonical master bypass inventory**|Most complete (381 lines); v2.0 schema with full taxonomy (`GOVERNED`, `PARTIAL`, `BREAK_GLASS`, `UNKNOWN`, `OBSERVABILITY_ONLY`); contains `bypass_id` fields; consumed by `scripts/bypass-audit-detector.mjs`; aligns with `AGENT_BYPASS_INVENTORY.json` classification schema (issue #1695).|

### Non-Canonical Copies

|File                                                                 |Line Count|Classification             |Rationale                                                                                                                                                                                                                            |
|---------------------------------------------------------------------|----------|---------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`governance/runtime/BYPASS_PATHS.json`                               |100       |`GOVERNANCE_PROJECTION`    |v1.0; sparse schema (path + risk only); subset of root. Likely early-phase artifact or governance-view projection. No confirmed enforcement consumer.                                                                                |
|`runtime/surfaces/BYPASS_PATHS.json`                                 |168       |`GENERATED_RUNTIME_SURFACE`|Generated format (`object_type: RuntimeSurfaceInventory`, `generated_at: 2026-05-14`); matches surface inventory generation pattern from `scripts/regenerate-governance-artifacts.mjs`. Canonical source is root `BYPASS_PATHS.json`.|
|`runtime/bypass_paths.json`                                          |116       |`RUNTIME_PROJECTION_LEGACY`|Lowercase filename, no confirmed consumer, subset of root. Likely superseded.                                                                                                                                                        |
|`governance/mindshift-validation-bundle/governance/BYPASS_PATHS.json`|100       |`GENERATED_BUNDLE_COPY`    |Matches `governance/runtime/BYPASS_PATHS.json` exactly. Generated bundle copy.                                                                                                                                                       |
|`governance/ROOT_BYPASS_PATH_INVENTORY.json`                         |222       |`GOVERNANCE_AUDIT_ARTIFACT`|Distinct purpose — issue #1639 governance audit inventory with `non_operative`/`evidence_only` semantics. Not a duplicate of root `BYPASS_PATHS.json`. Classification: `CURRENT`.                                                    |

### Specialized Bypass Path Files (Legitimate Decomposition — Not Duplicates)

These files are topically scoped decompositions, not copies:

|File                                        |Classification                             |
|--------------------------------------------|-------------------------------------------|
|`runtime/constitutional_bypass_paths.json`  |`CURRENT` — constitutional governance scope|
|`runtime/delegation_bypass_paths.json`      |`CURRENT` — delegation chain scope         |
|`runtime/distributed_bypass_paths.json`     |`CURRENT` — distributed topology scope     |
|`runtime/federated_bypass_paths.json`       |`CURRENT` — federation scope               |
|`runtime/runtime_mutation_bypass_paths.json`|`CURRENT` — runtime mutation scope         |
|`runtime/state_bypass_paths.json`           |`CURRENT` — state transition scope         |
|`runtime/temporal_bypass_paths.json`        |`CURRENT` — temporal governance scope      |


> These specialized files represent distinct bypass surface domains. They are not duplicates of the master inventory. They should be explicitly referenced from the canonical `BYPASS_PATHS.json` as domain decompositions to prevent future misclassification.

-----

## Family 3 — SCHEMAS

### Existing Source Map

A `runtime/topology/schema_source_map.json` already exists and partially declares canonical sources. This document extends it with the full family classification.

### Canonical Source

|Location                     |Role                                                                                                                                                                                              |
|-----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`runtime/legitimacy/schemas/`|**Operative runtime schema source** — loaded directly by `runtime/legitimacy/validators/schema-validator.js` (`SCHEMA_DIR = resolve(__dirname, '../schemas')`). All runtime validation uses these.|

### Schema Family Classification

|File / Family                                               |Classification                                                                        |Rationale                                                                                                                                                                                                                                                          |
|------------------------------------------------------------|--------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`runtime/legitimacy/schemas/AEO.schema.json`                |`CANONICAL_RUNTIME`                                                                   |Loaded by schema-validator. Authoritative for execution.                                                                                                                                                                                                           |
|`runtime/legitimacy/schemas/ATAO.schema.json`               |`CANONICAL_RUNTIME`                                                                   |Loaded by schema-validator.                                                                                                                                                                                                                                        |
|`runtime/legitimacy/schemas/AUTHORITY.schema.json`          |`CANONICAL_RUNTIME`                                                                   |Loaded by schema-validator. Declared in `schema_source_map.json`.                                                                                                                                                                                                  |
|`runtime/legitimacy/schemas/CONTINUITY_OBJECT.schema.json`  |`CANONICAL_RUNTIME`                                                                   |Loaded by schema-validator. Declared in `schema_source_map.json`.                                                                                                                                                                                                  |
|`runtime/legitimacy/schemas/PROOF_OBJECT.schema.json`       |`LEGACY_CONTRACT`                                                                     |`DEAD_CONTRACT_RETIRED` — schema describes an object model the runtime never builds. Removed from schema-validator `SCHEMA_FILES`. Classified `dead_contract_retired` in `schema_source_map.json`. Resolved by #1884.                                               |
|`runtime/legitimacy/schemas/PREO.schema.json`               |`CANONICAL_RUNTIME`                                                                   |Loaded by schema-validator.                                                                                                                                                                                                                                        |
|`runtime/legitimacy/schemas/SCO.schema.json`                |`CANONICAL_RUNTIME`                                                                   |Loaded by schema-validator.                                                                                                                                                                                                                                        |
|`runtime/legitimacy/schemas/FEDERATION_ENVELOPE.schema.json`|`CANONICAL_RUNTIME`                                                                   |Loaded by schema-validator.                                                                                                                                                                                                                                        |
|`schemas/aeo.schema.json` (root)                            |`REFERENCE_SOURCE`                                                                    |Contains `$comment` pointing to `schemas/json/continuityos/v1/aeo.schema.json`; has richer field descriptions than runtime copy; diverged `$id`. Declared in `schema_source_map.json` as `legacy_contract_schema` for proof. **Do not use for runtime validation.**|
|`schemas/proof.schema.json` (root)                          |`LEGACY_CONTRACT`                                                                     |Explicitly declared in `schema_source_map.json` as legacy; conflicts with `PROOF_OBJECT.schema.json`; replacement required by future SCO.                                                                                                                          |
|`schemas/preo.schema.json` (root)                           |`REFERENCE_SOURCE`                                                                    |Not declared in existing source map. Classification: reference/pre-runtime contract. Do not use for runtime validation.                                                                                                                                            |
|`governance/preo/PREO.schema.json`                          |`GOVERNANCE_COPY`                                                                     |Governance namespace copy. Not loaded by runtime validator.                                                                                                                                                                                                        |
|`schemas/json/continuityos/v1/aeo.schema.json`              |`VERSIONED_NAMESPACE`                                                                 |ContinuityOS v1 namespace schema; different `$id` and title. Purpose: versioned public contract. Not operative for runtime validation.                                                                                                                             |
|`schemas/json/continuityos/v1/atao.schema.json`             |`VERSIONED_NAMESPACE`                                                                 |Same as above for ATAO.                                                                                                                                                                                                                                            |
|`schemas/federation/`                                       |`CURRENT` — distinct federation envelope schemas not duplicated in runtime/legitimacy.|                                                                                                                                                                                                                                                                   |
|`schemas/reconciliation/`                                   |`CURRENT` — distinct reconciliation schemas not duplicated in runtime/legitimacy.     |                                                                                                                                                                                                                                                                   |
|`mindshift/proof.schema.json`                               |`AMBIGUOUS` — requires separate lineage declaration; not loaded by confirmed consumer.|                                                                                                                                                                                                                                                                   |
|`schemas/classified-observation-object.schema.json`         |`CURRENT` — observation layer schema, no runtime/legitimacy duplicate.                |                                                                                                                                                                                                                                                                   |

-----

## Consumer → Canonical Source Map

Summary for all confirmed runtime consumers:

|Consumer                                           |Inventory Type    |Canonical Source                                                |
|---------------------------------------------------|------------------|----------------------------------------------------------------|
|`merge-governance-check.yml`                       |Execution surfaces|`EXECUTION_SURFACES.json`                                       |
|`src/index.ts`                                     |Execution surfaces|`EXECUTION_SURFACES.json`                                       |
|`scripts/bypass-audit-detector.mjs`                |Bypass paths      |`BYPASS_PATHS.json` (root)                                      |
|`src/install_base/report.mjs`                      |Bypass paths      |`BYPASS_PATHS.json` (root)                                      |
|`runtime/legitimacy/validators/schema-validator.js`|Schemas           |`runtime/legitimacy/schemas/`                                   |
|`scripts/regenerate-governance-artifacts.mjs`      |Both surfaces     |Generates from canonical sources; bundle outputs are derivatives|

-----

## Resolved Split-Source Problem Statement (GAP-004 remains open)

```text
merge-governance-check.yml
→ EXECUTION_SURFACES.json (root canonical, v1.0)

src/index.ts
→ EXECUTION_SURFACES.json (root canonical, v1.0)

The prior consumers referenced divergent inventories. They now converge on the root authority without changing any inventory's surface content. This source reconciliation removes the split ground truth only; it does not establish execution-surface exhaustiveness or close GAP-004.
```

Resolution: Slice 2 selected `ROOT_CANONICAL`. Semantic reconciliation among the divergent derivatives remains a separate governed follow-up; source convergence is not silent inventory mutation.

-----

## Remaining Ambiguities (Not Resolved Here)

|Ambiguity                                                           |Classification      |Resolution Path                                       |
|--------------------------------------------------------------------|--------------------|------------------------------------------------------|
|`mindshift/proof.schema.json` — no confirmed consumer               |`AMBIGUOUS`         |Separate lineage declaration slice                    |
|Root `runtime-topology.json` vs `graph/runtime-topology.sample.json`|`AMBIGUOUS`         |Add generator/source/recency metadata (separate slice)|
|`PHASE3_EXECUTION_SURFACE_INVENTORY.json` placement                 |`ARCHIVAL_CANDIDATE`|Index as phase closure evidence (separate slice)      |

-----

## Foundational Separations Preserved

|Separation                  |Status                                                                         |
|----------------------------|-------------------------------------------------------------------------------|
|Observation ≠ Authority     |Preserved — this document is evidence only                                     |
|Classification ≠ Enforcement|Preserved — annotation does not alter validator behavior                       |
|Proposal ≠ Authority        |Preserved — source declarations do not grant execution permission              |
|Capability ≠ Permission     |Preserved — identifying canonical sources does not create execution eligibility|

-----

## Next Slices

|Slice  |Scope                                                                |Type                  |
|-------|---------------------------------------------------------------------|----------------------|
|Slice 2|Converge `EXECUTION_SURFACES` consumers to single canonical source   |COMPLETE — `ROOT_CANONICAL` (#2303)|
|Slice 3|Add schema lineage annotation to root `schemas/` files               |Documentation         |
|Slice 4|Reference specialized bypass files from canonical `BYPASS_PATHS.json`|Documentation         |
|Slice 5|Declare `mindshift/proof.schema.json` lineage                        |Documentation         |
