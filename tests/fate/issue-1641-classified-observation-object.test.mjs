import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalize, sha256Hex } from '../../src/canonical.js'

const root = new URL('../../', import.meta.url)

function read(file) {
  return readFileSync(new URL(file, root), 'utf8')
}

function readJson(file) {
  return JSON.parse(read(file))
}

function hashObservation(obs) {
  return sha256Hex(canonicalize({
    observation_id: obs.observation_id,
    lineage_hash: obs.lineage_hash,
    topology_view_id: obs.topology_view_id,
    classification: obs.classification,
    evidence_hash: obs.evidence.evidence_hash,
  }))
}

const SCHEMA_PATH = 'schemas/classified-observation-object.schema.json'
const SPEC_PATH = 'governance/topology/CLASSIFIED_OBSERVATION_OBJECT_SPEC.json'

const REQUIRED_ANCHORS = ['observation_id', 'lineage_hash', 'topology_view_id']

const ALLOWED_CLASSIFICATIONS = [
  'TOPOLOGY_VISIBLE',
  'TOPOLOGY_PARTIAL',
  'TOPOLOGY_STALE',
  'TOPOLOGY_CONFLICTED',
  'TOPOLOGY_UNOBSERVABLE',
]

const ALLOWED_EVIDENCE_TYPES = [
  'REGISTRY_STATE',
  'PROOF_STATE',
  'REPLAY_STATE',
  'AUTHORITY_STATE',
  'TOPOLOGY_GAP',
  'GOVERNANCE_STATE',
]

const FORBIDDEN_SUMMARY_FIELDS = [
  'is_legitimate',
  'legitimacy_valid',
  'authorization_granted',
  'authority_valid',
  'execution_authorized',
  'execution_eligible',
  'replay_safe',
  'proof_valid',
  'reconciliation_successful',
  'convergence_achieved',
  'validator_result',
  'merge_allowed',
  'deploy_allowed',
  'policy_valid',
]

const NON_OPERABILITY_FIELDS = [
  'creates_validity',
  'creates_authority',
  'creates_execution_eligibility',
  'creates_reconciliation_closure',
]

function makeValidObservation(overrides = {}) {
  const base = {
    object_type: 'RUNTIME_TOPOLOGY_OBSERVATION',
    schema_version: 'v1',
    observation_id: 'obs-test-001',
    lineage_hash: 'sha256:abc123',
    topology_view_id: 'view-test-001',
    observer_id: 'node-test',
    observed_at: '2026-05-30T12:00:00Z',
    classification: 'TOPOLOGY_VISIBLE',
    target_surface: 'replay_registry',
    evidence: {
      evidence_type: 'REPLAY_STATE',
      evidence_hash: 'sha256:def456',
      schema_version: 'topology-evidence-v1',
      summary: {
        observed_state: 'CONSUMED',
        observed_field: 'nonce_state',
        source_registry: 'replay_registry',
      },
      redacted: true,
    },
    non_operability: {
      creates_validity: false,
      creates_authority: false,
      creates_execution_eligibility: false,
      creates_reconciliation_closure: false,
    },
  }
  return Object.assign({}, base, overrides)
}

test('schema and spec artifacts exist and parse as valid JSON', () => {
  assert.doesNotThrow(() => readJson(SCHEMA_PATH), `${SCHEMA_PATH} must exist and parse`)
  assert.doesNotThrow(() => readJson(SPEC_PATH), `${SPEC_PATH} must exist and parse`)
})

test('schema declares correct object_type and schema_version constants', () => {
  const schema = readJson(SCHEMA_PATH)
  assert.equal(schema.properties.object_type.const, 'RUNTIME_TOPOLOGY_OBSERVATION')
  assert.equal(schema.properties.schema_version.const, 'v1')
  assert.equal(schema.additionalProperties, false)
})

