# Canonical Runtime Registry Lineage Verification

## Determination

**PASS after remediation.** Building a fresh database strictly from `migrations/*.sql` now reproduces the canonical runtime registry schema required by `/authority`, `/compile`, `/validate`, `/execute`, and `/proof`.

## Runtime persistence expectations

The Worker runtime persists and queries these canonical fields:

| Registry | Runtime-required persistence shape |
| --- | --- |
| `authority_registry` | `authority_id`, `decision_id`, `owner`, `intent`, `scope`, `constraints`, `expiry`, `status`, `created_at`; authority lifecycle state by `decision_id`. |
| `aeo_registry` | `aeo_id`, `authority_id`, `decision_id`, `canonical_aeo`, `validated_object_hash`, `status`, `created_at`; lookup by `decision_id` and `validated_object_hash`. |
| `validation_registry` | `validation_id`, `decision_id`, `validated_object_hash`, `invocation_nonce`, `environment`, `result`, `reason`, `status`, `created_at`; lookup by `decision_id`, `validated_object_hash`, and `invocation_nonce`. |
| `execution_registry` | `execution_id`, `decision_id`, `validated_object_hash`, `invocation_nonce`, `status`, `created_at`; replay guard on `decision_id` and `validated_object_hash`. |
| `proof_registry` | `proof_id`, `execution_id`, `decision_id`, `validated_object_hash`, `surface`, `run_id`, `commit_sha`, `workflow`, `environment`, `created_at`. |
| `invocation_registry` | `decision_id`, `validated_object_hash`, `invocation_nonce`, `status`, `created_at`; primary key on `decision_id`, `validated_object_hash`, and `invocation_nonce`. |

## Drift found before remediation

A fresh database built only from the migration chain before remediation produced stale schemas for authority plus four runtime registries because the canonical enforcement reboot migration used `CREATE TABLE IF NOT EXISTS` against tables already created by earlier migrations.

| Registry | Pre-remediation status | Missing canonical fields / incompatible constraints | Stale lineage source | Later no-op canonical migration |
| --- | --- | --- | --- | --- |
| `authority_registry` | FAIL | Missing `expiry`; missing canonical uniqueness on `decision_id`. | `0001_init.sql`. | `0002_governed_deploy_schema.sql` and `0006_enforcement_reboot_v1.sql`. |
| `aeo_registry` | PASS | None after `0007_canonical_aeo_registry_rebuild.sql`. | `0001_init.sql` created stale `intent` and `aeo` columns. | `0006_enforcement_reboot_v1.sql` used `CREATE TABLE IF NOT EXISTS`; fixed by `0007`. |
| `validation_registry` | FAIL | Missing `invocation_nonce`, `environment`, `reason`; retained stale `authority_id`, `aeo_id`, `intent`; missing `idx_validation_registry_decision_hash_nonce`. | `0001_init.sql`. | `0006_enforcement_reboot_v1.sql`. |
| `execution_registry` | FAIL | Missing `invocation_nonce`; `validated_object_hash` was nullable from additive `ALTER TABLE`; retained stale `authority_id`, `intent`, `webhook_url`, `upstream_status`, `execution_event`. | `0001_init.sql`; nullable hash added by `0004_enforcement_lock.sql`. | `0006_enforcement_reboot_v1.sql`. |
| `proof_registry` | FAIL | Missing `run_id`, `commit_sha`, `workflow`, `environment`; `validated_object_hash` was nullable; retained stale `authority_id`, `proof_reference`, `status`, `timestamp`; missing canonical execution/hash index. | `0001_init.sql`; nullable hash/timestamp added by `0004_enforcement_lock.sql`. | `0006_enforcement_reboot_v1.sql`. |
| `invocation_registry` | FAIL | Had stale `invocation_id` primary key and `consumed_at`; uniqueness was only `decision_id` and `invocation_nonce`, not the canonical triple. | `0005_invocation_registry.sql`. | `0006_enforcement_reboot_v1.sql`. |

## Remediation

`0008_canonical_runtime_registry_rebuild.sql` archives each stale pre-reboot authority/runtime registry and recreates the canonical runtime shape. The migration preserves audit evidence by retaining these legacy archive tables:

- `authority_registry_legacy_pre_reboot`
- `aeo_registry_legacy_pre_reboot`
- `validation_registry_legacy_pre_reboot`
- `execution_registry_legacy_pre_reboot`
- `proof_registry_legacy_pre_reboot`
- `invocation_registry_legacy_pre_reboot`

The invocation registry data is copied into the canonical table because the legacy shape contains all canonical invocation fields. Validation, execution, and proof legacy data remains archived rather than being coerced into canonical rows with invented nonces or proof metadata.

## Runtime risk resolved

- Authority lifecycle creation is compatible with the canonical `expiry` field and unique `decision_id` requirement.
- `validated_object_hash` persistence is NOT NULL in compile, validation, execution, proof, and invocation registries.
- `invocation_nonce` persistence is canonical in validation, execution, and invocation registries.
- `environment` persistence is canonical in validation and proof registries.
- Proof persistence accepts `run_id`, `commit_sha`, `workflow`, and `environment` without stale NOT NULL `proof_reference` or `status` blockers.
- Replay detection is protected by the execution unique constraint on `decision_id` and `validated_object_hash` and invocation primary key on `decision_id`, `validated_object_hash`, and `invocation_nonce`.
- The invariant `validated_object == executed_object` is preserved by the shared canonical hash fields and the execution-time hash comparison.
