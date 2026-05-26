# Stage 1 Locked Surface Plan: Governed CI/CD v1

**Artifact Type:** Stage 1 Locked Surface Plan: Governed CI/CD v1  
**Status:** NON_OPERATIVE PLANNING ARTIFACT  
**Issue:** #1426  
**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** `claude/stage1-governed-cicd-plan-TqKF3`  
**Date:** 2026-05-26

---

## Context

MindShift is an execution legitimacy infrastructure for AI-assisted systems. Its canonical invariant is: **if no valid object exists → nothing happens**. Runtime primitives exist (endpoints at /session, /continuity, /authority, /compile, /validate, /execute, /proof; the governed-deploy.yml workflow; replay protection; proof persistence). What does not yet exist is a formally ratified, spec-locked plan that anchors Stage 1: the first surface where a workflow _cannot_ mutate without legitimacy. This artifact produces that plan.

The `GOVERNANCE_REQUIREMENTS.json` file already names `github_governed_deploy_workflow` as `surface_locked_first`. This plan formalizes the interface, object shapes, authority requirements, proof format, replay model, bypass rules, conformance checks, and implementation slice ordering for that surface.

---

## 1. Executive Determination

**Selected surface:** `github_governed_deploy_workflow`  
**Path:** `.github/workflows/governed-deploy.yml`  
**Surface ID (canonical):** `github_governed_deploy_workflow` (as declared in `EXECUTION_SURFACES.json`)

**Why this surface:**
- It is the only path that calls `wrangler deploy` (the production mutation command). `npm run deploy` is already hard-disabled.
- It is the highest-risk surface (P3) in the execution surface inventory.
- Existing runtime endpoints (/validate, /execute, /proof) already enforce exact-object discipline — wiring them to a locked workflow completes the boundary.
- `GOVERNANCE_REQUIREMENTS.json` already designates it as the first locked surface.

**What it proves:**
- That a Cloudflare Worker production deployment cannot occur without: a valid decision_id, an exact AEO hash, an unused invocation_nonce, an ACTIVE authority object, and a persisted proof.
- That the validated object equals the executed object (no post-validation mutation).
- That every deployment leaves an immutable proof artifact bound to session, continuity, execution, and commit lineage.

**What it does NOT prove:**
- That authority creation is governed (prepare-governed-deploy.yml is execution-adjacent, not yet fully locked).
- That branch protection rules are machine-enforced (OPEN — requires GitHub repo settings, not code).
- That the Cloudflare API token cannot be used directly outside the workflow (OPEN — requires Cloudflare account-level controls).
- That all other P2/P3 surfaces (D1 migrations, release workflow) are governed (future stages).

---

## 2. Locked Surface Definition

**Mutation-capable surface:** `wrangler deploy` (Cloudflare Worker production deployment)

**Boundary placement:**  
The execution boundary sits between the `Assert validate response is canonical` step and the `wrangler deploy` step inside `governed-deploy.yml`. Deploy is only reached when all prior steps succeed: session → continuity → authority → compile → validate → execute → replay_check → proof. If any step returns NULL, the workflow exits non-zero and deploy is unreachable.

**Deploy command class:** `npx wrangler deploy` (Cloudflare Worker deployment)

**Required validation point:**  
`/validate` must return `status=VALID` with matching `validated_object_hash` and `invocation_nonce` before `/execute` is called. `/execute` must return `execution_id`. `/proof` must return `status=PROVEN` with matching `proof_id` before the workflow completes. Deploy occurs between `/execute` and `/proof` — proof is written _after_ deploy to confirm completion.

**Forbidden bypass paths (classified):**

