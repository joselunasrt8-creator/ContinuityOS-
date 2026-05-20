# MindShift Replay Semantics v1

MindShift delivery guarantees are explicit and bounded.
MindShift does not promise global exactly-once delivery.

## Canonical bounded guarantee

- Scope is the canonical legitimacy tuple: `decision_id + validated_object_hash` (and lineage-bound continuity/authority constraints).
- Duplicate execution attempts in the same scope must fail deterministically as `NULL`.
- Retry after acknowledgement loss must not produce a second proof.
- Proof persistence is the source of truth for completed legitimacy.
- Transport or queue acknowledgement is not proof.

## Required replay controls

Every executable object requires nonce, continuity lineage, replay scope, replay expiry, authority lifecycle, consumed-state check, and duplicate hash detection.
Replay scope binds identity_id, session_id, continuity_id, decision_id, validated_object_hash, invocation_nonce, and target environment.
Reuse across resumed sessions, revoked continuities, consumed authority lineages, duplicate delegation chains, or duplicate proof lineage resolves `NULL`.

## Continuity and missing requirements

If replay semantics inputs are missing (for example, invocation nonce) or continuity requirements fail, the runtime fails closed as `NULL` and no legitimacy lifecycle is advanced.
