import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0025_runtime_evolution_consensus.sql', import.meta.url), 'utf8')

function between(start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

const consensusSource = between('type RuntimeEvolutionConsensusDriftClass', 'function continuityHashMaterial')
const routeSource = between('url.pathname === RUNTIME_EVOLUTION_CONSENSUS_ROUTE', 'if (NON_EXECUTABLE_OBSERVABILITY_ROUTES.includes')

class ConsensusD1 {
  constructor() { this.consensusWrites = 0 }
  prepare(sql) {
    const self = this
    return {
      bind() { return this },
      all() {
        if (/PRAGMA table_info\(runtime_evolution_consensus_registry\)/.test(sql)) {
          return Promise.resolve({ results: ['consensus_id', 'mutation_hash', 'canonical_hash', 'governance_scope', 'quorum_threshold', 'approval_count', 'approval_hash', 'consensus_status', 'replay_neutral', 'evidence_only', 'generated_at', 'created_at'].map((name) => ({ name })) })
        }
        return Promise.resolve({ results: [] })
      },
      first() { return Promise.resolve(null) },
      run() {
        if (/runtime_evolution_consensus_registry/i.test(sql)) {
          assert.match(sql, /^\s*(CREATE|INSERT OR IGNORE)/i)
          assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE)/i)
          if (/INSERT OR IGNORE INTO runtime_evolution_consensus_registry/i.test(sql)) self.consensusWrites += 1
        }
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

async function loadWorker() {
  const { transformSync } = await import('esbuild')
  return (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
}

function consensusParams(overrides = {}) {
  const input = {
    sco_hash: 'sco-hash',
    preo_hash: 'preo-hash',
    mutation_hash: 'mutation-hash',
    reviewed_commit_hash: 'commit-hash',
    runtime_scope: 'runtime-boundary',
    governance_scope: 'runtime-governance',
    quorum_threshold: '2',
    maintainer_set: 'alice,bob,carol',
    approvals: JSON.stringify([{ maintainer_id: 'alice' }, { maintainer_id: 'bob' }]),
    ...overrides
  }
  return new URLSearchParams(input).toString()
}

test('runtime evolution consensus object and helpers preserve exact deterministic object discipline', () => {
  for (const objectName of ['RuntimeEvolutionConsensusObject', 'RuntimeEvolutionConsensusEnvelope']) assert.match(consensusSource, new RegExp(`type ${objectName}`))
  for (const field of ['consensus_id', 'sco_hash', 'preo_hash', 'mutation_hash', 'canonical_hash', 'reviewed_commit_hash', 'runtime_scope', 'governance_scope', 'quorum_threshold', 'maintainer_set_hash', 'approval_lineage', 'replay_neutral', 'evidence_only', 'generated_at']) {
    assert.match(consensusSource, new RegExp(field), `${field} must be present`)
  }
  for (const helper of ['verifyRuntimeEvolutionConsensus', 'buildRuntimeEvolutionConsensusEnvelope', 'classifyRuntimeEvolutionDrift', 'deriveRuntimeEvolutionConsensusHash']) assert.match(consensusSource, new RegExp(`function ${helper}|async function ${helper}`))
  assert.match(consensusSource, /deriveRuntimeEvolutionConsensusHash\(object\)/)
  assert.match(consensusSource, /consensus_id: `runtime-evolution-consensus:\$\{canonical_hash\}`/)
  assert.match(consensusSource, /evidence_only: true/)
  assert.match(consensusSource, /mutation_capable: false/)
  assert.match(consensusSource, /execution_authority: false/)
})

test('deterministic consensus drift taxonomy covers fail-closed FATE cases', () => {
  for (const drift of ['quorum_divergence', 'maintainer_set_drift', 'governance_replay_attempt', 'approval_hash_mismatch', 'reviewed_commit_drift', 'mutation_scope_expansion', 'runtime_evolution_bypass', 'consensus_instability', 'non_deterministic_approval_order', 'federation_authority_inheritance_attempt']) {
    assert.match(consensusSource, new RegExp(`"${drift}"`), `${drift} must be classified`)
  }
  assert.match(consensusSource, /signerSet\.has\(approval\.maintainer_id\)/, 'duplicate maintainer approvals must fail closed')
  assert.match(consensusSource, /lineageSet\.has\(approval\.lineage_hash\) \|\| lineageSet\.has\(approval\.approval_hash\)/, 'replayed governance approvals must fail closed')
  assert.match(consensusSource, /approval\.reviewed_commit_hash !== object\.reviewed_commit_hash/, 'reviewed commit mismatch must fail closed')
  assert.match(consensusSource, /signerSet\.size < object\.quorum_threshold/, 'quorum instability must fail closed')
  assert.match(consensusSource, /approval\.mutation_hash !== object\.mutation_hash/, 'mutation hash drift must fail closed')
  assert.match(consensusSource, /inputOrder !== deterministicOrder/, 'maintainer ordering instability must fail closed')
  assert.match(consensusSource, /governance_scope\.includes\("global"\)/, 'governance scope expansion must fail closed')
  assert.match(consensusSource, /federation_authority_inheritance_attempt/, 'federation authority inheritance attempts must fail closed')
})

test('runtime evolution consensus registry is append-only evidence', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS runtime_evolution_consensus_registry/)
  for (const field of ['consensus_id', 'mutation_hash', 'canonical_hash', 'governance_scope', 'quorum_threshold', 'approval_count', 'approval_hash', 'consensus_status', 'replay_neutral', 'evidence_only', 'generated_at', 'created_at']) assert.match(migration, new RegExp(`${field} TEXT`))
  assert.match(migration, /CHECK \(replay_neutral='true'\)/)
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /trg_runtime_evolution_consensus_registry_no_update/)
  assert.match(migration, /trg_runtime_evolution_consensus_registry_no_delete/)
  assert.match(source, /INSERT OR IGNORE INTO runtime_evolution_consensus_registry/)
})

test('GET /governance/evolution/consensus is observability-only and deterministic', async () => {
  const worker = await loadWorker()
  const db = new ConsensusD1()
  const response = await worker.fetch(new Request(`https://runtime.test/governance/evolution/consensus?${consensusParams()}`, { method: 'GET' }), { DB: db })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.route, '/governance/evolution/consensus')
  assert.equal(body.consensus_result, 'VALID_CONSENSUS')
  assert.equal(body.evidence_only, true)
  assert.equal(body.replay_neutral, true)
  assert.equal(body.read_only, true)
  assert.equal(body.mutation_capable, false)
  assert.equal(body.execution_authority, false)
  assert.equal(body.remote_authority_inherited, false)
  assert.equal(body.runtime_mutated, false)
  assert.equal(body.governance_state_altered, false)
  assert.equal(db.consensusWrites, 1)
  assert.equal(body.canonical_hash, body.envelope.consensus_object.canonical_hash)
})

