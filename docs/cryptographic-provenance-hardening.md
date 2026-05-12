# Cryptographic Provenance Hardening v2

Cryptographic provenance strengthens evidence integrity only. It is verification evidence, not authority, proof legitimacy, validation, replay clearance, federation trust, or execution legitimacy.

## Preserved invariant

If no valid object exists, nothing happens. A DSSE attestation is accepted only when the decoded payload is byte-for-byte equal to the canonical provenance payload for the already validated object. Payload drift returns `NULL`.

## Execution surface touched

The governed production deploy surface integrates attestation verification into `/execute` and `/proof` after authority and validation checks. The ordering remains:

1. authority
2. validation
3. provenance verification
4. execution boundary
5. proof persistence

The implementation never follows signature -> execution.

## Observability-only semantics

Telemetry and reconciliation routes remain evidence only. Observability does not repair, authorize, mutate, consume replay state, or create legitimacy.

## Reconciliation compatibility

The implementation preserves recursive reconciliation traversal, the scheduler, report surfaces, portable reconciliation envelopes, federated lineage verification, replay lineage validation, PREO lineage validation, and revocation propagation. Existing reconciliation drift classes are retained and the drift taxonomy is extended without overwriting them.

## Federation constraints

Remote signatures do not imply local authority, local validation, or execution legitimacy. Federated attestations are evidence only. Ambiguous federation lineage returns `NULL`, and remote replay state is not consumed locally.

## Replay guarantees

The attestation registry enforces uniqueness on:

- `envelope_hash`
- `workflow_run_id`
- `(decision_id, validated_object_hash)`

Replay ambiguity returns `NULL`, including ambiguous signer lineage.

## Fail-closed guarantees

The deterministic FATE coverage requires these cases to return `NULL`:

- `invalid_signature`
- `signer_mismatch`
- `payload_drift`
- `transparency_proof_absence`
- `replayed_attestation`
- `workflow_replay_collision`
- `canonical_payload_instability`
- `federated_attestation_ambiguity`
- `remote_legitimacy_inference`
- `reconciliation_compatibility`

## Exact-object verification guarantees

The validated payload must equal the canonical payload. The canonical payload binds:

- `decision_id`
- `validated_object_hash`
- `workflow_run_id`
- `workflow_sha`
- `canonical_aeo_hash`
- `signer_identity`
- transparency log evidence

The attestation registry persists only verification evidence for the exact object and does not mutate runtime legitimacy state.
