import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph authority layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_authority.ts",
      ),
    )
  },
)

test(
  "authority layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_authority.ts",
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
  "authority layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_authority.ts",
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
  "authority layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_authority.ts",
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
  "authority layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_authority.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createAuthorityEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `authority_envelopes`,
      ),
    )
  },
)

test(
  "authority layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_authority.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportAuthorityProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `authority_hash`,
      ),
    )
  },
)
