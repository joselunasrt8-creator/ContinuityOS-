import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph lineage layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_lineage.ts",
      ),
    )
  },
)

test(
  "lineage layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_lineage.ts",
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
  "lineage layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_lineage.ts",
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
  "lineage layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_lineage.ts",
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
  "lineage layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_lineage.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createLineageEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `lineage_envelopes`,
      ),
    )
  },
)

test(
  "lineage layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_lineage.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportLineageProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `continuity_hash`,
      ),
    )
  },
)
