import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  selectStandingAuthority,
  globMatch,
  parseRegistry,
  countConsumedBudget,
  computeAuthorityHash,
} from '../../runtime/standing-authority.mjs';

const root = process.cwd();

const HOUR = 60 * 60 * 1000;

function sa(overrides = {}) {
  const issued = new Date();
  const bounds = {
    branch_pattern: 'claude/*',
    mutation_classes: ['workflow_mutation'],
    path_globs: ['.github/workflows/**'],
    max_merges: 2,
    ...(overrides.bounds || {}),
  };
  const { bounds: _drop, ...rest } = overrides;
  return {
    _record_type: 'standing_authority',
    authority_id: 'SA-test-1',
    authority_hash: 'a'.repeat(64),
    intent: 'test authority',
    issued_by: 'owner',
    source_authority: 'OWNER_WORKFLOW_DISPATCH',
    bounds,
    ttl_hours: 24,
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + 24 * HOUR).toISOString(),
    authority_lineage_bound: true,
    status: 'STANDING_AUTHORITY_VALID',
    ...rest,
  };
}

function registry(records) {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

test('in-scope PR is admitted via standing-authority derivation', () => {
  const r = selectStandingAuthority({
    registryText: registry([sa()]),
    headRef: 'claude/fix-thing',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
  });
  assert.equal(r.authorized, true, r.reason);
  assert.equal(r.authority.authority_id, 'SA-test-1');
});

test('branch-pattern miss is not derivable (NULL)', () => {
  const r = selectStandingAuthority({
    registryText: registry([sa()]),
    headRef: 'feature/other',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /does not match pattern claude\/\*/);
});

test('mutation class outside scope is not derivable (NULL)', () => {
  const r = selectStandingAuthority({
    registryText: registry([sa()]),
    headRef: 'claude/x',
    governedFiles: ['governance/foo.json'],
    detectedClasses: ['governance_mutation'],
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /mutation class governance_mutation outside authority scope/);
});

test('file outside path scope is not derivable (scope containment)', () => {
  const r = selectStandingAuthority({
    registryText: registry([sa()]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml', 'src/index.ts'],
    detectedClasses: ['workflow_mutation'],
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /file src\/index\.ts outside authority path scope/);
});

test('expired authority is not derivable (TTL hard bound)', () => {
  const expired = sa({
    issued_at: new Date(Date.now() - 48 * HOUR).toISOString(),
    expires_at: new Date(Date.now() - 24 * HOUR).toISOString(),
  });
  const r = selectStandingAuthority({
    registryText: registry([expired]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /expired.*TTL hard bound/);
});

test('revoked authority is not derivable', () => {
  const auth = sa();
  const revocation = {
    _record_type: 'standing_authority_revocation',
    authority_id: auth.authority_id,
    revoked_by: 'owner',
    revoked_at: new Date().toISOString(),
    reason: 'rescinded',
  };
  const r = selectStandingAuthority({
    registryText: registry([auth, revocation]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /revoked/);
});

test('budget exhausted (proof count >= max_merges) is not derivable', () => {
  const auth = sa({ authority_id: 'SA-budget', bounds: { max_merges: 2 } });
  const proofs = [
    { _record_type: 'proof_entry', proof_id: 'PROOF-1', standing_authority_id: 'SA-budget' },
    { _record_type: 'proof_entry', proof_id: 'PROOF-2', standing_authority_id: 'SA-budget' },
  ].map((p) => JSON.stringify(p)).join('\n') + '\n';

  const r = selectStandingAuthority({
    registryText: registry([auth]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
    proofRegistryText: proofs,
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /budget exhausted \(2\/2 merges consumed\)/);
});

test('budget with room remaining is derivable', () => {
  const auth = sa({ authority_id: 'SA-room', bounds: { max_merges: 2 } });
  const proofs = JSON.stringify({
    _record_type: 'proof_entry', proof_id: 'PROOF-1', standing_authority_id: 'SA-room',
  }) + '\n';
  const r = selectStandingAuthority({
    registryText: registry([auth]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
    proofRegistryText: proofs,
  });
  assert.equal(r.authorized, true, r.reason);
});

test('most-recently-issued qualifying authority wins (deterministic)', () => {
  const older = sa({
    authority_id: 'SA-old',
    issued_at: new Date(Date.now() - 10 * HOUR).toISOString(),
    expires_at: new Date(Date.now() + 14 * HOUR).toISOString(),
  });
  const newer = sa({
    authority_id: 'SA-new',
    issued_at: new Date(Date.now() - 1 * HOUR).toISOString(),
    expires_at: new Date(Date.now() + 23 * HOUR).toISOString(),
  });
  const r = selectStandingAuthority({
    registryText: registry([older, newer]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
  });
  assert.equal(r.authorized, true, r.reason);
  assert.equal(r.authority.authority_id, 'SA-new');
});

test('when the newest covering authority is budget-exhausted, an older one with room authorizes (and is what gets stamped)', () => {
  // Reproduces the merge gate's budgeted choice: selection must skip the exhausted
  // newest authority and pick the older one that actually has remaining budget, so the
  // merge proof (which reruns selection with the real ledger) consumes the correct one.
  const older = sa({
    authority_id: 'SA-old',
    bounds: { max_merges: 5 },
    issued_at: new Date(Date.now() - 10 * HOUR).toISOString(),
    expires_at: new Date(Date.now() + 14 * HOUR).toISOString(),
  });
  const newer = sa({
    authority_id: 'SA-new',
    bounds: { max_merges: 1 },
    issued_at: new Date(Date.now() - 1 * HOUR).toISOString(),
    expires_at: new Date(Date.now() + 23 * HOUR).toISOString(),
  });
  const proofs = JSON.stringify({
    _record_type: 'proof_entry', proof_id: 'PROOF-x', standing_authority_id: 'SA-new',
  }) + '\n'; // SA-new is at 1/1 → exhausted

  const r = selectStandingAuthority({
    registryText: registry([older, newer]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
    proofRegistryText: proofs,
  });
  assert.equal(r.authorized, true, r.reason);
  assert.equal(r.authority.authority_id, 'SA-old', 'must skip the exhausted newest and pick the older authority with budget');
});

test('empty registry fails closed', () => {
  const r = selectStandingAuthority({
    registryText: '',
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation'],
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /no standing authorities issued/);
});

test('proof_persistence class never requires authorization (not a governance primitive)', () => {
  const r = selectStandingAuthority({
    registryText: registry([sa()]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/ci.yml'],
    detectedClasses: ['workflow_mutation', 'proof_persistence'],
  });
  assert.equal(r.authorized, true, r.reason);
});

test('a PR with no governance/workflow class is never authorized (no vacuous budget drain)', () => {
  const r = selectStandingAuthority({
    registryText: registry([sa()]),
    headRef: 'claude/docs-only',
    governedFiles: [],
    detectedClasses: ['proof_persistence'],
  });
  assert.equal(r.authorized, false);
  assert.match(r.reason, /no governance\/workflow mutation to authorize/);
});

test('globMatch: ** crosses separators, * does not', () => {
  assert.equal(globMatch('.github/workflows/**', '.github/workflows/a/b.yml'), true);
  assert.equal(globMatch('docs/*', 'docs/a.md'), true);
  assert.equal(globMatch('docs/*', 'docs/a/b.md'), false);
  assert.equal(globMatch('claude/*', 'claude/feature-x'), true);
  assert.equal(globMatch('claude/*', 'main'), false);
});

test('parseRegistry separates authorities from revocations and ignores malformed lines', () => {
  const text = [
    JSON.stringify(sa({ authority_id: 'SA-1' })),
    'not json',
    JSON.stringify({ _record_type: 'standing_authority_revocation', authority_id: 'SA-1' }),
    JSON.stringify({ _record_type: 'unrelated' }),
  ].join('\n');
  const { authorities, revocations } = parseRegistry(text);
  assert.equal(authorities.length, 1);
  assert.equal(revocations.length, 1);
});

test('countConsumedBudget counts only well-formed proof_entry records, deduped by proof_id', () => {
  const proofs = [
    { _record_type: 'proof_entry', proof_id: 'P1', standing_authority_id: 'SA-a' },
    { _record_type: 'proof_entry', proof_id: 'P2', standing_authority_id: 'SA-b' },
    { _record_type: 'proof_entry', proof_id: 'P3', standing_authority_id: 'SA-a' },
    { _record_type: 'proof_entry', proof_id: 'P3', standing_authority_id: 'SA-a' }, // duplicate proof_id — not double-counted
    { standing_authority_id: 'SA-a' },                                              // no _record_type / proof_id — ignored (budget-DoS guard)
    { _record_type: 'proof_entry', standing_authority_id: 'SA-a' },                 // missing proof_id — ignored
    { proof_id: 'no-sa' },
  ].map((p) => JSON.stringify(p)).join('\n');
  assert.equal(countConsumedBudget(proofs, 'SA-a'), 2);
  assert.equal(countConsumedBudget(proofs, 'SA-b'), 1);
});

test('computeAuthorityHash is order-independent over bound lists and stable', () => {
  const h1 = computeAuthorityHash({
    branch_pattern: 'claude/*', mutation_classes: ['workflow_mutation', 'governance_mutation'],
    path_globs: ['b/**', 'a/**'], max_merges: 2, ttl_hours: 24, issued_at: '2026-01-01T00:00:00Z',
  });
  const h2 = computeAuthorityHash({
    branch_pattern: 'claude/*', mutation_classes: ['governance_mutation', 'workflow_mutation'],
    path_globs: ['a/**', 'b/**'], max_merges: 2, ttl_hours: 24, issued_at: '2026-01-01T00:00:00Z',
  });
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
});

// --- Workflow wiring assertions (string-level, mirroring issue-1984 test style) ---

test('merge-governance-check imports the shared module and admits via Tier 3', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  assert.match(wf, /runtime\/standing-authority\.mjs/, 'Tier 3 must import the shared derivation module');
  assert.match(wf, /selectStandingAuthority/, 'Tier 3 must call selectStandingAuthority');
  assert.match(wf, /standing-authority-derivation/, 'admission source must be logged');
});

test('merge-governance-check derives Standing Authorities from the BASE branch only (P1: no PR-local self-authorization)', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  assert.match(wf, /git show "\$\{BASE_SHA\}:\$\{SA_REGISTRY\}" > sa_registry_base\.jsonl/, 'Tier 3 must read the SA registry from BASE_SHA');
  assert.match(wf, /readFileSync\('sa_registry_base\.jsonl'/, 'Tier 3 must derive from the base-branch SA registry file');
  assert.match(wf, /proof_registry_base\.jsonl/, 'budget must be counted from the base-branch proof ledger');
});

test('merge-governance-check loads the derivation verifier from the BASE branch (P1: no head-checkout code execution)', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  assert.match(wf, /git show "\$\{BASE_SHA\}:runtime\/standing-authority\.mjs" > sa_verifier_base\.mjs/, 'verifier must be extracted from BASE_SHA');
  assert.match(wf, /await import\('\.\/sa_verifier_base\.mjs'\)/, 'Tier 3 must import the base verifier, not the head module');
});

test('merge-governance-check validates appended standing authority records (P1: shape/consistency)', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  assert.match(wf, /Validate appended standing authority records/, 'a dedicated SA record validation step must exist');
  assert.match(wf, /source_authority must be OWNER_WORKFLOW_DISPATCH/, 'appended records must declare owner-dispatch source');
  assert.match(wf, /authority_hash does not match its bounds/, 'authority_hash must be recomputed and checked');
});

test('merge-governance-check restricts SA path containment to GMA-gated files (P2: no false NULL on mixed PRs)', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  assert.match(wf, /const authFiles = governedFiles\.filter/, 'path containment must use only governance/workflow files');
  assert.match(wf, /governedFiles: authFiles/, 'filtered file list must be passed to selectStandingAuthority');
});

test('merge-proof attributes from the BASE branch with the real proof ledger and merge-time TTL (P1/P2)', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  assert.match(wf, /git show "\$\{BASE_SHA\}:\$\{SA_REGISTRY\}" > sa_registry_base\.jsonl/, 'attribution must read the SA registry from BASE_SHA');
  assert.match(wf, /readFileSync\('proof_registry_base\.jsonl', 'utf8'\)/, 'attribution must apply the real base proof ledger so the gate choice is reproduced');
  assert.match(wf, /await import\('\.\/sa_verifier_base\.mjs'\)/, 'attribution must run the base verifier');
  assert.match(wf, /now: mergedAt/, 'TTL must be evaluated at merge time, not proof-generation time');
});

test('merge-governance-check enforces append-only growth of the standing authority registry', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  assert.match(wf, /standing_authority_registry\.jsonl/, 'append-only guard must cover the SA registry');
});

test('merge-proof stamps standing_authority_id into the proof entry (budget ledger)', () => {
  const wf = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  assert.match(wf, /standing_authority_id/, 'proof entry must record standing_authority_id for budget tracking');
});

test('.gitattributes declares merge=union for the standing authority registry', () => {
  const gitattributes = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.match(gitattributes, /governance\/authorizations\/standing_authority_registry\.jsonl\s+merge=union/);
});

test('SA trust surfaces are GMA-gated (gate-both) in BOTH classifiers, byte-aligned', () => {
  const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  const issuer = readFileSync(join(root, '.github', 'workflows', 'governance-mutation-authorization.yml'), 'utf8');
  for (const wf of [gate, issuer]) {
    assert.match(wf, /governance\/authorizations\/standing_authority_registry\.jsonl\)/, 'SA registry must be a classified (governed) path');
    assert.match(wf, /runtime\/standing-authority\.mjs\)/, 'verifier must be a classified (governed) path');
  }
  // The specific SA-registry case must precede the governance/authorizations/* exemption.
  for (const wf of [gate, issuer]) {
    const specific = wf.indexOf('governance/authorizations/standing_authority_registry.jsonl)');
    const exempt = wf.indexOf('governance/authorizations/*)');
    assert.ok(specific !== -1 && exempt !== -1 && specific < exempt, 'specific SA-registry case must precede the exemption');
  }
});

test('Tier 3 and merge-proof refuse fork-origin PRs (P2 fork safety)', () => {
  const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  const proof = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  for (const wf of [gate, proof]) {
    assert.match(wf, /HEAD_REPO !== process\.env\.BASE_REPO/, 'fork PRs must be excluded from SA derivation/attribution');
  }
});

test('merge-proof skips SA attribution when an explicit GMA admitted the PR (P2 precedence)', () => {
  const proof = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  assert.match(proof, /admitted by explicit GMA \(tiers 1-2\)/, 'explicit-GMA merges must not consume SA budget');
  assert.match(proof, /e\.governed_files_hash === computedHash && e\.branch === headRef/, 'must reproduce the gate registry match');
});

test('issuer derives expires_at from ttl_hours and the gate re-validates the binding (P2)', () => {
  const issuer = readFileSync(join(root, '.github', 'workflows', 'standing-authority-issuance.yml'), 'utf8');
  const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  assert.match(issuer, /new Date\(issued_at\)\.getTime\(\) \+ ttl_hours \* 3600 \* 1000/, 'issuer must derive expires_at from issued_at + ttl_hours');
  assert.match(gate, /expires_at must equal issued_at \+ ttl_hours/, 'gate must re-validate the expires_at binding');
});

test('trust surfaces are hard-denied from SA derivation in gate and merge-proof (P1)', () => {
  const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  const proof = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  for (const wf of [gate, proof]) {
    assert.match(wf, /TRUST_SURFACES = new Set\(\[/, 'trust surfaces must be explicitly enumerated');
    assert.match(wf, /touchesTrustSurface/, 'a hard deny on trust-surface edits must exist');
  }
  // The gate must gate Tier 3 derivation on NOT touching a trust surface.
  assert.match(gate, /!touchesTrustSurface && existsSync\('sa_registry_base\.jsonl'\)/, 'Tier 3 must not run when a trust surface is touched');
});

test('issuer workflows are hard-denied trust surfaces in BOTH classifiers (issue #2008)', () => {
  const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  const proof = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  // Both authority-minting issuer workflows must appear inside each file's TRUST_SURFACES set,
  // so a workflow-scoped Standing Authority can never SA-derive an edit to the machinery that
  // grants authority — it must fall through to an explicit manual GMA.
  for (const wf of [gate, proof]) {
    const start = wf.indexOf('TRUST_SURFACES = new Set([');
    const end = wf.indexOf('])', start);
    assert.ok(start !== -1 && end !== -1, 'TRUST_SURFACES set must be present');
    const set = wf.slice(start, end);
    assert.match(set, /\.github\/workflows\/governance-mutation-authorization\.yml/, 'GMA issuer workflow must be a hard-denied trust surface');
    assert.match(set, /\.github\/workflows\/standing-authority-issuance\.yml/, 'SA issuer workflow must be a hard-denied trust surface');
  }
  // The spec must document the issuer workflows as trust surfaces.
  const spec = JSON.parse(readFileSync(join(root, 'governance', 'authorizations', 'STANDING_AUTHORITY_SPEC.json'), 'utf8'));
  const gating = JSON.stringify(spec.trust_surface_gating);
  assert.match(gating, /governance-mutation-authorization\.yml/, 'spec must document the GMA issuer as a trust surface');
  assert.match(gating, /standing-authority-issuance\.yml/, 'spec must document the SA issuer as a trust surface');
});

test('merge-proof evaluates explicit-GMA expiry at merge time, not proof-gen time (P2)', () => {
  const proof = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  assert.match(proof, /new Date\(e\.expires_at\) > mergedAt/, 'explicit-GMA expiry must be compared against mergedAt');
});

test('append-only guard covers the proof budget ledger (P2)', () => {
  const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  // All three append-only surfaces must be in the guard loop.
  const loop = gate.slice(gate.indexOf('for REGISTRY in'), gate.indexOf('do', gate.indexOf('for REGISTRY in')));
  assert.match(loop, /gma_registry\.jsonl/);
  assert.match(loop, /standing_authority_registry\.jsonl/);
  assert.match(loop, /merge_proof_registry\.jsonl/, 'the SA budget ledger must be append-only protected');
});

test('authority_id is validated as a single-line safe token in gate and merge-proof (P2)', () => {
  const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  const proof = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');
  assert.match(gate, /not a single-line safe token/, 'gate must reject unsafe authority_id at admission');
  assert.match(proof, /not a single-line safe token/, 'merge-proof must guard authority_id before the $GITHUB_ENV write');
});

test('two-step issuance flow (issue SA, then GMA) is documented', () => {
  const issuer = readFileSync(join(root, '.github', 'workflows', 'standing-authority-issuance.yml'), 'utf8');
  assert.match(issuer, /TWO-STEP ISSUANCE/, 'issuance workflow must document the two-step flow');
  assert.match(issuer, /governance-mutation-authorization\.yml on the SAME branch/, 'must instruct to emit a GMA for the SA-registry change');
  const spec = JSON.parse(readFileSync(join(root, 'governance', 'authorizations', 'STANDING_AUTHORITY_SPEC.json'), 'utf8'));
  assert.ok(spec.trust_surface_gating.issuance_flow, 'spec must document the issuance flow');
});

test('STANDING_AUTHORITY_SPEC documents the bound model and the compressed rule', () => {
  const spec = JSON.parse(
    readFileSync(join(root, 'governance', 'authorizations', 'STANDING_AUTHORITY_SPEC.json'), 'utf8'),
  );
  assert.ok(spec.bound_model, 'spec must declare a bound_model');
  assert.match(JSON.stringify(spec.bound_model), /TTL/);
  assert.match(JSON.stringify(spec), /Both must end in proof/);
});

test('operational-risk markdown audits remain evidence-only in merge admission classifiers', () => {
  const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');
  const proof = readFileSync(join(root, '.github', 'workflows', 'merge-proof.yml'), 'utf8');

  assert.match(gate, /governance\/operational-risk\/\*\.md\)/, 'merge gate must classify operational-risk markdown explicitly');
  assert.match(gate, /operational_risk_evidence/, 'merge gate must emit evidence-only mutation class for operational-risk audits');
  assert.match(proof, /\^governance\\\/operational-risk\\\/\[\^\/\]\+\\\.md\$/, 'merge proof must share the same operational-risk evidence classifier');
  assert.match(proof, /operational_risk_evidence/, 'merge proof must not attribute operational-risk evidence to Standing Authority budget');

  const gateOperationalIndex = gate.indexOf('governance/operational-risk/*.md)');
  const gateGenericGovernanceIndex = gate.indexOf('governance/*)', gateOperationalIndex);
  assert.ok(gateOperationalIndex > -1 && gateGenericGovernanceIndex > gateOperationalIndex,
    'operational-risk evidence exception must precede generic governance mutation classification');
});
