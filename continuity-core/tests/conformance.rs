//! V3 Conformance Suite — Rust side
//!
//! Proves that the Rust continuity-core crate produces the same canonical forms,
//! hashes, classifications, and proof envelopes as the TypeScript implementation
//! for every fixture in fixtures/conformance/.
//!
//! Fixtures own the expected values.  No implementation owns the truth.

use continuity_core::aeo_validation::{validate_aeo, AeoValidationContext};
use continuity_core::canonicalization::{canonical_string, JsonValue};
use continuity_core::hashing::canonical_sha256_hex;
use continuity_core::lineage::{LineageGraph, LineageKind, LineageNode};
use continuity_core::proof::{ExecutionEvidence, ProofEnvelope};
use continuity_core::reconciliation::{classify_reconciliation, ReconciliationEvidence};
use continuity_core::replay::ReplayRegistry;
use continuity_core::types::*;
use std::path::Path;

// ─── JSON fixture parsing helpers ────────────────────────────────────────────

fn fixtures_dir() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .join("fixtures")
        .join("conformance")
}

fn load_fixture(filename: &str) -> serde_json::Value {
    let path = fixtures_dir().join(filename);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read {}: {}", path.display(), e));
    serde_json::from_str(&text)
        .unwrap_or_else(|e| panic!("failed to parse {}: {}", path.display(), e))
}

fn to_json_value(v: &serde_json::Value) -> JsonValue {
    match v {
        serde_json::Value::Null => JsonValue::Null,
        serde_json::Value::Bool(b) => JsonValue::Bool(*b),
        serde_json::Value::Number(n) => JsonValue::number(n.to_string())
            .unwrap_or_else(|| panic!("malformed number: {}", n)),
        serde_json::Value::String(s) => JsonValue::string(s),
        serde_json::Value::Array(arr) => {
            JsonValue::array(arr.iter().map(to_json_value))
        }
        serde_json::Value::Object(map) => {
            JsonValue::object(map.iter().map(|(k, v)| (k.clone(), to_json_value(v))))
        }
    }
}

fn str_field<'a>(obj: &'a serde_json::Value, key: &str) -> &'a str {
    obj[key].as_str().unwrap_or_else(|| panic!("expected string field: {}", key))
}

// ─── 1. Canonicalization ──────────────────────────────────────────────────────

#[test]
fn canonicalization_fixtures() {
    let fixtures = load_fixture("canonicalization-fixtures.json");
    for fixture in fixtures.as_array().unwrap() {
        let id = str_field(fixture, "id");
        let input = to_json_value(&fixture["input"]);
        let expected_canonical = str_field(fixture, "expected_canonical");
        let expected_hash = str_field(fixture, "expected_hash");

        let canonical = canonical_string(&input)
            .unwrap_or_else(|e| panic!("[{}] canonicalization failed: {:?}", id, e));
        assert_eq!(canonical, expected_canonical, "[{}] canonical mismatch", id);

        let hash = canonical_sha256_hex(&input)
            .unwrap_or_else(|e| panic!("[{}] hashing failed: {:?}", id, e));
        assert_eq!(hash, expected_hash, "[{}] hash mismatch", id);
    }
}

// ─── 2. Identity hashing — reordered keys produce the same hash ───────────────

#[test]
fn hashing_reordered_keys_identical() {
    let a = JsonValue::object([("b", JsonValue::number("2").unwrap()), ("a", JsonValue::number("1").unwrap())]);
    let b = JsonValue::object([("a", JsonValue::number("1").unwrap()), ("b", JsonValue::number("2").unwrap())]);
    assert_eq!(canonical_string(&a).unwrap(), canonical_string(&b).unwrap());
    assert_eq!(canonical_sha256_hex(&a).unwrap(), canonical_sha256_hex(&b).unwrap());
}

// ─── 3. AEO validation ────────────────────────────────────────────────────────

