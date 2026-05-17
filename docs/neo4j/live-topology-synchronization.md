# MindShift Neo4j Live Topology Synchronization

**Artifact Type:** Synchronization Design Specification  
**Layer:** Control Graph → Runtime Artifacts → Topology Synchronization  
**Status:** Non-Operative  
**Depends On:** `docs/neo4j/execution-legitimacy-graph-schema.md`, `docs/neo4j/node-taxonomy.md`, `docs/neo4j/query-library.md`, `docs/neo4j/continuous-reconciliation-queries.md`

---

## 1. Purpose

This artifact defines how the Neo4j Control Graph should stay synchronized with MindShift repo and runtime governance artifacts.

The goal is to move from static topology snapshots into a current, traversable execution legitimacy topology.

The synchronization layer is representational only. It updates graph observability state. It does not authorize, validate, execute, or produce proof.

---

## 2. Boundary Rule

Live topology synchronization cannot:

```text
create authority
validate an AEO
execute an action
produce Proof-of-Transfer
repair runtime state automatically
replace canonical registries
```

It can:

```text
read governance artifacts
project nodes
project edges
update topology metadata
mark stale or missing graph records
support reconciliation queries
```

---

## 3. Synchronization Sources

Initial source set:

```text
runtime registries
authority records
AEO records
validation records
execution records
proof records
continuity lineage records
execution surface inventory JSON
bypass path inventory JSON
governance bundle artifacts
PREO artifacts
SCO artifacts
reconciliation snapshots
workflow metadata
federation / observability evidence
```

---

## 4. Source-to-Node Mapping

| Source | Node Label |
|---|---|
| session registry | Session |
| continuity registry | Continuity |
| authority registry | Authority |
| ATAO capture artifact | ATAO |
| compiled AEO record | AEO |
| validation registry | Validation |
| execution boundary config | ExecutionBoundary |
| execution event registry | Execution |
| proof registry | Proof |
| registry metadata | Registry |
| execution surface inventory | ExecutionSurface |
| bypass path inventory | BypassPath |
| policy/governance bundle | Policy |
| pull request execution object | PREO |
| system change object | SCO |
| reconciliation output | ReconciliationSnapshot |

---

## 5. Source-to-Edge Mapping

| Source Relationship | Graph Edge |
|---|---|
| session owns continuity | HAS_CONTINUITY |
| continuity anchors authority | AUTHORIZES |
| session captures ATAO | CAPTURES |
| ATAO binds authority | BINDS_TO |
| authority compiles AEO | COMPILES_TO |
| ATAO compiles AEO | COMPILES_TO |
| AEO validation result | VALIDATED_BY |
| validation reaches gateway | REACHES_BOUNDARY |
| boundary executes event | EXECUTES_AS |
| execution produces proof | PRODUCES_PROOF |
| runtime object stored in registry | PERSISTS_IN |
| proof references authority | REFERENCES |
| boundary governs surface | GOVERNS_SURFACE |
| bypass can reach surface | CAN_BYPASS |
| snapshot observes drift | OBSERVES |
| snapshot reconciles registry | RECONCILES_WITH |

---

## 6. Synchronization Modes

### 6.1 Dry Run

Reads all sources and reports planned node/edge mutations without writing to Neo4j.

Purpose:

```text
safe topology preview
```

### 6.2 Apply Mode

Writes deterministic node/edge projections into Neo4j.

Required behavior:

```text
MERGE by stable ID
SET bounded properties
never duplicate canonical nodes
```

### 6.3 Diagnostic Mode

Runs synchronization comparison without changing graph state.

Detects:

```text
missing nodes
missing edges
stale records
source mismatch
unknown node classes
```

---

## 7. Idempotency Rules

Synchronization must be idempotent.

Rules:

```text
same source artifact
→ same node identity
→ same edge identity
→ same resulting graph topology
```

Required implementation behavior:

```cypher
MERGE (n:Label {stable_id: value})
SET n.updated_at = timestamp
SET n.source_hash = source_hash
```

Forbidden behavior:

```text
CREATE without stable identity
random IDs for canonical objects
duplicate graph nodes for same source record
implicit deletion of missing runtime records
```

---

## 8. Tombstone and Deletion Handling

Missing source records should not silently delete graph nodes.

Instead, mark stale state:

```text
status = STALE
stale_detected_at = timestamp
last_seen_source_hash = previous_hash
```

Deletion requires explicit tombstone source evidence.

Tombstone node properties:

```text
tombstone_reason
tombstone_source
tombstone_detected_at
```

---

## 9. Drift Handling

If graph state differs from source state:

```text
mark node or registry status = DIVERGENT
emit reconciliation finding
preserve prior lineage
require diagnostic review
```

Drift must not mutate runtime legitimacy state.

---

## 10. Minimal Sync Algorithm

```text
1. Load source artifacts
2. Normalize each source record
3. Compute deterministic source hash
4. Map source record to canonical node label
5. MERGE node by stable ID
6. SET bounded properties
7. Map known references into canonical edges
8. MERGE edges by source and target stable IDs
9. Mark missing previously-seen nodes as STALE
10. Run continuous reconciliation queries
11. Emit sync report
```

---

## 11. Sync Report Shape

```json
{
  "sync_id": "string",
  "mode": "dry_run | apply | diagnostic",
  "started_at": "ISO8601",
  "completed_at": "ISO8601",
  "nodes_seen": 0,
  "nodes_created": 0,
  "nodes_updated": 0,
  "nodes_marked_stale": 0,
  "edges_seen": 0,
  "edges_created": 0,
  "edges_updated": 0,
  "findings": [],
  "status": "RECONCILED | DRIFT | INCOMPLETE_LINEAGE | BYPASS_RISK | UNKNOWN"
}
```

---

## 12. Acceptance Criteria

Synchronization is acceptable when:

- source-to-node mapping is deterministic
- source-to-edge mapping is deterministic
- re-running sync does not duplicate nodes or edges
- missing source records become diagnostic drift, not silent deletion
- unknown node classes enter quarantine
- continuous reconciliation queries can run after sync
- no sync step implies authority, validation, execution, or proof

---

## 13. Final Compression

```text
Synchronization keeps the topology current.
Reconciliation checks whether the topology still coheres.
Runtime remains the only execution authority path.
```
