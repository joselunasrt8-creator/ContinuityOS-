# MindShift Control Graph Taxonomy

Status: Non-Operative  
Layer: Cognition → Topology → Governance Visualization → Reconciliation Planning

## Purpose

Define the first canonical taxonomy for the MindShift Control Graph.

The Control Graph is an observability and planning artifact. It does not create authority, validate runtime objects, execute actions, generate proof, or mutate registry state.

Core invariant:

```text
If no valid object exists
→ nothing happens
```

## Control Graph Position

The Control Graph maps the legitimacy topology around the canonical runtime chain:

```text
Session
→ Continuity
→ Authority
→ ATAO
→ AEO
→ Validation
→ Execution
→ Proof
→ Registry
→ Reconciliation
```

Its role is to make legitimacy lineage visible, traversable, and queryable.

## Non-Operative Boundary

The graph may observe:

- runtime topology
- authority lineage
- proof lineage
- replay surfaces
- continuity ancestry
- reconciliation integrity
- bypass-capable paths
- governance gaps

The graph must not:

- create authority
- validate AEOs
- execute runtime actions
- produce Proof-of-Transfer
- mutate canonical registries
- imply runtime state changed

All state-changing action remains bound to:

```text
Authority
→ ATAO
→ AEO
→ Ω Validator
→ Execution Boundary
→ Proof
→ Registry
```

## Node Taxonomy

Initial node classes:

| Node | Purpose |
|---|---|
| `Session` | Captures initiating user/agent session context. |
| `Continuity` | Represents lineage continuity and ancestry binding. |
| `Authority` | Represents permission source and scope. |
| `ATAO` | Represents pre-execution proposed tool/action object. |
| `AEO` | Represents exact executable object. |
| `Validation` | Represents VALID/NULL decision evidence. |
| `Execution` | Represents attempted or completed boundary-routed execution. |
| `Proof` | Represents proof artifact or receipt. |
| `Registry` | Represents persistence surface for legitimacy records. |
| `Reconciliation` | Represents integrity traversal/checkpoint result. |
| `ExecutionSurface` | Represents surface capable of changing state. |
| `BypassPath` | Represents potential path around canonical validation. |
| `Tool` | Represents AI/tooling/capability component. |
| `Workflow` | Represents GitHub Actions or other workflow surface. |
| `RuntimeRoute` | Represents route or endpoint surface. |
| `GovernanceObject` | Represents PREO, SCO, policy, schema, or governance artifact. |

## Edge Taxonomy

Initial edge classes:

| Edge | Meaning |
|---|---|
| `INITIATES` | Session or actor begins a proposed action. |
| `BINDS_TO` | Object binds to continuity, session, or authority. |
| `AUTHORIZES` | Authority authorizes a scoped object/action. |
| `COMPILES_TO` | ATAO/authority compiles into exact AEO. |
| `VALIDATES` | Validator result applies to exact AEO. |
| `EXECUTES_THROUGH` | Execution passes through governed boundary/surface. |
| `PRODUCES_PROOF` | Execution produces proof. |
| `PERSISTS_TO` | Object/result is persisted in registry. |
| `RECONCILES_WITH` | Object lineage reconciles with another registry/snapshot. |
| `DEPENDS_ON` | Object depends on another object or surface. |
| `BYPASSES` | Path can avoid canonical legitimacy chain. |
| `DERIVES_FROM` | Object derives from prior lineage or source. |
| `REVOKES` | Authority/session/continuity revokes downstream legitimacy. |
| `OBSERVES` | Observability object observes runtime state without authority. |

## Initial Ingestion Sources

Start with static repo topology before live runtime ingestion.

Initial source targets:

```text
.github/workflows/*
src/index.ts
src/routes/*
src/lib/canonicalize.ts
src/lib/policy.ts
tests/*.mjs
tests/fate/*.mjs
EXECUTION_SURFACES.json
BYPASS_PATHS.json
```

Extraction goals:

- identify execution surfaces
- identify runtime routes
- identify proof surfaces
- identify validation surfaces
- identify governance objects
- identify bypass-capable paths
- identify reconciliation targets

## Initial Cypher Query Set

### All execution surfaces

```cypher
MATCH (s:ExecutionSurface)
RETURN s
```

### Bypass-capable paths

```cypher
MATCH p=(a)-[:BYPASSES]->(b)
RETURN p
```

### Executions without proof

```cypher
MATCH (e:Execution)
WHERE NOT (e)-[:PRODUCES_PROOF]->(:Proof)
RETURN e
```

### Authority lineage to execution

```cypher
MATCH p=(a:Authority)-[*]->(e:Execution)
RETURN p
```

### Orphaned continuity

```cypher
MATCH (c:Continuity)
WHERE NOT (c)<-[:BINDS_TO]-(:Session)
RETURN c
```

### AEOs validated but not executed

```cypher
MATCH (a:AEO)<-[:VALIDATES]-(v:Validation)
WHERE v.result = "VALID"
AND NOT (a)-[:EXECUTES_THROUGH]->(:Execution)
RETURN a, v
```

### Runtime mutations without governance object

```cypher
MATCH (e:Execution)-[:EXECUTES_THROUGH]->(s:ExecutionSurface)
WHERE NOT (e)<-[:AUTHORIZES|BINDS_TO|VALIDATES*]-(:GovernanceObject)
RETURN e, s
```

## Foundational Graph Invariants

```text
validated_object_lineage
must equal
executed_object_lineage
```

```text
observability
must not become
authority
```

```text
graph visibility
must not become
runtime permission
```

```text
all mutation-capable paths
must be declared,
classified,
and boundary-bound
```

## Tool Stack Alignment

```text
Obsidian / Heptabase
→ human recursive cognition graph

tldraw / Excalidraw / Miro
→ visual topology compression

Neo4j
→ machine-queryable legitimacy graph

OpenTelemetry-style traces
→ observability and drift visibility

Cloudflare D1 / Durable Objects
→ runtime state and proof persistence

FATE tests
→ deterministic legitimacy verification
```

## Final Compression

```text
Capability stack
= systems that can act

Cognitive stack
= systems that can map and understand

MindShift Control Graph
= legitimacy visibility layer

MindShift Boundary
= existence permission layer
```
