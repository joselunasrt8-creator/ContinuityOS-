import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyTopologyEpochAdmission } from '../../src/lib/topology-epoch.ts'

function mkDb(rows = [], replay = false) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('invocation_registry')) return replay ? { exists_flag: 1 } : null
              return null
            },
            async all() {
              if (sql.includes('epoch_registry')) return { results: rows }
              return { results: [] }
            }
          }
        }
      }
    }
  }
}

test('monotonic epoch success -> VALID path', async () => {
  const res = await classifyTopologyEpochAdmission({ topology_epoch: 6, epoch_lineage_parent: 'p1', epoch_nonce: 'n2', topology_visibility_state: 'VISIBLE', scope: 'GLOBAL', db: mkDb([{ topology_epoch: 5, epoch_lineage_parent: 'p1' }]) })
  assert.equal(res.ok, true)
})

test('stale epoch replay -> NULL', async () => {
  const res = await classifyTopologyEpochAdmission({ topology_epoch: 5, epoch_lineage_parent: 'p1', epoch_nonce: 'n2', topology_visibility_state: 'VISIBLE', scope: 'GLOBAL', db: mkDb([{ topology_epoch: 5, epoch_lineage_parent: 'p1' }]) })
  assert.deepEqual(res, { ok: false, state: 'EPOCH_STALE', reason: 'stale_epoch' })
})

test('forked epoch parent -> NULL', async () => {
  const res = await classifyTopologyEpochAdmission({ topology_epoch: 6, epoch_lineage_parent: 'p2', epoch_nonce: 'n2', topology_visibility_state: 'VISIBLE', scope: 'GLOBAL', db: mkDb([{ topology_epoch: 5, epoch_lineage_parent: 'p1' }]) })
  assert.deepEqual(res, { ok: false, state: 'EPOCH_FORK', reason: 'forked_epoch_parent' })
})

test('duplicate epoch nonce replay -> NULL', async () => {
  const res = await classifyTopologyEpochAdmission({ topology_epoch: 6, epoch_lineage_parent: 'p1', epoch_nonce: 'n2', topology_visibility_state: 'VISIBLE', scope: 'GLOBAL', db: mkDb([{ topology_epoch: 5, epoch_lineage_parent: 'p1' }], true) })
  assert.deepEqual(res, { ok: false, state: 'NULL', reason: 'duplicate_epoch_nonce_replay' })
})

test('missing topology epoch -> NULL', async () => {
  const res = await classifyTopologyEpochAdmission({ epoch_lineage_parent: 'p1', epoch_nonce: 'n2', topology_visibility_state: 'VISIBLE', scope: 'GLOBAL', db: mkDb([]) })
  assert.deepEqual(res, { ok: false, state: 'NULL', reason: 'missing_topology_epoch' })
})

test('missing epoch lineage parent -> NULL', async () => {
  const res = await classifyTopologyEpochAdmission({ topology_epoch: 1, epoch_nonce: 'n2', topology_visibility_state: 'VISIBLE', scope: 'GLOBAL', db: mkDb([]) })
  assert.deepEqual(res, { ok: false, state: 'NULL', reason: 'missing_epoch_lineage_parent' })
})

test('non-canonical epoch jump -> NULL', async () => {
  const res = await classifyTopologyEpochAdmission({ topology_epoch: 7, epoch_lineage_parent: 'p1', epoch_nonce: 'n2', topology_visibility_state: 'VISIBLE', scope: 'GLOBAL', db: mkDb([{ topology_epoch: 5, epoch_lineage_parent: 'p1' }]) })
  assert.deepEqual(res, { ok: false, state: 'NULL', reason: 'non_canonical_epoch_jump' })
})

test('topology visibility loss -> NULL', async () => {
  const res = await classifyTopologyEpochAdmission({ topology_epoch: 6, epoch_lineage_parent: 'p1', epoch_nonce: 'n2', topology_visibility_state: 'LOST', scope: 'GLOBAL', db: mkDb([{ topology_epoch: 5, epoch_lineage_parent: 'p1' }]) })
  assert.deepEqual(res, { ok: false, state: 'EPOCH_AMBIGUOUS', reason: 'topology_visibility_loss' })
})
