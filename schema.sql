-- Cloudflare D1 schema for the canonical Worker runtime in src/index.ts.
-- JSON-style canonical objects are stored as TEXT.

CREATE TABLE IF NOT EXISTS session_registry (
  session_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  trust_tier TEXT NOT NULL,
  continuity_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_registry_status_expiry
  ON session_registry (continuity_status, expires_at);

CREATE TABLE IF NOT EXISTS continuity_registry (
  continuity_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  parent_continuity_id TEXT,
  continuity_hash TEXT NOT NULL UNIQUE,
  canonical_continuity TEXT NOT NULL,
  status TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_continuity_registry_session_identity
  ON continuity_registry (session_id, identity_id, status, expires_at);

CREATE TABLE IF NOT EXISTS authority_registry (
  authority_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  identity_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  expiry TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authority_registry_decision_id
  ON authority_registry (decision_id);

CREATE TABLE IF NOT EXISTS aeo_registry (
  aeo_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  canonical_aeo TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  govern_projection_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_id
  ON aeo_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_hash
  ON aeo_registry (decision_id, validated_object_hash);

CREATE TABLE IF NOT EXISTS preo_registry (
  preo_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  reviewed_hash TEXT NOT NULL,
  reviewed_tree_hash TEXT,
  merge_commit_sha TEXT,
  canonical_preo TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(decision_id, reviewed_hash)
);

CREATE INDEX IF NOT EXISTS idx_preo_registry_decision_hash
  ON preo_registry (decision_id, reviewed_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_preo_registry_lineage_unique
  ON preo_registry (decision_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha);

CREATE TABLE IF NOT EXISTS validation_registry (
  validation_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  environment TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  workflow_integrity_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_validation_registry_decision_hash_nonce
  ON validation_registry (decision_id, validated_object_hash, invocation_nonce);

CREATE TABLE IF NOT EXISTS execution_registry (
  execution_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  repository TEXT,
  branch TEXT,
  pull_request_id TEXT,
  merge_commit_sha TEXT,
  source_tree_hash TEXT,
  workflow_run_id TEXT,
  workflow_sha TEXT,
  workflow_integrity_hash TEXT,
  UNIQUE(execution_id, decision_id, validated_object_hash),
  UNIQUE(workflow_run_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_registry_decision_hash
  ON execution_registry (decision_id, validated_object_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique
  ON execution_registry (workflow_run_id);

CREATE TABLE IF NOT EXISTS proof_registry (
  proof_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  continuity_hash TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  decision_hash TEXT,
  authority_lineage TEXT NOT NULL,
  execution_lineage TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL,
  repository TEXT,
  branch TEXT,
  pull_request_id TEXT,
  merge_commit_sha TEXT,
  source_tree_hash TEXT,
  workflow_run_id TEXT,
  workflow_sha TEXT,
  workflow_integrity_hash TEXT,
  UNIQUE(execution_id, decision_id, validated_object_hash),
  UNIQUE(workflow_run_id)
);

CREATE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash
  ON proof_registry (execution_id, decision_id, validated_object_hash);

CREATE TRIGGER IF NOT EXISTS trg_proof_registry_decision_hash_guard
BEFORE INSERT ON proof_registry
WHEN NEW.decision_hash IS NULL
  OR NEW.decision_hash = ''
  OR NEW.decision_hash != NEW.decision_id || char(31) || NEW.validated_object_hash
BEGIN
  SELECT RAISE(ABORT, 'proof_registry decision_hash mismatch');
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_workflow_run_unique
  ON proof_registry (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_proof_registry_provenance
  ON proof_registry (repository, branch, pull_request_id, merge_commit_sha, workflow_run_id);

CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive (
  archive_id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  archive_reason TEXT NOT NULL,
  canonical_proof_id TEXT NOT NULL,
  UNIQUE(proof_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique
  ON proof_registry (decision_hash);

-- GAP-005 closure: governance mutation proof persistence, bound to the full
-- session -> continuity -> decision -> authority -> GMA -> compiled -> executed
-- lineage chain. Evidence-only — does not create authority or execution eligibility.
CREATE TABLE IF NOT EXISTS governance_mutation_proof_registry (
  proof_id TEXT PRIMARY KEY,
  lineage_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  gma_id TEXT NOT NULL,
  compiled_object_hash TEXT NOT NULL,
  executed_object_hash TEXT NOT NULL,
  execution_proof_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(lineage_hash),
  UNIQUE(execution_proof_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_mutation_proof_lineage
  ON governance_mutation_proof_registry (decision_id, continuity_id, session_id);

CREATE TRIGGER IF NOT EXISTS trg_governance_mutation_proof_requires_hash_match
BEFORE INSERT ON governance_mutation_proof_registry
WHEN NEW.compiled_object_hash != NEW.executed_object_hash
BEGIN
  SELECT RAISE(ABORT, 'governance_mutation_proof_registry compiled/executed hash mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_governance_mutation_proof_requires_valid_proof
BEFORE INSERT ON governance_mutation_proof_registry
WHEN NOT EXISTS (
  SELECT 1 FROM proof_registry p
  WHERE p.proof_id = NEW.execution_proof_id
    AND p.decision_id = NEW.decision_id
    AND p.validated_object_hash = NEW.executed_object_hash
)
BEGIN
  SELECT RAISE(ABORT, 'governance_mutation_proof_registry missing bound execution proof lineage');
END;

CREATE TABLE IF NOT EXISTS invocation_registry (
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  continuity_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)
);

CREATE TABLE IF NOT EXISTS observability_registry (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  decision_id TEXT,
  authority_id TEXT,
  execution_id TEXT,
  proof_id TEXT,
  severity TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observability_decision
  ON observability_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_observability_execution
  ON observability_registry (execution_id);

CREATE INDEX IF NOT EXISTS idx_observability_type
  ON observability_registry (event_type);

CREATE TABLE IF NOT EXISTS drift_registry (
  drift_id TEXT PRIMARY KEY,
  drift_class TEXT NOT NULL,
  severity TEXT NOT NULL,
  decision_id TEXT,
  execution_id TEXT,
  payload TEXT NOT NULL,
  detected_by TEXT NOT NULL,
  resolution_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attestation_registry (
  attestation_id TEXT PRIMARY KEY,
  envelope_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_type TEXT NOT NULL,
  signer_identity TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  workflow_run_id TEXT NOT NULL,
  workflow_sha TEXT NOT NULL,
  canonical_aeo_hash TEXT NOT NULL,
  transparency_log_id TEXT NOT NULL,
  transparency_integrated_time TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(envelope_hash),
  UNIQUE(workflow_run_id),
  UNIQUE(decision_id, validated_object_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_hash_unique
  ON attestation_registry (envelope_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique
  ON attestation_registry (workflow_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_decision_object_unique
  ON attestation_registry (decision_id, validated_object_hash);

CREATE TABLE IF NOT EXISTS federated_revocation_observability_registry (
  revocation_evidence_id TEXT PRIMARY KEY,
  runtime_id TEXT NOT NULL,
  remote_runtime_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  revocation_class TEXT NOT NULL,
  revocation_reason TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  reconciliation_merkle_root TEXT NOT NULL,
  attestation_hash TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  drift_class TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_federated_revocation_observability_lineage
  ON federated_revocation_observability_registry(runtime_id, remote_runtime_id, decision_id, validated_object_hash);

-- External authority registry: append-only sovereignty dependency evidence.
CREATE TABLE IF NOT EXISTS external_authority_registry (
  sovereignty_dependency_id TEXT PRIMARY KEY,
  external_authority_surface TEXT NOT NULL,
  authority_origin TEXT NOT NULL,
  infrastructure_scope TEXT NOT NULL,
  bootstrap_trust_hash TEXT NOT NULL,
  sovereignty_classification TEXT NOT NULL,
  containment_state TEXT NOT NULL,
  observability_only TEXT NOT NULL CHECK (observability_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  evidence_hash TEXT NOT NULL UNIQUE,
  drift_classes TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_external_authority_registry_surface
  ON external_authority_registry(external_authority_surface, authority_origin, containment_state);

CREATE INDEX IF NOT EXISTS idx_external_authority_registry_bootstrap
  ON external_authority_registry(bootstrap_trust_hash, sovereignty_classification);

CREATE TRIGGER IF NOT EXISTS trg_external_authority_registry_no_update
BEFORE UPDATE ON external_authority_registry
BEGIN
  SELECT RAISE(ABORT, 'external_authority_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_external_authority_registry_no_delete
BEFORE DELETE ON external_authority_registry
BEGIN
  SELECT RAISE(ABORT, 'external_authority_registry is append-only');
END;
-- Bootstrap sovereignty registry: append-only, replay-neutral runtime initialization evidence.
CREATE TABLE IF NOT EXISTS bootstrap_sovereignty_registry (
  checkpoint_id TEXT PRIMARY KEY,
  manifest_hash TEXT NOT NULL,
  lineage_checkpoint_hash TEXT NOT NULL,
  deployment_lineage_root TEXT NOT NULL,
  bootstrap_trust_root_hash TEXT NOT NULL,
  initialization_order_hash TEXT NOT NULL,
  startup_dependency_graph_hash TEXT NOT NULL,
  startup_topology_hash TEXT NOT NULL,
  replay_neutrality_hash TEXT NOT NULL,
  conformance_status TEXT NOT NULL CHECK (conformance_status IN ('BOOTSTRAP_CONFORMANT','NULL')),
  drift_classes TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bootstrap_sovereignty_registry_manifest
  ON bootstrap_sovereignty_registry(manifest_hash, lineage_checkpoint_hash, conformance_status);

CREATE INDEX IF NOT EXISTS idx_bootstrap_sovereignty_registry_topology
  ON bootstrap_sovereignty_registry(deployment_lineage_root, bootstrap_trust_root_hash, startup_topology_hash);

CREATE TRIGGER IF NOT EXISTS trg_bootstrap_sovereignty_registry_no_update
BEFORE UPDATE ON bootstrap_sovereignty_registry
BEGIN
  SELECT RAISE(ABORT, 'bootstrap_sovereignty_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_bootstrap_sovereignty_registry_no_delete
BEFORE DELETE ON bootstrap_sovereignty_registry
BEGIN
  SELECT RAISE(ABORT, 'bootstrap_sovereignty_registry is append-only');
END;

CREATE TABLE IF NOT EXISTS legitimacy_drift_propagation_registry (
  propagation_id TEXT PRIMARY KEY,
  propagation_hash TEXT NOT NULL,
  topology_hash TEXT NOT NULL,
  impact_hash TEXT NOT NULL,
  merge_legitimacy_hash TEXT NOT NULL,
  verdict_hash TEXT NOT NULL,
  classification TEXT NOT NULL,
  propagation_object TEXT NOT NULL,
  impact_graph TEXT NOT NULL,
  merge_impact TEXT NOT NULL,
  verdict_object TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_hash_unique
  ON legitimacy_drift_propagation_registry (propagation_hash);
CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_topology
  ON legitimacy_drift_propagation_registry (topology_hash);
CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_impact
  ON legitimacy_drift_propagation_registry (impact_hash);
CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_merge
  ON legitimacy_drift_propagation_registry (merge_legitimacy_hash);
CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_verdict
  ON legitimacy_drift_propagation_registry (verdict_hash);
CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_classification
  ON legitimacy_drift_propagation_registry (classification);
CREATE TABLE IF NOT EXISTS legitimacy_quarantine_registry (
  quarantine_id TEXT PRIMARY KEY,
  quarantine_hash TEXT NOT NULL,
  containment_hash TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  federation_hash TEXT NOT NULL,
  boundary_hash TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('RECURSIVE_QUARANTINE_ACTIVE','FEDERATED_CONTAINMENT_REQUIRED','LINEAGE_TRUST_ISOLATED','TOPOLOGY_ANCESTRY_QUARANTINED','DOWNSTREAM_COORDINATION_RESTRICTED','MERGE_TRUST_COLLAPSED','PROOF_TRUST_CONTAINED','GOVERNANCE_CONTAMINATION_EXPANDED','CONTAINMENT_BOUNDARY_OVERFLOW','NULL')),
  quarantine_object TEXT NOT NULL,
  containment_boundary TEXT NOT NULL,
  isolation_graph TEXT NOT NULL,
  federated_containment TEXT NOT NULL,
  propagation_envelope TEXT NOT NULL,
  verdict_object TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'),
  quarantine_authoritative TEXT NOT NULL CHECK (quarantine_authoritative='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_quarantine_hash
  ON legitimacy_quarantine_registry (quarantine_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_containment_hash
  ON legitimacy_quarantine_registry (containment_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_lineage_hash
  ON legitimacy_quarantine_registry (lineage_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_federation_hash
  ON legitimacy_quarantine_registry (federation_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_boundary_hash
  ON legitimacy_quarantine_registry (boundary_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_classification
  ON legitimacy_quarantine_registry (classification);

CREATE TRIGGER IF NOT EXISTS trg_legitimacy_quarantine_registry_no_update
BEFORE UPDATE ON legitimacy_quarantine_registry
BEGIN
  SELECT RAISE(ABORT, 'legitimacy_quarantine_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_legitimacy_quarantine_registry_no_delete
BEFORE DELETE ON legitimacy_quarantine_registry
BEGIN
  SELECT RAISE(ABORT, 'legitimacy_quarantine_registry is append-only');
END;
CREATE TABLE IF NOT EXISTS unauthorized_mutation_closure_registry (
  closure_id TEXT PRIMARY KEY,
  inventory_hash TEXT NOT NULL,
  route_hash TEXT NOT NULL,
  registry_hash TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cross_registry_reconciliation_registry (
  reconciliation_id TEXT PRIMARY KEY,
  registry_set_hash TEXT NOT NULL,
  lineage_graph_hash TEXT NOT NULL,
  continuity_graph_hash TEXT NOT NULL,
  proof_graph_hash TEXT NOT NULL,
  replay_graph_hash TEXT NOT NULL,
  topology_binding_hash TEXT NOT NULL,
  governance_binding_hash TEXT NOT NULL,
  reconciliation_equivalence_hash TEXT NOT NULL,
  drift_classes TEXT NOT NULL,
  unresolved_edges TEXT NOT NULL,
  orphaned_records TEXT NOT NULL,
  containment_status TEXT NOT NULL CHECK (containment_status IN ('RECONCILED','RECONCILIATION_REQUIRED')),
  legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_registry_reconciliation_registry_hash_unique
  ON cross_registry_reconciliation_registry(reconciliation_equivalence_hash);

CREATE INDEX IF NOT EXISTS idx_cross_registry_reconciliation_registry_status
  ON cross_registry_reconciliation_registry(containment_status, legitimacy_status);

CREATE TRIGGER IF NOT EXISTS trg_cross_registry_reconciliation_registry_no_update
BEFORE UPDATE ON cross_registry_reconciliation_registry
BEGIN
  SELECT RAISE(ABORT, 'cross_registry_reconciliation_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_cross_registry_reconciliation_registry_no_delete
BEFORE DELETE ON cross_registry_reconciliation_registry
BEGIN
  SELECT RAISE(ABORT, 'cross_registry_reconciliation_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_proof_registry_requires_valid_execution
BEFORE INSERT ON proof_registry
WHEN NOT EXISTS (
  SELECT 1
  FROM execution_registry e
  WHERE e.execution_id = NEW.execution_id
    AND e.decision_id = NEW.decision_id
    AND e.validated_object_hash = NEW.validated_object_hash
    AND e.status = 'EXECUTED'
)
BEGIN
  SELECT RAISE(ABORT, 'proof_registry missing valid execution lineage');
END;

CREATE TABLE IF NOT EXISTS install_base_telemetry_registry (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('governed_execution_attempted','governed_execution_completed','invalid_execution_blocked','replay_rejected','continuity_rejected','workflow_integrity_drift','reconciliation_failure_detected','proof_generated','proof_rejected')),
  decision_id TEXT,
  authority_id TEXT,
  execution_id TEXT,
  proof_id TEXT,
  lineage_origin_hash TEXT,
  lineage_origin_match TEXT NOT NULL CHECK (lineage_origin_match IN ('MATCH','MISMATCH','UNKNOWN')),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  append_only TEXT NOT NULL CHECK (append_only='true'),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_install_base_telemetry_registry_type_created ON install_base_telemetry_registry(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_install_base_telemetry_registry_decision ON install_base_telemetry_registry(decision_id);
CREATE TRIGGER IF NOT EXISTS trg_install_base_telemetry_registry_no_update BEFORE UPDATE ON install_base_telemetry_registry BEGIN SELECT RAISE(ABORT, 'install_base_telemetry_registry is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_install_base_telemetry_registry_no_delete BEFORE DELETE ON install_base_telemetry_registry BEGIN SELECT RAISE(ABORT, 'install_base_telemetry_registry is append-only'); END;

-- Migration governance registry: append-only surface declaration for governed D1 migrations.
-- Evidence-only: records that migration files are governed infrastructure mutation surfaces.
-- Does not create authority, proof finality, execution capability, or deployment capability.
CREATE TABLE IF NOT EXISTS migration_governance_registry (
  migration_id TEXT PRIMARY KEY,
  migration_file TEXT NOT NULL UNIQUE,
  migration_sequence INTEGER NOT NULL,
  governance_classification TEXT NOT NULL CHECK (governance_classification = 'governed_infrastructure_mutation'),
  surface_declaration TEXT NOT NULL CHECK (surface_declaration = 'DECLARED'),
  legitimacy_constraint_preserved TEXT NOT NULL CHECK (legitimacy_constraint_preserved = 'true'),
  append_only_semantics_preserved TEXT NOT NULL CHECK (append_only_semantics_preserved = 'true'),
  raw_production_apply_path TEXT NOT NULL CHECK (raw_production_apply_path = 'DENIED'),
  evidence_only TEXT NOT NULL CHECK (evidence_only = 'true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral = 'true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable = 'false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority = 'false'),
  executable TEXT NOT NULL CHECK (executable = 'false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating = 'false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable = 'false'),
  fail_closed_on_bypass TEXT NOT NULL CHECK (fail_closed_on_bypass = 'true'),
  validation_evidence TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_governance_registry_file
  ON migration_governance_registry (migration_file);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_governance_registry_sequence
  ON migration_governance_registry (migration_sequence);

CREATE TRIGGER IF NOT EXISTS trg_migration_governance_registry_no_update
BEFORE UPDATE ON migration_governance_registry
BEGIN
  SELECT RAISE(ABORT, 'migration_governance_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_migration_governance_registry_no_delete
BEFORE DELETE ON migration_governance_registry
BEGIN
  SELECT RAISE(ABORT, 'migration_governance_registry is append-only');
END;
