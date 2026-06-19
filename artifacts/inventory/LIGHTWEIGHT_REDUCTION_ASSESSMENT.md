---
archived: 2026-06-19
former_path: /LIGHTWEIGHT_REDUCTION_ASSESSMENT.md
status: archived; non-authoritative; observational evidence only
relocation: Repository surface reduction; see artifacts/inventory/INDEX.md
---

# Issue #1609 — Lightweight Reduction Assessment

**Artifact type:** `OBSERVATIONAL_ARTIFACT`
**Mode:** repository topology simplification assessment
**Runtime effect:** none
**Schema effect:** none
**Governance/authority effect:** none
**Execution-path effect:** none
**Legitimacy-state effect:** none

## Scope and invariant boundary

This assessment evaluates whether a future bounded implementation PR can reduce repository ballast by improving classification, archive placement, generated-artifact labeling, navigation consolidation, indexing, and lineage visibility.

This phase does **not** delete, relocate, regenerate, consolidate, or mutate runtime assets. It only records reduction eligibility.

Required separations preserved by this assessment:

- Observation ≠ Authority
- Classification ≠ Enforcement
- Proposal ≠ Authority
- Capability ≠ Permission
- Understanding ≠ Correction

## Evidence base

This assessment uses repository-local evidence from the prior Issue #1609 closure artifacts and fresh object-count checks:

- `ARTIFACT_INVENTORY.md` — inventory pass from #1756.
- `DRIFT_ANALYSIS.md` — drift/ambiguity classification from #1758.
- `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md` — non-operative future-slice recommendations.
- Fresh repository counts from `git ls-files` and targeted file-family counts.

Interpretation rule: a future reduction is safe only when it preserves topology visibility and records lineage better than the current placement. A file being movable or indexable does not make it deletable.

## 1. Reduction candidates

Classification vocabulary for this pass:

- `KEEP` — remain in place or remain visibly indexed because current role is active or canonical enough.
- `ARCHIVE` — eligible for archive relocation or archive-retention labeling in a future bounded PR.
- `GENERATED` — eligible for generated-artifact labeling and source/regeneration metadata.
- `AMBIGUOUS` — role is unclear; do not move until lineage is documented.
- `REQUIRES_LINEAGE` — reduction depends on explicit issue/source/canonical-vs-projection annotation first.

