import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph projection layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_projection.ts",
      ),
    )
  },
)

test(
  "projection layer remains observability only",
  () => {
    const content = fs.readFileSync(
      "runtime/control_graph_projection.ts",
      "utf8",
    )

    assert.ok(
      content.includes(
        "observability_only",
      ),
    )

    assert.ok(
      content.includes(
        "runtime_authority: false",
      ),
    )
  },
)

test(
  "projection layer preserves replay neutrality",
  () => {
    const content = fs.readFileSync(
      "runtime/control_graph_projection.ts",
      "utf8",
    )

    assert.ok(
      content.includes(
        "replay_neutral: true",
      ),
    )

    assert.ok(
      content.includes(
        "verifyProjectionReplayNeutrality",
      ),
    )
  },
)

test(
  "projection layer supports federated envelopes",
  () => {
    const content = fs.readFileSync(
      "runtime/control_graph_projection.ts",
      "utf8",
    )

    assert.ok(
      content.includes(
        "FederatedProjectionEnvelope",
      ),
    )

    assert.ok(
      content.includes(
        "verifyFederatedEnvelope",
      ),
    )
  },
)
