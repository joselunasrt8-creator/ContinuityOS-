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

function canonicalizeJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input && typeof input === "object") {
      const sorted = Object.keys(input as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = normalize((input as Record<string, unknown>)[key])
          return acc
        }, {})
      return sorted
    }
    return input
  }
  return JSON.stringify(normalize(value))
}

function pemToSpkiBytes(pem: string): Uint8Array | null {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "")
  if (!b64) return null
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function verifyEd25519Signature(signatureB64: string, hashHex: string, publicKeyPem: string): Promise<boolean> {
  try {
    const spki = pemToSpkiBytes(publicKeyPem)
    if (!spki) return false
    const key = await crypto.subtle.importKey("spki", spki, { name: "Ed25519" }, false, ["verify"])
    const signature = Uint8Array.from(atob(signatureB64), (char) => char.charCodeAt(0))
    const payload = new TextEncoder().encode(hashHex)
    return crypto.subtle.verify("Ed25519", key, signature, payload)
  } catch {
    return false
  }
}

function bytesToPem(bytes: Uint8Array, label: string): string {
  const binary = String.fromCharCode(...bytes)
  const b64 = btoa(binary)
  const lines = b64.match(/.{1,64}/g)?.join("\n") || b64
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`
}

async function resolveSignerPublicKeyPem(env: Env, body: any): Promise<string | null> {
  if (typeof body?.signer_public_key === "string" && body.signer_public_key.trim()) {
    return body.signer_public_key.trim()
  }
  if (body?.signer_public_key_reference && env.GOVERNED_SIGNER_PUBLIC_KEY) {
    const configuredKeyFingerprint = await sha256Hex(env.GOVERNED_SIGNER_PUBLIC_KEY)
    if (body.signer_public_key_reference === `sha256:${configuredKeyFingerprint}`) {
      return env.GOVERNED_SIGNER_PUBLIC_KEY
    }
  }
  return null
}

type Env = {
  DB: D1Database
  GITHUB_TOKEN: string
  GITHUB_OWNER: string
  GITHUB_REPO: string
  PREPARE_DEPLOY_API_KEY: string
  GOVERNED_SIGNER_PUBLIC_KEY: string
}

type GithubDeployTarget = {
  system: "github_actions"
  action: "deploy_production"
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

function requireApiKey(request: Request, env: Env): Response | null {
  if (!hasValidPrepareDeployApiKey(request, env)) {
    return jsonResponse({ status: "FAILED", error: "Unauthorized" }, 401)
  }

  return null
}

const CANONICAL_GOVERNED_WORKFLOW = "governed-deploy.yml"

function normalizeWorkflowName(workflow: unknown): string {
  const raw = String(workflow || "").trim()
  if (!raw) return ""
  const parts = raw.split("/").filter(Boolean)
  return parts.length ? parts[parts.length - 1] : raw
}

function ensureDeployConstraints(constraints: Record<string, unknown>) {
  return {
    ...constraints,
    repo: String(constraints.repo || ""),
    branch: String(constraints.branch || ""),
    workflow: normalizeWorkflowName(constraints.workflow),
    max_executions: Number(constraints.max_executions ?? 1)
  }
}

function canonicalWorkflowName(workflow: unknown): string {
  return normalizeWorkflowName(workflow)
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
    expiry: body.expiry || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    created_at: new Date().toISOString()
  }
}

function buildAeo(authority: any, target: GithubDeployTarget) {
  const canonical_aeo = {
    intent: authority.intent,
    scope: parseJsonObject(authority.scope),
    validation: {
      authority_id: authority.authority_id,
      decision_id: authority.decision_id,
      max_executions: ensureDeployConstraints(parseJsonObject(authority.constraints)).max_executions
    },
    target,
    finality: {
      proof_required: true
    }
  }
  const metadata = {
    aeo_id: crypto.randomUUID(),
    authority_id: authority.authority_id,
    decision_id: authority.decision_id,
    status: "COMPILED",
    created_at: new Date().toISOString()
  }
  return { canonical_aeo, metadata }
}

function parseGithubTarget(input: any): GithubDeployTarget | null {
  if (!input || typeof input !== "object") {
    return null
  }

  if (input.system !== "github_actions" || input.action !== "deploy_production") {
    return null
  }

  if (!input.repo || !input.branch || !input.workflow) {
    return null
  }

  return {
    system: "github_actions",
    action: "deploy_production",
    repo: String(input.repo),
    branch: String(input.branch),
    workflow: normalizeWorkflowName(input.workflow),
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
    action: "deploy_production",
    repo: constraints.repo,
    branch: constraints.branch,
    workflow: constraints.workflow
  }
}

async function buildValidation(aeo: any, authority: any) {
  const canonicalAeo = parseJsonObject(aeo?.canonical_aeo)
  const metadata = parseJsonObject(aeo?.metadata)
  const validated_object_hash = await sha256Hex(canonicalizeJson(canonicalAeo))
  const constraints = ensureDeployConstraints(parseJsonObject(authority?.constraints))
  const target = parseJsonObject(canonicalAeo?.target)
  const finality = parseJsonObject(canonicalAeo?.finality)
  const validation = parseJsonObject(canonicalAeo?.validation)
  const hasRequiredAeoFields = Boolean(canonicalAeo?.intent && canonicalAeo?.scope && canonicalAeo?.validation && canonicalAeo?.target && canonicalAeo?.finality)
  const isAuthorityActive = Boolean(authority && String(authority.status || "").toUpperCase() === "ACTIVE")
  const hasTargetFields = Boolean(target.repo && target.branch && target.workflow)
  const constraintsMatchTarget =
    constraints.repo === String(target.repo || "") &&
    constraints.branch === String(target.branch || "") &&
    canonicalWorkflowName(constraints.workflow) === canonicalWorkflowName(target.workflow)

  const authorityBindingChecks = [
    {
      ok: metadata.authority_id === authority?.authority_id,
      message: "aeo.authority_id does not match authority.authority_id"
    },
    {
      ok: metadata.decision_id === authority?.decision_id,
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
    authority_id: metadata.authority_id,
    aeo_id: metadata.aeo_id,
    decision_id: metadata.decision_id,
    intent: canonicalAeo.intent,
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
      workflow: CANONICAL_GOVERNED_WORKFLOW,
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

async function transitionInvocationReservedToExecuting(env: Env, decisionId: string, validatedObjectHash: string, invocationNonce: string) {
  await ensureInvocationRegistry(env)
  const result = await env.DB.prepare(`UPDATE invocation_registry
    SET status = 'EXECUTING'
    WHERE decision_id = ?1 AND validated_object_hash = ?2 AND invocation_nonce = ?3 AND UPPER(status) = 'RESERVED'`)
    .bind(decisionId, validatedObjectHash, invocationNonce)
    .run()
  return Number(result.meta?.changes || 0) > 0
}

async function consumeInvocationAuthority(env: Env, decisionId: string, validatedObjectHash: string, invocationNonce: string) {
  await ensureInvocationRegistry(env)
  const result = await env.DB.prepare(`UPDATE invocation_registry
    SET status = 'CONSUMED', consumed_at = ?4
    WHERE decision_id = ?1 AND validated_object_hash = ?2 AND invocation_nonce = ?3 AND UPPER(status) = 'EXECUTING'`)
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

async function findPrValidationAuthority(env: Env) {
  return env.DB.prepare(
    `SELECT * FROM authority_registry
     WHERE intent = 'merge_pull_request'
       AND UPPER(status) = 'ACTIVE'
     ORDER BY created_at DESC
     LIMIT 1`
  ).first<any>()
}

async function hasPrExecutionReplay(env: Env, payload: {
  repo: string
  pr_number: string
  commit_sha: string
}) {
  const replay = await env.DB.prepare(
    `SELECT execution_id FROM execution_registry
     WHERE json_extract(execution_event, '$.repo') = ?1
       AND json_extract(execution_event, '$.pr_number') = ?2
       AND json_extract(execution_event, '$.commit_sha') = ?3
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(payload.repo, payload.pr_number, payload.commit_sha)
    .first<{ execution_id: string }>()

  return Boolean(replay?.execution_id)
}

