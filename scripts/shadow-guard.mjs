#!/usr/bin/env node

/**
 * Shadow Guard CLI — Phase A
 *
 * Orchestrates the Shadow Guard scanner to:
 * 1. Detect undeclared mutation surfaces
 * 2. Generate diagnostic artifact (JSON)
 * 3. Emit divergence registry entries (JSONL)
 * 4. Exit 0 (non-blocking, diagnostic-only mode)
 *
 * Output:
 * - evidence/shadow-guard/SHADOW_GUARD_DIAGNOSTIC.json
 * - evidence/shadow-guard/legitimacy_divergence_registry.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ShadowGuardScanner } from './shadow-guard-scanner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

/**
 * Ensure evidence/shadow-guard/ directory exists.
 */
function ensureEvidenceDirectory() {
  const dir = path.join(repoRoot, 'evidence', 'shadow-guard');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Write diagnostic artifact (JSON) to evidence directory.
 */
function writeDiagnosticArtifact(evidenceDir, scanResult) {
  const artifact = {
    artifact_type: 'shadow_guard_diagnostic',
    report_type: 'SHADOW_GUARD_DIAGNOSTIC',
    generated_at: new Date().toISOString(),
    phase: 'A',
    diagnostic_mode: true,
    enforcement: false,
    status: scanResult.status,
    scan_scope: {
      surfaces_scanned: ['package-scripts', 'workflows', 'test-surfaces'],
      total_surfaces_found: scanResult.summary.total_surfaces,
      mutation_capable: scanResult.findings.filter((f) => f.mutation_capable).length,
    },
    summary: scanResult.summary,
    findings: scanResult.findings,
  };

  const artifactPath = path.join(evidenceDir, 'SHADOW_GUARD_DIAGNOSTIC.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  return artifactPath;
}

/**
 * Write divergence registry entries (JSONL, append-only).
 * One entry per NULL finding.
 */
function writeDivergenceRegistry(evidenceDir, scanResult) {
  const nullFindings = scanResult.findings.filter((f) => f.status === 'NULL');

  if (nullFindings.length === 0) {
    console.log('  [divergence registry] No NULL findings → no new entries');
    return null;
  }

  const registryPath = path.join(evidenceDir, 'legitimacy_divergence_registry.jsonl');

  // Append entries (one per NULL finding)
  for (const finding of nullFindings) {
    const entry = {
      _record_type: 'shadow_guard_divergence',
      surface_id: finding.surface_id,
      human_review: finding.human_review,
      shadow_guard: finding.shadow_guard,
      root_cause: finding.root_cause.toUpperCase(),
      potential_consequence: finding.potential_consequence || 'undeclared_mutation_surface',
      divergence_class: finding.divergence_class,
      scan_timestamp: new Date().toISOString(),
      phase: 'A_DIAGNOSTIC',
    };

    fs.appendFileSync(registryPath, JSON.stringify(entry) + '\n');
  }

  return registryPath;
}

/**
 * Main CLI execution.
 */
async function main() {
  console.log('\n=== Shadow Guard Phase A ===\n');
  console.log('Scanning for undeclared mutation surfaces...\n');

  try {
    // Instantiate and run scanner
    const scanner = new ShadowGuardScanner(repoRoot);
    const scanResult = await scanner.scan();

    // Ensure evidence directory
    const evidenceDir = ensureEvidenceDirectory();
    console.log(`  [output] Evidence directory: ${evidenceDir}`);

    // Write diagnostic artifact
    const artifactPath = writeDiagnosticArtifact(evidenceDir, scanResult);
    console.log(`  [artifact] Written: ${artifactPath}`);

    // Write divergence registry
    const registryPath = writeDivergenceRegistry(evidenceDir, scanResult);
    if (registryPath) {
      console.log(`  [registry] Appended: ${registryPath}`);
    }

    // Summary
    console.log(`\n=== Scan Results ===`);
    console.log(`  Status: ${scanResult.status}`);
    console.log(`  Total surfaces: ${scanResult.summary.total_surfaces}`);
    console.log(`  Declared: ${scanResult.summary.declared_surfaces}`);
    console.log(`  Undeclared: ${scanResult.summary.undeclared_surfaces}`);
    console.log(`  Unclassified: ${scanResult.summary.unclassified_surfaces}`);

    const passFindings = scanResult.findings.filter((f) => f.status === 'PASS').length;
    const nullFindings = scanResult.findings.filter((f) => f.status === 'NULL').length;

    console.log(`  PASS findings: ${passFindings}`);
    console.log(`  NULL findings: ${nullFindings}`);

    if (nullFindings > 0) {
      console.log(`\n=== Divergence Evidence (PASS ∧ NULL) ===`);
      scanResult.findings
        .filter((f) => f.status === 'NULL')
        .forEach((finding) => {
          console.log(`  • ${finding.surface_id}`);
          console.log(`    Location: ${finding.location}`);
          console.log(`    Root Cause: ${finding.root_cause}`);
          console.log(`    Consequence: ${finding.potential_consequence}`);
        });
    }

    console.log(`\nPhase A: diagnostic-only, non-blocking. Exit code 0.\n`);

    // Always exit 0 in Phase A (diagnostic mode)
    process.exit(0);
  } catch (error) {
    console.error(`\n[error] Shadow Guard scan failed:`);
    console.error(`  ${error.message}`);
    console.error(`\nPhase A: diagnostic failure. Exit code 0 (phase A is always non-blocking).\n`);

    // Even on error, exit 0 in Phase A (diagnostic mode)
    process.exit(0);
  }
}

main();
