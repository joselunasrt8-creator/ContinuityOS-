# EXECUTION_SURFACE_CLASSIFICATION

Status: Non-Operative  
Issue: #243  
Branch: issue-243-execution-surface-classification  

## Verdict

CLASSIFICATION_INCOMPLETE_UNKNOWN_SURFACES_REMAIN

## P3_STATE_CHANGING_EXTERNAL

| Path | Surface | Boundary status | Bypass risk | Notes |
|---|---|---|---|---|
| `.github/workflows/governed-deploy.yml` | GitHub Actions production deploy | Canonical `/authority → /compile → /validate → /execute → /proof` path | Low, pending credential-boundary verification | Only observed deploy-capable workflow. |

## P1_EXECUTION_ADJACENT

| Path | Surface | Boundary status | Bypass risk | Notes |
|---|---|---|---|---|
| `.github/workflows/prepare-governed-deploy.yml` | GitHub Actions preparation workflow | Calls `/session`, `/authority`, `/compile`; does not deploy | Medium until manual handoff is constrained | Prepares inputs for `governed-deploy.yml`. |

## P2_STATE_CHANGING_INTERNAL

| Path | Surface | Boundary status | Bypass risk | Notes |
|---|---|---|---|---|
| `src/index.ts` | Cloudflare Worker runtime routes | Canonical runtime boundary | Medium pending exact-object execution proof | Contains runtime routes. |
| `migrations/*.sql` | D1 registry mutation | Migration-time state changes | Medium | Requires migration governance. |
| `schema.sql` | Base registry schema | Schema definition | Low | Defines registry structure. |

## LEGACY_DEMO_ONLY / QUARANTINE REQUIRED

| Path | Reason | Required action |
|---|---|---|
| `server.js` | Legacy runtime surface | Mark non-operative or remove |
| `gateway.js` | Legacy gateway surface | Mark non-operative or remove |
| `worker.js` | Legacy worker surface | Mark non-operative or remove |
| `registry.js` | Legacy registry surface | Tombstoned fail-closed; non-authoritative; canonical runtime spine only |
| `compile-decision.js` | Legacy compile script | Tombstoned fail-closed; cannot generate root runtime objects or signatures |
| `aeo.json` | Static demo object | Mark demo-only |
| `decision.json` | Static decision fixture | Fixture-only / non-authoritative; no runtime effect |
| `CURRENT_SYSTEM_SNAPSHOT.md` | Historical/demo snapshot | Mark historical non-operative |

## GOVERNANCE_ONLY

- `governance/**`
- `runtime/*.json`
- `docs/**`
- `.github/instructions/**`

## TEST_ONLY

- `tests/**`

## GENERATED / DEPENDENCY NOISE

- `package-lock.json`
- `worker-configuration.d.ts`
- `.wrangler/**`
- `node_modules/**`

## Current scan evidence

- `execution-surface-filetree.txt`
- `execution-surface-risk-scan.txt`
- `deploy-proof-surface-scan.txt`

## Open bypass risks

1. Credential boundary not yet verified.
2. Legacy runtime files not yet quarantined.
3. Exact-object re-derivation at `/execute` still requires dedicated proof.
4. `/proof` lineage rejection still requires dedicated proof.
5. Manual prepare-to-deploy handoff remains execution-adjacent.

## Required next tests

1. No workflow may contain direct `wrangler deploy`.
2. Only `governed-deploy.yml` may be deploy-capable.
3. `prepare-governed-deploy.yml` may not call `/execute` or `/proof`.
4. `/execute` must reject mutated post-validation object.
5. `/proof` must reject missing or mismatched execution lineage.

## Classification verdict

CLASSIFICATION_INCOMPLETE_UNKNOWN_SURFACES_REMAIN
