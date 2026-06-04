use crate::types::{LineageId, Nonce, ObjectHash, ReplayState};
use std::collections::BTreeSet;

#[derive(Clone, Debug, Default)]
pub struct ReplayRegistry {
    used_nonces: BTreeSet<Nonce>,
    used_object_hashes: BTreeSet<ObjectHash>,
}

impl ReplayRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn classify(
        &self,
        nonce: Option<&Nonce>,
        object_hash: Option<&ObjectHash>,
        lineage_binding: Option<&LineageId>,
    ) -> ReplayState {
        let (Some(nonce), Some(object_hash), Some(_lineage_binding)) =
            (nonce, object_hash, lineage_binding)
        else {
            return ReplayState::Null;
        };

        let nonce_used = self.used_nonces.contains(nonce);
        let hash_used = self.used_object_hashes.contains(object_hash);
        match (nonce_used, hash_used) {
            (false, false) => ReplayState::Unused,
            (true, true) => ReplayState::Used,
            (true, false) | (false, true) => ReplayState::Ambiguous,
        }
    }

    pub fn admit(
        &mut self,
        nonce: Nonce,
        object_hash: ObjectHash,
        lineage_binding: &LineageId,
    ) -> ReplayState {
        match self.classify(Some(&nonce), Some(&object_hash), Some(lineage_binding)) {
            ReplayState::Unused => {
                self.used_nonces.insert(nonce);
                self.used_object_hashes.insert(object_hash);
                ReplayState::Unused
            }
            ReplayState::Used | ReplayState::Ambiguous => ReplayState::Null,
            ReplayState::Null => ReplayState::Null,
        }
    }
}