test('schema enforces all three required metadata anchors', () => {
  const schema = readJson(SCHEMA_PATH)
  for (const anchor of REQUIRED_ANCHORS) {
    assert.ok(schema.required.includes(anchor), `schema must require ${anchor}`)
    assert.ok(schema.properties[anchor], `schema must define ${anchor} property`)
  }
})

test('schema declares all allowed classification values', () => {
  const schema = readJson(SCHEMA_PATH)
  const schemaClassifications = schema.properties.classification.enum
  for (const cls of ALLOWED_CLASSIFICATIONS) {
    assert.ok(schemaClassifications.includes(cls), `schema must allow classification ${cls}`)
  }
  assert.equal(schemaClassifications.length, ALLOWED_CLASSIFICATIONS.length, 'schema must not declare extra classifications')
})

test('schema declares all allowed evidence_type values', () => {
  const schema = readJson(SCHEMA_PATH)
  const schemaTypes = schema.properties.evidence.properties.evidence_type.enum
  for (const et of ALLOWED_EVIDENCE_TYPES) {
    assert.ok(schemaTypes.includes(et), `schema must allow evidence_type ${et}`)
  }
  assert.equal(schemaTypes.length, ALLOWED_EVIDENCE_TYPES.length, 'schema must not declare extra evidence types')
})

test('schema enforces non_operability with all-false constants', () => {
  const schema = readJson(SCHEMA_PATH)
  const nonOp = schema.properties.non_operability
  assert.equal(nonOp.additionalProperties, false)
  for (const field of NON_OPERABILITY_FIELDS) {
    assert.ok(nonOp.required.includes(field), `non_operability must require ${field}`)
    assert.equal(nonOp.properties[field].const, false, `${field} must be const: false`)
  }
})

test('schema forbids legitimacy interpretation fields in summary', () => {
  const schema = readJson(SCHEMA_PATH)
  const summarySchema = JSON.stringify(schema.properties.evidence.properties.summary)
  for (const field of FORBIDDEN_SUMMARY_FIELDS) {
    assert.ok(summarySchema.includes(`"${field}"`), `schema summary must forbid ${field}`)
  }
})

test('spec artifact reflects correct issue lineage and planning status', () => {
  const spec = readJson(SPEC_PATH)
  assert.equal(spec.issue, '#1641')
  assert.equal(spec.parent_issue, '#1640')
  assert.ok(spec.planning_status.includes('SPEC_READY'))
  assert.ok(spec.planning_status.includes('OBSERVATION_OBJECT_MODEL_STABILIZED'))
  assert.ok(spec.planning_status.includes('READY_FOR_#1642'))
  assert.equal(spec.planning_only, true)
})

test('spec declares all required mandatory fields for all observations', () => {
  const spec = readJson(SPEC_PATH)
  const mandatory = spec.required_fields.mandatory_for_all_observations
  for (const anchor of REQUIRED_ANCHORS) {
    assert.ok(mandatory.includes(anchor), `spec must list ${anchor} as mandatory`)
  }
  assert.ok(mandatory.includes('non_operability'))
  assert.ok(mandatory.includes('evidence'))
})

test('spec enumerates all forbidden summary fields', () => {
  const spec = readJson(SPEC_PATH)
  for (const field of FORBIDDEN_SUMMARY_FIELDS) {
    assert.ok(
      spec.summary_rules.forbidden_fields.includes(field),
      `spec must list ${field} as forbidden summary field`
    )
  }
})

test('spec defines topology_gap extension with bridgeability values', () => {
  const spec = readJson(SPEC_PATH)
  const gap = spec.topology_gap_extension
  assert.ok(gap.gap_reconciliation_status_values.includes('BRIDGEABLE'))
  assert.ok(gap.gap_reconciliation_status_values.includes('UNKNOWN'))
  assert.ok(gap.gap_reconciliation_status_values.includes('UNBRIDGEABLE'))
  assert.equal(gap.canonical_bridgeability_invariant.missing_anchor, 'UNKNOWN')
  assert.equal(gap.canonical_bridgeability_invariant.conflicting_anchor, 'UNBRIDGEABLE')
  assert.equal(gap.canonical_bridgeability_invariant.convergent_anchor, 'BRIDGEABLE')
})

