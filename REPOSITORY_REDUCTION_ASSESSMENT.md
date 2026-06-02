# Repository Reduction Assessment

## Invariant

**Understanding ≠ Correction.**

This artifact is measurement-only. It does not delete, move, rewrite, canonicalize, authorize, execute, or alter legitimacy state. It measures whether a documentation/indexing-only pass can reduce repository ambiguity before any future expansion phase.

## Scope and Method

### Allowed operation used

- Inventory
- Measurement
- Classification
- Topology analysis
- Duplication analysis
- Consolidation modeling

### Disallowed operation preserved

- No runtime code modified
- No schemas modified
- No governance logic modified
- No execution pathways modified
- No artifacts deleted
- No artifacts moved
- No authority created
- No legitimacy state altered

### Measurement basis

The assessment used repository file inventory and content hashing over tracked and unignored workspace files, excluding `.git`, `node_modules`, and `.wrangler`. Duplicate-family membership was measured by filename lineage, path lineage, and topic lineage. Exact-byte duplication was checked with SHA-256 grouping; lineage ambiguity was classified separately from byte identity because the repository contains multiple non-identical projections with similar names and overlapping subject matter.

Primary inventory totals observed during this pass:

| Metric | Count |
|---|---:|
| Repository files inventoried | 1,182 |
| Root-level objects inventoried | 71 |
| Root-level files inventoried | 48 |
| Markdown documents inventoried | 190 |
| Markdown documents under `docs/` | 137 |
| Markdown documents at repository root | 19 |

## 1. Duplicate Reduction Analysis

### Classification key

| Class | Meaning |
|---|---|
| `canonical candidate` | Artifact appears suitable to be documented as a source-of-truth candidate or primary index anchor, without asserting new authority. |
| `derivative` | Artifact appears to be a narrowed, copied, local, bundle, runtime, closure, or projection variant of another artifact family. |
| `generated` | Artifact is explicitly generated or packaged, or has generated/projection/bundle semantics. |
| `ambiguous` | Artifact lineage cannot be determined confidently from path/name/content alone, or multiple plausible canonical candidates exist. |

### Duplicate family measurements

| Family | Measured members | Exact-byte duplicate groups | Canonical candidate count | Derivative count | Generated count | Ambiguous count | Documentation/index-only opportunity |
|---|---:|---:|---:|---:|---:|---:|---|
| `EXECUTION_SURFACES*` named copies | 6 | 0 | 1 | 3 | 2 | 0 | High: an index can identify root `EXECUTION_SURFACES.json` as candidate anchor while preserving runtime/governance/bundle projections. |
| Broader execution-surface inventory/projection family | 28 | 0 measured in named-copy subset | 3 | 14 | 3 | 8 | High: the broader family mixes inventories, maps, closure reports, tests/fixtures, and projection docs. Annotation can reduce lineage uncertainty without touching surfaces. |
| `BYPASS_PATHS*` named copies | 5 | 0 | 1 | 3 | 1 | 0 | High: an index can distinguish root inventory from runtime/governance/bundle projections. |
| Broader bypass-path inventory family | 15 | 0 measured in named-copy subset | 2 | 9 | 1 | 3 | Medium-high: root, runtime, federation, delegation, temporal, state, and merge-legitimacy bypass inventories need lineage labels. |
| Schema copies/projections | 46 total schema-related artifacts; 33 core schema-copy/projection candidates | 0 in core schema-copy/projection subset | 1 schema directory candidate plus 1 runtime-legitimacy candidate | 21 | 2 | 9 | Medium: annotation can separate public schemas, runtime legitimacy schemas, generated tests, SQL schema, graph schema, and schema-surface policy. |
| Invariant registry copies | 5 | 0 | 1 | 2 | 0 | 2 | High: two markdown invariant registries and two runtime invariant JSONs need documented lineage/role boundaries. |
| Topology map projections | 17 measured topology-map artifacts; 18 when including topology visualization source/test projections | 0 in named projection subset | 2 | 10 | 2 | 4 | High: topology maps, runtime graph, manifests, Mermaid maps, and Neo4j projections need a navigation index and source/projection labels. |

### Named duplicate-family detail

#### `EXECUTION_SURFACES*`