async function validatePrAgainstAuthority(
  env: Env,
  input: {
    repo?: unknown
    pr_number?: unknown
    base_branch?: unknown
    head_branch?: unknown
    commit_sha?: unknown
  }
) {
  const invalid = (message: string, code = 200) =>
    ({ code, payload: { status: "FAILED", result: "INVALID", message } })

  const repo = String(input.repo || "")
  const pr_number = String(input.pr_number || "")
  const base_branch = String(input.base_branch || "")
  const head_branch = String(input.head_branch || "")
  const commit_sha = String(input.commit_sha || "")

  if (!repo || !pr_number || !base_branch || !head_branch || !commit_sha) {
    return invalid("missing required fields")
  }
  if (base_branch !== "main") {
    return invalid("base_branch must be main")
  }

  const expectedRepo = `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`
  if (repo !== expectedRepo) {
    return invalid("repo mismatch")
  }

  const authority = await findPrValidationAuthority(env)
  if (!authority) {
    return invalid("authority not found")
  }
  if (String(authority.status || "").toUpperCase() !== "ACTIVE") {
    return invalid("authority not active")
  }
  if (authority.intent !== "merge_pull_request") {
    return invalid("authority intent mismatch")
  }

  const constraints = ensureDeployConstraints(parseJsonObject(authority.constraints))
  const scope = parseJsonObject(authority.scope)
  const authorityBoundObjectMatches =
    constraints.repo === repo &&
    constraints.branch === base_branch &&
    (typeof scope.pr_number === "undefined" || String(scope.pr_number) === pr_number)

  if (!authorityBoundObjectMatches) {
    return invalid("authority-bound object mismatch")
  }

  const replay = await hasPrExecutionReplay(env, { repo, pr_number, commit_sha })
  if (replay) {
    return invalid("replay detected")
  }

  return {
    code: 200,
    payload: {
      status: "VALID",
      result: "VALID"
    }
  }
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
  return ["ACTIVE", "VALIDATED", "RESERVED"].includes((authorityStatus || "").toUpperCase())
}