| Candidate / family | Current topology role | Classification | Safe future reduction action | Guardrail |
|---|---|---|---|---|
| `MINDSHIFT_REPO_OBJECTS.zip` | Opaque root-level bundle | `ARCHIVE` + `REQUIRES_LINEAGE` | Move under an archive namespace or add archive-retention/provenance label | Do not delete unless separate retention authority exists. |
| `archive/session/runtime_ontology_build.log` | Historical generated session log | `ARCHIVE` | Keep archived; add archive index row | Already isolated; do not promote to active topology. |
| `archive/session/runtime_ontology_inventory.txt` | Historical generated inventory | `ARCHIVE` | Keep archived; add archive index row | Already isolated; do not promote to active topology. |
| `runtime-topology.json` | Root topology snapshot with unclear generator/recency | `GENERATED` + `AMBIGUOUS` | Add generated/source/recency label; optionally index instead of root placement later | Do not treat as canonical runtime topology without lineage. |
| `graph/runtime-topology.sample.json` | Generated topology sample | `GENERATED` | Add source/generator relation to topology extractor/inventory docs | Preserve as sample evidence, not authority. |
| `graph/*` generated graph artifacts | Graph/projection outputs | `GENERATED` + `REQUIRES_LINEAGE` | Add generated artifact index for graph outputs | Do not regenerate in reduction PR unless explicitly scoped. |
| `governance/mindshift-validation-bundle/*` | Validation bundle copies/derivatives | `GENERATED` + `REQUIRES_LINEAGE` | Add generated-derivative labels and source/regeneration notes | Do not edit bundle semantics. |
| Root phase matrices: `PHASE1_CLOSURE_MATRIX.md`, `PHASE2_CLOSURE_MATRIX.md`, `PHASE3_CLOSURE_MATRIX.md` | Phase closure evidence at root | `ARCHIVE` + `REQUIRES_LINEAGE` | Move to `artifacts/closure/` or index as closure evidence | Preserve issue/phase lineage. |
| `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | Root phase inventory overlapping surface inventories | `AMBIGUOUS` + `REQUIRES_LINEAGE` | Index as phase evidence or classify as derivative | Do not alter runtime surface inventories. |
| Root issue/closure docs: `ARTIFACT_INVENTORY.md`, `DRIFT_ANALYSIS.md`, `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`, `TOPOLOGY_COHERENCE_REVIEW.md` | Issue #1609 closure lineage at root | `KEEP` for now; future `ARCHIVE` candidate | Add root artifact placement index; optionally move under issue/closure namespace later | Keep discoverable until a canonical issue index exists. |
| `AGENT_BYPASS_INVENTORY.json` | Root bypass/agent inventory | `AMBIGUOUS` + `REQUIRES_LINEAGE` | Classify against governance/runtime bypass inventories | Do not change bypass semantics. |
| `BYPASS_PATHS.json` | Root bypass inventory | `AMBIGUOUS` + `REQUIRES_LINEAGE` | Declare canonical/derivative relationship | Do not consolidate JSON. |
| `EXECUTION_SURFACES.json` | Root execution-surface inventory | `AMBIGUOUS` + `REQUIRES_LINEAGE` | Declare canonical/derivative relationship | Do not consolidate execution surfaces. |
| `docs/observability-index.md` | Navigation surface with stale links | `KEEP` + `REQUIRES_LINEAGE` | Repair/annotate missing links and issue mappings | Navigation consolidation only; no observability authority change. |
| `docs/topology/*` | Human-readable topology projections | `KEEP` + `REQUIRES_LINEAGE` | Add projection relation to runtime maps/topology metadata | Do not collapse docs into runtime metadata. |
| `runtime/maps/*` | Runtime map documents | `KEEP` | Keep as canonical map namespace; link derivative docs to it | Do not move runtime map assets in this phase. |
| Schema families under `schemas/*`, `runtime/legitimacy/schemas/*`, namespace v1 copies, and governance PREO schema | Duplicate-looking schema lineage | `KEEP` + `REQUIRES_LINEAGE` | Create schema lineage map | No schema edits or consolidation. |
| Date-stamped or exploratory `docs/analysis/*.md` | Discovery and closure lineage | `KEEP` + future `ARCHIVE`/index candidate | Index by phase/topic | Do not erase discovery lineage. |
| Cross-registry reconciliation spelling/name variants | Navigation/name drift | `AMBIGUOUS` + `REQUIRES_LINEAGE` | Choose documented canonical reference name in an index | No file deletion or semantic merge. |

## 2. Archive candidates

| Candidate | Future archive model | Why safe if bounded | Required lineage before movement |
|---|---|---|---|
| `MINDSHIFT_REPO_OBJECTS.zip` | `archive/generated/` or `archive/bundles/` with provenance note | Opaque package does not provide active navigation at root | Source, generation date if recoverable, retention purpose. |
| `PHASE1_CLOSURE_MATRIX.md`, `PHASE2_CLOSURE_MATRIX.md`, `PHASE3_CLOSURE_MATRIX.md` | `artifacts/closure/phase*/` or `archive/closure/phase*/` | Closure evidence remains useful but root placement suggests active canon | Issue/phase mapping and pointer from root/closure index. |
| `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | `artifacts/closure/phase3/` if declared phase evidence | Overlaps active execution-surface inventory families | Relation to canonical `runtime/surfaces` and governance inventories. |
| `AGENT_TOOL_BOUNDARY_POST_MERGE_VERIFICATION.md` | `artifacts/verification/` or closure index row | Verification proof is historical evidence, not active entrypoint | PR/issue lineage and verification date. |
| `ISSUE_1744_ROOT_CAUSE_ANALYSIS.md` | `artifacts/issues/1744/` or closure index row | Issue analysis can remain searchable without root placement | Issue mapping and current-vs-historical status. |
| Exploratory analysis docs under `docs/analysis/` | Leave in place but index by issue/theme; archive only stale closure-only subsets | Analysis docs preserve discovery topology | Topic, issue, and canonical-successor pointers. |
| Existing `archive/session/*` | Add `archive/INDEX.md` row; no relocation required | Already in archive namespace | Retention classification. |

No deletion is proposed. Archive relocation should be reversible and should include redirects or index links where root discoverability would otherwise drop.

## 3. Navigation consolidation opportunities

