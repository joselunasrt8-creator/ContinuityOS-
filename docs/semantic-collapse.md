# Semantic Collapse (Execution-Minimal Governance)

## Canonical primitive model

This repository collapses overlapping governance semantics into a minimal runtime authority surface that preserves canonical execution invariants:

`VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID`

The authoritative primitive registry is defined in `governance/runtime/SEMANTIC_COLLAPSE_REGISTRY.json` and constrains semantic ownership to execution-relevant domains only.

## Semantic compression strategy

Primary domain compression:

- continuity → authority continuity, replay continuity, execution continuity
- lineage → proof lineage, execution lineage
- observability → evidence-only observability
- orchestration → execution coordination boundary
- governance → execution governance

All collapsed domains remain subordinate to execution-relevant primitives and are forbidden from creating new authority paths.

## Execution-minimal governance

Preserved execution-relevant primitives:

- authority
- validation
- execution
- proof
- replay protection
- continuity binding
- deterministic topology
- registry persistence
- merge governance

Everything outside these primitives is treated as derived, archival, documentation-only, or removed from runtime authority.

## Authority boundary preservation

No mutation is made to runtime validators, execution routes, proof persistence, replay protections, or authority lifecycle. Semantic collapse is governance-only classification and duplicate ownership control.

## Ontology drift reduction

`node scripts/semantic_collapse_validator.mjs` scans governance/runtime, runtime/governance, docs, and archive scopes to detect duplicate runtime concept ownership and enforce singular authoritative ownership with fail-closed behavior.

## Fail-closed semantic ownership

If conflicting authoritative domain ownership remains, the validator exits non-zero and emits `governance/runtime/SEMANTIC_COLLAPSE_REPORT.json` for deterministic audit and reconciliation.
