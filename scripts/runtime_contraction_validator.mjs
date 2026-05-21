import { readFileSync, existsSync } from 'node:fs'

const canonical = JSON.parse(readFileSync('governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json', 'utf8'))
const contraction = JSON.parse(readFileSync('governance/runtime/RUNTIME_CONTRACTION_REGISTRY.json', 'utf8'))

const deletedClasses = ['DERIVED_DELETE','ARCHIVE_DELETE','GENERATED_DELETE','DUPLICATE_DELETE','HISTORICAL_DELETE']
const deleted = deletedClasses.flatMap((k) => contraction.classifications[k] || [])

const duplicateOwners = []
for (const [key, value] of Object.entries(canonical)) {
  if (Array.isArray(value) && value.length > 1) duplicateOwners.push(key)
}

const unresolved = []
for (const target of deleted) {
  if (target.includes('*')) continue
  if (existsSync(target)) unresolved.push(target)
}

const report = {
  status: 'PASS',
  duplicate_authoritative_owners: duplicateOwners,
  unresolved_deleted_artifacts: unresolved,
  deleted_count: deleted.length,
  fail_closed: false
}

if (duplicateOwners.length > 0 || unresolved.length > 0) {
  report.status = 'NULL'
  report.fail_closed = true
}

console.log(JSON.stringify(report, null, 2))
if (report.fail_closed) process.exit(1)
