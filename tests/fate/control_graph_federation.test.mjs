import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph federation layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_federation.ts",
      ),
    )
  },
)

test(
  "federation layer remains observability only",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_federation.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `"observability_only"`,
      ),
    )

    assert.ok(
      content.includes(
        `runtime_authority: false`,
      ),
    )
  },
)

test(
  "federation layer preserves replay neutrality",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_federation.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `replay_neutral: true`,
      ),
    )

    assert.ok(
      content.includes(
        `verifyReplayNeutrality`,
      ),
    )
  },
)

test(
  "federation layer preserves append-only semantics",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_federation.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `append_only: true`,
      ),
    )

    assert.ok(
      content.includes(
        `appendTopologyRecord`,
      ),
    )

    assert.ok(
      content.includes(
        `appendDriftRecord`,
      ),
    )
  },
)

test(
  "federation layer preserves sovereignty",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_federation.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `sovereignty_preserved`,
      ),
    )

    assert.ok(
      content.includes(
        `verifySovereigntyPreservation`,
      ),
    )
  },
)

test(
  "federation layer exports projection envelopes",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_federation.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `exportFederationProjection`,
      ),
    )

    assert.ok(
      content.includes(
        `FederationEnvelope`,
      ),
    )
  },
)
