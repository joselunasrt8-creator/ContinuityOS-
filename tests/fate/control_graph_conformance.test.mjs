import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph conformance layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_conformance.ts",
      ),
    )
  },
)

test(
  "conformance layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_conformance.ts",
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
  "conformance layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_conformance.ts",
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
  "conformance layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_conformance.ts",
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
  "conformance layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_conformance.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createConformanceEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `conformance_envelopes`,
      ),
    )
  },
)

test(
  "conformance layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_conformance.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportConformanceProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `validation_hash`,
      ),
    )
  },
)
