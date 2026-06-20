// runtime/lineage/governedExecution.mjs
// Adoption surface: run an adapter through the canonical /execute boundary WITH the
// execution-eligibility continuity gate, persisting through the git-committed JSONL
// log. This is where the runtime law is wired end to end:
//
//   /execute → require eligibility gate → reject NULL → execute only ELIGIBLE
//            → proof binds lineage head → registry head advances
//
// The boundary (executeWithAdapter) is pure; all registry I/O lives here.

import { executeWithAdapter } from '../../src/lib/adapter-contract.ts'
import { headCarry, consumedNonces, admitRun } from './proofChainRegistry.mjs'

function str(v) {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)
}

// executeGovernedRun — gate + execute + bind/append.
//   registryPath: append-only execution-lineage JSONL
//   aeo, validated_object_hash, executor, emitted_at: as for executeWithAdapter
//   opts.now: ISO timestamp used for expiry checks
//
// Returns the AdapterExecutionOutcome, augmented with:
//   { lineage_appended: boolean, lineage_head: string | null }
export function executeGovernedRun(registryPath, aeo, validated_object_hash, executor, emitted_at, opts = {}) {
  const lineageKey = str(aeo?.validation?.lineage_key).trim()
  const now = opts.now

  // Read prior head + consumed nonces from disk (only when continuity is declared).
  let prior = null
  let consumed = []
  if (lineageKey) {
    prior = headCarry(registryPath, lineageKey)
    consumed = [...consumedNonces(registryPath, lineageKey)]
  }

  const outcome = executeWithAdapter(
    aeo,
    validated_object_hash,
    executor,
    emitted_at,
    lineageKey ? { prior, consumed_nonces: consumed, now } : null,
  )

  // Non-eligible / failed runs append nothing — fail-closed.
  if (!outcome.ok || !lineageKey) {
    return { ...outcome, lineage_appended: false, lineage_head: null }
  }

  // Proof binds lineage head: append the terminal carry, advancing the chain head.
  const current = {
    lineage_key: lineageKey,
    continuity_id: aeo.validation.continuity_id,
    parent_continuity_id: aeo.validation.parent_continuity_id,
    parent_executed_object_hash: aeo.validation.parent_executed_object_hash,
    validated_object_hash,
    executed_object_hash: validated_object_hash, // validated == executed
    nonce: aeo.validation.replay_nonce,
    proof_hash: outcome.receipt.receipt_id,
    timestamp: emitted_at,
  }
  const appended = admitRun(registryPath, current, { now, proof_id: outcome.receipt.receipt_id })

  return {
    ...outcome,
    lineage_appended: appended.appended === true,
    lineage_head: appended.appended ? appended.record.link_hash : null,
  }
}
