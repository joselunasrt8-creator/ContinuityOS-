function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" }
  })
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")
}

type Env = {
  DB: D1Database
  GITHUB_TOKEN: string
  GITHUB_OWNER: string
  GITHUB_REPO: string
  PREPARE_DEPLOY_API_KEY: string
}

type GithubDeployTarget = {
  system: "github_actions"
  action: "deploy"
  repo: string
  branch: string
  workflow: string
  inputs?: Record<string, string>
}

async function readJson(request: Request): Promise<any | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function parseJsonObject(value: unknown) {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }

  return {}
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function missingDbBinding(env: Env): string | null {
  if (!env?.DB) {
    return "Missing required D1 binding: DB."
  }

  return null
}

function hasValidPrepareDeployApiKey(request: Request, env: Env): boolean {
  const expectedApiKey = env.PREPARE_DEPLOY_API_KEY
  if (!expectedApiKey) {
    return false
  }

  const providedApiKey = request.headers.get("X-API-Key")
  return providedApiKey === expectedApiKey
}

function ensureDeployConstraints(constraints: Record<string, unknown>) {
  return {
    ...constraints,
    repo: String(constraints.repo || ""),
    branch: String(constraints.branch || ""),
    workflow: String(constraints.workflow || ""),
    max_executions: Number(constraints.max_executions ?? 1)
  }
}

function buildAuthority(body: any) {
  const constraints = ensureDeployConstraints(parseJsonObject(body.constraints))
  const scope = parseJsonObject(body.scope)

  return {
    authority_id: crypto.randomUUID(),
    decision_id: body.decision_id || crypto.randomUUID(),
    owner: body.owner || "unknown",
    intent: body.intent || "deploy_production",
    scope,
    constraints,
    status: "ACTIVE",
    created_at: new Date().toISOString()
  }
}

function buildAeo(authority: any, target: GithubDeployTarget) {
  return {
    aeo_id: crypto.randomUUID(),
    authority_id: authority.authority_id,
    decision_id: authority.decision_id,
    intent: authority.intent,
    scope: parseJsonObject(authority.scope),
    constraints: ensureDeployConstraints(parseJsonObject(authority.constraints)),
    validation: {
      authority_id: authority.authority_id,
      decision_id: authority.decision_id,
      max_executions: ensureDeployConstraints(parseJsonObject(authority.constraints)).max_executions
    },
    target,
    finality: {
      proof_required: true
    },
    status: "COMPILED"
  }
}

function parseGithubTarget(input: any): GithubDeployTarget | null {
  if (!input || typeof input !== "object") {
    return null
  }

  if (input.system !== "github_actions" || input.action !== "deploy") {
    return null
  }

  if (!input.repo || !input.branch || !input.workflow) {
    return null
  }

  return {
    system: "github_actions",
    action: "deploy",
    repo: String(input.repo),
    branch: String(input.branch),
    workflow: String(input.workflow),
    inputs: input.inputs && typeof input.inputs === "object" ? input.inputs : undefined
  }
}

function targetFromAuthority(authority: any): GithubDeployTarget | null {
  const constraints = ensureDeployConstraints(parseJsonObject(authority.constraints))

  if (!constraints.repo || !constraints.branch || !constraints.workflow) {
    return null
  }

  return {
    system: "github_actions",
    action: "deploy",
    repo: constraints.repo,
    branch: constraints.branch,
    workflow: constraints.workflow
  }
}

async function buildValidation(aeo: any, authority: any) {
  const validated_object_hash = await sha256Hex(JSON.stringify(aeo))
  const constraints = ensureDeployConstraints(parseJsonObject(aeo?.constraints))
  const target = parseJsonObject(aeo?.target)
  const finality = parseJsonObject(aeo?.finality)
  const validation = parseJsonObject(aeo?.validation)
  const hasRequiredAeoFields = Boolean(aeo?.intent && aeo?.scope && aeo?.validation && aeo?.target && aeo?.finality)
  const isAuthorityActive = Boolean(authority && String(authority.status || "").toUpperCase() === "ACTIVE")
  const hasTargetFields = Boolean(target.repo && target.branch && target.workflow)
  const constraintsMatchTarget =
    constraints.repo === String(target.repo || "") &&
    constraints.branch === String(target.branch || "") &&
    constraints.workflow === String(target.workflow || "")

  const authorityBindingChecks = [
    {
      ok: aeo?.authority_id === authority?.authority_id,
      message: "aeo.authority_id does not match authority.authority_id"
    },
    {
      ok: aeo?.decision_id === authority?.decision_id,
      message: "aeo.decision_id does not match authority.decision_id"
    },
    {
      ok: validation.authority_id === authority?.authority_id,
      message: "aeo.validation.authority_id does not match authority.authority_id"
    },
    {
      ok: validation.decision_id === authority?.decision_id,
      message: "aeo.validation.decision_id does not match authority.decision_id"
    }
  ]
  const authorityBindingFailure = authorityBindingChecks.find((check) => !check.ok)

  const isValid =
    Boolean(authority) &&
    isAuthorityActive &&
    hasRequiredAeoFields &&
    Boolean(aeo?.target) &&
    finality.proof_required === true &&
    hasTargetFields &&
    constraintsMatchTarget &&
    !authorityBindingFailure

  const status = isValid ? "VALIDATED" : "FAILED"
  const message = authorityBindingFailure
    ? `Authority binding mismatch: ${authorityBindingFailure.message}.`
    : isValid
      ? "Validation succeeded."
      : "Validation failed due to unmet constraints or missing required fields."

  return {
    validation_id: crypto.randomUUID(),
    authority_id: aeo.authority_id,
    aeo_id: aeo.aeo_id,
    decision_id: aeo.decision_id,
    intent: aeo.intent,
    validated_object_hash,
    result: isValid ? "VALID" : "NULL",
    status,
    message,
    created_at: new Date().toISOString()
  }
}



