import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateLegitimacySchema } from '../../runtime/legitimacy/validators/schema-validator.js'

const spec = JSON.parse(readFileSync('governance/atao/ATAO_STRUCTURAL_VALIDATION_SPEC.json', 'utf8'))
const runtimeSchema = JSON.parse(readFileSync('runtime/legitimacy/schemas/ATAO.schema.json', 'utf8'))
const publicSchema = JSON.parse(readFileSync('schemas/atao.schema.json', 'utf8'))
const continuityV1Schema = JSON.parse(readFileSync('schemas/json/continuityos/v1/atao.schema.json', 'utf8'))

const validRuntimeATAO = Object.freeze({
  object_type: 'ATAO',
  atao_id: 'atao-1704',
  agent_id: 'agent-1704',
  session_id: 'session-1704',
  intent: 'capture proposed action before authority binding',
  proposed_action: {
    system: 'github',
    action: 'open_pull_request',
    parameters: { branch: 'issue-1704' },
  },
  scope: { repository: 'mindshift-demo', issue: '1704' },
  risk_class: 'P2',
  timestamp: '2026-06-01T00:00:00.000Z',
})

test('Issue #1704: ATAO structural validation spec is non-operative and creates no execution authority', () => {
  assert.equal(spec.issue, '1704')
  assert.equal(spec.status, 'non_operative_governance_artifact')
  assert.equal(spec.scope.execution_surface, 'none')
  assert.equal(spec.scope.operational_effect, 'none')

  for (const [capability, enabled] of Object.entries(spec.non_operability)) {
    assert.equal(enabled, false, `${capability} must remain non-operative`)
  }

  assert.equal(spec.authority_boundaries.valid_structure_grants_authority, false)
  assert.equal(spec.authority_boundaries.implicit_authority, 'forbidden')
  assert.equal(spec.replay_boundaries.registry_write, false)
  assert.equal(spec.replay_boundaries.nonce_consumption, false)
})

test('Issue #1704: ATAO structural required fields are aligned to runtime and public schema profiles', () => {
  const specFields = new Set(spec.structural_object_model.required_fields)
  const runtimeFields = new Set(runtimeSchema.required)
  const publicFields = new Set(publicSchema.required)
  const continuityV1Fields = new Set(continuityV1Schema.required)

  assert.deepEqual(spec.schema_version, '1.0')
  assert.deepEqual(spec.structural_object_model.schema_refs, [
    'schemas/atao.schema.json',
    'schemas/json/continuityos/v1/atao.schema.json',
    'runtime/legitimacy/schemas/ATAO.schema.json',
  ])

  assert.deepEqual(specFields, runtimeFields)
  assert.equal(spec.structural_object_model.root_schema_object_type_policy.includes('object_type=ATAO'), true)
  assert.deepEqual(publicFields, continuityV1Fields)
  assert.equal(publicFields.has('object_type'), false)

  for (const field of publicFields) {
    assert.equal(specFields.has(field), true, `public field ${field} must be covered by the structural spec`)
  }
})

test('Issue #1704: runtime ATAO structure deterministically validates without implying execution legitimacy', () => {
  const result = validateLegitimacySchema(validRuntimeATAO)

  assert.equal(result.status, 'VALID_SCHEMA')
  assert.equal(result.object_type, 'ATAO')
  assert.equal(Object.hasOwn(result, 'authority'), false)
  assert.equal(Object.hasOwn(result, 'execution_legitimacy'), false)
  assert.equal(Object.hasOwn(result, 'proof_created'), false)
})

test('Issue #1704: structurally invalid ATAO candidates resolve to NULL before authority binding', () => {
  const missingRequired = { ...validRuntimeATAO }
  delete missingRequired.proposed_action

  const invalidRisk = { ...validRuntimeATAO, risk_class: 'P4' }
  const hiddenExecutionFlag = { ...validRuntimeATAO, execute_now: true }

  for (const candidate of [missingRequired, invalidRisk, hiddenExecutionFlag]) {
    const result = validateLegitimacySchema(candidate)
    assert.equal(result.status, 'NULL')
    assert.equal(result.object_hash, null)
    assert.equal(result.canonicalized_object, null)
  }
})
