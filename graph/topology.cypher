cat > graph/topology.cypher <<'EOF'
MERGE (session:Route {
  id: "/session",
  classification: "SESSION_ESTABLISHMENT",
  executable: false
})

MERGE (continuity:Route {
  id: "/continuity",
  classification: "CONTINUITY_BINDING",
  executable: false
})

MERGE (authority:Route {
  id: "/authority",
  classification: "AUTHORITY_ISSUANCE",
  executable: false
})

MERGE (compile:Route {
  id: "/compile",
  classification: "AEO_COMPILATION",
  executable: false
})

MERGE (validate:Route {
  id: "/validate",
  classification: "VALIDATION_BOUNDARY",
  executable: false
})

MERGE (execute:Route {
  id: "/execute",
  classification: "EXECUTION_BOUNDARY",
  executable: true
})

MERGE (proof:Route {
  id: "/proof",
  classification: "PROOF_PERSISTENCE",
  executable: false
})

MERGE (session)-[:NEXT]->(continuity)

MERGE (continuity)-[:NEXT]->(authority)

MERGE (authority)-[:NEXT]->(compile)

MERGE (compile)-[:NEXT]->(validate)

MERGE (validate)-[:NEXT]->(execute)

MERGE (execute)-[:NEXT]->(proof)

MERGE (runtime:Topology {
  artifact: "RUNTIME_TOPOLOGY",
  status: "NON_OPERATIVE",
  authority_creating: false,
  execution_authorizing: false,
  runtime_mutating: false,
  invariant:
    "no valid lineage -> no valid execution -> no valid proof"
})

MERGE (runtime)-[:CONTAINS]->(session)
MERGE (runtime)-[:CONTAINS]->(continuity)
MERGE (runtime)-[:CONTAINS]->(authority)
MERGE (runtime)-[:CONTAINS]->(compile)
MERGE (runtime)-[:CONTAINS]->(validate)
MERGE (runtime)-[:CONTAINS]->(execute)
MERGE (runtime)-[:CONTAINS]->(proof)
EOF