| Navigation surface | Duplication / drift | Consolidation opportunity | Safety condition |
|---|---|---|---|
| `docs/observability-index.md` | Contains stale or missing targets noted in prior drift analysis | Annotate missing links, repair targets, or mark planned/retired links | Preserve observability-only semantics. |
| Root issue closure files | Multiple root-level documents serve as Issue #1609 navigation | Create an Issue #1609 closure index and move detailed artifacts under `artifacts/issues/1609/` in a later PR | Root pointer must remain. |
| `runtime_topology_inventory.md`, `runtime-topology.json`, `graph/runtime-topology.sample.json` | Similar names imply duplicate topology authority | Add topology-output index declaring source, generated status, and recency | Generated snapshots must not outrank `runtime/topology/*`. |
| `docs/topology/*`, `docs/governance/runtime-topology-map.md`, `runtime/maps/*`, `runtime/topology/*` | Human docs, runtime maps, and topology metadata are all navigation surfaces | Add projection map: canonical metadata → runtime maps → human docs | Do not collapse distinct observation/projection layers. |
| Execution-surface inventories across root/governance/runtime/validation bundle | Duplicate inventory navigation | Add source-of-truth matrix for canonical, projection, phase-evidence, generated bundle | No runtime/governance JSON mutation. |
| Bypass-path inventories across root/governance/runtime/validation bundle | Duplicate inventory navigation | Add source-of-truth matrix for canonical, projection, phase-evidence, generated bundle | No authority or bypass-policy mutation. |
| Schema locations | Same conceptual schema families appear in several namespaces | Add `SCHEMA_LINEAGE.md` or index row set | No schema content edits. |
| Cognition/CIP lineage docs | CIP concept must be inferred from analysis/canon docs | Add terminology bridge: CIP as cognitive interface/documentation layer over existing observation/cognition lineage | Do not introduce a new primitive or authority surface. |

## 4. Root-level reduction opportunities

Fresh count baseline from this checkout:

| Count type | Current count | Projected count after safe lightweight implementation | Notes |
|---|---:|---:|---|
| Tracked repository objects (`git ls-files`) | 1186 | 1186-1189 | Archive relocation keeps object count stable; adding one to three index documents may increase count slightly. No deletion proposed. |
| Prior primary artifact scan from #1756 | 1029 | 1029-1032 | Previous scan excluded some tracked files; projected delta mirrors index additions only. |
| Root-level tracked files | 52 | 40-43 | A future archive/index pass could move or index about 9-12 root artifacts without touching runtime/deployment/source files. |
| Root-level issue/closure/inventory candidates identified in fresh count | 11 | 1-3 root pointers | Keep a small root pointer/index while relocating detailed closure evidence. |
| Generated validation-bundle files | 9 | 9 | Count unchanged; classify as generated derivatives. |
| Graph artifacts | 16 | 16 | Count unchanged; classify generated/projection lineage. |
| Existing archive/session files | 2 | 2 | Count unchanged; index retention purpose. |

Root-level candidates for future reduction planning:

- `MINDSHIFT_REPO_OBJECTS.zip`
- `ARTIFACT_INVENTORY.md`
- `DRIFT_ANALYSIS.md`
- `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`
- `TOPOLOGY_COHERENCE_REVIEW.md`
- `PHASE1_CLOSURE_MATRIX.md`
- `PHASE2_CLOSURE_MATRIX.md`
- `PHASE3_CLOSURE_MATRIX.md`
- `PHASE3_EXECUTION_SURFACE_INVENTORY.json`
- `AGENT_BYPASS_INVENTORY.json`
- `AGENT_TOOL_BOUNDARY_POST_MERGE_VERIFICATION.md`
- `ISSUE_1744_ROOT_CAUSE_ANALYSIS.md`
- `runtime-topology.json`
- `runtime_topology_inventory.md`

The conservative projected root reduction is 9 files moved or replaced by index references. The aggressive-but-still-lightweight projection is 12 root files moved or indexed. Neither projection includes source files, deployment files, package files, runtime entrypoints, schema files, or governance policy files.

## 5. Ambiguous lineage candidates

| Candidate | Ambiguity | Required lineage annotation |
|---|---|---|
| Issue #1752 Topology Recovery Protocol placement | No explicit #1752 marker; topology recovery is inferred from protocol/topology artifacts | Map #1752 to `docs/protocols/topology-reasoning-protocol-v1.md`, topology inventory, runtime topology maps, and observation boundary docs. |
| Issue #1755 Observation Layer + CIP | Observation layer exists, but #1755/CIP naming is absent | Map #1755 to observability docs, classified observation specs, evidence precedence, and cognition-interface canon docs. |
| `runtime-topology.json` vs `graph/runtime-topology.sample.json` | Recency/generator/canonical relation unclear | Label root file and graph sample as generated/projection with generator/source if known. |
| Validation bundle artifacts | Bundle files may resemble canonical governance/runtime artifacts | Label as generated derivatives with source and regeneration command/path. |
| Execution-surface inventory family | Multiple files with overlapping concepts | Source-of-truth matrix: canonical runtime/governance source, root summary, phase evidence, generated copies. |
| Bypass-path inventory family | Multiple files with overlapping concepts | Source-of-truth matrix: canonical runtime/governance source, root summary, phase evidence, generated copies. |
| Root authority inventory/rules family | Governance and runtime sovereignty copies need relation | Declare governance-vs-runtime projection or source relation in an index. |
| Schema families | Root/runtime/governance/namespace copies lack unified lineage | Schema lineage map with source, projection, version, and validation role. |
| Root closure artifacts | Root placement obscures current-vs-historical status | Issue closure index with issue number, artifact type, date/phase, and current status. |