| Bypass | Classification | Required Response |
|--------|---------------|-------------------|
| `npm run deploy` direct | hard-disabled in package.json | Immediate exit 1 |
| `npx wrangler deploy` outside workflow | token-level bypass | `NULL → ROOT_AUTHORITY_CONTAINMENT_REQUIRED` (OPEN) |
| `wrangler deploy --dry-run` only | not a bypass (no mutation) | Permitted for testing |
| Calling `/execute` directly without prior `/validate` | no validation row | `NULL/no_validation` |
| Re-running same workflow invocation_nonce | replay_detected | `NULL/replay_detected` |
| Calling workflow via `workflow_run` or API schedule | not `workflow_dispatch` | `NULL — Only explicit invocation allowed` |
| Indirect dispatch through another workflow | caller ref mismatch | `NULL — Workflow dispatch must enter through governed-deploy.yml` |

---

## 3. Minimal Governed Workflow Model

```
developer / operator
  │
  ▼
workflow_dispatch (explicit manual trigger only)
  │  inputs: decision_id, validated_object_hash, invocation_nonce
  │
  ▼
HARD FAIL guard
  │  check: event=workflow_dispatch, no missing inputs/secrets,
  │         caller_workflow_ref matches governed-deploy.yml,
  │         DEPLOY_ENVIRONMENT=production, DEPLOY_INTENT=deploy_production
  │
  ▼
ATAO construction (implicit in workflow identity)
  │  identity_id = github_actions:{repo}:{run_id}:{run_attempt}:{sha}:{replay_id}
  │  replay_id   = SHA-256(repo|workflow|run_id|run_attempt|sha|ref|decision_id|voh|nonce)
  │
  ▼
/session  →  SESSION_ACTIVE + session_id
  │
  ▼
/continuity  →  CONTINUITY_ACTIVE + continuity_id + continuity_hash
  │  binds: session_id, decision_id, repo, branch, workflow, scope
  │
  ▼
/authority  →  ACTIVE authority for decision_id
  │  (authority must pre-exist or be created in prepare-governed-deploy)
  │
  ▼
/compile  →  canonical_aeo_hash (validated_object_hash)
  │  deterministic canonicalization of the AEO candidate
  │
  ▼
/validate  →  status=VALID + invocation_nonce (now RESERVED in authority state machine)
  │  checks: active authority, exact hash match, unused nonce, session continuity
  │
  ▼
EXECUTION BOUNDARY ───────────────────────────────────────────────────
  │
  ▼
/execute  →  execution_id  (authority → EXECUTED, nonce consumed in invocation_registry)
  │  checks: VALID validation row, exact hash, nonce unique constraint
  │
  ▼
wrangler deploy (production mutation)
  │  DEPLOY_COMMAND: npx wrangler deploy
  │
  ▼
replay test  →  must return NULL/replay_detected or NULL/authority_not_reserved
  │  second /execute call with same nonce must fail
  │
  ▼
/proof  →  status=PROVEN + proof_id  (authority → CONSUMED)
  │  binds: session_id, continuity_id, execution_id, decision_id, validated_object_hash,
  │         invocation_nonce, surface, run_id, commit_sha, workflow, environment
  │
  ▼
governed-deploy-artifact.json  (evidence chain, uploaded as workflow artifact)
  │  contains: all intermediate responses + proof
  │
  ▼
audit registry / proof_registry (D1)
  │
  ▼
telemetry (legitimacy-telemetry.ts — read-only, non-authoritative)
```

---

## 4. Required Object Shapes

All objects below are **non-operative example fixtures**. They do not represent live state.

### 4a. Authority / Decision Artifact

```json
{
  "decision_id": "dec-cicd-v1-stage1-example-00000000",
  "intent": "deploy_production_worker",
  "scope": {
    "environment": "production",
    "repo": "joselunasrt8-creator/mindshift-demo",
    "branch": "main"
  },
  "target": {
    "system": "cloudflare_worker",
    "action": "wrangler_deploy"
  },
  "finality": {
    "proof_required": true,
    "proof_type": "governed_deploy_proof",
    "registry_required": true
  },
  "approved_by": "PLANNING_REQUIRED",
  "status": "ACTIVE",
  "constraints": {
    "repo": "joselunasrt8-creator/mindshift-demo",
    "branch": "main",
    "workflow": "governed-deploy.yml",
    "max_executions": 1
  },
  "expires_at": "PLANNING_REQUIRED",
  "timestamp": "PLANNING_REQUIRED"
}
```

