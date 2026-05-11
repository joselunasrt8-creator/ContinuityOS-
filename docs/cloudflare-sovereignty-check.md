# Cloudflare Sovereignty Check

MODE B — STRUCTURED ARTIFACT

Status: Non-Operative

Purpose:
Document unresolved deploy credential sovereignty assumptions.

## Required verification

1. Which GitHub environment owns Cloudflare deploy credentials.
2. Which workflows may access those secrets.
3. Whether manual Cloudflare dashboard deploys are disabled or procedurally forbidden.
4. Whether Cloudflare API tokens can deploy outside governed workflows.
5. Whether branch protections prevent unauthorized workflow mutation.
6. Whether production deploy requires governed-deploy.yml.

## Current evidence

- `npm run deploy` is disabled.
- `.github/workflows/governed-deploy.yml` is the canonical production deploy workflow.
- governed-deploy requires:

```text
decision_id
validated_object_hash
invocation_nonce
```

- governed-deploy calls:

```text
/session
/authority
/compile
/validate
/execute
/proof
```

## Unresolved sovereignty risks

Repository evidence alone cannot prove:

```text
Cloudflare dashboard deploy prohibition
Cloudflare token scope exclusivity
GitHub environment secret exclusivity
workflow mutation protections
```

Until verified:

```text
SOVEREIGNTY_BOUNDARY_STILL_OPEN
```
