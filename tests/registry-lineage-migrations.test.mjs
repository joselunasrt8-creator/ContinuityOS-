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

    assertColumns(dbPath, 'authority_registry', ['authority_id', 'decision_id', 'owner', 'intent', 'scope', 'constraints', 'expiry', 'status', 'created_at'])
    assertNotNull(dbPath, 'authority_registry', ['decision_id', 'owner', 'intent', 'scope', 'constraints', 'expiry', 'status', 'created_at'])
    assert.ok(indexList(dbPath, 'authority_registry').some((index) => index.unique === 1 && index.origin === 'u'), 'authority_registry must retain UNIQUE(decision_id) lifecycle guard')

    assertColumns(dbPath, 'aeo_registry', ['aeo_id', 'authority_id', 'decision_id', 'canonical_aeo', 'validated_object_hash', 'status', 'created_at'])
    assertNotNull(dbPath, 'aeo_registry', ['authority_id', 'decision_id', 'canonical_aeo', 'validated_object_hash', 'status', 'created_at'])
    assertIndex(dbPath, 'aeo_registry', 'idx_aeo_registry_decision_hash', ['decision_id', 'validated_object_hash'])

    assertColumns(dbPath, 'validation_registry', ['validation_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'environment', 'result', 'reason', 'status', 'created_at'])
    assertNotNull(dbPath, 'validation_registry', ['decision_id', 'validated_object_hash', 'invocation_nonce', 'result', 'status', 'created_at'])
    assertIndex(dbPath, 'validation_registry', 'idx_validation_registry_decision_hash_nonce', ['decision_id', 'validated_object_hash', 'invocation_nonce'])

    assertColumns(dbPath, 'execution_registry', ['execution_id', 'decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
    assertNotNull(dbPath, 'execution_registry', ['decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
    assertIndex(dbPath, 'execution_registry', 'idx_execution_registry_decision_hash', ['decision_id', 'validated_object_hash'])
    assert.ok(indexList(dbPath, 'execution_registry').some((index) => index.unique === 1 && index.origin === 'u'), 'execution_registry must retain UNIQUE(decision_id, validated_object_hash) replay guard')

    assertColumns(dbPath, 'proof_registry', ['proof_id', 'execution_id', 'decision_id', 'validated_object_hash', 'surface', 'run_id', 'commit_sha', 'workflow', 'environment', 'created_at'])
    assertNotNull(dbPath, 'proof_registry', ['execution_id', 'decision_id', 'validated_object_hash', 'created_at'])
    assertIndex(dbPath, 'proof_registry', 'idx_proof_registry_execution_decision_hash', ['execution_id', 'decision_id', 'validated_object_hash'])

    assertColumns(dbPath, 'invocation_registry', ['decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
    assertNotNull(dbPath, 'invocation_registry', ['decision_id', 'validated_object_hash', 'invocation_nonce', 'status', 'created_at'])
    assert.ok(indexList(dbPath, 'invocation_registry').some((index) => index.unique === 1 && index.origin === 'pk'), 'invocation_registry must use canonical triple primary key')
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

    const authority = await post('/authority', {
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
      decision_id,
      validated_object_hash: compiled.validated_object_hash,
      invocation_nonce,
      environment: 'production'
    })
    assert.equal(validation.status, 'VALID')

    const execution = await post('/execute', {
      decision_id,
      validated_object_hash: compiled.validated_object_hash,
      invocation_nonce
    })
    assert.equal(execution.status, 'EXECUTED')
    assert.ok(execution.execution_id)

    const proof = await post('/proof', {
      execution_id: execution.execution_id,
      decision_id,
      validated_object_hash: compiled.validated_object_hash,
      surface: 'github-actions',
      run_id: '123',
      commit_sha: 'abc123',
      workflow: 'governed-deploy.yml',
      environment: 'production'
    })
    assert.equal(proof.status, 'PROVEN')

    assert.equal(runSqlite([dbPath, `SELECT validated_object_hash FROM validation_registry WHERE decision_id='${decision_id}'`]).trim(), compiled.validated_object_hash)
    assert.equal(runSqlite([dbPath, `SELECT invocation_nonce FROM execution_registry WHERE decision_id='${decision_id}'`]).trim(), invocation_nonce)
    assert.equal(runSqlite([dbPath, `SELECT environment FROM proof_registry WHERE decision_id='${decision_id}'`]).trim(), 'production')
    assert.equal(runSqlite([dbPath, `SELECT status FROM authority_registry WHERE decision_id='${decision_id}'`]).trim(), 'CONSUMED')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