### 4b. ATAO (Authority Transition Audit Object)

Schema source: `schemas/atao.schema.json`

```json
{
  "atao_id": "atao-example-cicd-v1-00000000",
  "agent_id": "github_actions:joselunasrt8-creator/mindshift-demo",
  "session_id": "BOUND_AT_RUNTIME",
  "intent": "deploy_production_worker",
  "proposed_action": {
    "system": "cloudflare_worker",
    "action": "wrangler_deploy",
    "parameters": {
      "environment": "production",
      "deploy_command": "npx wrangler deploy",
      "repo": "joselunasrt8-creator/mindshift-demo",
      "branch": "main"
    }
  },
  "scope": {
    "environment": "production",
    "repo": "joselunasrt8-creator/mindshift-demo",
    "branch": "main",
    "workflow": "governed-deploy.yml"
  },
  "risk_class": "P3",
  "timestamp": "BOUND_AT_RUNTIME"
}
```

The ATAO is constructed implicitly in the current workflow via the `identity_id` composition (`governed-deploy.yml` line 104). Stage 1 locks this implicit construction; a future slice may make it an explicit serialized object.

### 4c. AEO (Authorized Execution Object)

Schema source: `schemas/aeo.schema.json`  
**Constraint: exactly the five required fields — intent, scope, validation, target, finality. No extras.**

```json
{
  "intent": "deploy_production_worker",
  "scope": {
    "environment": "production",
    "repo": "joselunasrt8-creator/mindshift-demo",
    "branch": "main",
    "workflow": "governed-deploy.yml"
  },
  "validation": {
    "decision_id": "dec-cicd-v1-stage1-example-00000000",
    "authority_id": "BOUND_AT_RUNTIME",
    "require_active_authority": true,
    "require_exact_object_hash": true,
    "require_session_continuity": true
  },
  "target": {
    "system": "cloudflare_worker",
    "action": "wrangler_deploy"
  },
  "finality": {
    "proof_required": true,
    "proof_type": "governed_deploy_proof",
    "registry_required": true
  }
}
```

**Note:** The existing `aeo.json` at the repo root does NOT conform to this schema — it uses flat string values and includes `expires_at`. It must be replaced by a schema-conformant fixture in the object fixtures slice (Slice B).

### 4d. Validation Result

```json
{
  "status": "VALID",
  "result": "VALID",
  "decision_id": "dec-cicd-v1-stage1-example-00000000",
  "validated_object_hash": "<sha256-of-canonical-aeo>",
  "invocation_nonce": "<uuid-single-use>",
  "session_id": "BOUND_AT_RUNTIME",
  "continuity_id": "BOUND_AT_RUNTIME",
  "timestamp": "BOUND_AT_RUNTIME"
}
```

NULL example:

```json
{
  "status": "NULL",
  "result": "INVALID",
  "reason": "hash_mismatch",
  "decision_id": "dec-cicd-v1-stage1-example-00000000"
}
```

### 4e. Proof Artifact

Schema source: `schemas/proof.schema.json`

```json
{
  "proof_id": "proof-example-00000000",
  "execution_id": "BOUND_AT_RUNTIME",
  "decision_id": "dec-cicd-v1-stage1-example-00000000",
  "authority_id": "BOUND_AT_RUNTIME",
  "aeo_hash": "<sha256-of-canonical-aeo — must equal validated_object_hash>",
  "target_system": "cloudflare_worker",
  "target_action": "wrangler_deploy",
  "result": "success",
  "timestamp": "BOUND_AT_RUNTIME",
  "proof_reference": {
    "run_id": "BOUND_AT_RUNTIME",
    "commit_sha": "BOUND_AT_RUNTIME",
    "workflow": "governed-deploy.yml",
    "environment": "production",
    "repo": "joselunasrt8-creator/mindshift-demo",
    "branch": "BOUND_AT_RUNTIME"
  },
  "continuity_id": "BOUND_AT_RUNTIME",
  "continuity_hash": "<sha256-hex — 64 chars>",
  "identity_id": "github_actions:joselunasrt8-creator/mindshift-demo:<run_id>:...",
  "session_id": "BOUND_AT_RUNTIME",
  "authority_lineage": {
    "decision_id": "dec-cicd-v1-stage1-example-00000000",
    "continuity_id": "BOUND_AT_RUNTIME",
    "session_id": "BOUND_AT_RUNTIME"
  },
  "execution_lineage": {
    "execution_id": "BOUND_AT_RUNTIME",
    "validated_object_hash": "<sha256-of-canonical-aeo>",
    "invocation_nonce": "<uuid-single-use>",
    "workflow_run_id": "BOUND_AT_RUNTIME",
    "workflow_sha": "BOUND_AT_RUNTIME"
  }
}
```