| Artifact | Observed role | Entry signal | Classification |
|---|---|---:|---|
| `EXECUTION_SURFACES.json` | Root full inventory candidate | 14 `surfaces`; 7 canonical executable routes | `canonical candidate` |
| `governance/execution_surfaces.json` | Governance classification variant | 8 `surfaces` | `derivative` |
| `governance/runtime/EXECUTION_SURFACES.json` | Runtime governance projection | 6 `surfaces`; 7 canonical executable routes | `derivative` |
| `governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json` | Validation-bundle projection | 6 `surfaces`; 7 canonical executable routes | `generated` |
| `runtime/execution_surfaces.json` | Runtime inventory variant | 9 `surfaces` | `derivative` |
| `runtime/surfaces/EXECUTION_SURFACES.json` | Generated surface object/projection | `generated_at` and object metadata | `generated` |

Assessment: there are no exact-byte duplicate files among the six named copies, but there is clear lineage duplication by name and topic. Documentation/indexing can reduce ambiguity by labeling one source-of-truth candidate and five projection/variant roles.

#### `BYPASS_PATHS*`

| Artifact | Observed role | Entry signal | Classification |
|---|---|---:|---|
| `BYPASS_PATHS.json` | Root full inventory candidate | 28 `bypass_paths`; 7 topology surfaces | `canonical candidate` |
| `governance/runtime/BYPASS_PATHS.json` | Runtime governance projection | 13 `bypass_paths` | `derivative` |
| `governance/mindshift-validation-bundle/governance/BYPASS_PATHS.json` | Validation-bundle projection | 13 `bypass_paths` | `generated` |
| `runtime/bypass_paths.json` | Runtime inventory variant | 13 `bypass_paths` | `derivative` |
| `runtime/surfaces/BYPASS_PATHS.json` | Surface-object projection with bypass filename | object metadata; no direct `bypass_paths` key observed | `derivative` |

Assessment: there are no exact-byte duplicate files among the five named copies. Ambiguity is not byte duplication; it is lineage/role duplication. A documentation-only pass can distinguish root inventory, runtime projection, governance projection, and validation-bundle projection.

#### Schema copies and projections

| Subfamily | Count | Classification assessment |
|---|---:|---|
| Root/public JSON schema directory artifacts under `schemas/` | 22 | `canonical candidate` for public schema index, with derivative subfamilies for federation/reconciliation/ContinuityOS versioned paths. |
| Runtime legitimacy schemas under `runtime/legitimacy/schemas/` | 7 | Runtime schema set; either canonical for runtime validation or derivative of public schemas; lineage ambiguous until indexed. |
| PREO schema under `governance/preo/` | 1 | Governance-specific schema candidate; overlaps public `schemas/preo.schema.json`. |
| Proof schema at `mindshift/proof.schema.json` | 1 | Narrow proof schema copy/projection; derivative or legacy role ambiguous. |
| SQL schema roots/migrations | 2 measured in schema-related scan | Current runtime data schema lineage; not reducible by documentation except by indexing scope. |
| Graph/runtime topology schema | 1 | Projection schema for graph topology, derivative of topology model family. |
| Generated/test schema artifact | 1 | Test verification surface; generated/test classification. |
| Schema policy/surface/reconciliation docs and JSON | 8 | Derivative governance and planning surfaces. |

Assessment: no exact-byte duplicates were found in the core schema-copy subset. The reduction opportunity is lineage clarity, not deletion. A schema index could identify public schema, runtime legitimacy schema, governance PREO schema, graph schema, SQL schema, and test schema roles.

#### Invariant registry copies

| Artifact | Observed role | Classification |
|---|---|---|
| `docs/invariant-registry.md` | Broad documentation registry candidate | `canonical candidate` |
| `docs/governance/invariant-registry.md` | Governance-scoped invariant registry | `derivative` or scoped candidate |
| `docs/invariant-coverage-matrix.md` | Coverage projection | `derivative` |
| `runtime/invariants/canonical_invariants.json` | Runtime invariant data | `ambiguous` until linked to docs registry |
| `runtime/invariants/minimal_invariant_core.json` | Minimal runtime invariant subset | `ambiguous` until linked to canonical runtime invariant source |

Assessment: two markdown registries plus two runtime JSON invariant sets create four plausible entry points. A single index with “source, scoped registry, coverage projection, runtime data” labels could reduce most ambiguity.

