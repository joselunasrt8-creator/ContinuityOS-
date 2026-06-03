# Closure Audit — Issue #1625: Runtime Topology Intelligence Visualizer

**Audit date:** 2026-06-03
**Branch:** `claude/issue-1625-closure-audit-7VRM6`
**Issue state:** OPEN · labels: `governance`, `audit`, `neo4j`, `topology`, `phase-2`, `runtime-intelligence`, `visualizer`, `closure-partial`
**Determination:** `CLOSURE_PARTIAL`

---

## 1. Acceptance Criteria Matrix

The issue defines eight explicit Success Criteria (SC-1 through SC-8).

| ID   | Criterion (verbatim from issue)                                                        | Finding     |
|------|----------------------------------------------------------------------------------------|-------------|
| SC-1 | Initial repo scanner produces graph-ready topology data                                | IMPLEMENTED |
| SC-2 | Mutation-capable surfaces are listed                                                   | IMPLEMENTED |
| SC-3 | Runtime routes and workflows are mapped                                                | IMPLEMENTED |
| SC-4 | Authority / validation / execution / proof relationships are visible where present     | IMPLEMENTED |
| SC-5 | Closure-state classification exists even if many surfaces remain UNKNOWN               | PARTIAL     |
| SC-6 | Visualizer displays graph nodes and edges without implying legitimacy certainty        | MISSING     |
| SC-7 | Observability remains non-authoritative                                                | IMPLEMENTED |
| SC-8 | No execution or validation behavior is introduced by this issue                        | IMPLEMENTED |

---

## 2. Evidence Matrix

### SC-1 — Repo scanner produces graph-ready topology data

| Artifact | Role | Evidence class |
|---|---|---|
| `scripts/extract_repo_graph.py` | Python scanner: walks repo, emits `{nodes, edges, metadata}` JSON | IMPLEMENTED |
| `ingest_repo_graph.py` (root) | Alternate ingestion entry-point | IMPLEMENTED |
| `graph/runtime-topology-extractor.ts` | TypeScript extractor: classifies every file in src/runtime/graph/docs/tests/.github/workflows as a typed RuntimeNode with closure_status, artifact_role, risk_scope, production_closure_relevant | IMPLEMENTED |
| `scripts/ingest_neo4j.py` | Reads graph JSON, validates `mode=observability_only` and `runtime_authority=false`, ingests nodes+edges into Neo4j via MERGE | IMPLEMENTED |
| `tests/runtime-topology-extractor.test.mjs` | 7 test cases covering schema shape, classification coverage, closure status, artifact roles, risk scopes, replay semantics, workflow detection | IMPLEMENTED |
| `graph/runtime-topology.schema.json` | JSON Schema for extractor output | IMPLEMENTED |
| `graph/runtime-topology.sample.json` | Generated sample with full node structure | IMPLEMENTED |

### SC-2 — Mutation-capable surfaces are listed

| Artifact | Role | Evidence class |
|---|---|---|
| `governance/runtime/EXECUTION_SURFACE_MAP.json` | 42 classified surfaces; `mutation_capable_surfaces: 35`, `open_surfaces: 11`, `closed_surfaces: 6`, `high_risk_surfaces: 7` | IMPLEMENTED |
| `src/runtime-topology-intelligence.ts` | `mutation_surface_inventory: readonly string[]` output field; populated by scanning `MUTATION_CAPABLE` capability flag | IMPLEMENTED |
| `graph/runtime-topology-extractor.ts` | `mutation_capable` boolean per node derived from POST/PUT/PATCH/DELETE/mutate/execute/deploy patterns | IMPLEMENTED |
| `governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json` | Full registry-level mutation surface inventory | IMPLEMENTED |

### SC-3 — Runtime routes and workflows are mapped

