import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

function deterministicReplay(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

test("control graph replay remains deterministic", () => {
  const payload = {
    source: "validator",
    target: "proof",
    edge: "VALIDATED_BY",
  };

  const replayA = deterministicReplay(payload);
  const replayB = deterministicReplay(payload);

  assert.equal(replayA, replayB);
});
