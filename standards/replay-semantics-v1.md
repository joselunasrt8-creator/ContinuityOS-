# MindShift Replay Semantics v1

Every executable object requires a nonce, continuity lineage, replay scope, replay expiry, authority lifecycle, consumed-state check, and duplicate hash detection. Replay scope must bind identity_id, session_id, continuity_id, decision_id, validated_object_hash, invocation_nonce, and target environment. Reuse across resumed sessions, revoked continuities, consumed authority lineages, or duplicate delegation chains resolves NULL.
