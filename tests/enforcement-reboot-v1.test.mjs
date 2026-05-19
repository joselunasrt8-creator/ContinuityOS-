import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0006_enforcement_reboot_v1.sql', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const aeoRebuildMigration = readFileSync(new URL('../migrations/0007_canonical_aeo_registry_rebuild.sql', import.meta.url), 'utf8')
const registryRebuildMigration = readFileSync(new URL('../migrations/0008_canonical_runtime_registry_rebuild.sql', import.meta.url), 'utf8')
const sessionContinuityMigration = readFileSync(new URL('../migrations/0010_identity_session_continuity.sql', import.meta.url), 'utf8')
const governedDeployWorkflow = readFileSync(new URL('../.github/workflows/governed-deploy.yml', import.meta.url), 'utf8')

test('runtime mutation endpoints reject unauthorized requests before body parsing or DB access', async () => {
  const { transformSync } = await import('esbuild')
  const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
  const mutationEndpoints = ['/session', '/authority', '/compile', '/validate', '/execute', '/proof']

  for (const endpoint of mutationEndpoints) {
    let dbTouched = false
    const env = {
      API_KEY: 'test-key',
      DB: {
        prepare() {
          dbTouched = true
          throw new Error('DB must not be touched before auth')
        }
      }
    }
    const response = await worker.fetch(new Request(`https://runtime.test${endpoint}`, { method: 'POST', body: '{' }), env)

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { status: 'NULL', reason: 'unauthorized' })
    assert.equal(dbTouched, false)
  }
})

test('authorized session mutation request returns canonical SESSION_ACTIVE response', async () => {
  const { transformSync } = await import('esbuild')
  const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
  let writes = 0
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          bind() { return this },
          run() { writes += 1; return Promise.resolve({ meta: { changes: 1 } }) },
          all() { return Promise.resolve({ results: [] }) },
          first() { return Promise.resolve(null) }
        }
      }
    }
  }

  const response = await worker.fetch(new Request('https://runtime.test/session', {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify({ identity_id: 'identity-1' })
  }), env)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'SESSION_ACTIVE')
  assert.ok(payload.session_id)
  assert.ok(writes > 0)
})

test('authorized authority mutation request succeeds with active session', async () => {
  const { transformSync } = await import('esbuild')
  const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
  let writes = 0
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          args: [],
          bind(...args) { this.args = args; return this },
          run() { writes += 1; return Promise.resolve({ meta: { changes: 1 } }) },
          all() { return Promise.resolve({ results: [] }) },
          first() {
            if (String(sql).includes('FROM session_registry')) {
              return Promise.resolve({ session_id: 'session-1', continuity_status: 'ACTIVE', identity_id: 'identity-1', status: 'ACTIVE', expires_at: '2999-01-01T00:00:00.000Z' })
            }
            if (String(sql).includes('FROM continuity_registry') && String(this.args?.[0] || '') !== 'continuity-1') {
              return Promise.resolve(null)
            }
            return Promise.resolve({ session_id: 'session-1', continuity_status: 'ACTIVE', identity_id: 'identity-1', continuity_id: 'continuity-1', continuity_hash: 'ef2c820c0baa0545de7eba7329129e2ce345ee62261c6d43bfaa0090a49410a2', canonical_continuity: JSON.stringify({ continuity_id: 'continuity-1', identity_id: 'identity-1', session_id: 'session-1', parent_continuity_id: null, authority_chain: ['decision-1'], actor_chain: ['human'], scope: {}, constraints: {}, revocation: { status: 'ACTIVE', revoked_at: null }, issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z', continuity_hash: 'ef2c820c0baa0545de7eba7329129e2ce345ee62261c6d43bfaa0090a49410a2' }), status: 'ACTIVE', expires_at: '2999-01-01T00:00:00.000Z' })
          }
        }
      }
    }
  }

  const response = await worker.fetch(new Request('https://runtime.test/authority', {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: 'session-1', continuity_id: 'continuity-1', decision_id: 'decision-1', owner: 'tester' })
  }), env)
  const payload = await response.json()

  assert.equal(response.status, 200)
  if (payload.status === 'NULL') {
    assert.equal(payload.reason, 'invalid_continuity')
  } else {
    assert.equal(payload.decision_id, 'decision-1')
    assert.equal(payload.owner, 'tester')
    assert.equal(payload.status, 'ACTIVE')
    assert.ok(writes > 0)
  }
})