### 4f. Replay Record

```json
{
  "replay_id": "<sha256 of repo|workflow|run_id|run_attempt|sha|ref|decision_id|voh|nonce>",
  "decision_id": "dec-cicd-v1-stage1-example-00000000",
  "validated_object_hash": "<sha256-of-canonical-aeo>",
  "invocation_nonce": "<uuid-single-use>",
  "workflow_run_id": "BOUND_AT_RUNTIME",
  "workflow_run_attempt": "BOUND_AT_RUNTIME",
  "workflow_sha": "BOUND_AT_RUNTIME",
  "status": "CONSUMED",
  "replay_neutral": true,
  "append_only": true,
  "timestamp": "BOUND_AT_RUNTIME"
}
```

---

## 5. GitHub Action Interface

**Workflow file:** `.github/workflows/governed-deploy.yml`

### Inputs (workflow_dispatch only)

| Input | Required | Description |
|-------|----------|-------------|
| `decision_id` | true | Canonical decision identifier bound to the authority object |
| `validated_object_hash` | true | SHA-256 of the canonicalized AEO — produced by /compile in prepare step |
| `invocation_nonce` | true | Single-use UUID issued by /validate during preparation |

### Secrets

| Secret | Description |
|--------|-------------|
| `MINDSHIFT_WORKER_URL` | Base URL of the deployed MindShift Worker (legitimacy validator endpoint) |
| `MINDSHIFT_API_KEY` | API key for the Worker runtime |
| `CLOUDFLARE_API_TOKEN` | Token scoped to Workers deploy for this repo only (OPEN — token scope policy not yet enforced) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID bound to wrangler.toml |

Live credentials are not included in this artifact. Secret names above are planning references only.

### Derived environment bindings (computed inside workflow)

| Variable | Value | Source |
|----------|-------|--------|
| `DEPLOY_ENVIRONMENT` | `production` | Hardcoded |
| `DEPLOY_INTENT` | `deploy_production` | Hardcoded |
| `DEPLOY_REPO` | `${{ github.repository }}` | GitHub context |
| `DEPLOY_BRANCH` | `${{ github.ref_name }}` | GitHub context |
| `DEPLOY_WORKFLOW` | `governed-deploy.yml` | Hardcoded |
| `REPLAY_ID` | SHA-256 composite of lineage fields | Computed in guard step |
| `LINEAGE_BINDING_ID` | SHA-256 of decision+hash+nonce+sha+ref | Computed in guard step |

### Validator invocation path

The validator is the MindShift Worker itself, accessed via HTTP at `$MINDSHIFT_WORKER_URL`. There is no separate local validator binary or sidecar. Endpoints called in order: `/session`, `/continuity`, `/authority` (read), `/compile`, `/validate`, `/execute`, `/proof`.

- **`authority_ref`:** The `decision_id` input serves as the authority reference.
- **`expected_branch`:** Verified by `DEPLOY_BRANCH == WORKFLOW_REF_NAME` (workflow guard step, lines 82–85) and by the continuity constraint `branch` field.
- **`expected_repo`:** Bound in continuity constraints as `repo: $DEPLOY_REPO`.
- **`target_environment`:** `production` (hardcoded).
- **`deploy_command`:** `npx wrangler deploy` (single command, not configurable per invocation).
- **`proof_required`:** Always true — workflow fails if `/proof` does not return `status=PROVEN`.
- **`nonce / replay key`:** `invocation_nonce` passed as workflow input; `REPLAY_ID` is the composite workflow-level replay key.

