import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { validateLegitimacySchema } from '../../runtime/legitimacy/validators/schema-validator.js'

const requiredTopologyFiles = [
  'runtime/surfaces/EXECUTION_SURFACES.json',
  'runtime/surfaces/BYPASS_PATHS.json',
  'runtime/surfaces/OBSERVABILITY_SURFACES.json',
  'runtime/surfaces/SCHEMA_SURFACES.json',
  'runtime/maps/CANONICAL_RUNTIME_MAP.md',
  'runtime/maps/EXECUTION_FLOW.md',
  'runtime/maps/CONTINUITY_LINEAGE_MAP.md',
  'runtime/maps/RECONCILIATION_GRAPH.md',
  'runtime/governance/PREO_POLICY.json',
  'runtime/governance/SCO_POLICY.json',
  'runtime/governance/REPLAY_POLICY.json',
  'runtime/governance/DEPLOY_POLICY.json',
  'runtime/governance/SCHEMA_POLICY.json',
  'runtime/topology/runtime_graph.json',
  'runtime/topology/schema_source_map.json',
  'runtime/topology/proof_schema_reconciliation.json',
  'runtime/topology/topology_manifest.json',
]

const jsonTopologyFiles = requiredTopologyFiles.filter((file) => file.endsWith('.json'))
const canonicalLifecycle = ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof']
const canonicalPostRoutes = new Set(canonicalLifecycle)
const exactAeoKeys = ['finality', 'intent', 'scope', 'target', 'validation']
const root = new URL('../../', import.meta.url)

function read(file) {
  return readFileSync(new URL(file, root), 'utf8')
}

function readJson(file) {
  return JSON.parse(read(file))
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
  }
  return value
}

function canonicalize(value) {
  return JSON.stringify(sortKeys(value))
}

function hashObject(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex')
}

function withoutKey(object, key) {
  const copy = structuredClone(object)
  delete copy[key]
  return copy
}

function visitBooleans(value, path = '$') {
  const violations = []
  if (Array.isArray(value)) {
    value.forEach((child, index) => violations.push(...visitBooleans(child, `${path}[${index}]`)))
    return violations
  }
  if (!value || typeof value !== 'object') return violations
  for (const [key, child] of Object.entries(value)) {
    const claimKey = ['executable', 'creates_authority', 'mutation_capable', 'deployment_capable', 'proof_generating', 'additional_routes_created', 'claims_authority', 'changes_execution_semantics'].includes(key)
    if (claimKey && child !== false) violations.push(`${path}.${key}`)
    violations.push(...visitBooleans(child, `${path}.${key}`))
  }
  return violations
}

test('all required canonical topology files exist', () => {
  for (const file of requiredTopologyFiles) {
    assert.doesNotThrow(() => read(file), `${file} must exist`)
  }
})

test('topology JSON parses deterministically as canonical objects', () => {
  const allowedObjectTypes = new Set([
    'TopologyManifest',
    'RuntimeSurfaceInventory',
    'SchemaSourceMap',
    'ProofSchemaReconciliationObject',
    'GovernancePolicyMap',
    'CanonicalRuntimeGraph',
  ])

  for (const file of jsonTopologyFiles) {
    const parsed = readJson(file)
    assert.equal(typeof parsed, 'object', `${file} must parse to an object`)
    assert.equal(Array.isArray(parsed), false, `${file} must not parse to an array`) 
    assert.equal(allowedObjectTypes.has(parsed.object_type), true, `${file} has an undeclared topology object_type`)
    assert.equal(parsed.evidence_only, true, `${file} must be evidence-only`)
    assert.equal(parsed.fail_closed_on_ambiguity, true, `${file} must fail closed on ambiguity`)
    assert.doesNotThrow(() => JSON.parse(canonicalize(parsed)), `${file} must have deterministic canonical JSON`)
  }
})

test('runtime graph includes the canonical lifecycle without creating execution semantics', () => {
  const graph = readJson('runtime/topology/runtime_graph.json')
  assert.deepEqual(graph.canonical_lifecycle, canonicalLifecycle)
  assert.deepEqual(graph.nodes.map((node) => node.route), canonicalLifecycle)
  assert.equal(graph.executable, false)
  assert.equal(graph.creates_authority, false)
  assert.equal(graph.additional_routes_created, false)
})

test('observability surfaces are classified non-executable', () => {
  const observability = readJson('runtime/surfaces/OBSERVABILITY_SURFACES.json')
  assert.equal(observability.surface_class, 'observability')
  for (const surface of observability.surfaces) {
    assert.equal(surface.classification, 'non_executable_observability', `${surface.id} must remain observability-only`)
    assert.equal(surface.executable, false)
    assert.equal(surface.mutation_capable, false)
    assert.equal(surface.creates_authority, false)
  }
})

test('schema source map distinguishes legacy schemas from runtime legitimacy schemas', () => {
  const map = readJson('runtime/topology/schema_source_map.json')
  const legacy = map.sources.find((source) => source.source_id === 'legacy_proof_schema')
  const canonical = map.sources.find((source) => source.source_id === 'canonical_runtime_proof_object')

  assert.equal(legacy.path, 'schemas/proof.schema.json')
  assert.equal(legacy.schema_role, 'legacy_contract_schema')
  assert.equal(legacy.authoritative_for_runtime_validator, false)
  assert.deepEqual(legacy.required_hash_fields, ['aeo_hash'])

  assert.equal(canonical.path, 'runtime/legitimacy/schemas/PROOF_OBJECT.schema.json')
  assert.equal(canonical.schema_role, 'canonical_runtime_legitimacy_schema')
  assert.equal(canonical.authoritative_for_runtime_validator, true)
  assert.deepEqual(canonical.required_hash_fields, ['validated_object_hash', 'execution_hash'])
})

