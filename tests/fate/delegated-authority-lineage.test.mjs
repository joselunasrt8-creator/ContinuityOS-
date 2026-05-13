import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0030_delegated_authority_registry.sql', import.meta.url), 'utf8')

test('delegated authority canonical objects and runtime fields are present', () => {
  for (const token of ['DelegatedAuthorityObject', 'DelegationChainEnvelope', 'DelegatedRevocationProjection', 'DelegatedReplayEnvelope']) assert.match(source, new RegExp(token))
  for (const field of ['delegated_authority_id', 'parent_authority_id', 'delegation_depth', 'delegation_scope_subset', 'delegation_expiry', 'delegation_lineage_hash', 'delegation_root_hash', 'delegated_replay_chain_hash']) assert.match(source, new RegExp(field))
})

test('delegation drift taxonomy is canonicalized', () => {
  for (const drift of ['delegated_lineage_drift', 'delegated_scope_expansion', 'orphaned_delegated_execution', 'delegated_replay_resurrection', 'delegated_revocation_failure', 'delegated_exact_object_drift', 'delegation_root_divergence', 'delegated_authority_fragmentation', 'recursive_delegation_instability']) assert.match(source, new RegExp(drift))
})

test('delegated observability routes are GET-only and replay-neutral', () => {
  for (const route of ['DELEGATION_LINEAGE_ROUTE', 'DELEGATION_CHECKPOINT_ROUTE', 'DELEGATION_DRIFT_ROUTE', 'DELEGATION_REPLAY_ROUTE']) assert.match(source, new RegExp(route))
  assert.match(source, /DELEGATION_OBSERVABILITY_ROUTES\.includes[\s\S]*request\.method !== "GET"[\s\S]*reason: "get_only"/)
  assert.match(source, /replay_consumed: false/)
  assert.match(source, /mutation_capable: false/)
})

test('delegated authority registry is append-only with deterministic indexes', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS delegated_authority_registry/)
  assert.match(source, /idx_delegated_authority_registry_lineage/)
  assert.match(source, /idx_delegated_authority_registry_replay/)
  assert.match(source, /trg_delegated_authority_registry_no_update/)
  assert.match(source, /trg_delegated_authority_registry_no_delete/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS delegated_authority_registry/)
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_delegated_authority_registry_no_update/)
})

test('FATE delegated fail-closed cases are explicitly enforced', () => {
  for (const reason of ['replayed_delegated_authority', 'orphaned_delegation', 'delegated_scope_expansion', 'delegated_authority_revoked', 'delegation_lineage_corruption', 'recursive_delegation_instability', 'delegated_replay_chain_corruption', 'delegated_exact_object_drift', 'delegated_authority_expired', 'delegation_root_divergence']) assert.match(source, new RegExp(reason))
  assert.match(source, /validateDelegatedAuthorityLineage[\s\S]*SELECT execution_id FROM execution_registry WHERE delegated_authority_id=\?1 OR delegated_replay_chain_hash=\?2/)
  assert.match(source, /appendDelegatedRevocationProjection/)
})
