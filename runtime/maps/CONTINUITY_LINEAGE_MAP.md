# Continuity Lineage Map

Status: Non-Operative

## Core invariant

```text
No valid continuity chain → no valid authority → no valid execution
```

## Canonical lineage

```text
identity
→ session
→ continuity
→ authority
→ AEO
→ validation
→ execution
→ proof
→ registry persistence
```

## Revocation rule

```text
revoked continuity
→ descendant authority invalid
→ descendant validation invalid
→ descendant execution invalid
```

## Orphan prevention

Any authority, validation, execution, or proof record without a valid ancestry chain is invalid.

## Replay relation

Continuity state must bind replay state so reused authority, duplicate object hashes, or orphaned invocation attempts fail closed.
