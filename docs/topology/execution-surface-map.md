# Execution Surface Map

## Purpose
Render already-classified governance inventories into a unified, read-only execution surface topology map for issue #921.

## Source artifacts
- `governance/runtime/WORKFLOW_DISPATCH_DEPLOYMENT_SURFACE_INVENTORY.json`
- `governance/runtime/DEPLOY_CAPABLE_TOKEN_AUTHORITY_INVENTORY.json`
- `governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json`
- `governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json`

## Summary counts
- total_surfaces: 42
- mutation_capable_surfaces: 35
- open_surfaces: 11
- monitored_surfaces: 25
- closed_surfaces: 6
- high_risk_surfaces: 7
- critical_risk_surfaces: 0

## Surface table
| surface_id | surface_name | surface_type | mutation_capable | authority_bound | validator_bound | proof_bound | replay_safe | observable | closure_status | risk_level | source_artifact |
|---|---|---|---|---|---|---|---|---|---|---|---|
| surface_workflow_dispatch_001 | governed-deploy | workflow | true | true | true | true | true | true | MONITORED | MEDIUM | governance/runtime/WORKFLOW_DISPATCH_DEPLOYMENT_SURFACE_INVENTORY.json |
| surface_workflow_dispatch_002 | prepare-governed-deploy | workflow | true | true | false | false | false | true | OPEN | HIGH | governance/runtime/WORKFLOW_DISPATCH_DEPLOYMENT_SURFACE_INVENTORY.json |
| surface_pull_request_001 | constitutional-integrity | workflow | false | false | false | false | true | true | CLOSED | LOW | governance/runtime/WORKFLOW_DISPATCH_DEPLOYMENT_SURFACE_INVENTORY.json |
| surface_pull_request_002 | merge-governance-check | workflow | false | false | false | false | true | true | CLOSED | LOW | governance/runtime/WORKFLOW_DISPATCH_DEPLOYMENT_SURFACE_INVENTORY.json |
| surface_pull_request_003 | preo-candidate | workflow | false | false | false | false | true | true | CLOSED | LOW | governance/runtime/WORKFLOW_DISPATCH_DEPLOYMENT_SURFACE_INVENTORY.json |
| surface_pull_request_004 | sco-candidate | workflow | false | false | false | false | true | true | CLOSED | LOW | governance/runtime/WORKFLOW_DISPATCH_DEPLOYMENT_SURFACE_INVENTORY.json |
| github_actions_secret_mindshift_api_key | github_actions_secret_mindshift_api_key | token | true | true | UNKNOWN | UNKNOWN | UNKNOWN | true | OPEN | HIGH | governance/runtime/DEPLOY_CAPABLE_TOKEN_AUTHORITY_INVENTORY.json |
| github_actions_secret_mindshift_worker_url | github_actions_secret_mindshift_worker_url | token | false | false | false | false | false | true | OPEN | MEDIUM | governance/runtime/DEPLOY_CAPABLE_TOKEN_AUTHORITY_INVENTORY.json |
| cloudflare_api_token_or_cf_api_token_for_wrangler | cloudflare_api_token_or_cf_api_token_for_wrangler | token | true | false | false | false | false | UNKNOWN | OPEN | HIGH | governance/runtime/DEPLOY_CAPABLE_TOKEN_AUTHORITY_INVENTORY.json |
| wrangler_local_auth_session | wrangler_local_auth_session | token | true | false | false | false | false | false | OPEN | HIGH | governance/runtime/DEPLOY_CAPABLE_TOKEN_AUTHORITY_INVENTORY.json |
| github_actions_github_token_runtime | github_actions_github_token_runtime | token | false | false | false | false | true | true | CLOSED | LOW | governance/runtime/DEPLOY_CAPABLE_TOKEN_AUTHORITY_INVENTORY.json |
| github_repo_admin_secret_write_authority | github_repo_admin_secret_write_authority | token | true | false | false | false | false | UNKNOWN | OPEN | HIGH | governance/runtime/DEPLOY_CAPABLE_TOKEN_AUTHORITY_INVENTORY.json |
| session_registry_write | session_registry_write | registry | true | false | false | false | false | true | OPEN | MEDIUM | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| continuity_registry_write | continuity_registry_write | registry | true | false | false | false | false | true | OPEN | MEDIUM | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| authority_registry_insert | authority_registry_insert | registry | true | true | false | false | UNKNOWN | true | MONITORED | MEDIUM | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| authority_registry_status_update | authority_registry_status_update | registry | true | true | true | true | true | true | MONITORED | MEDIUM | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| aeo_registry_write | aeo_registry_write | registry | true | true | true | UNKNOWN | UNKNOWN | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| validation_registry_write | validation_registry_write | registry | true | true | true | UNKNOWN | true | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| invocation_registry_write_update | invocation_registry_write_update | registry | true | true | true | UNKNOWN | true | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| execution_registry_write | execution_registry_write | registry | true | true | true | UNKNOWN | true | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| proof_registry_write | proof_registry_write | registry | true | true | true | true | true | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| execution_snapshot_registry_status_update | execution_snapshot_registry_status_update | registry | true | true | true | true | true | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| proof_propagation_outbox_write | proof_propagation_outbox_write | registry | true | true | true | true | true | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| attestation_registry_write | attestation_registry_write | registry | true | true | true | true | UNKNOWN | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| observability_registries_write | observability_registries_write | registry | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| topology_reconciliation_registry_write | topology_reconciliation_registry_write | registry | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| migration_schema_mutation_surface | migration_schema_mutation_surface | registry | true | false | false | false | false | UNKNOWN | OPEN | HIGH | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| proof_registry_dedupe_backfill_migrations | proof_registry_dedupe_backfill_migrations | registry | true | false | false | UNKNOWN | UNKNOWN | UNKNOWN | OPEN | MEDIUM | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| runtime_bootstrap_sql_path | runtime_bootstrap_sql_path | registry | true | false | false | false | UNKNOWN | true | MONITORED | MEDIUM | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| wrangler_d1_cli_apply | wrangler_d1_cli_apply | registry | true | false | false | false | false | UNKNOWN | OPEN | HIGH | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| github_workflow_db_mutation | github_workflow_db_mutation | registry | true | UNKNOWN | false | false | UNKNOWN | true | MONITORED | MEDIUM | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| kv_mutation_surface | kv_mutation_surface | registry | false | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | CLOSED | LOW | governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json |
| runtime_telemetry_event_writer | runtime_telemetry_event_writer | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| install_base_telemetry_event | install_base_telemetry_event | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| install_base_telemetry_best_effort_fallback | install_base_telemetry_best_effort_fallback | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| drift_event_writer | drift_event_writer | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| federated_reconciliation_checkpoint_writer | federated_reconciliation_checkpoint_writer | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| federated_sovereignty_observability_writer | federated_sovereignty_observability_writer | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| revocation_topology_observability_writer | revocation_topology_observability_writer | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| governance_compression_observability_writer | governance_compression_observability_writer | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| reconciliation_closure_observability_writer | reconciliation_closure_observability_writer | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |
| root_authority_observability_writer | root_authority_observability_writer | observability | true | false | false | false | true | true | MONITORED | LOW | governance/runtime/OBSERVABILITY_WRITE_SURFACE_INVENTORY.json |

## High-risk / open surfaces
- surface_workflow_dispatch_002 (OPEN, HIGH)
- github_actions_secret_mindshift_api_key (OPEN, HIGH)
- github_actions_secret_mindshift_worker_url (OPEN, MEDIUM)
- cloudflare_api_token_or_cf_api_token_for_wrangler (OPEN, HIGH)
- wrangler_local_auth_session (OPEN, HIGH)
- github_repo_admin_secret_write_authority (OPEN, HIGH)
- session_registry_write (OPEN, MEDIUM)
- continuity_registry_write (OPEN, MEDIUM)
- migration_schema_mutation_surface (OPEN, HIGH)
- proof_registry_dedupe_backfill_migrations (OPEN, MEDIUM)
- wrangler_d1_cli_apply (OPEN, HIGH)

## Canonical invariant
execution surface rendering = read-only visibility

## Non-operative boundary statement
This map is read-only topology evidence and does not create legitimacy.

Observability ≠ authority.
