import test from "node:test";
import assert from "node:assert/strict";

import {
  recursivelyQuarantine
} from "../../runtime/recursive_quarantine_orchestrator.mjs";

test("valid reconciliation does not quarantine", () => {
  const result =
    recursivelyQuarantine({
      reconciliation: {
        status: "VALID"
      }
    });

  assert.equal(
    result.quarantine.status,
    "VALID"
  );
});

test("invalid reconciliation quarantines affected scopes", () => {
  const result =
    recursivelyQuarantine({
      reconciliation: {
        status: "NULL"
      }
    });

  assert.equal(
    result.quarantine.status,
    "QUARANTINED"
  );

  assert.equal(
    result.quarantine.affected_scopes.includes(
      "runtime"
    ),
    true
  );
});

test("quarantine checkpoints are deterministic", () => {
  const first =
    recursivelyQuarantine({
      reconciliation: {
        status: "NULL"
      }
    });

  const second =
    recursivelyQuarantine({
      reconciliation: {
        status: "NULL"
      }
    });

  assert.equal(
    first.checkpoint,
    second.checkpoint
  );
});

