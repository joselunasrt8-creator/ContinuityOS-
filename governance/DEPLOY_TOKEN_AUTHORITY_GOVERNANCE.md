# Deploy-Capable Token Authority Governance (Issue #909)

This document inventories and classifies deploy-capable token and credential authority surfaces.

**Invariant:** deploy-capable token must not become implicit deployment authority.

## Scope and evidence basis

Classification is derived from repository-visible configuration and governance artifacts only:

- `.github/workflows/governed-deploy.yml`
- `.github/workflows/prepare-governed-deploy.yml`
- `scripts/governed-deploy.ts`
- `package.json`
- `wrangler.toml`
- `governance/root_authority_registry.json`

No external credential APIs were queried. Secret values are not exposed.

---

## 1) Token inventory

Canonical machine-readable inventory:

- `governance/runtime/DEPLOY_CAPABLE_TOKEN_AUTHORITY_INVENTORY.json`

Summary classes:

1. **Direct deploy-capable credential classes**
   - Cloudflare deploy token class (`CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` equivalent)
   - Local Wrangler authenticated session
   - GitHub/Cloudflare root settings authority that can alter deploy credentials

2. **Deploy-enabling runtime credential class**
   - `secrets.MINDSHIFT_API_KEY` (drives canonical runtime mutation chain and gates wrapper invocation)

3. **Non-deploy direct credential classes (but governance-relevant)**
   - `secrets.MINDSHIFT_WORKER_URL` (target routing)
   - Actions `GITHUB_TOKEN` (`contents:read`, `actions:read` in deploy workflows)

---

## 2) Deploy-authority lineage map

### Path A — Canonical governed production deploy

`workflow_dispatch(governed-deploy.yml)`
→ `secrets.MINDSHIFT_API_KEY` + `secrets.MINDSHIFT_WORKER_URL`
→ `/session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof`
→ `governed-deploy-artifact.json`
→ `scripts/governed-deploy.ts`
→ `npx wrangler deploy src/index.ts --config wrangler.toml`
→ production code mutation.

**Legitimacy binding:** validator/proof coupled in-workflow before deploy command execution.

### Path B — Prepare workflow (deploy-enabling materialization)

`workflow_dispatch(prepare-governed-deploy.yml)`
→ `secrets.MINDSHIFT_API_KEY` + `secrets.MINDSHIFT_WORKER_URL`
→ `/session -> /continuity -> /authority -> /compile`
→ emits `decision_id`, `validated_object_hash`, `invocation_nonce`
→ operator can replay manual promotion attempts into governed deploy with fresh tuples.

**Legitimacy binding:** authority-bound but not validator/proof complete within this workflow.

### Path C — Direct Cloudflare deploy outside workflow governance

Cloudflare deploy token or local Wrangler auth
→ direct `wrangler deploy`
→ production code mutation.

**Legitimacy binding:** independent of runtime `/authority -> /compile -> /validate -> /execute -> /proof` unless voluntarily wrapped.

---

## 3) Privilege classification

| Surface | Deploy-capable | Portable authority | Scope known | Environment scoped | Branch scoped | Approval gated |
|---|---:|---:|---:|---:|---:|---:|
| MINDSHIFT_API_KEY | Yes (deploy-enabling) | Yes | No | UNKNOWN | Yes (workflow binds branch context) | UNKNOWN |
| MINDSHIFT_WORKER_URL | No (indirect) | No | No | UNKNOWN | Yes (workflow context) | UNKNOWN |
| Cloudflare API token class | Yes | Yes | No | UNKNOWN | No | UNKNOWN |
| Wrangler local auth session | Yes | Yes | No | No | No | No |
| GITHUB_TOKEN in deploy workflows | No | No | Yes (read-only in YAML) | Yes | Yes | UNKNOWN |
| Repo/admin secret-write authority | Yes (indirect root) | Yes | No | UNKNOWN | No | UNKNOWN |

---

## 4) Replay-risk assessment

- **Token reuse:** Cloudflare deploy token classes and local Wrangler auth remain replayable outside canonical runtime validation (`OPEN`, high risk).
- **Workflow rerun/job rerun/failed-job rerun:** `governed-deploy.yml` includes nonce and replay assertions (`/validate` + replay probe via second `/execute`), reducing same-tuple replay; fresh tuple reruns still mutate deploy (`PARTIAL`).
- **Local replay:** local authenticated Wrangler authority can reissue deploy commands independent of runtime legitimacy.
- **Copied secret reuse:** repository evidence cannot prove secret exfiltration controls; classify as `OPEN`.
- **GitHub token reuse:** in-repo declared `GITHUB_TOKEN` permissions are read-only; not deploy-capable by shown config.

---

## 5) Validator coupling analysis

- `governed-deploy.yml`: **validator-bound** (explicit `/validate`, strict canonical checks, hash and nonce matching before deploy invocation).
- `prepare-governed-deploy.yml`: **not validator-bound** (stops at compile and nonce generation).
- Direct Cloudflare token/Wrangler local usage: **not validator-bound**.

---

## 6) Proof coupling analysis

- `governed-deploy.yml`: **proof-bound** (explicit `/proof`, artifact upload, governed deploy artifact generation).
- `prepare-governed-deploy.yml`: **not proof-bound**.
- Direct Cloudflare token/Wrangler local usage: **not proof-bound** unless operator adds out-of-band evidence.

---

## 7) Observability coverage analysis

- High observability in governed deploy path (artifacts for session/continuity/authority/compile/validate/execute/replay/proof + deploy artifact).
- Partial observability in prepare path (no validate/execute/proof/deploy execution artifact).
- Low/none for local direct Wrangler deploy authority from repository perspective.
- External root-authority actions (Cloudflare account settings, GitHub repo/environment secret administration) are only partially observable from this repo.

---

## 8) Revocation capability analysis

- GitHub-hosted secrets are revocable via secret update/removal (exact policy controls external).
- Cloudflare API tokens are generally revocable at Cloudflare account layer (not verifiable from repo).
- Local Wrangler session authority revocable via logout/token revocation but not enforced by repo controls.
- Root admin authority revocation depends on org/repo account governance outside tracked files.

---

## 9) Authority-gap analysis

OPEN gaps:

1. **Direct deploy credential class exists outside canonical legitimacy runtime**
   - Cloudflare token/local Wrangler auth can deploy without mandatory `/authority -> ... -> /proof` coupling.

2. **Environment-level gating unverifiable**
   - Repo files do not prove branch restrictions, environment reviewers, or manual approval controls.

3. **Prepare-to-deploy linkage is procedural, not cryptographically pinned at platform boundary**
   - `prepare-governed-deploy.yml` emits deploy material that can be repeatedly rematerialized.

4. **Root-authority surfaces remain external trust assumptions**
   - GitHub admin and Cloudflare admin powers remain documented OPEN dependencies.

---

## 10) Bounded closure proposal (documentation/control-plane only)

1. Maintain `governed-deploy.yml` as the only documented production deploy workflow path; keep direct convenience deploy blocked in package scripts.
2. Add explicit governance policy requiring environment protection and dual-control approval for manual `workflow_dispatch` on deploy workflows (settings-level, additive, no workflow deletion).
3. Require immutable run-link evidence: prepare run id → governed deploy run id in governance records.
4. Add periodic governance audit check for deploy-capable credential references and workflow permission drift.
5. Keep Cloudflare/account and local Wrangler authority classified `OPEN` until externally enforced constraints are evidenced.

These actions are bounded and non-disruptive: no secret rotation, no workflow deletion, no runtime semantic mutation, and no deployment interruption.
