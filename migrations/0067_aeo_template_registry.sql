-- Issue #1627 follow-on: AEO Template Registry.
-- Introduces a registry-backed template selection layer for the Agent Tool Gateway.
--
-- ACTIVE templates: filesystem_read_v1, filesystem_write_v1, browser_v1,
--                   gateway_routing_v1, behavioral_files_v1
-- DRAFT templates:  shell_exec_v1, process_control_v1, session_spawn_v1,
--                   scheduled_action_v1, node_runtime_v1, network_api_v1
--
-- DRAFT templates always resolve to NULL / SCHEMA_INACTIVE.
-- ACTIVE template existence does NOT authorize execution.
-- P4/P5 templates remain DRAFT until enforcement infrastructure exists.
--
-- This does not close #1627.
-- This does not enable OpenClaw execution.
-- This does not implement framework-neutral adapters.
-- This does not create authority.
-- This does not generate proof.

CREATE TABLE IF NOT EXISTS aeo_template_registry (
  template_id             TEXT PRIMARY KEY,
  schema_version          TEXT NOT NULL,
  surface_type            TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','DRAFT')),
  risk_floor              TEXT NOT NULL,
  required_scope_fields   TEXT NOT NULL,
  required_target_fields  TEXT NOT NULL,
  required_validation_fields TEXT NOT NULL,
  required_finality_fields   TEXT NOT NULL,
  predicate_set           TEXT NOT NULL,
  failure_result          TEXT NOT NULL DEFAULT 'NULL',
  created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aeo_template_registry_surface_status
  ON aeo_template_registry (surface_type, status);

CREATE TRIGGER IF NOT EXISTS aeo_template_registry_append_only_update
BEFORE UPDATE ON aeo_template_registry
BEGIN
  SELECT RAISE(ABORT, 'aeo_template_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS aeo_template_registry_append_only_delete
BEFORE DELETE ON aeo_template_registry
BEGIN
  SELECT RAISE(ABORT, 'aeo_template_registry is append-only');
END;

-- ── ACTIVE templates ─────────────────────────────────────────────────────────

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'filesystem_read_v1', '1.0', 'filesystem_read', 'ACTIVE', 'P0_READ_ONLY',
  '["allowed_paths","symlink_policy","max_bytes","sensitivity_label"]',
  '["exact_path_list","read_mode"]',
  '["atao_id","request_hash","replay_domain_ref"]',
  '["observation_log_ref"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_path_bounds","check_symlink_policy","check_sensitivity_label","check_replay_domain"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'filesystem_write_v1', '1.0', 'filesystem_write', 'ACTIVE', 'P2_BOUNDED_MUTATION',
  '["allowed_paths","create_overwrite_policy","content_size_limit","atomicity_expectation"]',
  '["exact_path","exact_content_hash","file_mode","expected_preimage_hash"]',
  '["atao_id","decision_id","require_active_authority","require_exact_object_hash","require_replay_safe","preimage_check"]',
  '["proof_required","proof_type","write_finality_receipt","postimage_hash"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_path_bounds","check_content_hash","check_preimage","check_exact_object_hash","check_replay_safe"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'browser_v1', '1.0', 'browser', 'ACTIVE', 'P3_EXTERNAL_MUTATION',
  '["allowed_origins","credential_policy","session_isolation","navigation_bounds"]',
  '["exact_url","action_tuple","selector_hash","form_payload_hash"]',
  '["atao_id","decision_id","require_active_authority","require_exact_object_hash","replay_safety_classification"]',
  '["proof_required","proof_type","browser_action_receipt","dom_observation_hash"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_origin_bounds","check_credential_policy","check_exact_object_hash","check_replay_safety"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'gateway_routing_v1', '1.0', 'gateway_routing', 'ACTIVE', 'P1_EXECUTION_ADJACENT',
  '["allowed_adapter_set","target_gateway_boundary","routing_policy_version"]',
  '["exact_route_key","destination_boundary_id","normalized_atao_hash"]',
  '["atao_id","require_exact_object_hash","replay_domain_ref"]',
  '["routing_receipt_hash"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_adapter_set","check_routing_policy","check_exact_object_hash"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'behavioral_files_v1', '1.0', 'behavioral_files', 'ACTIVE', 'P1_EXECUTION_ADJACENT',
  '["allowed_behavioral_file_set","policy_namespace","owner_session_bounds","activation_timing"]',
  '["exact_file_path","exact_content_hash","expected_preimage_hash"]',
  '["atao_id","decision_id","require_active_authority_for_mutation","require_exact_object_hash","require_replay_safe","behavioral_impact_classification"]',
  '["proof_required","proof_type","behavioral_config_receipt","postimage_hash"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_behavioral_file_bounds","check_policy_namespace","check_exact_object_hash","check_replay_safe"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

-- ── DRAFT templates (P4/P5 — always resolve to NULL / SCHEMA_INACTIVE) ───────

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'shell_exec_v1', '1.0', 'shell_exec', 'DRAFT', 'P4_PRIVILEGED_EXECUTION',
  '["working_directory","environment_bounds","timeout_ms","resource_limits","network_policy"]',
  '["argv","command_allowlist_ref","stdin_hash"]',
  '["atao_id","decision_id","require_active_authority","require_exact_object_hash","require_replay_safe","command_allowlist_decision"]',
  '["proof_required","proof_type","exit_code_required","stdout_hash_required","stderr_hash_required"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_command_allowlist","check_environment_bounds","check_timeout","check_resource_limits","check_exact_object_hash","check_replay_safe"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'process_control_v1', '1.0', 'process_control', 'DRAFT', 'P4_PRIVILEGED_EXECUTION',
  '["process_namespace","allowed_signal_set","timeout","resource_and_owner_bounds"]',
  '["exact_process_id","exact_control_action","expected_pre_state"]',
  '["atao_id","decision_id","require_active_authority","require_exact_object_hash","require_replay_safe","process_identity_check"]',
  '["proof_required","proof_type","process_control_receipt","exit_state_hash"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_process_namespace","check_signal_allowlist","check_exact_object_hash","check_replay_safe"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'session_spawn_v1', '1.0', 'session_spawn', 'DRAFT', 'P5_AUTONOMOUS_RECURSIVE',
  '["parent_session_id","child_session_bounds","identity_anchor","replay_domain","max_delegation_depth"]',
  '["exact_child_session_request","delegated_scope_hash","adapter_runtime_id"]',
  '["atao_id","decision_id","require_active_authority","require_exact_object_hash","require_replay_safe_delegation","lineage_check"]',
  '["proof_required","proof_type","child_session_receipt","lineage_edge_hash"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_parent_lineage","check_identity_anchor","check_delegation_depth","check_exact_object_hash"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'scheduled_action_v1', '1.0', 'scheduled_action', 'DRAFT', 'P5_AUTONOMOUS_RECURSIVE',
  '["schedule_bounds","recurrence_limit","cancellation_condition","owner_session_bounds","replay_domain"]',
  '["exact_schedule_expression","exact_action_template_hash","recurrence_count","start_end_bounds"]',
  '["atao_id","decision_id","require_active_authority","require_exact_object_hash","require_replay_safe_recurrence","cancellation_predicate"]',
  '["proof_required","proof_type","schedule_registration_receipt","recurrence_ledger_ref"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_recurrence_bounds","check_cancellation_predicate","check_action_template_hash","check_exact_object_hash"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'node_runtime_v1', '1.0', 'node_runtime', 'DRAFT', 'P4_PRIVILEGED_EXECUTION',
  '["runtime_version","module_allowlist","working_directory","environment_bounds","timeout_ms","resource_limits"]',
  '["exact_entrypoint","module_hash","argv","stdin_hash"]',
  '["atao_id","decision_id","require_active_authority","require_exact_object_hash","require_replay_safe","module_allowlist_decision"]',
  '["proof_required","proof_type","exit_code_required","stdout_hash_required","stderr_hash_required"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_module_allowlist","check_environment_bounds","check_timeout","check_resource_limits","check_exact_object_hash","check_replay_safe"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);

INSERT OR IGNORE INTO aeo_template_registry (
  template_id, schema_version, surface_type, status, risk_floor,
  required_scope_fields, required_target_fields,
  required_validation_fields, required_finality_fields,
  predicate_set, failure_result, created_at
) VALUES (
  'network_api_v1', '1.0', 'network_api', 'DRAFT', 'P3_EXTERNAL_MUTATION',
  '["allowed_domains","method_allowlist","credential_policy","timeout_ms","rate_limit"]',
  '["exact_url","exact_method","exact_payload_hash","exact_header_set"]',
  '["atao_id","decision_id","require_active_authority","require_exact_object_hash","replay_safety_classification"]',
  '["proof_required","proof_type","network_interaction_receipt","response_hash"]',
  '["check_required_scope_fields","check_required_target_fields","check_required_validation_fields","check_required_finality_fields","check_domain_bounds","check_method_allowlist","check_credential_policy","check_exact_object_hash","check_replay_safety"]',
  'NULL',
  '2026-06-02T00:00:00.000Z'
);