fn make_aeo_context(fixture: &serde_json::Value) -> AeoValidationContext {
    let ctx = &fixture["context"];
    let authority = str_field(ctx, "expected_authority");
    let bounds: Vec<String> = ctx["maximum_scope"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    AeoValidationContext {
        expected_authority: AuthorityId::new(authority).unwrap(),
        maximum_scope: ScopeBounds::new(bounds).unwrap(),
    }
}

fn aeo_decision_str(decision: &ValidationDecision) -> &'static str {
    match decision {
        ValidationDecision::Valid => "VALID",
        ValidationDecision::Null => "NULL",
    }
}

#[test]
fn aeo_valid_fixture() {
    let fixture = load_fixture("aeo-valid.json");
    let aeo = to_json_value(&fixture["aeo"]);
    let context = make_aeo_context(&fixture);
    let expected = str_field(&fixture, "expected_decision");
    let result = validate_aeo(&aeo, &context);
    assert_eq!(aeo_decision_str(&result), expected);
}

#[test]
fn aeo_invalid_missing_field() {
    let fixture = load_fixture("invalid-missing-field.json");
    let aeo = to_json_value(&fixture["aeo"]);
    let context = make_aeo_context(&fixture);
    let result = validate_aeo(&aeo, &context);
    assert_eq!(aeo_decision_str(&result), "NULL");
}

#[test]
fn aeo_invalid_extra_field() {
    let fixture = load_fixture("invalid-extra-field.json");
    let aeo = to_json_value(&fixture["aeo"]);
    let context = make_aeo_context(&fixture);
    let result = validate_aeo(&aeo, &context);
    assert_eq!(aeo_decision_str(&result), "NULL");
}

#[test]
fn aeo_invalid_hash() {
    let fixture = load_fixture("invalid-hash.json");
    let aeo = to_json_value(&fixture["aeo"]);
    let context = make_aeo_context(&fixture);
    let result = validate_aeo(&aeo, &context);
    assert_eq!(aeo_decision_str(&result), "NULL");
}

#[test]
fn aeo_invalid_authority() {
    let fixture = load_fixture("invalid-authority.json");
    let aeo = to_json_value(&fixture["aeo"]);
    let context = make_aeo_context(&fixture);
    let result = validate_aeo(&aeo, &context);
    assert_eq!(aeo_decision_str(&result), "NULL");
}

#[test]
fn aeo_invalid_scope_overflow() {
    let fixture = load_fixture("invalid-scope-overflow.json");
    let aeo = to_json_value(&fixture["aeo"]);
    let context = make_aeo_context(&fixture);
    let result = validate_aeo(&aeo, &context);
    assert_eq!(aeo_decision_str(&result), "NULL");
}

// ─── 4. NULL invariant — mutation after validation ────────────────────────────

#[test]
fn null_invariant_mutation_after_validation() {
    let fixture = load_fixture("aeo-valid.json");
    let mut aeo = to_json_value(&fixture["aeo"]);
    let context = make_aeo_context(&fixture);

    assert_eq!(validate_aeo(&aeo, &context), ValidationDecision::Valid);

    aeo.as_object_mut()
        .unwrap()
        .get_mut("target")
        .unwrap()
        .as_object_mut()
        .unwrap()
        .insert("action".to_string(), JsonValue::string("action:read"));

    assert_eq!(validate_aeo(&aeo, &context), ValidationDecision::Null);
}

// ─── 5. Lineage verification ──────────────────────────────────────────────────

fn lineage_state_str(state: &LineageState) -> &'static str {
    match state {
        LineageState::Valid => "VALID",
        LineageState::Orphan => "ORPHAN",
        LineageState::Ambiguous => "AMBIGUOUS",
        LineageState::Null => "NULL",
    }
}

fn kind_from_str(s: &str) -> LineageKind {
    match s {
        "authority" => LineageKind::Authority,
        "proof" => LineageKind::Proof,
        "execution" => LineageKind::Execution,
        other => panic!("unknown lineage kind: {}", other),
    }
}

