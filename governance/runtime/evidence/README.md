# Cloudflare Deploy Authority Evidence (Issue #1989)

This directory holds dated, repo-visible evidence records for the
operator-only verification steps identified by the Cloudflare Deploy
Bypass Closure Audit (RB-001, RB-002 in
`governance/runtime/RESIDUAL_BYPASS_MATRIX.json`).

## Purpose

`RESIDUAL_BYPASS_MATRIX.json` and
`governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json` classify two
bypass surfaces (RB-001 Cloudflare Git Integration, RB-002 direct
`wrangler deploy` with a Cloudflare credential) as requiring
account-level/operator-level action that cannot be performed or verified
from repository code alone.

This directory exists so that, **when** an operator performs and verifies
that account-level action, the evidence can be recorded here in a
structured, dated, and reviewable form — instead of a closure claim being
made from comments alone.

**No record may be added to this directory that has not been independently
performed and verified by the operator named in that record.** A missing
record means the corresponding bypass remains classified `OPEN` /
`BREAK_GLASS` per `RESIDUAL_BYPASS_MATRIX.json`.

## Evidence record format

Each evidence record is a JSON file named
`<bypass_id>_<YYYY-MM-DD>.json` (e.g. `RB-001_2026-07-01.json`), using
`evidence-record.template.json` as the schema. Required fields:

| Field | Description |
|---|---|
| `bypass_id` | The `RESIDUAL_BYPASS_MATRIX.json` entry this evidence closes or downgrades (e.g. `RB-001`, `RB-002`). |
| `verification_date` | ISO 8601 date the verification was performed. |
| `verifier` | Name/identity of the person who performed the verification. |
| `source` | Where the evidence comes from (e.g. "Cloudflare dashboard: Workers & Pages > mindshift-demo > Settings > Build & deployments"). |
| `evidence_description` | What was observed (e.g. "Git Integration shows status: Disconnected"). |
| `evidence_reference` | A hash, file path, or link to the underlying artifact (screenshot, exported JSON, audit log excerpt) supporting the claim. Store the artifact alongside this record if it can be safely committed; otherwise reference its hash and external location. |
| `resulting_classification` | The proposed new classification for the bypass (e.g. `DOWNGRADED`, `CLOSED`). This is a proposal — `RESIDUAL_BYPASS_MATRIX.json` must be updated separately and reviewed before the classification is considered changed. |

## What this directory does NOT do

- It does not itself change the classification of RB-001 or RB-002.
- It does not implement Cloudflare OIDC or any new authentication mechanism.
- It does not assert that any bypass is closed — only that evidence has been
  recorded for review.

Updating `RESIDUAL_BYPASS_MATRIX.json` and
`CLOUDFLARE_AUTHORITY_CLASSIFICATION.json` based on a record in this
directory is a separate, explicit governance action.
