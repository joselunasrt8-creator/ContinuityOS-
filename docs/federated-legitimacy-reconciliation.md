# Federated Legitimacy Reconciliation

## Federation model
MindShift federation reconciliation is **read-only** and **evidence-only**. Remote nodes provide comparative snapshots only; they cannot mutate local runtime state.

## Trust assumptions
Each federated node declares:
- `node_id`
- `governance_version`
- `schema_version`
- `canonical_hash_algorithm`
- `trust_classification`
- `federation_mode`

Allowed federation modes:
- `OBSERVE_ONLY`
- `RECONCILE_ONLY`

Forbidden federation modes:
- `REMOTE_EXECUTION`
- `REMOTE_AUTHORITY`
- `REMOTE_PROOF_ISSUANCE`

## Evidence-only semantics
Federation evidence is comparison material and **never authority**.
Reconciliation output is read-only and preserves:
- `evidence_only: true`
- `read_only: true`
- `mutation_capable: false`
- `creates_authority: false`
- `creates_proof: false`
- `remote_execution_legitimacy: false`

## Drift classes
- `FEDERATION_PROOF_DIVERGENCE`
- `FEDERATION_LINEAGE_DIVERGENCE`
- `FEDERATION_CONTINUITY_MISMATCH`
- `FEDERATION_REPLAY_DIVERGENCE`
- `FEDERATION_ORPHAN_PROOF`
- `FEDERATION_TOPOLOGY_MISMATCH`
- `FEDERATION_SCHEMA_MISMATCH`
- `FEDERATION_UNKNOWN_NODE`
- `FEDERATION_UNTRUSTED_NODE`
- `FEDERATION_NON_CANONICAL_HASH`

## Reconciliation topology
Comparison checks:
- lineage continuity equivalence
- proof ancestry equivalence
- validation equivalence
- replay lineage equivalence
- governance topology equivalence
- divergence/orphaning/drift classification

## Non-authority guarantee
External federation evidence does not grant local authority and does not grant execution permission.

## Canonical runtime preservation
Canonical runtime chain remains unchanged:
`/session` → `/continuity` → `/authority` → `/compile` → `/validate` → `/execute` → `/proof`


## Canonical federation literals (deterministic parity)
- `runtime_id`
- `portable_identifier == canonical_persisted_identifier`
- `created_at is observational metadata only`

Required deterministic identifiers:
- `drift identifiers`
- `FATE identifiers`
- `revocation divergence identifiers`
