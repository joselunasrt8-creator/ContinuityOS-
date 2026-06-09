# Closure Audit — PR #1910 V3 Conformance Suite

**Issue:** #1912
**PR Audited:** #1910
**Branch:** `claude/closure-audit-v3-of0pwd`
**Audit Date:** 2026-06-09

---

## 1. Executive Summary

PR #1910 introduces a cross-language conformance suite that establishes behavioral equivalence between the TypeScript and Rust `continuity-core` implementations for six of the eight declared module categories. The fixture-authority contract is correctly implemented and enforced for canonicalization, hashing, AEO validation, lineage, proof, and replay. Both test suites pass with zero failures against the same fixture files.

**Test results at audit time:**
- `cargo test --test conformance`: 17 passed, 0 failed
- `node --test tests/conformance/ts-conformance.test.mjs`: 38 passed (sub-tests), 0 failed

One module—reconciliation—deviates from the fixture-authority pattern. Both language suites test reconciliation with inline hardcoded inputs rather than shared fixture files. This is the determinative gap.

**Closure determination: PARTIAL**

---

## 2. Evidence Matrix

| Question | Module | Fixture-Driven | TS Pass | Rust Pass | Parity Method | Status |
|----------|--------|---------------|---------|-----------|---------------|--------|
| 1 | Fixture authority | — | — | — | Read-only file access in both suites | ENFORCED |
| 2 | Canonicalization | Yes | 10/10 | 10/10 | Same fixture files, golden hash cross-verified | PROVEN |
| 2 | Hashing | Yes (via canon.) | 1/1 | 1/1 | Identical SHA-256 constants and algorithm | PROVEN |
| 3 | AEO validation | Yes | 7/7 | 7/7 | Same 6 fixture files + mutation test | PROVEN |
| 4 | Replay | Yes | 3/3 | 3/3 | Same fixture file | PROVEN (critical path) |
| 5 | Lineage | Yes | 5/5 | 5/5 | Same fixture file | PROVEN |
| 6 | Proof | Yes | 3/3 | 3/3 | Same fixture file, evidence hash verified | PROVEN |
| 7 | Reconciliation | **No** | 5/5 | 5/5 | Parallel inline inputs, **no shared fixture file** | PARTIAL |

### Fixture authority verification

TS loading pattern:
```js
JSON.parse(readFileSync(join(fixturesDir, filename), 'utf8'))  // read-only
```

Rust loading pattern:
```rust
std::fs::read_to_string(&path)  // read-only
serde_json::from_str(&text)
```

No test suite writes to, generates, or modifies fixture files. Fixture mutations would cause both suites to fail on next run. Ownership is correctly enforced.

### Canonicalization algorithm equivalence

Both implementations produce identical output for all 10 fixture cases. Algorithm symmetry confirmed:

| Rule | TypeScript | Rust | Match |
|------|-----------|------|-------|
| Key sort order | `Object.keys().sort()` | `BTreeMap` (auto-sorted) | Yes |
| Array order | preserved | preserved | Yes |
| No whitespace | `join(",")` with no space | `out.push(',')` with no space | Yes |
| `"`, `\\` escaping | `JSON.stringify` delegates | `write_json_string` handles directly | Yes |
| `\b`, `\f`, `\n`, `\r`, `\t` | `JSON.stringify` delegates | explicit `match` arms | Yes |
| U+0000–U+001F other | `JSON.stringify` delegates | `format!("\\u{:04x}")` | Yes |
| Unicode above U+001F | passthrough | passthrough | Yes |

SHA-256 constants (`H0`, `K[64]`) are byte-for-byte identical between `src/canonical.js` and `continuity-core/src/hashing.rs`.

The golden AEO hash `5e1758831b5d4dbc778d33f5701bf4e50533e12656151ef635ee408990f4e445` appears in `fixtures/conformance/aeo-valid.json` and was independently verified by both implementations before fixture commit.

---

## 3. Portability Risk Matrix

