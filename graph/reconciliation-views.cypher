// MindShift Reconciliation Visualization Queries
// Status: Non-Operative
// Boundary: Reconciliation views are observability only.
// Invariant: all persisted legitimacy lineage must remain recursively reconcilable.
// Reminder: Neo4j visibility != runtime authority.

// -----------------------------------------------------------------------------
// 1. Reconciliation primitive references
// -----------------------------------------------------------------------------
MATCH p=(file:File)-[edge:GRAPH_EDGE {type: "REFERENCES"}]->(reconciliation:Reconciliation)
RETURN p, edge.keywords AS matched_keywords
ORDER BY file.path;

// -----------------------------------------------------------------------------
// 2. Continuity-related references by file
// -----------------------------------------------------------------------------
MATCH (file:File)
WHERE toLower(coalesce(file.path, "")) CONTAINS "continuity"
   OR EXISTS {
        MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(primitive)
        WHERE primitive.name = "Reconciliation"
   }
RETURN file.path AS file,
       labels(file) AS labels,
       file.mode AS mode,
       file.runtime_authority AS runtime_authority
ORDER BY file;

// -----------------------------------------------------------------------------
// 3. Proof coherence surface
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Proof)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Registry)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Reconciliation)
RETURN file.path AS file,
       count(DISTINCT file) AS file_count,
       count(DISTINCT file) > 0 AS proof_referenced,
       EXISTS { (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Registry) } AS registry_referenced,
       EXISTS { (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Reconciliation) } AS reconciliation_referenced
ORDER BY file;

// -----------------------------------------------------------------------------
// 4. Registry surfaces without reconciliation references
// -----------------------------------------------------------------------------
MATCH (registry:RegistrySurface)
WHERE NOT (registry)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Reconciliation)
RETURN registry.path AS registry_surface
ORDER BY registry_surface;

// -----------------------------------------------------------------------------
// 5. Proof surfaces without registry references
// -----------------------------------------------------------------------------
MATCH (proof_surface:ProofSurface)
WHERE NOT (proof_surface)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Registry)
RETURN proof_surface.path AS proof_surface
ORDER BY proof_surface;

// -----------------------------------------------------------------------------
// 6. Execution surfaces without reconciliation visibility
// -----------------------------------------------------------------------------
MATCH (surface:ExecutionSurface)
WHERE NOT (surface)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Reconciliation)
RETURN surface.path AS surface
ORDER BY surface;

// -----------------------------------------------------------------------------
// 7. Bypass surfaces with no reconciliation visibility
// -----------------------------------------------------------------------------
MATCH (bypass:BypassPath)
WHERE NOT (bypass)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Reconciliation)
RETURN bypass.path AS bypass_surface
ORDER BY bypass_surface;

// -----------------------------------------------------------------------------
// 8. Runtime route reconciliation context
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "DECLARES"}]->(route:RuntimeRoute)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(reconciliation:Reconciliation)
RETURN file.path AS file,
       route.route AS route,
       count(DISTINCT reconciliation) AS reconciliation_reference_count
ORDER BY reconciliation_reference_count ASC, file, route;

// -----------------------------------------------------------------------------
// 9. Canonical chain coverage by file
// -----------------------------------------------------------------------------
MATCH (file:File)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(authority:Authority)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(atao:ATAO)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(aeo:AEO)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(validation:Validation)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(execution:Execution)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(proof:Proof)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(registry:Registry)
OPTIONAL MATCH (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(reconciliation:Reconciliation)
WITH file,
     count(DISTINCT authority) AS authority_refs,
     count(DISTINCT atao) AS atao_refs,
     count(DISTINCT aeo) AS aeo_refs,
     count(DISTINCT validation) AS validation_refs,
     count(DISTINCT execution) AS execution_refs,
     count(DISTINCT proof) AS proof_refs,
     count(DISTINCT registry) AS registry_refs,
     count(DISTINCT reconciliation) AS reconciliation_refs
WHERE authority_refs + atao_refs + aeo_refs + validation_refs + execution_refs + proof_refs + registry_refs + reconciliation_refs > 0
RETURN file.path AS file,
       authority_refs,
       atao_refs,
       aeo_refs,
       validation_refs,
       execution_refs,
       proof_refs,
       registry_refs,
       reconciliation_refs
ORDER BY reconciliation_refs ASC, proof_refs ASC, execution_refs DESC, file;

// -----------------------------------------------------------------------------
// 10. Potential broken proof coherence
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Execution)
WHERE NOT (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Proof)
RETURN file.path AS execution_file_without_proof_reference
ORDER BY execution_file_without_proof_reference;

// -----------------------------------------------------------------------------
// 11. Potential broken registry coherence
// -----------------------------------------------------------------------------
MATCH (file:File)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Proof)
WHERE NOT (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Registry)
RETURN file.path AS proof_file_without_registry_reference
ORDER BY proof_file_without_registry_reference;

// -----------------------------------------------------------------------------
// 12. Potential reconciliation blind spots
// -----------------------------------------------------------------------------
MATCH (file:File)
WHERE (file:ExecutionSurface OR file:ProofSurface OR file:RegistrySurface OR file:BypassPath)
  AND NOT (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Reconciliation)
RETURN file.path AS blind_spot,
       labels(file) AS labels
ORDER BY blind_spot;

// -----------------------------------------------------------------------------
// 13. FATE coverage against reconciliation primitives
// -----------------------------------------------------------------------------
MATCH (test)
WHERE test:Test OR test:FATESuite
OPTIONAL MATCH (test)-[:GRAPH_EDGE {type: "REFERENCES"}]->(reconciliation:Reconciliation)
OPTIONAL MATCH (test)-[:GRAPH_EDGE {type: "REFERENCES"}]->(proof:Proof)
OPTIONAL MATCH (test)-[:GRAPH_EDGE {type: "REFERENCES"}]->(registry:Registry)
RETURN test.path AS test_file,
       count(DISTINCT reconciliation) AS reconciliation_refs,
       count(DISTINCT proof) AS proof_refs,
       count(DISTINCT registry) AS registry_refs
ORDER BY reconciliation_refs ASC, proof_refs ASC, test_file;

// -----------------------------------------------------------------------------
// 14. Reconciliation-ready surfaces
// -----------------------------------------------------------------------------
MATCH (file:File)
WHERE (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Execution)
  AND (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Proof)
  AND (file)-[:GRAPH_EDGE {type: "REFERENCES"}]->(:Registry)
RETURN file.path AS reconciliation_ready_file
ORDER BY reconciliation_ready_file;

// -----------------------------------------------------------------------------
// 15. Reconciliation graph summary
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)
WITH count(n) AS total_nodes
MATCH ()-[e:GRAPH_EDGE]->()
WITH total_nodes, count(e) AS total_edges
MATCH (r:Reconciliation)
RETURN total_nodes,
       total_edges,
       count(r) AS reconciliation_primitives,
       "observability_only" AS mode,
       false AS runtime_authority;

// -----------------------------------------------------------------------------
// 16. Boundary invariant audit
// -----------------------------------------------------------------------------
MATCH (n:GraphNode)
WHERE n.runtime_authority <> false OR n.mode <> "observability_only"
RETURN n;

// Expected result for query 16:
// no records.
