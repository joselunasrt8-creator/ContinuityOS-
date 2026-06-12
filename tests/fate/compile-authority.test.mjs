import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { importWorker } from '../helpers/import-worker.mjs'

function runSqlite(args, options = {}) {
  const result = spawnSync('sqlite3', args, { encoding: 'utf8', ...options })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}

function applyMigrationChain(dbPath) {
  const migrations = readdirSync(new URL('../../migrations', import.meta.url)).filter((name) => name.endsWith('.sql')).sort()
  for (const migration of migrations) {
    const path = new URL(`../../migrations/${migration}`, import.meta.url)
    const result = spawnSync('sqlite3', [dbPath], { encoding: 'utf8', input: readFileSync(path, 'utf8') })
    assert.equal(result.status, 0, `${migration}: ${result.stderr || result.stdout}`)
  }
}

function sqlLiteral(value) { return value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'` }
class SqliteD1Database { constructor(dbPath){ this.dbPath=dbPath } prepare(sql){ const dbPath=this.dbPath; return { values:[], bind(...values){ this.values=values; return this }, materialized(){ return sql.replace(/\?(\d+)/g, (_m, i)=>sqlLiteral(this.values[Number(i)-1])) }, run(){ const out=runSqlite(['-json', dbPath, `${this.materialized()}; SELECT changes() AS changes;`]); const rows=JSON.parse(out||'[]'); return Promise.resolve({meta:{changes:rows.at(-1)?.changes??0}})}, all(){ const out=runSqlite(['-json', dbPath, this.materialized()]); return Promise.resolve({results:JSON.parse(out||'[]')})}, first(){ const out=runSqlite(['-json', dbPath, this.materialized()]); return Promise.resolve((JSON.parse(out||'[]'))[0]||null)} } } }

async function buildRuntime(dbPath) {
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const worker = (await importWorker()).default
  const env = { API_KEY: 'test-key', DB: new SqliteD1Database(dbPath) }
  const headers = { 'X-API-Key': 'test-key', 'content-type': 'application/json' }
  const post = async (path, payload) => {
    const res = await worker.fetch(new Request(`https://runtime.test${path}`, { method: 'POST', headers, body: JSON.stringify(payload) }), env)
    assert.equal(res.status, 200)
    return res.json()
  }
  return { post }
}

const TEST_SNAPSHOT = {
  repository_tree_hash: 'test-tree-hash', workflow_hash: 'test-workflow-hash',
  topology_hash: 'test-topology-hash', governance_hash: 'test-governance-hash',
  runtime_surface_hash: 'test-surface-hash', schema_set_hash: 'test-schema-hash',
  workflow_identity: 'governed-deploy.yml', replay_epoch: '2026'
}

// Topology-epoch admission now precedes the authority/compile checks these tests
// exercise. With an empty epoch_registry, topology_epoch=0 with a lineage parent, a
// (unique) nonce and VISIBLE topology is admitted as the genesis epoch. /authority and
// /compile do not reserve the epoch_nonce, so a fresh nonce per call keeps each request
// past admission and at the original authority assertion.
let epochNonceCounter = 0
function epochFields() {
  epochNonceCounter += 1
  return {
    topology_epoch: 0,
    epoch_lineage_parent: 'epoch-root',
    epoch_nonce: `epoch-nonce-${epochNonceCounter}`,
    topology_visibility_state: 'VISIBLE'
  }
}

// /authority now persists a governed_tool_envelope_id and /compile's
// verifyGovernedToolEnvelopeLinkage requires that the referenced governed_tool_envelope
// exists and is operative (non_operative='false'). We seed one operative envelope per
// decision and bind it on the authority so the lifecycle proceeds to the original
// ACTIVE/expired/status authority assertions instead of failing closed on the envelope.
function seedEnvelope(dbPath, decision_id) {
  const envelope_id = `gte-${decision_id}`
  runSqlite([dbPath, `INSERT INTO governed_tool_envelope_registry (envelope_id, candidate_hash, nonce_binding, policy_digest, topology_digest, lineage_pointers, timestamp, non_operative, tool_surface_descriptor, created_at) VALUES ('${envelope_id}', 'candidate-${decision_id}', 'nonce-binding-${decision_id}', 'policy-${decision_id}', 'topology-${decision_id}', '[]', '2026-01-01T00:00:00.000Z', 'false', '{}', '2026-01-01T00:00:00.000Z')`])
  return envelope_id
}

async function seedAuthority(post, decision_id, dbPath) {
  const envelope_id = seedEnvelope(dbPath, decision_id)
  const session = await post('/session', { identity_id: `identity-${decision_id}` })
  const continuity = await post('/continuity', { session_id: session.session_id, authority_chain: [decision_id] })
  await post('/authority', { continuity_id: continuity.continuity_id, session_id: session.session_id, decision_id, owner: 'test', intent: 'deploy_production', scope: { repo: 'example/repo', branch: 'main' }, constraints: { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml' }, governed_tool_envelope_id: envelope_id, ...epochFields() })
}

test('compile enforces ACTIVE unexpired authority fail-closed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'compile-authority-'))
  const dbPath = join(dir, 'runtime.sqlite')
  try {
    applyMigrationChain(dbPath)
    const { post } = await buildRuntime(dbPath)

    // No authority exists for this decision. /compile now derives the governed_tool_envelope
    // FROM the authority row (verifyGovernedToolEnvelopeLinkage runs before the authority-missing
    // check), so with no authority there is no envelope and the runtime fails closed one layer
    // earlier with governed_tool_envelope_missing. The intent — /compile fails closed (NULL) when
    // no authority backs the decision — is preserved; only the earliest fail-closed reason moved.
    const missing = await post('/compile', { decision_id: 'missing-authority', ...TEST_SNAPSHOT, ...epochFields() })
    assert.equal(missing.status, 'NULL')
    assert.equal(missing.reason, 'governed_tool_envelope_missing')

    const cases = [
      { status: 'REVOKED', reason: 'authority_revoked' },
      { status: 'CONSUMED', reason: 'authority_consumed' },
      { status: 'INACTIVE', reason: 'authority_not_active' },
      { status: '', reason: 'authority_not_active' }
    ]

    for (const c of cases) {
      const decision = `decision-${c.status || 'ambiguous'}`
      await seedAuthority(post, decision, dbPath)
      // Forcing the authority status must not clear the governed_tool_envelope binding, so the
      // request still passes the envelope linkage and reaches the authority-status assertion.
      runSqlite([dbPath, `UPDATE authority_registry SET status='${c.status}' WHERE decision_id='${decision}'`])
      const compiled = await post('/compile', { decision_id: decision, ...TEST_SNAPSHOT, ...epochFields() })
      assert.equal(compiled.status, 'NULL')
      assert.equal(compiled.reason, c.reason)
      assert.equal(runSqlite([dbPath, `SELECT COUNT(*) FROM aeo_registry WHERE decision_id='${decision}'`]).trim(), '0')
    }

    const expiredDecision = 'decision-expired'
    await seedAuthority(post, expiredDecision, dbPath)
    runSqlite([dbPath, `UPDATE authority_registry SET expiry='2000-01-01T00:00:00.000Z' WHERE decision_id='${expiredDecision}'`])
    const expired = await post('/compile', { decision_id: expiredDecision, ...TEST_SNAPSHOT, ...epochFields() })
    assert.equal(expired.status, 'NULL')
    assert.equal(expired.reason, 'authority_expired')
    assert.equal(runSqlite([dbPath, `SELECT COUNT(*) FROM aeo_registry WHERE decision_id='${expiredDecision}'`]).trim(), '0')

    const activeDecision = 'decision-active'
    await seedAuthority(post, activeDecision, dbPath)
    const first = await post('/compile', { decision_id: activeDecision, ...TEST_SNAPSHOT, ...epochFields() })
    const second = await post('/compile', { decision_id: activeDecision, ...TEST_SNAPSHOT, ...epochFields() })
    assert.equal(first.status, 'COMPILED')
    assert.equal(second.status, 'COMPILED')
    assert.equal(first.validated_object_hash, second.validated_object_hash)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
