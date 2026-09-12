import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import { readFileSync } from 'node:fs'

const CANONICAL = 'EXECUTION_SURFACES.json'
const LINEAGE = 'EXECUTION_SURFACES_LINEAGE.json'
const NON_CANONICAL = [
  'governance/runtime/EXECUTION_SURFACES.json',
  'runtime/surfaces/EXECUTION_SURFACES.json',
  'runtime/execution_surfaces.json',
  'governance/execution_surfaces.json',
  'governance/mindshift-validation-bundle/governance/EXECUTION_SURFACES.json',
  'PHASE3_EXECUTION_SURFACE_INVENTORY.json',
]
const CODE_EXTENSIONS = /\.(?:[cm]?[jt]s|tsx?|ya?ml)$/
const CLASSIFICATIONS = ['GENERATED_PROJECTION', 'COMPATIBILITY_COPY', 'HISTORICAL_EVIDENCE', 'RETIRED_ARTIFACT']

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

const canonical = JSON.parse(readFileSync(CANONICAL, 'utf8'))
assert.equal(canonical.canonical_source, true, `${CANONICAL} must declare canonical_source=true`)
assert.equal(canonical.canonical_source_path, CANONICAL)

const lineage = JSON.parse(readFileSync(LINEAGE, 'utf8'))
assert.equal(lineage.determination, 'ROOT_CANONICAL')
assert.equal(lineage.canonical_source, CANONICAL)
assert.equal(lineage.canonical_source_sha256, sha256(CANONICAL), `${CANONICAL}: semantic content changed without an explicit lineage update`)
assert.equal(lineage.semantic_change, 'NONE', 'source-path convergence must not silently mutate inventory semantics')
assert.deepEqual(lineage.derivatives.map(({ path }) => path).sort(), [...NON_CANONICAL].sort())

for (const derivative of lineage.derivatives) {
  assert.ok(CLASSIFICATIONS.includes(derivative.classification), `${derivative.path}: invalid classification`)
  assert.ok(derivative.source_version, `${derivative.path}: source_version is required`)
  assert.ok(derivative.generation_method, `${derivative.path}: generation_method is required`)
  assert.ok(derivative.freshness?.verified_at, `${derivative.path}: freshness.verified_at is required`)
  assert.equal(derivative.freshness.sha256, sha256(derivative.path), `${derivative.path}: stale lineage hash; refresh deliberately without changing inventory semantics`)
  if (derivative.classification !== 'HISTORICAL_EVIDENCE') assert.equal(derivative.derived_from, CANONICAL)
}

const projectionConsumers = new Set(lineage.allowed_projection_consumers)
const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const discoveredInventories = trackedFiles.filter((path) => basename(path) === 'EXECUTION_SURFACES.json' || basename(path) === 'execution_surfaces.json' || basename(path) === 'PHASE3_EXECUTION_SURFACE_INVENTORY.json')
assert.deepEqual(discoveredInventories.sort(), [CANONICAL, ...NON_CANONICAL].sort(), 'execution-surface inventory family changed; classify every artifact before enforcement')

const declaredCanonical = discoveredInventories.filter((path) => {
  const value = JSON.parse(readFileSync(path, 'utf8'))
  return value.canonical_source === true
})
assert.deepEqual(declaredCanonical, [CANONICAL], 'exactly one inventory must declare operative canonical authority')

const gapRegistry = readFileSync('GOVERNANCE_GAP_REGISTRY.md', 'utf8')
const sourceMap = readFileSync('INVENTORY_SOURCE_MAP.md', 'utf8')
assert.match(gapRegistry, /`EXECUTION_SURFACES\.json` \(`ROOT_CANONICAL`\)/, 'governance gap registry must declare root canonical authority')
assert.match(sourceMap, /Determination: `ROOT_CANONICAL`/, 'inventory source map must declare root canonical authority')
assert.doesNotMatch(sourceMap, /No single file is authoritative|likely `runtime\/surfaces\/`/, 'inventory source map retains a contradictory pre-convergence declaration')

for (const consumer of lineage.enforcement_consumers) {
  assert.ok(trackedFiles.includes(consumer), `${consumer}: declared enforcement consumer is not tracked`)
  assert.ok(readFileSync(consumer, 'utf8').includes(CANONICAL), `${consumer}: does not reference the canonical source`)
}
const violations = []

// Test-only fault injection exercises the same fail-closed assertion used in CI
// without mutating a tracked consumer while the parallel test suite is running.
if (process.env.EXECUTION_SURFACES_AUTHORITY_PROBE === 'NON_CANONICAL_CONSUMER') {
  violations.push(`probe -> ${NON_CANONICAL[0]}`)
}

for (const file of trackedFiles) {
  if (!CODE_EXTENSIONS.test(file) || file === 'scripts/validate-execution-surfaces-authority.mjs' || projectionConsumers.has(file)) continue
  const source = readFileSync(file, 'utf8')
  for (const path of NON_CANONICAL) {
    if (source.includes(path)) violations.push(`${file} -> ${path}`)
  }
}

assert.deepEqual(violations, [], `non-canonical EXECUTION_SURFACES enforcement consumers:\n${violations.join('\n')}`)
console.log(`EXECUTION_SURFACES authority valid: ROOT_CANONICAL (${CANONICAL}); ${lineage.derivatives.length} derivatives attributable; no non-canonical enforcement consumers`)
