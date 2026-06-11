# Cloudflare Deploy Authority Verification Runbook (Issue #1989)

This runbook describes the operator-side steps required to produce evidence
records for `governance/runtime/evidence/`. It does not perform any of these
steps itself, and no step has been performed as part of issue #1989.

## RB-001 — Cloudflare Git Integration

1. In the Cloudflare dashboard, open **Workers & Pages > mindshift-demo >
   Settings > Build & deployments** (or equivalent current UI path).
2. Confirm whether a Git repository is connected for automatic deploys.
3. Capture the result:
   - Export the settings panel (screenshot or, if available, API response
     from `GET /accounts/{account_id}/workers/scripts/{script}/deployments`
     or the Git integration settings endpoint).
   - Record the SHA-256 hash of the captured artifact.
4. Re-test by opening a PR that modifies `src/index.ts` and confirming
   whether the Cloudflare bot posts an automatic deployment comment.
   Record the PR link and outcome.
5. Fill out `evidence-record.template.json` as
   `RB-001_<verification_date>.json` with `source`, `evidence_description`,
   and `evidence_reference` pointing at the captured artifact and PR link.
6. Submit the evidence record for governance review. Only after review
   should `RESIDUAL_BYPASS_MATRIX.json` RB-001 and
   `CLOUDFLARE_AUTHORITY_CLASSIFICATION.json` CF-001 be updated.

## RB-002 — Direct wrangler deploy / Cloudflare API token authority

1. Identify how `npx wrangler deploy` in
   `.github/workflows/governed-deploy.yml` authenticates to Cloudflare:
   - Check repository, environment, and organization secrets for
     `CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` (name only — do not record
     secret values).
   - Note which GitHub Environment(s) and which workflows can access that
     secret.
2. In the Cloudflare dashboard, open **My Profile > API Tokens** and locate
   the token(s) with `Workers Scripts:Edit` / `Workers:Write` scope on the
   account/zone used by `mindshift-demo`.
3. For each such token, record:
   - Scope (account/zone restrictions, permission groups).
   - Whether it is used anywhere outside the GitHub Actions environment
     identified in step 1 (e.g. on a developer workstation).
   - Last-used timestamp, if available.
4. Confirm the GitHub Environment used by `governed-deploy.yml`
   (`environment: production`, added by #1989) has required reviewers
   configured in **Settings > Environments > production**.
5. Fill out `evidence-record.template.json` as
   `RB-002_<verification_date>.json` summarizing the above, with
   `evidence_reference` pointing at exported token-scope listings (with
   token values redacted).
6. Submit the evidence record for governance review. Only after review
   should `RESIDUAL_BYPASS_MATRIX.json` RB-002 and
   `CLOUDFLARE_AUTHORITY_CLASSIFICATION.json` CF-002/CF-004 be updated, and
   only to `DOWNGRADED` unless every Cloudflare credential capable of
   `Workers:Write` on `mindshift-demo` is proven to be exclusively bound to
   the `production` GitHub Environment.

## What "closed" requires

Per `RESIDUAL_BYPASS_MATRIX.json`, RB-001 and RB-002 are root-authority
surfaces. Repository-side controls (the `production` environment gate, the
governed-deploy wrapper, the canonical legitimacy chain) bound the *governed
path*, but cannot prove the absence of an out-of-band Cloudflare credential
or Git Integration connection. Both bypasses therefore remain `OPEN` (or
`BREAK_GLASS` for RB-002) until an evidence record demonstrating otherwise is
reviewed and accepted, and the corresponding governance JSON files are
updated as a separate, explicit action.
