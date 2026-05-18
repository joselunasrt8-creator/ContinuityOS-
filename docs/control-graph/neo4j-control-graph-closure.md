# Neo4j Control Graph Closure

Artifact Type: Control Graph Closure Specification  
Layer: Observability → Reconciliation → Runtime Boundary Protection  
Status: Non-Operative

## 1. Purpose

This document closes the Neo4j scope before implementation expands.

Neo4j is classified as the MindShift Control Graph / Execution Legitimacy Graph.

```text
Neo4j observes legitimacy.
Neo4j does not create legitimacy.
```

Neo4j may project runtime legitimacy relationships into graph form for traversal, visualization, and reconciliation. It may not become an authority source, validator, execution surface, proof generator, or registry mutation path.

Canonical runtime remains:

```text
Authority → ATAO → AEO → Ω Validator → Execution Boundary → Proof → Registry
```

Neo4j may observe this chain. It may not replace or bypass it.

## 2. Scope

Neo4j may represent read-only projections of:

- session lineage
- continuity lineage
- authority lineage
- ATAO / AEO relationships
- validation flow
- execution events
- proof chains
- registry linkage
- execution surfaces
- bypass surfaces
- sovereignty roots
- reconciliation drift
- governance topology

Neo4j's valid purpose is:

```text
READ_ONLY_OBSERVABILITY
+
RECONCILIATION_FINDING_GENERATION
```

## 3. Non-Goals

Neo4j is not:

- an execution engine
- an authority registry
- a validator
- a policy decision engine
- a proof writer
- a replay-state mutator
- a workflow dispatcher
- a deployment trigger
- a secret/token manager
- a source of runtime permission

Boundary rule:

```text
Map ≠ authority.
Observation ≠ validation.
Traversal ≠ execution.
```

## 4. Node Taxonomy

Initial graph node classes:

| Node | Purpose |
|---|---|
| `Session` | Represents session lineage anchor. |
| `Continuity` | Represents continuity chain state. |
| `Authority` | Represents read-only authority projection. |
| `ATAO` | Represents proposed agent/tool action object. |
| `AEO` | Represents exact executable object projection. |
| `ValidationResult` | Represents VALID / NULL result projection. |
| `ExecutionEvent` | Represents observed execution event. |
| `Proof` | Represents observed Proof-of-Transfer. |
| `RegistryRecord` | Represents persisted registry projection. |
| `ExecutionSurface` | Represents state-changing surface. |
| `BypassPath` | Represents potential bypass route. |
| `Policy` | Represents policy artifact projection. |
| `Workflow` | Represents GitHub/workflow topology. |
| `RuntimeRoute` | Represents runtime route topology. |
| `ReconciliationFinding` | Represents read-only detected integrity issue. |
| `SovereigntyRoot` | Represents disclosed root authority assumption. |

Each node SHOULD include:

- stable ID
- source registry or file
- status
- timestamp when available
- canonical hash when applicable
- provenance metadata

## 5. Edge Taxonomy

Initial relationship classes:

| Edge | Meaning |
|---|---|
| `HAS_CONTINUITY` | Session links to continuity lineage. |
| `BINDS_AUTHORITY` | Continuity or action links to authority. |
| `CAPTURES_ACTION` | ATAO captures proposed action. |
| `COMPILES_TO` | ATAO / authority compiles to AEO. |
| `VALIDATES` | Validator result corresponds to AEO. |
| `EXECUTES` | Validated object links to observed execution. |
| `PRODUCES_PROOF` | Execution links to Proof-of-Transfer. |
| `PERSISTS_IN` | Proof or object links to registry record. |
| `DEPENDS_ON` | Node depends on another node. |
| `GOVERNS_SURFACE` | Policy or authority governs surface. |
| `MAY_BYPASS` | Surface may bypass canonical boundary. |
| `RECONCILES_WITH` | Node reconciles with expected lineage. |
| `DRIFTS_FROM` | Node diverges from expected lineage. |
| `REVOKES` | Revocation relationship. |
| `EXPIRES` | Expiry relationship. |
| `DERIVES_FROM` | Object derives from prior object/source. |

Invariant:

```text
Graph edges describe legitimacy relationships.
They do not create runtime legitimacy.
```

## 6. Read-Only Inputs

Neo4j may ingest read-only projections from:

- repository structure
- runtime route maps
- governance bundle artifacts
- schemas
- registry exports
- proof ledger exports
- reconciliation reports
- workflow files
- execution surface inventories
- bypass path inventories
- sovereignty assumption registry

All ingestion is classified as:

```text
READ_ONLY_PROJECTION
```

## 7. Forbidden Mutations

Neo4j must never directly mutate:

- authority state
- continuity state
- AEO state
- validation state
- execution state
- proof state
- replay state
- runtime registries
- workflow dispatch state
- GitHub deploy state
- Cloudflare deploy state
- production runtime state
- secrets or tokens

Forbidden role classification:

```text
Neo4j cannot authorize, validate, execute, create proof, consume authority, or change runtime state.
```

Any Neo4j-discovered action must become a proposal and route through:

```text
ATAO → Authority Binding → AEO → Ω Validator → Execution Boundary → Proof
```

Else:

```text
NULL
```

## 8. Proof / Lineage Traversal

Canonical traversal path:

```text
Session
→ Continuity
→ Authority
→ ATAO
→ AEO
→ ValidationResult
→ ExecutionEvent
→ Proof
→ RegistryRecord
```

Traversal goals:

- prove lineage completeness
- detect missing parent links
- expose replay ambiguity
- identify proof detachment
- identify registry drift
- support Control Graph visualization

Failure condition:

```text
missing lineage edge → ReconciliationFinding
```

A reconciliation finding is not authority and does not mutate runtime state.

## 9. Reconciliation Query Inventory

Initial read-only Cypher query targets:

- orphan proof detection
- orphan execution detection
- authority without validation
- validation without execution
- execution without proof
- proof without registry persistence
- bypass path inventory
- route without governance binding
- execution surface without policy
- stale continuity lineage
- revoked authority still linked to executable lineage
- hash mismatch lineage
- disconnected sovereignty roots

All query outputs must be typed as:

```text
ReconciliationFinding
```

## 10. Runtime Authority Exclusion

Runtime authority remains outside Neo4j.

Neo4j may answer:

```text
What legitimacy chain exists?
Where is lineage broken?
Where might bypass exist?
What proof is attached?
What surface is ungoverned?
```

Neo4j may not answer as execution authority:

```text
May this execute?
```

Only the canonical validator and execution boundary may determine:

```text
VALID | NULL
```

## 11. Closure Invariant

```text
Neo4j is not the engine.
Neo4j is the legitimacy map.
```

```text
READ_ONLY_OBSERVABILITY
+
RECONCILIATION_FINDINGS
≠
RUNTIME_AUTHORITY
```

Final closure condition:

```text
Neo4j remains a graph projection of legitimacy state.
Runtime authority remains in the canonical MindShift runtime.
Any proposed mutation routes through ATAO → AEO → Ω Validator → Execution Boundary → Proof.
Else NULL.
```
