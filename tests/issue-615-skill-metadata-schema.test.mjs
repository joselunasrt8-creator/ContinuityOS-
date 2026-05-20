import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeSkillMetadata,
  hashSkillMetadata,
  validateSkillMetadata
} from '../src/skill-metadata/validator.mjs';

const BASE_DIGEST = 'sha256:' + 'a'.repeat(64);

const p0Skill = {
  schema_version: 'SKILL_METADATA_SCHEMA_V1',
  skill_id: 'local.readonly.analysis',
  skill_version: '1.0.0',
  capabilities: ['read_repository'],
  allowed_targets: ['local_workspace'],
  risk_class: 'P0',
  required_authority: [],
  proof_requirements: ['execution_receipt'],
  provenance: {
    source: 'github',
    digest: BASE_DIGEST,
    signature_required: false
  },
  replay_semantics: {
    replay_domain: 'local_analysis',
    max_executions: 0
  }
};

const p3Skill = {
  schema_version: 'SKILL_METADATA_SCHEMA_V1',
  skill_id: 'production.deploy.workflow',
  skill_version: '2.4.1',
  capabilities: ['deploy_production', 'mutate_runtime'],
  allowed_targets: ['github_actions', 'cloudflare_workers'],
  risk_class: 'P3',
  required_authority: ['deploy_production'],
  proof_requirements: ['dsse', 'execution_receipt'],
  provenance: {
    source: 'ngc',
    digest: 'sha256:' + 'b'.repeat(64),
    signature_required: true
  },
  replay_semantics: {
    replay_domain: 'production_deploy',
    max_executions: 1
  }
};

test('valid P0 skill fixture validates', () => {
  const result = validateSkillMetadata(p0Skill);

  assert.equal(result.status, 'VALID');
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.ok(result.hash);
});

test('valid P3 skill fixture validates', () => {
  const result = validateSkillMetadata(p3Skill);

  assert.equal(result.status, 'VALID');
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('canonical serialization is deterministic', () => {
  const reordered = {
    replay_semantics: p0Skill.replay_semantics,
    provenance: p0Skill.provenance,
    proof_requirements: p0Skill.proof_requirements,
    required_authority: p0Skill.required_authority,
    risk_class: p0Skill.risk_class,
    allowed_targets: p0Skill.allowed_targets,
    capabilities: p0Skill.capabilities,
    skill_version: p0Skill.skill_version,
    skill_id: p0Skill.skill_id,
    schema_version: p0Skill.schema_version
  };

  assert.equal(
    canonicalizeSkillMetadata(reordered),
    canonicalizeSkillMetadata(p0Skill)
  );

  assert.equal(hashSkillMetadata(reordered), hashSkillMetadata(p0Skill));
});

test('missing required field fails closed', () => {
  const invalid = structuredClone(p0Skill);
  delete invalid.skill_id;

  const result = validateSkillMetadata(invalid);

  assert.equal(result.status, 'NULL');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes('skill_id')));
});

test('unknown field fails closed', () => {
  const invalid = {
    ...p0Skill,
    unauthorized_field: true
  };

  const result = validateSkillMetadata(invalid);

  assert.equal(result.status, 'NULL');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes('unauthorized_field')));
});

test('invalid risk class fails closed', () => {
  const invalid = {
    ...p3Skill,
    risk_class: 'P9'
  };

  const result = validateSkillMetadata(invalid);

  assert.equal(result.status, 'NULL');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes('risk_class')));
});

test('hash changes when canonical payload mutates', () => {
  const mutated = structuredClone(p3Skill);
  mutated.allowed_targets.push('direct_terminal');

  assert.notEqual(hashSkillMetadata(mutated), hashSkillMetadata(p3Skill));
});

test('duplicate capabilities fail closed', () => {
  const invalid = structuredClone(p0Skill);
  invalid.capabilities = ['read_repository', 'read_repository'];

  const result = validateSkillMetadata(invalid);

  assert.equal(result.status, 'NULL');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.includes('duplicate')));
});