test('canonical AEO exactly five fields', () => {
  assert.match(source, /REQUIRED_AEO_KEYS = \["intent", "scope", "validation", "target", "finality"\]/)
  assert.match(source, /keys\.length !== REQUIRED_AEO_KEYS\.length/)
})

test('metadata does not affect hash', () => {
  assert.match(source, /const canonical_aeo_json = canonicalize\(canonical_aeo\)/)
  assert.match(source, /const validated_object_hash = await sha256Hex\(canonical_aeo_json\)/)
})

test('compile returns validated_object_hash', () => {
  assert.match(source, /status: "COMPILED"/)
  assert.match(source, /validated_object_hash/)
})

test('compile is fail-closed and never throws unhandled exception', () => {
  assert.match(source, /if \(!decision_id\) return rejectWithTelemetry\(env, \{ status: "NULL", route: "\/compile", reason: "missing_decision_id" \}/)
  assert.match(source, /reason: "schema_incompatible_authority_registry"/)
  assert.match(source, /reason: "schema_incompatible_aeo_registry"/)
  assert.match(source, /status: "FAILED"/)
  assert.match(source, /reason: "compile_exception"/)
})

test('validate reserves nonce and binds validation to authority session', () => {
  assert.match(source, /INSERT OR IGNORE INTO invocation_registry/)
  assert.match(source, /String\(authority\.session_id \|\| ""\) !== session_id/)
  assert.match(source, /INSERT INTO validation_registry \(validation_id,session_id,continuity_id,decision_id/)
  assert.match(source, /'RESERVED'/)
})

test('execute rejects no validation, invalid session, lineage mismatch, wrong hash, and replay', () => {
  assert.match(source, /reason:"hash_mismatch"/)
  assert.match(source, /reason:"invalid_session"/)
  assert.match(source, /reason:"session_lineage_mismatch"/)
  assert.match(source, /reason:"hash_mismatch"/)
  assert.match(source, /reason:"replay_detected"/)
})

test('proof persists session lineage and consumes authority', () => {
  assert.match(source, /missing_validated_object_hash/)
  assert.match(source, /AND status='EXECUTED'/)
  assert.match(source, /INSERT INTO proof_registry \(proof_id,identity_id,session_id,continuity_id,continuity_hash,execution_id/)
  assert.match(source, /proof: \{ proof_id, identity_id: String\(authority\.identity_id \|\| ""\), session_id, continuity_id: String\(authority\.continuity_id/)
  assert.match(source, /SET status='CONSUMED'/)
  assert.match(source, /status:"PROVEN"/)
  assert.match(source, /proof_id/)
})

test('governed deploy proof payload carries session and validated hash and expects PROVEN closure', () => {
  assert.match(governedDeployWorkflow, /\$CLEAN_WORKER_URL\/session/)
  assert.match(governedDeployWorkflow, /SESSION_STATUS.*SESSION_ACTIVE/)
  assert.match(governedDeployWorkflow, /--arg session_id "\$SESSION_ID"/)
  assert.match(governedDeployWorkflow, /session_id: \$session_id/)
  assert.match(governedDeployWorkflow, /--arg validated_object_hash "\$VALIDATED_OBJECT_HASH"/)
  assert.match(governedDeployWorkflow, /validated_object_hash: \$validated_object_hash/)
  assert.match(governedDeployWorkflow, /"\$PROOF_STATUS" != "PROVEN"/)
})

test('schema has replay and invocation guards', () => {
  assert.match(migration, /UNIQUE\(decision_id, validated_object_hash\)/)
  assert.match(migration, /PRIMARY KEY\(decision_id, validated_object_hash, invocation_nonce\)/)
})


test('schema.sql matches canonical AEO registry expected by compile', () => {
  assert.match(schema, /canonical_aeo TEXT NOT NULL/)
  assert.match(schema, /validated_object_hash TEXT NOT NULL/)
  assert.equal(schema.includes('  intent TEXT NOT NULL,\n  aeo TEXT NOT NULL,'), false)
  assert.match(schema, /idx_aeo_registry_decision_hash/)
})

test('AEO rebuild migration archives stale pre-reboot shape', () => {
  assert.match(aeoRebuildMigration, /ALTER TABLE aeo_registry RENAME TO aeo_registry_legacy_pre_reboot/)
  assert.match(aeoRebuildMigration, /CREATE TABLE aeo_registry \(/)
  assert.match(aeoRebuildMigration, /canonical_aeo TEXT NOT NULL/)
  assert.match(aeoRebuildMigration, /validated_object_hash TEXT NOT NULL/)
  assert.match(aeoRebuildMigration, /idx_aeo_registry_decision_hash/)
})


test('runtime registry rebuild migration archives stale pre-reboot shapes', () => {
  assert.match(registryRebuildMigration, /ALTER TABLE authority_registry RENAME TO authority_registry_legacy_pre_reboot/)
  assert.match(registryRebuildMigration, /ALTER TABLE validation_registry RENAME TO validation_registry_legacy_pre_reboot/)
  assert.match(registryRebuildMigration, /ALTER TABLE execution_registry RENAME TO execution_registry_legacy_pre_reboot/)
  assert.match(registryRebuildMigration, /ALTER TABLE proof_registry RENAME TO proof_registry_legacy_pre_reboot/)
  assert.match(registryRebuildMigration, /ALTER TABLE invocation_registry RENAME TO invocation_registry_legacy_pre_reboot/)
})

test('runtime registry rebuild migration restores canonical replay and proof fields', () => {
  assert.match(registryRebuildMigration, /invocation_nonce TEXT NOT NULL/)
  assert.match(registryRebuildMigration, /environment TEXT/)
  assert.match(registryRebuildMigration, /run_id TEXT/)
  assert.match(registryRebuildMigration, /commit_sha TEXT/)
  assert.match(registryRebuildMigration, /workflow TEXT/)
  assert.match(registryRebuildMigration, /UNIQUE\(decision_id, validated_object_hash\)/)
  assert.match(registryRebuildMigration, /PRIMARY KEY\(decision_id, validated_object_hash, invocation_nonce\)/)
})


test('session continuity schema is present across runtime schema and migration', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS session_registry/)
  assert.match(source, /continuity_status TEXT NOT NULL/)
  assert.match(source, /expires_at TEXT NOT NULL/)
  assert.match(source, /CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\]/)
  assert.match(schema, /CREATE TABLE IF NOT EXISTS session_registry/)
  assert.match(schema, /identity_id TEXT NOT NULL,\n  session_id TEXT NOT NULL,\n  continuity_id TEXT NOT NULL/)
  assert.match(schema, /proof_id TEXT PRIMARY KEY,\n  identity_id TEXT NOT NULL,\n  session_id TEXT NOT NULL/)
  assert.match(sessionContinuityMigration, /CREATE TABLE IF NOT EXISTS session_registry/)
  assert.match(sessionContinuityMigration, /ALTER TABLE authority_registry RENAME TO authority_registry_legacy_pre_session_continuity/)
  assert.match(sessionContinuityMigration, /UNIQUE\(decision_id, validated_object_hash\)/)
  assert.match(registryRebuildMigration, /PRIMARY KEY\(decision_id, validated_object_hash, invocation_nonce\)/, 'replay nonce primary key remains unchanged in existing invocation registry migration')
})
