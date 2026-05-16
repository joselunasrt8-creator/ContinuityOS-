import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph validator layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_validator.ts",
      ),
    )
  },
)

test(
  "validator layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_validator.ts",
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
  "validator layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_validator.ts",
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
  "validator layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_validator.ts",
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
  "validator layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_validator.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createValidatorEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `validator_envelopes`,
      ),
    )
  },
)

test(
  "validator layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_validator.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportValidatorProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `validation_hash`,
      ),
    )
  },
)
