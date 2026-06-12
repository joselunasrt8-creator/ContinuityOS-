import { createHash } from 'node:crypto';

/**
 * Standing Authority — policy-bound GMA derivation (GMA Phase 2).
 *
 * A Standing Authority (SA) is a bounded, owner-issued authority from which a
 * scoped governance-mutation authorization is DERIVED automatically at merge-check
 * time, instead of requiring a manual per-PR GMA. One issuance -> many bounded
 * derivations.
 *
 * Canonical invariant (preserved, not weakened): no valid authority -> no
 * governance mutation. A SA is just authority issued once and bounded, rather than
 * pressed per PR.
 *
 * Bound model (carried verbatim into STANDING_AUTHORITY_SPEC.json):
 *   TTL              = HARD bound (synchronous, exact).
 *   max_merges       = async proof-ledger BUDGET (best-effort, observed).
 * "V1 standing authority is TTL-hard-bound and proof-budget-observed. It is not
 *  strictly serial-budget-enforced until a merge queue or synchronous proof
 *  reservation exists."
 *
 * This module is the single source of derivation truth. It is imported by:
 *   - .github/workflows/merge-governance-check.yml  (Tier 3 admission)
 *   - .github/workflows/merge-proof.yml             (budget-consumption stamp)
 *   - tests/fate/standing-authority-derivation.test.mjs
 */

export const STANDING_AUTHORITY_VALID = 'STANDING_AUTHORITY_VALID';

/**
 * Translate a `*` / `**` / `?` glob into an anchored RegExp.
 *   `**` matches across path separators (any chars, including `/`)
 *   `*`  matches within a single path segment (any chars except `/`)
 *   `?`  matches a single non-`/` char
 * No `minimatch` dependency is available; this mirrors the shell glob semantics
 * already relied on in merge-proof.yml.
 */
export function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return new RegExp('^' + out + '$');
}

export function globMatch(pattern, str) {
  return globToRegExp(pattern).test(str);
}

/**
 * Parse the append-only standing_authority_registry.jsonl text into its two
 * record kinds. Malformed lines are ignored (the registry is authoritative; a
 * single bad line must never silently authorize).
 */