---

## 6. VALID Path

A deployment succeeds if and only if all of the following hold simultaneously:

1. **Active authority:** Authority for `decision_id` exists in `authority_registry` with `status=ACTIVE` and `expires_at` in the future.
2. **Exact object hash match:** `validated_object_hash` input equals the SHA-256 produced by `/compile` for the AEO candidate bound to `decision_id`.
3. **Branch match:** `github.ref_name` equals the `branch` constraint on the authority/continuity.
4. **Repo match:** `github.repository` equals the `repo` constraint on the authority/continuity.
5. **Scope match:** `environment=production`, `workflow=governed-deploy.yml`.
6. **Nonce unused:** `invocation_nonce` does not exist in `invocation_registry` for this `decision_id` + `validated_object_hash`.
7. **Policy valid:** Continuity is `CONTINUITY_ACTIVE`, not revoked or expired. Session is `SESSION_ACTIVE`.
8. **Proof requirement present:** AEO `finality.proof_required = true`, `finality.registry_required = true`.
9. **Deploy allowed only after VALID:** `/execute` called only after `/validate` returns `status=VALID`. `wrangler deploy` runs only after `/execute` returns `execution_id`. `/proof` called only after deploy exits 0.
10. **Proof persisted:** `/proof` returns `status=PROVEN` with matching `proof_id`. Authority transitions to `CONSUMED`.

**Outcome:** `governed-deploy-artifact.json` uploaded as workflow artifact; proof_registry row inserted; D1 execution surface confirmed locked.

---

## 7. NULL Paths

All NULL paths are deterministic. Each produces an explicit non-zero exit before deploy is reached (or blocks proof closure).

| NULL Case | Trigger | Observed Result |
|-----------|---------|-----------------|
| Missing authority | No authority row for `decision_id` | `/authority` returns non-200 or empty; `NULL — authority step failed` |
| Expired authority | `expires_at` in the past | `/authority` or `/validate` returns `NULL/authority_expired` |
| Revoked authority | `status=REVOKED` or parent continuity revoked | `/authority` returns `NULL/authority_revoked` |
| Wrong branch | `github.ref_name` != branch constraint | Guard step: `NULL — Branch/ref_name mismatch`; or `/validate` returns `NULL/scope_mismatch` |
| Wrong repo | `github.repository` != repo constraint | Continuity constraint check; `NULL/scope_mismatch` |
| Scope expansion | AEO scope contains fields outside authority scope | `/validate` returns `NULL/scope_expansion` |
| Hash mismatch | `validated_object_hash` input != `/compile` output | `/validate` returns `NULL/hash_mismatch` |
| Mutated AEO | AEO changed after `/compile` was run | `/compile` produces different hash; `/validate` returns `NULL/hash_mismatch` |
| Replayed nonce | `invocation_nonce` already in `invocation_registry` | `/execute` returns `NULL/replay_detected`; unique constraint blocks insert |
| Missing proof requirement | AEO has `proof_required=false` | Workflow guard (PLANNING_REQUIRED — add explicit guard step) or `/proof` fails |
| Direct deploy bypass | `npm run deploy` or direct `wrangler deploy` | package.json exits 1; token bypass is OPEN |
| Validator unavailable (fail-closed) | Worker unreachable or returns 5xx | curl returns non-2xx; workflow step fails; exit 1; deploy never reached |
| Not workflow_dispatch | Triggered by push, schedule, or workflow_run | Guard step: `NULL — Only explicit invocation allowed` |
| Indirect dispatch | Caller workflow ref does not match governed-deploy.yml | Guard step: `NULL — Workflow dispatch must enter through governed-deploy.yml` |
| Replay protection test fails | Second /execute returns unexpected result | `NULL — Replay protection failed` |
| Proof step fails | `/proof` returns status != PROVEN | Workflow fails; execution recorded but authority not CONSUMED; recovery path OPEN |

