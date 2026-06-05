/**
 * Governance Self-Mutation Containment Check — GAP-005 / #1831
 *
 * Detects mutations to governance primitives and requires evidence that the
 * change traversed the full canonical governed lifecycle:
 *   /session → /continuity → /authority → /compile → /validate → /execute → /proof
 *
 * Fails closed: governance mutation without valid proof evidence → NULL.
 * Non-governance file changes are not blocked by this check.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Canonical lifecycle stages required for governance mutations
export const REQUIRED_LIFECYCLE_STAGES = [
  'session', 'continuity', 'authority', 'compile', 'validate', 'execute', 'proof',
];

// Required fields in a Governance Mutation Proof artifact
export const REQUIRED_GMP_FIELDS = [
  'gmp_id', 'gma_id', 'session_id', 'continuity_id', 'decision_id',
  'validated_object_hash', 'validation_receipt_id', 'execution_id', 'proof_id',
  'governed_files_hash', 'lifecycle_stages', 'status', 'created_at', 'expires_at',
];

// Governance primitive path classification.
// These match the target surfaces listed in #1831:
//   validator files, schema files, policy files, workflow YAML files, governance registry files
const GOVERNANCE_PRIMITIVE_RULES = [
  {
    // policy files, governance registry files
    match: (f) => f.startsWith('governance/'),
    exempt: (f) =>
      f.startsWith('governance/authorizations/') ||
      f === 'governance/merge-legitimacy/merge_proof_registry.jsonl',
    class: 'governance_mutation',
  },
  {
    // workflow YAML files
    match: (f) => f.startsWith('.github/workflows/'),
    exempt: () => false,
    class: 'workflow_mutation',
  },
  {
    // schema files (JSON schemas + canonical DB schema)
    match: (f) => f.startsWith('schemas/') || f === 'schema.sql',
    exempt: () => false,
    class: 'schema_mutation',
  },
  {
    // validator files — match any file whose name contains "validator"
    match: (f) => {
      if (!f.startsWith('src/') && !f.startsWith('scripts/')) return false;
      const filename = f.slice(f.lastIndexOf('/') + 1);
      return /validator/i.test(filename) && /\.(ts|mjs|js)$/.test(filename);
    },
    exempt: () => false,
    class: 'validator_mutation',
  },
];

/**
 * Classify changed files into governance-primitive mutations.
 * @param {string[]} changedFiles
 * @returns {{ governed: string[], mutationClasses: Set<string> }}
 */
export function classifyChangedFiles(changedFiles) {
  const governed = [];
  const mutationClasses = new Set();

  for (const file of changedFiles) {
    for (const rule of GOVERNANCE_PRIMITIVE_RULES) {
      if (rule.match(file) && !rule.exempt(file)) {
        governed.push(file);
        mutationClasses.add(rule.class);
        break;
      }
    }
  }

  return { governed, mutationClasses };
}

/**
 * Validate a Governance Mutation Proof artifact.
 * Returns { valid: true } or { valid: false, reason: string }.
 *
 * @param {object} gmp - Parsed GMP JSON
 * @param {object} gma - Parsed GMA JSON (for cross-binding validation)
 */
export function validateGovernanceMutationProof(gmp, gma) {
  // Required fields
  for (const field of REQUIRED_GMP_FIELDS) {
    if (gmp[field] === undefined || gmp[field] === null || gmp[field] === '') {
      return { valid: false, reason: `GMP missing required field: ${field}` };
    }
  }

  // Status
  if (gmp.status !== 'GMP_VALID') {
    return { valid: false, reason: `GMP status must be GMP_VALID, got: ${gmp.status}` };
  }

  // Expiry
  if (new Date(gmp.expires_at) <= new Date()) {
    return { valid: false, reason: `GMP expired at ${gmp.expires_at}` };
  }

  // Full lifecycle stages present
  const gmpStages = new Set(Array.isArray(gmp.lifecycle_stages) ? gmp.lifecycle_stages : []);
  for (const stage of REQUIRED_LIFECYCLE_STAGES) {
    if (!gmpStages.has(stage)) {
      return { valid: false, reason: `GMP missing lifecycle stage: ${stage}` };
    }
  }

  // Binding: GMP must reference the same GMA
  if (gmp.gma_id !== gma.gma_id) {
    return { valid: false, reason: `GMP gma_id (${gmp.gma_id}) does not match GMA gma_id (${gma.gma_id})` };
  }

  // Binding: governed_files_hash must be identical in GMP and GMA
  if (gmp.governed_files_hash !== gma.governed_files_hash) {
    return {
      valid: false,
      reason: `GMP governed_files_hash (${gmp.governed_files_hash}) does not match GMA governed_files_hash (${gma.governed_files_hash})`,
    };
  }

  // Binding: session/continuity/decision lineage must match GMA
  if (gmp.session_id !== gma.session_id) {
    return { valid: false, reason: `GMP session_id does not match GMA session_id` };
  }
  if (gmp.continuity_id !== gma.continuity_id) {
    return { valid: false, reason: `GMP continuity_id does not match GMA continuity_id` };
  }
  if (gmp.decision_id !== gma.decision_id) {
    return { valid: false, reason: `GMP decision_id does not match GMA decision_id` };
  }

  return { valid: true };
}

