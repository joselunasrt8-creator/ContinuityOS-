import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0006_enforcement_reboot_v1.sql', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const aeoRebuildMigration = readFileSync(new URL('../migrations/0007_canonical_aeo_registry_rebuild.sql', import.meta.url), 'utf8')
const registryRebuildMigration = readFileSync(new URL('../migrations/0008_canonical_runtime_registry_rebuild.sql', import.meta.url), 'utf8')

test('runtime mutation endpoints reject unauthorized requests before body parsing or DB access', async () => {
  const { transformSync } = await import('esbuild')
  const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
  const mutationEndpoints = ['/authority', '/compile', '/validate', '/execute', '/proof']

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

test('authorized authority mutation request succeeds', async () => {
  const { transformSync } = await import('esbuild')
  const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
  let writes = 0
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare() {
        return {
          bind() { return this },
          run() { writes += 1; return Promise.resolve({ meta: { changes: 1 } }) },
          all() { return Promise.resolve({ results: [] }) },
          first() { return Promise.resolve(null) }
        }
      }
    }
  }

  const response = await worker.fetch(new Request('https://runtime.test/authority', {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify({ decision_id: 'decision-1', owner: 'tester' })
  }), env)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.decision_id, 'decision-1')
  assert.equal(payload.owner, 'tester')
  assert.equal(payload.status, 'ACTIVE')
  assert.ok(writes > 0)
})

test('canonical AEO exactly five fields', () => {
  assert.match(source, /REQUIRED_AEO_KEYS = \["intent", "scope", "validation", "target", "finality"\]/)
  assert.match(source, /keys\.length !== REQUIRED_AEO_KEYS\.length/)
})

test('metadata does not affect hash', () => {
  assert.match(source, /sha256Hex\(canonicalize\(canonical_aeo\)\)/)
})

test('compile returns validated_object_hash', () => {
  assert.match(source, /status: "COMPILED"/)
  assert.match(source, /validated_object_hash/)
})

test('compile is fail-closed and never throws unhandled exception', () => {
  assert.match(source, /if \(!decision_id\) return json\(\{ status: "NULL", route: "\/compile", reason: "missing_decision_id" \}\)/)
  assert.match(source, /reason: "schema_incompatible_authority_registry"/)
  assert.match(source, /reason: "schema_incompatible_aeo_registry"/)
  assert.match(source, /status: "FAILED"/)
  assert.match(source, /reason: "compile_exception"/)
})

test('validate reserves nonce', () => {
  assert.match(source, /INSERT OR IGNORE INTO invocation_registry/)
  assert.match(source, /'RESERVED'/)
})

test('execute rejects no validation and wrong hash and replay', () => {
  assert.match(source, /reason:"no_validation"/)
  assert.match(source, /reason:"wrong_hash"/)
  assert.match(source, /reason:"replay_detected"/)
})

test('proof persists and consumes authority', () => {
  assert.match(source, /INSERT INTO proof_registry/)
  assert.match(source, /SET status='CONSUMED'/)
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