test('proof schema conflict is represented explicitly as topology evidence', () => {
  const reconciliation = readJson('runtime/topology/proof_schema_reconciliation.json')
  assert.equal(reconciliation.legacy_schema_conflict, true)
  assert.equal(reconciliation.runtime_schema_authoritative_for_runtime_validator, true)
  assert.equal(reconciliation.legacy_schema_replacement_required_by_future_SCO, true)
  assert.equal(reconciliation.reconciliation_status, 'CONFLICT_RECORDED_NO_REPLACEMENT')
  assert.equal(reconciliation.legacy_proof_schema.path, 'schemas/proof.schema.json')
  assert.equal(reconciliation.canonical_runtime_proof_object.path, 'runtime/legitimacy/schemas/PROOF_OBJECT.schema.json')
})

test('no canonical execution route expansion occurs', () => {
  const source = read('src/index.ts')
  const routes = [...source.matchAll(/url\.pathname === "([^"]+)" && request\.method === "POST"/g)].map((match) => match[1])
  assert.deepEqual(new Set(routes), canonicalPostRoutes)
  assert.equal(routes.length, canonicalPostRoutes.size)
})

test('no deploy workflow bypass is introduced by topology evidence', () => {
  const deployPolicy = readJson('runtime/governance/DEPLOY_POLICY.json')
  const bypass = readJson('runtime/surfaces/BYPASS_PATHS.json')
  assert.equal(deployPolicy.deployment_capable, false)
  assert.match(deployPolicy.statement, /Deployment capability is not introduced/)
  assert.equal(bypass.paths.find((path) => path.id === 'direct_deploy').allowed, false)
  assert.equal(read('package.json').includes('Direct deploy disabled'), true)
})

test('no topology file claims authority, execution, proof, deployment, or mutation capability', () => {
  for (const file of jsonTopologyFiles) {
    assert.deepEqual(visitBooleans(readJson(file)), [], `${file} contains a capability claim`)
  }
})

test('topology manifest and referenced hashes are deterministic', () => {
  const manifest = readJson('runtime/topology/topology_manifest.json')
  const execution = readJson('runtime/surfaces/EXECUTION_SURFACES.json')
  const bypass = readJson('runtime/surfaces/BYPASS_PATHS.json')
  const observability = readJson('runtime/surfaces/OBSERVABILITY_SURFACES.json')
  const schemaSurfaces = readJson('runtime/surfaces/SCHEMA_SURFACES.json')
  const schemaMap = readJson('runtime/topology/schema_source_map.json')
  const graph = readJson('runtime/topology/runtime_graph.json')
  const reconciliation = readJson('runtime/topology/proof_schema_reconciliation.json')

  assert.equal(execution.inventory_hash, hashObject(withoutKey(execution, 'inventory_hash')))
  assert.equal(bypass.inventory_hash, hashObject(withoutKey(bypass, 'inventory_hash')))
  assert.equal(observability.inventory_hash, hashObject(withoutKey(observability, 'inventory_hash')))
  assert.equal(schemaSurfaces.inventory_hash, hashObject(withoutKey(schemaSurfaces, 'inventory_hash')))
  assert.equal(schemaMap.schema_source_map_hash, hashObject(withoutKey(schemaMap, 'schema_source_map_hash')))
  assert.equal(graph.topology_graph_hash, hashObject(withoutKey(graph, 'topology_graph_hash')))
  assert.equal(reconciliation.proof_schema_reconciliation_hash, hashObject(withoutKey(reconciliation, 'proof_schema_reconciliation_hash')))
  assert.equal(manifest.hashes.runtime_surface_inventory_hash, hashObject([execution.inventory_hash, bypass.inventory_hash, observability.inventory_hash, schemaSurfaces.inventory_hash]))
  assert.equal(manifest.topology_manifest_hash, hashObject(withoutKey(manifest, 'topology_manifest_hash')))
})

test('schema-validator remains fail-closed', () => {
  assert.equal(validateLegitimacySchema('not json').status, 'NULL')
  assert.equal(validateLegitimacySchema({ object_type: 'TopologyManifest' }).status, 'UNKNOWN_OBJECT_TYPE')
  assert.equal(validateLegitimacySchema({ object_type: 'ProofObject', proof_id: 'missing-required-fields' }).status, 'NULL')
})

test('AEO remains exact five fields', () => {
  const aeoSchema = readJson('runtime/legitimacy/schemas/AEO.schema.json')
  const map = readJson('runtime/topology/schema_source_map.json')
  const aeoMap = map.sources.find((source) => source.source_id === 'runtime_legitimacy_aeo_schema')
  assert.deepEqual(aeoSchema.required.toSorted(), exactAeoKeys)
  assert.equal(aeoSchema.additionalProperties, false)
  assert.deepEqual(aeoMap.exact_fields, exactAeoKeys)
})
