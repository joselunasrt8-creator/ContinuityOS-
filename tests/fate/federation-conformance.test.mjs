import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0021_federation_conformance.sql', import.meta.url), 'utf8')
const spec = JSON.parse(readFileSync(new URL('../../governance/runtime/FEDERATION_CONFORMANCE_SPEC.json', import.meta.url), 'utf8'))

function between(start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

const conformanceSource = between('type FederationConformanceDriftClass', 'async function detectFederatedCheckpointDrift')
const routeSource = between('url.pathname === "/federation/conformance"', 'url.pathname === "/federation/interoperability/checkpoint"')

class ConformanceD1 {
  prepare(sql) {
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() {
        if (/federation_conformance_registry/i.test(sql)) {
          assert.match(sql, /^\s*(CREATE|INSERT OR IGNORE|CREATE UNIQUE INDEX|CREATE INDEX|CREATE TRIGGER)/i)
          assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE)/i)
        }
        return Promise.resolve({ meta: { changes: 1 } })
      }
    }
  }
}

test('federation conformance governance spec is evidence-only and non-authoritative', () => {
  assert.equal(spec.route.path, '/federation/conformance')
  assert.equal(spec.route.execution_capability, false)
  assert.equal(spec.required_flags.evidence_only, true)
  assert.equal(spec.required_flags.remote_authority_denied, true)
  assert.equal(spec.required_flags.replay_neutral, true)
  assert.equal(spec.required_flags.read_only, true)
  assert.equal(spec.required_flags.mutation_capable, false)
  assert.equal(spec.governance_confirmations.no_authority_inheritance, true)
  assert.equal(spec.governance_confirmations.no_replay_consumption, true)
})

test('federation conformance objects and deterministic helpers are present', () => {
  for (const objectName of ['FederationConformanceResult', 'FederationSemanticMismatch', 'RuntimeSemanticFingerprint', 'FederationCompatibilityEnvelope', 'ConformanceCheckpoint']) {
    assert.match(source, new RegExp(`type ${objectName}`))
  }
  for (const helper of ['deriveRuntimeSemanticFingerprint', 'compareFederationSemantics', 'deriveConformanceCheckpoint', 'buildFederationCompatibilityEnvelope', 'detectSemanticConformanceDrift']) {
    assert.match(source, new RegExp(`function ${helper}|async function ${helper}`))
  }
  assert.match(conformanceSource, /evidence_only: true/)
  assert.match(conformanceSource, /remote_authority_denied: true/)
  assert.match(conformanceSource, /replay_neutral: true/)
  assert.match(conformanceSource, /read_only: true/)
  assert.match(conformanceSource, /mutation_capable: false/)
  assert.match(conformanceSource, /remote_authority_inherited: false/)
  assert.match(conformanceSource, /remote_execution_legitimacy: false/)
})

test('federation conformance drift classes are classified', () => {
  for (const drift of ['semantic_conformance_drift', 'checkpoint_semantic_mismatch', 'federation_policy_divergence', 'compression_semantic_instability', 'runtime_fingerprint_mismatch']) {
    assert.match(source, new RegExp(`"${drift}"`), `${drift} must exist in runtime taxonomy`)
    assert.match(conformanceSource, new RegExp(drift), `${drift} must be classified by conformance helpers`)
    assert.ok(spec.drift_classes.includes(drift), `${drift} must be in governance spec`)
  }
})

test('semantic conformance mismatch and runtime fingerprint corruption quarantine compatibility', () => {
  assert.match(conformanceSource, /runtime_semantic_fingerprint/)
  assert.match(conformanceSource, /runtime_fingerprint_mismatch/)
  assert.match(conformanceSource, /CONFORMANCE_QUARANTINED/)
  assert.match(conformanceSource, /fingerprint_hash/)
})

test('replay neutrality preservation and remote authority inheritance attempts are denied', () => {
  assert.match(conformanceSource, /replay_consumed: false/)
  assert.match(conformanceSource, /replay_state_consumed/)
  assert.match(conformanceSource, /remote_authority_inherited/)
  assert.match(conformanceSource, /remote_execution_legitimacy/)
  assert.match(conformanceSource, /accepted_authority/)
  assert.match(conformanceSource, /federation_policy_divergence/)
})

test('federation policy divergence and checkpoint semantic divergence are detected', () => {
  assert.match(conformanceSource, /policy_hash/)
  assert.match(conformanceSource, /federation_policy_divergence/)
  assert.match(conformanceSource, /conformance_checkpoint/)
  assert.match(conformanceSource, /checkpoint_semantic_mismatch/)
  assert.match(conformanceSource, /checkpoint_runtime_fingerprint_hash/)
})

test('federation conformance registry is append-only evidence', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS federation_conformance_registry/)
  assert.match(migration, /conformance_id TEXT PRIMARY KEY/)
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /CHECK \(remote_authority_denied='true'\)/)
  assert.match(migration, /CHECK \(read_only='true'\)/)
  assert.match(migration, /CHECK \(mutation_capable='false'\)/)
  assert.match(migration, /CHECK \(replay_neutral='true'\)/)
  assert.match(migration, /trg_federation_conformance_registry_no_update/)
  assert.match(migration, /trg_federation_conformance_registry_no_delete/)
  assert.match(source, /INSERT OR IGNORE INTO federation_conformance_registry/)
})

test('GET /federation/conformance is non-executable and replay-neutral', async () => {
  const { transformSync } = await import('esbuild')
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const response = await worker.fetch(new Request('https://runtime.test/federation/conformance', { method: 'GET' }), { DB: new ConformanceD1() })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.route, '/federation/conformance')
  assert.equal(body.evidence_only, true)
  assert.equal(body.remote_authority_denied, true)
  assert.equal(body.read_only, true)
  assert.equal(body.mutation_capable, false)
  assert.equal(body.replay_neutral, true)
  assert.equal(body.remote_authority_inherited, false)
  assert.equal(body.remote_execution_legitimacy, false)
  assert.equal(body.replay_consumed, false)
  assert.ok(body.federation_compatibility_envelope)
  assert.ok(body.runtime_semantic_fingerprint)
  assert.ok(body.conformance_checkpoint)
  assert.doesNotMatch(source, /CANONICAL_RUNTIME_ROUTES = \[[^\]]+federation\/conformance/)
  assert.match(routeSource, /observability_only/)
})
