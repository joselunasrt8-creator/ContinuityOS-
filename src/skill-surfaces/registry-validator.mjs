import { canonicalize, hashCanonical } from '../canonical.js';
import { isPlainObject, validateNameArray } from '../lib/validation-helpers.mjs';
import { validateRiskClass } from '../lib/capability-risk-classification.js';

export const SKILL_SURFACES_REGISTRY_VERSION = 'SKILL_SURFACES_REGISTRY_V1';

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SURFACE_TYPES = new Set([
  'observability',
  'repository_mutation',
  'deploy_capable',
  'runtime_mutation',
  'other'
]);

export const canonicalizeSkillSurfacesRegistry = canonicalize;

export const hashSkillSurfacesRegistry = hashCanonical;

export function validateSkillSurfaceEntry(entry) {
  const errors = [];

  if (!isPlainObject(entry)) return { status: 'NULL', valid: false, errors: ['entry: expected object'] };

  if (typeof entry.skill_id !== 'string' || !NAME_PATTERN.test(entry.skill_id) || entry.skill_id.length < 3) {
    errors.push('skill_id: invalid skill identifier');
  }

  if (typeof entry.surface_type !== 'string' || !SURFACE_TYPES.has(entry.surface_type)) {
    errors.push('surface_type: invalid surface type');
  }

  const normalizedRiskClass = validateRiskClass(entry.risk_class);
  if (entry.risk_class !== null && !normalizedRiskClass) {
    errors.push('risk_class: unknown class must normalize to NULL');
  }

  if (typeof entry.mutation_capable !== 'boolean') {
    errors.push('mutation_capable: expected boolean');
  }

  validateNameArray(entry.allowed_targets, 'allowed_targets', errors, { minItems: 1 });
  validateNameArray(entry.required_validator_layers, 'required_validator_layers', errors);
  validateNameArray(entry.proof_requirements, 'proof_requirements', errors);

  if (typeof entry.replay_domain !== 'string' || !NAME_PATTERN.test(entry.replay_domain)) {
    errors.push('replay_domain: invalid replay domain');
  }

  if (entry.mutation_capable === true) {
    if (!Array.isArray(entry.required_validator_layers) || entry.required_validator_layers.length === 0) {
      errors.push('required_validator_layers: required when mutation_capable=true');
    }
    if (!Array.isArray(entry.proof_requirements) || entry.proof_requirements.length === 0) {
      errors.push('proof_requirements: required when mutation_capable=true');
    }
  }

  if (errors.length > 0) return { status: 'NULL', valid: false, errors, normalized: null };

  return {
    status: 'VALID',
    valid: true,
    errors: [],
    normalized: {
      ...entry,
      risk_class: normalizedRiskClass
    }
  };
}

export function validateSkillSurfacesRegistry(candidate) {
  const errors = [];

  if (!isPlainObject(candidate)) {
    return { status: 'NULL', valid: false, errors: ['registry: expected object'] };
  }

  if (candidate.schema_version !== SKILL_SURFACES_REGISTRY_VERSION) {
    errors.push('schema_version: must equal SKILL_SURFACES_REGISTRY_V1');
  }

  if (!Array.isArray(candidate.entries)) {
    errors.push('entries: expected array');
  }

  const normalizedEntries = [];
  if (Array.isArray(candidate.entries)) {
    for (let i = 0; i < candidate.entries.length; i += 1) {
      const result = validateSkillSurfaceEntry(candidate.entries[i]);
      if (!result.valid) {
        for (const error of result.errors) errors.push(`entries[${i}].${error}`);
      } else {
        normalizedEntries.push(result.normalized);
      }
    }
  }

  if (errors.length > 0) return { status: 'NULL', valid: false, errors, normalized: null };

  const normalized = {
    schema_version: SKILL_SURFACES_REGISTRY_VERSION,
    entries: normalizedEntries
  };

  return {
    status: 'VALID',
    valid: true,
    errors: [],
    normalized,
    canonical: canonicalizeSkillSurfacesRegistry(normalized),
    hash: hashSkillSurfacesRegistry(normalized)
  };
}