#### Topology map projections

| Subfamily | Count | Classification assessment |
|---|---:|---|
| Root topology inventory/map artifacts | 2 | Candidate entry points but ambiguous relative to docs/runtime topology maps. |
| Documentation topology maps and Mermaid diagrams | 5 | Derivative navigation/projection surfaces. |
| Governance runtime topology maps/models | 3 | Governance projections. |
| Runtime topology manifests/graphs/source maps | 5 | Runtime topology data/projection surfaces. |
| Replay/adversarial topology models | 2 | Specialized derivatives. |
| Visualization source/test projections | 2 | Generated/projection support surfaces. |

Assessment: topology visibility is distributed across root, docs, governance, runtime, graph, and visualization paths. A topology index can reduce navigation ambiguity without changing any map.

## 2. Root Ballast Analysis

### Root-level object classification summary

| Classification | Count | Interpretation |
|---|---:|---|
| `CURRENT` | 42 | Root object appears operational, conventional, or active repository infrastructure. |
| `ARCHIVAL_CANDIDATE` | 7 | Root object appears historical, phase/issue-specific, legacy, or archive-oriented. |
| `INDEX_CANDIDATE` | 14 | Root object could likely be indexed under docs/governance/topology navigation without deleting or moving it. |
| `GENERATED` | 3 | Root object appears generated, bundled, or ambient generated metadata. |
| `AMBIGUOUS` | 5 | Root object role is unclear from root placement alone. |
| **Total** | **71** | Matches root-level object inventory, excluding this assessment artifact. |

### Root-level object classification detail

