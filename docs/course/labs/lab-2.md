# Lab 2 — Canonicalize and Hash an AEO

**Module:** 3  
**Estimated time:** 20 minutes  
**Prerequisites:** Lab 1 complete; `my-aeo.json` created

---

## Goal

Canonicalize your AEO, compute its SHA-256 hash, and observe that the hash is deterministic regardless of key insertion order.

---

## Background

JSON serialization is not deterministic: `{ b: 2, a: 1 }` and `{ a: 1, b: 2 }` are semantically identical but produce different `JSON.stringify` output.

Canonical serialization enforces alphabetical key ordering at every level of nesting, producing a single deterministic byte sequence for a given object.

**Code reference:** [`src/canonical.js`](../../../src/canonical.js)

---

## Steps

### Step 1 — Compute the canonical form

```bash
node -e "
const { canonicalize } = require('./src/canonical.js');
const aeo = require('./my-aeo.json');
console.log(canonicalize(aeo));
"
```

Observe the output. Keys should be in alphabetical order at every level.

### Step 2 — Hash the canonical form

```bash
node -e "
const { canonicalize } = require('./src/canonical.js');
const crypto = require('crypto');
const aeo = require('./my-aeo.json');
const canonical = canonicalize(aeo);
const hash = crypto.createHash('sha256').update(canonical).digest('hex');
console.log('canonical:', canonical);
console.log('hash:', hash);
"
```

Record your hash. This is the `validated_object_hash` for your AEO.

### Step 3 — Verify determinism

Create a second version of your AEO with the same content but different key order. In `my-aeo-reordered.json`, reverse the order of keys in `scope`:

```json
{
  "finality": { "continuity_required": true },
  "intent": "...",
  "scope": { ... },
  "target": { ... },
  "validation": { ... }
}
```

(Top-level keys in reverse alphabetical order)

Hash this version:

```bash
node -e "
const { canonicalize } = require('./src/canonical.js');
const crypto = require('crypto');
const aeo = require('./my-aeo-reordered.json');
const hash = crypto.createHash('sha256').update(canonicalize(aeo)).digest('hex');
console.log('hash:', hash);
"
```

**Expected:** the hash is identical to Step 2. Key order in the source file does not affect the canonical hash.

### Step 4 — Observe non-determinism without canonicalization

```bash
node -e "
const aeo = require('./my-aeo.json');
const aeoReordered = require('./my-aeo-reordered.json');
const crypto = require('crypto');
const h1 = crypto.createHash('sha256').update(JSON.stringify(aeo)).digest('hex');
const h2 = crypto.createHash('sha256').update(JSON.stringify(aeoReordered)).digest('hex');
console.log('JSON.stringify hash 1:', h1);
console.log('JSON.stringify hash 2:', h2);
console.log('Same?', h1 === h2);
"
```

**Expected:** the two hashes are different. `JSON.stringify` is not canonical.

---

## Expected Results

| Scenario | Expected |
|----------|----------|
| Canonical hash of `my-aeo.json` | Deterministic value, same on every run |
| Canonical hash of `my-aeo-reordered.json` | **Identical** to above |
| `JSON.stringify` hash of both | Different values |

---

## Next

[Lab 3 — Validate exact object; observe NULL on mutation](lab-3.md)
