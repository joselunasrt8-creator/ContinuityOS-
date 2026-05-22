# Neo4j Runtime Legitimacy Topology (Issue #923)

## 1) Purpose
Define a Neo4j graph-modeling strategy for runtime legitimacy topology that supports read-only inspection and traversal of relationships among authority, AEO, validator, execution, proof, continuity, deployment, registry, replay, observability, workflow, token, surface, policy, drift, reconciliation, topology boundaries, and evidence.

## 2) Non-authoritative boundary
Core invariant:

`topology persistence != runtime authority`

This model is explicitly:
- read-oriented
- inspection-oriented
- topology-oriented
- non-authoritative
- replay-neutral
- evidence-only

Neo4j may describe legitimacy topology but cannot create legitimacy.

## 3) Node taxonomy
Canonical taxonomy is defined in `governance/runtime/NEO4J_RUNTIME_TOPOLOGY_MODEL.json` under `node_taxonomy` with stable identity fields for each node type.

### Node guarantees
For every node type:
- `neo4j_authoritative = false`
- `mutation_capable = false`
- `execution_capable = false`
- `inspection_only = true`

## 4) Relationship taxonomy
Canonical relationship taxonomy is defined in `governance/runtime/NEO4J_RUNTIME_TOPOLOGY_MODEL.json` under `relationship_taxonomy`.

Required relationship set modeled:
- `AUTHORIZES`
- `COMPILES_TO`
- `VALIDATES`
- `EXECUTES`
- `PROVES`
- `CONTINUES`
- `REPLAYS`
- `DEPLOYS`
- `MUTATES`
- `OBSERVES`
- `RECONCILES`
- `DEPENDS_ON`
- `BINDS_TO`
- `REFERENCES`
- `DERIVES_FROM`
- `FAILS_CLOSED_AS`
- `HAS_BOUNDARY`

## 5) Identity and hashing strategy
Identity is stable, content-oriented, and registry-anchored.

Examples:
- Authority: `authority_id`, `authority_hash`, `continuity_id`
- AEO: `object_hash`, `schema_version`
- Validator: `validation_id`, `validated_object_hash`, `validator_version`
- Execution: `execution_id`, `decision_id`, `execution_surface`
- Proof: `proof_id`, `proof_hash`, `validated_object_hash`
- Continuity: `continuity_id`, `parent_continuity_id`, `lineage_hash`
- Deployment: `deployment_id`, `commit_sha`, `workflow_hash`, `artifact_hash`, `environment`
- Registry: `registry_name`, `registry_type`, `append_only`
- Surface: `surface_id`, `surface_type`, `closure_status`

All identity fields are descriptive projections from runtime sources of truth; they do not grant authority.

## 6) Append-only lineage representation
Append-only semantics are preserved by modeling lineage as immutable evidence edges over registry snapshots.

- Graph updates are interpreted as new observations/snapshots.
- Historical lineage remains traversable.
- No Neo4j write path is normative for runtime legitimacy.

## 7) Replay lineage representation
Replay is represented by `Replay` nodes and `REPLAYS` relationships to execution/proof lineage.

Replay-sensitive edges are flagged as `replay_sensitive=true` and inspected for reuse patterns only.

## 8) Deployment lineage representation
Deployment provenance is represented through:
- `Workflow -[:DEPLOYS]-> Deployment`
- `Proof -[:BINDS_TO]-> Deployment`
- `Deployment -[:MUTATES]-> Registry` (modeled as evidence of registry-touching deployments)

This is topology evidence, not deployment authorization.

## 9) Continuity traversal strategy
Continuity traversal walks:
- `Continuity -[:CONTINUES]-> Authority`
- ancestry chains via `parent_continuity_id`

Traversal goals:
- detect gaps
- detect forks
- detect orphan continuity segments

Outputs are evidence-only classifications.

## 10) Registry relationship modeling
Registry relationships are modeled with `Registry` nodes and:
- `MUTATES` (deployment evidence)
- `REFERENCES` (evidence linking)

Modeling preserves append-only inventory semantics and prohibits graph-driven rewrite behavior.

