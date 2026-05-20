import test from 'node:test';
import assert from 'node:assert/strict';

import revocationSchema from '../schemas/skill_provenance_revocation_v1.json' with { type: 'json' };
import {
  SKILL_PROVENANCE_REVOCATION_SCHEMA_VERSION,
  canProvenanceValidateAsActive,
  canonicalizeRevocationLineage,
  hashRevocationLineage,
  validateSkillProvenanceRevocationLineage
} from '../src/lib/skill-provenance-revocation.js';

const baseBinding = {
  skill_id: 'repository.change.workflow',
  skill_version: '1.2.3',
  canonical_payload_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  provenance_envelope_hash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222'
};

function record(status) {
  return {
    schema_version: SKILL_PROVENANCE_REVOCATION_SCHEMA_VERSION,
    ...baseBinding,
    status,
    reason: 'deterministic test fixture',
    effective_at: '2026-05-20T00:00:00.000Z'
  };
}

test('ACTIVE passes', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, record('ACTIVE')), 'ACTIVE');
  assert.equal(canProvenanceValidateAsActive(baseBinding, record('ACTIVE')), true);
});

test('REVOKED fails closed', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, record('REVOKED')), 'REVOKED');
  assert.equal(canProvenanceValidateAsActive(baseBinding, record('REVOKED')), false);
});

test('SUPERSEDED fails closed', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, record('SUPERSEDED')), 'SUPERSEDED');
  assert.equal(canProvenanceValidateAsActive(baseBinding, record('SUPERSEDED')), false);
});

test('EXPIRED fails closed', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, record('EXPIRED')), 'EXPIRED');
  assert.equal(canProvenanceValidateAsActive(baseBinding, record('EXPIRED')), false);
});

test('QUARANTINED fails closed', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, record('QUARANTINED')), 'QUARANTINED');
  assert.equal(canProvenanceValidateAsActive(baseBinding, record('QUARANTINED')), false);
});

test('unknown status returns NULL', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, { ...record('ACTIVE'), status: 'UNKNOWN' }), null);
});

test('malformed lineage returns NULL', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, { ...record('ACTIVE'), canonical_payload_hash: 'bad' }), null);
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, null), null);
});

test('lineage must bind skill_id + skill_version + canonical_payload_hash + provenance_envelope_hash', () => {
  assert.equal(validateSkillProvenanceRevocationLineage(baseBinding, { ...record('ACTIVE'), skill_version: '9.9.9' }), null);
});

test('canonical/hash helpers are deterministic', () => {
  const a = { schema_version: 'X', z: 1, a: { b: 2, a: 1 } };
  const b = { a: { a: 1, b: 2 }, z: 1, schema_version: 'X' };
  assert.equal(canonicalizeRevocationLineage(a), canonicalizeRevocationLineage(b));
  assert.equal(hashRevocationLineage(a), hashRevocationLineage(b));
});

test('quarantine classification does not create authority or execution permission', () => {
  assert.equal(revocationSchema.title, 'SKILL_PROVENANCE_REVOCATION_V1');
  const quarantinedSurface = revocationSchema.properties.quarantined_surfaces.items.properties;
  assert.equal(quarantinedSurface.authority_grant.const, false);
  assert.equal(quarantinedSurface.execution_permission.const, false);
  assert.equal(quarantinedSurface.automatic_remediation.const, false);
});
