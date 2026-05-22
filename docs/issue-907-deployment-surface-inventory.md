# Issue #907 — Deployment Surface Inventory and Bypass Classification

Date: 2026-05-22 (UTC)

## Scope

Enumerate and classify all Wrangler deployment-capable execution paths and determine whether deployment can occur outside:

Authority → AEO → Validator → Proof → Execution Boundary.

## 1) Deployment Surface Inventory

### Surface objects

```json
[
  {
    "surface_id": "surface_1",
    "surface_name": "github_governed_deploy_workflow_dispatch",
    "mutation_capable": true,
    "authority_bound": true,
    "validator_bound": true,
    "proof_bound": true,
    "replay_safe": true,
    "observable": true,
    "closure_status": "PARTIAL",
    "risk_level": "MEDIUM"
  },
  {
    "surface_id": "surface_2",
    "surface_name": "prepare_governed_deploy_input_workflow_dispatch",
    "mutation_capable": false,
    "authority_bound": true,
    "validator_bound": false,
    "proof_bound": false,
    "replay_safe": true,
    "observable": true,
    "closure_status": "CLOSED",
    "risk_level": "LOW"
  },
  {
    "surface_id": "surface_3",
    "surface_name": "wrangler_direct_deploy_cli",
    "mutation_capable": true,
    "authority_bound": false,
    "validator_bound": false,
    "proof_bound": false,
    "replay_safe": false,
    "observable": false,
    "closure_status": "OPEN",
    "risk_level": "CRITICAL"
  },
  {
    "surface_id": "surface_4",
    "surface_name": "npm_run_deploy_script",
    "mutation_capable": false,
    "authority_bound": false,
    "validator_bound": false,
    "proof_bound": false,
    "replay_safe": true,
    "observable": true,
    "closure_status": "CLOSED",
    "risk_level": "LOW"
  },
  {
    "surface_id": "surface_5",
    "surface_name": "npm_run_deploy_dry_run",
    "mutation_capable": false,
    "authority_bound": false,
    "validator_bound": false,
    "proof_bound": false,
    "replay_safe": true,
    "observable": true,
    "closure_status": "CLOSED",
    "risk_level": "LOW"
  },
  {
    "surface_id": "surface_6",
    "surface_name": "cloudflare_dashboard_manual_deploy",
    "mutation_capable": true,
    "authority_bound": false,
    "validator_bound": false,
    "proof_bound": false,
    "replay_safe": false,
    "observable": true,
    "closure_status": "OPEN",
    "risk_level": "CRITICAL"
  },
  {
    "surface_id": "surface_7",
    "surface_name": "cloudflare_git_integration_preview_deploy",
    "mutation_capable": true,
    "authority_bound": false,
    "validator_bound": false,
    "proof_bound": false,
    "replay_safe": false,
    "observable": true,
    "closure_status": "OPEN",
    "risk_level": "HIGH"
  },
  {
    "surface_id": "surface_8",
    "surface_name": "release_automation_deploy_path",
    "mutation_capable": false,
    "authority_bound": false,
    "validator_bound": false,
    "proof_bound": false,
    "replay_safe": true,
    "observable": true,
    "closure_status": "CLOSED",
    "risk_level": "LOW"
  }
]
```

## 2) Deploy-token Lineage Map

- GitHub workflow deploy path uses repository secrets `MINDSHIFT_WORKER_URL` and `MINDSHIFT_API_KEY` for runtime route calls, and relies on Cloudflare credentials present in Actions environment at deploy execution time (`npx wrangler deploy ...`).
- No explicit Cloudflare API token variable is declared in YAML, so Wrangler can still bind to inherited env credentials (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`) from environment or operator context.
- Local/manual deploy path lineage is external-root: developer machine auth (`wrangler login` OAuth or API token) → Cloudflare API → direct mutation.
- Dashboard deploy lineage is external-root: Cloudflare account role/session → dashboard mutation.

## 3) Workflow Trigger Map

- `governed-deploy.yml`: `workflow_dispatch` only; directly mutation-capable because it ends in deploy execution via governed wrapper.
- `prepare-governed-deploy.yml`: `workflow_dispatch` only; non-mutation preparatory path producing manual inputs.
- Other workflows in `.github/workflows` currently appear non-deploy and non-mutation for Cloudflare runtime.

## 4) Validator Coupling Analysis

- Governed deploy workflow explicitly calls `/validate` and hard-fails unless result is `VALID`; coupling exists and is enforced pre-deploy.
- External surfaces (CLI direct deploy, dashboard deploy, Git integration preview deploy) do not call `/validate`; validator coupling absent.
- `prepare-governed-deploy` does not execute deploy; it composes upstream authority and compile inputs only.

## 5) Proof Coupling Analysis

- Governed deploy workflow explicitly calls `/proof` and requires `PROVEN` before deploy wrapper execution.
- External surfaces (CLI/dashboard/preview integration) are not proof-coupled.
- Result: proof persistence is enforced only on canonical governed production workflow path.

## 6) Replay Semantics Analysis

- Governed deploy workflow performs explicit replay test by re-calling `/execute` with same tuple and asserting `NULL/INVALID` with replay reason.
- Deploy wrapper persists deploy audit entries and blocks duplicate success tuple collision (`decision_id`, `invocation_nonce`, `validated_object_hash`, `proof_id`).
- External deploy surfaces have no canonical nonce reservation or replay rejection, therefore replay semantics are OPEN.

## 7) Bypass-capable Path Summary

Bypass-capable mutation paths outside Authority → AEO → Validator → Proof → Execution Boundary:

1. Direct Wrangler CLI deploy from any credentialed operator context.
2. Cloudflare dashboard manual deploy.
3. Cloudflare Git integration preview deployments (documented observed evidence).

These paths are mutation-capable and legitimacy-unbound; per core invariant, each remains an OPEN mutation surface.

## 8) Bounded Closure Proposal

No broad hardening/removal proposed. Bounded closure actions only:

1. **Inventory lock-in:** keep this surface inventory as an append-only governance artifact and require updates on any deploy-surface change.
2. **Credential lineage evidence:** add explicit documentation of which GitHub Environment owns deploy credentials and whether scoped tokens are production-only.
3. **Workflow admission evidence:** preserve `workflow_dispatch`-only governed entry and explicitly deny additional deploy workflows unless mapped into this inventory.
4. **External-root declaration:** retain BREAK_GLASS classification for CLI/dashboard surfaces until account-level technical controls are evidenced.
5. **Preview surface decision:** explicitly document whether Cloudflare Git preview deploy is disabled or accepted as non-production OPEN surface.

This proposal preserves runtime semantics, validator semantics, proof semantics, and deploy capability, while tightening governance observability and explicit closure tracking.