/**
 * Main containment check. Pure function — no side effects, deterministic.
 *
 * @param {object} opts
 * @param {string[]} opts.changedFiles - List of changed file paths
 * @param {object|null} opts.gma - Parsed GMA artifact (or null if absent)
 * @param {object|null} opts.gmp - Parsed GMP artifact (or null if absent)
 * @returns {{ result: 'CONTAINED'|'NULL', reason?: string, governed?: string[], mutationClasses?: string[] }}
 */
export function runContainmentCheck({ changedFiles, gma, gmp }) {
  const { governed, mutationClasses } = classifyChangedFiles(changedFiles);

  if (governed.length === 0) {
    return { result: 'CONTAINED', reason: 'no_governance_primitive_mutation' };
  }

  // GMA is a prerequisite (covers /session → /compile)
  if (!gma) {
    return {
      result: 'NULL',
      reason: 'governance_mutation_without_gma',
      governed,
      mutationClasses: [...mutationClasses],
    };
  }

  // GMP is required (covers /validate → /execute → /proof)
  if (!gmp) {
    return {
      result: 'NULL',
      reason: 'governance_mutation_without_proof',
      governed,
      mutationClasses: [...mutationClasses],
    };
  }

  const validation = validateGovernanceMutationProof(gmp, gma);
  if (!validation.valid) {
    return {
      result: 'NULL',
      reason: validation.reason,
      governed,
      mutationClasses: [...mutationClasses],
    };
  }

  return {
    result: 'CONTAINED',
    reason: 'full_lifecycle_proof_verified',
    governed,
    mutationClasses: [...mutationClasses],
    gmp_id: gmp.gmp_id,
    gma_id: gma.gma_id,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

function cliMain() {
  const changedFilesPath = process.env.CHANGED_FILES_PATH ?? 'changed_files.txt';
  const gmaPath = process.env.GMA_PATH ?? 'governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION.json';
  const gmpPath = process.env.GMP_PATH ?? 'governance/authorizations/GOVERNANCE_MUTATION_PROOF.json';

  let changedFiles = [];
  try {
    changedFiles = readFileSync(changedFilesPath, 'utf8').split('\n').filter(Boolean);
  } catch {
    console.error(`NULL — cannot read changed files from ${changedFilesPath}`);
    process.exit(1);
  }

  let gma = null;
  try {
    gma = JSON.parse(readFileSync(gmaPath, 'utf8'));
  } catch {
    // GMA absent — containment check will fail if governance primitives changed
  }

  let gmp = null;
  try {
    gmp = JSON.parse(readFileSync(gmpPath, 'utf8'));
  } catch {
    // GMP absent — containment check will fail if governance primitives changed
  }

  const check = runContainmentCheck({ changedFiles, gma, gmp });

  if (check.result === 'CONTAINED') {
    console.log(`GOVERNANCE_MUTATION_CONTAINMENT: CONTAINED`);
    console.log(`reason: ${check.reason}`);
    if (check.gmp_id) console.log(`gmp_id: ${check.gmp_id}`);
    if (check.gma_id) console.log(`gma_id: ${check.gma_id}`);
    process.exit(0);
  } else {
    console.error(`GOVERNANCE_MUTATION_CONTAINMENT: NULL`);
    console.error(`reason: ${check.reason}`);
    if (check.governed?.length) console.error(`governed_files: ${check.governed.join(', ')}`);
    if (check.mutationClasses?.length) console.error(`mutation_classes: ${check.mutationClasses.join(', ')}`);
    console.error(`Result: GOVERNANCE_MUTATION_CONTAINMENT_NULL (GAP-005)`);
    process.exit(1);
  }
}

// Run as CLI when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cliMain();
}
