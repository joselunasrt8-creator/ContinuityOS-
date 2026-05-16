import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph registry projection layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_registry_projection.ts",
      ),
    )
  },
)

test(
  "registry projection layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_registry_projection.ts",
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
  "registry projection layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_registry_projection.ts",
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
  "registry projection layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_registry_projection.ts",
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
  "registry projection layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_registry_projection.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createRegistryProjectionEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `projection_envelopes`,
      ),
    )
  },
)

test(
  "registry projection layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_registry_projection.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportRegistryProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `registry_hash`,
      ),
    )
  },
)
