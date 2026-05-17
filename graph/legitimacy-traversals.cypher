// MindShift Legitimacy Traversal Queries
// Status: Non-Operative
// Boundary: Traversal is observability only.
// Invariant: query visibility != runtime authority.

// -----------------------------------------------------------------------------
// 1. Authority-related files and referenced primitives
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(authority:Authority)
RETURN p, edge.keywords AS matched_keywords
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 2. AEO-related files and exact-object surfaces
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(aeo:AEO)
RETURN p, edge.keywords AS matched_keywords
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 3. Validation-related files
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(validation:Validation)
RETURN p, edge.keywords AS matched_keywords
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 4. Execution-related files
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(execution:Execution)
RETURN p, edge.keywords AS matched_keywords
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 5. Proof-related files and surfaces
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(proof:Proof)
RETURN p, edge.keywords AS matched_keywords
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 6. Canonical primitive coverage by file
// -----------------------------------------------------------------------------
MATCH (file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(primitive)
WHERE primitive:Authority
   OR primitive:ATAO
   OR primitive:AEO
   OR primitive:Validation
   OR primitive:Execution
   OR primitive:Proof
   OR primitive:Registry
   OR primitive:Reconciliation
RETURN file.path AS file,
       collect(DISTINCT labels(primitive)[0]) AS primitives,
       count(DISTINCT primitive) AS primitive_count
ORDER BY primitive_count DESC, file;

// -----------------------------------------------------------------------------
// 7. Files that reference validation but not proof
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Validation)
WHERE NOT (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Proof)
RETURN file.path AS file
ORDER BY file;

// -----------------------------------------------------------------------------
// 8. Files that reference execution but not validation
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Execution)
WHERE NOT (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Validation)
RETURN file.path AS file
ORDER BY file;

// -----------------------------------------------------------------------------
// 9. Files that reference proof but not registry
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Proof)
WHERE NOT (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Registry)
RETURN file.path AS file
ORDER BY file;

// -----------------------------------------------------------------------------
// 10. Bypass paths near execution surfaces
// -----------------------------------------------------------------------------
MATCH (bypass:BypassPath)
OPTIONAL MATCH (bypass)-[edge:GRAPH_EDGE]->(target)
RETURN bypass.path AS bypass_file,
       collect(DISTINCT edge.type) AS observed_edges,
       collect(DISTINCT labels(target)) AS target_labels
ORDER BY bypass_file;

// -----------------------------------------------------------------------------
// 11. Execution surfaces lacking proof reference
// -----------------------------------------------------------------------------
MATCH (surface:ExecutionSurface)
WHERE NOT (surface)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Proof)
  AND NOT (surface)-[:GRAPH_EDGE {type: "PRODUCES_PROOF"}]->(:Proof)
RETURN surface.path AS surface
ORDER BY surface;

// -----------------------------------------------------------------------------
// 12. Execution surfaces lacking validation reference
// -----------------------------------------------------------------------------
MATCH (surface:ExecutionSurface)
WHERE NOT (surface)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Validation)
RETURN surface.path AS surface
ORDER BY surface;

// -----------------------------------------------------------------------------
// 13. Governance object coverage by execution surface
// -----------------------------------------------------------------------------
MATCH (surface:ExecutionSurface)
OPTIONAL MATCH (surface)-[:GRAPH_EDGE {type: "REFERENCES"}]->(governance:GovernanceObject)
RETURN surface.path AS surface,
       count(DISTINCT governance) AS governance_reference_count,
       collect(DISTINCT governance.name) AS governance_objects
ORDER BY governance_reference_count ASC, surface;

// -----------------------------------------------------------------------------
// 14. Registry/proof continuity references
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "REFERENCES"}]->(proof:Proof)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(registry:Registry)
RETURN file.path AS file,
       proof.name AS proof_reference,
       collect(DISTINCT registry.name) AS registry_references
ORDER BY file;

// -----------------------------------------------------------------------------
// 15. Reconciliation-related files
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(reconciliation:Reconciliation)
RETURN p, edge.keywords AS matched_keywords
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 16. Potential legitimacy gap: execution + bypass + no proof
// -----------------------------------------------------------------------------
MATCH (file:File)
WHERE file:ExecutionSurface
  AND file:BypassPath
  AND NOT (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Proof)
RETURN file.path AS file
ORDER BY file;

// -----------------------------------------------------------------------------
// 17. Potential legitimacy gap: execution route + no validation
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "DECLARES"}]->(route:RuntimeRoute)
WHERE file:ExecutionSurface
  AND NOT (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Validation)
RETURN file.path AS file,
       route.route AS route
ORDER BY file, route;

// -----------------------------------------------------------------------------
// 18. Boundary invariant audit
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)
WHERE n.runtime_authority <> false OR n.mode <> "observability_only"
RETURN n;

// Expected result for query 18:
// no records.