| Artifact | Role | Evidence class |
|---|---|---|
| `scripts/extract_repo_graph.py` | Extracts canonical routes (`/session`, `/authority`, `/compile`, `/validate`, `/execute`, `/proof`, `/continuity`) as `RuntimeRoute` nodes; emits `Workflow` labels for all `.github/workflows/*` files | IMPLEMENTED |
| `governance/runtime/EXECUTION_SURFACE_MAP.json` | Workflow surfaces explicitly catalogued: governed-deploy, prepare-governed-deploy, constitutional-integrity, merge-governance-check, preo-candidate, sco-candidate | IMPLEMENTED |
| `graph/runtime-topology.cypher` queries 3 & 5 | Cypher: `DECLARES`-typed RuntimeRoute traversals; `CONTAINS`-typed Workflow topology | IMPLEMENTED |
| `graph/runtime-topology-extractor.ts` | `.github/workflows/` → `artifact_role='workflow'`, `risk_scope='ci_workflow'`; all target roots walked | IMPLEMENTED |

### SC-4 — Authority / validation / execution / proof relationships visible

| Artifact | Role | Evidence class |
|---|---|---|
| `governance/runtime/NEO4J_RUNTIME_TOPOLOGY_MODEL.json` | 17 relationship types with authoritative source, inspection-only semantics: AUTHORIZES, COMPILES_TO, VALIDATES, EXECUTES, PROVES, CONTINUES, REPLAYS, DEPLOYS, MUTATES, OBSERVES, RECONCILES, DEPENDS_ON, BINDS_TO, REFERENCES, DERIVES_FROM, FAILS_CLOSED_AS, HAS_BOUNDARY | IMPLEMENTED |
| `src/runtime-topology-intelligence.ts` | Emits `authority_lineage_graph`, `continuity_lineage_graph`, `replay_dependency_graph`, `revocation_dependency_graph`, `reconciliation_dependency_graph`, `causal_ordering_graph`, `proof_continuity_graph` — each as sorted edge-label arrays with SHA-256 hashes | IMPLEMENTED |
| `scripts/extract_repo_graph.py` | REFERENCES edges from file nodes to Authority, AEO, Validation, Execution, Proof, Registry, Reconciliation, BypassPath keyword-matched primitives | IMPLEMENTED |
| `graph/legitimacy-traversals.cypher` | Read-only authority→proof full lineage traversal queries | IMPLEMENTED |
| `graph/dashboard/legitimacy_topology_visualization.cypher` | 10 Cypher queries: canonical chain, governance dependency, drift map, replay topology, proof topology, closure map, install-base traversal | IMPLEMENTED |
| `docs/topology/neo4j-runtime-topology.md` | Node + relationship taxonomy documentation aligned to JSON model | IMPLEMENTED |
| `tests/issue-1160-runtime-topology-intelligence.test.mjs` | 5 test cases verifying all edge graphs emit deterministically, graph hashing, NULL fail-close, hidden/unknown surface detection | IMPLEMENTED |

### SC-5 — Closure-state classification exists even if many surfaces remain UNKNOWN

| Artifact | Role | Evidence class |
|---|---|---|
| `graph/runtime-topology-extractor.ts` `classifyClosure()` | Classifies every node as: OPEN, PARTIAL, CONTAINED, CLOSED, BREAK_GLASS | PARTIAL |
| `src/runtime-topology-intelligence.ts` `RUNTIME_SURFACE_CLASSIFICATIONS` | Surface capability flags include: UNKNOWN_SURFACE, OBSERVABILITY_ONLY, TOPOLOGY_DRIFT, NULL | PARTIAL |
| `governance/runtime/EXECUTION_SURFACE_MAP.json` | Per-surface closure_status: OPEN, MONITORED, CLOSED | PARTIAL |
| `governance/runtime/EXECUTION_SURFACE_CLOSURE_REGISTRY.json` | Closure registry with canonical chain | PARTIAL |

**Gap:** The issue defines 7 closure states: OPEN, PARTIAL, CONTAINED, CLOSED, UNKNOWN, BREAK_GLASS, OBSERVABILITY_ONLY. The extractor implements 5 (OPEN/PARTIAL/CONTAINED/CLOSED/BREAK_GLASS — missing UNKNOWN and OBSERVABILITY_ONLY as explicit closure state assignments). The surface map uses MONITORED (not in the issue spec). The intelligence module tracks UNKNOWN_SURFACE as a surface capability flag rather than as a closure state category. Classification coverage exists but does not exactly match the issue-defined taxonomy.

