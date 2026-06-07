# Cloudflare Access Service-Token Investigation

MODE B — STRUCTURED ARTIFACT

Status: Partially Closed (in-repo surface) / Open (external account surface)

## Problem

Cloudflare Access service-token authentication prevents requests from
reaching the MindShift runtime. Requests intended for canonical runtime
endpoints (`/session`, `/continuity`, `/authority`, `/compile`,
`/validate`, `/execute`, `/proof`) are intercepted by Cloudflare Access
and redirected to the Access login flow before the Worker executes.

Observed evidence:

```text
Cloudflare Access
→ HTTP 302
→ service_token_status=false
→ redirect to login endpoint
→ Worker not reached
→ runtime not executed
```

This is isolated to the Cloudflare Access boundary. It does not implicate
the ContinuityOS runtime, governance workflows, authority validation,
proof generation, replay enforcement, or D1 infrastructure — all of which
sit *behind* the Access boundary and never receive the request.

## Repository-side finding (closed)

Before this change, none of the canonical-chain callers
(`.github/workflows/governed-deploy.yml`,
`.github/workflows/prepare-governed-deploy.yml`,
`.github/workflows/governance-mutation-authorization.yml`) presented a
Cloudflare Access service token on requests to `MINDSHIFT_WORKER_URL`.
Every canonical-chain `curl` invocation sent only:

```text
Content-Type: application/json
X-API-Key: $API_KEY
```

If `MINDSHIFT_WORKER_URL` is (or becomes) an Access-protected hostname,
Cloudflare Access has no service-token credential to evaluate. It returns
`service_token_status=false`, issues an HTTP 302 to its login flow, and
the Worker never sees the request — exactly matching the observed evidence
and the `301|302|307|308` branch already anticipated by the
`governance-mutation-authorization.yml` PREFLIGHT step.

### Remediation applied

`CF-Access-Client-Id` and `CF-Access-Client-Secret` headers, sourced from
new `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` repository secrets,
are now attached to every canonical-chain request in all three workflows
(17 `curl` invocations total). The PREFLIGHT diagnostic in
`governance-mutation-authorization.yml` was updated to call out the
Access redirect failure mode — missing, unattached, or policy-disallowed
service-token credentials — alongside the pre-existing
"wrong WORKER_URL" diagnosis.

When `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` are unset (i.e. the
endpoint is not behind Access), the headers are sent with empty values,
which Cloudflare and the Worker both ignore — no behavioral change for
non-Access deployments.

`curl -L` remains intentionally absent: following a redirect without
validating the destination host would forward `API_KEY` and the Access
service-token credential to an unvalidated destination
(credential-exfiltration vector).

## External finding (open — requires Cloudflare account access)

Repository evidence alone cannot answer the dashboard-side investigation
questions, because Access application/policy/service-token configuration
lives outside the repository:

| # | Question | Answerable from repo? |
|---|---|---|
| 1 | Is the service token correctly attached to the Access application? | No — Access dashboard only |
| 2 | Does the Access policy explicitly allow the service token? | No — Access dashboard only |
| 3 | Is the Access application protecting the expected hostname? | No — Access dashboard only |
| 4 | Is the Worker URL aligned with the Access application configuration? | Partial — `MINDSHIFT_WORKER_URL` is a secret; alignment must be confirmed by whoever holds it |
| 5 | Does Cloudflare Access recognize the presented service token? | Was previously **unanswerable — no token was presented**. Now answerable once `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` secrets are populated and a workflow run is observed |
| 6 | Can authenticated requests be observed reaching the Worker runtime? | Observable post-fix via workflow PREFLIGHT output (`preflight_http_status`) and Worker logs |

## Required external configuration (account-level, outside this repo)

1. Create (or reuse) a Cloudflare Access **service token** scoped to the
   hostname that fronts the MindShift Worker.
2. Attach the service token to the Access **application** protecting that
   hostname.
3. Add an Access **policy** rule that explicitly allows
   "Service Auth" / the specific service token for that application.
4. Confirm the protected hostname matches `MINDSHIFT_WORKER_URL`.
5. Populate the GitHub Actions secrets `CF_ACCESS_CLIENT_ID` and
   `CF_ACCESS_CLIENT_SECRET` with the service token's Client ID and
   Client Secret (Organization → Service Auth in the Cloudflare Zero
   Trust dashboard).

## Verification path (post-configuration)

1. Run `governance-mutation-authorization.yml` (workflow_dispatch).
2. Inspect the PREFLIGHT step output:
   - `preflight_http_status` should be `2xx` (not `301|302|307|308`).
   - `preflight_content_type` should contain `application/json`.
3. Confirm `session.json` / `gma_session.json` contains
   `{"status":"SESSION_ACTIVE","session_id":"..."}` rather than an Access
   login page body.
4. Confirm Worker execution is observable in Cloudflare Worker logs for
   the corresponding request window.

## Closure condition

```text
service-token request reaches Worker
AND Cloudflare Access reports service_token_status=true
AND /session returns canonical runtime JSON
AND Worker execution is observable in logs
```

Until Cloudflare account-level configuration (service token attachment,
policy allowance, hostname alignment) is confirmed and a live workflow run
demonstrates a `2xx` PREFLIGHT result, this remains:

```text
ACCESS_BOUNDARY_PARTIALLY_CONTAINED — credential path wired, account
configuration unverifiable from repository evidence
```
