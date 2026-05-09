# MindShift Trace Lineage v1

Every runtime transition propagates trace_id, continuity_id, decision_id, and validated_object_hash. These fields provide cross-system legitimacy observability and allow external systems to verify identity lineage, authority lineage, exact object integrity, proof integrity, replay validity, and revocation status without trusting proprietary internals.

Required registries: identity_registry, continuity_registry, authority_registry, aeo_registry, validation_registry, execution_registry, proof_registry, and drift_registry.

Serialization rules: deterministic key ordering, UTF-8 normalization, stable whitespace elimination, JCS-compatible canonical hash derivation, and hash drift → NULL. Same object → same hash.
