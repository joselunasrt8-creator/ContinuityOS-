use crate::canonicalization::JsonValue;
use crate::hashing::canonical_sha256_hex;
use crate::types::{DecisionId, ExecutionId, ObjectHash, ProofId, TargetAction, TargetSystem};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecutionEvidence {
    pub execution_id: ExecutionId,
    pub decision_id: DecisionId,
    pub aeo_hash: ObjectHash,
    pub target_system: TargetSystem,
    pub target_action: TargetAction,
    pub result: String,
    pub timestamp: String,
    pub evidence: JsonValue,
}

impl ExecutionEvidence {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        execution_id: ExecutionId,
        decision_id: DecisionId,
        aeo_hash: ObjectHash,
        target_system: TargetSystem,
        target_action: TargetAction,
        result: String,
        timestamp: String,
        evidence: JsonValue,
    ) -> Option<Self> {
        if result.trim().is_empty() || timestamp.trim().is_empty() || evidence == JsonValue::Null {
            return None;
        }
        Some(Self {
            execution_id,
            decision_id,
            aeo_hash,
            target_system,
            target_action,
            result,
            timestamp,
            evidence,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProofEnvelope {
    pub proof_id: ProofId,
    pub execution_id: ExecutionId,
    pub decision_id: DecisionId,
    pub aeo_hash: ObjectHash,
    pub target_system: TargetSystem,
    pub target_action: TargetAction,
    pub result: String,
    pub timestamp: String,
    pub evidence_hash: ObjectHash,
}

impl ProofEnvelope {
    pub fn from_evidence(proof_id: ProofId, evidence: Option<ExecutionEvidence>) -> Option<Self> {
        let evidence = evidence?;
        let evidence_hash = ObjectHash::new(canonical_sha256_hex(&evidence.evidence).ok()?)?;
        Some(Self {
            proof_id,
            execution_id: evidence.execution_id,
            decision_id: evidence.decision_id,
            aeo_hash: evidence.aeo_hash,
            target_system: evidence.target_system,
            target_action: evidence.target_action,
            result: evidence.result,
            timestamp: evidence.timestamp,
            evidence_hash,
        })
    }
}
