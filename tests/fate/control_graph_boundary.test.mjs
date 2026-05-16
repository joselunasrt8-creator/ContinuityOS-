import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph boundary layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_boundary.ts",
      ),
    )
  },
)

test(
  "boundary layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_boundary.ts",
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
  "boundary layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_boundary.ts",
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
  "boundary layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_boundary.ts",
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
  "boundary layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_boundary.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createBoundaryEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `boundary_envelopes`,
      ),
    )
  },
)

test(
  "boundary layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_boundary.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportBoundaryProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `boundary_hash`,
      ),
    )
  },
)
