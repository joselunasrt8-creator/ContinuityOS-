# Issue #1609 — Drift Analysis

**Artifact type:** `OBSERVATIONAL_ARTIFACT`
**Mode:** repository lightweight closure / drift classification
**Runtime effect:** none
**Legitimacy-state effect:** none

## Classification vocabulary

- `CURRENT` — artifact appears aligned with current repository topology and has a plausible active role.
- `SUPERSEDED` — artifact appears upstream of a more formal/canonical artifact.
- `DUPLICATE` — artifact overlaps another artifact with unclear canonical source or copy status.
- `ARCHIVAL_CANDIDATE` — artifact should likely remain available as history, but not be treated as current canon without an index.
- `AMBIGUOUS` — artifact role, lineage, generator, or canonical relation is unclear from repository evidence.

## Evidence and confidence model

| Evidence class | Meaning | Confidence impact |
|---|---|---|
| Explicit artifact marker | Issue number or protocol name appears in file content or filename | High |
| Canonical status declaration | Artifact declares non-operative/canonical/current role | High for classification, not authority |
| Git-history adjacency | Recent merge/branch/commit lineage indicates issue relation | Medium; useful for placement candidates only |
| Filename family overlap | Similar basename across directories | Medium for duplicate candidates, low for semantic equivalence |
| Missing link / missing file | Index points to absent target | High for navigation drift |

## Drift summary

| Drift class | Summary |
|---|---|
| Canonical topology drift | Runtime topology has several canonical-looking locations: `runtime/topology/*`, `runtime/maps/*`, `docs/topology/*`, root `runtime-topology.json`, and `graph/runtime-topology.sample.json`. The distinction between canon, projection, and generated sample is not uniformly declared. |
| Observation lineage drift | Classified observation object, emission rules, and evidence precedence are strong formal artifacts, but issue #1755 naming is absent; observation layer and cognitive interface lineage must be inferred. |
| Recovery lineage drift | No explicit #1752 Topology Recovery Protocol text marker was found; git-history adjacency and recent topology reasoning artifacts make `docs/protocols/topology-reasoning-protocol-v1.md` the strongest placement candidate. |
| Duplicate inventory drift | Execution surface and bypass-path inventories have multiple root/governance/runtime/generated copies. |
| Schema lineage drift | AEO/ATAO/PREO/SCO/Authority schemas exist in root/runtime/governance/namespace variants without a single visible source-of-truth index. |
| Documentation index drift | `docs/observability-index.md` contains stale links to missing observability/install-base docs. |
| Root ballast drift | Several root-level inventories/phase artifacts look active but are not placed in docs/governance/runtime topology namespaces. |

## Exploratory → canonical → current structure comparison