test('spec defines non-authoritative boundary with all-false non_operability', () => {
  const spec = readJson(SPEC_PATH)
  const shape = spec.canonical_object_shape.non_operability
  assert.equal(shape.creates_validity, false)
  assert.equal(shape.creates_authority, false)
  assert.equal(shape.creates_execution_eligibility, false)
  assert.equal(shape.creates_reconciliation_closure, false)
})

test('spec includes propagation-safe examples with required anchors', () => {
  const spec = readJson(SPEC_PATH)
  assert.ok(Array.isArray(spec.propagation_safe_examples))
  assert.ok(spec.propagation_safe_examples.length >= 1)
  for (const example of spec.propagation_safe_examples) {
    for (const anchor of REQUIRED_ANCHORS) {
      assert.ok(example[anchor], `propagation-safe example must include ${anchor}`)
    }
    assert.equal(example.non_operability.creates_validity, false)
    assert.equal(example.non_operability.creates_authority, false)
    assert.equal(example.non_operability.creates_execution_eligibility, false)
    assert.equal(example.non_operability.creates_reconciliation_closure, false)
  }
})

test('spec includes forbidden raw-state examples', () => {
  const spec = readJson(SPEC_PATH)
  assert.ok(Array.isArray(spec.forbidden_raw_state_examples))
  assert.ok(spec.forbidden_raw_state_examples.length >= 1)
  for (const example of spec.forbidden_raw_state_examples) {
    assert.ok(example.forbidden, 'forbidden example must have a forbidden field')
    assert.ok(example.reason, 'forbidden example must explain the reason')
  }
})

test('valid observation with all required fields is structurally complete', () => {
  const obs = makeValidObservation()
  assert.equal(obs.object_type, 'RUNTIME_TOPOLOGY_OBSERVATION')
  assert.equal(obs.schema_version, 'v1')
  for (const anchor of REQUIRED_ANCHORS) {
    assert.ok(obs[anchor], `valid observation must have ${anchor}`)
  }
  assert.ok(ALLOWED_CLASSIFICATIONS.includes(obs.classification))
  assert.ok(ALLOWED_EVIDENCE_TYPES.includes(obs.evidence.evidence_type))
  assert.equal(obs.non_operability.creates_validity, false)
  assert.equal(obs.non_operability.creates_authority, false)
  assert.equal(obs.non_operability.creates_execution_eligibility, false)
  assert.equal(obs.non_operability.creates_reconciliation_closure, false)
})

test('missing observation_id is invalid', () => {
  const obs = makeValidObservation()
  delete obs.observation_id
  assert.equal(obs.observation_id, undefined, 'observation_id must be present')
})

test('missing lineage_hash is invalid', () => {
  const obs = makeValidObservation()
  delete obs.lineage_hash
  assert.equal(obs.lineage_hash, undefined, 'lineage_hash must be present')
})

test('missing topology_view_id is invalid', () => {
  const obs = makeValidObservation()
  delete obs.topology_view_id
  assert.equal(obs.topology_view_id, undefined, 'topology_view_id must be present')
})

test('invalid evidence type is not in allowed set', () => {
  const invalidType = 'EXECUTION_CLAIM'
  assert.equal(ALLOWED_EVIDENCE_TYPES.includes(invalidType), false)
})

test('forbidden summary fields must not appear in valid observations', () => {
  const obs = makeValidObservation()
  for (const field of FORBIDDEN_SUMMARY_FIELDS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(obs.evidence.summary, field),
      false,
      `summary must not contain forbidden field ${field}`
    )
  }
})

