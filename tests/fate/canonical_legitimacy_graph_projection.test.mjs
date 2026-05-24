import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from '../helpers/import-worker.mjs'

const source = readFileSync(new URL('../../runtime/control_graph_registry_projection.ts', import.meta.url), 'utf8')

async function loadProjectionModule() {
  return importWorker(new URL('../../runtime/control_graph_registry_projection.ts', import.meta.url).pathname)
}

test('canonical legitimacy graph projection includes required entities and edges vocabulary', () => {
  for (const entity of ['AEO', 'Execution', 'Proof', 'Replay', 'PREO', 'Registry', 'Reconciliation', 'TopologyEvidence']) {
    assert.match(source, new RegExp(`\"${entity}\"`))
  }
  for (const edge of ['VALIDATES', 'EXECUTES', 'PROVES', 'CONTINUES', 'REPLAYS', 'RECONCILES', 'DERIVES_FROM', 'ANCESTOR_OF']) {
    assert.match(source, new RegExp(`\"${edge}\"`))
  }
})

test('projection is evidence-only and non-authoritative', async () => {
  const mod = await loadProjectionModule()
  const projection = mod.buildCanonicalLegitimacyGraphProjection({
    registry_hash: 'reg-h1',
    lineage_root: 'lin-r1',
    entities: [{ id: 'x', type: 'AEO', lineage_hash: 'h', created_at: '2026-01-01T00:00:00.000Z' }],
    edges: [],
  })
  assert.equal(projection.evidence_only, true)
  assert.equal(projection.replay_neutral, true)
  assert.equal(projection.reconstructable, true)
  assert.equal(projection.non_authoritative, true)
  assert.equal(projection.fail_closed, true)
})

test('projection serialization is deterministic and lineage disagreement fails closed', async () => {
  const mod = await loadProjectionModule()
  const snapshot = {
    registry_hash: 'reg-h2',
    lineage_root: 'lin-r2',
    entities: [
      { id: 'proof-1', type: 'Proof', lineage_hash: 'h3', created_at: '2026-01-01T00:00:02.000Z' },
      { id: 'aeo-1', type: 'AEO', lineage_hash: 'h1', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'exec-1', type: 'Execution', lineage_hash: 'h2', created_at: '2026-01-01T00:00:01.000Z' },
    ],
    edges: [
      { from: 'proof-1', to: 'exec-1', type: 'PROVES' },
      { from: 'exec-1', to: 'aeo-1', type: 'EXECUTES' },
    ],
  }
  const first = mod.buildCanonicalLegitimacyGraphProjection(snapshot)
  const second = mod.buildCanonicalLegitimacyGraphProjection({ ...snapshot, entities: [...snapshot.entities].reverse(), edges: [...snapshot.edges].reverse() })
  assert.equal(mod.serializeProjectionDeterministically(first), mod.serializeProjectionDeterministically(second))

  assert.deepEqual(mod.verifyLineageAgreementOrReject('lin-r2', first), { ok: true })
  assert.deepEqual(mod.verifyLineageAgreementOrReject('lin-other', first), { ok: false, reason: 'LINEAGE_DISAGREEMENT' })
})
