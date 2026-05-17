// MindShift Runtime Topology Queries
// Status: Non-Operative
// Boundary: Neo4j state is observability state only.
// Invariant: visibility != authority.

// -----------------------------------------------------------------------------
// 1. All graph nodes
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)
RETURN n
ORDER BY n.id;

// -----------------------------------------------------------------------------
// 2. Repository containment topology
// -----------------------------------------------------------------------------
MATCH p=(repo:Repository)-[:GRAPH_EDGE {type: "CONTAINS"}]->(file:File)
RETURN p
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 3. Runtime route declarations
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[:GRAPH_EDGE {type: "DECLARES"}]->(route:RuntimeRoute)
RETURN p
ORDER BY file.path, route.route;

// -----------------------------------------------------------------------------
// 4. Execution surface inventory
// -----------------------------------------------------------------------------
MATCH (surface:ExecutionSurface)
RETURN surface.id AS id,
       surface.path AS path,
       surface.labels AS labels,
       surface.mode AS mode,
       surface.runtime_authority AS runtime_authority
ORDER BY path, id;

// -----------------------------------------------------------------------------
// 5. Workflow topology
// -----------------------------------------------------------------------------
MATCH p=(repo:Repository)-[:GRAPH_EDGE {type: "CONTAINS"}]->(workflow:Workflow)
RETURN p
ORDER BY workflow.path;

// -----------------------------------------------------------------------------
// 6. Proof surface topology
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[:GRAPH_EDGE {type: "PRODUCES_PROOF"}]->(proof:Proof)
RETURN p
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 7. Registry surface inventory
// -----------------------------------------------------------------------------
MATCH (registry:RegistrySurface)
RETURN registry.id AS id,
       registry.path AS path,
       registry.mode AS mode,
       registry.runtime_authority AS runtime_authority
ORDER BY path, id;

// -----------------------------------------------------------------------------
// 8. Governance object inventory
// -----------------------------------------------------------------------------
MATCH (governance:GovernanceObject)
RETURN governance.id AS id,
       governance.path AS path,
       governance.mode AS mode,
       governance.runtime_authority AS runtime_authority
ORDER BY path, id;

// -----------------------------------------------------------------------------
// 9. Bypass path observation
// -----------------------------------------------------------------------------
MATCH p=(file:BypassPath)-[:GRAPH_EDGE {type: "OBSERVES"}]->(repo:Repository)
RETURN p
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 10. Test and FATE coverage topology
// -----------------------------------------------------------------------------
MATCH p=(test)-[:GRAPH_EDGE {type: "TESTS"}]->(repo:Repository)
WHERE test:Test OR test:FATESuite
RETURN p
ORDER BY test.path;

// -----------------------------------------------------------------------------
// 11. File-to-legitimacy primitive references
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(primitive)
RETURN file.path AS file,
       labels(primitive) AS primitive_labels,
       primitive.name AS primitive,
       edge.keywords AS matched_keywords
ORDER BY file, primitive;

// -----------------------------------------------------------------------------
// 12. Runtime route to execution surface context
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[:GRAPH_EDGE {type: "DECLARES"}]->(route:RuntimeRoute)
WHERE file:ExecutionSurface
RETURN p
ORDER BY file.path, route.route;

// -----------------------------------------------------------------------------
// 13. Observability boundary audit
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)
WHERE n.runtime_authority <> false OR n.mode <> "observability_only"
RETURN n;

// Expected result for query 13:
// no records.
