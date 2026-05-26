// Neo4j ingest script for runtime topology sample JSON
// Usage example (outside tests):
// :param payload => <parsed JSON with nodes/edges>

UNWIND $payload.nodes AS n
MERGE (rn:RuntimeNode {id: n.id})
SET rn += n
FOREACH (_ IN CASE WHEN n.mutation_capable THEN [1] ELSE [] END | SET rn:MutationSurface)
FOREACH (_ IN CASE WHEN n.type = 'registry' THEN [1] ELSE [] END | SET rn:Registry)
FOREACH (_ IN CASE WHEN n.validator_bound THEN [1] ELSE [] END | SET rn:Validator)
FOREACH (_ IN CASE WHEN n.proof_generating THEN [1] ELSE [] END | SET rn:ProofSurface)
FOREACH (_ IN CASE WHEN n.authority_bound THEN [1] ELSE [] END | SET rn:AuthoritySurface)
FOREACH (_ IN CASE WHEN n.continuity_bound THEN [1] ELSE [] END | SET rn:ContinuitySurface)
FOREACH (_ IN CASE WHEN n.type = 'replay' THEN [1] ELSE [] END | SET rn:ReplaySurface)
FOREACH (_ IN CASE WHEN n.type = 'reconciliation' THEN [1] ELSE [] END | SET rn:ReconciliationSurface)
FOREACH (_ IN CASE WHEN n.type IN ['finality','partition'] THEN [1] ELSE [] END | SET rn:FinalitySurface);

UNWIND $payload.edges AS e
MATCH (a:RuntimeNode {id: e.from})
MATCH (b:RuntimeNode {id: e.to})
MERGE (a)-[r:RuntimeEdge {relation: e.relation, file_path: e.file_path, evidence: e.evidence}]->(b)
SET r += e;