#[test]
fn lineage_fixtures() {
    let fixture = load_fixture("lineage-fixture.json");
    for case in fixture["cases"].as_array().unwrap() {
        let id = str_field(case, "id");
        let expected = str_field(case, "expected_state");

        let mut graph = LineageGraph::new();
        for node_json in case["graph"].as_array().unwrap() {
            let node_id = LineageId::new(str_field(node_json, "id")).unwrap();
            let kind = kind_from_str(str_field(node_json, "kind"));
            let parent_ids: Vec<LineageId> = node_json["parent_ids"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| LineageId::new(v.as_str().unwrap()).unwrap())
                .collect();
            let node = match kind {
                LineageKind::Authority => LineageNode::authority(node_id, parent_ids),
                LineageKind::Proof => LineageNode::proof(node_id, parent_ids),
                LineageKind::Execution => LineageNode::execution(node_id, parent_ids),
            };
            graph.insert(node);
        }

        let classify_id = LineageId::new(str_field(case, "classify_id")).unwrap();
        let state = graph.classify_as_validation(&classify_id);
        assert_eq!(lineage_state_str(&state), expected, "[{}] lineage mismatch", id);
    }
}

// ─── 6. Proof envelope ────────────────────────────────────────────────────────

#[test]
fn proof_fixtures() {
    let fixture = load_fixture("proof-fixture.json");
    for case in fixture["cases"].as_array().unwrap() {
        let id = str_field(case, "id");
        let proof_id = ProofId::new(str_field(case, "proof_id")).unwrap();
        let expected_has_envelope = case["expected_has_envelope"].as_bool().unwrap();

        let evidence = if case["evidence"].is_null() {
            None
        } else {
            let e = &case["evidence"];
            let execution_id = ExecutionId::new(str_field(e, "execution_id")).unwrap();
            let decision_id = DecisionId::new(str_field(e, "decision_id")).unwrap();
            let aeo_hash = ObjectHash::new(str_field(e, "aeo_hash")).unwrap();
            let target_system = TargetSystem::new(str_field(e, "target_system")).unwrap();
            let target_action = TargetAction::new(str_field(e, "target_action")).unwrap();
            let result = str_field(e, "result").to_string();
            let timestamp = str_field(e, "timestamp").to_string();
            let evidence_object = to_json_value(&e["evidence_object"]);
            ExecutionEvidence::new(
                execution_id, decision_id, aeo_hash,
                target_system, target_action,
                result, timestamp, evidence_object,
            )
        };

        let envelope = ProofEnvelope::from_evidence(proof_id, evidence);
        let has_envelope = envelope.is_some();
        assert_eq!(has_envelope, expected_has_envelope, "[{}] envelope presence mismatch", id);

        if expected_has_envelope {
            let env = envelope.unwrap();
            let expected_hash = str_field(case, "expected_evidence_hash");
            assert_eq!(env.evidence_hash.as_str(), expected_hash, "[{}] evidence_hash mismatch", id);
        }
    }
}

// ─── 7. Replay classification and NULL on reuse ───────────────────────────────

fn replay_state_str(state: &ReplayState) -> &'static str {
    match state {
        ReplayState::Unused => "UNUSED",
        ReplayState::Used => "USED",
        ReplayState::Ambiguous => "AMBIGUOUS",
        ReplayState::Null => "NULL",
    }
}