### SC-6 — Visualizer displays graph nodes and edges without implying legitimacy certainty

| Artifact | Role | Evidence class |
|---|---|---|
| No React component | Zero `.tsx` or `.jsx` files exist in the repository | MISSING |
| No browser-facing rendering | No neovis.js, cytoscape, d3, vis-network, or sigma.js dependency | MISSING |
| `src/install-base-dependency-dashboard.ts` | TypeScript data aggregator (Issue #1425) — produces a snapshot data object, **not a visual component** | AMBIGUOUS |
| `src/distributed-topology-visualization-projection.ts` | TypeScript projection layer (Issue #1054) — produces `{nodes, edges, metrics}` data structures, **not a visual component** | AMBIGUOUS |
| `runtime/visualization/runtime_visualization_index.json` | Index of visualization layers — declares intent but no rendering code | AMBIGUOUS |
| `graph/runtime-topology.sample.json` | Generated node/edge data ready to be consumed by a visualizer | IMPLEMENTED (data only) |

**Finding:** All backend graph data structures, extractor pipelines, Neo4j ingestion, and Cypher traversal queries needed to feed a visualizer are present and tested. The browser-facing rendering layer — the React component named in the issue title and the "React for visualizer UI" stack item — is **entirely absent**.

### SC-7 — Observability remains non-authoritative

| Artifact | Role | Evidence class |
|---|---|---|
| `src/runtime-topology-intelligence.ts` | `creates_authority: false`, `mutates_state: false`, `validates_execution: false` enforced as literal `false` constants on every result | IMPLEMENTED |
| `scripts/ingest_neo4j.py` | `validate_graph()` raises `SystemExit` if `mode != 'observability_only'` or `runtime_authority != false` | IMPLEMENTED |
| `scripts/extract_repo_graph.py` | Boundary comment + metadata fields: `runtime_authority: false`, `network_calls: false`, `runtime_mutation: false`, `canonical_boundary: "visibility != authority"` | IMPLEMENTED |
| `governance/runtime/NEO4J_RUNTIME_TOPOLOGY_MODEL.json` | Every node type: `neo4j_authoritative: false`, `mutation_capable: false`, `execution_capable: false`, `inspection_only: true` | IMPLEMENTED |
| `governance/topology/RUNTIME_TOPOLOGY_INTELLIGENCE_PLANNING_SPEC.json` | Explicit `topology_intelligence_may_not` list: create validity/authority, produce reconciliation closure, determine execution eligibility, decide legitimacy, mutate registry, trigger reconciliation, authorize execution | IMPLEMENTED |
| `graph/runtime-topology.cypher` query 13 | Observability boundary audit: `WHERE n.runtime_authority <> false OR n.mode <> 'observability_only'` — expected result: no records | IMPLEMENTED |

### SC-8 — No execution or validation behavior introduced

| Artifact | Role | Evidence class |
|---|---|---|
| `scripts/extract_repo_graph.py` | Header boundary: "no network calls / no runtime execution / no authority creation / no validation decision / no proof generation / no registry mutation" | IMPLEMENTED |
| `src/runtime-topology-intelligence.ts` | Pure function, no side effects, no I/O, no registry writes | IMPLEMENTED |
| `graph/runtime-topology-extractor.ts` | Read-only `fs.readFileSync` only; `writeFileSync` only for sample generation (`--main` guard) | IMPLEMENTED |
| `scripts/ingest_neo4j.py` | Neo4j state is observability state only; `MERGE` semantics, no delete or authority mutation | IMPLEMENTED |

---

## 3. Supplemental Stack Coverage

The issue listed a suggested stack. Coverage by element:

| Stack item | Status | Evidence |
|---|---|---|
| Neo4j for topology graph storage | IMPLEMENTED | `NEO4J_RUNTIME_TOPOLOGY_MODEL.json`, `ingest_neo4j.py`, `runtime-topology.cypher`, 5 Cypher files |
| **React for visualizer UI** | **MISSING** | No `.tsx`/`.jsx` files; no React dependency anywhere in repo |
| TypeScript/Python ingestion pipeline | IMPLEMENTED | `runtime-topology-extractor.ts`, `extract_repo_graph.py`, `ingest_neo4j.py` |
| GitHub repo scanner for source extraction | IMPLEMENTED | `scripts/extract_repo_graph.py` |
| Cypher query layer for graph traversal | IMPLEMENTED | `graph/runtime-topology.cypher`, `graph/legitimacy-traversals.cypher`, `graph/dashboard/legitimacy_topology_visualization.cypher` |
| Existing runtime schemas as node/edge references | IMPLEMENTED | `governance/runtime/NEO4J_RUNTIME_TOPOLOGY_MODEL.json` |

### Required Node Type Coverage

| Node type (from issue) | Status | Implementation artifact |
|---|---|---|
| Repository | IMPLEMENTED | `scripts/extract_repo_graph.py`, Neo4j model |
| File | IMPLEMENTED | `scripts/extract_repo_graph.py` |
| Workflow | IMPLEMENTED | `scripts/extract_repo_graph.py`, EXECUTION_SURFACE_MAP |
| Runtime Route | IMPLEMENTED | `scripts/extract_repo_graph.py` (`RuntimeRoute`) |
| Execution Surface | IMPLEMENTED | `EXECUTION_SURFACE_MAP.json`, extractor (`ExecutionSurface` label) |
| Authority | IMPLEMENTED | Neo4j model, extractor keyword class |
| ATAO | IMPLEMENTED | Neo4j model, extractor keyword class |
| AEO | IMPLEMENTED | Neo4j model, extractor keyword class |
| Validator | IMPLEMENTED | Neo4j model, extractor keyword class (`Validation`) |
| Proof | IMPLEMENTED | Neo4j model, extractor (`ProofSurface`, `Proof`) |
| Registry | IMPLEMENTED | Neo4j model, extractor (`RegistrySurface`) |
| Replay Boundary | PARTIAL | Neo4j model has `Replay` + `TopologyBoundary` separately; no merged "Replay Boundary" node |
| Closure State | PARTIAL | Closure is a property on Surface nodes, not a standalone node type |
| Reconciliation Edge | PARTIAL | Reconciliation is an edge type; not modeled as a node |

### Required Edge Type Coverage

| Edge type (from issue) | Status | Implementation artifact |
|---|---|---|
| imports | MISSING | Not present in any extractor or Cypher file |
| calls | IMPLEMENTED | `CALLS` relation in `runtime-topology-extractor.ts` |
| validates | IMPLEMENTED | `VALIDATES` in Neo4j model and extractor |
| authorizes | IMPLEMENTED | `AUTHORIZES` in Neo4j model |
| compiles_to | IMPLEMENTED | `COMPILES_TO` in Neo4j model |
| executes | IMPLEMENTED | `EXECUTES` in Neo4j model |
| emits_proof | PARTIAL | `PRODUCES_PROOF` in extractor; `EXECUTES` → Proof in Neo4j model |
| persists_to | MISSING | `MUTATES` is the closest approximation |
| replays_against | MISSING | `REPLAYS` exists in Neo4j model but is differently named |
| reconciles_with | IMPLEMENTED | `RECONCILES_WITH` in extractor; `RECONCILES` in Neo4j model |
| depends_on | IMPLEMENTED | `DEPENDS_ON` in Neo4j model; `DEPENDS_ON_AUTHORITY` / `DEPENDS_ON_CONTINUITY` in extractor |
| bypass_risk | MISSING | Bypass paths are observed (`OBSERVES` edge to repo) but no `bypass_risk` edge type |

---

## 4. Open Gap Inventory

| Gap ID | Gap description | Severity |
|---|---|---|
| GAP-1 | **React UI visualizer absent.** The browser-facing rendering component named in the issue title and stack does not exist. No `.tsx`/`.jsx` files, no React dependency, no neovis.js/cytoscape/sigma.js integration. | CRITICAL (blocks SC-6) |
| GAP-2 | **Closure state taxonomy partial match.** Issue defines 7 states (OPEN, PARTIAL, CONTAINED, CLOSED, UNKNOWN, BREAK_GLASS, OBSERVABILITY_ONLY). Extractor implements 5; UNKNOWN and OBSERVABILITY_ONLY are surface capability flags not closure states; surface map uses MONITORED (not in spec). | MODERATE (blocks SC-5 full) |
| GAP-3 | **Missing edge types: `imports`, `persists_to`, `replays_against`, `bypass_risk`.** Four of the twelve required edge types are unimplemented in the graph extractor. | LOW (SC-4 partially covered by other edges) |
| GAP-4 | **`Replay Boundary`, `Closure State`, `Reconciliation Edge` not modeled as discrete node types.** The Neo4j model uses component nodes separately (Replay + TopologyBoundary) or treats these as properties/edges. | LOW (compensating structure present) |

---

## 5. Closure Determination

```
CLOSURE_PARTIAL
```

**Rationale:**

The backend intelligence layer for issue #1625 is substantively complete:

- Repo scanner (`extract_repo_graph.py`) is fully implemented and tested, producing deterministic graph-ready JSON.
- Mutation-capable surface listing is implemented at two layers: the TypeScript intelligence module and the JSON surface map.
- Runtime routes and workflows are mapped via glob scan, route extraction, and Cypher queries.
- Authority/validation/execution/proof relationships are modeled in the Neo4j taxonomy (17 relationship types), implemented in the TypeScript intelligence module (8 graph output fields), and traversable via 10+ Cypher queries.
- The non-authoritative boundary invariant (`visibility ≠ authority`, `observation ≠ validation`, `evidence_only: true`) is uniformly enforced in every artifact.
- No execution or validation behavior was introduced.

The issue title names a **Visualizer** and the suggested stack lists **React for visualizer UI**. This layer is entirely absent. All graph data is machine-readable JSON; no browser-facing component consumes or renders it. SC-6 ("Visualizer displays graph nodes and edges") cannot be evaluated as IMPLEMENTED.

The issue already carries the `closure-partial` label, consistent with this determination.

---

## 6. Minimal Implementation Wedge Required for Closure

To promote this issue from `CLOSURE_PARTIAL` to `CLOSED`, a single bounded deliverable is required:

**A read-only, evidence-only React graph visualizer component.**

### Minimum viable scope

1. **Input:** Read `graph/repo_graph.json` (output of `scripts/extract_repo_graph.py`) — already exists.
2. **Rendering:** Display nodes (by label/type) and edges (by type) as a static graph. Acceptable libraries: neovis.js (Neo4j native), sigma.js, cytoscape.js, or react-flow.
3. **Invariant preservation:** Node tooltips/labels must not assert legitimacy (no "VALID", "AUTHORIZED", "PROOF_CONFIRMED"). Node state should display raw `closure_status` or `mode` fields only.
4. **Non-authoritative boundary:** Component must be `evidence_only`, read-only, and must not trigger any write, workflow, or registry mutation.
5. **Suggested location:** `src/visualizer/TopologyGraph.tsx` or `src/visualizer/index.tsx`.

### What must NOT be built for closure

- No runtime execution path through the visualizer.
- No authority creation from graph selection.
- No proof generation triggered by node inspection.
- No registry mutation from any UI action.
- No claim of topology convergence in the UI.

### Suggested bounded implementation issue

> **"[Visualizer] Runtime Topology Graph React Component (SC-6 completion for #1625)"**
> Scope: Implement a minimal React component that reads `graph/repo_graph.json` and renders topology nodes and edges using an evidence-only, non-authoritative graph library. Enforce `evidence_only` display semantics. No runtime mutation. Closes SC-6 of #1625.

---

## Appendix: Linked Issues and PRs

- No sub-issues linked from #1625 (verified via API).
- No PRs explicitly referencing #1625 found.
- Related closed issue: #1508 (Expand Bypass Path Registry — feeds the bypass surface inventory consumed by this visualizer).
- Related planning: `governance/topology/RUNTIME_TOPOLOGY_INTELLIGENCE_PLANNING_SPEC.json` references child issues #1641, #1642, #1644 (observation metadata schema, emission trigger model, evidence precedence hierarchy — not yet searched for in this audit).

---

*Audit produced by: Repository Research and Closure Agent*
*Evidence source: repository-only, no inference of runtime behavior*