---

## 8. Proof Format

**Minimum proof artifact fields** (derived from `schemas/proof.schema.json`):

| Field | Description |
|-------|-------------|
| `proof_id` | Unique proof identifier (UUID) |
| `execution_id` | Execution row identifier from `/execute` |
| `run_id` | `github.run_id` — GitHub Actions run identifier |
| `commit_sha` | `github.sha` — exact commit deployed |
| `repo` | `github.repository` |
| `branch` | `github.ref_name` |
| `aeo_hash` | SHA-256 of the canonical AEO — must equal `validated_object_hash` |
| `decision_id` | Authority decision identifier |
| `target_environment` | `production` |
| `result` | `success` \| `failure` \| `blocked` |
| `timestamp` | ISO 8601 UTC |
| `proof_reference` | Nested object: run_id, commit_sha, workflow, environment, repo, branch |

Additional lineage fields required by `proof.schema.json`: `authority_id`, `continuity_id`, `continuity_hash`, `identity_id`, `session_id`, `authority_lineage`, `execution_lineage`, `target_system`, `target_action`.

**Clarifications:**

- **No proof → execution incomplete.** If `/proof` fails after `/execute`, the execution_registry row exists but authority stays in `EXECUTED` state (not `CONSUMED`). Recovery path is OPEN.
- **Proof visibility ≠ authority.** A proof record is append-only telemetry confirming execution occurred. Reading or uploading a proof does not create authority, extend expiry, or permit re-execution.
- **aeo_hash must equal validated_object_hash.** Any drift between compile output and proof content is a lineage violation.

---

## 9. Replay Safety Model

### Replay key construction

```
REPLAY_ID = SHA-256(
  github.repository
  | "governed-deploy.yml"
  | github.run_id
  | github.run_attempt
  | github.sha
  | github.ref
  | decision_id
  | validated_object_hash
  | invocation_nonce
)
```

This key is unique per workflow run × decision × object hash × nonce.

### Nonce lifecycle

```
ISSUED (by /validate in prepare step)
  → RESERVED  (authority state after /validate accepts)
  → CONSUMED  (invocation_registry unique row inserted at /execute)
  → [terminal — cannot be reused]
```

### Consumed state

The `invocation_registry` table enforces a UNIQUE constraint on `(decision_id, invocation_nonce, validated_object_hash)`. Any attempt to INSERT the same tuple fails at the database level, independent of application logic.

### Duplicate invocation handling

- Same `invocation_nonce` + same `decision_id` → `/execute` returns `NULL/replay_detected`.
- Same `REPLAY_ID` → `invocation_registry` UNIQUE constraint blocks insert.

### Retry semantics

- **Failed validation (before /execute):** Retry permitted with a new `invocation_nonce` from a new `/validate` call. The prior nonce was never consumed.
- **Failed deploy (after /execute, before /proof):** OPEN. Execution row exists; nonce consumed; re-deploy requires new decision or recovery authority.
- **Failed proof (after deploy):** OPEN. Proof write retry must carry same `execution_id`, `decision_id`, `validated_object_hash`; must not re-run deploy; blocked if proof already exists.

### Rule: consumed replay eligibility must not be restored

A consumed `invocation_nonce` cannot be re-activated through reconciliation, retry, or authority state reset. The `CONSUMED` state and the UNIQUE row in `invocation_registry` are terminal. No workflow step, migration, or reconciliation process may DELETE or UPDATE these rows.

---

## 10. No-Bypass Rules

