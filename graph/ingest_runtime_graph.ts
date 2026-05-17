cat > graph/ingest_runtime_graph.ts <<'EOF'
import fs from "fs"

type Node = {
  id: string
  type: string
  classification: string
  executable: boolean
}

type Edge = {
  from: string
  to: string
  type: string
}

const nodes: Node[] = [
  {
    id: "/session",
    type: "Route",
    classification: "SESSION_ESTABLISHMENT",
    executable: false
  },
  {
    id: "/continuity",
    type: "Route",
    classification: "CONTINUITY_BINDING",
    executable: false
  },
  {
    id: "/authority",
    type: "Route",
    classification: "AUTHORITY_ISSUANCE",
    executable: false
  },
  {
    id: "/compile",
    type: "Route",
    classification: "AEO_COMPILATION",
    executable: false
  },
  {
    id: "/validate",
    type: "Route",
    classification: "VALIDATION_BOUNDARY",
    executable: false
  },
  {
    id: "/execute",
    type: "Route",
    classification: "EXECUTION_BOUNDARY",
    executable: true
  },
  {
    id: "/proof",
    type: "Route",
    classification: "PROOF_PERSISTENCE",
    executable: false
  }
]

const edges: Edge[] = [
  {
    from: "/session",
    to: "/continuity",
    type: "NEXT"
  },
  {
    from: "/continuity",
    to: "/authority",
    type: "NEXT"
  },
  {
    from: "/authority",
    to: "/compile",
    type: "NEXT"
  },
  {
    from: "/compile",
    to: "/validate",
    type: "NEXT"
  },
  {
    from: "/validate",
    to: "/execute",
    type: "NEXT"
  },
  {
    from: "/execute",
    to: "/proof",
    type: "NEXT"
  }
]

const topology = {
  artifact: "RUNTIME_TOPOLOGY",
  status: "NON_OPERATIVE",
  authority_creating: false,
  execution_authorizing: false,
  runtime_mutating: false,
  nodes,
  edges,
  invariant:
    "no valid lineage -> no valid execution -> no valid proof"
}

fs.mkdirSync("graph", { recursive: true })

fs.writeFileSync(
  "graph/runtime_topology.json",
  JSON.stringify(topology, null, 2)
)

console.log("runtime topology generated")
EOF
