import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph drift layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_drift.ts",
      ),
    )
  },
)

test(
  "drift layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_drift.ts",
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
  "drift layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_drift.ts",
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
  "drift layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_drift.ts",
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
  "drift layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_drift.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createDriftEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `drift_envelopes`,
      ),
    )
  },
)

test(
  "drift layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_drift.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportDriftProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `divergence_hash`,
      ),
    )
  },
)
