use crate::canonicalization::JsonValue;
use crate::hashing::canonical_sha256_hex;
use crate::types::{AuthorityId, ScopeBounds, ValidationDecision};
use std::collections::{BTreeMap, BTreeSet};

const REQUIRED_FIELDS: [&str; 5] = ["intent", "scope", "validation", "target", "finality"];

#[derive(Clone, Debug)]
pub struct AeoValidationContext {
    pub expected_authority: AuthorityId,
    pub maximum_scope: ScopeBounds,
}

pub fn validate_aeo(value: &JsonValue, context: &AeoValidationContext) -> ValidationDecision {
    let Some(object) = value.as_object() else {
        return ValidationDecision::Null;
    };
    if !has_exact_required_fields(object) {
        return ValidationDecision::Null;
    }
    if !authority_fields_match(object, context.expected_authority.as_str()) {
        return ValidationDecision::Null;
    }
    let Some(requested_scope) = extract_scope_bounds(object) else {
        return ValidationDecision::Null;
    };
    if !context.maximum_scope.contains_all(&requested_scope) {
        return ValidationDecision::Null;
    }
    if !object_hash_matches(value, object) {
        return ValidationDecision::Null;
    }
    ValidationDecision::Valid
}

fn has_exact_required_fields(object: &BTreeMap<String, JsonValue>) -> bool {
    if object.len() != REQUIRED_FIELDS.len() {
        return false;
    }
    let required: BTreeSet<&str> = REQUIRED_FIELDS.into_iter().collect();
    object.keys().map(String::as_str).collect::<BTreeSet<_>>() == required
}

fn authority_fields_match(object: &BTreeMap<String, JsonValue>, expected: &str) -> bool {
    let paths = [
        ["intent", "authority_id"],
        ["scope", "authority_id"],
        ["validation", "authority_id"],
        ["target", "authority_id"],
        ["finality", "authority_id"],
    ];
    paths.iter().all(|path| {
        object
            .get(path[0])
            .and_then(JsonValue::as_object)
            .and_then(|nested| nested.get(path[1]))
            .and_then(JsonValue::as_str)
            == Some(expected)
    })
}

fn extract_scope_bounds(object: &BTreeMap<String, JsonValue>) -> Option<ScopeBounds> {
    let bounds = object
        .get("scope")?
        .as_object()?
        .get("bounds")?
        .as_array()?
        .iter()
        .map(|value| value.as_str().map(ToOwned::to_owned))
        .collect::<Option<Vec<String>>>()?;
    ScopeBounds::new(bounds)
}

fn object_hash_matches(value: &JsonValue, object: &BTreeMap<String, JsonValue>) -> bool {
    let Some(expected_hash) = object
        .get("validation")
        .and_then(JsonValue::as_object)
        .and_then(|validation| validation.get("object_hash"))
        .and_then(JsonValue::as_str)
    else {
        return false;
    };
    let normalized = aeo_object_for_hash(value);
    canonical_sha256_hex(&normalized).is_ok_and(|actual_hash| actual_hash == expected_hash)
}

pub fn aeo_object_for_hash(value: &JsonValue) -> JsonValue {
    let mut normalized = value.clone();
    if let Some(validation) = normalized
        .as_object_mut()
        .and_then(|object| object.get_mut("validation"))
        .and_then(JsonValue::as_object_mut)
    {
        validation.insert("object_hash".to_string(), JsonValue::Null);
    }
    normalized
}
