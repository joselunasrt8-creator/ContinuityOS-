# Lab 1 — Create a Legitimacy Object

**Module:** 1 and 2  
**Estimated time:** 30 minutes  
**Prerequisites:** Repository cloned locally; Node.js installed

---

## Goal

Write a legitimacy object (an AEO) from scratch and verify that it is recognized as structurally valid by the `toCanonicalAeo()` function.

---

## Background

A legitimacy object has exactly five required top-level keys:

```typescript
interface CanonicalAEO {
  intent: string
  scope: Record<string, unknown>
  validation: Record<string, unknown>
  target: Record<string, unknown>
  finality: Record<string, unknown>
}
```

No extra keys are allowed. No required keys may be missing.

The existing example is at [`aeo.json`](../../../aeo.json) — read it before starting.

---

## Steps

### Step 1 — Read the existing AEO

Open `aeo.json` in your editor. Identify:
- What is the `intent`?
- What does `scope.env` describe?
- What does `validation.proof_required` enforce?
- What is `validation.replay_nonce`?

### Step 2 — Write your own AEO

Create a new file `my-aeo.json` in the repo root. Write a legitimacy object for a different action — for example, "rotate API key for staging environment".

Your AEO must have exactly these five top-level keys:

```json
{
  "intent": "...",
  "scope": { ... },
  "validation": {
    "proof_required": true,
    "replay_nonce": "generate-a-uuid-here",
    "authority_class": "..."
  },
  "target": { ... },
  "finality": {
    "continuity_required": true
  }
}
```

Generate a UUID for `replay_nonce`:

```bash
node -e "console.log(require('crypto').randomUUID())"
```

### Step 3 — Validate the structure

Run the structure check:

```bash
node -e "
const aeo = require('./my-aeo.json');
const REQUIRED = ['intent', 'scope', 'validation', 'target', 'finality'];
const keys = Object.keys(aeo).sort();
const missing = REQUIRED.filter(k => !aeo[k]);
const extra = keys.filter(k => !REQUIRED.includes(k));
console.log('Keys present:', keys);
console.log('Missing:', missing.length ? missing : 'none');
console.log('Extra:', extra.length ? extra : 'none');
console.log(missing.length === 0 && extra.length === 0 ? 'VALID STRUCTURE' : 'INVALID STRUCTURE');
"
```

Expected output: `VALID STRUCTURE`

### Step 4 — Try adding an extra key

Add a key like `"metadata": {}` to your AEO and run the structure check again.

Expected output: `Extra: [ 'metadata' ]` — `INVALID STRUCTURE`

This is the exact-object discipline: no extra keys.

### Step 5 — Remove a required key

Remove the `finality` key from your AEO and run the structure check.

Expected output: `Missing: [ 'finality' ]` — `INVALID STRUCTURE`

---

## Expected Results

| Scenario | Expected |
|----------|----------|
| All 5 keys present, no extras | `VALID STRUCTURE` |
| Extra key added | `INVALID STRUCTURE` |
| Required key removed | `INVALID STRUCTURE` |

---

## Assignment (Module 2)

Write definitions of the following in your own words (2-3 sentences each):

1. **ATAO** — what is it and when is it created?
2. **AEO** — how does it differ from an ATAO?
3. **Authority** — what does it bind and what are its three states?
4. **Proof** — what does it record and why is it append-only?

---

## Next

[Lab 2 — Canonicalize and hash an AEO](lab-2.md)
