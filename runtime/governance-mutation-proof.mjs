import { createHash } from 'node:crypto';

/**
 * Classify changed files into governed files / mutation classes.
 *
 * Mirrors the path-pattern rules in .github/workflows/merge-governance-check.yml
 * ("Detect changed files and governed paths"), restricted to the classes relevant
 * to GAP-005 (governance_mutation, workflow_mutation). governance/authorizations/**
 * and the proof registry itself are exempt per GOVERNANCE_MUTATION_AUTHORIZATION_SPEC.json.
 */
export function classifyGovernedFiles(changedFiles) {
  const governedFiles = [];
  const mutationClasses = new Set();

  for (const file of changedFiles) {
    if (!file) continue;
    if (file.startsWith('governance/authorizations/')) continue;
    if (file === 'governance/merge-legitimacy/merge_proof_registry.jsonl') continue;

    if (file.startsWith('governance/')) {
      governedFiles.push(file);
      mutationClasses.add('governance_mutation');
    } else if (file.startsWith('.github/workflows/')) {
      governedFiles.push(file);
      mutationClasses.add('workflow_mutation');
    }
  }

  governedFiles.sort();
  return { governedFiles, mutationClasses: [...mutationClasses].sort() };
}

/**
 * Deterministic governed_files_hash, identical to the algorithm documented in
 * GOVERNANCE_MUTATION_AUTHORIZATION_SPEC.json (governed_files_hash_input):
 * sorted "path:sha256(content)" entries joined by newline, then sha256 of the result.
 *
 * `readFileFn(path)` must return a Buffer or string of the file's content;
 * deleted files are represented as the literal buffer 'DELETED'.
 */
export function computeGovernedFilesHash(governedFiles, readFileFn) {
  const parts = [...governedFiles].sort().map((file) => {
    let content;
    try {
      content = readFileFn(file);
    } catch (_) {
      content = Buffer.from('DELETED');
    }
    const hash = createHash('sha256').update(content).digest('hex');
    return `${file}:${hash}`;
  });
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

/**
 * Select the gma_registry.jsonl entry that authorized this PR's governed diff,
 * mirroring the (branch, governed_files_hash) selection rule in
 * merge-governance-check.yml ("Validate governance mutation authorization").
 *
 * Returns the most recently created matching entry, or null if none match.
 */
export function selectGmaEntry(registryEntries, { branch, governedFilesHash, now = new Date() }) {
  const candidates = registryEntries.filter(
    (entry) =>
      entry &&
      entry.governed_files_hash === governedFilesHash &&
      entry.branch === branch &&
      entry.status === 'GMA_VALID' &&
      new Date(entry.expires_at) > now,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return candidates[0];
}

/**
 * Build a governance_mutation_proof record binding a merged governance/workflow
 * mutation back to the GMA that authorized it (or recording that none was found).
 *
 * Evidence-only: this record never authorizes or blocks anything. proof_status is
 * GENERATED when a GMA was bound, or MISSING_AUTHORIZER when no matching GMA entry
 * could be located in gma_registry.jsonl at proof-generation time.
 */
export function buildGovernanceMutationProof({
  pr_number,
  merge_commit_sha,
  merge_proof_id,
  gma,
  mutationClasses,
  governedFilesHash,
  generatedAt,
}) {
  const proofStatus = gma ? 'GENERATED' : 'MISSING_AUTHORIZER';

  const canonicalPayload = {
    pr_number,
    merge_commit_sha,
    merge_proof_id,
    governed_files_hash: governedFilesHash,
    mutation_classes: [...mutationClasses].sort(),
    gma_id: gma ? gma.gma_id : null,
    decision_id: gma ? gma.decision_id : null,
    continuity_id: gma ? gma.continuity_id : null,
    session_id: gma ? gma.session_id : null,
    proof_status: proofStatus,
  };

  const canonicalHash = createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

  return {
    proof_id: `GMPROOF-${pr_number}-${merge_commit_sha.slice(0, 8)}`,
    record_type: 'GOVERNANCE_MUTATION_PROOF',
    canonical_payload: canonicalPayload,
    canonical_hash: canonicalHash,
    generated_at: generatedAt,
  };
}