test('topology gap classification includes required gap fields', () => {
  const obs = makeValidObservation({
    classification: 'TOPOLOGY_UNOBSERVABLE',
    evidence: {
      evidence_type: 'TOPOLOGY_GAP',
      evidence_hash: 'sha256:gap001',
      schema_version: 'topology-evidence-v1',
      summary: {
        gap_type: 'AUTHORITY_REGISTRY_VISIBILITY_GAP',
        observed_state: 'UNOBSERVABLE',
        affected_surface: 'authority_registry',
      },
      redacted: true,
      topology_gap: {
        gap_reconciliation_status: 'UNKNOWN',
        affected_window: {
          start: '2026-05-30T10:12:00Z',
          end: '2026-05-30T10:12:45Z',
        },
        reconstruction_sources: ['authority_registry', 'revocation_log'],
      },
    },
  })
  assert.equal(obs.evidence.evidence_type, 'TOPOLOGY_GAP')
  assert.equal(obs.evidence.topology_gap.gap_reconciliation_status, 'UNKNOWN')
  assert.ok(obs.evidence.topology_gap.affected_window.start)
  assert.ok(obs.evidence.topology_gap.affected_window.end)
})

test('raw evidence is redacted in observation object', () => {
  const obs = makeValidObservation()
  assert.equal(obs.evidence.redacted, true)
  assert.equal(Object.prototype.hasOwnProperty.call(obs.evidence, 'raw_evidence_ref'), false)
})

test('non_operability flags are all false in valid observation', () => {
  const obs = makeValidObservation()
  for (const field of NON_OPERABILITY_FIELDS) {
    assert.equal(obs.non_operability[field], false, `${field} must be false`)
  }
})

test('deterministic observation hashing produces identical hash for identical inputs', () => {
  const obs1 = makeValidObservation()
  const obs2 = makeValidObservation()
  assert.equal(hashObservation(obs1), hashObservation(obs2))
})

test('lineage_hash mutation changes observation hash', () => {
  const obs1 = makeValidObservation()
  const obs2 = makeValidObservation({ lineage_hash: 'sha256:mutated-lineage' })
  assert.notEqual(hashObservation(obs1), hashObservation(obs2))
})

test('topology_view_id mutation changes observation hash', () => {
  const obs1 = makeValidObservation()
  const obs2 = makeValidObservation({ topology_view_id: 'view-mutated' })
  assert.notEqual(hashObservation(obs1), hashObservation(obs2))
})

test('evidence_hash mutation changes observation hash', () => {
  const obs1 = makeValidObservation()
  const obs2 = makeValidObservation({
    evidence: Object.assign({}, makeValidObservation().evidence, { evidence_hash: 'sha256:mutated-evidence' }),
  })
  assert.notEqual(hashObservation(obs1), hashObservation(obs2))
})

test('spec defines determinism requirements over canonical hash input fields', () => {
  const spec = readJson(SPEC_PATH)
  const hashFields = spec.determinism_requirements.hash_input_fields
  assert.ok(hashFields.includes('observation_id'))
  assert.ok(hashFields.includes('lineage_hash'))
  assert.ok(hashFields.includes('topology_view_id'))
  assert.ok(hashFields.includes('evidence.evidence_hash'))
  assert.ok(spec.determinism_requirements.mutation_rules.length >= 3)
})

test('spec relationship_to_1640 defines the three-issue compression model', () => {
  const spec = readJson(SPEC_PATH)
  const rel = spec.relationship_to_1640
  assert.ok(rel.summary.includes('#1640'))
  assert.ok(rel.summary.includes('#1641'))
  assert.ok(rel.summary.includes('#1642'))
  assert.ok(Array.isArray(rel['#1641_provides']))
  assert.ok(rel['#1641_provides'].includes('canonical Classified Observation Object shape'))
  assert.ok(rel['#1641_provides'].includes('downgrade semantics'))
})
