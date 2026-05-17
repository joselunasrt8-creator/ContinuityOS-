import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph continuity layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_continuity.ts",
      ),
    )
  },
)

test(
  "continuity layer remains observability only",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_continuity.ts",
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
  "continuity layer preserves replay neutrality",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_continuity.ts",
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
  "continuity layer preserves append-only semantics",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_continuity.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `append_only: true`,
      ),
    )

    assert.ok(
      content.includes(
        `appendContinuityNode`,
      ),
    )

    assert.ok(
      content.includes(
        `appendContinuityEnvelope`,
      ),
    )
  },
)

test(
  "continuity layer validates chain integrity",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_continuity.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `verifyContinuityChain`,
      ),
    )

    assert.ok(
      content.includes(
        `parent_id`,
      ),
    )
  },
)

test(
  "continuity layer exports projection envelopes",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_continuity.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `exportContinuityProjection`,
      ),
    )

    assert.ok(
      content.includes(
        `ContinuityEnvelope`,
      ),
    )
  },
)
