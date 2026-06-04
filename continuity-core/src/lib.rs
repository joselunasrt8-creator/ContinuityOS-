//! Correctness-critical ContinuityOS primitives.
//!
//! This crate is intentionally pure: it contains no HTTP server, database layer,
//! network calls, CLI, deployment logic, GitHub integration, AI runtime, authority
//! creation, or state-changing execution surfaces.

pub mod aeo_validation;
pub mod canonicalization;
pub mod hashing;
pub mod lineage;
pub mod proof;
pub mod reconciliation;
pub mod replay;
pub mod types;

pub use types::*;

#[cfg(test)]
mod tests {
    use super::aeo_validation::{aeo_object_for_hash, validate_aeo, AeoValidationContext};
    use super::canonicalization::{canonical_string, JsonValue};
    use super::hashing::canonical_sha256_hex;
    use super::lineage::{LineageGraph, LineageNode};
    use super::proof::{ExecutionEvidence, ProofEnvelope};
    use super::reconciliation::{classify_reconciliation, ReconciliationEvidence};
    use super::replay::ReplayRegistry;
    use super::types::*;

    fn obj(fields: Vec<(&str, JsonValue)>) -> JsonValue {
        JsonValue::object(fields)
    }
    fn arr(items: Vec<JsonValue>) -> JsonValue {
        JsonValue::array(items)
    }
    fn s(value: &str) -> JsonValue {
        JsonValue::string(value)
    }
    fn n(value: &str) -> JsonValue {
        JsonValue::number(value).unwrap()
    }
    fn authority_id(value: &str) -> AuthorityId {
        AuthorityId::new(value).unwrap()
    }
    fn lineage_id(value: &str) -> LineageId {
        LineageId::new(value).unwrap()
    }
    fn object_hash(value: &JsonValue) -> ObjectHash {
        ObjectHash::new(canonical_sha256_hex(value).unwrap()).unwrap()
    }

    fn set_path(value: &mut JsonValue, path: &[&str], replacement: JsonValue) {
        let mut current = value;
        for segment in &path[..path.len() - 1] {
            current = current.as_object_mut().unwrap().get_mut(*segment).unwrap();
        }
        current
            .as_object_mut()
            .unwrap()
            .insert(path[path.len() - 1].to_string(), replacement);
    }

    fn base_aeo() -> JsonValue {
        let mut aeo = obj(vec![
            (
                "intent",
                obj(vec![
                    ("id", s("intent-1")),
                    ("authority_id", s("authority-1")),
                    ("nonce", s("nonce-1")),
                ]),
            ),
            (
                "scope",
                obj(vec![
                    ("authority_id", s("authority-1")),
                    ("bounds", arr(vec![s("system:alpha"), s("action:write")])),
                ]),
            ),
            (
                "validation",
                obj(vec![
                    ("authority_id", s("authority-1")),
                    ("lineage_id", s("lineage-1")),
                    ("object_hash", JsonValue::Null),
                ]),
            ),
            (
                "target",
                obj(vec![
                    ("authority_id", s("authority-1")),
                    ("system", s("system:alpha")),
                    ("action", s("action:write")),
                ]),
            ),
            (
                "finality",
                obj(vec![
                    ("authority_id", s("authority-1")),
                    ("mode", s("deterministic")),
                ]),
            ),
        ]);
        let hash = canonical_sha256_hex(&aeo_object_for_hash(&aeo)).unwrap();
        set_path(&mut aeo, &["validation", "object_hash"], s(&hash));
        aeo
    }

    fn context() -> AeoValidationContext {
        AeoValidationContext {
            expected_authority: authority_id("authority-1"),
            maximum_scope: ScopeBounds::new(vec![
                "system:alpha".to_string(),
                "action:write".to_string(),
                "action:read".to_string(),
            ])
            .unwrap(),
        }
    }

