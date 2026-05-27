# Module 3 — Exact-Object Validation

**Duration:** ~1.5 hours  
**Lab:** [L2 — Canonicalize and hash an AEO](labs/lab-2.md), [L3 — Validate exact object; observe NULL on mutation](labs/lab-3.md)  
**Assignment:** Submit a hash mismatch scenario and explain why it returns NULL.

---

## Learning Objectives

By the end of this module you will be able to:

1. Explain canonical serialization and why key ordering matters
2. Compute the `validated_object_hash` for a given AEO
3. Demonstrate that any mutation to an AEO after validation returns NULL
4. Explain TOCTOU and why `validated_object == executed_object` prevents it

---

## 3.1 The Problem: TOCTOU

**TOCTOU** stands for Time-Of-Check / Time-Of-Use. It describes a class of vulnerabilities where:

1. A system *checks* whether an action is valid (the check)
2. Something mutates the action between check and execution (the window)
3. The system *uses* (executes) the mutated action — which was never validated (the violation)

In a legitimacy-governed system, this would mean:
- An AEO is validated at time T
- The AEO is mutated between T and T+1
- The mutated AEO is executed at T+1

The mutation was never validated. The execution is illegitimate.

ContinuityOS prevents this with a single invariant:

```
validated_object == executed_object
```

If the object at execution time does not exactly match the object that was validated, the result is NULL.

---

## 3.2 Canonical Serialization

To compare two objects deterministically, they must be serialized into the same byte sequence regardless of how they were constructed.

**The problem with JSON:**

```javascript
// These two objects are semantically identical but produce different JSON
JSON.stringify({ b: 2, a: 1 }) // → '{"b":2,"a":1}'
JSON.stringify({ a: 1, b: 2 }) // → '{"a":1,"b":2}'
```

If different serializations produce different hashes, then two identical AEOs might have different hashes depending on insertion order — breaking determinism.

**Canonical serialization** solves this by enforcing deterministic key ordering:

```javascript
// Canonical: keys sorted alphabetically at every level
canonicalize({ b: 2, a: 1 }) // → '{"a":1,"b":2}'
canonicalize({ a: 1, b: 2 }) // → '{"a":1,"b":2}'
```

Both produce the same canonical form, and therefore the same hash.

**Code reference:** [`src/canonical.js`](../../src/canonical.js), [`src/canonical-authority.js`](../../src/canonical-authority.js)

---

## 3.3 Object Hashing

Once an AEO is in canonical form, it is hashed using SHA-256:

```
validated_object_hash = SHA-256(canonicalize(aeo))
```

This hash is:
- Stored in the `validation_registry` when the AEO is validated
- Passed as a required input to the `/execute` route
- Checked at execution time against the compiled AEO

**Properties:**
- Deterministic: same AEO → same hash every time
- Collision-resistant: different AEOs → different hashes (with overwhelming probability)
- Non-reversible: knowing the hash does not reveal the AEO content

---

## 3.4 The Compile → Validate → Execute Chain

The three steps that enforce exact-object discipline:

### Step 1: Compile (`/compile`)
```
ATAO + Authority → AEO
AEO → canonicalize → SHA-256 → validated_object_hash
Store AEO + hash in aeo_registry
```

### Step 2: Validate (`/validate`)
```
Input: decision_id, validated_object_hash, invocation_nonce
Check: AEO exists in aeo_registry with matching hash
Check: Authority is ACTIVE and not expired
Check: Nonce not previously consumed
Check: All legitimacy predicates pass
Output: VALID or NULL
Store result in validation_registry
```

### Step 3: Execute (`/execute`)
```
Input: decision_id, validated_object_hash, invocation_nonce
Check: ValidationResult is VALID
Check: validated_object_hash matches aeo_registry entry
Check: Nonce not consumed since validation
Execute only if all checks pass
Output: execution record
```

**At no point does an object travel from validation to execution without a hash check.**

---

## 3.5 What Happens When an Object Is Mutated

Scenario: an AEO is compiled and validated. An attacker (or a bug) mutates one field before execution.

```javascript
// Original AEO (validated)
{
  "intent": "deploy production worker",
  "scope": { "env": "production" },
  "target": { "repo": "my-org/my-repo", "branch": "main" }
}
// validated_object_hash = "a3f8..."

// Mutated AEO (at execution time)
{
  "intent": "deploy production worker",
  "scope": { "env": "production" },
  "target": { "repo": "my-org/my-repo", "branch": "attacker-branch" }  // ← mutated
}
// hash of mutated object = "c91b..."  // ← different hash
```

At execution:
1. Runtime computes hash of the object being executed: `c91b...`
2. Runtime looks up `validated_object_hash` in `validation_registry`: `a3f8...`
3. `c91b... ≠ a3f8...` → hash mismatch
4. Result: **NULL** — execution does not proceed

The mutation is detected deterministically. No execution occurs.

---

## 3.6 Required AEO Fields

The `CanonicalAEO` type requires exactly five top-level keys. No more, no fewer:

```typescript
interface CanonicalAEO {
  intent: string                      // what is being attempted
  scope: Record<string, unknown>      // what resources are in scope
  validation: Record<string, unknown> // validation criteria
  target: Record<string, unknown>     // exact target
  finality: Record<string, unknown>   // how the result is recorded
}
```

If any required key is missing → `toCanonicalAeo()` returns `null` → compilation fails → NULL.  
If any extra key is present → `toCanonicalAeo()` returns `null` → compilation fails → NULL.

**Code reference:** [`src/lib/aeo-governance.ts`](../../src/lib/aeo-governance.ts)

---

## 3.7 The Exact-Object Discipline in Practice

The phrase "exact-object discipline" means:

1. The object that enters validation is recorded by hash
2. The object that enters execution is compared to that hash
3. Any difference — however small — breaks the chain and returns NULL

This has operational implications:

- You cannot "fix" an AEO after it is compiled (re-compile → new hash → new validation required)
- You cannot add fields "for debugging" (extra fields → hash mismatch)
- You cannot reorder fields (canonical serialization handles this, but source-level reordering would not matter because canonical form is what is hashed)
- You cannot change the nonce (the nonce is part of the validated object)

---

## Knowledge Check

1. Why does ContinuityOS use canonical serialization instead of `JSON.stringify`?
2. An AEO has `validated_object_hash = "a3f8..."`. At execution time, the computed hash is `"a3f9..."`. What is the result of the execution attempt?
3. What is TOCTOU and why does `validated_object == executed_object` prevent it?

---

## Code to Read

- [`src/canonical.js`](../../src/canonical.js) — canonical serialization function
- [`src/lib/aeo-governance.ts`](../../src/lib/aeo-governance.ts) — `toCanonicalAeo()`, `REQUIRED_AEO_KEYS`
- [`src/result.ts`](../../src/result.ts) — `canonicalNullResult()`, `isCanonicalNullResult()`
- [`runtime/aeo-governance.test.ts`](../../runtime/aeo-governance.test.ts) — tests for missing/extra field handling and hash determinism

---

## Next

[Module 4 — Governed CI/CD Surface](module-4.md): apply exact-object discipline to a GitHub Actions deploy workflow.
