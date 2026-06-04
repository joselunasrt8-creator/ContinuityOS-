use std::fmt::{Display, Formatter};

#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct NonEmptyString(String);

impl NonEmptyString {
    pub fn new(value: impl Into<String>) -> Option<Self> {
        let value = value.into();
        if value.trim().is_empty() {
            None
        } else {
            Some(Self(value))
        }
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for NonEmptyString {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AuthorityId(NonEmptyString);
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct LineageId(NonEmptyString);
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Nonce(NonEmptyString);
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ObjectHash(NonEmptyString);
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ProofId(NonEmptyString);
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ExecutionId(NonEmptyString);
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct DecisionId(NonEmptyString);
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TargetSystem(NonEmptyString);
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TargetAction(NonEmptyString);

macro_rules! strict_id {
    ($name:ident) => {
        impl $name {
            pub fn new(value: impl Into<String>) -> Option<Self> {
                NonEmptyString::new(value).map(Self)
            }
            pub fn as_str(&self) -> &str {
                self.0.as_str()
            }
        }
        impl Display for $name {
            fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }
    };
}

strict_id!(AuthorityId);
strict_id!(LineageId);
strict_id!(Nonce);
strict_id!(ProofId);
strict_id!(ExecutionId);
strict_id!(DecisionId);
strict_id!(TargetSystem);
strict_id!(TargetAction);

impl ObjectHash {
    pub fn new(value: impl Into<String>) -> Option<Self> {
        let value = value.into();
        let is_lower_hex = value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
        if is_lower_hex {
            NonEmptyString::new(value).map(Self)
        } else {
            None
        }
    }
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}
impl Display for ObjectHash {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ValidationDecision {
    Valid,
    Null,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReplayState {
    Unused,
    Used,
    Ambiguous,
    Null,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReconciliationState {
    Reconciled,
    Divergent,
    Ambiguous,
    Partial,
    Null,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LineageState {
    Valid,
    Orphan,
    Ambiguous,
    Null,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScopeBounds(Vec<String>);
impl ScopeBounds {
    pub fn new(bounds: Vec<String>) -> Option<Self> {
        if bounds.is_empty() || bounds.iter().any(|bound| bound.trim().is_empty()) {
            return None;
        }
        Some(Self(bounds))
    }
    pub fn contains_all(&self, requested: &ScopeBounds) -> bool {
        requested.0.iter().all(|bound| self.0.contains(bound))
    }
    pub fn as_slice(&self) -> &[String] {
        &self.0
    }
}
