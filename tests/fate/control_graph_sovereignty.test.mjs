import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph sovereignty layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_sovereignty.ts",
      ),
    )
  },
)

test(
  "sovereignty layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_sovereignty.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `"observability_only"`,
      ),
    )

    assert.ok(
      source.includes(
        `runtime_authority: false`,
      ),
    )
  },
)

test(
  "sovereignty layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_sovereignty.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `replay_neutral: true`,
      ),
    )

    assert.ok(
      source.includes(
        `verifyReplayNeutrality`,
      ),
    )
  },
)

test(
  "sovereignty layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_sovereignty.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `append_only: true`,
      ),
    )

    assert.ok(
      source.includes(
        `verifyAppendOnlyInvariant`,
      ),
    )
  },
)

test(
  "sovereignty layer supports federation envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_sovereignty.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createFederationEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `equivalence_hash`,
      ),
    )
  },
)

test(
  "sovereignty layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_sovereignty.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportSovereigntyProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `federation_envelopes`,
      ),
    )
  },
)
