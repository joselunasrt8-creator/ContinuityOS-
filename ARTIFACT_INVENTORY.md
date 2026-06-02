# Issue #1609 — Artifact Inventory

**Artifact type:** `OBSERVATIONAL_ARTIFACT`
**Mode:** repository lightweight closure / topology consolidation
**Runtime effect:** none
**Legitimacy-state effect:** none

## Scope and invariants

This inventory is a repository-wide cognition-mapping pass over documentation, issue-linked materials, governance artifacts, audit artifacts, closure artifacts, generated artifacts, and topology-classification artifacts. It does not introduce primitives, authority surfaces, execution pathways, runtime behavior, schema behavior, or legitimacy-state changes.

Preserved separations:

- Observation ≠ Authority
- Classification ≠ Enforcement
- Proposal ≠ Authority
- Capability ≠ Permission
- Understanding ≠ Correction

## Methodology and evidence boundary

This inventory uses repository-local evidence only: file topology, text search, filename families, and recent git-history adjacency. It intentionally does not resolve missing issue metadata through external authority and does not treat a search result as enforcement truth.

Evidence commands used during this closure pass:

- `rg --files -g '!node_modules' -g '!dist' -g '!build'`
- `find . -maxdepth 3 -type d -not -path './node_modules*' -not -path './.git*' -print`
- `rg -n "1752|1755|Topology Recovery|Observation Layer|Cognitive Interface|CIP" -g '!node_modules' -g '!package-lock.json' -g '!MINDSHIFT_REPO_OBJECTS.zip'`
- `rg -l "1752|1755|Topology Recovery Protocol|Observation Layer|Cognitive Interface Protocol|CIP" -g '!node_modules' -g '!package-lock.json' -g '!MINDSHIFT_REPO_OBJECTS.zip'`
- `git log --oneline -5`
- `git show --stat --oneline --name-only 6946465`

Interpretation rule: a repository-text marker is stronger than filename similarity; git-history adjacency is weaker than explicit artifact metadata; recommendations remain non-operative unless a later bounded implementation object adopts them.

## Repository inventory summary

| Inventory slice | Count | Classification note |
|---|---:|---|
| Total scanned files under primary repository artifact roots | 1029 | Source, tests, governance, docs, runtime metadata, schemas, conformance, graph, archive, telemetry, templates, scripts, tools |
| Markdown documentation files | 165 | Documentation, analysis, closure, canon, protocol, topology, course, archive |
| JSON governance/runtime/schema/conformance files | 402 | Includes canonical schemas, governance specs, runtime topology metadata, generated validation bundle material |
| Runtime metadata and code files under `runtime/` | 170 | Mixed: runtime support code, topology metadata, governance policy JSON, tests |
| Governance artifacts under `governance/` | 132 | Mixed canonical specs, closure audits, root authority inventories, topology observation specs, validation bundle |
| Tests under `tests/` | 405 | Issue/FATE/conformance proof-bearing artifacts; operational only through test execution, not repository runtime |
| Docs under `docs/` | 141 | Exploratory analysis, canonical docs, topology maps, protocols, adoption/course docs |
| Conformance artifacts under `conformance/` | 26 | Deterministic vectors, suites, harness, evidence |
| Schemas under `schemas/` | 25 | Canonical and namespace schema copies; includes duplicate-lineage candidates |
| Archive artifacts under `archive/` | 3 | Historical deletion/session logs |

## Artifact inventory

