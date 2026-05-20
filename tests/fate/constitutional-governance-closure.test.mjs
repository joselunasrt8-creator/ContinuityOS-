import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RULES = JSON.parse(readFileSync(new URL('../../runtime/constitutional_governance_rules.json', import.meta.url), 'utf8'))
const ROOT = JSON.parse(readFileSync(new URL('../../runtime/root_authority_constraints.json', import.meta.url), 'utf8'))
const META = JSON.parse(readFileSync(new URL('../../runtime/meta_policy_integrity_rules.json', import.meta.url), 'utf8'))
const RECURSIVE = JSON.parse(readFileSync(new URL('../../runtime/recursive_governance_boundaries.json', import.meta.url), 'utf8'))
const EMERGENCY = JSON.parse(readFileSync(new URL('../../runtime/emergency_override_constraints.json', import.meta.url), 'utf8'))
const FORK = JSON.parse(readFileSync(new URL('../../runtime/constitutional_fork_detection.json', import.meta.url), 'utf8'))
const CHECKPOINT = JSON.parse(readFileSync(new URL('../../runtime/constitutional_checkpoint_rules.json', import.meta.url), 'utf8'))
const BYPASS = JSON.parse(readFileSync(new URL('../../runtime/constitutional_bypass_paths.json', import.meta.url), 'utf8'))
const RECURSION = JSON.parse(readFileSync(new URL('../../runtime/governance_recursion_constraints.json', import.meta.url), 'utf8'))

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/constitutional-lineage/${name}.json`, import.meta.url), 'utf8'))
}

function evaluate(event) {
  if (event.constitutional_lineage === false) return 'NULL'
  if (event.root_authority_escalation === true) return 'NULL'
  if (event.recursive_governance_override === true) return 'NULL'
  if (event.emergency_override_without_proof === true) return 'NULL'
  if (event.governance_fork_sovereignty === true) return 'NULL'
  if (event.constitutional_replay === true) return 'NULL'
  if (event.meta_policy_mutation === true) return 'NULL'
  if (event.recursive_validator_takeover === true) return 'NULL'
  if (event.hidden_constitutional_capability === true) return 'NULL'
  if (event.constitutional_split_brain === true) return 'NULL'
  if (event.detached_constitutional_continuation === true) return 'NULL'
  if (event.constitutional_downgrade === true) return 'NULL'
  if (event.quorum_without_constitutional_authority === true) return 'NULL'
  if (event.constitutional_validation === false) return 'NULL'
  if (event.sovereignty_valid === false) return 'NULL'
  return 'VALID'
}

test('constitutional governance closure artifacts remain deterministic and fail-closed', () => {
  assert.equal(RULES.invariants.constitutional_mutation_without_lineage, 'NULL')
  assert.equal(RULES.invariants.root_authority_escalation, 'NULL')
  assert.equal(RULES.invariants.recursive_governance_override, 'NULL')
  assert.equal(RULES.invariants.emergency_bypass_without_constitutional_proof, 'NULL')
  assert.equal(RULES.invariants.governance_fork_sovereignty, 'NULL')
  assert.equal(RULES.invariants.constitutional_replay_resurrection, 'NULL')
  assert.equal(RULES.invariants.meta_policy_mutation_after_validation, 'NULL')
  assert.equal(RULES.invariants.recursive_validator_takeover, 'NULL')
  assert.equal(RULES.invariants.self_expanding_governance, 'NULL')
  assert.equal(RULES.invariants.hidden_constitutional_capability, 'NULL')
  assert.equal(RULES.invariants.constitutional_divergence, 'NULL')
  assert.equal(RULES.invariants.constitutional_downgrade_detected, 'NULL')
  assert.equal(RULES.invariants.meta_policy_replay, 'NULL')
  assert.equal(RULES.invariants.detached_constitutional_continuation, 'NULL')
  assert.equal(RULES.invariants.quorum_without_constitutional_authority, 'NULL')
  assert.equal(RULES.invariants.constitutional_split_brain, 'NULL')

  assert.equal(ROOT.root_authority_escalation, 'NULL')
  assert.equal(META.meta_policy_mutation_after_validation, 'NULL')
  assert.equal(RECURSIVE.recursive_governance_override, 'NULL')
  assert.equal(EMERGENCY.emergency_bypass_without_constitutional_proof, 'NULL')
  assert.equal(FORK.governance_fork_sovereignty, 'NULL')
  assert.equal(CHECKPOINT.constitutional_replay_resurrection, 'NULL')
  assert.equal(BYPASS.hidden_constitutional_capability, 'NULL')
  assert.equal(RECURSION.recursive_validator_takeover, 'NULL')
})

test('root authority escalation resolves to NULL', () => assert.equal(evaluate(fixture('root_authority_escalation')), 'NULL'))
test('emergency override without constitutional proof resolves to NULL', () => assert.equal(evaluate(fixture('emergency_override_without_proof')), 'NULL'))
test('governance fork sovereignty resolves to NULL', () => assert.equal(evaluate(fixture('governance_fork_sovereignty')), 'NULL'))
test('recursive governance override resolves to NULL', () => assert.equal(evaluate(fixture('recursive_governance_override')), 'NULL'))
test('constitutional replay resurrection resolves to NULL', () => assert.equal(evaluate(fixture('constitutional_replay')), 'NULL'))
test('meta-policy mutation resolves to NULL', () => assert.equal(evaluate(fixture('meta_policy_mutation')), 'NULL'))
test('recursive validator takeover resolves to NULL', () => assert.equal(evaluate(fixture('recursive_validator_takeover')), 'NULL'))
test('hidden constitutional capability insertion resolves to NULL', () => assert.equal(evaluate(fixture('hidden_constitutional_capability')), 'NULL'))
test('constitutional split-brain resolves to NULL', () => assert.equal(evaluate(fixture('constitutional_split_brain')), 'NULL'))
test('detached constitutional continuation resolves to NULL', () => assert.equal(evaluate(fixture('detached_constitutional_continuation')), 'NULL'))
test('constitutional downgrade attacks resolve to NULL', () => assert.equal(evaluate(fixture('constitutional_downgrade')), 'NULL'))
test('quorum without constitutional authority resolves to NULL', () => assert.equal(evaluate(fixture('quorum_without_constitutional_authority')), 'NULL'))

test('only constitutionally-governed sovereign lineage reaches VALID', () => {
  assert.equal(evaluate(fixture('canonical_constitutional_lineage')), 'VALID')
})
