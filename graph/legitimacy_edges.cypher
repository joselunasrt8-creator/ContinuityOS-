MATCH (runtime:Topology {
  id: "RUNTIME_TOPOLOGY"
})

MATCH (governance:Topology {
  id: "GOVERNANCE_TOPOLOGY"
})

MATCH (continuity:GovernanceArtifact {
  id: "CONTINUITY_ASSUMPTIONS"
})

MATCH (authority:GovernanceArtifact {
  id: "ROOT_AUTHORITY_REGISTRY"
})

MATCH (execution_surfaces:GovernanceArtifact {
  id: "EXECUTION_SURFACES"
})

MATCH (mutation_control:GovernanceArtifact {
  id: "GOVERNANCE_MUTATION_CONTROL"
})

MATCH (constitutional_boundary:GovernanceArtifact {
  id: "CONSTITUTIONAL_BOUNDARY"
})

MATCH (identity:ContinuityAssumption {
  id: "IDENTITY_CONTINUITY"
})

MATCH (session:ContinuityAssumption {
  id: "SESSION_CONTINUITY"
})

MATCH (proof:ContinuityAssumption {
  id: "PROOF_CONTINUITY"
})

MATCH (ra0:AuthorityClass {
  id: "RA-0_ABSOLUTE_ROOT"
})

MATCH (ra1:AuthorityClass {
  id: "RA-1_INFRASTRUCTURE_ADMIN"
})

MATCH (ra6:AuthorityClass {
  id: "RA-6_LOCAL_OPERATOR_ROOT"
})

MERGE (continuity)-[:VALIDATES]->(runtime)

MERGE (authority)-[:AUTHORIZES]->(runtime)

MERGE (proof)-[:PROVES]->(runtime)

MERGE (constitutional_boundary)-[:CONSTRAINS]->(runtime)

MERGE (execution_surfaces)-[:OBSERVES]->(runtime)

MERGE (mutation_control)-[:PROTECTS]->(runtime)

MERGE (governance)-[:RECONCILES]->(runtime)

MERGE (identity)-[:BINDS]->(session)

MERGE (session)-[:ENABLES]->(runtime)

MERGE (ra0)-[:OVERRIDES]->(runtime)

MERGE (ra1)-[:ADMINISTERS]->(runtime)

MERGE (ra6)-[:MUTATES]->(runtime)

MERGE (execution_surfaces)-[:DRIFT_DETECTS]->(runtime)

MERGE (mutation_control)-[:DRIFT_CONSTRAINS]->(runtime)

MERGE (authority)-[:BOUNDS]->(ra0)

MERGE (authority)-[:BOUNDS]->(ra1)

MERGE (authority)-[:BOUNDS]->(ra6)

MERGE (continuity)-[:REQUIRES]->(identity)

MERGE (continuity)-[:REQUIRES]->(session)

MERGE (continuity)-[:REQUIRES]->(proof)

MERGE (governance)-[:SEMANTICALLY_GOVERNS]->(runtime)
