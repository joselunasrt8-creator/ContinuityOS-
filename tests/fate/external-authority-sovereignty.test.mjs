import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0026_external_authority_registry.sql', import.meta.url), 'utf8')

class D1 {
  constructor() { this.statements = [] }
  prepare(sql) {
    this.statements.push(sql)
    return {
      bind() { return this },
      all() { return Promise.resolve({ results: [] }) },
      first() { return Promise.resolve(null) },
      run() { return Promise.resolve({ meta: { changes: 1 } }) }
    }
  }
}

async function worker() {
  const { transformSync } = await import('esbuild')
  return (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
}

test('external_authority_registry schema is append-only and contains required runtime fields', () => {
  for (const field of ['sovereignty_dependency_id', 'external_authority_surface', 'authority_origin', 'infrastructure_scope', 'bootstrap_trust_hash', 'sovereignty_classification', 'containment_state', 'observability_only', 'replay_neutral']) {
    assert.match(source, new RegExp(field), `runtime must include ${field}`)
    assert.match(migration, new RegExp(field), `migration must include ${field}`)
  }
  assert.match(source, /CREATE TABLE IF NOT EXISTS external_authority_registry/)
  assert.match(source, /trg_external_authority_registry_no_update[\s\S]*external_authority_registry is append-only/)
  assert.match(source, /trg_external_authority_registry_no_delete[\s\S]*external_authority_registry is append-only/)
  assert.match(migration, /BEFORE UPDATE ON external_authority_registry/)
  assert.match(migration, /BEFORE DELETE ON external_authority_registry/)
})

test('sovereignty dependency taxonomy covers required external authority drift classes', () => {
  for (const drift of ['external_authority_drift', 'sovereignty_boundary_fragmentation', 'deploy_authority_escape', 'bootstrap_trust_divergence', 'undeclared_execution_surface', 'infrastructure_authority_expansion', 'hidden_mutation_surface']) {
    assert.match(source, new RegExp(`"${drift}"`), `${drift} must be classified`)
  }
  for (const invariant of ['create_authority', 'bypass_validation', 'mutate_legitimacy', 'consume_replay_state', 'inherit_execution_legitimacy']) {
    assert.match(source, new RegExp(invariant), `${invariant} must be prohibited`)
  }
  for (const allowed of ['host', 'transport', 'observe', 'schedule']) {
    assert.match(source, new RegExp(`"${allowed}"`), `${allowed} must be an allowed infrastructure function`)
  }
})

test('GET /runtime/sovereignty/external-authority emits contained append-only evidence without authority', async () => {
  const runtime = await worker()
  const db = new D1()
  const response = await runtime.fetch(new Request('https://runtime.test/runtime/sovereignty/external-authority?surface=github_actions_governed_deploy'), { DB: db })
  const observed = await response.json()

  assert.equal(observed.status, 'EXTERNAL_AUTHORITY_CONTAINED')
  assert.equal(observed.evidence_only, true)
  assert.equal(observed.read_only, true)
  assert.equal(observed.mutation_capable, false)
  assert.equal(observed.replay_neutral, true)
  assert.equal(observed.authoritative, false)
  assert.equal(observed.creates_authority, false)
  assert.equal(observed.bypass_governance, false)
  assert.equal(observed.append_only, true)
  assert.equal(observed.dependency.observability_only, true)
  assert.equal(observed.dependency.replay_neutral, true)
  assert.equal(observed.dependency.containment_state, 'CLASSIFIED_BOUNDED_OBSERVABLE_REPLAY_NEUTRAL')
  assert.ok(db.statements.some((sql) => sql.includes('INSERT OR IGNORE INTO external_authority_registry')))
})

test('external authority route fails closed for undeclared surfaces, deploy escape, trust divergence, replay bypass, fragmentation, and hidden mutation', async () => {
  const runtime = await worker()
  const cases = [
    ['undeclared external authority surfaces', 'surface=shadow_runner', 'undeclared_execution_surface'],
    ['hidden deploy-capable routes', 'surface=github_actions_governed_deploy&deploy_capable=true', 'deploy_authority_escape'],
    ['workflow trust divergence', 'surface=github_actions_governed_deploy&bootstrap_trust_hash=diverged', 'bootstrap_trust_divergence'],
    ['bootstrap authority mismatch', 'surface=github_actions_governed_deploy&authority_origin=manual_console', 'bootstrap_trust_divergence'],
    ['runtime sovereignty fragmentation', 'surface=github_actions_governed_deploy&infrastructure_scope=global:*:remote_authority', 'sovereignty_boundary_fragmentation'],
    ['infrastructure replay bypass attempts', 'surface=github_actions_governed_deploy&replay_neutral=false&consume_replay_state=true', 'external_authority_drift'],
    ['deploy authority escape paths', 'surface=github_actions_governed_deploy&command=wrangler%20deploy', 'deploy_authority_escape'],
    ['authority expansion attempts', 'surface=github_actions_governed_deploy&creates_authority=true&bypass_validation=true&inherit_execution_legitimacy=true', 'infrastructure_authority_expansion'],
    ['hidden mutation surfaces', 'surface=github_actions_governed_deploy&mutation_capable=true&hidden_mutation=true', 'hidden_mutation_surface']
  ]

  for (const [label, query, drift] of cases) {
    const observed = await (await runtime.fetch(new Request(`https://runtime.test/runtime/sovereignty/external-authority?${query}`), { DB: new D1() })).json()
    assert.equal(observed.status, 'EXTERNAL_AUTHORITY_DRIFT', label)
    assert.equal(observed.fail_closed, true, label)
    assert.equal(observed.evidence_only, true, label)
    assert.equal(observed.read_only, true, label)
    assert.equal(observed.mutation_capable, false, label)
    assert.equal(observed.replay_neutral, true, label)
    assert.equal(observed.authoritative, false, label)
    assert.ok(observed.drift_classes.includes(drift), `${label} must include ${drift}`)
  }
})


test('GET /runtime/sovereignty/infrastructure-reconciliation deterministically reconciles classified dependencies without authority', async () => {
  const runtime = await worker()
  const db = new D1()
  const response = await runtime.fetch(new Request('https://runtime.test/runtime/sovereignty/infrastructure-reconciliation'), { DB: db })
  const observed = await response.json()

  assert.equal(observed.status, 'INFRASTRUCTURE_DEPENDENCY_RECONCILED')
  assert.equal(observed.evidence_only, true)
  assert.equal(observed.read_only, true)
  assert.equal(observed.mutation_capable, false)
  assert.equal(observed.replay_neutral, true)
  assert.equal(observed.authoritative, false)
  assert.equal(observed.creates_authority, false)
  assert.equal(observed.bypass_governance, false)
  assert.equal(observed.append_only, true)
  assert.equal(observed.fail_closed, false)
  assert.equal(observed.reconciliation.closure_condition, 'classified->bounded->observable->replay-neutral->sovereignty-contained')
  assert.equal(observed.reconciliation.local_validation_supremacy, true)
  assert.equal(observed.reconciliation.exact_object_execution_legitimacy_preserved, true)
  assert.equal(observed.reconciliation.replay_state_consumed, false)
  assert.equal(observed.reconciliation.authority_created, false)
  assert.ok(observed.reconciliation.dependencies.length >= 1)
  assert.ok(observed.reconciliation.dependencies.every((dependency) => dependency.observability_only === true && dependency.replay_neutral === true))
  assert.ok(db.statements.some((sql) => sql.includes('INSERT OR IGNORE INTO external_authority_registry')))
})

test('infrastructure dependency reconciliation fails closed for undeclared or escaping dependency probes', async () => {
  const runtime = await worker()
  const observed = await (await runtime.fetch(new Request('https://runtime.test/runtime/sovereignty/infrastructure-reconciliation?surface=shadow_runner&deploy_capable=true'), { DB: new D1() })).json()

  assert.equal(observed.status, 'INFRASTRUCTURE_DEPENDENCY_DRIFT')
  assert.equal(observed.fail_closed, true)
  assert.equal(observed.evidence_only, true)
  assert.equal(observed.read_only, true)
  assert.equal(observed.mutation_capable, false)
  assert.equal(observed.replay_neutral, true)
  assert.equal(observed.authoritative, false)
  assert.ok(observed.drift_classes.includes('undeclared_execution_surface'))
  assert.ok(observed.drift_classes.includes('deploy_authority_escape'))
})