async function ensureInvocationRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS invocation_registry (
    decision_id TEXT NOT NULL,
    validated_object_hash TEXT NOT NULL,
    invocation_nonce TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    consumed_at TEXT,
    PRIMARY KEY (decision_id, validated_object_hash, invocation_nonce)
  )`).run()
}

async function createInvocationAuthority(env: Env, decisionId: string, validatedObjectHash: string) {
  await ensureInvocationRegistry(env)
  const invocationNonce = crypto.randomUUID()
  await env.DB.prepare(`INSERT INTO invocation_registry (decision_id, validated_object_hash, invocation_nonce, status, created_at, consumed_at)
    VALUES (?1, ?2, ?3, 'ACTIVE', ?4, NULL)`)
    .bind(decisionId, validatedObjectHash, invocationNonce, new Date().toISOString())
    .run()
  return invocationNonce
}

async function findLatestActiveInvocationNonce(env: Env, decisionId: string, validatedObjectHash: string) {
  await ensureInvocationRegistry(env)
  return env.DB.prepare(`SELECT invocation_nonce FROM invocation_registry
    WHERE decision_id = ?1 AND validated_object_hash = ?2 AND UPPER(status) = 'ACTIVE'
    ORDER BY created_at DESC LIMIT 1`)
    .bind(decisionId, validatedObjectHash)
    .first<{ invocation_nonce: string }>()
}

async function ensureInvocationAuthority(env: Env, decisionId: string, validatedObjectHash: string) {
  const existing = await findLatestActiveInvocationNonce(env, decisionId, validatedObjectHash)
  if (existing?.invocation_nonce) return existing.invocation_nonce
  return createInvocationAuthority(env, decisionId, validatedObjectHash)
}

async function prepareDeployTriple(env: Env) {
  // Prepare-only route: generate a fresh deploy authorization triple.
  // This must not execute deployment and must not consume nonce.
  const authority = buildAuthority({
    owner: "prepare_deploy_endpoint",
    intent: "deploy_production",
    scope: { environment: "production", mode: "prepare_deploy" },
    constraints: {
      repo: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`,
      branch: "main",
      workflow: "deploy.yml",
      max_executions: 1
    }
  })

  await saveAuthority(env, authority)

  const target = targetFromAuthority(authority)
  if (!target) {
    throw new Error("Failed to derive GitHub deploy target for production authority.")
  }

  const aeo = buildAeo(authority, target)
  await saveAeo(env, aeo)

  const validation = await buildValidation(aeo, authority)
  if (validation.result !== "VALID") {
    throw new Error("Failed to compile a valid production deploy AEO.")
  }

  await saveValidation(env, validation)
  const invocationNonce = await createInvocationAuthority(env, authority.decision_id, validation.validated_object_hash)

  return {
    decision_id: authority.decision_id,
    validated_object_hash: validation.validated_object_hash,
    invocation_nonce: invocationNonce
  }
}

async function findInvocationAuthority(env: Env, decisionId: string, validatedObjectHash: string, invocationNonce: string) {
  await ensureInvocationRegistry(env)
  return env.DB.prepare(`SELECT * FROM invocation_registry
    WHERE decision_id = ?1 AND validated_object_hash = ?2 AND invocation_nonce = ?3
    ORDER BY created_at DESC LIMIT 1`)
    .bind(decisionId, validatedObjectHash, invocationNonce)
    .first<any>()
}

async function consumeInvocationAuthority(env: Env, decisionId: string, validatedObjectHash: string, invocationNonce: string) {
  await ensureInvocationRegistry(env)
  const result = await env.DB.prepare(`UPDATE invocation_registry
    SET status = 'CONSUMED', consumed_at = ?4
    WHERE decision_id = ?1 AND validated_object_hash = ?2 AND invocation_nonce = ?3 AND UPPER(status) = 'ACTIVE'`)
    .bind(decisionId, validatedObjectHash, invocationNonce, new Date().toISOString())
    .run()
  return Number(result.meta?.changes || 0) > 0
}

async function findAuthorityByDecisionId(env: Env, decisionId: string) {
  return env.DB.prepare("SELECT * FROM authority_registry WHERE decision_id = ?1 ORDER BY created_at DESC LIMIT 1")
    .bind(decisionId)
    .first<any>()
}

async function findAuthorityById(env: Env, authorityId: string) {
  return env.DB.prepare("SELECT * FROM authority_registry WHERE authority_id = ?1")
    .bind(authorityId)
    .first<any>()
}

async function findAeoById(env: Env, aeoId: string) {
  return env.DB.prepare("SELECT * FROM aeo_registry WHERE aeo_id = ?1")
    .bind(aeoId)
    .first<any>()
}

async function findValidationById(env: Env, validationId: string) {
  return env.DB.prepare("SELECT * FROM validation_registry WHERE validation_id = ?1")
    .bind(validationId)
    .first<any>()
}


