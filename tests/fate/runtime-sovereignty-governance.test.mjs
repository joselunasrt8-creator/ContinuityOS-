import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RULES = JSON.parse(readFileSync(new URL('../../runtime/runtime_sovereignty_rules.json', import.meta.url), 'utf8'))
const EVOLUTION = JSON.parse(readFileSync(new URL('../../runtime/governance_evolution_constraints.json', import.meta.url), 'utf8'))
const VALIDATOR = JSON.parse(readFileSync(new URL('../../runtime/validator_integrity_rules.json', import.meta.url), 'utf8'))
const FORK = JSON.parse(readFileSync(new URL('../../runtime/runtime_fork_detection.json', import.meta.url), 'utf8'))
const RECURSIVE = JSON.parse(readFileSync(new URL('../../runtime/recursive_governance_constraints.json', import.meta.url), 'utf8'))
const CHECKPOINT = JSON.parse(readFileSync(new URL('../../runtime/sovereignty_checkpoint_rules.json', import.meta.url), 'utf8'))
const BYPASS = JSON.parse(readFileSync(new URL('../../runtime/runtime_mutation_bypass_paths.json', import.meta.url), 'utf8'))

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/runtime-sovereignty/${name}.json`, import.meta.url), 'utf8'))
}

function evaluate(event) {
  if (event.sovereign_lineage === false) return 'NULL'
  if (event.validator_self_mutation === true) return 'NULL'
  if (event.governance_fork === true) return 'NULL'
  if (event.schema_proof === false) return 'NULL'
  if (event.recursive_escalation === true) return 'NULL'
  if (event.policy_mutated_after_validation === true) return 'NULL'
  if (event.runtime_hash_divergence === true) return 'NULL'
  if (event.validator_downgrade === true) return 'NULL'
  if (event.checkpoint_match === false) return 'NULL'
  if (event.self_authorizing === true) return 'NULL'
  if (event.self_modifying_governance === true) return 'NULL'
  return 'VALID'
}

test('runtime sovereignty governance artifacts remain fail-closed and additive', () => {
  assert.equal(RULES.invariants.runtime_mutation_without_sovereign_lineage, 'NULL')
  assert.equal(RULES.invariants.validator_self_authorization, 'NULL')
  assert.equal(RULES.invariants.governance_fork_detected, 'NULL')
  assert.equal(RULES.invariants.schema_evolution_without_proof, 'NULL')
  assert.equal(RULES.invariants.recursive_authority_escalation, 'NULL')
  assert.equal(RULES.invariants.policy_mutation_after_validation, 'NULL')
  assert.equal(RULES.invariants.runtime_hash_divergence, 'NULL')
  assert.equal(RULES.invariants.validator_downgrade_detected, 'NULL')
  assert.equal(RULES.invariants.sovereignty_checkpoint_mismatch, 'NULL')
  assert.equal(RULES.invariants.self_modifying_governance, 'NULL')

  assert.equal(EVOLUTION.post_validation_mutation, 'NULL')
  assert.equal(EVOLUTION.self_authorizing_evolution, 'NULL')
  assert.equal(VALIDATOR.validator_self_replacement, 'NULL')
  assert.equal(VALIDATOR.validator_downgrade, 'NULL')
  assert.equal(FORK.fork_legitimacy, 'NULL')
  assert.equal(FORK.runtime_hash_divergence, 'NULL')
  assert.equal(RECURSIVE.recursive_authority_escalation, 'NULL')
  assert.equal(RECURSIVE.recursive_bypass_insertion, 'NULL')
  assert.equal(CHECKPOINT.checkpoint_mismatch, 'NULL')
  assert.equal(CHECKPOINT.checkpoint_replay_resurrection, 'NULL')
  assert.equal(BYPASS.fail_closed_response, 'NULL')
})

test('validator self-mutation resolves to NULL', () => assert.equal(evaluate(fixture('validator_self_mutation')), 'NULL'))
test('governance forks resolve to NULL', () => assert.equal(evaluate(fixture('governance_fork')), 'NULL'))
test('unauthorized schema evolution resolves to NULL', () => assert.equal(evaluate(fixture('schema_drift')), 'NULL'))
test('recursive escalation resolves to NULL', () => assert.equal(evaluate(fixture('recursive_escalation')), 'NULL'))
test('downgrade attacks resolve to NULL', () => assert.equal(evaluate(fixture('downgrade_attack')), 'NULL'))
test('policy mutation after validation resolves to NULL', () => assert.equal(evaluate(fixture('policy_mutation')), 'NULL'))
test('runtime mutation without sovereign lineage resolves to NULL', () => assert.equal(evaluate(fixture('unauthorized_runtime_patch')), 'NULL'))
test('sovereignty checkpoint mismatch resolves to NULL', () => assert.equal(evaluate(fixture('sovereignty_checkpoint_mismatch')), 'NULL'))
test('self-authorizing runtime evolution resolves to NULL', () => assert.equal(evaluate(fixture('self_authorizing_runtime')), 'NULL'))

test('only sovereign-governed runtime evolution reaches VALID', () => {
  assert.equal(evaluate(fixture('canonical_runtime_evolution')), 'VALID')
})
