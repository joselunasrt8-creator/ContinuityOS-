import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function runSqlite(args, options = {}) {
  const result = spawnSync('sqlite3', args, { encoding: 'utf8', ...options })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}

function applyMigrationChain(dbPath) {
  const migrations = readdirSync(new URL('../migrations', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const migration of migrations) {
    const path = new URL(`../migrations/${migration}`, import.meta.url)
    const result = spawnSync('sqlite3', [dbPath], {
      encoding: 'utf8',
      input: readFileSync(path, 'utf8')
    })
    assert.equal(result.status, 0, `${migration}: ${result.stderr || result.stdout}`)
  }
}

function tableInfo(dbPath, table) {
  return JSON.parse(runSqlite(['-json', dbPath, `PRAGMA table_info(${table});`]))
}

function indexList(dbPath, table) {
  return JSON.parse(runSqlite(['-json', dbPath, `PRAGMA index_list(${table});`]))
}

function indexInfo(dbPath, index) {
  return JSON.parse(runSqlite(['-json', dbPath, `PRAGMA index_info(${index});`]))
}

function columns(dbPath, table) {
  return tableInfo(dbPath, table).map((column) => column.name)
}

function notNullColumns(dbPath, table) {
  return tableInfo(dbPath, table)
    .filter((column) => column.notnull === 1)
    .map((column) => column.name)
}

function assertColumns(dbPath, table, expected) {
  assert.deepEqual(columns(dbPath, table), expected, `${table} columns must match canonical runtime shape`)
}

function assertNotNull(dbPath, table, expected) {
  assert.deepEqual(notNullColumns(dbPath, table), expected, `${table} NOT NULL columns must match canonical runtime shape`)
}

function assertIndex(dbPath, table, indexName, expectedColumns, unique = false) {
  const indexes = indexList(dbPath, table)
  const index = indexes.find((entry) => entry.name === indexName)
  assert.ok(index, `${table} must have index ${indexName}`)
  assert.equal(Boolean(index.unique), unique, `${indexName} unique flag must be ${unique}`)
  assert.deepEqual(indexInfo(dbPath, indexName).map((entry) => entry.name), expectedColumns)
}

test('migration chain reproduces canonical runtime registry schemas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-lineage-'))
  const dbPath = join(dir, 'lineage.sqlite')

  try {
    applyMigrationChain(dbPath)

    assertColumns(dbPath, 'session_registry', ['session_id', 'identity_id', 'owner', 'trust_tier', 'continuity_status', 'created_at', 'expires_at'])
    assertNotNull(dbPath, 'session_registry', ['identity_id', 'owner', 'trust_tier', 'continuity_status', 'created_at', 'expires_at'])
    assertIndex(dbPath, 'session_registry', 'idx_session_registry_status_expiry', ['continuity_status', 'expires_at'])

    assertColumns(dbPath, 'authority_registry', ['authority_id', 'decision_id', 'session_id', 'owner', 'intent', 'scope', 'constraints', 'expiry', 'status', 'created_at', 'continuity_id', 'identity_id'])
    assertNotNull(dbPath, 'authority_registry', ['decision_id', 'session_id', 'owner', 'intent', 'scope', 'constraints', 'expiry', 'status', 'created_at'])
    assert.ok(indexList(dbPath, 'authority_registry').some((index) => index.unique === 1 && index.origin === 'u'), 'authority_registry must retain UNIQUE(decision_id) lifecycle guard')

    assertColumns(dbPath, 'aeo_registry', ['aeo_id', 'authority_id', 'decision_id', 'canonical_aeo', 'validated_object_hash', 'status', 'created_at', 'continuity_id'])
    assertNotNull(dbPath, 'aeo_registry', ['authority_id', 'decision_id', 'canonical_aeo', 'validated_object_hash', 'status', 'created_at'])
    assertIndex(dbPath, 'aeo_registry', 'idx_aeo_registry_decision_hash', ['decision_id', 'validated_object_hash'])

    assertColumns(dbPath, 'preo_registry', ['preo_id', 'decision_id', 'authority_id', 'continuity_id', 'reviewed_hash', 'canonical_preo', 'status', 'created_at', 'reviewed_tree_hash', 'merge_commit_sha'])
    assertNotNull(dbPath, 'preo_registry', ['decision_id', 'authority_id', 'continuity_id', 'reviewed_hash', 'canonical_preo', 'status', 'created_at'])
    assertIndex(dbPath, 'preo_registry', 'idx_preo_registry_decision_hash', ['decision_id', 'reviewed_hash'])

    assertColumns(dbPath, 'validation_registry', ['validation_id', 'session_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'environment', 'result', 'reason', 'status', 'created_at', 'continuity_id'])
    assertNotNull(dbPath, 'validation_registry', ['session_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'result', 'status', 'created_at'])
    assertIndex(dbPath, 'validation_registry', 'idx_validation_registry_decision_hash_nonce', ['decision_id', 'validated_object_hash', 'invocation_nonce'])

    assertColumns(dbPath, 'execution_registry', ['execution_id', 'session_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at', 'continuity_id', 'repository', 'branch', 'pull_request_id', 'merge_commit_sha', 'source_tree_hash', 'workflow_run_id', 'workflow_sha'])
    assertNotNull(dbPath, 'execution_registry', ['session_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
    assertIndex(dbPath, 'execution_registry', 'idx_execution_registry_decision_hash', ['decision_id', 'validated_object_hash'])
    assert.ok(indexList(dbPath, 'execution_registry').some((index) => index.unique === 1 && index.origin === 'u'), 'execution_registry must retain UNIQUE(decision_id, validated_object_hash) replay guard')

    assertColumns(dbPath, 'proof_registry', ['proof_id', 'session_id', 'execution_id', 'decision_id', 'validated_object_hash', 'surface', 'run_id', 'commit_sha', 'workflow', 'environment', 'created_at', 'continuity_id', 'continuity_hash', 'identity_id', 'authority_lineage', 'execution_lineage', 'repository', 'branch', 'pull_request_id', 'merge_commit_sha', 'source_tree_hash', 'workflow_run_id', 'workflow_sha'])
    assertNotNull(dbPath, 'proof_registry', ['session_id', 'execution_id', 'decision_id', 'validated_object_hash', 'created_at'])
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_execution_decision_hash', ['execution_id', 'decision_id', 'validated_object_hash'])
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_decision_hash_unique', ['decision_id', 'validated_object_hash'], true)
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_workflow_run_unique', ['workflow_run_id'], true)
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_provenance', ['repository', 'branch', 'pull_request_id', 'merge_commit_sha', 'workflow_run_id'])

    assertColumns(dbPath, 'proof_registry_duplicate_archive', ['archive_id', 'proof_id', 'session_id', 'execution_id', 'decision_id', 'validated_object_hash', 'surface', 'run_id', 'commit_sha', 'workflow', 'environment', 'created_at', 'archived_at', 'archive_reason', 'canonical_proof_id'])
    assertNotNull(dbPath, 'proof_registry_duplicate_archive', ['proof_id', 'session_id', 'execution_id', 'decision_id', 'validated_object_hash', 'created_at', 'archived_at', 'archive_reason', 'canonical_proof_id'])

    assertColumns(dbPath, 'invocation_registry', ['decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at', 'continuity_id'])
    assertNotNull(dbPath, 'invocation_registry', ['decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
    assert.ok(indexList(dbPath, 'invocation_registry').some((index) => index.unique === 1 && index.origin === 'pk'), 'invocation_registry must use canonical triple primary key')

    assertColumns(dbPath, 'observability_registry', ['event_id', 'event_type', 'decision_id', 'authority_id', 'execution_id', 'proof_id', 'severity', 'payload', 'created_at'])
    assertNotNull(dbPath, 'observability_registry', ['event_type', 'severity', 'payload', 'created_at'])
    assertIndex(dbPath, 'observability_registry', 'idx_observability_decision', ['decision_id'])
    assertIndex(dbPath, 'observability_registry', 'idx_observability_execution', ['execution_id'])
    assertIndex(dbPath, 'observability_registry', 'idx_observability_type', ['event_type'])

    assertColumns(dbPath, 'drift_registry', ['drift_id', 'drift_class', 'severity', 'decision_id', 'execution_id', 'payload', 'detected_by', 'resolution_status', 'created_at'])
    assertNotNull(dbPath, 'drift_registry', ['drift_class', 'severity', 'payload', 'detected_by', 'resolution_status', 'created_at'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  return `'${String(value).replaceAll("'", "''")}'`
}

class SqliteD1Database {
  constructor(dbPath) {
    this.dbPath = dbPath
  }

  prepare(sql) {
    const dbPath = this.dbPath
    const statement = {
      values: [],
      bind(...values) {
        this.values = values
        return this
      },
      materialized() {
        return sql.replace(/\?(\d+)/g, (_match, index) => sqlLiteral(this.values[Number(index) - 1]))
      },
      run() {
        const output = runSqlite(['-json', dbPath, `${this.materialized()}; SELECT changes() AS changes;`])
        const rows = JSON.parse(output || '[]')
        return Promise.resolve({ meta: { changes: rows.at(-1)?.changes ?? 0 } })
      },
      all() {
        const output = runSqlite(['-json', dbPath, this.materialized()])
        return Promise.resolve({ results: JSON.parse(output || '[]') })
      },
      first() {
        const output = runSqlite(['-json', dbPath, this.materialized()])
        const rows = JSON.parse(output || '[]')
        return Promise.resolve(rows[0] || null)
      }
    }
    return statement
  }

  batch(statements) {
    const input = [
      '.bail on',
      'BEGIN IMMEDIATE;',
      ...statements.flatMap((statement) => {
        const sql = statement.materialized()
        if (/^\s*select\b/i.test(sql)) return [`${sql};`]
        return [`${sql};`, 'SELECT changes() AS changes;']
      }),
      'COMMIT;'
    ].join('\n')
    const result = spawnSync('sqlite3', ['-json', this.dbPath], { encoding: 'utf8', input })
    if (result.status !== 0) return Promise.reject(new Error(result.stderr || result.stdout))
    const outputs = result.stdout.trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line))
    let outputIndex = 0
    const results = statements.map((statement) => {
      if (/^\s*select\b/i.test(statement.materialized())) {
        return { results: outputs[outputIndex++] || [], meta: { changes: 0 } }
      }
      const changes = outputs[outputIndex++]?.[0]?.changes ?? 0
      return { results: [], meta: { changes } }
    })
    return Promise.resolve(results)
  }
}


function provenanceFor(decision_id, overrides = {}) {
  return {
    repository: 'example/repo',
    branch: 'main',
    pull_request_id: `pr-${decision_id}`,
    merge_commit_sha: `merge-${decision_id}`,
    source_tree_hash: `tree-${decision_id}`,
    workflow_run_id: `run-${decision_id}`,
    workflow_sha: `merge-${decision_id}`,
    ...overrides
  }
}

async function persistPreo(post, decision_id, validated_object_hash, provenance) {
  const preo = await post('/preo', {
    decision_id,
    reviewed_hash: validated_object_hash,
    reviewed_tree_hash: provenance.source_tree_hash,
    merge_commit_sha: provenance.merge_commit_sha,
    pull_request_id: provenance.pull_request_id
  })
  assert.equal(preo.status, 'PREO_VALID')
  return preo
}

test('runtime lifecycle persists against migration-built canonical registries', async () => {
  const { transformSync } = await import('esbuild')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-runtime-lineage-'))
  const dbPath = join(dir, 'runtime.sqlite')
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }
  const headers = { 'X-API-Key': 'test-key', 'content-type': 'application/json' }
  const decision_id = 'decision-runtime-lineage'

  async function post(path, payload) {
    const response = await worker.fetch(new Request(`https://runtime.test${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }), env)
    assert.equal(response.status, 200)
    return response.json()
  }

  try {
    applyMigrationChain(dbPath)

    const session = await post('/session', { identity_id: 'lineage-identity' })
    assert.equal(session.status, 'SESSION_ACTIVE')
    const continuity = await post('/continuity', { session_id: session.session_id, authority_chain: [decision_id] })

    const authority = await post('/authority', {
      continuity_id: continuity.continuity_id,
      session_id: session.session_id,
      decision_id,
      owner: 'lineage-test',
      intent: 'deploy_production',
      scope: { repo: 'example/repo', branch: 'main' },
      constraints: { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml' }
    })
    assert.equal(authority.status, 'ACTIVE')

    const compiled = await post('/compile', { decision_id })
    assert.equal(compiled.status, 'COMPILED')
    assert.ok(compiled.validated_object_hash)

    const provenance = provenanceFor(decision_id)
    await persistPreo(post, decision_id, compiled.validated_object_hash, provenance)

    const invocation_nonce = 'nonce-runtime-lineage'
    const validation = await post('/validate', {
      decision_id,
      validated_object_hash: compiled.validated_object_hash,
      invocation_nonce,
      environment: 'production',
      session_id: session.session_id
    })
    assert.equal(validation.status, 'VALID')

    const execution = await post('/execute', {
      decision_id,
      validated_object_hash: compiled.validated_object_hash,
      invocation_nonce,
      session_id: session.session_id,
      ...provenance
    })
    assert.equal(execution.status, 'EXECUTED')
    assert.ok(execution.execution_id)
    assert.deepEqual(Object.keys(execution).sort(), ['execution_id', 'session_id', 'status'])

    const proof = await post('/proof', {
      execution_id: execution.execution_id,
      decision_id,
      validated_object_hash: compiled.validated_object_hash,
      surface: 'github-actions',
      run_id: provenance.workflow_run_id,
      commit_sha: provenance.workflow_sha,
      workflow: 'governed-deploy.yml',
      environment: 'production',
      session_id: session.session_id,
      ...provenance
    })
    assert.equal(proof.status, 'PROVEN')
    assert.ok(proof.proof_id)
    assert.equal(proof.proof?.validated_object_hash, compiled.validated_object_hash)

    assert.equal(runSqlite([dbPath, `SELECT session_id FROM authority_registry WHERE decision_id='${decision_id}'`]).trim(), session.session_id)
    assert.equal(runSqlite([dbPath, `SELECT session_id FROM validation_registry WHERE decision_id='${decision_id}'`]).trim(), session.session_id)
    assert.equal(runSqlite([dbPath, `SELECT validated_object_hash FROM validation_registry WHERE decision_id='${decision_id}'`]).trim(), compiled.validated_object_hash)
    assert.equal(runSqlite([dbPath, `SELECT session_id FROM execution_registry WHERE decision_id='${decision_id}'`]).trim(), session.session_id)
    assert.equal(runSqlite([dbPath, `SELECT invocation_nonce FROM execution_registry WHERE decision_id='${decision_id}'`]).trim(), invocation_nonce)
    assert.equal(runSqlite([dbPath, `SELECT status FROM execution_registry WHERE decision_id='${decision_id}'`]).trim(), 'EXECUTED')
    assert.equal(runSqlite([dbPath, `SELECT session_id FROM proof_registry WHERE decision_id='${decision_id}'`]).trim(), session.session_id)
    assert.equal(runSqlite([dbPath, `SELECT environment FROM proof_registry WHERE decision_id='${decision_id}'`]).trim(), 'production')
    assert.equal(runSqlite([dbPath, `SELECT status FROM authority_registry WHERE decision_id='${decision_id}'`]).trim(), 'CONSUMED')
    const eventTypes = runSqlite([dbPath, `SELECT event_type FROM observability_registry WHERE decision_id='${decision_id}' ORDER BY created_at, rowid`]).trim().split('\n')
    assert.deepEqual(eventTypes, ['AUTHORITY_CREATED', 'AEO_COMPILED', 'VALIDATION_GRANTED', 'VALIDATION_GRANTED', 'EXECUTION_STARTED', 'EXECUTION_COMPLETED', 'PROOF_PERSISTED', 'AUTHORITY_CONSUMED'])
    assert.equal(runSqlite([dbPath, `SELECT COUNT(*) FROM observability_registry WHERE decision_id='${decision_id}' AND execution_id='${execution.execution_id}'`]).trim(), '3')
    assert.match(runSqlite([dbPath, `SELECT payload FROM observability_registry WHERE decision_id='${decision_id}' AND event_type='VALIDATION_GRANTED'`]), /"authority_status":"RESERVED"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('runtime telemetry records replay, hash mismatch, proof, and bypass drift', async () => {
  const { transformSync } = await import('esbuild')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-observability-'))
  const dbPath = join(dir, 'observability.sqlite')
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }
  const headers = { 'X-API-Key': 'test-key', 'content-type': 'application/json' }

  async function post(path, payload) {
    const response = await worker.fetch(new Request(`https://runtime.test${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }), env)
    assert.equal(response.status, 200)
    return response.json()
  }

  async function prepareDecision(decision_id, nonce) {
    const session = await post('/session', { identity_id: `${decision_id}-identity` })
    const continuity = await post('/continuity', { session_id: session.session_id, authority_chain: [decision_id] })
    await post('/authority', {
      continuity_id: continuity.continuity_id,
      session_id: session.session_id,
      decision_id,
      owner: 'observability-test',
      intent: 'deploy_production',
      scope: { repo: 'example/repo', branch: 'main' },
      constraints: { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml' }
    })
    const compiled = await post('/compile', { decision_id })
    const provenance = provenanceFor(decision_id)
    await persistPreo(post, decision_id, compiled.validated_object_hash, provenance)
    const validation = await post('/validate', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: nonce, environment: 'production' })
    assert.equal(validation.status, 'VALID')
    return { ...compiled, session_id: session.session_id, provenance }
  }

  try {
    applyMigrationChain(dbPath)

    const replayDecision = 'decision-replay-telemetry'
    const replayCompiled = await prepareDecision(replayDecision, 'nonce-replay')
    const replay = await post('/validate', { session_id: replayCompiled.session_id, decision_id: replayDecision, validated_object_hash: replayCompiled.validated_object_hash, invocation_nonce: 'nonce-replay', environment: 'production' })
    assert.equal(replay.reason, 'nonce_used')
    assert.equal(runSqlite([dbPath, `SELECT event_type FROM observability_registry WHERE decision_id='${replayDecision}' AND event_type='REPLAY_BLOCKED'`]).trim(), 'REPLAY_BLOCKED')
    assert.equal(runSqlite([dbPath, `SELECT drift_class FROM drift_registry WHERE decision_id='${replayDecision}'`]).trim(), 'replay_drift')

    const hashDecision = 'decision-hash-telemetry'
    const hashCompiled = await prepareDecision(hashDecision, 'nonce-hash')
    runSqlite([dbPath, `UPDATE aeo_registry SET canonical_aeo='{}' WHERE decision_id='${hashDecision}'`])
    const hashExecution = await post('/execute', { session_id: hashCompiled.session_id, decision_id: hashDecision, validated_object_hash: hashCompiled.validated_object_hash, invocation_nonce: 'nonce-hash', ...hashCompiled.provenance })
    assert.equal(hashExecution.reason, 'hash_mismatch')
    assert.equal(runSqlite([dbPath, `SELECT event_type FROM observability_registry WHERE decision_id='${hashDecision}' AND event_type='HASH_MISMATCH'`]).trim(), 'HASH_MISMATCH')
    assert.equal(runSqlite([dbPath, `SELECT drift_class FROM drift_registry WHERE decision_id='${hashDecision}'`]).trim(), 'hash_drift')

    const proofDecision = 'decision-proof-telemetry'
    const proofCompiled = await prepareDecision(proofDecision, 'nonce-proof')
    const execution = await post('/execute', { session_id: proofCompiled.session_id, decision_id: proofDecision, validated_object_hash: proofCompiled.validated_object_hash, invocation_nonce: 'nonce-proof', ...proofCompiled.provenance })
    const proof = await post('/proof', { session_id: proofCompiled.session_id, execution_id: execution.execution_id, decision_id: proofDecision, validated_object_hash: proofCompiled.validated_object_hash, workflow: 'governed-deploy.yml', ...proofCompiled.provenance })
    assert.equal(proof.status, 'PROVEN')
    assert.deepEqual(runSqlite([dbPath, `SELECT event_type FROM observability_registry WHERE decision_id='${proofDecision}' AND event_type IN ('PROOF_PERSISTED','AUTHORITY_CONSUMED') ORDER BY created_at, rowid`]).trim().split('\n'), ['PROOF_PERSISTED', 'AUTHORITY_CONSUMED'])

    const bypass = await worker.fetch(new Request('https://runtime.test/unmanaged-deploy', { method: 'POST', body: '{}' }), env)
    assert.equal(bypass.status, 404)
    assert.equal(runSqlite([dbPath, `SELECT drift_class FROM drift_registry WHERE payload LIKE '%invalid_route_invocation%'`]).trim(), 'registry_drift')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('compile and validate share canonical deploy target coercion semantics', async () => {
  const { transformSync } = await import('esbuild')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-target-coercion-'))
  const dbPath = join(dir, 'coercion.sqlite')
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }
  const headers = { 'X-API-Key': 'test-key', 'content-type': 'application/json' }
  const decision_id = 'decision-target-coercion'

  async function post(path, payload) {
    const response = await worker.fetch(new Request(`https://runtime.test${path}`, { method: 'POST', headers, body: JSON.stringify(payload) }), env)
    assert.equal(response.status, 200)
    return response.json()
  }

  try {
    applyMigrationChain(dbPath)
    const session = await post('/session', { identity_id: 'target-coercion-identity' })
    const continuity = await post('/continuity', { session_id: session.session_id, authority_chain: [decision_id] })
    await post('/authority', {
      continuity_id: continuity.continuity_id,
      session_id: session.session_id,
      decision_id,
      owner: 'target-coercion-test',
      scope: { repo: 12345, branch: 67890 },
      constraints: { repo: 12345, branch: 67890, workflow: 'governed-deploy.yml' }
    })

    const compiled = await post('/compile', { decision_id })
    assert.equal(compiled.status, 'COMPILED')
    assert.deepEqual(compiled.canonical_aeo.target, { repo: '12345', branch: '67890', workflow: 'governed-deploy.yml' })

    const validation = await post('/validate', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-target-coercion', environment: 'production' })
    assert.equal(validation.status, 'VALID')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compile rejects non-governed workflows before persisting canonical AEOs', async () => {
  const { transformSync } = await import('esbuild')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-workflow-rejection-'))
  const dbPath = join(dir, 'workflow.sqlite')
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }
  const headers = { 'X-API-Key': 'test-key', 'content-type': 'application/json' }
  const decision_id = 'decision-workflow-rejection'

  async function post(path, payload) {
    const response = await worker.fetch(new Request(`https://runtime.test${path}`, { method: 'POST', headers, body: JSON.stringify(payload) }), env)
    assert.equal(response.status, 200)
    return response.json()
  }

  try {
    applyMigrationChain(dbPath)
    const session = await post('/session', { identity_id: 'workflow-rejection-identity' })
    const continuity = await post('/continuity', { session_id: session.session_id, authority_chain: [decision_id] })
    await post('/authority', {
      continuity_id: continuity.continuity_id,
      session_id: session.session_id,
      decision_id,
      owner: 'workflow-rejection-test',
      scope: { repo: 'example/repo', branch: 'main' },
      constraints: { repo: 'example/repo', branch: 'main', workflow: 'unmanaged-deploy.yml' }
    })

    const compiled = await post('/compile', { decision_id })
    assert.equal(compiled.status, 'NULL')
    assert.equal(compiled.reason, 'workflow_mismatch')
    assert.equal(runSqlite([dbPath, `SELECT COUNT(*) FROM aeo_registry WHERE decision_id='${decision_id}'`]).trim(), '0')
    assert.equal(runSqlite([dbPath, `SELECT event_type FROM observability_registry WHERE decision_id='${decision_id}' AND event_type='VALIDATION_REJECTED'`]).trim(), 'VALIDATION_REJECTED')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('proof transaction rolls back proof persistence when authority consumption fails', async () => {
  const { transformSync } = await import('esbuild')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-proof-rollback-'))
  const dbPath = join(dir, 'rollback.sqlite')
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }
  const headers = { 'X-API-Key': 'test-key', 'content-type': 'application/json' }
  const decision_id = 'decision-proof-rollback'

  async function post(path, payload) {
    const response = await worker.fetch(new Request(`https://runtime.test${path}`, { method: 'POST', headers, body: JSON.stringify(payload) }), env)
    assert.equal(response.status, 200)
    return response.json()
  }

  try {
    applyMigrationChain(dbPath)
    const session = await post('/session', { identity_id: 'rollback-identity' })
    const continuity = await post('/continuity', { session_id: session.session_id, authority_chain: [decision_id] })
    await post('/authority', {
      continuity_id: continuity.continuity_id, session_id: session.session_id, decision_id, owner: 'rollback-test', constraints: { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml' } })
    const compiled = await post('/compile', { decision_id })
    const provenance = provenanceFor(decision_id)
    await persistPreo(post, decision_id, compiled.validated_object_hash, provenance)
    await post('/validate', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-rollback', environment: 'production' })
    const execution = await post('/execute', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-rollback', ...provenance })
    runSqlite([dbPath, `CREATE TRIGGER block_authority_consume BEFORE UPDATE OF status ON authority_registry WHEN NEW.status='CONSUMED' AND OLD.decision_id='${decision_id}' BEGIN SELECT RAISE(ABORT, 'consume blocked'); END;`])

    const proof = await post('/proof', { session_id: session.session_id, execution_id: execution.execution_id, decision_id, validated_object_hash: compiled.validated_object_hash, workflow: 'governed-deploy.yml', ...provenance })

    assert.equal(proof.status, 'NULL')
    assert.equal(runSqlite([dbPath, `SELECT COUNT(*) FROM proof_registry WHERE decision_id='${decision_id}'`]).trim(), '0')
    assert.equal(runSqlite([dbPath, `SELECT status FROM authority_registry WHERE decision_id='${decision_id}'`]).trim(), 'EXECUTED')
    assert.equal(runSqlite([dbPath, `SELECT event_type FROM observability_registry WHERE decision_id='${decision_id}' AND event_type='REPLAY_BLOCKED'`]).trim(), 'REPLAY_BLOCKED')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('duplicate and concurrent proof attempts fail closed without duplicate proof rows', async () => {
  const { transformSync } = await import('esbuild')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-proof-duplicates-'))
  const dbPath = join(dir, 'duplicates.sqlite')
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }
  const headers = { 'X-API-Key': 'test-key', 'content-type': 'application/json' }
  const decision_id = 'decision-proof-duplicates'

  async function post(path, payload) {
    const response = await worker.fetch(new Request(`https://runtime.test${path}`, { method: 'POST', headers, body: JSON.stringify(payload) }), env)
    assert.equal(response.status, 200)
    return response.json()
  }

  try {
    applyMigrationChain(dbPath)
    const session = await post('/session', { identity_id: 'duplicates-identity' })
    const continuity = await post('/continuity', { session_id: session.session_id, authority_chain: [decision_id] })
    await post('/authority', {
      continuity_id: continuity.continuity_id, session_id: session.session_id, decision_id, owner: 'duplicates-test', constraints: { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml' } })
    const compiled = await post('/compile', { decision_id })
    const provenance = provenanceFor(decision_id)
    await persistPreo(post, decision_id, compiled.validated_object_hash, provenance)
    await post('/validate', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-duplicates', environment: 'production' })
    const execution = await post('/execute', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-duplicates', ...provenance })
    const payload = { session_id: session.session_id, execution_id: execution.execution_id, decision_id, validated_object_hash: compiled.validated_object_hash, workflow: 'governed-deploy.yml', ...provenance }

    const attempts = await Promise.all([post('/proof', payload), post('/proof', payload)])
    assert.equal(attempts.filter((attempt) => attempt.status === 'PROVEN').length, 1)
    assert.equal(attempts.filter((attempt) => attempt.status === 'NULL').length, 1)
    assert.equal(runSqlite([dbPath, `SELECT COUNT(*) FROM proof_registry WHERE decision_id='${decision_id}'`]).trim(), '1')
    assert.equal(runSqlite([dbPath, `SELECT status FROM authority_registry WHERE decision_id='${decision_id}'`]).trim(), 'CONSUMED')

    const replay = await post('/proof', payload)
    assert.equal(replay.status, 'NULL')
    assert.equal(replay.reason, 'authority_not_executed')
    assert.equal(runSqlite([dbPath, `SELECT COUNT(*) FROM proof_registry WHERE decision_id='${decision_id}'`]).trim(), '1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime non-session startup quarantines historical duplicate proof lineage before enforcing uniqueness', async () => {
  const { transformSync } = await import('esbuild')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-proof-startup-'))
  const dbPath = join(dir, 'startup.sqlite')
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }

  try {
    runSqlite([dbPath, `CREATE TABLE proof_registry (proof_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL);`])
    runSqlite([dbPath, `INSERT INTO proof_registry (proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at) VALUES ('proof-canonical','session-1','execution-1','decision-historical','hash-historical','github-actions','1','aaa','governed-deploy.yml','production','2026-01-01T00:00:00.000Z');`])
    runSqlite([dbPath, `INSERT INTO proof_registry (proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at) VALUES ('proof-duplicate','session-1','execution-2','decision-historical','hash-historical','github-actions','2','bbb','governed-deploy.yml','production','2026-01-02T00:00:00.000Z');`])

    const response = await worker.fetch(new Request('https://runtime.test/authority', {
      method: 'POST',
      headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: 'missing-session' })
    }), env)
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(payload, { status: 'NULL', reason: 'invalid_session' })
    assert.equal(runSqlite([dbPath, `SELECT proof_id FROM proof_registry WHERE decision_id='decision-historical' AND validated_object_hash='hash-historical'`]).trim(), 'proof-canonical')
    assert.equal(runSqlite([dbPath, `SELECT proof_id || ':' || canonical_proof_id || ':' || archive_reason FROM proof_registry_duplicate_archive WHERE decision_id='decision-historical' AND validated_object_hash='hash-historical'`]).trim(), 'proof-duplicate:proof-canonical:duplicate_proof_lineage')
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_decision_hash_unique', ['decision_id', 'validated_object_hash'], true)
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_workflow_run_unique', ['workflow_run_id'], true)
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_provenance', ['repository', 'branch', 'pull_request_id', 'merge_commit_sha', 'workflow_run_id'])

    const duplicateInsert = spawnSync('sqlite3', [dbPath, `INSERT INTO proof_registry (proof_id,session_id,execution_id,decision_id,validated_object_hash,created_at) VALUES ('proof-after-cleanup','session-1','execution-3','decision-historical','hash-historical','2026-01-03T00:00:00.000Z');`], { encoding: 'utf8' })
    assert.notEqual(duplicateInsert.status, 0)
    assert.match(duplicateInsert.stderr, /UNIQUE constraint failed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compile is deterministic and fails closed on mismatched execution hash', async () => {
  const { transformSync } = await import('esbuild')
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const dir = mkdtempSync(join(tmpdir(), 'mindshift-compile-determinism-'))
  const dbPath = join(dir, 'runtime.sqlite')
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }
  const headers = { 'X-API-Key': 'test-key', 'content-type': 'application/json' }

  async function post(path, payload, expectedStatus = 200) {
    const response = await worker.fetch(new Request(`https://runtime.test${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }), env)
    assert.equal(response.status, expectedStatus)
    return response.json()
  }

  async function createCompiledDeploy(decision_id, branch = 'main') {
    const session = await post('/session', { identity_id: `compile-identity-${decision_id}` })
    assert.equal(session.status, 'SESSION_ACTIVE')
    const continuity = await post('/continuity', { session_id: session.session_id, authority_chain: [decision_id] })
    assert.equal(continuity.status, 'CONTINUITY_ACTIVE')
    const authority = await post('/authority', {
      continuity_id: continuity.continuity_id,
      session_id: session.session_id,
      decision_id,
      owner: 'compile-determinism-test',
      intent: 'deploy_production',
      scope: { environment: 'production' },
      constraints: { repo: 'example/repo', branch, workflow: 'governed-deploy.yml' }
    })
    assert.equal(authority.status, 'ACTIVE')
    return { session, continuity, compiled: await post('/compile', { decision_id }) }
  }

  try {
    applyMigrationChain(dbPath)

    const first = await createCompiledDeploy('decision-compile-stable')
    assert.equal(first.compiled.status, 'COMPILED')
    const repeated = await post('/compile', { decision_id: 'decision-compile-stable' })
    assert.equal(repeated.status, 'COMPILED')
    assert.equal(repeated.validated_object_hash, first.compiled.validated_object_hash)
    assert.deepEqual(repeated.canonical_aeo, first.compiled.canonical_aeo)
    assert.equal(runSqlite([dbPath, "SELECT COUNT(*) FROM aeo_registry WHERE decision_id='decision-compile-stable'"]).trim(), '1')

    const changed = await createCompiledDeploy('decision-compile-changed', 'release')
    assert.equal(changed.compiled.status, 'COMPILED')
    assert.notEqual(changed.compiled.validated_object_hash, first.compiled.validated_object_hash)

    const mismatch = await post('/validate', {
      decision_id: 'decision-compile-stable',
      validated_object_hash: changed.compiled.validated_object_hash,
      invocation_nonce: 'nonce-mismatched-hash',
      environment: 'production',
      session_id: first.session.session_id
    })
    assert.equal(mismatch.status, 'NULL')
    assert.equal(mismatch.result, 'INVALID')
    assert.equal(mismatch.reason, 'hash_mismatch')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