export function parseRegistry(registryText) {
  const authorities = [];
  const revocations = [];
  for (const line of (registryText || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch (_) {
      continue;
    }
    if (rec && rec._record_type === 'standing_authority') {
      authorities.push(rec);
    } else if (rec && rec._record_type === 'standing_authority_revocation') {
      revocations.push(rec);
    }
  }
  return { authorities, revocations };
}

/**
 * Count merge_proof_registry.jsonl entries that consumed budget against a given
 * authority_id. Each governed merge derived under a SA stamps standing_authority_id
 * into its proof entry, so the append-only proof ledger IS the budget ledger.
 *
 * Only well-formed proof_entry records with a proof_id are counted, and counting is
 * de-duplicated by proof_id. merge_proof_registry.jsonl is classified proof_persistence
 * (not GMA-gated), so a proof-registry PR could otherwise append bogus lines citing an
 * active standing_authority_id to exhaust that authority (budget DoS). Requiring the
 * canonical proof_entry shape + unique proof_id raises the bar; full proof_hash
 * verification against the canonical payload is sequenced for post-V1.
 */
export function countConsumedBudget(proofRegistryText, authorityId) {
  const proofIds = new Set();
  for (const line of (proofRegistryText || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch (_) {
      continue;
    }
    if (rec
      && rec._record_type === 'proof_entry'
      && rec.standing_authority_id === authorityId
      && rec.proof_id) {
      proofIds.add(rec.proof_id);
    }
  }
  return proofIds.size;
}

/**
 * Deterministic hash over the canonical bound fields of a SA. Lets the issuer and
 * any verifier recompute the same authority_hash from the bounds alone (repo-
 * verifiable, no external runtime).
 */
export function computeAuthorityHash({ branch_pattern, mutation_classes, path_globs, max_merges, ttl_hours, issued_at }) {
  const canonical = JSON.stringify({
    branch_pattern,
    mutation_classes: [...(mutation_classes || [])].sort(),
    path_globs: [...(path_globs || [])].sort(),
    max_merges,
    ttl_hours,
    issued_at,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Evaluate a PR's governed diff against the Standing Authority registry.
 *
 * Returns { authorized, authority, reason }. A PR is authorized iff there exists a
 * SA where ALL of the following hold:
 *   - status === STANDING_AUTHORITY_VALID and not revoked;
 *   - now < expires_at                                  (TTL — hard bound);
 *   - headRef matches bounds.branch_pattern             (where);
 *   - every detected governance/workflow class in bounds.mutation_classes (what);
 *   - every governed file matches >=1 bounds.path_globs (scope containment);
 *   - consumed budget < bounds.max_merges               (async proof-ledger budget).
 * If multiple SAs qualify, the most-recently-issued is chosen (deterministic).
 *
 * Fail closed: any missing/empty input yields authorized:false with a reason.
 */
export function selectStandingAuthority({
  registryText,
  headRef,
  governedFiles,
  detectedClasses,
  now = new Date(),
  proofRegistryText = '',
}) {
  if (!headRef) {
    return { authorized: false, authority: null, reason: 'no head ref available for standing-authority derivation' };
  }
  const { authorities, revocations } = parseRegistry(registryText);
  if (authorities.length === 0) {
    return { authorized: false, authority: null, reason: 'no standing authorities issued' };
  }

  const revokedIds = new Set(revocations.map((r) => r.authority_id));
  const files = (governedFiles || []).filter(Boolean);
  // Only governance/workflow mutation classes gate GMA; others (proof_persistence)
  // are not governance primitives and never require authorization here.
  const classes = [...new Set(
    (detectedClasses || []).filter((c) => c === 'governance_mutation' || c === 'workflow_mutation'),
  )];

  // Nothing for a GMA-class authority to authorize. Returning authorized here would
  // vacuously satisfy every bound (no out-of-scope class, no uncovered file) and
  // wrongly consume budget. This path only authorizes governance/workflow mutations.
  if (classes.length === 0) {
    return { authorized: false, authority: null, reason: 'no governance/workflow mutation to authorize' };
  }

  const reasons = [];
  const qualifying = [];

  for (const sa of authorities) {
    const id = sa.authority_id || '(unknown)';
    const b = sa.bounds || {};

    if (sa.status !== STANDING_AUTHORITY_VALID) {
      reasons.push(`${id}: status ${sa.status} != ${STANDING_AUTHORITY_VALID}`);
      continue;
    }
    if (revokedIds.has(sa.authority_id)) {
      reasons.push(`${id}: revoked`);
      continue;
    }
    if (!(new Date(sa.expires_at) > now)) {
      reasons.push(`${id}: expired at ${sa.expires_at} (TTL hard bound)`);
      continue;
    }
    if (!b.branch_pattern || !globMatch(b.branch_pattern, headRef)) {
      reasons.push(`${id}: branch ${headRef} does not match pattern ${b.branch_pattern}`);
      continue;
    }
    const allowedClasses = new Set(b.mutation_classes || []);
    const outOfScopeClass = classes.find((c) => !allowedClasses.has(c));
    if (outOfScopeClass) {
      reasons.push(`${id}: mutation class ${outOfScopeClass} outside authority scope`);
      continue;
    }
    const globs = b.path_globs || [];
    const uncovered = files.find((f) => !globs.some((g) => globMatch(g, f)));
    if (uncovered) {
      reasons.push(`${id}: file ${uncovered} outside authority path scope`);
      continue;
    }
    const consumed = countConsumedBudget(proofRegistryText, sa.authority_id);
    if (!(consumed < b.max_merges)) {
      reasons.push(`${id}: budget exhausted (${consumed}/${b.max_merges} merges consumed)`);
      continue;
    }

    qualifying.push(sa);
  }

  if (qualifying.length === 0) {
    return {
      authorized: false,
      authority: null,
      reason: reasons.length ? reasons.join('; ') : 'no standing authority covers this governed diff',
    };
  }

  qualifying.sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));
  return { authorized: true, authority: qualifying[0], reason: null };
}
