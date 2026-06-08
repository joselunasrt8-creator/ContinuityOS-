import { canonicalize, hashCanonical, normalize } from '../../../src/canonical.js'
import { NULL_STATUS, INVALID_RESULT } from '../../../src/result.ts'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = resolve(__dirname, '../schemas')

const VALID_SCHEMA = 'VALID_SCHEMA'
const INVALID_SCHEMA = 'INVALID_SCHEMA'
const UNKNOWN_OBJECT_TYPE = 'UNKNOWN_OBJECT_TYPE'
const NULL = NULL_STATUS

const SCHEMA_FILES = Object.freeze({
  Authority: 'AUTHORITY.schema.json',
  ATAO: 'ATAO.schema.json',
  PREO: 'PREO.schema.json',
  SCO: 'SCO.schema.json',
  ContinuityObject: 'CONTINUITY_OBJECT.schema.json',
  FederationEnvelope: 'FEDERATION_ENVELOPE.schema.json',
})

const SCHEMAS = Object.freeze(
  Object.fromEntries(
    Object.entries(SCHEMA_FILES).map(([objectType, file]) => [
      objectType,
      JSON.parse(readFileSync(resolve(SCHEMA_DIR, file), 'utf8')),
    ]),
  ),
)
const AEO_SCHEMA = JSON.parse(readFileSync(resolve(SCHEMA_DIR, 'AEO.schema.json'), 'utf8'))
const EXACT_AEO_KEYS = Object.freeze(['finality', 'intent', 'scope', 'target', 'validation'])
const HASH_FIELD_PATTERN = /(^|_)(hash|merkle_root)$/
const HEX_64_PATTERN = /^[a-f0-9]{64}$/

function result(status, object_type, object_hash, errors, canonicalized_object) {
  return {
    status,
    object_type: object_type ?? null,
    object_hash: object_hash ?? null,
    errors: Array.isArray(errors) ? errors : [],
    canonicalized_object: canonicalized_object ?? null,
  }
}

function nullResult(object_type, errors) {
  const errArray = Array.isArray(errors) ? errors : []
  const base = result(NULL, object_type, null, errArray, null)
  return { ...base, result: INVALID_RESULT, reason: errArray[0] ?? 'validation_failed' }
}

export { canonicalize }

export function hashCanonicalObject(value) {
  return hashCanonical(value)
}

function parseInput(input) {
  if (typeof input === 'string') return JSON.parse(input)
  if (input && typeof input === 'object') return input
  throw new Error('input_not_json_object')
}

function inferObjectType(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  if (Object.hasOwn(candidate, 'object_type')) return candidate.object_type
  const keys = Object.keys(candidate).sort()
  if (keys.length === EXACT_AEO_KEYS.length && keys.every((key, index) => key === EXACT_AEO_KEYS[index])) {
    return 'AEO'
  }
  return null
}

function validateType(value, expectedType) {
  const expected = Array.isArray(expectedType) ? expectedType : [expectedType]
  return expected.some((type) => {
    if (type === 'array') return Array.isArray(value)
    if (type === 'integer') return Number.isInteger(value)
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
    if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    if (type === 'null') return value === null
    return typeof value === type
  })
}

function validateDateTime(value) {
  if (value === null) return true
  if (typeof value !== 'string' || value.length === 0) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
}

function validateSchema(value, schema, path = '$') {
  const errors = []

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: const_mismatch`)
    return errors
  }

  if (schema.type !== undefined && !validateType(value, schema.type)) {
    errors.push(`${path}: type_mismatch`)
    return errors
  }

  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: enum_mismatch`)
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: min_length`)
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: minimum`)
  if (typeof value === 'string' && schema.pattern && !(new RegExp(schema.pattern).test(value))) errors.push(`${path}: pattern_mismatch`)
  if (schema.format === 'date-time' && !validateDateTime(value)) errors.push(`${path}: invalid_date_time`)

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: min_items`)
    if (schema.items) {
      value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, `${path}[${index}]`)))
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const required = Array.isArray(schema.required) ? schema.required : []
    for (const requiredKey of required) {
      if (!Object.hasOwn(value, requiredKey)) errors.push(`${path}.${requiredKey}: missing_required`)
    }

    const properties = schema.properties || {}
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key}: additional_property`)
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) errors.push(...validateSchema(value[key], propertySchema, `${path}.${key}`))
    }
  }

  return errors
}

function validateHashRelevantFields(value, path = '$') {
  const errors = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => errors.push(...validateHashRelevantFields(item, `${path}[${index}]`)))
    return errors
  }
  if (!value || typeof value !== 'object') return errors

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (HASH_FIELD_PATTERN.test(key) && typeof child === 'string' && !HEX_64_PATTERN.test(child)) {
      errors.push(`${childPath}: invalid_hash_field`)
    }
    errors.push(...validateHashRelevantFields(child, childPath))
  }
  return errors
}

function selectSchema(objectType) {
  if (objectType === 'AEO') return AEO_SCHEMA
  return SCHEMAS[objectType] || null
}

export function validateLegitimacySchema(input) {
  let candidate
  try {
    candidate = parseInput(input)
  } catch {
    return nullResult(null, ['malformed_json'])
  }

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return nullResult(null, ['input_not_json_object'])
  }

  const objectType = inferObjectType(candidate)
  if (!objectType || (typeof objectType !== 'string')) {
    return nullResult(null, ['missing_or_invalid_object_type'])
  }

  const schema = selectSchema(objectType)
  if (!schema) {
    return result(UNKNOWN_OBJECT_TYPE, objectType, null, ['unknown_object_type'], null)
  }

  const schemaErrors = validateSchema(candidate, schema)
  const hashErrors = validateHashRelevantFields(candidate)
  const errors = [...schemaErrors, ...hashErrors]
  if (errors.length > 0) return nullResult(objectType, errors)

  const canonicalized = normalize(candidate)
  return result(VALID_SCHEMA, objectType, hashCanonicalObject(candidate), [], canonicalized)
}

export { VALID_SCHEMA, INVALID_SCHEMA, UNKNOWN_OBJECT_TYPE, NULL }
