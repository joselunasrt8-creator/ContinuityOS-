import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileFederatedSovereignty,
  FEDERATION_DRIFT_CLASSES
} from "../../runtime/federated_sovereignty_drift_coordinator.mjs";

test("federated sovereignty reconciliation remains bounded and non-authoritative", () => {
  const result = reconcileFederatedSovereignty({
    localRuntime: {
      runtime_id: "local-a",
      topology_hash: "hash-1"
    },
    remoteRuntime: {
      runtime_id: "remote-b",
      expected_local_topology_hash: "hash-1"
    }
  });

  assert.equal(result.status, "VALID");
  assert.equal(
    result.checkpoint.authority_inheritance,
    false
  );

  assert.equal(result.checkpoint.replay_neutral, true);
  assert.equal(result.checkpoint.append_only, true);
});

test("remote authority inheritance fails closed", () => {
  const result = reconcileFederatedSovereignty({
    allowAuthorityInheritance: true,
    localRuntime: {
      runtime_id: "local-a",
      topology_hash: "hash-1"
    },
    remoteRuntime: {
      runtime_id: "remote-b",
      expected_local_topology_hash: "hash-1"
    }
  });

  assert.equal(result.status, "NULL");

  assert.equal(
    result.drift,
    FEDERATION_DRIFT_CLASSES.REMOTE_AUTHORITY_INHERITANCE
  );
});

test("federated topology divergence fails closed", () => {
  const result = reconcileFederatedSovereignty({
    localRuntime: {
      runtime_id: "local-a",
      topology_hash: "hash-x"
    },
    remoteRuntime: {
      runtime_id: "remote-b",
      expected_local_topology_hash: "hash-y"
    }
  });

  assert.equal(result.status, "NULL");

  assert.equal(
    result.drift,
    FEDERATION_DRIFT_CLASSES.FEDERATED_TOPOLOGY_DIVERGENCE
  );
});

test("checkpoint hashes remain deterministic", () => {
  const localRuntime = {
    runtime_id: "local-a",
    topology_hash: "hash-1"
  };

  const remoteRuntime = {
    runtime_id: "remote-b",
    expected_local_topology_hash: "hash-1"
  };

  const a = reconcileFederatedSovereignty({
    localRuntime,
    remoteRuntime
  });

  const b = reconcileFederatedSovereignty({
    localRuntime,
    remoteRuntime
  });

  assert.equal(a.checkpoint_hash, b.checkpoint_hash);
});
