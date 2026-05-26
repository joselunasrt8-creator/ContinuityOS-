import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { verifyDeploymentProvenance, provenanceIsReplayed } from '../src/runtime/deployment/verifyDeploymentProvenance.ts'

const hasSqlite3 = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' }).status === 0

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

function validRecord(overrides = {}) {
  return {
    provenance_id: `prov-${Math.random().toString(36).slice(2)}`,
    commit_sha: 'abc123def456',
    workflow_hash: 'wf-hash-canonical',
    artifact_hash: 'artifact-hash-canonical',
    deploy_actor: 'ci-actor',
    deployment_timestamp: new Date().toISOString(),
    environment_classification: 'production',
    deployment_proof_id: `proof-${Math.random().toString(36).slice(2)}`,
    ...overrides
  }
}

test('verifyDeploymentProvenance accepts complete valid record', () => {
  const result = verifyDeploymentProvenance(validRecord())
  assert.deepEqual(result, { ok: true })
})

test('verifyDeploymentProvenance rejects missing commit_sha', () => {
  const result = verifyDeploymentProvenance(validRecord({ commit_sha: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_commit_sha' })
})

test('verifyDeploymentProvenance rejects missing workflow_hash', () => {
  const result = verifyDeploymentProvenance(validRecord({ workflow_hash: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_workflow_hash' })
})

test('verifyDeploymentProvenance rejects missing artifact_hash', () => {
  const result = verifyDeploymentProvenance(validRecord({ artifact_hash: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_artifact_hash' })
})

test('verifyDeploymentProvenance rejects missing deploy_actor', () => {
  const result = verifyDeploymentProvenance(validRecord({ deploy_actor: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_deploy_actor' })
})

test('verifyDeploymentProvenance rejects missing deployment_timestamp', () => {
  const result = verifyDeploymentProvenance(validRecord({ deployment_timestamp: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_deployment_timestamp' })
})

test('verifyDeploymentProvenance rejects missing environment_classification', () => {
  const result = verifyDeploymentProvenance(validRecord({ environment_classification: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_environment_classification' })
})

test('verifyDeploymentProvenance rejects missing deployment_proof_id', () => {
  const result = verifyDeploymentProvenance(validRecord({ deployment_proof_id: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_deployment_proof_id' })
})

test('production deployment requires all provenance fields present', () => {
  const required = ['commit_sha', 'workflow_hash', 'artifact_hash', 'deploy_actor', 'deployment_timestamp', 'environment_classification', 'deployment_proof_id', 'provenance_id']
  for (const field of required) {
    const record = validRecord({ [field]: '' })
    const result = verifyDeploymentProvenance(record)
    assert.equal(result.ok, false, `field ${field} must be required`)
    assert.match(result.reason, new RegExp(`missing_${field}`))
  }
})

test('provenanceIsReplayed detects replayed provenance tuple', () => {
  const record = validRecord()
  assert.equal(provenanceIsReplayed(record, record), true)
  assert.equal(provenanceIsReplayed(record, null), false)
  assert.equal(provenanceIsReplayed(record, validRecord()), false)
})

test('provenanceIsReplayed returns NULL behavior for non-matching fields', () => {
  const base = validRecord()
  assert.equal(provenanceIsReplayed(base, validRecord({ commit_sha: 'different' })), false)
  assert.equal(provenanceIsReplayed(base, validRecord({ workflow_hash: 'different' })), false)
  assert.equal(provenanceIsReplayed(base, validRecord({ artifact_hash: 'different' })), false)
  assert.equal(provenanceIsReplayed(base, validRecord({ deployment_proof_id: 'different' })), false)
})

test('deployment_provenance_registry schema exists after migration', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-provenance-'))
  const dbPath = join(dir, 'provenance.sqlite')
  try {
    applyMigrationChain(dbPath)
    const tables = runSqlite([dbPath, "SELECT name FROM sqlite_master WHERE type='table' AND name='deployment_provenance_registry'"])
    assert.match(tables, /deployment_provenance_registry/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment_provenance_registry is append-only: rejects UPDATE', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-provenance-append-'))
  const dbPath = join(dir, 'provenance.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_provenance_registry (provenance_id,commit_sha,workflow_hash,artifact_hash,deploy_actor,deployment_timestamp,environment_classification,deployment_proof_id,created_at) VALUES ('p1','sha1','wfhash','arthash','actor','2026-01-01T00:00:00.000Z','production','proof1','2026-01-01T00:00:00.000Z')`])
    assert.throws(
      () => runSqlite([dbPath, `UPDATE deployment_provenance_registry SET commit_sha='changed' WHERE provenance_id='p1'`]),
      /append-only/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment_provenance_registry is append-only: rejects DELETE', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-provenance-delete-'))
  const dbPath = join(dir, 'provenance.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_provenance_registry (provenance_id,commit_sha,workflow_hash,artifact_hash,deploy_actor,deployment_timestamp,environment_classification,deployment_proof_id,created_at) VALUES ('p2','sha2','wfhash2','arthash2','actor','2026-01-01T00:00:00.000Z','production','proof2','2026-01-01T00:00:00.000Z')`])
    assert.throws(
      () => runSqlite([dbPath, `DELETE FROM deployment_provenance_registry WHERE provenance_id='p2'`]),
      /append-only/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('replayed provenance tuple rejected by UNIQUE constraint', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-provenance-replay-'))
  const dbPath = join(dir, 'provenance.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_provenance_registry (provenance_id,commit_sha,workflow_hash,artifact_hash,deploy_actor,deployment_timestamp,environment_classification,deployment_proof_id,created_at) VALUES ('p3','sha3','wfhash3','arthash3','actor','2026-01-01T00:00:00.000Z','production','proof3','2026-01-01T00:00:00.000Z')`])
    const replay = spawnSync('sqlite3', [dbPath, `INSERT INTO deployment_provenance_registry (provenance_id,commit_sha,workflow_hash,artifact_hash,deploy_actor,deployment_timestamp,environment_classification,deployment_proof_id,created_at) VALUES ('p3-replay','sha3','wfhash3','arthash3','actor','2026-01-01T00:00:00.000Z','production','proof3','2026-01-01T00:00:00.000Z')`], { encoding: 'utf8' })
    assert.notEqual(replay.status, 0)
    assert.match(replay.stderr, /UNIQUE constraint failed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment provenance registry is immutable after initial insert', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-provenance-immutable-'))
  const dbPath = join(dir, 'provenance.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_provenance_registry (provenance_id,commit_sha,workflow_hash,artifact_hash,deploy_actor,deployment_timestamp,environment_classification,deployment_proof_id,created_at) VALUES ('p4','sha4','wfhash4','arthash4','actor','2026-01-01T00:00:00.000Z','production','proof4','2026-01-01T00:00:00.000Z')`])
    const count = runSqlite([dbPath, `SELECT COUNT(*) FROM deployment_provenance_registry WHERE provenance_id='p4'`]).trim()
    assert.equal(count, '1')
    assert.throws(() => runSqlite([dbPath, `UPDATE deployment_provenance_registry SET artifact_hash='tampered' WHERE provenance_id='p4'`]), /append-only/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('provenance replay requires provenance_id stability', () => {
  const base = validRecord({ provenance_id: 'prov-stable' })
  assert.equal(provenanceIsReplayed(base, { ...base, provenance_id: 'prov-other' }), false)
  assert.equal(provenanceIsReplayed(base, { ...base }), true)
})
