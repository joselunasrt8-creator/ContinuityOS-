-- Governance consensus evidence is append-only, replay-neutral, and non-authoritative.
CREATE TABLE IF NOT EXISTS observer_attestation_registry (
  attestation_id TEXT PRIMARY KEY,
  observer_id TEXT NOT NULL,
  observed_checkpoint_hash TEXT NOT NULL,
  semantic_hash TEXT NOT NULL,
  topology_hash TEXT NOT NULL,
  reconciliation_hash TEXT NOT NULL,
  sovereignty_hash TEXT NOT NULL,
  equivalence_hash TEXT NOT NULL,
  drift_classes TEXT NOT NULL,
  legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'),
  attestation_hash TEXT NOT NULL UNIQUE,
  observer_envelope TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  merge_authorizing TEXT NOT NULL CHECK (merge_authorizing='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_observer_attestation_registry_equivalence ON observer_attestation_registry(equivalence_hash, legitimacy_status);
CREATE TRIGGER IF NOT EXISTS trg_observer_attestation_registry_no_update BEFORE UPDATE ON observer_attestation_registry BEGIN SELECT RAISE(ABORT, 'observer_attestation_registry is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_observer_attestation_registry_no_delete BEFORE DELETE ON observer_attestation_registry BEGIN SELECT RAISE(ABORT, 'observer_attestation_registry is append-only'); END;

CREATE TABLE IF NOT EXISTS semantic_equivalence_registry (
  semantic_equivalence_id TEXT PRIMARY KEY,
  semantic_hash TEXT NOT NULL,
  schema_semantic_hash TEXT NOT NULL,
  topology_semantic_hash TEXT NOT NULL,
  governance_semantic_hash TEXT NOT NULL,
  portability_semantic_hash TEXT NOT NULL,
  equivalence_hash TEXT NOT NULL UNIQUE,
  drift_classes TEXT NOT NULL,
  legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'),
  semantic_envelope TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  merge_authorizing TEXT NOT NULL CHECK (merge_authorizing='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS trg_semantic_equivalence_registry_no_update BEFORE UPDATE ON semantic_equivalence_registry BEGIN SELECT RAISE(ABORT, 'semantic_equivalence_registry is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_semantic_equivalence_registry_no_delete BEFORE DELETE ON semantic_equivalence_registry BEGIN SELECT RAISE(ABORT, 'semantic_equivalence_registry is append-only'); END;

CREATE TABLE IF NOT EXISTS portable_governance_checkpoint_registry (
  checkpoint_id TEXT PRIMARY KEY,
  checkpoint_hash TEXT NOT NULL UNIQUE,
  reconciliation_hash TEXT NOT NULL,
  topology_hash TEXT NOT NULL,
  semantic_equivalence_hash TEXT NOT NULL,
  conformance_hash TEXT NOT NULL,
  portable_envelope TEXT NOT NULL,
  dsse_payload_type TEXT NOT NULL,
  jcs_canonical TEXT NOT NULL CHECK (jcs_canonical='true'),
  drift_classes TEXT NOT NULL,
  legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  merge_authorizing TEXT NOT NULL CHECK (merge_authorizing='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS trg_portable_governance_checkpoint_registry_no_update BEFORE UPDATE ON portable_governance_checkpoint_registry BEGIN SELECT RAISE(ABORT, 'portable_governance_checkpoint_registry is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_portable_governance_checkpoint_registry_no_delete BEFORE DELETE ON portable_governance_checkpoint_registry BEGIN SELECT RAISE(ABORT, 'portable_governance_checkpoint_registry is append-only'); END;

CREATE TABLE IF NOT EXISTS external_conformance_verification_registry (
  verification_id TEXT PRIMARY KEY,
  runtime_compatibility_hash TEXT NOT NULL,
  governance_semantic_hash TEXT NOT NULL,
  checkpoint_equivalence_hash TEXT NOT NULL,
  federated_conformance_hash TEXT NOT NULL UNIQUE,
  conformance_status TEXT NOT NULL CHECK (conformance_status IN ('CONFORMANT','NULL')),
  drift_classes TEXT NOT NULL,
  verification_envelope TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  merge_authorizing TEXT NOT NULL CHECK (merge_authorizing='false'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS trg_external_conformance_verification_registry_no_update BEFORE UPDATE ON external_conformance_verification_registry BEGIN SELECT RAISE(ABORT, 'external_conformance_verification_registry is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_external_conformance_verification_registry_no_delete BEFORE DELETE ON external_conformance_verification_registry BEGIN SELECT RAISE(ABORT, 'external_conformance_verification_registry is append-only'); END;