async function consumeAuthority(env: Env, decisionId: string) {
  await env.DB.prepare("UPDATE authority_registry SET status = ?1 WHERE decision_id = ?2")
    .bind("CONSUMED", decisionId)
    .run()
}

async function transitionAuthorityToValidatedIfActive(env: Env, decisionId: string) {
  await env.DB.prepare(
    "UPDATE authority_registry SET status = 'VALIDATED' WHERE decision_id = ?1 AND UPPER(status) = 'ACTIVE'"
  )
    .bind(decisionId)
    .run()
}

async function transitionAuthorityToReservedIfUsable(env: Env, decisionId: string) {
  const result = await env.DB.prepare(
    "UPDATE authority_registry SET status = 'RESERVED' WHERE decision_id = ?1 AND UPPER(status) IN ('ACTIVE','VALIDATED','RESERVED')"
  )
    .bind(decisionId)
    .run()
  return Number(result.meta?.changes || 0) > 0
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
      expiry,
      status,
      created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  )
    .bind(
      authority.authority_id,
      authority.decision_id,
      authority.owner,
      authority.intent,
      JSON.stringify(authority.scope),
      JSON.stringify(authority.constraints),
      authority.expiry,
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
  const required = ["authority_id", "decision_id", "owner", "intent", "scope", "constraints", "expiry", "status", "created_at"]
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
  const canonicalAeo = parseJsonObject(aeo?.canonical_aeo)
  const metadata = parseJsonObject(aeo?.metadata)
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
    .bind(
      metadata.aeo_id,
      metadata.authority_id,
      metadata.decision_id,
      canonicalAeo.intent,
      JSON.stringify(canonicalAeo),
      metadata.status,
      metadata.created_at || new Date().toISOString()
    )
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
  const workflow = canonicalWorkflowName(target.workflow)
  if (!workflow.endsWith(".yml") && !workflow.endsWith(".yaml")) {
    throw new Error("Invalid workflow target: must be workflow file name")
  }
  const dispatchUrl = `https://api.github.com/repos/${dispatchRepo}/actions/workflows/${workflow}/dispatches`

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
  body: { decision_id?: string; intent?: string; target?: any; validated_object_hash?: string; invocation_nonce?: string },
  options?: { simulateSuccess?: boolean }
) {
  if (!body.decision_id || !body.validated_object_hash || !body.invocation_nonce) {
    return {
      code: 400,
      payload: { status: "FAILED", result: "INVALID", error: "missing decision_id, validated_object_hash, or invocation_nonce" }
    }
  }


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

    if (!body.invocation_nonce) {
      return {
        code: 400,
        payload: { status: "FAILED", result: "INVALID", error: "missing invocation_nonce" }
      }
    }

    const invocation = await findInvocationAuthority(env, body.decision_id, body.validated_object_hash, body.invocation_nonce)
    if (!invocation) {
      return {
        code: 409,
        payload: { status: "FAILED", result: "INVALID", error: "nonce_mismatch" }
      }
    }
    if (String(invocation.status || "").toUpperCase() !== "RESERVED") {
      return {
        code: 409,
        payload: { status: "FAILED", result: "INVALID", error: "nonce_not_reserved_or_replayed" }
      }
    }

    const authorityTarget = targetFromAuthority(authority)
    if (canonicalWorkflowName(authorityTarget?.workflow) !== CANONICAL_GOVERNED_WORKFLOW || authorityTarget?.action !== "deploy_production") {
      return {
        code: 409,
        payload: { status: "FAILED", result: "INVALID", error: "wrong_workflow_or_action" }
      }
    }
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

    const claimed = await transitionInvocationReservedToExecuting(env, body.decision_id, body.validated_object_hash, body.invocation_nonce)
    if (!claimed) {
      return { code: 409, payload: { status: "FAILED", result: "INVALID", error: "nonce_not_reserved_or_replayed" } }
    }

    const execution = await executeGithubDeploy(
      env,
      authority,
      authorityTarget,
      options,
      body.validated_object_hash
    )

    if (execution.status === "EXECUTED") {
      const consumedNonce = await consumeInvocationAuthority(env, body.decision_id, body.validated_object_hash!, body.invocation_nonce)
      if (!consumedNonce) {
        return { code: 409, payload: { status: "FAILED", result: "INVALID", error: "replay_detected" } }
      }
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
            "Unsupported target. Only target.system='github_actions' with action='deploy_production' and fields repo, branch, workflow is allowed."
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
    const consumedNonce = await consumeInvocationAuthority(env, body.decision_id || execution.decision_id, validation.payload.validated_object_hash, body.invocation_nonce)
    if (!consumedNonce) {
      return { code: 409, payload: { status: "FAILED", result: "INVALID", error: "nonce_consume_failed" } }
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
  const executedObjectHash = validatedObjectHash

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
        ...(validatedObjectHash ? { validated_object_hash: validatedObjectHash, executed_object_hash: executedObjectHash } : {})
      },
    run_id: body.run_id,
    commit_sha: body.commit_sha,
    environment_url: body.environment_url || null,
    workflow: body.workflow || null,
    environment: body.environment || null,
    timestamp: new Date().toISOString(),
    status: "PROOF_RECORDED",
    result: execution.status,
    validated_object_hash: validatedObjectHash || null,
    executed_object_hash: executedObjectHash || null,
    execution_status: execution.status
  }
}

