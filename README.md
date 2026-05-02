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

Production deployment is governed by `.github/workflows/governed-deploy.yml` and is intended to be started by a Worker-originated `repository_dispatch` event (`mindshift-governed-production-deploy`). Manual dispatch remains allowed only on the governed deploy workflow (`workflow_dispatch` on `governed-deploy.yml`), while non-governed production deploy paths are forbidden.

Governed sequence (fail-closed):
1. `POST /authority`
2. `POST /compile`
3. `POST /validate`
4. If validation is not `VALID`, deployment stops (fail closed).
5. `POST /execute` (requires exact hash match, i.e. validated_object == executed_object, and consumes authority)
6. `POST /proof` (required before success)
7. Worker triggers `repository_dispatch` to GitHub only after `/execute` succeeds (or a human can use `workflow_dispatch` only on `governed-deploy.yml`)

Proof records include:
- `run_id`
- `commit_sha`
- `workflow`
- `environment`

### Existing deploy workflows and production bypass status

- Legacy/non-production workflows may still exist for non-production usage, but they must explicitly block production and direct production to `governed-deploy.yml`.
- Any repository-dispatch examples are for governed/test transfer surfaces only; they are not production deploy entrypoints.

### Remaining bypass risks

- A repository admin could still manually edit workflow files on a branch and merge policy changes.
- A repository admin could still create a new non-governed workflow that deploys directly.
- Secret misuse (ex: compromised `MINDSHIFT_WORKER_URL`, `MINDSHIFT_API_KEY`, or GitHub token) could bypass intent.

Because those controls are organizational/policy dependent, treat this as a governed boundary design target rather than a fully immutable enforcement boundary until the Worker target and repository protections are both verified in your environment.

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
- `validated_object_hash` and `executed_object_hash` in execution/transfer records, enforcing `validated_object == executed_object`.
- `proof` record keyed by `execution_id` + GitHub `run_id` + `commit_sha` + `environment`.
# trigger
