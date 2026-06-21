// runtime/lineage/observeRegistry.mjs
// CI OBSERVER surface for the runtime execution-lineage law (#2186 gate + #2188
// hardening). READ-ONLY: it answers exactly one question —
//
//   "Is the runtime-produced lineage evidence still intact?"
//
//   VALID                              -> pass
//   tampered / forked / malformed /    -> fail closed
//   broken / gapped / duplicated
//
// It OBSERVES, it does not DECIDE. It NEVER classifies or creates eligibility,
// never appends, never mints authority. It only re-verifies the append-only chain
// the runtime wrote, and records the observation as attributable evidence:
//
//   Runtime creates ELIGIBLE | NULL  ->  Proof binds lineage head  ->
//   Registry stores evidence  ->  Observer VERIFIES evidence  ->  CI requires success
//
// The verifier (verifyRegistryChain) is the same fail-closed integrity check the
// runtime uses before it trusts a head; the observer simply runs it from CI and
// reports. No new authority surface, no eligibility computation, no write.

import { verifyRegistryChain } from './proofChainRegistry.mjs'

// observeRegistry — verify a lineage registry's chain integrity and return a frozen,
// attributable observation. Pure read; the only non-determinism is verified_at,
// which the caller may pin for reproducibility.
export function observeRegistry(registryPath, options = {}) {
  const lineageKey = options.lineage_key
  const res = verifyRegistryChain(registryPath, lineageKey)
  return Object.freeze({
    object_type: 'ExecutionLineageObservation',
    mode: 'observability_only',
    registry: String(registryPath),
    lineage_key: lineageKey ?? null,
    // The observation — what the runtime law's evidence looks like right now.
    verification_status: res.result, // 'VALID' | 'NULL'
    intact: res.result === 'VALID',
    head_link_hash: res.head_link_hash ?? null,
    registry_length: res.length ?? 0,
    null_reasons: res.null_reasons ?? [],
    broken_at: res.broken_at ?? null,
    // Structural invariants of the OBSERVER itself — it mints nothing, decides nothing.
    creates_authority: false,
    creates_eligibility: false,
    verified_at: String(options.verified_at || new Date().toISOString()),
  })
}
