# V3 Conformance Spec — TypeScript and Rust continuity-core Portability Proof

## Status

**Active** — V3 blocker.

This document governs the cross-language conformance suite that proves the TypeScript and Rust
continuity-core implementations are equivalent for all kernel-critical operations.

---

## Objective

Prove portability.

> TypeScript continuity-core == Rust continuity-core

for all kernel-critical behavior.

This spec does not add execution surfaces.
This spec does not change validator behavior.
This spec does not introduce new AEO schema fields.

It proves that both implementations preserve the same legitimacy semantics.

---

## Scope

### In scope

| Module | TypeScript | Rust |
|--------|-----------|------|
| Canonicalization | `src/canonical.js` → `canonicalize()` | `canonicalization.rs` → `canonical_string()` |
| Identity hashing | `src/canonical.js` → `sha256Hex()` | `hashing.rs` → `canonical_sha256_hex()` |
| AEO validation | `src/continuity-core.js` → `validateAeo()` | `aeo_validation.rs` → `validate_aeo()` |
| NULL classification | all failure paths → `'NULL'` | all failure paths → `ValidationDecision::Null` |
| Proof envelope | `src/continuity-core.js` → `buildProofEnvelope()` | `proof.rs` → `ProofEnvelope::from_evidence()` |
| Lineage verification | `src/continuity-core.js` → `classifyAsValidation()` | `lineage.rs` → `classify_as_validation()` |
| Replay classification | `src/continuity-core.js` → `createReplayRegistry()` | `replay.rs` → `ReplayRegistry` |
| Reconciliation | `src/continuity-core.js` → `classifyReconciliation()` | `reconciliation.rs` → `classify_reconciliation()` |

### Out of scope

- Execution surfaces (Cloudflare, SQLite, Postgres, WASM)
- Storage adapters
- Cloud adapters
- CLI behavior
- Authority creation
- Deployment logic
- Performance benchmarks
- Feature expansion

---

## Required Guarantees

For identical inputs:

```
canonical object → identical canonical form
canonical form   → identical hash
invalid object   → identical NULL classification
valid object     → identical VALID classification
proof input      → identical proof envelope structure
lineage graph    → identical lineage state
```

No divergence is allowed.

---

## Fixture Ownership

**Fixtures own the truth.**

Neither the TypeScript implementation nor the Rust implementation owns the expected values.
The JSON fixtures in `fixtures/conformance/` define the expected output.
Both test suites must pass against the same fixture files.

---

## Fixture Inventory

All fixtures are in `fixtures/conformance/`.

### Canonicalization

| File | Cases | What it proves |
|------|-------|----------------|
| `canonicalization-fixtures.json` | 10 | Sorted keys, nested objects, array preservation, unicode passthrough, empty object, null value, escape sequences, booleans, deep nesting, large objects |

### AEO Validation

| File | Expected decision | What it proves |
|------|------------------|----------------|
| `aeo-valid.json` | VALID | Correct 5-field AEO with valid hash, authority, and scope |
| `invalid-missing-field.json` | NULL | Missing `finality` field → NULL |
| `invalid-extra-field.json` | NULL | Extra field present → NULL (scope expansion blocked) |
| `invalid-hash.json` | NULL | `validation.object_hash` mismatch → NULL |
| `invalid-authority.json` | NULL | One `authority_id` does not match expected → NULL |
| `invalid-scope-overflow.json` | NULL | Scope bound outside `maximum_scope` → NULL |

### Lineage

| File | Cases | What it proves |
|------|-------|----------------|
| `lineage-fixture.json` | 5 | Valid node, root node, orphan → NULL, unknown → NULL, deep chain |

### Proof Envelope

| File | Cases | What it proves |
|------|-------|----------------|
| `proof-fixture.json` | 3 | Evidence present → envelope with correct hash, null evidence → no envelope, empty result → no envelope |

### Replay

| File | Cases | What it proves |
|------|-------|----------------|
| `invalid-replay.json` | 3 | First use → UNUSED, reuse → NULL, missing lineage binding → NULL |

---

## Canonicalization Contract

Both implementations must produce identical output for the same logical JSON value.

Rules:
1. Object keys are sorted lexicographically at every nesting level.
2. Array element order is preserved.
3. Unicode characters above U+001F pass through unescaped.
4. Control characters `\b`, `\f`, `\n`, `\r`, `\t` are serialised as two-character escape sequences.
5. Other control characters (U+0000–U+001F) are serialised as `\uXXXX`.
6. No whitespace between tokens.

---

## Hashing Contract

Both implementations use pure SHA-256 over the UTF-8 encoding of the canonical string.

```
hash(object) = sha256_hex(utf8_encode(canonical_string(object)))
```

Output: 64-character lowercase hexadecimal string.

---

## AEO Hash Binding

When computing the AEO `object_hash`:

1. Set `validation.object_hash` to `null`.
2. Compute `hash(aeo_with_null_hash)`.
3. Store that hash in `validation.object_hash`.

Both implementations use `aeoObjectForHash()` / `aeo_object_for_hash()` for this normalization.

The golden AEO hash for the conformance fixture is:

```
5e1758831b5d4dbc778d33f5701bf4e50533e12656151ef635ee408990f4e445
```

This was independently verified by both the TypeScript and Rust implementations before being
committed to the fixture file.

---

## NULL Classification Contract

The following inputs must always produce NULL in both implementations:

| Scenario | NULL trigger |
|----------|-------------|
| Missing required AEO field | `has_exact_required_fields` fails |
| Extra AEO field | `has_exact_required_fields` fails (scope expansion) |
| Hash mismatch | `object_hash_matches` fails |
| Authority mismatch | `authority_fields_match` fails |
| Scope overflow | `contains_all` fails |
| Orphan lineage node | Parent ID absent from graph |
| Unknown lineage node | Node ID absent from graph |
| Null proof evidence | `from_evidence(id, None)` → None |
| Nonce reuse | Registry `admit` on used nonce |
| Missing lineage binding | `classify` with None lineage → NULL |
| Missing reconciliation evidence | `classify_reconciliation(None)` → NULL |

---

## Test Locations

| Language | File |
|----------|------|
| TypeScript | `tests/conformance/ts-conformance.test.mjs` |
| Rust | `continuity-core/tests/conformance.rs` |

---

## Running the Suite

**TypeScript:**
```
node --import tsx --test tests/conformance/ts-conformance.test.mjs
```

**Rust:**
```
cd continuity-core && cargo test --test conformance
```

---

## Acceptance Criteria

For every fixture in `fixtures/conformance/`:

```
TypeScript result == fixture expected value
Rust result      == fixture expected value
```

Therefore:

```
TypeScript result == Rust result
```

No divergence allowed in:
- canonicalization
- hashing
- AEO validation decision
- NULL classification reason category
- proof envelope presence
- evidence_hash value
- lineage state

---

## Closure Condition

This spec is satisfied when:

1. `cargo test --test conformance` passes with zero failures.
2. `node --test tests/conformance/ts-conformance.test.mjs` passes with zero failures.
3. Both test suites reference the same fixture files.
4. No fixture file is modified by any test run.

When these conditions hold, portability is proven:

> All execution surfaces that depend on continuity-core can rely on one proven contract
> rather than one implementation's behavior.
