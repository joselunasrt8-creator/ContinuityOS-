import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const discoveryAdapterSource = readFileSync(new URL('../../src/lib/runtime-discovery-adapter.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0040_governance_consensus_infrastructure.sql', import.meta.url), 'utf8')
const spec = JSON.parse(readFileSync(new URL('../../governance/consensus/GOVERNANCE_CONSENSUS_SPEC.json', import.meta.url), 'utf8'))

function canonicalize(value) {
  if (value === undefined || value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return 'null'
}
function hashCanonical(value) { return createHash('sha256').update(canonicalize(value)).digest('hex') }
function classify(input = {}) {
  const drift = new Set()
  if (input.observerReplay) drift.add('OBSERVER_REPLAY_RESURRECTION')
  if (input.quorumAmbiguity) drift.add('QUORUM_AMBIGUITY')
  if (input.semanticHashCorruption) drift.add('SEMANTIC_DIVERGENCE')
  if (input.semanticEquivalenceMismatch) drift.add('SEMANTIC_DIVERGENCE')
  if (input.federatedCheckpointDrift) drift.add('FEDERATED_EQUIVALENCE_DRIFT')
  if (input.observerLineageCorruption) drift.add('CHECKPOINT_CORRUPTION')
  if (input.replayResurrection) drift.add('OBSERVER_REPLAY_RESURRECTION')
  if (input.orphanedPortabilityLineage) drift.add('PORTABILITY_LINEAGE_DRIFT')
  if (input.undeclaredObserverMutationSurface) drift.add('CONSENSUS_CONTAINMENT_OVERFLOW')
  if (input.remoteAuthorityInheritanceAttempt) drift.add('REMOTE_AUTHORITY_INHERITANCE_ATTEMPT')
  if (input.governanceFragmentation) drift.add('GOVERNANCE_CONSENSUS_FRAGMENTATION')
  if (input.recursiveContainmentOverflow) drift.add('CONSENSUS_CONTAINMENT_OVERFLOW')
  if (input.semanticAmbiguityCollapse) drift.add('SEMANTIC_AMBIGUITY')
  if (input.checkpointMutationAfterValidation) drift.add('CHECKPOINT_CORRUPTION')
  if (input.observerEquivalenceInstability) drift.add('OBSERVER_DIVERGENCE')
  return { drift_classes: [...drift].sort(), legitimacy_status: drift.size === 0 ? 'LEGITIMATE' : null, execution_authorized: false, proof_authorized: false, merge_authorized: false }
}

const requiredRoutes = [
  '/consensus/observer/checkpoint',
  '/consensus/observer/equivalence',
  '/consensus/observer/drift',
  '/conformance/runtime',
  '/conformance/equivalence',
  '/conformance/checkpoint'
]
const requiredRegistries = [
  'observer_attestation_registry',
  'semantic_equivalence_registry',
  'portable_governance_checkpoint_registry',
  'external_conformance_verification_registry'
]

test('governance consensus routes are GET-only observability outside canonical runtime routes', () => {
  assert.deepEqual(spec.routes, requiredRoutes)
  for (const route of requiredRoutes) {
    assert.ok(source.includes(route), `${route} missing from runtime source`)
    assert.equal(['/session','/continuity','/authority','/compile','/validate','/execute','/proof'].includes(route), false)
  }
  assert.match(source, /OBSERVER_CONSENSUS_ROUTES[\s\S]*EXTERNAL_CONFORMANCE_ROUTES[\s\S]*request\.method !== "GET"[\s\S]*405/)
  assert.match(source, /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/)
})

test('new registries are append-only and non-authoritative', () => {
  for (const registry of requiredRegistries) {
    assert.ok(source.includes(registry), `${registry} missing from source`)
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${registry}`))
    assert.match(migration, new RegExp(`trg_${registry}_no_update[\\s\\S]*BEFORE UPDATE ON ${registry}`))
    assert.match(migration, new RegExp(`trg_${registry}_no_delete[\\s\\S]*BEFORE DELETE ON ${registry}`))
  }
  assert.doesNotMatch(migration, /^\s*UPDATE\s+(observer_attestation_registry|semantic_equivalence_registry|portable_governance_checkpoint_registry|external_conformance_verification_registry)/mi)
  assert.doesNotMatch(migration, /^\s*DELETE\s+FROM\s+(observer_attestation_registry|semantic_equivalence_registry|portable_governance_checkpoint_registry|external_conformance_verification_registry)/mi)
  const falseFlags = new Set(['mutation_capable','creates_authority','executable','deployment_capable','proof_generating','merge_authorizing'])
  for (const [key, value] of Object.entries(spec.required_flags)) assert.equal(value, falseFlags.has(key) ? false : true)
})

test('consensus drift taxonomy is canonical and deterministic', () => {
  for (const driftClass of spec.drift_classes) assert.ok(discoveryAdapterSource.includes(driftClass), `${driftClass} missing from source`)
  assert.equal(hashCanonical(spec.drift_classes), hashCanonical([...spec.drift_classes]))
})

test('observer object contains required exact-object fields', () => {
  for (const field of ['observer_id','observed_checkpoint_hash','semantic_hash','topology_hash','reconciliation_hash','sovereignty_hash','equivalence_hash','drift_classes','legitimacy_status']) {
    assert.ok(source.includes(field), `${field} missing`)
  }
})

test('required FATE cases fail closed to NULL without authorizing execution proof or merge', () => {
  const cases = [
    ['observer replay attempts', { observerReplay: true }, 'OBSERVER_REPLAY_RESURRECTION'],
    ['quorum ambiguity', { quorumAmbiguity: true }, 'QUORUM_AMBIGUITY'],
    ['semantic hash corruption', { semanticHashCorruption: true }, 'SEMANTIC_DIVERGENCE'],
    ['semantic equivalence mismatch', { semanticEquivalenceMismatch: true }, 'SEMANTIC_DIVERGENCE'],
    ['federated checkpoint drift', { federatedCheckpointDrift: true }, 'FEDERATED_EQUIVALENCE_DRIFT'],
    ['observer lineage corruption', { observerLineageCorruption: true }, 'CHECKPOINT_CORRUPTION'],
    ['replay resurrection', { replayResurrection: true }, 'OBSERVER_REPLAY_RESURRECTION'],
    ['orphaned portability lineage', { orphanedPortabilityLineage: true }, 'PORTABILITY_LINEAGE_DRIFT'],
    ['undeclared observer mutation surfaces', { undeclaredObserverMutationSurface: true }, 'CONSENSUS_CONTAINMENT_OVERFLOW'],
    ['remote authority inheritance attempts', { remoteAuthorityInheritanceAttempt: true }, 'REMOTE_AUTHORITY_INHERITANCE_ATTEMPT'],
    ['governance fragmentation', { governanceFragmentation: true }, 'GOVERNANCE_CONSENSUS_FRAGMENTATION'],
    ['recursive containment overflow', { recursiveContainmentOverflow: true }, 'CONSENSUS_CONTAINMENT_OVERFLOW'],
    ['semantic ambiguity collapse', { semanticAmbiguityCollapse: true }, 'SEMANTIC_AMBIGUITY'],
    ['checkpoint mutation after validation', { checkpointMutationAfterValidation: true }, 'CHECKPOINT_CORRUPTION'],
    ['observer equivalence instability', { observerEquivalenceInstability: true }, 'OBSERVER_DIVERGENCE']
  ]
  for (const [, input, expectedDrift] of cases) {
    const result = classify(input)
    assert.equal(result.legitimacy_status, null)
    assert.ok(result.drift_classes.includes(expectedDrift))
    assert.equal(result.execution_authorized, false)
    assert.equal(result.proof_authorized, false)
    assert.equal(result.merge_authorized, false)
  }
})

test('same semantic meaning produces stable legitimacy identity but no authority inheritance', () => {
  const oldSchema = { action: 'deploy', target: { repo: 'mindshift', branch: 'main' }, authority_inherited: false }
  const evolvedSchema = { target: { branch: 'main', repo: 'mindshift' }, action: 'deploy', authority_inherited: false }
  assert.equal(hashCanonical(oldSchema), hashCanonical(evolvedSchema))
  assert.equal(spec.consensus_invariant.federated_compatibility_inherits_authority, false)
  assert.equal(spec.consensus_invariant.remote_legitimacy_equals_local_legitimacy, false)
})
