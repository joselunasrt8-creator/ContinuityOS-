import { createHash } from 'node:crypto';

export const SKILL_METADATA_SCHEMA_VERSION = 'SKILL_METADATA_SCHEMA_V1';

const REQUIRED_FIELDS = [
  'schema_version',
  'skill_id',
  'skill_version',
  'capabilities',
  'allowed_targets',
  'risk_class',
  'required_authority',
  'proof_requirements',
  'provenance',
  'replay_semantics'
];

const ALLOWED_FIELDS = new Set(REQUIRED_FIELDS);
const RISK_CLASSES = new Set(['P0', 'P1', 'P2', 'P3']);
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._-]+)?$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function canonicalizeSkillMetadata(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeSkillMetadata(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeSkillMetadata(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function hashSkillMetadata(value) {
  return createHash('sha256').update(canonicalizeSkillMetadata(value)).digest('hex');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateNameArray(value, field, errors, { minItems = 0 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${field}: expected array`);
    return;
  }

  if (value.length < minItems) errors.push(`${field}: requires at least ${minItems} item(s)`);
  if (new Set(value).size !== value.length) errors.push(`${field}: duplicate values are not allowed`);

  for (const item of value) {
    if (typeof item !== 'string' || !NAME_PATTERN.test(item)) {
      errors.push(`${field}: invalid capability name ${JSON.stringify(item)}`);
    }
  }
}

export function validateSkillMetadata(candidate) {
  const errors = [];

  if (!isPlainObject(candidate)) {
    return { status: 'NULL', valid: false, errors: ['skill_metadata: expected object'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in candidate)) errors.push(`${field}: missing required field`);
  }

  for (const field of Object.keys(candidate)) {
    if (!ALLOWED_FIELDS.has(field)) errors.push(`${field}: unknown field`);
  }

  if (candidate.schema_version !== SKILL_METADATA_SCHEMA_VERSION) {
    errors.push('schema_version: must equal SKILL_METADATA_SCHEMA_V1');
  }

  if (typeof candidate.skill_id !== 'string' || !NAME_PATTERN.test(candidate.skill_id) || candidate.skill_id.length < 3) {
    errors.push('skill_id: invalid skill identifier');
  }

  if (typeof candidate.skill_version !== 'string' || !VERSION_PATTERN.test(candidate.skill_version)) {
    errors.push('skill_version: invalid semantic version');
  }

  validateNameArray(candidate.capabilities, 'capabilities', errors, { minItems: 1 });
  validateNameArray(candidate.allowed_targets, 'allowed_targets', errors, { minItems: 1 });
  validateNameArray(candidate.required_authority, 'required_authority', errors);
  validateNameArray(candidate.proof_requirements, 'proof_requirements', errors);

  if (!RISK_CLASSES.has(candidate.risk_class)) errors.push('risk_class: must be P0, P1, P2, or P3');

  if (!isPlainObject(candidate.provenance)) {
    errors.push('provenance: expected object');
  } else {
    const provenanceKeys = new Set(Object.keys(candidate.provenance));
    for (const required of ['source', 'digest', 'signature_required']) {
      if (!provenanceKeys.has(required)) errors.push(`provenance.${required}: missing required field`);
    }
    for (const key of provenanceKeys) {
      if (!['source', 'digest', 'signature_required'].includes(key)) errors.push(`provenance.${key}: unknown field`);
    }
    if (typeof candidate.provenance.source !== 'string' || candidate.provenance.source.length < 1) {
      errors.push('provenance.source: invalid source');
    }
    if (typeof candidate.provenance.digest !== 'string' || !DIGEST_PATTERN.test(candidate.provenance.digest)) {
      errors.push('provenance.digest: invalid sha256 digest');
    }
    if (typeof candidate.provenance.signature_required !== 'boolean') {
      errors.push('provenance.signature_required: expected boolean');
    }
  }

  if (!isPlainObject(candidate.replay_semantics)) {
    errors.push('replay_semantics: expected object');
  } else {
    const replayKeys = new Set(Object.keys(candidate.replay_semantics));
    for (const required of ['replay_domain', 'max_executions']) {
      if (!replayKeys.has(required)) errors.push(`replay_semantics.${required}: missing required field`);
    }
    for (const key of replayKeys) {
      if (!['replay_domain', 'max_executions'].includes(key)) errors.push(`replay_semantics.${key}: unknown field`);
    }
    if (typeof candidate.replay_semantics.replay_domain !== 'string' || !NAME_PATTERN.test(candidate.replay_semantics.replay_domain)) {
      errors.push('replay_semantics.replay_domain: invalid replay domain');
    }
    if (!Number.isInteger(candidate.replay_semantics.max_executions) || candidate.replay_semantics.max_executions < 0) {
      errors.push('replay_semantics.max_executions: expected non-negative integer');
    }
  }

  if (errors.length > 0) return { status: 'NULL', valid: false, errors };

  return {
    status: 'VALID',
    valid: true,
    errors: [],
    canonical: canonicalizeSkillMetadata(candidate),
    hash: hashSkillMetadata(candidate)
  };
}
