import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { verifyRollbackLineage, canonicalRollbackLineageHash } from '../src/runtime/deployment/verifyRollbackLineage.ts'

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

function validRollbackInput(overrides = {}) {
  return {
    prior_deployment_proof_id: 'prior-proof-abc123',
    prior_artifact_hash: 'artifact-hash-v1',
    prior_workflow_hash: 'wf-hash-canonical',
    prior_commit_sha: 'abc123def456',
    rollback_artifact_hash: 'artifact-hash-v1',
    rollback_workflow_hash: 'wf-hash-canonical',
    rollback_commit_sha: 'abc123def456',
    ...overrides
  }
}

test('verifyRollbackLineage accepts valid rollback targeting prior deployment', () => {
  const result = verifyRollbackLineage(validRollbackInput())
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.rollback_lineage_hash)
})

test('rollback requires prior deployment proof reference', () => {
  const result = verifyRollbackLineage(validRollbackInput({ prior_deployment_proof_id: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_prior_deployment_proof' })
})

test('invalid rollback target rejected when required fields are empty', () => {
  assert.deepEqual(
    verifyRollbackLineage(validRollbackInput({ rollback_artifact_hash: '' })),
    { ok: false, reason: 'invalid_rollback_target' }
  )
  assert.deepEqual(
    verifyRollbackLineage(validRollbackInput({ rollback_workflow_hash: '' })),
    { ok: false, reason: 'invalid_rollback_target' }
  )
  assert.deepEqual(
    verifyRollbackLineage(validRollbackInput({ rollback_commit_sha: '' })),
    { ok: false, reason: 'invalid_rollback_target' }
  )
})

test('rollback artifact lineage must match prior deployment artifact hash', () => {
  const result = verifyRollbackLineage(validRollbackInput({ rollback_artifact_hash: 'different-artifact' }))
  assert.deepEqual(result, { ok: false, reason: 'rollback_artifact_mismatch' })
})

test('rollback commit sha must match prior deployment commit sha', () => {
  const result = verifyRollbackLineage(validRollbackInput({ rollback_commit_sha: 'different-sha' }))
  assert.deepEqual(result, { ok: false, reason: 'rollback_commit_sha_mismatch' })
})

test('rollback lineage drift rejected when computed hash does not match provided', () => {
  const input = validRollbackInput({ rollback_lineage_hash: 'wrong-lineage-hash' })
  const result = verifyRollbackLineage(input)
  assert.deepEqual(result, { ok: false, reason: 'rollback_lineage_drift' })
})

test('rollback proof replay rejected when binding hash matches existing', () => {
  const input = validRollbackInput()
  const computed = canonicalRollbackLineageHash({
    prior_deployment_proof_id: input.prior_deployment_proof_id,
    rollback_artifact_hash: input.rollback_artifact_hash,
    rollback_workflow_hash: input.rollback_workflow_hash,
    rollback_commit_sha: input.rollback_commit_sha,
  })
  const result = verifyRollbackLineage({ ...input, existing_rollback_proof_binding_hash: computed })
  assert.deepEqual(result, { ok: false, reason: 'rollback_proof_replayed' })
})

test('invalid rollback lineage returns NULL (no exceptions)', () => {
  const invalidCases = [
    validRollbackInput({ prior_deployment_proof_id: '' }),
    validRollbackInput({ rollback_artifact_hash: 'mismatch' }),
    validRollbackInput({ rollback_commit_sha: 'mismatch' }),
    validRollbackInput({ rollback_lineage_hash: 'bad-hash' }),
  ]
  for (const input of invalidCases) {
    const result = verifyRollbackLineage(input)
    assert.equal(result.ok, false)
    assert.ok(result.reason, 'must have a reason')
  }
})

test('canonicalRollbackLineageHash is deterministic', () => {
  const input = {
    prior_deployment_proof_id: 'proof-1',
    rollback_artifact_hash: 'art-1',
    rollback_workflow_hash: 'wf-1',
    rollback_commit_sha: 'sha-1',
  }
  assert.equal(canonicalRollbackLineageHash(input), canonicalRollbackLineageHash(input))
})

test('canonicalRollbackLineageHash binds all fields', () => {
  const base = {
    prior_deployment_proof_id: 'proof-1',
    rollback_artifact_hash: 'art-1',
    rollback_workflow_hash: 'wf-1',
    rollback_commit_sha: 'sha-1',
  }
  const fields = ['prior_deployment_proof_id', 'rollback_artifact_hash', 'rollback_workflow_hash', 'rollback_commit_sha']
  for (const field of fields) {
    const modified = { ...base, [field]: 'changed' }
    assert.notEqual(canonicalRollbackLineageHash(base), canonicalRollbackLineageHash(modified), `field ${field} must be bound`)
  }
})

test('rollback verification is deterministic across identical inputs', () => {
  const input = validRollbackInput()
  const first = verifyRollbackLineage(input)
  const second = verifyRollbackLineage(input)
  assert.deepEqual(first, second)
})

test('deployment_rollback_registry schema exists after migration', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-rollback-schema-'))
  const dbPath = join(dir, 'rollback.sqlite')
  try {
    applyMigrationChain(dbPath)
    const tables = runSqlite([dbPath, "SELECT name FROM sqlite_master WHERE type='table' AND name='deployment_rollback_registry'"])
    assert.match(tables, /deployment_rollback_registry/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment_rollback_registry is append-only: rejects UPDATE', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-rollback-append-'))
  const dbPath = join(dir, 'rollback.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_rollback_registry (rollback_id,prior_deployment_proof_id,rollback_artifact_hash,rollback_workflow_hash,rollback_commit_sha,rollback_lineage_hash,rollback_proof_binding_hash,created_at) VALUES ('r1','proof1','arthash','wfhash','sha1','linhash','bindhash1','2026-01-01T00:00:00.000Z')`])
    assert.throws(
      () => runSqlite([dbPath, `UPDATE deployment_rollback_registry SET rollback_artifact_hash='tampered' WHERE rollback_id='r1'`]),
      /append-only/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deployment_rollback_registry is append-only: rejects DELETE', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-rollback-delete-'))
  const dbPath = join(dir, 'rollback.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_rollback_registry (rollback_id,prior_deployment_proof_id,rollback_artifact_hash,rollback_workflow_hash,rollback_commit_sha,rollback_lineage_hash,rollback_proof_binding_hash,created_at) VALUES ('r2','proof2','arthash','wfhash','sha2','linhash','bindhash2','2026-01-01T00:00:00.000Z')`])
    assert.throws(
      () => runSqlite([dbPath, `DELETE FROM deployment_rollback_registry WHERE rollback_id='r2'`]),
      /append-only/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rollback proof binding hash unique constraint rejects replay', { skip: !hasSqlite3 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-rollback-replay-'))
  const dbPath = join(dir, 'rollback.sqlite')
  try {
    applyMigrationChain(dbPath)
    runSqlite([dbPath, `INSERT INTO deployment_rollback_registry (rollback_id,prior_deployment_proof_id,rollback_artifact_hash,rollback_workflow_hash,rollback_commit_sha,rollback_lineage_hash,rollback_proof_binding_hash,created_at) VALUES ('r3','proof3','arthash','wfhash','sha3','linhash','bindhash3','2026-01-01T00:00:00.000Z')`])
    const replay = spawnSync('sqlite3', [dbPath, `INSERT INTO deployment_rollback_registry (rollback_id,prior_deployment_proof_id,rollback_artifact_hash,rollback_workflow_hash,rollback_commit_sha,rollback_lineage_hash,rollback_proof_binding_hash,created_at) VALUES ('r3-replay','proof3','arthash','wfhash','sha3','linhash','bindhash3','2026-01-01T00:00:00.000Z')`], { encoding: 'utf8' })
    assert.notEqual(replay.status, 0)
    assert.match(replay.stderr, /UNIQUE constraint failed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rollback requires prior deployment proof: NULL without valid proof reference', () => {
  const noProof = verifyRollbackLineage(validRollbackInput({ prior_deployment_proof_id: '' }))
  assert.equal(noProof.ok, false)
  assert.equal(noProof.reason, 'missing_prior_deployment_proof')
})

test('rollback with valid prior proof and matching lineage succeeds deterministically', () => {
  const input = validRollbackInput()
  const expectedHash = canonicalRollbackLineageHash({
    prior_deployment_proof_id: input.prior_deployment_proof_id,
    rollback_artifact_hash: input.rollback_artifact_hash,
    rollback_workflow_hash: input.rollback_workflow_hash,
    rollback_commit_sha: input.rollback_commit_sha,
  })
  const result = verifyRollbackLineage({ ...input, rollback_lineage_hash: expectedHash })
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.rollback_lineage_hash === expectedHash)
})


test('rollback rejects missing prior workflow lineage anchor', () => {
  const result = verifyRollbackLineage(validRollbackInput({ prior_workflow_hash: '' }))
  assert.deepEqual(result, { ok: false, reason: 'missing_prior_workflow_hash' })
})

test('rollback workflow mismatch is invalid rollback target', () => {
  const result = verifyRollbackLineage(validRollbackInput({ rollback_workflow_hash: 'wf-other' }))
  assert.deepEqual(result, { ok: false, reason: 'invalid_rollback_target' })
})
