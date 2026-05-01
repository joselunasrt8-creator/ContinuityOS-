# mindshift-demo

Cloudflare Worker runtime backed by D1.

## Commands

### 1) Apply schema
```bash
npx wrangler d1 execute mindshift-demo-prod --remote --file schema.sql
```

### 2) Apply D1 migrations (governed deploy prerequisite)
```bash
npx wrangler d1 migrations apply mindshift-demo-prod --remote
```

### 3) Deploy
```bash
npx wrangler deploy
```

### 4) Test deterministic replay behavior
```bash
curl -s https://mindshift-demo.joselunasrt8.workers.dev/replay-test
```

Expected replay safety fields in the JSON response:

```json
{
  "first_attempt": "EXECUTED",
  "authority_status_after_first": "CONSUMED",
  "replay_attempt": "BLOCKED",
  "system_result": "NON_REPLAYABLE_EXECUTION_CONFIRMED"
}
```

## Production deploys are governed by MindShift

Production deployment is locked behind `.github/workflows/governed-deploy.yml` and can only be started by a Worker-originated `repository_dispatch` event (`mindshift-governed-production-deploy`). Direct manual and push-based production deploy entrypoints are removed.

Governed sequence (fail-closed):
1. `POST /authority`
2. `POST /compile`
3. `POST /validate`
4. If validation is not `VALID`, deployment stops (fail closed).
5. `POST /execute` (requires exact hash match and consumes authority)
6. `POST /proof` (required before success)
7. Worker triggers `repository_dispatch` to GitHub only after `/execute` succeeds

Proof records include:
- `run_id`
- `commit_sha`
- `workflow`
- `environment`

### Existing deploy workflows and production bypass status

- `transfer.yml`: still available for legacy/non-production flow, but now explicitly blocks production and directs users to `governed-deploy.yml`.
- `mindshift-demo.yml`, `transfer-v2-frozen.yml`, `transfer-v3.yml`, and `governed-dispatch-target.yml`: repository dispatch based examples for governed or test transfer surfaces; not the production entrypoint.

### Remaining bypass risks

- A repository admin could still manually edit workflow files on a branch and merge policy changes.
- A repository admin could still create a new workflow that deploys directly.
- Secret misuse (ex: compromised `MINDSHIFT_WORKER_URL`, `MINDSHIFT_API_KEY`, or GitHub token) could bypass intent.

Mitigations should include branch protection, required reviews/CODEOWNERS for `.github/workflows/**`, restricted environment approvals, and least-privilege secret scope.


### Worker call sequence example (fetch)

```js
const base = env.MINDSHIFT_WORKER_URL;
const headers = { "content-type": "application/json", "x-api-key": env.MINDSHIFT_API_KEY };

const authority = await fetch(`${base}/authority`, {
  method: "POST",
  headers,
  body: JSON.stringify({ decision_id, aeo })
}).then(r => r.json());

const compiled = await fetch(`${base}/compile`, {
  method: "POST",
  headers,
  body: JSON.stringify({ authority_id: authority.authority_id })
}).then(r => r.json());

const validated = await fetch(`${base}/validate`, {
  method: "POST",
  headers,
  body: JSON.stringify({ compilation_id: compiled.compilation_id })
}).then(r => r.json());
if (validated.status !== "VALID" || validated.result !== "VALID") throw new Error("No VALID AEO");

const executed = await fetch(`${base}/execute`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    authority_id: authority.authority_id,
    decision_id: validated.decision_id,
    intent: validated.intent,
    validated_object_hash: validated.validated_object_hash
  })
}).then(r => r.json());
if (executed.executed_object_hash !== validated.validated_object_hash) throw new Error("hash mismatch");
if (executed.authority_state !== "CONSUMED") throw new Error("authority replay risk");

// After execute succeeds, Worker dispatches GitHub deployment job:
await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${githubToken}`,
    accept: "application/vnd.github+json"
  },
  body: JSON.stringify({ event_type: "mindshift-governed-production-deploy" })
});

await fetch(`${base}/proof`, {
  method: "POST",
  headers,
  body: JSON.stringify({ execution_id: executed.execution_id, run_id, commit_sha, environment: "production" })
});
```

Store these values in your boundary runtime persistence (D1):
- `authority` in authority registry table (state transitions `ACTIVE -> CONSUMED`).
- `validated_object_hash` and `executed_object_hash` in execution/transfer records, enforcing equality.
- `proof` record keyed by `execution_id` + GitHub `run_id` + `commit_sha` + `environment`.
# trigger
