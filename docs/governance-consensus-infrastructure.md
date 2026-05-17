# Governance Consensus Infrastructure

Governance consensus evidence is observability-only. It may classify legitimacy, quarantine ambiguity, and degrade legitimacy, but it never creates authority, proof permission, merge permission, deploy permission, or execution permission.

## Routes

GET-only routes added outside `CANONICAL_RUNTIME_ROUTES`:

- `/consensus/observer/checkpoint`
- `/consensus/observer/equivalence`
- `/consensus/observer/drift`
- `/conformance/runtime`
- `/conformance/equivalence`
- `/conformance/checkpoint`

## Registries

Append-only evidence registries:

- `observer_attestation_registry`
- `semantic_equivalence_registry`
- `portable_governance_checkpoint_registry`
- `external_conformance_verification_registry`

Each registry rejects `UPDATE` and `DELETE` through D1 triggers and stores only non-authoritative, replay-neutral evidence.

## Invariants

- Observer agreement is not execution permission.
- Semantic equivalence is not authority inheritance.
- Remote legitimacy is not local legitimacy.
- Portable checkpoints are JCS-compatible, DSSE-compatible, exact-object stable, replay-neutral evidence.
- Any ambiguity or drift collapses legitimacy to `NULL`.