    #[test]
    fn same_object_with_reordered_keys_hashes_identically() {
        let left = obj(vec![
            ("b", n("2")),
            (
                "a",
                obj(vec![
                    ("y", JsonValue::Bool(true)),
                    ("x", arr(vec![n("3"), n("1")])),
                ]),
            ),
        ]);
        let right = obj(vec![
            (
                "a",
                obj(vec![
                    ("x", arr(vec![n("3"), n("1")])),
                    ("y", JsonValue::Bool(true)),
                ]),
            ),
            ("b", n("2")),
        ]);

        assert_eq!(
            canonical_string(&left).unwrap(),
            canonical_string(&right).unwrap()
        );
        assert_eq!(
            canonical_sha256_hex(&left).unwrap(),
            canonical_sha256_hex(&right).unwrap()
        );
    }

    #[test]
    fn extra_aeo_field_returns_null() {
        let mut aeo = base_aeo();
        aeo.as_object_mut()
            .unwrap()
            .insert("extra".to_string(), s("scope expansion"));

        assert_eq!(validate_aeo(&aeo, &context()), ValidationDecision::Null);
    }

    #[test]
    fn missing_aeo_field_returns_null() {
        let mut aeo = base_aeo();
        aeo.as_object_mut().unwrap().remove("finality");

        assert_eq!(validate_aeo(&aeo, &context()), ValidationDecision::Null);
    }

    #[test]
    fn mutated_post_validation_object_returns_null() {
        let mut aeo = base_aeo();
        assert_eq!(validate_aeo(&aeo, &context()), ValidationDecision::Valid);

        set_path(&mut aeo, &["target", "action"], s("action:read"));

        assert_eq!(validate_aeo(&aeo, &context()), ValidationDecision::Null);
    }

    #[test]
    fn reused_nonce_returns_null() {
        let mut registry = ReplayRegistry::new();
        let nonce = Nonce::new("nonce-1").unwrap();
        let hash = object_hash(&obj(vec![("object", n("1"))]));
        let lineage = lineage_id("lineage-1");

        assert_eq!(
            registry.admit(nonce.clone(), hash.clone(), &lineage),
            ReplayState::Unused
        );
        assert_eq!(registry.admit(nonce, hash, &lineage), ReplayState::Null);
    }

    #[test]
    fn orphan_lineage_returns_null() {
        let mut graph = LineageGraph::new();
        let child = lineage_id("child");
        let missing_parent = lineage_id("missing-parent");
        graph.insert(LineageNode::execution(child.clone(), vec![missing_parent]));

        assert_eq!(graph.classify_as_validation(&child), LineageState::Null);
    }

    #[test]
    fn proof_envelope_cannot_be_created_without_evidence() {
        let proof_id = ProofId::new("proof-1").unwrap();

        assert!(ProofEnvelope::from_evidence(proof_id, None).is_none());
    }

    #[test]
    fn proof_envelope_can_be_created_with_evidence() {
        let evidence = ExecutionEvidence::new(
            ExecutionId::new("execution-1").unwrap(),
            DecisionId::new("decision-1").unwrap(),
            object_hash(&obj(vec![("aeo", n("1"))])),
            TargetSystem::new("system:alpha").unwrap(),
            TargetAction::new("action:write").unwrap(),
            "accepted".to_string(),
            "2026-06-04T00:00:00Z".to_string(),
            obj(vec![("observed", JsonValue::Bool(true))]),
        )
        .unwrap();

        let envelope =
            ProofEnvelope::from_evidence(ProofId::new("proof-1").unwrap(), Some(evidence));

        assert!(envelope.is_some());
    }

    #[test]
    fn ambiguous_reconciliation_does_not_return_reconciled() {
        let hash = object_hash(&obj(vec![("same", JsonValue::Bool(true))]));
        let evidence = ReconciliationEvidence {
            expected_hash: Some(hash.clone()),
            observed_hash: Some(hash),
            lineage_complete: true,
            proof_present: true,
            observations_complete: true,
            ambiguity_detected: true,
        };

        assert_eq!(
            classify_reconciliation(Some(&evidence)),
            ReconciliationState::Ambiguous
        );
    }
}