test('consensus route rejects mutation methods without creating execution authority', async () => {
  const worker = await loadWorker()
  const response = await worker.fetch(new Request('https://runtime.test/governance/evolution/consensus', { method: 'POST' }), { DB: new ConsensusD1() })
  const body = await response.json()
  assert.equal(response.status, 405)
  assert.equal(body.status, 'NULL')
  assert.equal(body.mutation_capable, false)
  assert.equal(body.evidence_only, true)
})

test('startup bootstrap validates consensus registry before append-only activation', () => {
  assert.match(source, /await validateRuntimeEvolutionConsensusRegistry\(env\)[\s\S]*BOOTSTRAP_RUNTIME_EVOLUTION_CONSENSUS_REGISTRY_VALIDATED[\s\S]*freezeRuntimeSovereignty/, 'consensus registry initialization must occur after schema stabilization and before sovereignty freeze')
  assert.match(source, /BOOTSTRAP_RUNTIME_EVOLUTION_CONSENSUS_REGISTRY_VALIDATED[\s\S]*activateAppendOnlyRegistryEnforcement\(env\)[\s\S]*BOOTSTRAP_APPEND_ONLY_TRIGGERS_ACTIVATED/, 'append-only enforcement activates only after registry validation')
  assert.match(source, /ensureRequiredSchemaColumns\(env\)[\s\S]*BOOTSTRAP_SCHEMA_INITIALIZED[\s\S]*validateRuntimeEvolutionConsensusRegistry\(env\)/, 'governance consensus must never execute before canonical schema validation')
})
