import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { verifyDeploymentProof, canonicalProofBindingHash } from '../src/runtime/deployment/verifyDeploymentProof.ts'

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

function validCandidate(overrides = {}) {
  return {
    deployment_proof_id: `dproof-${Math.random().toString(36).slice(2)}`,
    workflow_hash: 'wf-hash-canonical',
    artifact_hash: 'artifact-hash-canonical',
    commit_sha: 'abc123def456',
    deployment_environment: 'production',
    provenance_lineage_hash: 'provenance-lineage-hash-canonical',
    ...overrides
  }
}

test('verifyDeploymentProof accepts complete valid candidate', () => {
  const result = verifyDeploymentProof({ candidate: validCandidate() })
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.proof_binding_hash)
})

test('verifyDeploymentProof rejects missing workflow_hash', () => {
  const result = verifyDeploymentProof({ candidate: validCandidate({ workflow_hash: '' }) })
  assert.deepEqual(result, { ok: false, reason: 'missing_workflow_hash' })
})

test('verifyDeploymentProof rejects missing artifact_hash', () => {
  const result = verifyDeploymentProof({ candidate: validCandidate({ artifact_hash: '' }) })
  assert.deepEqual(result, { ok: false, reason: 'missing_artifact_hash' })
})

test('verifyDeploymentProof rejects missing commit_sha', () => {
  const result = verifyDeploymentProof({ candidate: validCandidate({ commit_sha: '' }) })
  assert.deepEqual(result, { ok: false, reason: 'missing_commit_sha' })
})

test('verifyDeploymentProof rejects missing deployment_environment', () => {
  const result = verifyDeploymentProof({ candidate: validCandidate({ deployment_environment: '' }) })
  assert.deepEqual(result, { ok: false, reason: 'missing_deployment_environment' })
})

test('verifyDeploymentProof rejects missing provenance_lineage_hash', () => {
  const result = verifyDeploymentProof({ candidate: validCandidate({ provenance_lineage_hash: '' }) })
  assert.deepEqual(result, { ok: false, reason: 'missing_provenance_lineage' })
})

test('verifyDeploymentProof rejects proof_binding_hash mismatch', () => {
  const candidate = validCandidate({ proof_binding_hash: 'wrong-hash' })
  const result = verifyDeploymentProof({ candidate })
  assert.deepEqual(result, { ok: false, reason: 'proof_binding_hash_mismatch' })
})

test('verifyDeploymentProof accepts matching proof_binding_hash', () => {
  const base = validCandidate()
  const expected = canonicalProofBindingHash({
    workflow_hash: base.workflow_hash,
    artifact_hash: base.artifact_hash,
    commit_sha: base.commit_sha,
    deployment_environment: base.deployment_environment,
    provenance_lineage_hash: base.provenance_lineage_hash,
  })
  const result = verifyDeploymentProof({ candidate: { ...base, proof_binding_hash: expected } })
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.proof_binding_hash === expected)
})

test('canonicalProofBindingHash is deterministic', () => {
  const input = {
    workflow_hash: 'wf',
    artifact_hash: 'art',
    commit_sha: 'sha',
    deployment_environment: 'production',
    provenance_lineage_hash: 'lin',
  }
  assert.equal(canonicalProofBindingHash(input), canonicalProofBindingHash(input))
})

test('canonicalProofBindingHash binds all fields', () => {
  const base = { workflow_hash: 'wf', artifact_hash: 'art', commit_sha: 'sha', deployment_environment: 'production', provenance_lineage_hash: 'lin' }
  const fields = ['workflow_hash', 'artifact_hash', 'commit_sha', 'deployment_environment', 'provenance_lineage_hash']
  for (const field of fields) {
    const modified = { ...base, [field]: 'changed' }
    assert.notEqual(canonicalProofBindingHash(base), canonicalProofBindingHash(modified), `field ${field} must be bound`)
  }
})

test('deployment_proof_registry schema exists after migration', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-proof-schema-'))
  const dbPath = join(dir, 'proof.sqlite')
  try {
    applyMigrationChain(dbPath)
    const tables = runSqlite([dbPath, "SELECT name FROM sqlite_master WHERE type='table' AND name='deployment_proof_registry'"])
    assert.match(tables, /deployment_proof_registry/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment_proof_registry is append-only: rejects UPDATE', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-proof-append-'))
  const dbPath = join(dir, 'proof.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_proof_registry (deployment_proof_id,workflow_hash,artifact_hash,commit_sha,deployment_environment,provenance_lineage_hash,proof_binding_hash,created_at) VALUES ('dp1','wfhash','arthash','sha1','production','linhash','bindhash1','2026-01-01T00:00:00.000Z')`])
    assert.throws(
      () => runSqlite([dbPath, `UPDATE deployment_proof_registry SET workflow_hash='tampered' WHERE deployment_proof_id='dp1'`]),
      /append-only/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment_proof_registry is append-only: rejects DELETE', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-proof-delete-'))
  const dbPath = join(dir, 'proof.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_proof_registry (deployment_proof_id,workflow_hash,artifact_hash,commit_sha,deployment_environment,provenance_lineage_hash,proof_binding_hash,created_at) VALUES ('dp2','wfhash','arthash','sha2','production','linhash','bindhash2','2026-01-01T00:00:00.000Z')`])
    assert.throws(
      () => runSqlite([dbPath, `DELETE FROM deployment_proof_registry WHERE deployment_proof_id='dp2'`]),
      /append-only/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment proof unique binding constraint rejects duplicate proof_binding_hash', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-proof-unique-'))
  const dbPath = join(dir, 'proof.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_proof_registry (deployment_proof_id,workflow_hash,artifact_hash,commit_sha,deployment_environment,provenance_lineage_hash,proof_binding_hash,created_at) VALUES ('dp3','wfhash','arthash','sha3','production','linhash','bindhash3','2026-01-01T00:00:00.000Z')`])
    const replay = spawnSync('sqlite3', [dbPath, `INSERT INTO deployment_proof_registry (deployment_proof_id,workflow_hash,artifact_hash,commit_sha,deployment_environment,provenance_lineage_hash,proof_binding_hash,created_at) VALUES ('dp3-replay','wfhash','arthash','sha3','production','linhash','bindhash3','2026-01-01T00:00:00.000Z')`], { encoding: 'utf8' })
    assert.notEqual(replay.status, 0)
    assert.match(replay.stderr, /UNIQUE constraint failed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment proof registry is immutable: proof fields cannot change after insert', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-proof-immutable-'))
  const dbPath = join(dir, 'proof.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_proof_registry (deployment_proof_id,workflow_hash,artifact_hash,commit_sha,deployment_environment,provenance_lineage_hash,proof_binding_hash,created_at) VALUES ('dp4','wfhash','arthash','sha4','production','linhash','bindhash4','2026-01-01T00:00:00.000Z')`])
    assert.throws(() => runSqlite([dbPath, `UPDATE deployment_proof_registry SET artifact_hash='tampered' WHERE deployment_proof_id='dp4'`]), /append-only/)
    assert.throws(() => runSqlite([dbPath, `UPDATE deployment_proof_registry SET commit_sha='tampered' WHERE deployment_proof_id='dp4'`]), /append-only/)
    assert.throws(() => runSqlite([dbPath, `UPDATE deployment_proof_registry SET workflow_hash='tampered' WHERE deployment_proof_id='dp4'`]), /append-only/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