| Artifact / family | Exploratory artifacts | Canonical artifacts | Current repository structure | Classification | Drift finding |
|---|---|---|---|---|---|
| Runtime topology recovery | `runtime_topology_inventory.md`, `docs/protocols/topology-reasoning-protocol-v1.md`, `docs/analysis/topology-aware-closure-sequencing.md` | `runtime/topology/*`, `runtime/maps/*` | Spread across root docs, docs protocols, runtime metadata, graph sample | AMBIGUOUS | Topology recovery exists conceptually; #1752 lineage is supported by git-history adjacency, but explicit artifact metadata is missing. |
| Observation layer | `docs/observability-index.md`, `docs/observability-boundary-review.md` | `governance/topology/CLASSIFIED_OBSERVATION_OBJECT_SPEC.json`, `TOPOLOGY_OBSERVATION_EMISSION_RULES_SPEC.json`, `TOPOLOGY_EVIDENCE_PRECEDENCE_SPEC.json` | Docs index + governance specs + schema | CURRENT | Formal observation separation is strong; stale docs index links create navigation drift. |
| Cognitive interface protocol | `docs/analysis/cognition-governance-frontier-analysis.md`, distributed cognitive assessment | `docs/canon/formal-cognition-lineage-canon-v1.md`, `docs/analysis/cognition-governance-closure-canon.md` | Analysis/canon docs; no direct CIP-named artifact | AMBIGUOUS | Cognitive interface lineage can be inferred from cognition canon, but #1755/CIP label is absent. |
| Classified observation object | `governance/topology/RUNTIME_TOPOLOGY_INTELLIGENCE_PLANNING_SPEC.json` | `governance/topology/CLASSIFIED_OBSERVATION_OBJECT_SPEC.json`, `schemas/classified-observation-object.schema.json` | Governance spec + schema + tests | CURRENT | Planning artifact is likely superseded lineage, not current endpoint. |
| Topology observation emission | Planning references from runtime topology intelligence | `governance/topology/TOPOLOGY_OBSERVATION_EMISSION_RULES_SPEC.json` | Governance spec | CURRENT | Clear non-operative/topology-visible observation rules. |
| Evidence precedence | Planning/reconciliation concepts | `governance/topology/TOPOLOGY_EVIDENCE_PRECEDENCE_SPEC.json` | Governance spec | CURRENT | Correctly prevents raw observation from overriding registry state. |
| Runtime maps | `docs/governance/runtime-topology-map.md`, `docs/topology/*` | `runtime/maps/CANONICAL_RUNTIME_MAP.md`, `runtime/maps/EXECUTION_FLOW.md`, `runtime/maps/CONTINUITY_LINEAGE_MAP.md`, `runtime/maps/RECONCILIATION_GRAPH.md` | Runtime maps + docs projections | CURRENT | Add index relation: runtime maps canonical, docs maps derivative. |
| Graph topology sample | `runtime_topology_inventory.md` | Unknown source-of-truth; generated by topology extractor | `graph/runtime-topology.sample.json`, root `runtime-topology.json` | AMBIGUOUS | Generator and recency relation unclear. |
| Execution surface inventories | Root and phase inventories | `runtime/surfaces/EXECUTION_SURFACES.json` or `governance/runtime/EXECUTION_SURFACES.json` candidate | Five duplicate-ish files plus validation-bundle copy | DUPLICATE | Canonical source not declared. |
| Bypass path inventories | Root and governance inventories | `runtime/surfaces/BYPASS_PATHS.json` or `governance/runtime/BYPASS_PATHS.json` candidate | Four duplicate-ish files plus validation-bundle copy | DUPLICATE | Canonical source not declared. |
| Root authority inventories | Root governance copies | Runtime sovereignty namespace likely operational topology | `governance/ROOT_AUTHORITY_INVENTORY.json`, `runtime/sovereignty/root_authority_inventory.json` | DUPLICATE | Governance-vs-runtime projection relation should be explicit. |
| Schema families | Early root schemas | Runtime and namespace copies | Root `schemas/*`, `runtime/legitimacy/schemas/*`, namespace v1 copies, governance PREO | DUPLICATE | Source and projection semantics unclear; do not mutate schemas in closure issue. |
| Merge legitimacy audit | N/A | `governance/merge-legitimacy/*` | Dense audit and closure artifact directory | CURRENT | Good issue-lineage model, especially #1604-tagged artifacts. |
| Closure umbrella artifacts | Root/distributed canon docs | `artifacts/*` and `docs/canon/*` | `artifacts/`, `docs/canon/`, `docs/analysis/` | CURRENT | Could benefit from a closure index but not semantically drifting. |
| Archive session logs | Historical generated logs | None active | `archive/session/*` | ARCHIVAL_CANDIDATE | Already isolated; no action except retention/index decision. |
| Root zip bundle | Opaque package | None visible | `MINDSHIFT_REPO_OBJECTS.zip` | ARCHIVAL_CANDIDATE | Opaque generated ballast; retain only with provenance or move/archive. |
| Observability index | Navigation artifact | Itself canonical nav layer | `docs/observability-index.md` | CURRENT_WITH_DRIFT | Stale links indicate documentation topology drift. |
| Phase 3 root artifacts | Phase closure/inventory | Some concepts formalized under runtime/governance | `PHASE3_CLOSURE_MATRIX.md`, `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | AMBIGUOUS | Root placement obscures whether they are current canon, generated inventory, or historical closure evidence. |

## Stale topology references

| Reference | Classification | Impact | Non-operative remediation |
|---|---|---|---|
| `docs/observability-index.md` links to missing observability/install-base documents | CURRENT_WITH_STALE_LINKS | Navigation drift; no runtime impact | Either restore missing docs, remove links, or mark as planned/missing in an index update. |
| #1752 Topology Recovery Protocol absent as explicit artifact marker | AMBIGUOUS | Lineage drift for recent topology recovery work | Add lineage annotation/index row mapping #1752 to existing topology files. |
| #1755 Observation Layer + CIP absent as explicit artifact marker | AMBIGUOUS | Lineage drift for observation/CIP work | Add lineage annotation/index row mapping #1755 to observation and cognition-interface artifacts. |
| Root `runtime-topology.json` vs `graph/runtime-topology.sample.json` | AMBIGUOUS | Generated topology recency/source ambiguity | Add generator/source/derivative labels. |
| Duplicate execution and bypass inventories | DUPLICATE | Readers may not know which inventory is canonical | Add source-of-truth and generated-copy metadata. |

## Closure-quality gaps after review hardening

| Gap | Classification | Why it remains non-operative |
|---|---|---|
| #1752 lacks explicit artifact metadata | AMBIGUOUS | Adding metadata would be a future docs/index slice, not a runtime change. |
| #1755/CIP lacks explicit artifact metadata | AMBIGUOUS | Concepts are present; naming bridge would be documentation-only. |
| Duplicate inventory canonical source is undeclared | DUPLICATE | Declaring source-of-truth should be an index/reclassification action, not JSON mutation. |
| Observability index has missing targets | CURRENT_WITH_STALE_LINKS | Link repair should not create authority or execution effects. |
| Generated topology and validation bundle outputs lack source labels | AMBIGUOUS | Labeling generated artifacts improves lineage but does not regenerate outputs. |

## Preservation of foundational separations

| Separation | Drift result |
|---|---|
| Observation ≠ Authority | Preserved in explicit observation/topology specs; at risk only when issue lineage is implicit. |
| Classification ≠ Enforcement | Preserved; classification docs/specs do not appear to mutate enforcement. |
| Proposal ≠ Authority | Preserved; planning/canon docs are non-operative. |
| Capability ≠ Permission | Preserved; tools/scripts capable of generating artifacts are not treated as permission surfaces. |
| Understanding ≠ Correction | Preserved; this drift analysis recommends only indexing/reclassification. |
