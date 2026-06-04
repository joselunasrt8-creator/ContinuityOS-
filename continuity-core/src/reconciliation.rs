use crate::types::{ObjectHash, ReconciliationState};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReconciliationEvidence {
    pub expected_hash: Option<ObjectHash>,
    pub observed_hash: Option<ObjectHash>,
    pub lineage_complete: bool,
    pub proof_present: bool,
    pub observations_complete: bool,
    pub ambiguity_detected: bool,
}

pub fn classify_reconciliation(evidence: Option<&ReconciliationEvidence>) -> ReconciliationState {
    let Some(evidence) = evidence else {
        return ReconciliationState::Null;
    };

    let (Some(expected_hash), Some(observed_hash)) =
        (&evidence.expected_hash, &evidence.observed_hash)
    else {
        return ReconciliationState::Partial;
    };

    if evidence.ambiguity_detected {
        return ReconciliationState::Ambiguous;
    }

    if !evidence.lineage_complete || !evidence.proof_present || !evidence.observations_complete {
        return ReconciliationState::Partial;
    }

    if expected_hash == observed_hash {
        ReconciliationState::Reconciled
    } else {
        ReconciliationState::Divergent
    }
}