| Risk | Severity | Evidence | Verdict |
|------|----------|----------|---------|
| Reconciliation has no shared fixture | Medium | Both suites use inline hardcoded inputs, not `fixtures/conformance/` files | **Gap — not fixture-authority** |
| `\b`, `\f`, `\r` control chars not covered by canonicalization fixture | Low | Spec rule 4 declares them required; no fixture case exercises them | Coverage gap |
| Replay AMBIGUOUS/USED states lack fixture coverage | Low | Only 3 of 5 possible `ReplayState` values are fixture-tested | Coverage gap |
| Lineage AMBIGUOUS state (duplicate insert) lacks fixture coverage | Low | Duplicate insert path exists in both impls but no fixture covers it | Coverage gap |
| Float/negative number serialization not tested | Low | `large-object` fixture uses only positive integers | Coverage gap |
| Deep ancestry traversal not tested | Negligible | Spec declares only direct parent validation in scope | In-spec |

### Reconciliation gap detail

The spec's fixture inventory (`runtime/V3_CONFORMANCE_SPEC.md`, section "Fixture Inventory") does not list a reconciliation fixture file. Both test suites exercise reconciliation using inline struct/object literals with hardcoded hash strings. The test inputs are structurally equivalent across languages, which provides behavioral parity evidence, but the fixture-authority contract—where **fixtures own the truth and neither implementation does**—is not applied to this module.

This means: if the reconciliation logic diverged between languages, the test suites would not detect it unless the divergence happened to affect one of the five inline cases constructed identically in each language.

### SHA-256 implementation risk

Both SHA-256 implementations are hand-rolled (no external library in production or test scope for Rust). The identical constant arrays and algorithm structure make divergence from a bug highly unlikely but theoretically possible for edge cases in padding or message scheduling. The 10 canonicalization fixture cases, all with independently verified expected hashes, provide a strong cross-language hash check.

---

## 4. Closure Determination

**PARTIAL**

### Reasoning

The fixture-authority contract is correctly established and enforced for six modules:
- Canonicalization (10 cases, golden hash verified)
- Hashing (via canonicalization fixture)
- AEO validation (6 NULL paths + VALID + mutation = 8 behavioral assertions)
- Lineage (5 cases covering valid, root, orphan, unknown, deep-chain)
- Proof (3 cases, evidence hash cross-verified)
- Replay (3 cases, NULL-on-reuse proven)

PR #1910 does prove portability for these modules. The cross-language fixture authority pattern works: both implementations consume the same files and produce matching results.

The closure condition defined in the spec (`cargo test` passes, `node --test` passes, both reference the same fixture files, no fixture is modified) is **met for 7 of 8 modules**. Reconciliation does not satisfy condition 3—it does not reference shared fixture files.

The PR does not merely demonstrate fixture-level equivalence for a trivial subset. The fixture set is small but deliberately covers the NULL-classified failure modes that constitute the legitimacy invariant. The portability contract exists and is functionally demonstrated.

The suite does not achieve complete-coverage fixture-authority equivalence across all eight declared module categories.

---

## 5. Missing Coverage

### Actionable (affects fixture-authority claim)

1. **Reconciliation fixture file absent.** `classify_reconciliation()` is listed in the spec's in-scope module table but has no corresponding file in `fixtures/conformance/`. Both test suites use inline inputs. A `reconciliation-fixtures.json` would close the fixture-authority gap for this module.

### Informational (coverage gaps, not contract violations)

2. **Replay AMBIGUOUS state.** The `ReplayState::Ambiguous` path (nonce used but hash unused, or hash used but nonce unused) has no fixture case. Both implementations handle it identically but it is untested via fixtures.

3. **Canonicalization edge cases.** Spec rule 4 (`\b`, `\f`, `\r`) and rule 5 (U+0000–U+001F other than named sequences) have no dedicated fixture cases. The `special-strings` fixture covers only `\n` and `\t`.

4. **Lineage AMBIGUOUS state.** The `LineageState::Ambiguous` path (duplicate node insert) has no fixture case.

---

## 6. Recommended Follow-On Issue

A single follow-on issue is warranted to close the fixture-authority gap:

**Add `reconciliation-fixtures.json` to `fixtures/conformance/`** covering:
- `null_evidence` → NULL
- `missing_hashes` → PARTIAL
- `ambiguity_detected` → AMBIGUOUS
- `full_match` → RECONCILED
- `hash_mismatch` → DIVERGENT

Both test suites should then load this fixture file instead of inline inputs.

The informational coverage gaps (items 2–4 above) are low-risk and can be deferred unless a future audit requires complete-coverage fixture authority across all state transitions.
