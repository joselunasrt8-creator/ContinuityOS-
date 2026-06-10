# Recorded demo transcript

This is a verbatim transcript of `npm install && npm run demo`, run from a
fresh clone of this repository on its default branch. It is the recorded
artifact referenced from the top-level README's "Recorded Demo Evidence"
section.

To reproduce:

```bash
git clone https://github.com/joselunasrt8-creator/mindshift-demo.git
cd mindshift-demo
npm install
npm run demo
```

## Transcript

```text
$ npm install

15 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

$ npm run demo

> mindshift-demo@1.0.0 demo
> node demo/portability/filesystem-governed-execution.mjs

{
  "demo": "filesystem-governed-execution-reference-adapter",
  "model_input": "any-model",
  "route": "/gateway/tool/filesystem-write",
  "invariant": "validated_object_hash == executed_object_hash; NULL emits no proof and no lineage",
  "valid": {
    "status": "EXECUTED",
    "target_path": "governed/filesystem-write-gateway/seed.md",
    "bytes_written": 49,
    "receipt_id": "sha256:63d675a4a365ce9951ce8cc79eda3d41356569b65d61a8cf4462ed58ebfa7f57",
    "validated_object_hash": "sha256:e41c6e2d731642223b6f1a1a0a05058a6042b176c19a4eefe5545b49cf82fadc",
    "executed_object_hash": "sha256:e41c6e2d731642223b6f1a1a0a05058a6042b176c19a4eefe5545b49cf82fadc",
    "exact_object_preserved": true,
    "proof_persisted": true,
    "lineage_persisted": true,
    "proof_lineage_bound": true
  },
  "null_replay": {
    "agent_visible_response": {
      "route": "/gateway/tool/filesystem-write",
      "mutation_capability": true,
      "execution_capability": true,
      "proof_generating": true,
      "creates_authority": false,
      "result": "NULL",
      "execution_performed": false,
      "proof_emitted": false,
      "correlation_id": "null_evt_d72221560380112792191263420b2a0e"
    },
    "operator_audit_record": {
      "correlation_id": "null_evt_d72221560380112792191263420b2a0e",
      "reason_class": "REPLAY_NULL",
      "stage": "replay",
      "denial_reason": "REPLAY_NONCE_CONSUMED",
      "agent_id": "model:any-model",
      "session_id": "portable-demo-session",
      "atao_id": null,
      "canonical_aeo_hash": null,
      "decision_id": "AUTH-filesystem-write-gateway-001",
      "replay_nonce": "portable-demo-valid-nonce",
      "validator_version": "omega_fs_v1",
      "execution_performed": false,
      "proof_emitted": false,
      "created_at": "2026-06-10T04:52:11.116Z"
    },
    "proof_count_before": 1,
    "proof_count_after": 1,
    "lineage_count_before": 1,
    "lineage_count_after": 1,
    "no_new_proof": true,
    "no_new_lineage": true
  },
  "null_denied_path": {
    "agent_visible_response": {
      "route": "/gateway/tool/filesystem-write",
      "mutation_capability": true,
      "execution_capability": true,
      "proof_generating": true,
      "creates_authority": false,
      "result": "NULL",
      "execution_performed": false,
      "proof_emitted": false,
      "correlation_id": "null_evt_421992363fdbe2c30830c2a85e185fe9"
    },
    "operator_audit_record": {
      "correlation_id": "null_evt_421992363fdbe2c30830c2a85e185fe9",
      "reason_class": "POLICY_NULL",
      "stage": "validate",
      "denial_reason": "PATH_NOT_ALLOWED",
      "agent_id": "model:any-model",
      "session_id": "portable-demo-session",
      "atao_id": null,
      "canonical_aeo_hash": null,
      "decision_id": "AUTH-filesystem-write-gateway-001",
      "replay_nonce": "portable-demo-denied-path-nonce",
      "validator_version": "omega_fs_v1",
      "execution_performed": false,
      "proof_emitted": false,
      "created_at": "2026-06-10T04:52:11.120Z"
    },
    "proof_count_before": 1,
    "proof_count_after": 1,
    "lineage_count_before": 1,
    "lineage_count_after": 1,
    "no_new_proof": true,
    "no_new_lineage": true
  },
  "adapter_state": {
    "virtual_filesystem_paths": [
      "governed/filesystem-write-gateway/seed.md"
    ],
    "proof_receipts": [
      "sha256:63d675a4a365ce9951ce8cc79eda3d41356569b65d61a8cf4462ed58ebfa7f57"
    ],
    "lineage_nodes": [
      "lineage:sha256:63d675a4a365ce9951ce8cc79eda3d41356569b65d61a8cf4462ed58ebfa7f57"
    ]
  }
}
```

## What this transcript shows

| Scenario | `result` | proof emitted | lineage appended | Invariant |
| --- | --- | --- | --- | --- |
| VALID | `EXECUTED` | yes | yes | `validated_object_hash == executed_object_hash` |
| Replay | `NULL` (`REPLAY_NULL` / `REPLAY_NONCE_CONSUMED`) | no | no | replayed nonce rejected |
| Policy-denied path | `NULL` (`POLICY_NULL` / `PATH_NOT_ALLOWED`) | no | no | denied path rejected |

The agent only ever sees `{ result, execution_performed, proof_emitted,
correlation_id }` for NULL outcomes. The `reason_class` / `stage` /
`denial_reason` fields shown above come from the operator-side audit
registry, keyed by `correlation_id`, and are not exposed to the agent.