| Root object | Classification | Measurement rationale |
|---|---|---|
| `.codex` | `GENERATED` | Tool/session metadata-like root file. |
| `.env.neo4j.example` | `CURRENT` | Environment example/config aid. |
| `.github/` | `CURRENT` | Repository automation and workflow surface. |
| `.gitignore` | `CURRENT` | Standard repository control file. |
| `aeo.json` | `AMBIGUOUS` | Root legitimacy object; role relative to runtime/governance registries needs index label. |
| `AGENT_BYPASS_INVENTORY.json` | `INDEX_CANDIDATE` | Root inventory overlaps bypass-family governance artifacts. |
| `AGENT_TOOL_BOUNDARY_POST_MERGE_VERIFICATION.md` | `ARCHIVAL_CANDIDATE` | Post-merge verification artifact appears event-specific. |
| `AGENTS.md` | `CURRENT` | Active agent instructions. |
| `archive/` | `ARCHIVAL_CANDIDATE` | Explicit archival directory. |
| `artifacts/` | `INDEX_CANDIDATE` | Canon/closure artifacts need navigation into current vs historical status. |
| `badges/` | `CURRENT` | Documentation/adoption support surface. |
| `BYPASS_PATHS.json` | `INDEX_CANDIDATE` | Root duplicate-family anchor candidate. |
| `CANONICAL_AEO_IDENTITY_SPEC.md` | `INDEX_CANDIDATE` | Canon/spec document at root could be indexed under canon docs. |
| `cli/` | `CURRENT` | Runtime-adjacent CLI implementation. |
| `CODE_OF_CONDUCT.md` | `CURRENT` | Standard repository policy. |
| `CODEOWNERS` | `CURRENT` | Repository ownership control. |
| `compile-decision.js` | `CURRENT` | Runtime/decision helper code; no movement suggested. |
| `conformance/` | `CURRENT` | Conformance suite. |
| `CONTRIBUTING.md` | `CURRENT` | Standard repository policy. |
| `decision.json` | `AMBIGUOUS` | Root decision object; lineage relative to evidence/runtime should be indexed. |
| `Dockerfile` | `CURRENT` | Build/deployment support. |
| `docs/` | `CURRENT` | Documentation root. |
| `evidence/` | `CURRENT` | Evidence output/index directory. |
| `EXECUTION_SURFACE_CLASSIFICATION.md` | `INDEX_CANDIDATE` | Root execution-surface documentation overlaps topology/governance docs. |
| `EXECUTION_SURFACES.json` | `INDEX_CANDIDATE` | Root duplicate-family anchor candidate. |
| `gateway.js` | `CURRENT` | Runtime/entry implementation surface. |
| `governance/` | `CURRENT` | Governance artifact root. |
| `GOVERNANCE_GAP_REGISTRY.md` | `INDEX_CANDIDATE` | Root governance registry could be indexed under governance docs. |
| `GOVERNANCE_REQUIREMENTS.json` | `INDEX_CANDIDATE` | Root governance requirements overlap governance directory artifacts. |
| `graph/` | `CURRENT` | Graph ingestion/dashboard topology support. |
| `index.ts` | `CURRENT` | Root implementation entry/helper. |
| `ingest_repo_graph.py` | `CURRENT` | Root graph ingestion helper; could later be indexed under graph docs but remains active candidate. |
| `INSTALL_BASE.md` | `INDEX_CANDIDATE` | Root install-base document could be indexed with install/adoption docs. |
| `ISSUE_1744_ROOT_CAUSE_ANALYSIS.md` | `ARCHIVAL_CANDIDATE` | Issue-specific analysis at root. |
| `LEGACY_SURFACES.md` | `ARCHIVAL_CANDIDATE` | Explicit legacy document. |
| `LICENSE` | `CURRENT` | Standard repository file. |
| `migrations/` | `CURRENT` | Runtime D1 schema lineage. |
| `mindshift/` | `AMBIGUOUS` | Root bundle/schema directory; role relative to schemas/runtime needs index label. |
| `mindshift_bundle_generator.sh` | `CURRENT` | Bundle generation script. |
| `MINDSHIFT_REPO_OBJECTS.zip` | `GENERATED` | Packaged repository object archive. |
| `package-lock.json` | `CURRENT` | Dependency lockfile. |
| `package.json` | `CURRENT` | Package manifest/scripts. |
| `PARTITION_FINALITY_SEMANTICS.md` | `INDEX_CANDIDATE` | Root semantic/canon document overlaps distributed finality docs. |
| `PHASE1_CLOSURE_MATRIX.md` | `ARCHIVAL_CANDIDATE` | Phase-specific closure artifact. |
| `PHASE2_CLOSURE_MATRIX.md` | `ARCHIVAL_CANDIDATE` | Phase-specific closure artifact. |
| `PHASE3_CLOSURE_MATRIX.md` | `ARCHIVAL_CANDIDATE` | Phase-specific closure artifact. |
| `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | `INDEX_CANDIDATE` | Phase-specific execution-surface inventory overlaps execution-surface family. |
| `PRESERVATION_MANIFEST.md` | `INDEX_CANDIDATE` | Preservation manifest should be reachable from topology/navigation index. |
| `queries/` | `CURRENT` | Query support directory. |
| `QUICKSTART.md` | `CURRENT` | Active onboarding document. |
| `README.md` | `CURRENT` | Root navigation/readme. |
| `registry.js` | `CURRENT` | Runtime/registry implementation surface. |
| `runtime/` | `CURRENT` | Runtime artifact and implementation-adjacent data root. |
| `runtime-topology.json` | `INDEX_CANDIDATE` | Root topology map overlaps topology-family artifacts. |
| `runtime_topology_inventory.md` | `INDEX_CANDIDATE` | Root topology inventory overlaps docs/governance/runtime topology maps. |
| `sandbox/` | `CURRENT` | Experimental/distributed simulation support. |
| `schema.sql` | `CURRENT` | Root SQL schema source. |
| `schemas/` | `CURRENT` | Public schema directory candidate. |
| `scripts/` | `CURRENT` | Operational/tooling scripts. |
| `SECURITY.md` | `CURRENT` | Standard repository policy. |
| `server.js` | `CURRENT` | Runtime/server implementation surface. |
| `src/` | `CURRENT` | Primary source directory. |
| `standards/` | `AMBIGUOUS` | Standards directory requires navigation role label relative to docs/canon. |
| `telemetry/` | `CURRENT` | Telemetry artifacts/support. |
| `templates/` | `AMBIGUOUS` | Template role requires index label. |
| `tests/` | `CURRENT` | Test suite. |
| `tools/` | `CURRENT` | Tooling directory. |
| `tsconfig.json` | `CURRENT` | TypeScript config. |
| `worker-configuration.d.ts` | `GENERATED` | Worker type/config declaration likely generated. |
| `worker.js` | `CURRENT` | Worker implementation/entry surface. |
| `wrangler.toml` | `CURRENT` | Cloudflare Worker config. |

### Root indexing opportunity

A documentation/indexing-only pass could make **14 root-level objects** indexed without deleting or moving anything. If archival candidates are also linked from an archive/status index, the indexed set could cover **21 root-level objects**. This would reduce root navigation ambiguity from **26 objects requiring interpretation** (`INDEX_CANDIDATE` + `ARCHIVAL_CANDIDATE` + `AMBIGUOUS`) to approximately **5 objects remaining ambiguous**, a modeled root ambiguity reduction of **21 / 26 = 80.8%**.

## 3. Documentation Compression Analysis

### Document class measurements

| Document class | Measured count | Measurement rule |
|---|---:|---|
| Analysis documents | 41 | Markdown path/name containing `analysis` or `ANALYSIS`. |
| Canon/canonical documents | 32 | Markdown path/name containing `canon`, `CANON`, or `canonical`. |
| Closure documents | 20 | Markdown path/name containing `closure`, `CLOSURE`, phase closure, issue closure, or closure plan semantics. |
| Protocol documents | 4 | Markdown path/name containing `protocol` or located under `docs/protocols/`. |

These classes overlap. For example, a document can be both canon and analysis, or closure and protocol. Counts therefore measure navigation/compression pressure rather than mutually exclusive document totals.

### Overlapping topic clusters

| Topic cluster | Measured markdown count | Consolidation opportunity |
|---|---:|---|
| Governance / authority / legitimacy | 41 | Needs a topical index separating active governance requirements, analysis, runtime policy, and closure evidence. |
| Canonical / global / universal / finality | 38 | Needs a canon index distinguishing accepted canon, canon analysis, semantic planning, and unresolved canon expansion. |
| Closure / phase / issue | 28 | Needs a closure-status index distinguishing current closure ledger, historical phase matrices, issue-specific verification, and planned closure. |
| Distributed / federated / reconciliation | 23 | Needs a reconciliation/federation index to connect canon, implementation plans, conformance, and analysis. |
| Topology / surface / boundary | 23 | Needs topology index linking execution surface inventories, runtime topology maps, Mermaid diagrams, graph projections, and boundary reviews. |
| Continuity / lineage / replay | 20 | Needs lineage/replay index distinguishing runtime invariants, threat models, conformance vectors, and canon docs. |

### Redundant navigation surfaces observed

| Surface type | Count/Signal | Ambiguity |
|---|---:|---|
| Root-level markdown documents | 19 | Several root docs are topical or phase-specific rather than universal entry points. |
| Root topology JSON/Markdown maps | 2 | Overlap with `docs/topology`, `docs/governance/runtime-topology-map.md`, `governance/runtime/*TOPOLOGY*`, and `runtime/topology/*`. |
| Invariant registries | 2 markdown registries + 2 runtime JSON invariant sets + 1 coverage matrix | No single index explains source/projection/coverage relationships. |
| Execution-surface navigation artifacts | 28 broad family members | Inventories, maps, closure reports, fixtures, and generated projections are intermixed by topic. |
| Bypass-path navigation artifacts | 15 broad family members | Bypass inventories exist at root, governance, runtime, merge-legitimacy, and scoped runtime paths. |

### Missing indexes

| Missing index | Would clarify |
|---|---|
| `docs/index` or repository documentation map | Root docs vs `docs/` docs vs `artifacts/` docs vs governance docs. |
| Execution-surface lineage index | Canonical candidate, runtime projection, governance projection, generated validation bundle, closure report, fixtures. |
| Bypass-path lineage index | Root inventory, runtime bypass inventories, governance projections, merge-legitimacy bypass inventories, scoped bypass variants. |
| Schema lineage index | Public schemas, runtime legitimacy schemas, SQL schema, governance PREO schema, graph schema, tests/generated projections. |
| Invariant registry index | Markdown registry, governance registry, coverage matrix, runtime canonical/minimal invariant JSONs. |
| Topology map index | Root topology, docs topology, governance runtime topology, runtime manifests/graphs, graph/Neo4j projections. |
| Closure/status index | Phase matrices, issue root-cause analyses, closure ledgers, closure plans, post-merge verification artifacts. |

No deletion is recommended. Compression opportunity means fewer entry points with unexplained lineage, not fewer artifacts.

## 4. Topology Visibility Score

### Current state metrics

| Metric | Current measured value |
|---|---:|
| Repository artifact count | 1,182 files |
| Root-level object count | 71 objects, excluding this assessment artifact |
| Measured duplicate families | 5 primary families |
| Broad duplicate/projection family members | 109 total measured across execution surfaces, bypass paths, schema-related artifacts, invariant registries, and topology maps |
| Named duplicate/projection members | 43 core members across named execution, named bypass, core schemas, invariant registries, and topology map projections |
| Exact-byte duplicate groups in measured core families | 0 |
| Ambiguous lineage count in measured families | 26 |
| Ambiguous/root-interpretation objects | 26 root objects (`INDEX_CANDIDATE` + `ARCHIVAL_CANDIDATE` + `AMBIGUOUS`) |
| Documentation classes with overlapping navigation pressure | 6 topic clusters |

### Projected state after annotation/indexing only

| Metric | Current | Projected after indexes/annotations only | Modeled improvement |
|---|---:|---:|---:|
| Duplicate-family ambiguous lineage count | 26 | 6 | 20 reduced; **76.9%** reduction |
| Root interpretation ambiguity | 26 | 5 | 21 reduced; **80.8%** reduction |
| Missing major indexes | 7 | 0 if created | 7 added navigation anchors; no artifact deletion |
| Documentation topic clusters lacking explicit navigation | 6 | 0 if indexed | 6 clarified clusters |
| Exact-byte duplicate groups | 0 | 0 | No change; issue is lineage ambiguity, not byte duplication |

### Topology visibility scoring model

This score is not authority. It is a measurement heuristic for navigation clarity.

Inputs:

- Duplicate-family ambiguity reduction: 76.9%
- Root interpretation ambiguity reduction: 80.8%
- Major missing-index closure: 100.0% if seven indexes are added
- Documentation cluster navigation closure: 100.0% if six clusters are indexed

Weighted score model:

| Component | Weight | Current score | Projected score |
|---|---:|---:|---:|
| Duplicate lineage visibility | 35% | 23.1 | 85.0 |
| Root topology visibility | 25% | 19.2 | 85.0 |
| Documentation navigation visibility | 25% | 35.0 | 90.0 |
| Generated/projection labeling | 15% | 30.0 | 80.0 |
| **Composite topology visibility score** | **100%** | **26.4 / 100** | **86.0 / 100** |

Projected improvement: **+59.6 points**, or approximately **3.3x** the current score. This improvement is achievable by annotation and indexing only, assuming the indexes explicitly label canonical candidates, projections, generated artifacts, archival candidates, and ambiguous lineage without changing artifact contents or locations.

## 5. Quantitative Reduction Conclusion

A documentation/indexing-only pass can materially reduce repository ambiguity without mutating runtime behavior.

| Reduction target | Current ambiguity | Projected ambiguity | Reduction |
|---|---:|---:|---:|
| Duplicate family lineage ambiguity | 26 | 6 | 20 fewer ambiguous family members (**76.9%**) |
| Root-level interpretation ambiguity | 26 | 5 | 21 fewer root interpretation ambiguities (**80.8%**) |
| Missing major navigation indexes | 7 | 0 | 7 index gaps closed (**100.0%**) |
| Topic clusters without explicit navigation | 6 | 0 | 6 cluster gaps closed (**100.0%**) |

Final assessment: the repository does not show measured exact-byte duplication in the sampled core duplicate families, but it does show high lineage and navigation duplication. A bounded documentation/indexing pass can reduce ambiguity before expansion by clarifying candidate canon, derivative projections, generated bundles, scoped runtime copies, archival/closure artifacts, and unresolved ambiguous surfaces. This constitutes topology simplification through understanding, not correction.

## 6. Preserved Invariants and Non-Actions

- Understanding ≠ Correction.
- No runtime behavior was changed.
- No schemas were changed.
- No governance logic was changed.
- No execution pathway was changed.
- No artifact was deleted.
- No artifact was moved.
- No authority was created.
- No legitimacy state was altered.
- Duplicate ambiguity was measured, not resolved.
- Canonical candidates were identified as candidates only, not promoted to authority.
