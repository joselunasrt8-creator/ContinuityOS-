import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph reconciliation engine exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_reconciliation.ts",
      ),
    )
  },
)
