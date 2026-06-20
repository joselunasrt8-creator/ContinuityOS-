// runtime/lineage/proofChainRegistry.mjs
// Concrete persistence for the execution-lineage substrate + eligibility gate.
//
// Layer 1 (substrate): continuityProofChain.mjs — an append-only, tamper-evident
//   hash chain. Each link's payload is the EXECUTION-ELIGIBILITY CARRY (the
//   terminal runtime state of a run). The chain head = the prior run's carry.
// Layer 2 (gate): executionEligibility.mjs — admits the next run ONLY IF it
//   inherits the prior carry. Narrows only; creates no authority; NULL-default.
//
// Persistence is a git-committed, append-only JSONL log — no D1, no SQLite, no
// service layer — advanced one append at a time so continuity is testable across
// runs. The default store is runtime/lineage/execution_lineage_registry.jsonl;
// the same substrate also instances governance/merge-legitimacy/merge_proof_registry.jsonl.
//
// Evidence-only: reading never mutates; appending is the only write and it is
// fail-closed — a run that is not ELIGIBLE is never appended.

import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { linkProof, verifyInheritance, verifyChain, headOf } from './continuityProofChain.mjs'
import {
  classifyExecutionEligibility,
  eligibilityCarry,
} from './executionEligibility.mjs'

const ENTRY_TYPES = new Set(['execution_lineage_entry', 'proof_entry'])

function str(v) {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)
}

// Read raw chained entries (those carrying a link_hash) for a lineage_key, in
// file (append) order. Markers and corrupt lines are skipped — a corrupt line is
// not a valid link, so verification stays fail-closed.
export function readEntries(registryPath, lineageKey) {
  if (!existsSync(registryPath)) return []
  const lines = readFileSync(registryPath, 'utf8').split('\n')
  const entries = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let entry
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (!entry || !ENTRY_TYPES.has(entry._record_type) || !entry.link_hash) continue
    if (lineageKey !== undefined && str(entry.lineage_key) !== str(lineageKey)) continue
    entries.push(entry)
  }
  return entries
}

// Map an on-disk entry to a substrate chain link.
function entryToLink(entry) {
  return {
    artifact_type: 'CONTINUITY_PROOF_LINK',
    lineage_key: str(entry.lineage_key),
    sequence_number: Number(entry.sequence_number),
    parent_link_hash: str(entry.parent_link_hash),
    continuity_id: str(entry.continuity_id),
    parent_continuity_id: str(entry.parent_continuity_id),
    validated_object_hash: str(entry.validated_object_hash),
    executed_object_hash: str(entry.executed_object_hash),
    proof_hash: str(entry.proof_hash),
    timestamp: str(entry.timestamp),
    mutation_allowed: false,
    link_hash: str(entry.link_hash),
  }
}

// All chained links for a lineage_key (substrate view).
export function readLinks(registryPath, lineageKey) {
  return readEntries(registryPath, lineageKey).map(entryToLink)
}

// The current head LINK of a lineage_key's chain (or null) — substrate head.
export function computeHead(registryPath, lineageKey) {
  return headOf(readLinks(registryPath, lineageKey))
}

// The prior run's ELIGIBILITY CARRY (what the gate inherits), or null for a root.
// Pulls revocation/expiry/status from the raw entry; identity from the link.
export function headCarry(registryPath, lineageKey) {
  const entries = readEntries(registryPath, lineageKey)
  if (entries.length === 0) return null
  const e = entries[entries.length - 1]
  return Object.freeze({
    continuity_id: str(e.continuity_id),
    parent_continuity_id: str(e.parent_continuity_id),
    validated_object_hash: str(e.validated_object_hash),
    executed_object_hash: str(e.executed_object_hash),
    proof_hash: str(e.proof_hash),
    status: str(e.status || 'ACTIVE'),
    expires_at: str(e.expires_at),
    revoked_at: str(e.revoked_at),
  })
}

// The set of nonces already consumed on a lineage_key (feeds REPLAYED_NONCE).
export function consumedNonces(registryPath, lineageKey) {
  const set = new Set()
  for (const e of readEntries(registryPath, lineageKey)) {
    if (str(e.nonce)) set.add(str(e.nonce))
  }
  return set
}

// Verify the full persisted substrate chain for a lineage_key (fail-closed).
export function verifyRegistryChain(registryPath, lineageKey) {
  return verifyChain(readLinks(registryPath, lineageKey))
}

// admitRun — the gate, persisted. Fail-closed end to end:
//   1. read the prior carry (head) and consumed nonces from disk
//   2. classifyExecutionEligibility(prior, current) — narrows only, NULL-default
//   3. ELIGIBLE  -> build the next substrate link and append one line
//      NULL      -> append NOTHING; return the reasons
//
// Returns { eligibility, null_reasons, record?, appended }.
export function admitRun(registryPath, current, options = {}) {
  const lineageKey = str(current.lineage_key)
  const prior = headCarry(registryPath, lineageKey)
  const decision = classifyExecutionEligibility(prior, current, {
    now: options.now,
    consumed_nonces: consumedNonces(registryPath, lineageKey),
  })

  if (decision.eligibility !== 'ELIGIBLE') {
    return { ...decision, appended: false }
  }

  const carry = eligibilityCarry(current)
  const head = computeHead(registryPath, lineageKey)
  const link = linkProof(
    {
      lineage_key: lineageKey,
      continuity_id: carry.continuity_id,
      parent_continuity_id: carry.parent_continuity_id,
      validated_object_hash: carry.validated_object_hash,
      executed_object_hash: carry.executed_object_hash,
      proof_hash: carry.proof_hash,
      timestamp: str(options.timestamp || current.timestamp),
    },
    head,
  )

  // Substrate integrity check before the single append (never rewrite/reorder).
  const inheritance = verifyInheritance(link, head)
  if (inheritance.result !== 'VALID') {
    throw new Error(`substrate refused append — NULL (${inheritance.null_reasons.join(', ')})`)
  }

  const record = {
    _record_type: 'execution_lineage_entry',
    proof_id: options.proof_id ?? null,
    lineage_key: link.lineage_key,
    sequence_number: link.sequence_number,
    parent_link_hash: link.parent_link_hash,
    continuity_id: link.continuity_id,
    parent_continuity_id: link.parent_continuity_id,
    validated_object_hash: link.validated_object_hash,
    executed_object_hash: link.executed_object_hash,
    proof_hash: link.proof_hash,
    nonce: str(current.nonce) || undefined,
    status: carry.status,
    expires_at: carry.expires_at || undefined,
    revoked_at: carry.revoked_at || undefined,
    timestamp: link.timestamp,
    link_hash: link.link_hash,
  }

  appendFileSync(registryPath, JSON.stringify(record) + '\n')
  return { ...decision, record, appended: true }
}
