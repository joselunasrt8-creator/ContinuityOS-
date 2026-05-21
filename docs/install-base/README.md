# Install-base telemetry

This module reports install-base adoption as runtime evidence, not user attention.

## Definition

Install base = execution surfaces that depend on MindShift legitimacy infrastructure before state change is allowed.

Canonical chain:

`/session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof`

## Artifact

- `runtime/install_base/install_base_metrics.json`
- Derived by `src/install_base/report.mjs`
- Deterministic hash: `report_hash` over canonicalized read-only report payload.

## Safety / invariants

- Read-only reporting only.
- No execution routes added.
- No authority creation.
- No proof creation.
- No validator semantics changed.
- Telemetry remains non-authoritative evidence.
- Telemetry cannot influence validator outcomes, authority decisions, execution eligibility, or proof acceptance.

## Metrics

- governed_execution_count
- governed_deploy_count
- proof_persisted_count
- validation_success_count
- validation_null_count
- replay_rejection_count
- hash_mismatch_rejection_count
- boundary_bypass_rejection_count
- orphan_proof_detection_count
- governed_surface_count
- ungoverned_surface_count
- open_sovereignty_gap_count
- contained_sovereignty_gap_count
- install_base_artifacts_present
- graph_projection_present
