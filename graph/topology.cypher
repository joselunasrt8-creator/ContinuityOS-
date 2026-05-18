MERGE (runtime:Topology {
  id: "RUNTIME_TOPOLOGY",
  status: "NON_OPERATIVE"
})

MERGE (governance:Topology {
  id: "GOVERNANCE_TOPOLOGY",
  status: "NON_OPERATIVE"
})

MERGE (constitutional:Domain {
  id: "CONSTITUTIONAL_GOVERNANCE"
})

MERGE (runtime)-[:GOVERNED_BY]->(governance)

MERGE (governance)-[:CONSTRAINED_BY]->(constitutional)

MERGE (economic_governance:RuntimeRoute {
  id: "economic-governance"
})

MERGE (runtime_root:RuntimeRoute {
  id: "runtime"
})

MERGE (economic_governance)-[:PART_OF]->(runtime)

MERGE (runtime_root)-[:PART_OF]->(runtime)

MERGE (continuity:GovernanceArtifact {
  id: "CONTINUITY_ASSUMPTIONS"
})

MERGE (authority:GovernanceArtifact {
  id: "ROOT_AUTHORITY_REGISTRY"
})

MERGE (execution_surfaces:GovernanceArtifact {
  id: "EXECUTION_SURFACES"
})

MERGE (mutation_control:GovernanceArtifact {
  id: "GOVERNANCE_MUTATION_CONTROL"
})

MERGE (constitutional_boundary:GovernanceArtifact {
  id: "CONSTITUTIONAL_BOUNDARY"
})

MERGE (continuity)-[:PART_OF]->(governance)

MERGE (authority)-[:PART_OF]->(governance)

MERGE (execution_surfaces)-[:PART_OF]->(governance)

MERGE (mutation_control)-[:PART_OF]->(governance)

MERGE (constitutional_boundary)-[:PART_OF]->(governance)

MERGE (ra0:AuthorityClass {
  id: "RA-0_ABSOLUTE_ROOT"
})

MERGE (ra1:AuthorityClass {
  id: "RA-1_INFRASTRUCTURE_ADMIN"
})

MERGE (ra6:AuthorityClass {
  id: "RA-6_LOCAL_OPERATOR_ROOT"
})

MERGE (authority)-[:DEFINES]->(ra0)

MERGE (authority)-[:DEFINES]->(ra1)

MERGE (authority)-[:DEFINES]->(ra6)

MERGE (identity:ContinuityAssumption {
  id: "IDENTITY_CONTINUITY"
})

MERGE (session:ContinuityAssumption {
  id: "SESSION_CONTINUITY"
})

MERGE (proof:ContinuityAssumption {
  id: "PROOF_CONTINUITY"
})

MERGE (continuity)-[:ASSUMES]->(identity)

MERGE (continuity)-[:ASSUMES]->(session)

MERGE (continuity)-[:ASSUMES]->(proof)

MERGE (runtime)-[:REQUIRES]->(continuity)

MERGE (runtime)-[:CONSTRAINED_BY]->(authority)

MERGE (runtime)-[:OBSERVED_BY]->(execution_surfaces)

MERGE (runtime)-[:PROTECTED_BY]->(mutation_control)

MERGE (runtime)-[:BOUNDED_BY]->(constitutional_boundary)
