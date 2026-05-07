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

    assertColumns(dbPath, 'authority_registry', ['authority_id', 'decision_id', 'session_id', 'owner', 'intent', 'scope', 'constraints', 'expiry', 'status', 'created_at'])
    assertNotNull(dbPath, 'authority_registry', ['decision_id', 'session_id', 'owner', 'intent', 'scope', 'constraints', 'expiry', 'status', 'created_at'])
    assert.ok(indexList(dbPath, 'authority_registry').some((index) => index.unique === 1 && index.origin === 'u'), 'authority_registry must retain UNIQUE(decision_id) lifecycle guard')

    assertColumns(dbPath, 'aeo_registry', ['aeo_id', 'authority_id', 'decision_id', 'canonical_aeo', 'validated_object_hash', 'status', 'created_at'])
    assertNotNull(dbPath, 'aeo_registry', ['authority_id', 'decision_id', 'canonical_aeo', 'validated_object_hash', 'status', 'created_at'])
    assertIndex(dbPath, 'aeo_registry', 'idx_aeo_registry_decision_hash', ['decision_id', 'validated_object_hash'])

    assertColumns(dbPath, 'validation_registry', ['validation_id', 'session_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'environment', 'result', 'reason', 'status', 'created_at'])
    assertNotNull(dbPath, 'validation_registry', ['session_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'result', 'status', 'created_at'])
    assertIndex(dbPath, 'validation_registry', 'idx_validation_registry_decision_hash_nonce', ['decision_id', 'validated_object_hash', 'invocation_nonce'])

    assertColumns(dbPath, 'execution_registry', ['execution_id', 'session_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
    assertNotNull(dbPath, 'execution_registry', ['session_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
    assertIndex(dbPath, 'execution_registry', 'idx_execution_registry_decision_hash', ['decision_id', 'validated_object_hash'])
    assert.ok(indexList(dbPath, 'execution_registry').some((index) => index.unique === 1 && index.origin === 'u'), 'execution_registry must retain UNIQUE(decision_id, validated_object_hash) replay guard')

    assertColumns(dbPath, 'proof_registry', ['proof_id', 'session_id', 'execution_id', 'decision_id', 'validated_object_hash', 'surface', 'run_id', 'commit_sha', 'workflow', 'environment', 'created_at'])
    assertNotNull(dbPath, 'proof_registry', ['session_id', 'execution_id', 'decision_id', 'validated_object_hash', 'created_at'])
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_execution_decision_hash', ['execution_id', 'decision_id', 'validated_object_hash'])
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_decision_hash_unique', ['decision_id', 'validated_object_hash'], true)

    assertColumns(dbPath, 'proof_registry_duplicate_archive', ['archive_id', 'proof_id', 'session_id', 'execution_id', 'decision_id', 'validated_object_hash', 'surface', 'run_id', 'commit_sha', 'workflow', 'environment', 'created_at', 'archived_at', 'archive_reason', 'canonical_proof_id'])
    assertNotNull(dbPath, 'proof_registry_duplicate_archive', ['proof_id', 'session_id', 'execution_id', 'decision_id', 'validated_object_hash', 'created_at', 'archived_at', 'archive_reason', 'canonical_proof_id'])

    assertColumns(dbPath, 'invocation_registry', ['decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
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
    const sql = `BEGIN;\n${statements.map((statement) => `${statement.materialized()};`).join('\n')}\nCOMMIT;`
    const result = spawnSync('sqlite3', [this.dbPath], { encoding: 'utf8', input: sql })
    if (result.status !== 0) return Promise.reject(new Error(result.stderr || result.stdout))
    return Promise.resolve(statements.map(() => ({ meta: { changes: 1 } })))
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

    const authority = await post('/authority', {
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

    const invocation_nonce = 'nonce-runtime-lineage'
    const validation = await post('/validate', {
      session_id: session.session_id,
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
      session_id: session.session_id
    })
    assert.equal(execution.status, 'EXECUTED')
    assert.ok(execution.execution_id)
    assert.deepEqual(Object.keys(execution).sort(), ['execution_id', 'session_id', 'status'])

    const proof = await post('/proof', {
      execution_id: execution.execution_id,
      decision_id,
      validated_object_hash: compiled.validated_object_hash,
      surface: 'github-actions',
      run_id: '123',
      commit_sha: 'abc123',
      workflow: 'governed-deploy.yml',
      environment: 'production',
      session_id: session.session_id
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
    assert.deepEqual(eventTypes, ['AUTHORITY_CREATED', 'AEO_COMPILED', 'VALIDATION_GRANTED', 'EXECUTION_STARTED', 'EXECUTION_COMPLETED', 'PROOF_PERSISTED', 'AUTHORITY_CONSUMED'])
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
    await post('/authority', {
      session_id: session.session_id,
      decision_id,
      owner: 'observability-test',
      intent: 'deploy_production',
      scope: { repo: 'example/repo', branch: 'main' },
      constraints: { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml' }
    })
    const compiled = await post('/compile', { decision_id })
    const validation = await post('/validate', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: nonce, environment: 'production' })
    assert.equal(validation.status, 'VALID')
    return { ...compiled, session_id: session.session_id }
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
    const hashExecution = await post('/execute', { session_id: hashCompiled.session_id, decision_id: hashDecision, validated_object_hash: hashCompiled.validated_object_hash, invocation_nonce: 'nonce-hash' })
    assert.equal(hashExecution.reason, 'wrong_hash')
    assert.equal(runSqlite([dbPath, `SELECT event_type FROM observability_registry WHERE decision_id='${hashDecision}' AND event_type='HASH_MISMATCH'`]).trim(), 'HASH_MISMATCH')
    assert.equal(runSqlite([dbPath, `SELECT drift_class FROM drift_registry WHERE decision_id='${hashDecision}'`]).trim(), 'hash_drift')

    const proofDecision = 'decision-proof-telemetry'
    const proofCompiled = await prepareDecision(proofDecision, 'nonce-proof')
    const execution = await post('/execute', { session_id: proofCompiled.session_id, decision_id: proofDecision, validated_object_hash: proofCompiled.validated_object_hash, invocation_nonce: 'nonce-proof' })
    const proof = await post('/proof', { session_id: proofCompiled.session_id, execution_id: execution.execution_id, decision_id: proofDecision, validated_object_hash: proofCompiled.validated_object_hash, workflow: 'governed-deploy.yml' })
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

    const session = await post('/session', { identity_id: 'coercion-identity' })

    const session = await post('/session', { identity_id: 'target-coercion-identity' })
    await post('/authority', {
      session_id: session.session_id,
      decision_id,
      owner: 'target-coercion-test',
      scope: { repo: 12345, branch: 67890 },
      constraints: { repo: 12345, branch: 67890, workflow: 'governed-deploy.yml' }
    })

    const compiled = await post('/compile', { decision_id })
    assert.equal(compiled.status, 'COMPILED')
    assert.deepEqual(compiled.canonical_aeo.target, { repo: '12345', branch: '67890', workflow: 'governed-deploy.yml' })

    const validation = await post('/validate', {
      session_id: session.session_id,
      decision_id,
      validated_object_hash: firstCompile.validated_object_hash,
      invocation_nonce: 'nonce-canonical-coercion',
      environment: 'production'
    })
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

    const session = await post('/session', { identity_id: 'legitimacy-identity' })

    const session = await post('/session', { identity_id: 'workflow-rejection-identity' })
    await post('/authority', {
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
    await post('/authority', { session_id: session.session_id, decision_id, owner: 'rollback-test', constraints: { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml' } })
    const compiled = await post('/compile', { decision_id })
    await post('/validate', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-rollback', environment: 'production' })
    const execution = await post('/execute', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-rollback' })
    runSqlite([dbPath, `CREATE TRIGGER block_authority_consume BEFORE UPDATE OF status ON authority_registry WHEN NEW.status='CONSUMED' AND OLD.decision_id='${decision_id}' BEGIN SELECT RAISE(ABORT, 'consume blocked'); END;`])

    const proof = await post('/proof', { session_id: session.session_id, execution_id: execution.execution_id, decision_id, validated_object_hash: compiled.validated_object_hash, workflow: 'governed-deploy.yml' })

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
    await post('/authority', { session_id: session.session_id, decision_id, owner: 'duplicates-test', constraints: { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml' } })
    const compiled = await post('/compile', { decision_id })
    await post('/validate', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-duplicates', environment: 'production' })
    const execution = await post('/execute', { session_id: session.session_id, decision_id, validated_object_hash: compiled.validated_object_hash, invocation_nonce: 'nonce-duplicates' })
    const payload = { session_id: session.session_id, execution_id: execution.execution_id, decision_id, validated_object_hash: compiled.validated_object_hash, workflow: 'governed-deploy.yml' }

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

test('runtime startup quarantines historical duplicate proof lineage before enforcing uniqueness', async () => {
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

    const response = await worker.fetch(new Request('https://runtime.test/session', {
      method: 'POST',
      headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ identity_id: 'startup-survivor' })
    }), env)
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.status, 'SESSION_ACTIVE')
    assert.equal(runSqlite([dbPath, `SELECT proof_id FROM proof_registry WHERE decision_id='decision-historical' AND validated_object_hash='hash-historical'`]).trim(), 'proof-canonical')
    assert.equal(runSqlite([dbPath, `SELECT proof_id || ':' || canonical_proof_id || ':' || archive_reason FROM proof_registry_duplicate_archive WHERE decision_id='decision-historical' AND validated_object_hash='hash-historical'`]).trim(), 'proof-duplicate:proof-canonical:duplicate_proof_lineage')
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_decision_hash_unique', ['decision_id', 'validated_object_hash'], true)

    const duplicateInsert = spawnSync('sqlite3', [dbPath, `INSERT INTO proof_registry (proof_id,session_id,execution_id,decision_id,validated_object_hash,created_at) VALUES ('proof-after-cleanup','session-1','execution-3','decision-historical','hash-historical','2026-01-03T00:00:00.000Z');`], { encoding: 'utf8' })
    assert.notEqual(duplicateInsert.status, 0)
    assert.match(duplicateInsert.stderr, /UNIQUE constraint failed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
