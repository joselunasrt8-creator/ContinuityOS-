# Workflow Dispatch Deployment Governance Inventory (Issue #908)

## Scope and invariants

This document inventories deployment-capable `workflow_dispatch` execution surfaces and classifies whether manual execution can create deployment mutation outside legitimacy binding.

**Invariant:** manual workflow dispatch must not become implicit deployment authority.

Out-of-scope: workflow deletion, CI/CD removal, branch-protection mutation, global runtime semantic changes.

## 1) Workflow inventory

Total workflows scanned: 6.

- `workflow_dispatch` workflows:
  - `.github/workflows/governed-deploy.yml` (deploy-capable)
  - `.github/workflows/prepare-governed-deploy.yml` (pre-deploy authority materialization)
- `pull_request` governance workflows:
  - `.github/workflows/constitutional-integrity.yml`
  - `.github/workflows/merge-governance-check.yml`
  - `.github/workflows/preo-candidate.yml`
  - `.github/workflows/sco-candidate.yml`

## 2) Deployment workflow topology

### Canonical deploy-capable path

`workflow_dispatch(governed-deploy)`
→ `/session`
→ `/continuity`
→ `/authority`
→ `/compile`
→ `/validate`
→ `/execute`
→ `/proof`
→ `scripts/governed-deploy.ts`
→ `wrangler deploy src/index.ts`

### Manual promotion prep path (indirect)

`workflow_dispatch(prepare-governed-deploy)`
→ `/session`
→ `/continuity`
→ `/authority`
→ `/compile`
→ emits manual inputs (`decision_id`, `validated_object_hash`, `invocation_nonce`) for `governed-deploy`.

## 3) Token lineage map

### governed-deploy.yml

- `secrets.MINDSHIFT_WORKER_URL` → `WORKER_URL` (runtime API endpoint)
- `secrets.MINDSHIFT_API_KEY` → `API_KEY` (authenticates state-changing runtime calls)
- GitHub token permissions are read-only (`contents: read`, `actions: read`)
- Deployment command is wrapped via `scripts/governed-deploy.ts` before `wrangler deploy`

### prepare-governed-deploy.yml

- `secrets.MINDSHIFT_WORKER_URL` → `WORKER_URL`
- `secrets.MINDSHIFT_API_KEY` → `API_KEY`
- Generates authority-bound material (`decision_id`, hash, nonce) and prints to run summary

## 4) Replay-risk analysis

### Repeated `workflow_dispatch`

- `governed-deploy.yml`: bounded by nonce + continuity/authority constraints (`max_executions: 1`) and wrapper registry checks.
- `prepare-governed-deploy.yml`: can be invoked repeatedly to mint additional candidate tuples for downstream manual promotion.

### `rerun-job` and `rerun-failed-job`

- `governed-deploy.yml`: expected fail-closed on reused authority/execution tuple, but remains deploy-capable with newly supplied valid tuple.
- `prepare-governed-deploy.yml`: reruns regenerate fresh inputs and can feed repeated manual deploy attempts.

### Release and redeploy reruns

- No `release` trigger-based deployment path identified.
- Redeploy is possible through repeated manual dispatch of governed deploy with fresh legitimacy inputs.

## 5) Bypass-capable route inventory

### Direct bypasses not observed

- No workflow directly runs raw `wrangler deploy` for production except through governed wrapper path in `governed-deploy.yml`.
- `package.json` direct deploy script intentionally blocks convenience direct deploy.

### Indirect high-risk governance surface

- `prepare-governed-deploy.yml` is not itself deploy-capable, but it is **deploy-enabling** because it mints and exposes material needed for manual production deploy dispatch.

## 6) Validator coupling analysis

- `governed-deploy.yml`: explicitly calls `/validate`; deploy gated on canonical response checks; considered validator-bound.
- `prepare-governed-deploy.yml`: does not call `/validate`; generates pre-deploy material without validator completion; not validator-bound.

## 7) Proof coupling analysis

- `governed-deploy.yml`: explicitly calls `/proof`, uploads proof artifact, and emits governed deploy artifact; considered proof-bound.
- `prepare-governed-deploy.yml`: no `/proof` stage; no append-only proof evidence for final deployment mutation; not proof-bound.

## 8) Observability coverage analysis

- `governed-deploy.yml`: high observability (JSON artifacts for every canonical stage plus governed artifact and wrapper audit registry semantics).
- `prepare-governed-deploy.yml`: partial observability (session/continuity/authority/compile artifacts and summary output) but no validate/execute/proof evidence.
- PR governance workflows are observability-oriented and non-deploying.

## 9) Bounded closure proposal (documentation/governance only)

1. Mark `prepare-governed-deploy.yml` as a **deploy-enabling authority materialization surface** in governance registries.
2. Require explicit human approval policy for production `workflow_dispatch` invocations at repository environment/ruleset layer (no workflow deletion; additive control).
3. Require documented dual-control runbook step between prepare and governed deploy invocation.
4. Require immutable linkage evidence between prepare run ID and governed-deploy run ID in governance records.
5. Add governance-level replay watchlist for repeated prepare invocations and prepare→deploy fan-out patterns.

These are bounded governance/documentation controls and do not alter runtime execution semantics.

## Classification summary

See canonical machine-readable inventory:

- `governance/runtime/WORKFLOW_DISPATCH_DEPLOYMENT_SURFACE_INVENTORY.json`

Primary open governance finding:

- `prepare-governed-deploy.yml` is replay-capable and deploy-enabling without validator/proof completion inside that same workflow boundary.
