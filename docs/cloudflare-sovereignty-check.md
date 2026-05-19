# Cloudflare Sovereignty Check

MODE B — STRUCTURED ARTIFACT

Status: Non-Operative

Purpose:
Document unresolved deploy credential sovereignty assumptions and observed bypass evidence.

## Required verification

1. Which GitHub environment owns Cloudflare deploy credentials.
2. Which workflows may access those secrets.
3. Whether manual Cloudflare dashboard deploys are disabled or procedurally forbidden.
4. Whether Cloudflare API tokens can deploy outside governed workflows.
5. Whether branch protections prevent unauthorized workflow mutation.
6. Whether production deploy requires governed-deploy.yml.
7. Whether Cloudflare Git integration auto-preview deploys are disabled or routed through MindShift.

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

## Observed sovereignty violation

During PR #252 review, Cloudflare Workers bot reported an automatic successful deployment for the PR branch:

```text
Deployment successful
Commit Preview URL
Branch Preview URL
```

This occurred as a platform preview deploy outside the MindShift canonical route:

```text
/authority
→ /compile
→ /validate
→ /execute
→ /proof
```

Classification:

```text
BYPASS_DETECTED
```

Reason:

```text
Cloudflare Git integration / preview deploy can create a runtime deployment without MindShift authority, validation, execution boundary, or proof registry closure.
```

## Required remediation

Before claiming runtime sovereignty:

1. Disable Cloudflare automatic preview deployments for PR branches, or
2. Route preview deployment through a MindShift-governed preview workflow, or
3. Classify preview deployment as explicitly non-production but still outside canonical sovereignty.

Until one of those is completed:

```text
SOVEREIGNTY_BOUNDARY_STILL_OPEN
```

## Unresolved sovereignty risks

Repository evidence alone cannot prove:

```text
Cloudflare dashboard deploy prohibition
Cloudflare token scope exclusivity
GitHub environment secret exclusivity
workflow mutation protections
Cloudflare Git preview deploy disablement
```

## Closure condition

Cloudflare deployment capability must not create runtime state outside MindShift governance.

Otherwise:

```text
system integrity = broken for that execution surface
```

## Issue #584 containment update (2026-05-19)

- `wrangler.toml` has no Git Integration production toggle; runtime governance therefore treats Cloudflare Git Integration as an external-root settings dependency.
- `package.json` keeps direct deploy fail-closed (`npm run deploy` exits non-zero).
- `.github/workflows/governed-deploy.yml` remains the only declared canonical production deploy workflow.
- Cloudflare Git Integration is now explicitly classified in `runtime/sovereignty/root_authority_inventory.json` as:
  - `production_capability: true`
  - `governed_by_mindshift: false`
  - `preview_target_only: true`
  - `production_mutation_allowed: false`
  - `bypass_risk: P3`
  - `status: OPEN`

Containment decision:
- Selected strategy: constrain Git Integration to preview-only and classify production mutation capability as explicitly OPEN until account-level disablement evidence is present.
- No new runtime path or execution surface was added.
