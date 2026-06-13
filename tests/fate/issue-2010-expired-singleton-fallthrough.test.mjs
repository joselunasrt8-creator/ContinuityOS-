import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');

// Isolate the Tier-2 legacy-singleton fallback block so assertions are scoped to it.
function singletonBlock() {
  const start = gate.indexOf("FALLBACK (transitional, Phase 2): legacy singleton");
  assert.ok(start !== -1, 'the Tier-2 singleton fallback block must exist');
  const end = gate.indexOf('TIER 3 (Policy-Bound GMA', start);
  assert.ok(end !== -1, 'Tier 3 must follow the singleton block');
  return gate.slice(start, end);
}

test('Issue #2010: an invalid/expired singleton does not short-circuit Tier 3', () => {
  const block = singletonBlock();
  // The singleton must only be accepted (set `matched`) when it is actually valid —
  // governed_files_hash alone is insufficient. Require status, lineage binding, and TTL.
  assert.match(block, /gma\.governed_files_hash === computedHash/, 'hash match is still required');
  assert.match(block, /gma\.status === 'GMA_VALID'/, 'singleton must be GMA_VALID to short-circuit Tier 3');
  assert.match(block, /gma\.authority_lineage_bound === true/, 'singleton must declare authority_lineage_bound: true');
  assert.match(block, /new Date\(gma\.expires_at\) > now/, 'an expired singleton must not be accepted (it must fall through to Tier 3)');
});

test('Issue #2010: the singleton acceptance is a single conjunction gating `matched`', () => {
  const block = singletonBlock();
  // All gates must be AND-combined in the condition that sets `matched` (not hash-only).
  const condIdx = block.indexOf('gma.governed_files_hash === computedHash');
  const matchedIdx = block.indexOf('matched = gma;', condIdx);
  assert.ok(condIdx !== -1 && matchedIdx !== -1 && condIdx < matchedIdx,
    'matched must be set only inside the validity-gated condition');
  const cond = block.slice(condIdx, matchedIdx);
  assert.match(cond, /&&\s*\n?\s*gma\.status === 'GMA_VALID'/, 'status check must be ANDed into the acceptance condition');
  assert.match(cond, /&&\s*\n?\s*new Date\(gma\.expires_at\) > now/, 'expiry check must be ANDed into the acceptance condition');
});

test('Issue #2010: Tier 3 derivation still runs when no valid explicit GMA matched', () => {
  // The Tier 3 block remains guarded by !matched, so a singleton that fails the validity
  // gates (and thus does not set matched) allows Standing Authority derivation to proceed.
  assert.match(gate, /!matched && !isFork && !touchesTrustSurface && existsSync\('sa_registry_base\.jsonl'\)/,
    'Tier 3 derivation must remain gated on !matched so an invalid singleton falls through');
});