#[test]
fn replay_fixtures() {
    let fixture = load_fixture("invalid-replay.json");
    for case in fixture["cases"].as_array().unwrap() {
        let id = str_field(case, "id");
        let mut registry = ReplayRegistry::new();

        for prior in case["prior_admits"].as_array().unwrap() {
            let nonce = Nonce::new(str_field(prior, "nonce")).unwrap();
            let hash = ObjectHash::new(str_field(prior, "object_hash")).unwrap();
            let lineage = LineageId::new(str_field(prior, "lineage_binding")).unwrap();
            registry.admit(nonce, hash, &lineage);
        }

        if let Some(expected) = case["expected_admit_state"].as_str() {
            let nonce = Nonce::new(str_field(case, "nonce")).unwrap();
            let hash = ObjectHash::new(str_field(case, "object_hash")).unwrap();
            let lineage = LineageId::new(str_field(case, "lineage_binding")).unwrap();
            let result = registry.admit(nonce, hash, &lineage);
            assert_eq!(replay_state_str(&result), expected, "[{}] admit mismatch", id);
        }

        if let Some(expected) = case["expected_classify_state"].as_str() {
            let nonce_str = case["nonce"].as_str().map(|s| Nonce::new(s).unwrap());
            let hash_str = case["object_hash"].as_str().map(|s| ObjectHash::new(s).unwrap());
            let lineage_str = case["lineage_binding"].as_str().map(|s| LineageId::new(s).unwrap());
            let result = registry.classify(
                nonce_str.as_ref(),
                hash_str.as_ref(),
                lineage_str.as_ref(),
            );
            assert_eq!(replay_state_str(&result), expected, "[{}] classify mismatch", id);
        }
    }
}

// ─── 8. Reconciliation ───────────────────────────────────────────────────────

fn recon_state_str(state: &ReconciliationState) -> &'static str {
    match state {
        ReconciliationState::Reconciled => "RECONCILED",
        ReconciliationState::Divergent => "DIVERGENT",
        ReconciliationState::Ambiguous => "AMBIGUOUS",
        ReconciliationState::Partial => "PARTIAL",
        ReconciliationState::Null => "NULL",
    }
}

#[test]
fn reconciliation_null_evidence() {
    assert_eq!(recon_state_str(&classify_reconciliation(None)), "NULL");
}

#[test]
fn reconciliation_missing_hashes_partial() {
    let evidence = ReconciliationEvidence {
        expected_hash: None,
        observed_hash: None,
        lineage_complete: true,
        proof_present: true,
        observations_complete: true,
        ambiguity_detected: false,
    };
    assert_eq!(recon_state_str(&classify_reconciliation(Some(&evidence))), "PARTIAL");
}

#[test]
fn reconciliation_ambiguity_even_with_matching_hashes() {
    let hash_str = "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777";
    let hash = ObjectHash::new(hash_str).unwrap();
    let evidence = ReconciliationEvidence {
        expected_hash: Some(hash.clone()),
        observed_hash: Some(hash),
        lineage_complete: true,
        proof_present: true,
        observations_complete: true,
        ambiguity_detected: true,
    };
    assert_eq!(recon_state_str(&classify_reconciliation(Some(&evidence))), "AMBIGUOUS");
}

#[test]
fn reconciliation_matching_hashes_full_evidence_reconciled() {
    let hash_str = "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777";
    let hash = ObjectHash::new(hash_str).unwrap();
    let evidence = ReconciliationEvidence {
        expected_hash: Some(hash.clone()),
        observed_hash: Some(hash),
        lineage_complete: true,
        proof_present: true,
        observations_complete: true,
        ambiguity_detected: false,
    };
    assert_eq!(recon_state_str(&classify_reconciliation(Some(&evidence))), "RECONCILED");
}

#[test]
fn reconciliation_mismatched_hashes_divergent() {
    let h1 = ObjectHash::new("43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777").unwrap();
    let h2 = ObjectHash::new("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a").unwrap();
    let evidence = ReconciliationEvidence {
        expected_hash: Some(h1),
        observed_hash: Some(h2),
        lineage_complete: true,
        proof_present: true,
        observations_complete: true,
        ambiguity_detected: false,
    };
    assert_eq!(recon_state_str(&classify_reconciliation(Some(&evidence))), "DIVERGENT");
}