## 6. Topology preservation assessment

| Invariant | Preservation assessment for proposed future reduction model |
|---|---|
| Observation ≠ Authority | Preserved if generated graph/topology outputs are labeled as observation/projection and do not replace runtime authority metadata. Visibility improves because observation artifacts become explicitly non-authoritative. |
| Classification ≠ Enforcement | Preserved because future actions are labels, indexes, and archive placement only. Classification documents must not mutate validators, schemas, policies, or execution code. |
| Proposal ≠ Authority | Preserved by retaining this and future plans as non-operative issue artifacts. Any archive/index plan remains a proposal until separately scoped and reviewed. |
| Capability ≠ Permission | Preserved by labeling generators and bundles without invoking generators or treating generated output as permission to execute or enforce. |
| Understanding ≠ Correction | Preserved as the controlling invariant. This assessment identifies eligibility only; it performs no reduction. |

Topology visibility is maintained or improved if every relocation has a stable index pointer and every duplicate family receives an explicit canonical/projection/generated/phase-evidence relation before movement. The safe model reduces navigation duplication without narrowing the visible topology graph.

## 7. Estimated ambiguity reduction

| Ambiguity source | Current ambiguity | Projected ambiguity after bounded future implementation | Estimated reduction |
|---|---|---|---:|
| Root ballast / current-vs-historical closure docs | High: root files look equally active | Medium-low after issue/closure index and archive placement | 60-70% |
| Generated topology outputs | High: generator/source/recency unclear | Low after generated labels and source pointers | 70-80% |
| Validation bundle derivatives | Medium-high: bundle copies resemble source artifacts | Low after generated-derivative labels | 65-75% |
| Execution/bypass inventory duplicates | High: canonical source undeclared | Medium after source-of-truth matrix; low only after later implementation | 50-65% |
| Observability navigation stale links | Medium-high: missing targets create navigation drift | Low after link repair/annotation | 70-85% |
| Schema lineage | Medium-high: duplicate-looking schema families | Medium-low after lineage map | 45-60% |
| Issue #1752/#1755 lineage | Medium-high: concepts present but issue labels absent | Low after issue-lineage index | 70-80% |

Overall projected ambiguity reduction for a future lightweight implementation PR: **55-70%** across repository-navigation ambiguity, with no runtime, schema, governance, authority, execution, or legitimacy-state reduction.

## 8. Estimated visibility improvement

| Visibility dimension | Current state | Expected improvement |
|---|---|---|
| Lineage visibility | Issue lineage requires inference across closure docs and filenames | Explicit issue/artifact index enables direct traversal from issue to artifacts. |
| Generated-artifact visibility | Generated outputs and bundles can look canonical | Generated/source labels clarify evidence vs source. |
| Navigation visibility | Multiple root and docs surfaces compete | Consolidated root/closure/topology indexes reduce duplicate entrypoints. |
| Topology visibility | Topology is present but spread across runtime metadata, maps, docs, and graph samples | Projection relation preserves each layer while making the layer order visible. |
| Validation readiness | Duplicate families complicate choosing validation inputs | Source-of-truth matrices help future validators choose exact objects without semantic mutation. |
| Archive visibility | Archive/session artifacts are isolated but not indexed; opaque root bundle is not isolated | Archive index/retention labels separate history from active topology. |

Estimated visibility improvement for a future bounded implementation PR: **moderate to high**. The main benefit is not fewer repository objects; it is fewer unclassified entrypoints and clearer lineage traversal.

## Lightweight reduction model

Safe future implementation actions, in recommended order:

1. Create a root or `artifacts/issues/1609/` closure index mapping inventory, drift, recommendations, topology coherence, and this assessment.
2. Add generated/projection labels for topology graph outputs and validation-bundle artifacts through documentation/index metadata only.
3. Add source-of-truth matrices for execution-surface and bypass-path inventory families.
4. Annotate `docs/observability-index.md` stale targets and add #1752/#1755 lineage rows.
5. Add archive-retention index rows for `MINDSHIFT_REPO_OBJECTS.zip` and `archive/session/*`.
6. If and only if indexes are present, relocate root closure/phase artifacts to an issue or closure artifact namespace in a separate bounded PR.

Explicit non-actions:

- No runtime asset deletion.
- No schema consolidation.
- No validator edits.
- No governance logic changes.
- No authority-surface changes.
- No execution-boundary changes.
- No deployment infrastructure changes.
- No legitimacy-state changes.

## Final determination

`SAFE_LIGHTWEIGHT_REDUCTION_CANDIDATES_IDENTIFIED`

The safe candidates are documentation/index/archive/generated-classification candidates only. This phase evaluates reduction eligibility; it does not perform reduction.
