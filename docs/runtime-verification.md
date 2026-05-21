# Runtime Verification: Bounded Execution Topology

## Admissible execution topology

The active mutation topology remains the canonical sequence:

1. `/session`
2. `/continuity`
3. `/authority`
4. `/compile`
5. `/validate`
6. `/execute`
7. `/proof`

No additional mutation entrypoints are admitted by this verification report. Any execution attempt outside this chain is treated as undeclared and therefore fail-closed.

## Finite execution surface model

Finite admissible surfaces are constrained to:

- Canonical mutation routes listed above.
- Validator invocation surfaces (`/validate` and schema validation runtime artifacts).
- Proof persistence surfaces (`/proof` and proof lineage/replay migrations).
- Deploy-capable surfaces bound to governed workflow controls (`.github/workflows/governed-deploy.yml`, `.github/workflows/prepare-governed-deploy.yml`, `wrangler.toml`, and blocked direct `npm run deploy`).

All other repository surfaces are treated as non-authoritative unless explicitly represented in `governance/runtime/RUNTIME_VERIFICATION_REPORT.json`.

## Fail-closed execution semantics

Verification is fail-closed:

- `orphan_execution_candidates` MUST be empty.
- `undeclared_mutation_paths` MUST be empty.
- `validator_coverage_gaps` MUST be empty.
- `proof_continuity_gaps` MUST be empty.
- `replay_enforcement_gaps` MUST be empty.

If any of these sets become non-empty, runtime readiness is invalidated and enforcement should return deterministic rejection (`NULL`, `INVALID`, `BLOCKED`, or `QUARANTINED`) through existing runtime logic.

## Undeclared surface quarantine behavior

Undeclared mutation surfaces are not promoted to authority. They are quarantine-class findings under bounded governance verification and are reported in `undeclared_mutation_paths` until remediated. This preserves non-bypassability and prevents silent execution expansion.

## Replay-safe execution boundaries

Replay-sensitive boundaries remain singular and explicit:

- Validation-to-execution handoff (`/validate` -> `/execute`).
- Execution-to-proof handoff (`/execute` -> `/proof`).
- Replay/idempotency protections from proof and execution replay migrations.

No alternate replay channel is admitted in this verification scope.

## Validator closure guarantees

Deploy-capable and execution-capable surfaces are verified as validator-bound by report invariants:

- `all_execution_capable_paths_route_through_canonical_topology = true`
- `deploy_paths_validator_bound = true`
- `proof_persistence_deterministic = true`
- `replay_enforcement_singular = true`
- `topology_ownership_canonical = true`

This maintains bounded, deterministic runtime operation without ontology expansion.
