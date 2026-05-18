MERGE (authority_drift:DriftClass {
  id: "AUTHORITY_DRIFT",
  severity: "CRITICAL"
})

MERGE (continuity_drift:DriftClass {
  id: "CONTINUITY_DRIFT",
  severity: "HIGH"
})

MERGE (proof_drift:DriftClass {
  id: "PROOF_DRIFT",
  severity: "HIGH"
})

MERGE (registry_drift:DriftClass {
  id: "REGISTRY_DRIFT",
  severity: "HIGH"
})

MERGE (execution_drift:DriftClass {
  id: "EXECUTION_DRIFT",
  severity: "CRITICAL"
})

MERGE (governance_drift:DriftClass {
  id: "GOVERNANCE_DRIFT",
  severity: "CRITICAL"
})

MERGE (federation_drift:DriftClass {
  id: "FEDERATION_DRIFT",
  severity: "MEDIUM"
})

MERGE (topology_drift:DriftClass {
  id: "TOPOLOGY_DRIFT",
  severity: "HIGH"
})

WITH topology_drift,
     authority_drift,
     continuity_drift,
     proof_drift,
     registry_drift,
     execution_drift,
     governance_drift,
     federation_drift

MATCH (runtime:Topology {
  id: "RUNTIME_TOPOLOGY"
})

MATCH (governance:Topology {
  id: "GOVERNANCE_TOPOLOGY"
})

MATCH (authority:GovernanceArtifact {
  id: "ROOT_AUTHORITY_REGISTRY"
})

MATCH (continuity:GovernanceArtifact {
  id: "CONTINUITY_ASSUMPTIONS"
})

MATCH (mutation_control:GovernanceArtifact {
  id: "GOVERNANCE_MUTATION_CONTROL"
})

MATCH (execution_surfaces:GovernanceArtifact {
  id: "EXECUTION_SURFACES"
})

MERGE (authority_drift)-[:THREATENS]->(authority)

MERGE (continuity_drift)-[:THREATENS]->(continuity)

MERGE (proof_drift)-[:THREATENS]->(runtime)

MERGE (registry_drift)-[:THREATENS]->(governance)

MERGE (execution_drift)-[:THREATENS]->(runtime)

MERGE (governance_drift)-[:THREATENS]->(governance)

MERGE (federation_drift)-[:THREATENS]->(governance)

MERGE (topology_drift)-[:THREATENS]->(runtime)

MERGE (mutation_control)-[:DETECTS]->(authority_drift)

MERGE (mutation_control)-[:DETECTS]->(continuity_drift)

MERGE (mutation_control)-[:DETECTS]->(proof_drift)

MERGE (mutation_control)-[:DETECTS]->(registry_drift)

MERGE (execution_surfaces)-[:OBSERVES]->(execution_drift)

MERGE (execution_surfaces)-[:OBSERVES]->(topology_drift)

MERGE (governance)-[:RECONCILES]->(authority_drift)

MERGE (governance)-[:RECONCILES]->(continuity_drift)

MERGE (governance)-[:RECONCILES]->(proof_drift)

MERGE (governance)-[:RECONCILES]->(registry_drift)

MERGE (governance)-[:RECONCILES]->(execution_drift)

MERGE (governance)-[:RECONCILES]->(governance_drift)

MERGE (governance)-[:RECONCILES]->(federation_drift)

MERGE (governance)-[:RECONCILES]->(topology_drift)
