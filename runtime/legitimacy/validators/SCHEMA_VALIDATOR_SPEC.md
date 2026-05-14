# Deterministic Schema Validator Specification

Status: Non-Operative

## Purpose

Bind canonical legitimacy schemas to deterministic validation rules.

Schemas:

- `runtime/legitimacy/schemas/AUTHORITY.schema.json`
- `runtime/legitimacy/schemas/ATAO.schema.json`
- `runtime/legitimacy/schemas/AEO.schema.json`
- `runtime/legitimacy/schemas/PREO.schema.json`
- `runtime/legitimacy/schemas/SCO.schema.json`
- `runtime/legitimacy/schemas/PROOF_OBJECT.schema.json`
- `runtime/legitimacy/schemas/CONTINUITY_OBJECT.schema.json`
- `runtime/legitimacy/schemas/FEDERATION_ENVELOPE.schema.json`

## Core Invariant

```text
If no valid object exists → nothing happens
```

## Validation Contract

Each object validation MUST perform:

1. JSON parse
2. schema selection by `object_type`
3. required-field validation
4. forbidden-field validation through `additionalProperties: false`
5. canonicalization requirement check
6. hash-relevant-field presence check
7. fail-closed result emission

## Outputs

```text
VALID_SCHEMA
INVALID_SCHEMA
UNKNOWN_OBJECT_TYPE
NULL
```

## Fail-Closed Rule

Any malformed, incomplete, unknown, or schema-invalid object returns:

```text
NULL
```

## Non-Execution Boundary

Schema validation does not:

- grant authority
- execute actions
- create proof
- mutate state
- imply runtime legitimacy

## Next Binding

Validator implementation should later expose deterministic helper functions for topology-aware FATE.