async function findLatestValidValidationByDecisionId(env: Env, decisionId: string) {
  return env.DB.prepare(
    `SELECT * FROM validation_registry
     WHERE decision_id = ?1
       AND result = 'VALID'
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(decisionId)
    .first<any>()
}

async function findValidationByHashAndDecisionId(env: Env, hash: string, decisionId: string) {
  return env.DB.prepare(
    `SELECT * FROM validation_registry
     WHERE validated_object_hash = ?1
       AND decision_id = ?2
       AND result = 'VALID'
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(hash, decisionId)
    .first<any>()
}

function isAuthorityUsableForExecution(authorityStatus: string | null | undefined) {
  return ["ACTIVE"].includes((authorityStatus || "").toUpperCase())
}

async function consumeAuthority(env: Env, decisionId: string) {
  await env.DB.prepare("UPDATE authority_registry SET status = ?1 WHERE decision_id = ?2")
    .bind("CONSUMED", decisionId)
    .run()
}

async function consumeAuthorityIfActive(env: Env, decisionId: string) {
  const result = await env.DB.prepare(
    "UPDATE authority_registry SET status = ?1 WHERE decision_id = ?2 AND UPPER(status) = 'ACTIVE'"
  )
    .bind("CONSUMED", decisionId)
    .run()

  return Number(result.meta?.changes || 0) > 0
}

async function saveAuthority(env: Env, authority: any) {
  await env.DB.prepare(
    `INSERT INTO authority_registry (
      authority_id,
      decision_id,
      owner,
      intent,
      scope,
      constraints,
      status,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      authority.authority_id,
      authority.decision_id,
      authority.owner,
      authority.intent,
      JSON.stringify(authority.scope),
      JSON.stringify(authority.constraints),
      authority.status,
      authority.created_at
    )
    .run()
}

async function getTableColumns(env: Env, tableName: string): Promise<Set<string> | null> {
  try {
    const result = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>()
    return new Set((result.results || []).map((row) => row.name))
  } catch {
    return null
  }
}

async function canInsertAuthority(env: Env) {
  const required = ["authority_id", "decision_id", "owner", "intent", "scope", "constraints", "status", "created_at"]
  const columns = await getTableColumns(env, "authority_registry")
  if (!columns) {
    return {
      ok: false,
      error: "authority_registry is missing or inaccessible in D1."
    }
  }

  const missing = required.filter((column) => !columns.has(column))
  if (missing.length > 0) {
    return {
      ok: false,
      error: `authority_registry schema mismatch. Missing columns: ${missing.join(", ")}`
    }
  }

  return { ok: true }
}

async function saveAeo(env: Env, aeo: any) {
  await env.DB.prepare(
    `INSERT INTO aeo_registry (
      aeo_id,
      authority_id,
      decision_id,
      intent,
      aeo,
      status,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(aeo.aeo_id, aeo.authority_id, aeo.decision_id, aeo.intent, JSON.stringify(aeo), aeo.status, new Date().toISOString())
    .run()
}

async function saveValidation(env: Env, validation: any) {
  await env.DB.prepare(
    `INSERT INTO validation_registry (
      validation_id,
      authority_id,
      aeo_id,
      decision_id,
      intent,
      validated_object_hash,
      result,
      status,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  )
    .bind(
      validation.validation_id,
      validation.authority_id,
      validation.aeo_id,
      validation.decision_id,
      validation.intent,
      validation.validated_object_hash,
      validation.result,
      validation.status,
      validation.created_at || new Date().toISOString()
    )
    .run()
}

async function saveExecution(env: Env, execution: any) {
  await env.DB.prepare(
    `INSERT INTO execution_registry (
      execution_id,
      authority_id,
      decision_id,
      intent,
      validated_object_hash,
      webhook_url,
      upstream_status,
      status,
      execution_event,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  )
    .bind(
      execution.execution_id,
      execution.authority_id,
      execution.decision_id,
      execution.intent,
      execution.validated_object_hash,
      execution.webhook_url,
      execution.upstream_status,
      execution.status,
      JSON.stringify(execution.execution_event),
      execution.timestamp
    )
    .run()
}

async function executeGithubDeploy(
  env: Env,
  authority: any,
  target: GithubDeployTarget,
  options?: { simulateSuccess?: boolean },
  validatedObjectHash?: string
) {
  const executionId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  let status = "FAILED"
  let upstreamStatus: number | null = null
  let upstreamBody: string | null = null

  const [targetOwner, targetRepo] = target.repo.split("/")
  const owner = targetOwner || env.GITHUB_OWNER
  const repo = targetRepo || env.GITHUB_REPO
  const dispatchRepo = `${owner}/${repo}`
  const workflow = String(target.workflow).split("/").pop() || String(target.workflow)
  if (!workflow.endsWith(".yml") && !workflow.endsWith(".yaml")) {
    throw new Error("Invalid workflow target: must be workflow file name")
  }
  const dispatchUrl = `https://api.github.com/repos/${dispatchRepo}/actions/workflows/${workflow}/dispatches`
  console.log("Dispatch URL:", dispatchUrl)

  if (options?.simulateSuccess) {
    upstreamStatus = 204
    status = "EXECUTED"
    upstreamBody = ""
  } else {
    try {
      const upstream = await fetch(dispatchUrl, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "User-Agent": "mindshift-demo-worker",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            environment: "production"
          }
        })
      })

      upstreamStatus = upstream.status
      upstreamBody = await upstream.text()
      status = upstream.ok ? "EXECUTED" : "FAILED"
    } catch (error) {
      status = "FAILED"
      upstreamBody = error instanceof Error ? error.message : "Unknown dispatch error."
    }
  }

  const execution = {
    execution_id: executionId,
    authority_id: authority.authority_id,
    decision_id: authority.decision_id,
    intent: authority.intent,
    validated_object_hash: validatedObjectHash || null,
    webhook_url: dispatchUrl,
    upstream_status: upstreamStatus,
    upstream_body: upstreamBody,
    status,
    timestamp,
    target,
    execution_event: {
      system: target.system,
      action: target.action,
      repo: dispatchRepo,
      branch: target.branch,
      workflow: target.workflow,
      validated_object_hash: validatedObjectHash || null
    }
  }

  await saveExecution(env, execution)
  return execution
}