| Artifact | Category | Lineage | Status | Notes |
|---|---|---|---|---|
| `docs/observability-index.md` | Documentation index | Observation/telemetry navigation layer | CURRENT_WITH_STALE_LINKS | Canonical navigation intent is clear, but it references missing `passive-legitimacy-observability-layer.md`, `install-base-telemetry.md`, `install-base-compression.md`, and `issue-853-issue-graph-cleanup.md`. |
| `docs/observability-boundary-review.md` | Documentation / boundary review | Observation boundary formalization | CURRENT | Reinforces observability-only posture; no authority mutation identified. |
| `docs/legitimacy-topology-classification.md` | Documentation / topology classification | Topology classification overlay | CURRENT | Aligns with Classification ≠ Enforcement; should remain linked from observability index. |
| `runtime_topology_inventory.md` | Documentation / generated inventory summary | Static topology extraction summary | CURRENT | Explicitly non-authoritative and observational; points to generated sample output. |
| `graph/runtime-topology.sample.json` | Generated topology artifact | Output of runtime topology extraction | CURRENT_GENERATED | Generated graph sample; useful as evidence, not canonical runtime truth. |
| `runtime-topology.json` | Generated/topology artifact | Repository topology graph snapshot | AMBIGUOUS | Similar name and role to graph sample; lineage generator/recency relationship is not explicit. |
| `runtime/topology/*` | Topology metadata | Canonical runtime topology manifest/ontology/source maps | CURRENT | Central topology metadata location; should be preferred for canonical topology references. |
| `docs/topology/*` | Topology diagrams/docs | Human-readable topology views | CURRENT_DERIVATIVE | Useful cognitive interface over topology; derivative of runtime/governance topology metadata. |
| `governance/topology/CLASSIFIED_OBSERVATION_OBJECT_SPEC.json` | Governance topology spec | Issue #1641 classified observation object | CURRENT_CANONICAL | Canonical observation object shape; explicitly not validator, authority, proof, reconciliation, or execution object. |
| `schemas/classified-observation-object.schema.json` | Schema | Schema counterpart for classified observation object | CURRENT | Schema support for observation artifact, not enforcement authority by itself. |
| `governance/topology/TOPOLOGY_OBSERVATION_EMISSION_RULES_SPEC.json` | Governance topology spec | Topology observation emission rules, consumes #1641 | CURRENT | Defines emission lifecycle while preserving observation/authority separation. |
| `governance/topology/TOPOLOGY_EVIDENCE_PRECEDENCE_SPEC.json` | Governance topology spec | Evidence precedence over topology observations | CURRENT | Clarifies observations never override registry state; important for Observation ⊂ reconciliation visibility, not authority. |
| `governance/topology/RUNTIME_TOPOLOGY_INTELLIGENCE_PLANNING_SPEC.json` | Planning/spec artifact | Runtime topology intelligence planning | SUPERSEDED_BY_FORMAL_SPECS | Planning artifact appears upstream of classified observation/emission/evidence-precedence specs. Keep as lineage, not canonical endpoint. |
| `docs/protocols/topology-reasoning-protocol-v1.md` | Protocol documentation | Topology reasoning protocol; git-history-adjacent to session/merge lineage for #1752 | CURRENT_CANONICAL_CANDIDATE | Protocol/cognitive layer only; no runtime authority. Best available repository-local placement candidate for #1752, but the file lacks an explicit #1752 marker. |
| `docs/analysis/topology-aware-closure-sequencing.md` | Analysis | Closure sequencing from topology perspective | CURRENT_DERIVATIVE | Supports consolidation/validation; should be indexed with closure docs. |
| `docs/analysis/cognition-governance-frontier-analysis.md` | Exploratory analysis | Discovery artifact for cognition-governance frontier | CURRENT_DISCOVERY | Broad discovery surface; not closure canonical by itself. |
| `docs/analysis/cognition-governance-closure-canon.md` | Closure/canon analysis | Formalization/sequencing from cognition frontier | CURRENT | Converts discovery findings into dependency ordering without runtime mutation. |
| `docs/canon/formal-cognition-lineage-canon-v1.md` | Canon documentation | Formal cognition lineage canon | CURRENT_CANON | Non-operative canon; closely related to cognitive interface lineage. |
| `docs/canon/canonical-closure-protocol-v1.md` | Canon index/protocol | Canonical closure protocol | CURRENT | Existing canonical closure index; good target for future closure index references. |
| `docs/analysis/distributed-cognitive-legitimacy-convergence-assessment-2026-05-27.md` | Analysis | Distributed cognition convergence assessment | CURRENT_DISCOVERY | Date-stamped analysis; archival candidate after indexed canon relation is explicit. |
| `docs/analysis/distributed-convergence-proof-canon-analysis.md` | Analysis | Distributed convergence proof canon analysis | CURRENT_DERIVATIVE | Found by #1752/#1755 search terms but no explicit issue lineage. |
| `docs/canonical-enforcement-binding-analysis.md` | Analysis | Enforcement binding analysis | CURRENT_DERIVATIVE | Mentions topology/convergence terms; not direct #1752/#1755 lineage. |
| `docs/constitutional-enforcement-universality-analysis.md` | Analysis | Enforcement universality analysis | CURRENT_DERIVATIVE | Relevant to topology/enforcement separation; no direct recent issue marker. |
| `docs/governance/repository-classification-layer.md` | Governance documentation | Repository classification layer | CURRENT | Supports classification consistency; should be linked from closure recommendations. |
| `docs/governance/runtime-topology-map.md` | Governance documentation | Runtime topology map | CURRENT_DERIVATIVE | Human-readable topology map; overlaps with `docs/topology/*` and `runtime/maps/*`. |
| `runtime/maps/CANONICAL_RUNTIME_MAP.md` | Runtime map | Canonical runtime map | CURRENT_CANONICAL | Runtime map should be treated as more canonical than derivative docs. |
| `runtime/maps/EXECUTION_FLOW.md` | Runtime map | Execution flow map | CURRENT_CANONICAL | Canonical runtime flow map; no modification recommended in this issue. |
| `runtime/maps/CONTINUITY_LINEAGE_MAP.md` | Runtime map | Continuity lineage map | CURRENT_CANONICAL | Canonical lineage map; supports validation phase clarity. |
| `runtime/maps/RECONCILIATION_GRAPH.md` | Runtime map | Reconciliation graph | CURRENT_CANONICAL | Canonical reconciliation topology view. |
| `governance/runtime/EXECUTION_SURFACES.json` | Governance/runtime inventory | Runtime execution surface inventory | CURRENT | One of five duplicate-ish `execution_surfaces` artifacts; lineage should be annotated. |
| `runtime/surfaces/EXECUTION_SURFACES.json` | Runtime surface inventory | Runtime surfaces namespace | CURRENT_CANONICAL_CANDIDATE | More topology-local than root/governance copies; likely canonical location for runtime surface data. |
| `runtime/execution_surfaces.json` | Runtime surface inventory | Legacy/root runtime copy | DUPLICATE_CANDIDATE | Duplicate-ish basename; lineage to runtime/surfaces copy unclear. |
| `governance/execution_surfaces.json` | Governance inventory | Governance copy of execution surfaces | DUPLICATE_CANDIDATE | Duplicate-ish; may be canonical only for governance bundle consumers. |
| `governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json` | Generated validation bundle | Validation bundle copy | CURRENT_GENERATED | Generated/exported bundle artifact; should be labeled generated derivative. |
| `governance/runtime/BYPASS_PATHS.json` | Governance/runtime inventory | Runtime bypass-path inventory | CURRENT | One of four duplicate-ish bypass path artifacts. |
| `runtime/surfaces/BYPASS_PATHS.json` | Runtime surface inventory | Runtime surfaces namespace | CURRENT_CANONICAL_CANDIDATE | Likely canonical topology-local bypass surface inventory. |
| `runtime/bypass_paths.json` | Runtime inventory | Legacy/root runtime copy | DUPLICATE_CANDIDATE | Duplicate-ish; lineage unclear. |
| `governance/mindshift-validation-bundle/governance/BYPASS_PATHS.json` | Generated validation bundle | Validation bundle copy | CURRENT_GENERATED | Generated/exported derivative; preserve as bundle output. |
| `governance/cross_registry_reconciliation.json` | Governance registry | Cross-registry reconciliation | DUPLICATE_CANDIDATE | Hyphenated twin exists; canonical spelling unresolved. |
| `governance/cross-registry-reconciliation.json` | Governance registry | Cross-registry reconciliation | DUPLICATE_CANDIDATE | Underscored twin exists; canonical spelling unresolved. |
| `docs/invariant-registry.md` | Documentation registry | Invariant registry | DUPLICATE_CANDIDATE | Overlaps `docs/governance/invariant-registry.md`; scope distinction unclear. |
| `docs/governance/invariant-registry.md` | Governance documentation registry | Invariant registry | DUPLICATE_CANDIDATE | More governance-scoped; should declare relation to root docs copy. |
| `schemas/aeo.schema.json` | Schema | Root canonical AEO schema candidate | AMBIGUOUS | Also present under `runtime/legitimacy/schemas/` and namespace path. |
| `runtime/legitimacy/schemas/AEO.schema.json` | Runtime legitimacy schema | Runtime schema copy | DUPLICATE_CANDIDATE | Runtime-local copy; canonical-vs-copy lineage unclear. |
| `schemas/json/continuityos/v1/aeo.schema.json` | Namespaced schema | ContinuityOS v1 schema | CURRENT_NAMESPACE_COPY | Versioned namespace copy; should declare source. |
| `schemas/atao.schema.json` / `runtime/legitimacy/schemas/ATAO.schema.json` / `schemas/json/continuityos/v1/atao.schema.json` | Schema family | ATAO schema copies | DUPLICATE_CANDIDATE | Same duplicate-lineage pattern as AEO. |
| `schemas/preo.schema.json` / `governance/preo/PREO.schema.json` / `runtime/legitimacy/schemas/PREO.schema.json` | Schema family | PREO schema copies | DUPLICATE_CANDIDATE | Governance/runtime/root schema lineage unclear. |
| `schemas/authority.schema.json` / `runtime/legitimacy/schemas/AUTHORITY.schema.json` | Schema family | Authority schema copies | DUPLICATE_CANDIDATE | Must avoid changing authority semantics; annotate only. |
| `schemas/sco.schema.json` / `runtime/legitimacy/schemas/SCO.schema.json` | Schema family | SCO schema copies | DUPLICATE_CANDIDATE | Root/runtime schema source relationship unclear. |
| `governance/merge-legitimacy/*` | Governance/audit artifacts | Merge legitimacy and bypass audit surface | CURRENT | Dense audit/closure set; should stay separate from runtime authority. |
| `governance/merge-legitimacy/ADMIN_BYPASS_AUDIT_1604.json` | Audit artifact | Issue #1604 admin bypass audit | CURRENT_AUDIT | Good example of issue-tagged audit lineage. |
| `governance/merge-legitimacy/DIRECT_PUSH_AUDIT_REPORT_1604.json` | Audit artifact | Issue #1604 direct push audit | CURRENT_AUDIT | Good issue-tagged lineage; helps contrast missing #1752/#1755 markers. |
| `governance/merge-legitimacy/CLOSURE_RECOMMENDATION.md` | Closure artifact | Merge-legitimacy closure recommendation | CURRENT | Non-operative recommendation artifact. |
| `artifacts/ISSUE_CLOSURE_UMBRELLA_NOTE.md` | Closure artifact | Umbrella closure note | CURRENT | Closure artifact; no runtime effect. |
| `artifacts/DISTRIBUTED_RECONCILIATION_CANON_V1.md` | Canon artifact | Distributed reconciliation canon | CURRENT | Canonical distributed reconciliation artifact. |
| `artifacts/REPLAY_DEATH_BOUNDARY_CANON.md` | Canon artifact | Replay death boundary canon | CURRENT | Canonical replay boundary artifact. |
| `artifacts/TOMBSTONE_PROPAGATION_CANON.md` | Canon artifact | Tombstone propagation canon | CURRENT | Canonical tombstone propagation artifact. |
| `archive/DELETION_REPORT_2026-05-21.md` | Archive artifact | Historical deletion report | ARCHIVAL_CURRENT | Already in archive; no action except index if needed. |
| `archive/session/runtime_ontology_build.log` | Archive/generated log | Session ontology build log | ARCHIVAL_CURRENT | Archive ballast; acceptable if retention required. |
| `archive/session/runtime_ontology_inventory.txt` | Archive/generated inventory | Session ontology inventory | ARCHIVAL_CURRENT | Archive ballast; acceptable if retention required. |
| `MINDSHIFT_REPO_OBJECTS.zip` | Packaged/generated artifact | Repository object bundle | ARCHIVAL_CANDIDATE | Large opaque root artifact; lineage and regeneration path unclear. |
| `ISSUE_1744_ROOT_CAUSE_ANALYSIS.md` | Issue analysis | Issue #1744 root-cause analysis | CURRENT | Root-level issue artifact; could be indexed or relocated to `docs/analysis/`. |
| `PHASE3_CLOSURE_MATRIX.md` | Closure artifact | Phase 3 closure matrix | CURRENT | Root-level closure artifact; may be index candidate. |
| `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | Generated/inventory artifact | Phase 3 execution surface inventory | CURRENT_DERIVATIVE | Root-level inventory overlaps surface registries; lineage should be explicit. |
| `EXECUTION_SURFACES.json` | Root inventory | Execution surface inventory | DUPLICATE_CANDIDATE | Root copy overlaps governance/runtime/surfaces copies. |
| `BYPASS_PATHS.json` | Root inventory | Bypass path inventory | DUPLICATE_CANDIDATE | Root copy overlaps governance/runtime/surfaces copies. |
| `AGENT_BYPASS_INVENTORY.json` | Root inventory/audit | Agent bypass inventory | CURRENT | Root-level audit/inventory; may belong under governance/audit index. |
| `GOVERNANCE_GAP_REGISTRY.md` | Governance registry | Gap registry | CURRENT | Canonical-looking root governance artifact. |
| `GOVERNANCE_REQUIREMENTS.json` | Governance requirements | Governance requirement set | CURRENT | Root governance artifact. |
| `LEGACY_SURFACES.md` | Documentation / legacy index | Legacy surfaces | CURRENT_ARCHIVAL_SIGNAL | Useful for supersession/legacy classification. |
| `PRESERVATION_MANIFEST.md` | Repository manifest | Preservation manifest | CURRENT | High-value index/lineage artifact. |
| `EXECUTION_SURFACE_CLASSIFICATION.md` | Classification artifact | Execution surface classification | CURRENT | Root-level classification artifact; should be cross-linked with runtime surface inventories. |
| `AGENT_TOOL_BOUNDARY_POST_MERGE_VERIFICATION.md` | Verification artifact | Agent tool boundary verification | CURRENT_AUDIT | Post-merge verification; not authority. |
| `conformance/pack-v1/*` | Conformance suite | Conformance pack v1 | CURRENT | Deterministic external/adoption validation artifacts. |
| `conformance/suites/*` | Conformance suites | Suite-level conformance vectors | CURRENT | Deterministic validation evidence. |
| `evidence/latest.json` | Evidence/generated | Latest evidence snapshot | CURRENT_GENERATED | Generated/latest pointer; should be treated as mutable generated evidence, not canon. |
| `telemetry/install_base/*` | Telemetry generated/schema | Install-base telemetry | CURRENT | Observability-only telemetry artifacts. |
| `tools/topology/extract-runtime-topology.ts` | Tooling | Topology extraction tool | CURRENT | Generates/updates topology observations; capability does not imply authority. |
| `scripts/regenerate-governance-artifacts.mjs` | Tooling/generated artifact producer | Governance artifact regeneration | CURRENT_MUTATION_CAPABLE_TOOL | Tool can mutate generated artifacts when run; no execution in this issue. |

## Recent issue lineage candidates

| Issue / concept | Explicit marker status | Best repository-local placement candidate | Confidence | Notes |
|---|---|---|---|---|
| #1752 — Topology Recovery Protocol | No explicit text marker in current artifacts | `docs/protocols/topology-reasoning-protocol-v1.md`, `runtime_topology_inventory.md`, `runtime/topology/*`, `runtime/maps/*` | MEDIUM | Recent git history includes merge PR #1753 from a `session-1752` branch immediately before the topology reasoning protocol commit, so topology recovery lineage is present by adjacency but not by artifact metadata. |
| #1755 — Observation Layer and Cognitive Interface Protocol | No explicit text marker in current artifacts | `docs/observability-index.md`, `docs/observability-boundary-review.md`, `governance/topology/*`, `docs/canon/formal-cognition-lineage-canon-v1.md`, `docs/analysis/cognition-governance-closure-canon.md` | MEDIUM_LOW | Observation and cognition-interface concepts are present, but no single artifact declares #1755 or CIP terminology. |
| `Topology Recovery ⊂ Observation` | Not stated as a single index relation | Observation specs contain topology observation objects/emission/evidence precedence; topology reasoning is non-authoritative | MEDIUM | Semantically preserved, but navigation and issue lineage need annotation. |

## Duplicate candidates

| Duplicate family | Candidate artifacts | Closure note |
|---|---|---|
| Execution surfaces | `EXECUTION_SURFACES.json`, `governance/execution_surfaces.json`, `governance/runtime/EXECUTION_SURFACES.json`, `runtime/execution_surfaces.json`, `runtime/surfaces/EXECUTION_SURFACES.json`, validation-bundle copy | Declare one canonical source and mark other copies as generated, legacy, or governance-scope projections. |
| Bypass paths | `BYPASS_PATHS.json`, `governance/runtime/BYPASS_PATHS.json`, `runtime/bypass_paths.json`, `runtime/surfaces/BYPASS_PATHS.json`, validation-bundle copy | Declare canonical source and derivative copies. |
| Root authority inventories/rules | `governance/ROOT_AUTHORITY_INVENTORY.json`, `runtime/sovereignty/root_authority_inventory.json`, `governance/ROOT_AUTHORITY_CONTAINMENT_RULES.json`, `runtime/sovereignty/root_authority_containment_rules.json` | Preserve both domains if governance-vs-runtime distinction is real; otherwise annotate source-of-truth. |
| Schema copies | Root `schemas/*`, runtime `runtime/legitimacy/schemas/*`, governance PREO schema, namespace schemas | Add source lineage comments/docs; do not change schemas in this issue. |
| Invariant registry docs | `docs/invariant-registry.md`, `docs/governance/invariant-registry.md` | Clarify whether root is canonical and governance copy is scoped, or vice versa. |
| Cross-registry reconciliation names | `governance/cross_registry_reconciliation.json`, `governance/cross-registry-reconciliation.json` | Naming duplicate; canonical spelling unresolved. |
| Execution-surface map docs | `docs/topology/execution-surface-map.md`, `docs/topology/execution-surface-map.mmd`, `governance/runtime/EXECUTION_SURFACE_MAP.json` | Likely Markdown + Mermaid + JSON projection; add explicit projection relation. |

## Superseded / archival candidates

| Artifact | Classification | Rationale |
|---|---|---|
| `governance/topology/RUNTIME_TOPOLOGY_INTELLIGENCE_PLANNING_SPEC.json` | SUPERSEDED/LINEAGE | Planning artifact appears upstream of #1641 classified observation and emission/evidence precedence specs. |
| `docs/analysis/*-analysis.md` date/frontier documents | ARCHIVAL_CANDIDATE after indexing | Many are discovery artifacts now partially formalized by canon/closure docs. Preserve as lineage, but index by phase. |
| `MINDSHIFT_REPO_OBJECTS.zip` | ARCHIVAL_CANDIDATE | Opaque root bundle with unclear generator/retention status. |
| `archive/session/*` | ARCHIVAL_CURRENT | Already archived; retain only if useful for provenance. |
| Root-level phase inventories (`PHASE3_*`, root `EXECUTION_SURFACES.json`, root `BYPASS_PATHS.json`) | AMBIGUOUS / DUPLICATE_CANDIDATE | Root placement and relation to runtime/governance copies is unresolved. |

## Orphaned / stale references

| Artifact | Finding | Notes |
|---|---|---|
| `docs/observability-index.md` | Stale internal links | Links to four missing docs: passive legitimacy observability layer, install-base telemetry, install-base compression, issue-853 issue graph cleanup. |
| Issue #1752 Topology Recovery Protocol | Unresolved explicit artifact marker | No explicit repository text marker found; git-history adjacency points to `docs/protocols/topology-reasoning-protocol-v1.md` and related topology inventory/runtime topology artifacts as placement candidates. |
| Issue #1755 Observation Layer + Cognitive Interface Protocol | Unresolved explicit artifact marker | No explicit repository text marker found; related observation/CIP concepts appear distributed across observability index, classified observation specs, and cognition canon docs. |
| `runtime-topology.json` | Generator ambiguity | Topology artifact exists at root but generator/relationship to `graph/runtime-topology.sample.json` is not declared in nearby docs. |
| Validation bundle copies | Generated lineage ambiguity | Bundle copies are likely generated derivatives; root source and regeneration command should be indexed. |

## Topology classification consistency notes

- Observation-layer artifacts are consistently non-authoritative where explicit (`docs/observability-index.md`, `runtime_topology_inventory.md`, `governance/topology/*`).
- Duplicate inventories are the main coherence risk: identical domain labels appear across root, governance, runtime, runtime/surfaces, and validation-bundle paths.
- Recent issue labels #1752 and #1755 are not visible in artifact names or contents, which makes lineage ambiguous even if the concepts are represented.
