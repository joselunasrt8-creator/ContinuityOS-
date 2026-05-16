import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph equivalence layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_equivalence.ts",
      ),
    )
  },
)

test(
  "equivalence layer remains observability only",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_equivalence.ts",
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
  "equivalence layer preserves replay neutrality",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_equivalence.ts",
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
  "equivalence layer preserves append-only semantics",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_equivalence.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `append_only: true`,
      ),
    )

    assert.ok(
      content.includes(
        `appendEquivalenceRecord`,
      ),
    )

    assert.ok(
      content.includes(
        `appendDivergenceRecord`,
      ),
    )
  },
)

test(
  "equivalence layer validates deterministic equivalence",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_equivalence.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `verifyDeterministicEquivalence`,
      ),
    )

    assert.ok(
      content.includes(
        `equivalent`,
      ),
    )
  },
)

test(
  "equivalence layer exports projection envelopes",
  () => {
    const content =
      fs.readFileSync(
        "runtime/control_graph_equivalence.ts",
        "utf8",
      )

    assert.ok(
      content.includes(
        `exportEquivalenceProjection`,
      ),
    )

    assert.ok(
      content.includes(
        `TopologyEquivalenceRecord`,
      ),
    )
  },
)