## 11) Distributed disagreement modeling
Disagreement is represented with:
- `Reconciliation -[:RECONCILES]-> Drift`
- `Drift -[:FAILS_CLOSED_AS]-> TopologyBoundary`

A disagreement indicates topology divergence evidence, never automatic mutation or remediation.

## 12) Drift / freshness modeling
Drift nodes carry class/time attributes (for example: `drift_class`, `detected_at`), and can be joined with observability timestamps to estimate freshness windows.

Freshness is advisory inspection context only.

## 13) Topology partition boundaries
Boundaries are explicitly modeled:
- `Surface -[:HAS_BOUNDARY]-> TopologyBoundary`

Boundaries partition views by environment, trust scope, or governance domain without changing runtime control flow.

## 14) Query examples (read-only Cypher)
All examples are read-only (`MATCH ... RETURN ...`) and non-authoritative.

### Find orphan proofs
```cypher
MATCH (p:Proof)
WHERE NOT (p)<-[:EXECUTES]-(:Execution)
RETURN p.proof_id, p.proof_hash
```

### Find executions without proof
```cypher
MATCH (e:Execution)
WHERE NOT (e)-[:EXECUTES]->(:Proof)
RETURN e.execution_id, e.decision_id, e.execution_surface
```

### Find deployment surfaces not proof-bound
```cypher
MATCH (s:Surface)-[:HAS_BOUNDARY]->(b:TopologyBoundary)
WHERE NOT (:Proof)-[:BINDS_TO]->(:Deployment)-[:DEPENDS_ON|MUTATES*0..1]->(:Registry)
RETURN s.surface_id, s.surface_type, b.boundary_id
```

### Find observability nodes with authority_capable=true
```cypher
MATCH (o:Observability)
WHERE coalesce(o.authority_capable, false) = true
RETURN o.event_id, o.surface_id, o.observed_at
```

### Find replay-sensitive edges
```cypher
MATCH ()-[r]->()
WHERE coalesce(r.replay_sensitive, false) = true
RETURN type(r) AS relationship_type, r
```

### Find OPEN high-risk surfaces
```cypher
MATCH (s:Surface)-[:HAS_BOUNDARY]->(b:TopologyBoundary)
WHERE s.closure_status = 'OPEN' AND coalesce(s.risk_class, 'LOW') IN ['HIGH','CRITICAL']
RETURN s.surface_id, s.surface_type, s.closure_status, s.risk_class, b.boundary_id
```

### Trace authority → proof lineage
```cypher
MATCH p=(a:Authority)-[:AUTHORIZES]->(:AEO)-[:COMPILES_TO]->(:Validator)-[:VALIDATES]->(:Execution)-[:EXECUTES]->(pr:Proof)
RETURN p, a.authority_id, pr.proof_id
```

### Trace deployment → proof → authority lineage
```cypher
MATCH p=(d:Deployment)<-[:BINDS_TO]-(pr:Proof)<-[:EXECUTES]-(:Execution)<-[:VALIDATES]-(:Validator)<-[:COMPILES_TO]-(:AEO)<-[:AUTHORIZES]-(a:Authority)
RETURN p, d.deployment_id, pr.proof_id, a.authority_id
```

### Detect topology disagreement between source artifacts
```cypher
MATCH (r:Reconciliation)-[:RECONCILES]->(d:Drift)
WHERE d.drift_class IN ['DIVERGENT','MISMATCH','UNKNOWN']
RETURN r.reconciliation_id, d.drift_id, d.drift_class, d.detected_at
ORDER BY d.detected_at DESC
```

## 15) Failure modes / misuse risks
Key misuse risks:
- treating Neo4j projection as authority issuance
- treating graph relationships as execution permission
- treating topology disagreement as automatic remediation order
- converting observability evidence into authority-capable control
- using graph completeness as proof completeness

## 16) Bounded closure proposal
Introduce explicit closure status semantics on `Surface` and `TopologyBoundary` to support bounded inspection:
- `OPEN`
- `MONITORED`
- `CLOSED`
- `QUARANTINED`

Proposal constraints:
- closure classifications are evidence-only
- runtime closure decisions remain external to Neo4j
- no graph-authority coupling

## Final invariant
Neo4j topology may describe legitimacy but cannot create legitimacy.