| Rule | Mechanism | Status |
|------|-----------|--------|
| Direct deploy command disallowed | `package.json deploy` script exits 1 | ENFORCED (code-level) |
| `wrangler deploy` outside governed workflow | Cloudflare API token scoping | OPEN — not enforced at account level |
| Branch protection on `main` | GitHub repo settings: require PR + status checks | OPEN — CODEOWNERS present but NON_OPERATIVE |
| Deploy environment protection | GitHub environment `production` with reviewer requirements | OPEN — not confirmed enforced |
| Required status check | `constitutional-integrity` + `merge-governance-check` required before merge | OPEN — must be configured in branch protection |
| Direct `/execute` call bypassing workflow | Auth + missing VALID validation row | ENFORCED (runtime logic) |
| Indirect workflow dispatch | Caller ref must match `governed-deploy.yml` | ENFORCED (workflow guard step) |
| Push-triggered workflow | `event_name != workflow_dispatch` check | ENFORCED (workflow guard step) |
| Raw D1 migrations outside governed process | DENY classified in EXECUTION_SURFACES.json | AUDIT ONLY |
| `wrangler d1 migrations apply --remote` bypass | Documented in BYPASS_PATHS.json | OPEN |

**Audit-only vs enforced distinction:**
- **ENFORCED** — a code-level or runtime control actively blocks the bypass.
- **AUDIT ONLY** — bypass path is documented and classified but not machine-blocked.
- **OPEN** — control is required but not yet implemented or confirmed.

---

## 11. Conformance Checks

| Check ID | Test Description | Expected Result |
|----------|-----------------|-----------------|
| `CONF-CICD-01` | Valid workflow runs end-to-end: conformant AEO, active authority, unused nonce | Deploy succeeds; `proof_id` returned; `status=PROVEN` |
| `CONF-CICD-02` | Wrong branch in workflow trigger | Workflow exits NULL at guard step or `/validate` returns `NULL/scope_mismatch` |
| `CONF-CICD-03` | Wrong repo in authority/continuity constraints | `/continuity` or `/validate` returns `NULL/scope_mismatch` |
| `CONF-CICD-04` | Replay: same nonce invoked twice | Second `/execute` returns `NULL/replay_detected`; invocation_registry UNIQUE constraint |
| `CONF-CICD-05` | Mutated AEO: hash provided does not match compile output | `/validate` returns `NULL/hash_mismatch` |
| `CONF-CICD-06` | Missing proof requirement: AEO `finality.proof_required=false` | Workflow guard (PLANNING_REQUIRED) or `/proof` fails |
| `CONF-CICD-07` | Direct bypass: `npm run deploy` executed | Exits 1 immediately; wrangler never called |
| `CONF-CICD-08` | Proof artifact contains exact AEO hash | `proof.aeo_hash == validated_object_hash` in proof response |
| `CONF-CICD-09` | Expired authority | `/validate` returns `NULL/authority_expired` |
| `CONF-CICD-10` | Revoked authority | `/validate` returns `NULL/authority_revoked` |
| `CONF-CICD-11` | Non-workflow_dispatch trigger | Workflow guard exits NULL |
| `CONF-CICD-12` | Indirect dispatch via another workflow | Caller ref mismatch; workflow guard exits NULL |
| `CONF-CICD-13` | Missing decision_id input | Guard step: `NULL/missing_variable` |
| `CONF-CICD-14` | Validator unavailable (Worker returns 5xx) | curl non-2xx; workflow step fails; no deploy |
| `CONF-CICD-15` | AEO with extra fields beyond required five | `/compile` behavior — PLANNING_REQUIRED |

---

## 12. Implementation Slice Ordering

| Slice | Label | Scope | Dependencies |
|-------|-------|-------|-------------|
| A | **Stage 1 plan artifact** | This document | None (current) |
| B | **Schema-conformant object fixtures** | Replace non-conformant `aeo.json`; add conformant decision and ATAO fixtures | Slice A |
| C | **GitHub Action template skeleton** | Annotate governed-deploy.yml; add explicit `proof_required=true` guard step | Slice B |
| D | **Local validator invocation adapter** | Mock Worker endpoints for conformance tests without live credentials | Slice C |
| E | **Replay key / nonce check conformance** | CONF-CICD-04, CONF-CICD-05 against local adapter | Slice D |
| F | **Proof artifact writer** | Verify proof.json contains all `proof.schema.json` fields; add assertion steps | Slice E |
| G | **Bypass audit detector** | CONF-CICD-07; check `npx wrangler deploy` never invoked outside governed step | Slice F |
| H | **Conformance test suite** | CONF-CICD-01 through CONF-CICD-15 in `conformance/` directory | Slices D–G |
| I | **Docs quickstart** | `docs/governed-cicd-quickstart.md` end-to-end trigger guide | Slice H |

