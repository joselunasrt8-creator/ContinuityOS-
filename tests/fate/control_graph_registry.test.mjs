import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph registry layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_registry.ts",
      ),
    )
  },
)

test(
  "registry layer remains observability only",
  () => {
    const content = fs.readFileSync(
      "runtime/control_graph_registry.ts",
      "utf8",
    )

    assert.ok(
      content.includes(
        "observability_only",
      ),
    )

    assert.ok(
      content.includes(
        "runtime_authority: false",
      ),
    )
  },
)

test(
  "registry layer preserves append-only semantics",
  () => {
    const content = fs.readFileSync(
      "runtime/control_graph_registry.ts",
      "utf8",
    )

    assert.ok(
      content.includes(
        "append_only: true",
      ),
    )

    assert.ok(
      content.includes(
        "verifyAppendOnlyInvariant",
      ),
    )
  },
)

test(
  "registry layer preserves replay neutrality",
  () => {
    const content = fs.readFileSync(
      "runtime/control_graph_registry.ts",
      "utf8",
    )

    assert.ok(
      content.includes(
        "verifyReplayNeutrality",
      ),
    )

    assert.ok(
      content.includes(
        "replay_neutral: true",
      ),
    )
  },
)
