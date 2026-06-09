import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const observabilityAdapterSource = readFileSync(new URL('../../src/lib/runtime-observability-adapter.ts', import.meta.url), 'utf8')
const source = `${indexSource}
${observabilityAdapterSource}`

function indexOfRequired(fragment) {
  const index = source.indexOf(fragment)
  assert.notEqual(index, -1, `missing source fragment: ${fragment}`)
  return index
}

test('bootstrap ordering quarantines historical proof lineage before uniqueness enforcement', () => {
  const quarantine = indexOfRequired('const quarantine = await quarantineHistoricalProofDuplicates(env)')
  const stabilized = indexOfRequired('if (!await proofRegistryStabilized(env)) throw new BootstrapRegistryUnstableError()')
  const uniqueness = indexOfRequired('CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique')
  const appendOnly = indexOfRequired('await activateAppendOnlyRegistryEnforcement(env)')

  assert.ok(quarantine < stabilized, 'duplicate proof quarantine must run before stabilization gate')
  assert.ok(stabilized < uniqueness, 'uniqueness enforcement must run after proof registry stabilization')
  assert.ok(uniqueness < appendOnly, 'append-only triggers must activate after stabilized uniqueness enforcement')
})

test('duplicate proof quarantine evidence is replay-neutral and non-authoritative', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS proof_quarantine_registry[\s\S]*quarantine_id TEXT PRIMARY KEY[\s\S]*proof_id TEXT NOT NULL[\s\S]*lineage_hash TEXT NOT NULL[\s\S]*quarantine_reason TEXT NOT NULL[\s\S]*canonical_proof_selected TEXT NOT NULL[\s\S]*duplicate_proof_archived TEXT NOT NULL[\s\S]*quarantine_generated_at TEXT NOT NULL[\s\S]*replay_neutral TEXT NOT NULL CHECK \(replay_neutral='true'\)[\s\S]*evidence_only TEXT NOT NULL CHECK \(evidence_only='true'\)/)
  assert.match(source, /INSERT OR IGNORE INTO proof_quarantine_registry[\s\S]*'duplicate_proof_lineage'[\s\S]*'true','true'/)
  assert.match(source, /canonicalProofLineageHash[\s\S]*canonicalize\(\{ canonical_proof_selected: canonical_proof_id, proof: proofLineageMaterial\(row\) \}\)/)
  assert.match(source, /deterministicProofQuarantineId[\s\S]*sha256Hex\(canonicalize\(\{ quarantine_reason: "duplicate_proof_lineage", proof_id: String\(row\.proof_id \|\| ""\), lineage_hash \}\)\)/)
})

test('bootstrap diagnostics are observability-only and fail closed when stabilization fails', () => {
  for (const event of [
    'BOOTSTRAP_SCHEMA_INITIALIZED',
    'BOOTSTRAP_MIGRATIONS_VALIDATED',
    'BOOTSTRAP_DUPLICATE_PROOF_DETECTED',
    'BOOTSTRAP_DUPLICATE_PROOF_QUARANTINED',
    'BOOTSTRAP_PROOF_LINEAGE_RECONCILED',
    'BOOTSTRAP_REGISTRY_STABILIZED',
    'BOOTSTRAP_UNIQUENESS_ENFORCED',
    'BOOTSTRAP_RUNTIME_READY'
  ]) assert.match(source, new RegExp(event))

  assert.match(source, /canonicalize\(\{ event_type, replay_neutral: true, append_only: true, evidence_only: true, authoritative: false \}\)/)
  assert.match(source, /return json\(\{ status: "NULL", reason: "bootstrap_registry_unstable" \}, 500\)/)
})
