import test from "node:test";
import assert from "node:assert/strict";

import {
  generatePortableLegitimacyBundle,
  PORTABILITY_DRIFT_CLASSES
} from "../../runtime/portable_legitimacy_bundle_generator.mjs";

test("portable legitimacy bundle is deterministic and replay-neutral", () => {
  const result = generatePortableLegitimacyBundle({
    runtime_id: "runtime-a",
    topology_hash: "topology-1",
    proofs: [
      {
        proof_id: "proof-1",
        execution_hash: "exec-1"
      }
    ]
  });

  assert.equal(result.status, "VALID");

  assert.equal(result.bundle.replay_neutral, true);
  assert.equal(result.bundle.append_only, true);
  assert.equal(result.bundle.authority_portable, false);
});

test("authority portability attempts fail closed", () => {
  const result = generatePortableLegitimacyBundle({
    runtime_id: "runtime-a",
    topology_hash: "topology-1",
    proofs: [],
    authorities: [
      {
        authority_id: "auth-1"
      }
    ]
  });

  assert.equal(result.status, "NULL");

  assert.equal(
    result.drift,
    PORTABILITY_DRIFT_CLASSES.AUTHORITY_PORTABILITY_ATTEMPT
  );
});

test("scope escape fails closed", () => {
  const result = generatePortableLegitimacyBundle({
    runtime_id: "runtime-a",
    topology_hash: "topology-1",
    proofs: [],
    scope: "unbounded"
  });

  assert.equal(result.status, "NULL");

  assert.equal(
    result.drift,
    PORTABILITY_DRIFT_CLASSES.PORTABILITY_SCOPE_ESCAPE
  );
});

test("bundle hashes remain deterministic", () => {
  const config = {
    runtime_id: "runtime-a",
    topology_hash: "topology-1",
    proofs: [
      {
        proof_id: "proof-1",
        execution_hash: "exec-1"
      }
    ]
  };

  const a = generatePortableLegitimacyBundle(config);
  const b = generatePortableLegitimacyBundle(config);

  assert.equal(a.bundle_hash, b.bundle_hash);
});
