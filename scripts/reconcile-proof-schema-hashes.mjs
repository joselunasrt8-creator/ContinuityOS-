import { readFileSync, writeFileSync } from 'node:fs'
import { hashCanonical } from '../src/canonical.js'

const root = new URL('../', import.meta.url)

function read(path) {
  return JSON.parse(readFileSync(new URL(path, root), 'utf8'))
}

function write(path, data) {
  writeFileSync(new URL(path, root), JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function withoutKey(obj, key) {
  const copy = structuredClone(obj)
  delete copy[key]
  return copy
}

// 1. Update schema_source_map.json
const schemaMap = read('runtime/topology/schema_source_map.json')
const proofEntry = schemaMap.sources.find((s) => s.source_id === 'canonical_runtime_proof_object')
proofEntry.schema_role = 'dead_contract_retired'
proofEntry.authoritative_for_runtime_validator = false
schemaMap.schema_source_map_hash = hashCanonical(withoutKey(schemaMap, 'schema_source_map_hash'))
write('runtime/topology/schema_source_map.json', schemaMap)
const newSchemaMapHash = schemaMap.schema_source_map_hash
console.log('schema_source_map_hash:', newSchemaMapHash)

// 2. Update proof_schema_reconciliation.json
const reconciliation = read('runtime/topology/proof_schema_reconciliation.json')
reconciliation.runtime_schema_authoritative_for_runtime_validator = false
reconciliation.reconciliation_status = 'DEAD_CONTRACT_RETIRED'
reconciliation.canonical_runtime_proof_object.runtime_authoritative = false
reconciliation.proof_schema_reconciliation_hash = hashCanonical(withoutKey(reconciliation, 'proof_schema_reconciliation_hash'))
write('runtime/topology/proof_schema_reconciliation.json', reconciliation)
const newReconciliationHash = reconciliation.proof_schema_reconciliation_hash
console.log('proof_schema_reconciliation_hash:', newReconciliationHash)

// 3. Update topology_manifest.json
const manifest = read('runtime/topology/topology_manifest.json')
manifest.hashes.schema_source_map_hash = newSchemaMapHash
manifest.hashes.proof_schema_reconciliation_hash = newReconciliationHash
manifest.schema_reconciliation.runtime_schema_authoritative_for_runtime_validator = false
manifest.topology_manifest_hash = hashCanonical(withoutKey(manifest, 'topology_manifest_hash'))
write('runtime/topology/topology_manifest.json', manifest)
console.log('topology_manifest_hash:', manifest.topology_manifest_hash)

console.log('Hash chain updated successfully.')