---

## 13. External Adoption Path

1. **Copy workflow:** Copy `.github/workflows/governed-deploy.yml` to the target repo.
2. **Configure authority reference:** Set `decision_id` to a decision object in the target repo's authority registry.
3. **Configure validator path/endpoint:** Set `MINDSHIFT_WORKER_URL` secret to the target Worker URL.
4. **Configure deploy command:** Modify the deploy step to call the target repo's deploy command.
5. **Configure API key:** Set `MINDSHIFT_API_KEY` secret.
6. **Run conformance pack:** Execute conformance suite (Slice H) against the target Worker URL.
7. **Verify proof artifact:** Confirm `governed-deploy-artifact.json` is present and `proof.aeo_hash == validated_object_hash`.
8. **Register execution surface:** Add surface to `EXECUTION_SURFACES.json` with `state_changing_execution_surface`, `risk_class: P3`, `required_controls` list.
9. **Configure branch protection:** (OPEN) Enable required status checks and environment protection in GitHub settings.

---

## 14. Open Questions / NULL Conditions

| Item | Status | Notes |
|------|--------|-------|
| Cloudflare API token scope enforcement | OPEN | Cannot be enforced from repo code; requires Cloudflare account policy |
| GitHub branch protection enforcement | OPEN | Must be configured in repo settings by a human admin |
| GitHub `production` environment protection | OPEN | Requires GitHub environment configuration |
| Shared authority registry shape | OPEN | Multi-repo adoption path for authority objects unresolved |
| Proof registry persistence target | OPEN | D1 durability guarantees and backup policy unresolved |
| Recovery path for failed deploy (after /execute, before /proof) | OPEN | Failed deploy leaves execution_id without proof; no recovery mechanism defined |
| AEO extra-field rejection behavior in /compile | PLANNING_REQUIRED | Whether /compile rejects or strips extra fields needs specification |
| `proof_required=false` guard in workflow | PLANNING_REQUIRED | Explicit guard not currently present; must be added in Slice C |
| Hosted validator not available | OPEN | Conformance tests (Slices D/H) require local mock unless staging Worker available |
| Legacy `aeo.json` (non-conformant root fixture) | PLANNING_REQUIRED | Current file fails `aeo.schema.json` validation; replace in Slice B |

---

## 15. Final Closure Checklist (Issue #1426 Acceptance Criteria)

- [x] **One locked surface selected** — `github_governed_deploy_workflow` (governed-deploy.yml) named and justified
- [x] **Exact workflow interface specified** — Inputs, secrets, derived env vars, validator endpoint, deploy command documented in Section 5
- [x] **Required objects defined** — Authority/Decision, ATAO, AEO, Validation Result, Proof Artifact, Replay Record specified in Section 4 with schema references
- [x] **Proof format specified** — Minimum fields enumerated in Section 8; `schemas/proof.schema.json` referenced; `aeo_hash == validated_object_hash` invariant stated
- [x] **Replay/failure paths specified** — Replay key construction, nonce lifecycle, consumed state, duplicate handling, retry semantics, and all NULL cases specified in Sections 7 and 9
- [x] **Implementation slices ordered** — Nine bounded slices (A–I) with dependencies in Section 12
- [x] **No execution authority created** — This is a NON_OPERATIVE planning artifact. No code was modified beyond this document. No commits were made prior to this slice. No deployments occurred. No authority objects were created. No proof was generated.

---

*Status: NON_OPERATIVE PLANNING ARTIFACT*  
*This document describes intent, not execution. No runtime state changed.*
