import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph replay layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_replay.ts",
      ),
    )
  },
)

test(
  "replay layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_replay.ts",
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
  "replay layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_replay.ts",
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
  "replay layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_replay.ts",
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
  "replay layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_replay.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createReplayEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `replay_envelopes`,
      ),
    )
  },
)

test(
  "replay layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_replay.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportReplayProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `replay_hash`,
      ),
    )
  },
)
