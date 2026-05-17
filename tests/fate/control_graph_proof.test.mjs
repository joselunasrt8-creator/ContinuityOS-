import test from "node:test"
import assert from "node:assert"
import fs from "node:fs"

test(
  "control graph proof layer exists",
  () => {
    assert.ok(
      fs.existsSync(
        "runtime/control_graph_proof.ts",
      ),
    )
  },
)

test(
  "proof layer remains observability only",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_proof.ts",
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
  "proof layer preserves replay neutrality",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_proof.ts",
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
  "proof layer preserves append-only semantics",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_proof.ts",
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
  "proof layer supports federated envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_proof.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `createProofEnvelope`,
      ),
    )

    assert.ok(
      source.includes(
        `proof_envelopes`,
      ),
    )
  },
)

test(
  "proof layer exports projection envelopes",
  () => {
    const source = fs.readFileSync(
      "runtime/control_graph_proof.ts",
      "utf8",
    )

    assert.ok(
      source.includes(
        `exportProofProjection`,
      ),
    )

    assert.ok(
      source.includes(
        `proof_hash`,
      ),
    )
  },
)
