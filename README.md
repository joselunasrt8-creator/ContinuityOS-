# mindshift-demo

Cloudflare Worker runtime backed by D1.

## Commands

### 1) Apply schema
```bash
npx wrangler d1 execute mindshift-demo-prod --remote --file schema.sql
```

### 2) Apply D1 migrations
```bash
npx wrangler d1 migrations apply mindshift-demo-prod --remote
```

### 3) Local dev only
```bash
npx wrangler dev --local
```

---

## 🚨 Production Deploy Rule (ENFORCED)

Production deploys are governed by a **single non-bypassable execution path**:

```text
/authority → /compile → /validate → /execute → /proof
```

Core invariant:

> If no valid object exists → nothing happens

This is not a guideline. This is enforced system behavior. fileciteturn23file1

---

## ✅ Only Valid Deploy Path

Production deploys MUST go through:

- `.github/workflows/governed-deploy.yml`
- validated AEO
- Worker execution boundary

No other deploy path is allowed.

---

## ❌ Forbidden Paths

The following are explicitly invalid:

- `wrangler deploy` (direct)
- manual GitHub deploy workflows
- push-triggered production deploys
- any workflow not governed by MindShift

If used:

```text
system integrity = broken
```

---

## 🔐 Security Model

Execution requires:

- valid authority
- exact AEO
- VALID validator result
- unused invocation nonce
- proof-of-transfer

All conditions must pass or execution = NULL.

---

## ⚠️ Known Hardening Requirement

Worker must target:

```text
governed-deploy.yml
```

NOT:

```text
deploy.yml
```

Mismatch violates:

```text
validated_object == executed_object
```

This must be corrected in `src/index.ts`.

---

## 🔒 Final Principle

```text
No structure → no existence → no execution
```

---