async function saveProof(env: Env, proof: any) {
  const normalizedProofReference: Record<string, unknown> =
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
          : {}),
        ...(normalizedProofReference.executed_object_hash
          ? { executed_object_hash: normalizedProofReference.executed_object_hash }
          : {}),
        result: proof.result,
        timestamp: proof.timestamp
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
    if (!body.signature_b64) {
      return {
        ok: false,
        code: 400,
        payload: {
          validation_id: validationId,
          decision_id: body.decision_id,
          status: "FAILED",
          result: "INVALID",
          error: "missing_signature",
          message: "missing signature_b64"
        }
      }
    }
    const signerPublicKeyPem = await resolveSignerPublicKeyPem(env, body)
    if (!signerPublicKeyPem) {
      return {
        ok: false,
        code: 500,
        payload: { validation_id: validationId, decision_id: body.decision_id, status: "FAILED", result: "INVALID", error: "unknown_signer", message: "signer public key is missing or unregistered" }
      }
    }
    if (body.canonical_deploy_aeo || body.canonical_object || body.canonical_payload) {
      const canonicalAeo = parseJsonObject(body.canonical_deploy_aeo || body.canonical_object || body.canonical_payload)
      const canonicalHash = await sha256Hex(canonicalizeJson(canonicalAeo))
      if (canonicalHash !== body.validated_object_hash) {
        return {
          ok: false,
          code: 409,
          payload: { validation_id: validationId, decision_id: body.decision_id, status: "FAILED", result: "INVALID", message: "canonical object hash mismatch", error: "hash_mismatch" }
        }
      }
    }

    const signatureValid = await verifyEd25519Signature(body.signature_b64, body.validated_object_hash, signerPublicKeyPem)
    if (!signatureValid) {
      return {
        ok: false,
        code: 409,
        payload: {
          validation_id: validationId,
          decision_id: body.decision_id,
          status: "FAILED",
          result: "INVALID",
          message: "invalid signature",
          error: "invalid_signature"
        }
      }
    }

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

    const constraints = ensureDeployConstraints(parseJsonObject(authority.constraints))
    const expectedScope = parseJsonObject(authority.scope)
    const scopeMatches =
      constraints.repo === `${env.GITHUB_OWNER}/${env.GITHUB_REPO}` &&
      constraints.branch === "main" &&
      constraints.workflow === CANONICAL_GOVERNED_WORKFLOW &&
      String(expectedScope.environment || "") === "production"
    if (!scopeMatches) {
      return {
        ok: false,
        code: 409,
        payload: { validation_id: validationId, decision_id: body.decision_id, status: "NULL", result: "INVALID", message: "scope mismatch" }
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
    if (existingValidation.authority_id !== authority.authority_id) {
      return {
        ok: false,
        code: 409,
        payload: { validation_id: validationId, decision_id: body.decision_id, status: "FAILED", result: "INVALID", error: "authority_mismatch", message: "validation record is not bound to this authority" }
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
        payload: { validation_id: validationId, decision_id: body.decision_id, status: "NULL", result: "INVALID", message: "replay detected" }
      }
    }

    const reserved = await env.DB.prepare(`UPDATE invocation_registry
      SET status = 'RESERVED'
      WHERE decision_id = ?1 AND validated_object_hash = ?2 AND invocation_nonce = ?3 AND UPPER(status) = 'ACTIVE'`)
      .bind(body.decision_id, body.validated_object_hash, body.invocation_nonce)
      .run()
    if (Number(reserved.meta?.changes || 0) <= 0) {
      return {
        ok: false,
        code: 409,
        payload: { validation_id: validationId, decision_id: body.decision_id, status: "NULL", result: "INVALID", message: "replay detected" }
      }
    }

    await transitionAuthorityToReservedIfUsable(env, body.decision_id)

    return {
      ok: true,
      code: 200,
      payload: {
        ...existingValidation,
        status: "VALID",
        result: "VALID",
        message: "Exact-object validation succeeded and invocation nonce reserved.",
        invocation_nonce: body.invocation_nonce
      },
      authority
    }
  }

  const aeo = buildAeo(authority, targetFromAuthority(authority) as GithubDeployTarget)
  await saveAeo(env, aeo)

  const validation = await buildValidation(aeo, authority)
  await saveValidation(env, validation)
  await transitionAuthorityToValidatedIfActive(env, body.decision_id)

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

function deriveValidateNullReason(payload?: { message?: string; error?: string }): string {
  const error = String(payload?.error || "").toLowerCase()
  const message = String(payload?.message || "").toLowerCase()
  const combined = `${error} ${message}`

  if (combined.includes("unknown_or_expired") || combined.includes("expired")) return "expired_authority"
  if (combined.includes("scope mismatch")) return "scope_mismatch"
  if (combined.includes("hash_mismatch") || combined.includes("hash mismatch")) return "hash_mismatch"
  if (combined.includes("replay")) return "replay_detected"
  if (combined.includes("nonce")) return "nonce_invalid"
  if (combined.includes("authority not found")) return "authority_not_found"
  if (combined.includes("not valid for execution") || combined.includes("authority already consumed")) return "authority_not_active"
  if (combined.includes("environment")) return "environment_mismatch"
  if (combined.includes("workflow")) return "workflow_mismatch"

  return "workflow_mismatch"
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
      workflow: CANONICAL_GOVERNED_WORKFLOW,
      max_executions: 1
    }
  })

  await saveAuthority(env, authority)
  const validation = await validateAuthority(env, { decision_id: authority.decision_id })
  if (!validation.ok) {
    return jsonResponse({ status: "FAILED", stage: "validate", details: validation.payload }, validation.code)
  }

  const invocationNonce = await createInvocationAuthority(env, authority.decision_id, validation.payload.validated_object_hash)
  await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: validation.payload.validated_object_hash, invocation_nonce: invocationNonce, environment: "production" })
  const executeResult = await runExecuteFlow(
    env,
    {
      decision_id: authority.decision_id,
      intent: authority.intent,
      validated_object_hash: validation.payload.validated_object_hash,
      invocation_nonce: invocationNonce
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
      workflow: CANONICAL_GOVERNED_WORKFLOW,
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
      const authFailure = requireApiKey(request, env)
      if (authFailure) return authFailure
      const results = await listAuthorities(env)
      return jsonResponse(results.results ?? [])
    }

    if (route("/records/executions") && request.method === "GET") {
      const authFailure = requireApiKey(request, env)
      if (authFailure) return authFailure
      const results = await listExecutions(env)
      return jsonResponse(results.results ?? [])
    }

    if (route("/records/proofs") && request.method === "GET") {
      const authFailure = requireApiKey(request, env)
      if (authFailure) return authFailure
      const results = await listProofs(env)
      return jsonResponse(results.results ?? [])
    }

    if (route("/webhook") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "FAILED", error: "Invalid JSON body" }, 400)
      }

      return jsonResponse({ status: "FAILED", error: "webhook_deploy_disabled" }, 403)
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
            workflow: normalizeWorkflowName(target.workflow || CANONICAL_GOVERNED_WORKFLOW),
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
        return jsonResponse({
          decision_id: authority.decision_id,
          owner: authority.owner,
          intent: authority.intent,
          scope: authority.scope,
          constraints: authority.constraints,
          expiry: authority.expiry,
          status: authority.status,
          created_at: authority.created_at
        })
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
          decision_id: authority.decision_id,
          owner: authority.owner,
          intent: authority.intent,
          scope: authority.scope,
          constraints: authority.constraints,
          expiry: authority.expiry,
          status: authority.status,
          created_at: authority.created_at
        })
      }
      

    if (route("/compile") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "NULL", reason: "workflow_mismatch", result: "NULL", error: "Missing request body" }, 400)
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
          compilation_id: aeo.metadata.aeo_id,
          compiled_object: aeo.canonical_aeo
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
      const exactAeo = aeo.canonical_aeo
      const compiledHash = await sha256Hex(canonicalizeJson(exactAeo))
      return jsonResponse({ aeo: exactAeo, metadata: aeo.metadata, validated_object_hash: compiledHash })
    }


    if (route("/validate-pr") && request.method === "POST") {
      const body = await readJson(request)
      if (!body || !isObject(body)) {
        return jsonResponse({ status: "FAILED", result: "INVALID", message: "invalid JSON body" }, 400)
      }
      const result = await validatePrAgainstAuthority(env, body)
      return jsonResponse(result.payload, result.code)
    }

    if (route("/validate") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "NULL", reason: "workflow_mismatch", result: "NULL", error: "Missing request body" }, 400)
      }

      if (body.compilation_id) {
        const compiled = await findAeoById(env, body.compilation_id)
        if (!compiled) {
          return jsonResponse({ status: "FAILED", error: "Unknown compilation_id" }, 404)
        }

        const compiledAeo = parseJsonObject(compiled.aeo)
        const validation = await buildValidation({
          canonical_aeo: compiledAeo,
          metadata: {
            aeo_id: compiled.aeo_id,
            authority_id: compiled.authority_id,
            decision_id: compiled.decision_id,
            status: compiled.status,
            created_at: compiled.created_at
          }
        }, await findAuthorityById(env, compiled.authority_id))
        await saveValidation(env, validation)

        return jsonResponse({
          status: validation.result === "VALID" ? "VALID" : "NULL",
          ...(validation.result === "VALID" ? {} : { reason: "workflow_mismatch" }),
          result: validation.result,
          validation_id: validation.validation_id,
          decision_id: validation.decision_id,
          intent: validation.intent,
          validated_object: compiledAeo,
          validated_object_hash: validation.validated_object_hash
        }, validation.result === "VALID" ? 200 : 409)
      }

      const requiredAeoKeys = ["intent", "scope", "validation", "target", "finality"]
      if (body.aeo && isObject(body.aeo)) {
        const keys = Object.keys(body.aeo)
        const hasExact = requiredAeoKeys.every((key) => keys.includes(key)) && keys.length === requiredAeoKeys.length
        if (!hasExact) return jsonResponse({ status: "NULL", reason: "workflow_mismatch" })
      }
      const result = await validateAuthority(env, body)
      if (result.payload?.status === "VALID" || result.payload?.result === "VALID") {
        return jsonResponse({ status: "VALID" })
      }
      return jsonResponse({ status: "NULL", reason: deriveValidateNullReason(result.payload) })
    }

    if (route("/execute") && request.method === "POST") {
      const body = await readJson(request)
      if (!body) {
        return jsonResponse({ status: "NULL", result: "NOT_EXECUTED", error: "Missing request body" }, 400)
      }

      if (body.validation_id || body.webhook_url) {
        return jsonResponse({ status: "FAILED", result: "INVALID", error: "webhook_execution_disabled" }, 403)
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
      const authFailure = requireApiKey(request, env)
      if (authFailure) return authFailure
      return runReplayTest(env)
    }

    if (route("/github-proof-test") && request.method === "GET") {
      const authFailure = requireApiKey(request, env)
      if (authFailure) return authFailure
      return runGithubProofTest(env)
    }
    if (route("/nonce-validation-test") && request.method === "GET") {
      const authFailure = requireApiKey(request, env)
      if (authFailure) return authFailure
      const authority = buildAuthority({ owner: "nonce_test", constraints: { repo: "local/repo", branch: "main", workflow: "governed-deploy.yml", max_executions: 1 } })
      await saveAuthority(env, authority)
      const aeo = buildAeo(authority, targetFromAuthority(authority) as GithubDeployTarget)
      await saveAeo(env, aeo)
      const canonicalAeo = canonicalizeJson(aeo)
      const hash = await sha256Hex(canonicalAeo)
      const nonce = await ensureInvocationAuthority(env, authority.decision_id, hash)
      await saveValidation(env, await buildValidation(aeo, authority))
      const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair
      const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", keyPair.privateKey, new TextEncoder().encode(hash)))
      const publicSpki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey) as ArrayBuffer)
      const signer_public_key = bytesToPem(publicSpki, "PUBLIC KEY")
      const signature_b64 = btoa(String.fromCharCode(...signature))
      const missing = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, invocation_nonce: nonce, environment: "production" })
      const wrongSig = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, canonical_object: aeo, invocation_nonce: nonce, environment: "production", signature_b64: `${signature_b64}A`, signer_public_key })
      const tamperedCanonical = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, canonical_object: { ...aeo, intent: "tampered" }, invocation_nonce: nonce, environment: "production", signature_b64, signer_public_key })
      const wrongHash = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: "badbad", canonical_object: aeo, invocation_nonce: nonce, environment: "production", signature_b64, signer_public_key })
      const wrong = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, canonical_object: aeo, invocation_nonce: "bad", environment: "production", signature_b64, signer_public_key })
      const good = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, canonical_object: aeo, invocation_nonce: nonce, environment: "production", signature_b64, signer_public_key })
      const replayValidation = await validateAuthority(env, { decision_id: authority.decision_id, validated_object_hash: hash, canonical_object: aeo, invocation_nonce: nonce, environment: "production", signature_b64, signer_public_key })
      const authorityAfterValidate = await findAuthorityByDecisionId(env, authority.decision_id)
      const executeNoValidate = await runExecuteFlow(env, { decision_id: authority.decision_id, intent: authority.intent, validated_object_hash: hash, invocation_nonce: "bad" }, { simulateSuccess: true })
      const executeGood = await runExecuteFlow(env, { decision_id: authority.decision_id, intent: authority.intent, validated_object_hash: hash, invocation_nonce: nonce }, { simulateSuccess: true })
      const replayExecute = await runExecuteFlow(env, { decision_id: authority.decision_id, intent: authority.intent, validated_object_hash: hash, invocation_nonce: nonce }, { simulateSuccess: true })
      const wrongHashExecute = await runExecuteFlow(env, { decision_id: authority.decision_id, intent: authority.intent, validated_object_hash: "deadbeef", invocation_nonce: nonce }, { simulateSuccess: true })
      const missingAuthority = await validateAuthority(env, { decision_id: crypto.randomUUID(), validated_object_hash: hash, canonical_object: aeo, invocation_nonce: nonce, environment: "production", signature_b64, signer_public_key })
      return jsonResponse({
        validate_missing_signature: missing.payload,
        validate_tampered_signature: wrongSig.payload,
        validate_tampered_canonical_object: tamperedCanonical.payload,
        validate_wrong_hash: wrongHash.payload,
        validate_wrong_nonce: wrong.payload,
        validate_good: good.payload,
        validate_replayed_nonce: replayValidation.payload,
        validate_missing_authority: missingAuthority.payload,
        authority_status_after_validate: authorityAfterValidate?.status || null,
        execute_without_prior_valid_reservation_blocked: executeNoValidate.payload,
        execute_after_validate: executeGood.payload,
        replay_execute_blocked: replayExecute.payload,
        wrong_hash_blocked: wrongHashExecute.payload,
        proof_without_execution_blocked_hint: "Use POST /proof with unknown execution_id and expect 404"
      })
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

      return jsonResponse({
        status: "VALID",
        proof_id: proof.proof_id,
        execution_id: proof.execution_id,
        decision_id: proof.decision_id,
        validated_object_hash: parseJsonObject(proof.proof_reference).validated_object_hash,
        executed_object_hash: parseJsonObject(proof.proof_reference).executed_object_hash || parseJsonObject(proof.proof_reference).validated_object_hash,
        run_id: proof.run_id,
        commit_sha: proof.commit_sha,
        result: proof.result,
        timestamp: proof.timestamp
      })
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
