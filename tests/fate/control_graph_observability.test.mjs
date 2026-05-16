import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph observability layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_observability.ts",
      ),
    )
  },
)

test(
  "observability layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_observability.ts",
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
  "observability layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_observability.ts",
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
  "observability layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_observability.ts",
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
  "observability layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_observability.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createObservabilityEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `observability_envelopes`,
      ),
    )
  },
)

test(
  "observability layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_observability.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportObservabilityProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `telemetry_hash`,
      ),
    )
  },
)