async function findReplayExecutionByHash(env: Env, validatedObjectHash: string) {
  return env.DB.prepare(
    `SELECT execution_id, status
     FROM execution_registry
     WHERE validated_object_hash = ?1
       AND UPPER(status) IN ('EXECUTED', 'SUCCESS')
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(validatedObjectHash)
    .first<any>()
}

async function runExecuteFlow(
  env: Env,
  body: { decision_id?: string; intent?: string; target?: any; validated_object_hash?: string },
  options?: { simulateSuccess?: boolean }
) {
  if (body.validated_object_hash && body.decision_id) {
    const replayExecution = await findReplayExecutionByHash(env, body.validated_object_hash)
    if (replayExecution) {
      return {
        code: 409,
        payload: {
          status: "FAILED",
          result: "INVALID",
          error: "replay_detected"
        }
      }
    }

    const existingValidation = await findValidationByHashAndDecisionId(
      env,
      body.validated_object_hash,
      body.decision_id
    )
    if (!existingValidation) {
      return {
        code: 409,
        payload: {
          status: "FAILED",
          decision_id: body.decision_id,
          result: "NOT_EXECUTED",
          message: "execution blocked",
          error: "No existing VALID validation found for decision_id and validated_object_hash."
        }
      }
    }

    const authority = await findAuthorityById(env, existingValidation.authority_id)
    if (!authority || !isAuthorityUsableForExecution(authority.status)) {
      return {
        code: 409,
        payload: {
          status: "FAILED",
          decision_id: body.decision_id,
          result: "NOT_EXECUTED",
          message: "execution blocked",
          error: "Authority is not ACTIVE for this validated object."
        }
      }
    }

    const authorityTarget = targetFromAuthority(authority)
    if (!authorityTarget) {
      return {
        code: 409,
        payload: {
          status: "FAILED",
          decision_id: body.decision_id,
          result: "NOT_EXECUTED",
          message: "execution blocked",
          error: "Authority constraints are missing deploy target fields (repo, branch, workflow)."
        }
      }
    }

    if (!options?.simulateSuccess && (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO)) {
      return {
        code: 500,
        payload: {
          status: "FAILED",
          decision_id: body.decision_id,
          result: "NOT_EXECUTED",
          message: "execution blocked",
          error: "Missing required GitHub secrets: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO."
        }
      }
    }

    const execution = await executeGithubDeploy(
      env,
      authority,
      authorityTarget,
      options,
      body.validated_object_hash
    )

    if (execution.status === "EXECUTED") {
      await consumeAuthority(env, body.decision_id)
      await consumeInvocationAuthority(env, body.decision_id, body.validated_object_hash!, body.invocation_nonce || "")
      return {
        code: 200,
        payload: {
          execution_id: execution.execution_id,
          decision_id: execution.decision_id,
          status: "VALID",
          surface: "github_actions",
          workflow: authorityTarget.workflow,
          branch: authorityTarget.branch,
          upstream_status: execution.upstream_status,
          upstream_body: execution.upstream_body
        }
      }
    }

    return {
      code: 502,
      payload: {
        status: "FAILED",
        decision_id: body.decision_id,
        result: "NOT_EXECUTED",
        message: "GitHub workflow dispatch failed.",
        execution_id: execution.execution_id,
        upstream_status: execution.upstream_status,
        upstream_body: execution.upstream_body
      }
    }
  }

  const validation = await validateAuthority(env, body)
  if (validation.payload.validated_object_hash) {
    const replayExecution = await findReplayExecutionByHash(env, validation.payload.validated_object_hash)
    if (replayExecution) {
      return {
        code: 409,
        payload: {
          status: "FAILED",
          result: "INVALID",
          error: "replay_detected"
        }
      }
    }
  }

  if (!validation.ok || !validation.authority) {
    return {
      code: validation.code,
      payload: {
        status: "FAILED",
        decision_id: body.decision_id || null,
        result: "NOT_EXECUTED",
        message: "execution blocked",
        validation: validation.payload
      }
    }
  }

  const authority = validation.authority

  if (body.validated_object_hash && body.validated_object_hash !== validation.payload.validated_object_hash) {
    return {
      code: 409,
      payload: {
        status: "FAILED",
        decision_id: body.decision_id || null,
        result: "NOT_EXECUTED",
        message: "execution blocked",
        error: "validated_object_hash mismatch. Execute only the exact object returned by /validate."
      }
    }
  }

  const authorityTarget = targetFromAuthority(authority)
  if (!authorityTarget) {
    return {
      code: 409,
      payload: {
        status: "FAILED",
        decision_id: body.decision_id || null,
        result: "NOT_EXECUTED",
        message: "execution blocked",
        error: "Authority constraints are missing deploy target fields (repo, branch, workflow)."
      }
    }
  }

  let target = authorityTarget
  if (body.target) {
    const requestedTarget = parseGithubTarget(body.target)
    if (!requestedTarget) {
      return {
        code: 400,
        payload: {
          status: "FAILED",
          decision_id: body.decision_id || null,
          result: "NOT_EXECUTED",
          message: "execution blocked",
          error:
            "Unsupported target. Only target.system='github_actions' with action='deploy' and fields repo, branch, workflow is allowed."
        }
      }
    }

    if (
      requestedTarget.repo !== authorityTarget.repo ||
      requestedTarget.branch !== authorityTarget.branch ||
      requestedTarget.workflow !== authorityTarget.workflow
    ) {
      return {
        code: 409,
        payload: {
          status: "FAILED",
          decision_id: body.decision_id || null,
          result: "NOT_EXECUTED",
          message: "execution blocked",
          error: "Requested target does not match ACTIVE authority constraints."
        }
      }
    }

    target = requestedTarget
  }

  if (!options?.simulateSuccess && (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO)) {
    return {
      code: 500,
      payload: {
        status: "FAILED",
        decision_id: body.decision_id || null,
        result: "NOT_EXECUTED",
        message: "execution blocked",
        error: "Missing required GitHub secrets: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO."
      }
    }
  }

  const execution = await executeGithubDeploy(
    env,
    validation.authority,
    target,
    options,
    validation.payload.validated_object_hash
  )

  if (execution.status === "EXECUTED") {
    await consumeAuthority(env, execution.decision_id)
    if (body.invocation_nonce) {
      await consumeInvocationAuthority(env, body.decision_id || execution.decision_id, validation.payload.validated_object_hash, body.invocation_nonce)
    }
    return {
      code: 200,
      payload: {
        execution_id: execution.execution_id,
        decision_id: execution.decision_id,
        status: "VALID",
        surface: "github_actions",
        workflow: target.workflow,
        branch: target.branch,
        upstream_status: execution.upstream_status,
        upstream_body: execution.upstream_body
      }
    }
  }

  return {
    code: 502,
    payload: {
      status: "FAILED",
      decision_id: body.decision_id || null,
      result: "NOT_EXECUTED",
      message: "GitHub workflow dispatch failed.",
      execution_id: execution.execution_id,
      upstream_status: execution.upstream_status,
      upstream_body: execution.upstream_body
    }
  }
}

function buildProof(body: any, execution: any) {
  const executionEvent = parseJsonObject(execution?.execution_event)
  const validatedObjectHash =
    typeof executionEvent.validated_object_hash === "string" ? executionEvent.validated_object_hash : undefined

  return {
    proof_id: crypto.randomUUID(),
    execution_id: body.execution_id,
    decision_id: body.decision_id,
    authority_id: execution.authority_id,
    surface: body.surface || "github_actions",
    proof_reference:
      body.proof_reference ||
      {
        source: `github_run:${body.run_id || "unknown"}`,
        ...(validatedObjectHash ? { validated_object_hash: validatedObjectHash } : {})
      },
    run_id: body.run_id,
    commit_sha: body.commit_sha,
    environment_url: body.environment_url || null,
    workflow: body.workflow || null,
    environment: body.environment || null,
    timestamp: new Date().toISOString(),
    status: "RECORDED",
    execution_status: execution.status
  }
}

async function saveProof(env: Env, proof: any) {
  const normalizedProofReference =
    typeof proof.proof_reference === "string"
      ? { source: proof.proof_reference }
      : parseJsonObject(proof.proof_reference)

  await env.DB.prepare(
    `INSERT INTO proof_registry (
      proof_id,
      execution_id,
      authority_id,
      decision_id,
      surface,
      proof_reference,
      status,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      proof.proof_id,
      proof.execution_id,
      proof.authority_id,
      proof.decision_id,
      proof.surface,
      JSON.stringify({
        proof_reference: normalizedProofReference,
        run_id: proof.run_id,
        commit_sha: proof.commit_sha,
        environment_url: proof.environment_url,
        workflow: proof.workflow,
        environment: proof.environment,
        ...(normalizedProofReference.validated_object_hash
          ? { validated_object_hash: normalizedProofReference.validated_object_hash }
          : {})
      }),
      proof.status,
      proof.timestamp
    )
    .run()
}

async function findExecution(env: Env, executionId: string) {
  return env.DB.prepare("SELECT * FROM execution_registry WHERE execution_id = ?1").bind(executionId).first<any>()
}

async function listAuthorities(env: Env) {
  return env.DB.prepare("SELECT * FROM authority_registry ORDER BY created_at DESC").all()
}

async function listExecutions(env: Env) {
  return env.DB.prepare("SELECT * FROM execution_registry ORDER BY created_at DESC").all()
}

async function listProofs(env: Env) {
  return env.DB.prepare("SELECT * FROM proof_registry ORDER BY created_at DESC").all()
}

async function recordsSavedForRun(env: Env, decisionId: string, executionId: string, proofId: string) {
  const [authority, execution, proof] = await Promise.all([
    env.DB.prepare("SELECT decision_id FROM authority_registry WHERE decision_id = ?1 ORDER BY created_at DESC LIMIT 1")
      .bind(decisionId)
      .first(),
    env.DB.prepare("SELECT execution_id FROM execution_registry WHERE execution_id = ?1").bind(executionId).first(),
    env.DB.prepare("SELECT proof_id FROM proof_registry WHERE proof_id = ?1").bind(proofId).first()
  ])

  return {
    authority_saved: Boolean(authority),
    execution_saved: Boolean(execution),
    proof_saved: Boolean(proof)
  }
}

async function validateAuthority(env: Env, body: any) {
  const validationId = crypto.randomUUID()

  if (!body.decision_id) {
    return {
      ok: false,
      code: 400,
      payload: {
        validation_id: validationId,
        decision_id: null,
        status: "FAILED",
        result: "INVALID",
        message: "Missing decision_id. Provide the decision_id from POST /authority."
      }
    }
  }

  const authority = await findAuthorityByDecisionId(env, body.decision_id)
  if (!authority) {
    return {
      ok: false,
      code: 404,
      payload: {
        validation_id: validationId,
        decision_id: body.decision_id,
        status: "FAILED",
        result: "INVALID",
        message: "authority not found"
      }
    }
  }

  if (!isAuthorityUsableForExecution(authority.status)) {
    const isConsumed = String(authority.status).toUpperCase() === "CONSUMED"
    return {
      ok: false,
      code: 409,
      payload: {
        validation_id: validationId,
        decision_id: body.decision_id,
        status: "FAILED",
        result: "INVALID",
        message: isConsumed
          ? "authority already consumed"
          : `Authority exists, but status '${authority.status}' is not valid for execution.`,
        ...(isConsumed ? { error: "replay_detected" } : {})
      }
    }
  }

  if (body.validated_object_hash) {
    if (!body.invocation_nonce) {
      return {
        ok: false,
        code: 400,
        payload: {
          validation_id: validationId,
          decision_id: body.decision_id,
          status: "FAILED",
          result: "INVALID",
          message: "missing invocation_nonce"
        }
      }
    }

    if (body.environment && body.environment !== "production") {
      return {
        ok: false,
        code: 409,
        payload: {
          validation_id: validationId,
          decision_id: body.decision_id,
          status: "FAILED",
          result: "INVALID",
          message: "environment must be production"
        }
      }
    }

    const existingValidation = await findLatestValidValidationByDecisionId(env, body.decision_id)
    if (!existingValidation) {
      return {
        ok: false,
        code: 404,
        payload: {
          validation_id: validationId,
          decision_id: body.decision_id,
          status: "FAILED",
          result: "INVALID",
          message: "No VALID validation record found for decision_id.",
          error: "unknown_or_expired"
        }
      }
    }

    if (body.validated_object_hash !== existingValidation.validated_object_hash) {
      return {
        ok: false,
        code: 409,
        payload: {
          validation_id: existingValidation.validation_id,
          decision_id: body.decision_id,
          status: "FAILED",
          result: "INVALID",
          message: "validated_object_hash mismatch for decision_id.",
          error: "hash_mismatch"
        }
      }
    }

    const invocationByHash = await env.DB.prepare(`SELECT * FROM invocation_registry WHERE decision_id = ?1 AND validated_object_hash = ?2 ORDER BY created_at DESC LIMIT 1`)
      .bind(body.decision_id, body.validated_object_hash)
      .first<any>()
    if (!invocationByHash) {
      return {
        ok: false,
        code: 404,
        payload: {
          validation_id: validationId,
          decision_id: body.decision_id,
          status: "FAILED",
          result: "INVALID",
          message: "authority not found"
        }
      }
    }

    const invocation = await findInvocationAuthority(env, body.decision_id, body.validated_object_hash, body.invocation_nonce)
    if (!invocation) {
      return {
        ok: false,
        code: 409,
        payload: { validation_id: validationId, decision_id: body.decision_id, status: "FAILED", result: "INVALID", message: "nonce mismatch" }
      }
    }

    if (String(invocation.status || "").toUpperCase() !== "ACTIVE") {
      return {
        ok: false,
        code: 409,
        payload: { validation_id: validationId, decision_id: body.decision_id, status: "FAILED", result: "INVALID", message: "replay detected" }
      }
    }

    return {
      ok: true,
      code: 200,
      payload: {
        ...existingValidation,
        status: "VALID",
        result: "VALID",
        message: "Exact-object validation succeeded for ACTIVE authority.",
        invocation_nonce: body.invocation_nonce
      },
      authority
    }
  }

  const aeo = buildAeo(authority, targetFromAuthority(authority) as GithubDeployTarget)
  await saveAeo(env, aeo)

  const validation = await buildValidation(aeo, authority)
  await saveValidation(env, validation)

  return {
    ok: true,
    code: 200,
    payload: {
      ...validation,
      message: "Authority is ACTIVE and valid for execution."
    },
    authority
  }
}

async function runGithubProofTest(env: Env) {
  const authority = buildAuthority({
    owner: "github_proof_test",
    decision_id: `proof-${crypto.randomUUID()}`,
    intent: "deploy_production",
    scope: { mode: "github-proof-test" },
    constraints: {
      repo: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`,
      branch: "main",
      workflow: "deploy.yml",
      max_executions: 1
    }
  })

  await saveAuthority(env, authority)
  const validation = await validateAuthority(env, { decision_id: authority.decision_id })
  if (!validation.ok) {
    return jsonResponse({ status: "FAILED", stage: "validate", details: validation.payload }, validation.code)
  }

  const executeResult = await runExecuteFlow(
    env,
    {
      decision_id: authority.decision_id,
      intent: authority.intent,
      validated_object_hash: validation.payload.validated_object_hash
    },
    { simulateSuccess: true }
  )

  if (executeResult.code !== 200 || !executeResult.payload.execution_id) {
    return jsonResponse({ status: "FAILED", stage: "execute", details: executeResult.payload }, executeResult.code)
  }

  const proofBody = {
    execution_id: executeResult.payload.execution_id,
    decision_id: authority.decision_id,
    surface: "github_actions",
    run_id: String(Date.now()),
    commit_sha: crypto.randomUUID().replace(/-/g, ""),
    environment_url: "https://example.com/runtime-proof"
  }

  const execution = await findExecution(env, proofBody.execution_id)
  if (!execution) {
    return jsonResponse({ status: "FAILED", stage: "lookup", error: "execution not found after simulated run" }, 500)
  }

  const proof = buildProof(proofBody, execution)
  await saveProof(env, proof)

  const persistence = await recordsSavedForRun(env, authority.decision_id, proof.execution_id, proof.proof_id)
  return jsonResponse({
    status: "OK",
    authority,
    execution_id: proof.execution_id,
    proof,
    persistence
  })
}

async function runReplayTest(env: Env) {
  // Step 1: create one ACTIVE authority (same logic used by POST /authority).
  const authority = buildAuthority({
    owner: "replay_test",
    decision_id: `replay-${crypto.randomUUID()}`,
    intent: "deploy_production",
    scope: { mode: "replay_test" },
    constraints: {
      repo: "local/replay-test",
      branch: "main",
      workflow: "deploy.yml",
      max_executions: 1
    }
  })
  await saveAuthority(env, authority)

  // Step 2: compile one exact AEO (same logic used by POST /compile).
  const target = targetFromAuthority(authority)
  if (!target) {
    return jsonResponse(
      {
        status: "FAILED",
        error: "Unable to compile replay test AEO because authority constraints are incomplete."
      },
      409
    )
  }
  const aeo = buildAeo(authority, target)
  await saveAeo(env, aeo)

  // Step 3: validate it (same logic used by POST /validate).
  const validation = await validateAuthority(env, { decision_id: authority.decision_id })
  if (!validation.ok) {
    return jsonResponse(
      {
        status: "FAILED",
        stage: "validate",
        details: validation.payload
      },
      validation.code
    )
  }

  // Step 4: execute it once (same logic used by POST /execute).
  const firstExecution = await runExecuteFlow(
    env,
    {
      decision_id: authority.decision_id,
      intent: authority.intent,
      validated_object_hash: validation.payload.validated_object_hash
    },
    { simulateSuccess: true }
  )
  if (firstExecution.code !== 200 || !firstExecution.payload.execution_id) {
    return jsonResponse(
      {
        status: "FAILED",
        stage: "execute",
        details: firstExecution.payload
      },
      firstExecution.code
    )
  }

  // Step 5: record proof (same logic used by POST /proof).
  const storedExecution = await findExecution(env, firstExecution.payload.execution_id)
  if (!storedExecution) {
    return jsonResponse(
      {
        status: "FAILED",
        stage: "proof",
        error: "execution record not found after first execution"
      },
      500
    )
  }

  const proof = buildProof(
    {
      execution_id: firstExecution.payload.execution_id,
      decision_id: authority.decision_id,
      surface: "github_actions",
      run_id: String(Date.now()),
      commit_sha: crypto.randomUUID().replace(/-/g, ""),
      environment_url: "https://example.com/replay-test"
    },
    storedExecution
  )
  await saveProof(env, proof)

  // Step 6: make sure authority is CONSUMED after first execution/proof flow.
  await consumeAuthority(env, authority.decision_id)
  const authorityAfterFirst = await findAuthorityByDecisionId(env, authority.decision_id)

  // Step 7: attempt the same execution again.
  const replayAttempt = await runExecuteFlow(
    env,
    {
      decision_id: authority.decision_id,
      intent: authority.intent,
      validated_object_hash: validation.payload.validated_object_hash
    },
    { simulateSuccess: true }
  )

  // Step 8: replay is blocked because authority is no longer ACTIVE.
  const replayBlocked = replayAttempt.code === 409
  const authorityConsumed = authorityAfterFirst?.status === "CONSUMED"

  return jsonResponse({
    first_attempt: firstExecution.code === 200 ? "EXECUTED" : "FAILED",
    authority_status_after_first: authorityAfterFirst?.status || "UNKNOWN",
    replay_attempt: replayBlocked ? "BLOCKED" : "FAILED",
    system_result: replayBlocked && authorityConsumed ? "NON_REPLAYABLE_EXECUTION_CONFIRMED" : "CHECK_FAILED"
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let normalizedPath = "/unknown"

    try {
      const url = new URL(request.url)
      normalizedPath = `/${url.pathname.replace(/^\/+|\/+$/g, "")}`
      const route = (path: string) => normalizedPath === path || normalizedPath.endsWith(path)

      if (normalizedPath === "/" && request.method === "GET") {
        return new Response("MindShift Runtime Live")
      }

    if (route("/health") && request.method === "GET") {
      return jsonResponse({ status: "ok", service: "mindshift-worker", timestamp: new Date().toISOString() })
    }

      if (route("/db-check") && request.method === "GET") {
        try {
          const probe = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>()
          return jsonResponse({ status: "ok", db: probe?.ok === 1 ? "connected" : "unknown" })
        } catch (error: any) {
          return jsonResponse({ status: "FAILED", error: error?.message || "D1 check failed" }, 500)
        }
      }

      if (route("/route-check") && request.method === "GET") {
        return jsonResponse({
          status: "ok",
          method: "GET",
          enabled_routes: [
            "GET /",
            "GET /health",
            "GET /db-check",
            "GET /route-check",
            "GET /records/authorities",
            "GET /records/executions",
            "GET /records/proofs",
            "GET /replay-test",
            "GET /github-proof-test",
            "POST /webhook",
            "POST /authority",
            "POST /prepare-deploy",
            "POST /compile",
            "POST /validate",
            "POST /validate-pr",
            "POST /execute",
            "POST /proof"
          ]
        })
      }

    if (route("/records/authorities") && request.method === "GET") {
      const results = await listAuthorities(env)
      return jsonResponse(results.results ?? [])
    }

    if (route("/records/executions") && request.method === "GET") {
      const results = await listExecutions(env)
      return jsonResponse(results.results ?? [])
    }

    if (route("/records/proofs") && request.method === "GET") {
      const results = await listProofs(env)
      return jsonResponse(results.results ?? [])
    }

    if (route("/webhook") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      return jsonResponse({ status: "ok", received: body })
    }

      if (route("/prepare-deploy") && request.method === "POST") {
        if (!hasValidPrepareDeployApiKey(request, env)) {
          return jsonResponse({ status: "FAILED", error: "Unauthorized" }, 401)
        }

        const dbError = missingDbBinding(env)
        if (dbError) {
          return jsonResponse({ status: "FAILED", error: dbError }, 500)
        }

        if (!env.GITHUB_OWNER || !env.GITHUB_REPO) {
          return jsonResponse({ status: "FAILED", error: "Missing required GitHub target config: GITHUB_OWNER and GITHUB_REPO." }, 500)
        }

        const insertCheck = await canInsertAuthority(env)
        if (!insertCheck.ok) {
          return jsonResponse({ status: "FAILED", error: insertCheck.error, route: "/prepare-deploy" }, 500)
        }

        try {
          const prepared = await prepareDeployTriple(env)
          return jsonResponse(prepared)
        } catch (error: any) {
          return jsonResponse({ status: "FAILED", error: error?.message || "Failed to prepare deploy invocation." }, 500)
        }
      }

      if (route("/authority") && request.method === "POST") {
        const body = await readJson(request)
        if (!body || !isObject(body)) {
          return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
        }

        const dbError = missingDbBinding(env)
        if (dbError) {
          return jsonResponse({ status: "FAILED", error: dbError }, 500)
        }

        const insertCheck = await canInsertAuthority(env)
        if (!insertCheck.ok) {
          return jsonResponse(
            {
              status: "FAILED",
              error: insertCheck.error,
              route: "/authority"
            },
            500
          )
        }

        // Governed deploy workflow payload compatibility:
        // { decision_id, aeo: { intent, scope, target, commit_sha } }
        if (isObject(body.aeo) && !body.constraints) {
          const authorityId = crypto.randomUUID()
          const decisionId = String(body.decision_id || crypto.randomUUID())
          const aeo = body.aeo as Record<string, unknown>
          const target = parseJsonObject(aeo.target)
          const fallbackRepo = `${env.GITHUB_OWNER || ""}/${env.GITHUB_REPO || ""}`.replace(/^\/|\/$/g, "")
          const constraints = {
            repo: String(target.repo || fallbackRepo),
            branch: String(target.branch || "main"),
            workflow: String(target.workflow || "deploy.yml"),
            max_executions: 1
          }

          if (!constraints.repo || !constraints.branch || !constraints.workflow) {
            return jsonResponse(
              {
                status: "FAILED",
                error: "constraints.repo, constraints.branch, and constraints.workflow are required"
              },
              400
            )
          }

          // Save a normal authority record so existing validate/execute logic still works.
          const authority = buildAuthority({
            decision_id: decisionId,
            owner: body.owner || "governed_deploy_workflow",
            intent: aeo.intent || body.intent || "deploy_production",
            scope: aeo.scope || body.scope || {},
            constraints
          })
          authority.authority_id = authorityId
          try {
            await saveAuthority(env, authority)
          } catch (error: any) {
            return jsonResponse(
              {
                status: "FAILED",
                error: error?.message || "Failed to write authority record to D1.",
                route: "/authority"
              },
              500
            )
          }

          // Keep response minimal for governed-deploy pipeline.
          return jsonResponse({ status: "VALID", authority_id: authorityId, decision_id: decisionId })
        }

        const authority = buildAuthority(body)

        if (!authority.constraints.repo || !authority.constraints.branch || !authority.constraints.workflow) {
          return jsonResponse(
            {
              status: "FAILED",
              error: "constraints.repo, constraints.branch, and constraints.workflow are required"
            },
            400
          )
        }

        if (authority.constraints.max_executions !== 1) {
          return jsonResponse(
            {
              status: "FAILED",
              error: "constraints.max_executions must be 1 for non-bypassable production deploy flow"
            },
            400
          )
        }

        try {
          await saveAuthority(env, authority)
        } catch (error: any) {
          return jsonResponse(
            {
              status: "FAILED",
              error: error?.message || "Failed to write authority record to D1.",
              route: "/authority"
            },
            500
          )
        }
        return jsonResponse({
          status: "VALID",
          authority_id: authority.authority_id,
          decision_id: authority.decision_id
        })
      }
      

    if (route("/compile") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "NULL", result: "NULL", error: "Missing request body" }, 400)
      }

      if (body.authority_id) {
        const authority = await findAuthorityById(env, body.authority_id)
        if (!authority) {
          return jsonResponse({ status: "FAILED", error: "Unknown authority_id" }, 404)
        }

        const target = targetFromAuthority(authority)
        if (!target) {
          return jsonResponse({ status: "FAILED", error: "Unable to compile due to missing authority target constraints." }, 409)
        }

        const aeo = buildAeo(authority, target)
        await saveAeo(env, aeo)

        return jsonResponse({
          status: "VALID",
          compilation_id: aeo.aeo_id,
          compiled_object: aeo
        })
      }

      if (!body.decision_id) {
        return jsonResponse({ status: "FAILED", error: "Missing decision_id" }, 400)
      }

      const authority = await findAuthorityByDecisionId(env, body.decision_id)
      if (!authority) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "No authority found for decision_id. Create authority first."
          },
          404
        )
      }

      const target = targetFromAuthority(authority)
      if (!target) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Authority constraints must define repo, branch, workflow for GitHub deploy target."
          },
          409
        )
      }

      const aeo = buildAeo(authority, target)
      await saveAeo(env, aeo)
      return jsonResponse(aeo)
    }


    if (route("/validate-pr") && request.method === "POST") {
      const body = await readJson(request)
      if (!body || !isObject(body)) {
        return jsonResponse({ status: "NULL", result: "NULL", reasons: ["Invalid JSON body"] }, 400)
      }

      const repo = String(body.repo || "")
      const branch = String(body.branch || "")
      const headSha = String(body.head_sha || "")
      const prNumber = String(body.pr_number || "")

      const reasons: string[] = []
      if (repo !== "joselunasrt8-creator/mindshift-demo") reasons.push("repo must be joselunasrt8-creator/mindshift-demo")
      if (!branch) reasons.push("branch is required")
      if (!headSha) reasons.push("head_sha is required")
      if (!prNumber) reasons.push("pr_number is required")

      if (reasons.length === 0) {
        return jsonResponse({ status: "VALID", result: "VALID" })
      }

      return jsonResponse({ status: "NULL", result: "NULL", reasons }, 200)
    }

    if (route("/validate") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "NULL", result: "NULL", error: "Missing request body" }, 400)
      }

      if (body.compilation_id) {
        const compiled = await findAeoById(env, body.compilation_id)
        if (!compiled) {
          return jsonResponse({ status: "FAILED", error: "Unknown compilation_id" }, 404)
        }

        const compiledAeo = parseJsonObject(compiled.aeo)
        const validation = await buildValidation({
          ...compiledAeo,
          aeo_id: compiled.aeo_id,
          authority_id: compiled.authority_id,
          decision_id: compiled.decision_id,
          intent: compiled.intent
        }, await findAuthorityById(env, compiled.authority_id))
        await saveValidation(env, validation)

        return jsonResponse({
          status: validation.result === "VALID" ? "VALID" : "NULL",
          result: validation.result,
          validation_id: validation.validation_id,
          decision_id: validation.decision_id,
          intent: validation.intent,
          validated_object: compiledAeo,
          validated_object_hash: validation.validated_object_hash
        }, validation.result === "VALID" ? 200 : 409)
      }

      const result = await validateAuthority(env, body)
      return jsonResponse(result.payload, result.code)
    }

    if (route("/execute") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "NULL", result: "NOT_EXECUTED", error: "Missing request body" }, 400)
      }

      if (body.validation_id) {
        if (!body.webhook_url) {
          return jsonResponse({ status: "FAILED", error: "Missing webhook_url" }, 400)
        }

        const validation = await findValidationById(env, body.validation_id)
        if (!validation) {
          return jsonResponse({ status: "FAILED", error: "Unknown validation_id" }, 404)
        }

        const authority = await findAuthorityById(env, validation.authority_id)
        if (!authority) {
          return jsonResponse({ status: "FAILED", error: "Authority not found for validation_id" }, 404)
        }

        const executionId = crypto.randomUUID()
        const timestamp = new Date().toISOString()
        let upstreamStatus: number | null = null
        let status = "FAILED"

        try {
          const upstream = await fetch(String(body.webhook_url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              validation_id: validation.validation_id,
              authority_id: validation.authority_id,
              decision_id: validation.decision_id,
              validated_object_hash: validation.validated_object_hash
            })
          })
          upstreamStatus = upstream.status
          status = upstream.ok ? "EXECUTED" : "FAILED"
        } catch {
          status = "FAILED"
        }

        await saveExecution(env, {
          execution_id: executionId,
          authority_id: validation.authority_id,
          decision_id: validation.decision_id,
          intent: validation.intent,
          webhook_url: String(body.webhook_url),
          upstream_status: upstreamStatus,
          status,
          timestamp,
          execution_event: {
            system: "webhook",
            action: "post",
            validation_id: validation.validation_id,
            validated_object_hash: validation.validated_object_hash
          }
        })

        if (status !== "EXECUTED") {
          return jsonResponse({ status: "FAILED", error: "Webhook execution failed", execution_id: executionId }, 502)
        }

        return jsonResponse({
          status: "VALID",
          execution_id: executionId
        })
      }

      if (!body.intent) {
        return jsonResponse({ status: "FAILED", error: "Missing intent" }, 400)
      }

      try {
        const result = await runExecuteFlow(env, body)
        return jsonResponse(result.payload, result.code)
      } catch (error: any) {
        return jsonResponse(
          {
            status: "FAILED",
            decision_id: body.decision_id,
            result: "NOT_EXECUTED",
            message: "Execution failed while dispatching GitHub workflow or writing execution record.",
            error: error?.message || "Unknown execution error"
          },
          500
        )
      }
    }

    if (route("/replay-test") && request.method === "GET") {
      return runReplayTest(env)
    }

    if (route("/github-proof-test") && request.method === "GET") {
      return runGithubProofTest(env)
    }
    if (route("/nonce-validation-test") && request.method === "GET") {
      const authority = buildAuthority({ owner: "nonce_test", constraints: { repo: "local/repo", branch: "main", workflow: "deploy.yml", max_executions: 1 } })
      await saveAuthority(env, authority)
      const aeo = buildAeo(authority, targetFromAuthority(authority) as GithubDeployTarget)
      await saveAeo(env, aeo)
      const hash = await sha256Hex(JSON.stringify(aeo))
      const nonce = await ensureInvocationAuthority(env, authority.decision_id, hash)
      await saveValidation(env, await buildValidation(aeo, authority))
      const missing = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, environment: "production" })
      const wrong = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, invocation_nonce: "bad", environment: "production" })
      const good = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, invocation_nonce: nonce, environment: "production" })
      const replay = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, invocation_nonce: nonce, environment: "production" })
      const wrongHash = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: "deadbeef", invocation_nonce: nonce, environment: "production" })
      return jsonResponse({ missing: missing.payload, wrong: wrong.payload, good: good.payload, replay: replay.payload, wrongHash: wrongHash.payload })
    }


    if (route("/proof") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "NULL", result: "NULL", error: "Missing request body" }, 400)
      }

      if (body.execution_id && !body.decision_id) {
        const execution = await findExecution(env, body.execution_id)
        if (!execution) {
          return jsonResponse({ status: "FAILED", error: "Unknown execution_id. Run /execute first." }, 404)
        }

        if (execution.status !== "EXECUTED") {
          return jsonResponse({ status: "FAILED", error: "Proof can only be recorded after successful execution." }, 409)
        }

        const proof = buildProof(
          {
            execution_id: body.execution_id,
            decision_id: execution.decision_id,
            surface: "github_actions",
            run_id: body.run_id,
            commit_sha: body.commit_sha,
            workflow: body.workflow,
            environment: body.environment
          },
          execution
        )

        await saveProof(env, proof)
        await consumeAuthority(env, execution.decision_id)

        return jsonResponse({
          status: "VALID",
          proof
        })
      }

      const required = ["execution_id", "decision_id", "surface", "run_id", "commit_sha", "workflow", "environment"]
      const missing = required.filter((key) => !body[key])
      if (missing.length > 0) {
        return jsonResponse({ status: "FAILED", error: `Missing fields: ${missing.join(", ")}` }, 400)
      }

      const execution = await findExecution(env, body.execution_id)
      if (!execution) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Unknown execution_id. Run /execute first so proof is tied to a real GitHub dispatch execution."
          },
          404
        )
      }

      if (execution.status !== "EXECUTED") {
        return jsonResponse(
          {
            status: "FAILED",
            error: "Proof can only be recorded after a successful execution."
          },
          409
        )
      }

      if (execution.decision_id !== body.decision_id) {
        return jsonResponse(
          {
            status: "FAILED",
            error: "decision_id does not match the stored execution record"
          },
          409
        )
      }

      const proof = buildProof(body, execution)
      await saveProof(env, proof)
      await consumeAuthority(env, body.decision_id)

      return jsonResponse(proof)
    }

      return jsonResponse({ status: "FAILED", error: "Not Found" }, 404)
    } catch (error: any) {
      return jsonResponse(
        {
          status: "FAILED",
          error: error?.message || "Unhandled worker exception",
          route: normalizedPath
        },
        500
      )
    }
  }
}
