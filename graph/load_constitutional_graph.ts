import fs from "fs"
import path from "path"
import neo4j from "neo4j-driver"

const uri =
  process.env.NEO4J_URI || "bolt://localhost:7687"

const username =
  process.env.NEO4J_USERNAME || "neo4j"

const password =
  process.env.NEO4J_PASSWORD || "password"

const driver = neo4j.driver(
  uri,
  neo4j.auth.basic(username, password)
)

const graphFiles = [
  "graph/topology.cypher",
  "graph/legitimacy_edges.cypher",
  "graph/drift_taxonomy.cypher",
  "graph/reconciliation-views.cypher",
  "graph/legitimacy-traversals.cypher"
]

async function loadGraph() {
  const session = driver.session()

  try {
    for (const file of graphFiles) {
      const absolutePath = path.resolve(file)

      if (!fs.existsSync(absolutePath)) {
        console.log(`missing file: ${file}`)
        continue
      }

      const cypher = fs.readFileSync(
        absolutePath,
        "utf8"
      )

      console.log(`loading ${file}`)

      await session.run(cypher)

      console.log(`loaded ${file}`)
    }

    console.log(
      "constitutional graph materialization complete"
    )
  } catch (error) {
    console.error(
      "constitutional graph materialization failure",
      error
    )
  } finally {
    await session.close()
    await driver.close()
  }
}

loadGraph()
