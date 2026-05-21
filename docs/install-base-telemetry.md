# Install-Base Telemetry Specification (Non-Operative)

## 1. Purpose

This document defines an **evidence-only, read-only, passive** telemetry specification for measuring MindShift install-base dependency characteristics.

It exists to improve governance visibility of how often legitimacy-dependent surfaces are used and rejected, without changing any execution decision or runtime route behavior.

Telemetry defined here is strictly observational:

- It does not authorize execution.
- It does not modify policy outcomes.
- It does not mutate canonical objects.
- It does not create or imply fallback legitimacy.

## 2. Install-base definition

For this specification, **install-base dependency** is the observed footprint of runtime reliance on legitimacy-gated surfaces and outcomes across deployed MindShift instances.

Install-base dependency is measured through counts and ratios of:

- governed execution attempts and completions,
- deterministic legitimacy rejections,
- proof generation events,
- continuity governance disruptions,
- reconciliation and distributed-consensus failure signals,
- validation failure distributions,
- and execution surfaces that are blocked until validation succeeds.

This is an operational dependency measurement of *observed behavior* only, not a control plane.

## 3. Metric taxonomy

All metrics are append-only evidence records derived from existing runtime outcomes.

### 3.1 Governed executions

- **metric_id**: `governed_executions_total`
- **definition**: count of successful executions that occurred through canonical governance flow.
- **unit**: count

### 3.2 Blocked invalid executions

- **metric_id**: `blocked_invalid_executions_total`
- **definition**: count of execution attempts deterministically blocked due to invalid legitimacy state.
- **unit**: count

### 3.3 Replay rejections

- **metric_id**: `replay_rejections_total`
- **definition**: count of attempts rejected due to replay/used-object protections.
- **unit**: count

### 3.4 Proof records generated

- **metric_id**: `proof_records_generated_total`
- **definition**: count of proof artifacts persisted after successful governed execution.
- **unit**: count

### 3.5 Continuity revocations

- **metric_id**: `continuity_revocations_total`
- **definition**: count of continuity objects entering revoked/invalidated state.
- **unit**: count

### 3.6 Reconciliation failures

- **metric_id**: `reconciliation_failures_total`
- **definition**: count of deterministic reconciliation failures in governance state alignment.
- **unit**: count

### 3.7 Distributed disagreement collapses

- **metric_id**: `distributed_disagreement_collapses_total`
- **definition**: count of disagreement states that collapsed into deterministic rejection or quarantine outcome.
- **unit**: count

### 3.8 Validation failures by reason

- **metric_id**: `validation_failures_total`
- **dimensions**:
  - `reason` (required; canonical validator reason key)
- **definition**: count of validation failures partitioned by deterministic reason.
- **unit**: count

### 3.9 Execution surfaces requiring validation first

- **metric_id**: `validation_required_surface_attempts_total`
- **dimensions**:
  - `surface` (required; canonical route/surface identifier)
  - `result` (required; `allowed_after_validation` | `blocked_pre_validation`)
- **definition**: attempts on execution surfaces that require prior successful validation.
- **unit**: count

## 4. Event source mapping

Telemetry events map to existing canonical surfaces and outcomes only.

| Metric | Canonical source surface/outcome | Evidence shape |
|---|---|---|
| `governed_executions_total` | `/execute` accepted governed execution | increment on successful execution boundary pass |
| `blocked_invalid_executions_total` | `/execute` deterministic invalid/block/null outcome | increment on blocked legitimacy outcome |
| `replay_rejections_total` | policy/replay guard rejection in authority/validation/execution chain | increment on replay-class rejection evidence |
| `proof_records_generated_total` | `/proof` successful proof persistence | increment on proof write success evidence |
| `continuity_revocations_total` | `/continuity` revocation outcome | increment on continuity revoked evidence |
| `reconciliation_failures_total` | reconciliation layer failure evidence | increment on deterministic reconciliation failure |
| `distributed_disagreement_collapses_total` | distributed disagreement collapse evidence | increment on collapse-to-reject/quarantine |
| `validation_failures_total{reason=*}` | `/validate` failure output with canonical reason | increment keyed by validator reason |
| `validation_required_surface_attempts_total{surface=*,result=*}` | validation-gated surfaces (`/execute`, `/proof`, and any canonical validation-first surfaces) | increment by surface and validation-gate outcome |

No additional routes are introduced. Event mapping references pre-existing execution and observability evidence only.

## 5. Evidence vs authority boundary

Telemetry is explicitly separated from legitimacy authority:

- **Authority inputs**: authority objects, compiled AEO, validator outputs, replay guards, policy checks.
- **Telemetry inputs**: emitted outcomes from authority/compile/validate/execute/proof/continuity processes.

Hard boundary rules:

1. Telemetry MUST NEVER be consumed as an allow/deny input.
2. Telemetry MUST NEVER synthesize legitimacy when canonical legitimacy is absent.
3. Telemetry MUST NEVER alter validator reasoning or execution boundary decisions.
4. Missing telemetry MUST NEVER degrade fail-closed behavior into allow behavior.

## 6. Read-only data flow

Conceptual non-operative flow:

1. Canonical runtime produces deterministic result.
2. Result emits immutable evidence event.
3. Telemetry collector ingests event passively.
4. Aggregations produce counters/dimensions only.
5. Dashboards/query surfaces read aggregates.

Constraints:

- No write-back from telemetry to runtime decision paths.
- No control signal from dashboards to execution routes.
- No mutation of validated or executed objects.
- No mutation of proof or replay state from telemetry systems.

## 7. Suggested dashboard fields

Recommended fields for install-base dependency dashboards:

- `window_start`, `window_end`
- `environment` (local/staging/prod, if available)
- `surface`
- `metric_id`
- `count`
- `rate_per_1k_attempts` (derived)
- `validation_failure_reason`
- `replay_rejection_class`
- `continuity_revocation_class`
- `disagreement_collapse_class`
- `reconciliation_failure_class`
- `canonical_route` (e.g., `/validate`, `/execute`, `/proof`)

All derived ratios are analytical outputs only and non-authoritative.

## 8. Explicit non-goals

This telemetry specification does **not**:

- add or modify execution routes,
- alter canonical runtime flow,
- authorize or block execution,
- provide fallback legitimacy,
- change replay handling,
- change proof persistence semantics,
- mutate authority/continuity/validation state,
- introduce automatic remediation or self-healing execution paths.

## 9. Required invariants

The following invariants are mandatory:

1. **Non-operativity**: telemetry cannot trigger state-changing execution.
2. **Observability-only**: telemetry remains GET/read/query scope for consumers.
3. **Decision isolation**: validator/execute/proof/replay/authority/continuity decisions are telemetry-independent.
4. **Fail-closed preservation**: absence, delay, or corruption of telemetry does not produce allow behavior.
5. **Replay neutrality**: telemetry cannot consume or reset replay protections.
6. **Proof neutrality**: telemetry cannot substitute for proof generation/persistence.
7. **Deterministic evidence**: event classification keys are canonical and stable.
8. **No runtime mutation**: this specification introduces documentation semantics only.

## 10. Classification

- `NON_OPERATIVE`
- `OBSERVABILITY_ONLY`
- `INSTALL_BASE_TELEMETRY`
- `NO_RUNTIME_MUTATION`
