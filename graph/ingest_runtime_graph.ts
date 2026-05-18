import fs from "fs"
import path from "path"

type Node = {
  id: string
  type: string
}

type Edge = {
  from: string
  to: string
  relation: string
}

const nodesMap = new Map<string, Node>()
const edges: Edge[] = []

const ROUTES_DIR = path.join(process.cwd(), "src")

function addNode(id: string, type: string) {
  nodesMap.set(id, { id, type })
}

function addEdge(
  from: string,
  to: string,
  relation: string
) {
  edges.push({ from, to, relation })
}

function ingestRoutes() {
  if (!fs.existsSync(ROUTES_DIR)) {
    console.error("routes directory missing")
    process.exit(1)
  }

  const files = fs.readdirSync(ROUTES_DIR)

  for (const file of files) {
    const full = path.join(ROUTES_DIR, file)

    if (!fs.statSync(full).isFile()) {
      continue
    }

    const routeName = file
      .replace(/\.(ts|js)$/, "")
      .replace(/^index$/, "runtime")

    addNode(routeName, "runtime_route")
  }

  addEdge(
    "authority",
    "compile",
    "feeds"
  )

  addEdge(
    "compile",
    "validate",
    "feeds"
  )

  addEdge(
    "validate",
    "execute",
    "feeds"
  )

  addEdge(
    "execute",
    "proof",
    "feeds"
  )
}

function persist() {
  const outputDir = path.join(
    process.cwd(),
    "graph/output"
  )

  fs.mkdirSync(outputDir, {
    recursive: true
  })

  fs.writeFileSync(
    path.join(outputDir, "runtime_nodes.json"),
    JSON.stringify(
      Array.from(nodesMap.values()),
      null,
      2
    )
  )

  fs.writeFileSync(
    path.join(outputDir, "runtime_edges.json"),
    JSON.stringify(
      edges,
      null,
      2
    )
  )
}

ingestRoutes()

persist()

console.log(
  "runtime topology generated"
)
