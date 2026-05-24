import { canonicalize, hashCanonical } from '../canonical.js';

export const SKILL_PROVENANCE_REVOCATION_SCHEMA_VERSION = 'SKILL_PROVENANCE_REVOCATION_V1';

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._-]+)?$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const STATUSES = new Set(['ACTIVE', 'REVOKED', 'SUPERSEDED', 'EXPIRED', 'QUARANTINED']);
const FAIL_CLOSED = new Set(['REVOKED', 'SUPERSEDED', 'EXPIRED', 'QUARANTINED']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalizeRevocationLineage(value) {
  return canonicalize(value);
}

export function hashRevocationLineage(value) {
  return hashCanonical(value);
}

function isValidRevocationRecord(record) {
  if (!isPlainObject(record)) return false;
  if (record.schema_version !== SKILL_PROVENANCE_REVOCATION_SCHEMA_VERSION) return false;
  if (typeof record.skill_id !== 'string' || !NAME_PATTERN.test(record.skill_id) || record.skill_id.length < 3) return false;
  if (typeof record.skill_version !== 'string' || !VERSION_PATTERN.test(record.skill_version)) return false;
  if (typeof record.canonical_payload_hash !== 'string' || !DIGEST_PATTERN.test(record.canonical_payload_hash)) return false;
  if (typeof record.provenance_envelope_hash !== 'string' || !DIGEST_PATTERN.test(record.provenance_envelope_hash)) return false;
  if (typeof record.status !== 'string' || !STATUSES.has(record.status)) return false;
  return true;
}

export function validateSkillProvenanceRevocationLineage(binding, lineageRecord) {
  if (!isPlainObject(binding)) return null;
  if (!isValidRevocationRecord(lineageRecord)) return null;

  const bindingOk = binding.skill_id === lineageRecord.skill_id
    && binding.skill_version === lineageRecord.skill_version
    && binding.canonical_payload_hash === lineageRecord.canonical_payload_hash
    && binding.provenance_envelope_hash === lineageRecord.provenance_envelope_hash;

  if (!bindingOk) return null;

  if (lineageRecord.status === 'ACTIVE') return 'ACTIVE';
  if (FAIL_CLOSED.has(lineageRecord.status)) return lineageRecord.status;
  return null;
}

export function canProvenanceValidateAsActive(binding, lineageRecord) {
  return validateSkillProvenanceRevocationLineage(binding, lineageRecord) === 'ACTIVE';
}
