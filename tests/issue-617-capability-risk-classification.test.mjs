import test from 'node:test';
import assert from 'node:assert/strict';

import classification from '../governance/CAPABILITY_RISK_CLASSIFICATION_V1.json' with { type: 'json' };
import {
  CAPABILITY_RISK_CLASSES,
  getRiskClassProfile,
  validateRiskClass
} from '../src/lib/capability-risk-classification.js';

test('CAPABILITY_RISK_CLASSIFICATION_V1 supports deterministic P0/P1/P2/P3 validation', () => {
  assert.equal(classification.schema_version, 'CAPABILITY_RISK_CLASSIFICATION_V1');
  assert.deepEqual(CAPABILITY_RISK_CLASSES, ['P0', 'P1', 'P2', 'P3']);

  for (const riskClass of ['P0', 'P1', 'P2', 'P3']) {
    assert.equal(validateRiskClass(riskClass), riskClass);
    const profile = getRiskClassProfile(riskClass);
    assert.ok(profile);
    assert.equal(profile.risk_class, riskClass);
    assert.equal(typeof profile.required_authority_depth, 'number');
    assert.ok(Array.isArray(profile.proof_requirements));
    assert.equal(typeof profile.review_depth, 'string');
    assert.equal(typeof profile.replay_expectation, 'string');
  }
});

test('unknown risk class fails closed to NULL', () => {
  assert.equal(validateRiskClass('P9'), null);
  assert.equal(validateRiskClass(''), null);
  assert.equal(validateRiskClass(undefined), null);
  assert.equal(getRiskClassProfile('P9'), null);
});

test('classification metadata does not create authority or execution permission', () => {
  for (const riskClass of ['P0', 'P1', 'P2', 'P3']) {
    const profile = getRiskClassProfile(riskClass);
    assert.equal(profile.creates_authority, false);
    assert.equal(profile.grants_execution_permission, false);
  }

  assert.equal(classification.determinism.capability_metadata_is_not_authority, true);
  assert.equal(classification.determinism.runtime_route_expansion, false);
  assert.equal(classification.determinism.execution_path_creation, false);
  assert.equal(classification.determinism.authority_creation, false);
  assert.equal(classification.determinism.validator_bypass, false);
  assert.equal(classification.determinism.fail_closed, true);
});
