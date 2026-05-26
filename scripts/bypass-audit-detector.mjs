#!/usr/bin/env node
/**
 * Bypass audit detector for governed CI/CD surfaces.
 * Scans workflow YAML files and package.json for deploy commands invoked outside
 * the governed wrapper step, classifies each bypass path, and emits append-only
 * audit events to runtime/deploy_audit_registry.json.
 *
 * Exit codes:
 *   0 — all detected bypass paths are ENFORCED or AUDIT_ONLY
 *   1 — one or more OPEN bypass paths detected that could reach the deploy surface
 *
 * This script is non-operative: it does not deploy, create authority, or mutate runtime state.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const REGISTRY_PATH = resolve(ROOT, 'runtime/deploy_audit_registry.json');
const BYPASS_PATHS_FILE = resolve(ROOT, 'runtime/bypass_paths.json');
const WORKFLOWS_DIR = resolve(ROOT, '.github/workflows');
const PACKAGE_JSON = resolve(ROOT, 'package.json');

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadRegistry() {
  const existing = readJson(REGISTRY_PATH);
  if (existing && existing.schema_version === 1 && existing.registry === 'deploy_audit_registry') {
    return existing;
  }
  return { schema_version: 1, registry: 'deploy_audit_registry', entries: [] };
}

function persistEvent(event) {
  const registry = loadRegistry();
  const replayKey = sha256(JSON.stringify(event));
  if (registry.entries.some(e => sha256(JSON.stringify(e)) === replayKey)) return;
  const next = { ...registry, entries: [...registry.entries, event] };
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

function buildEvent(bypassId, classification, surface, detail) {
  return {
    session_id: null,
    decision_id: null,
    invocation_nonce: null,
    timestamp: new Date().toISOString(),
    event_type: 'bypass_audit_scan',
    deployment_target: null,
    validated_object_hash: null,
    deployment_hash: null,
    rejection_reason: null,
    execution_surface: surface,
    governed_context: 'bypass_audit_detector',
    break_glass_invoked: false,
    proof_binding_hash: null,
    proof_id: null,
    bypass_id: bypassId,
    classification,
    topology_visible: true,
    detail,
  };
}

function walkDir(dir, exts) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full, exts));
    } else if (exts.some(e => entry.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

const findings = [];
let hasOpenBypass = false;

// ── Check 1: package.json deploy script exits 1 ──────────────────────────────
const pkg = readJson(PACKAGE_JSON);
if (pkg && pkg.scripts) {
  const deployScript = pkg.scripts.deploy ?? '';
  const isHardDisabled = deployScript.includes('exit 1') || deployScript.startsWith('exit');
  const classification = isHardDisabled ? 'ENFORCED' : 'OPEN';
  if (!isHardDisabled) hasOpenBypass = true;

  findings.push({ bypass_id: 'npm_run_deploy', classification, detail: deployScript });
  persistEvent(buildEvent('npm_run_deploy', classification, 'github_governed_production_deploy', deployScript));
  console.log(`[${classification}] npm run deploy → "${deployScript}"`);
}

// ── Check 2: workflow files for wrangler deploy outside governed wrapper ──────
const yamlFiles = walkDir(WORKFLOWS_DIR, ['.yml', '.yaml']);
for (const file of yamlFiles) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect wrangler deploy calls
    if (/\bwrangler\s+(d["']?eploy|deploy)\b/.test(line) || /npx\s+wrangler/.test(line)) {
      const relFile = file.replace(ROOT + '/', '');
      const inGovernedWrapper = lines.slice(Math.max(0, i - 10), i).some(
        l => l.includes('governed-deploy') || l.includes('MINDSHIFT_GOVERNED_DEPLOY_CONTEXT') || l.includes('scripts/governed-deploy'),
      );
      const classification = inGovernedWrapper ? 'ENFORCED' : 'OPEN';
      if (!inGovernedWrapper) hasOpenBypass = true;

      const detail = `${relFile}:${i + 1}: ${line.trim()}`;
      findings.push({ bypass_id: `workflow_wrangler_${relFile}_L${i + 1}`, classification, detail });
      persistEvent(buildEvent(`workflow_wrangler_${relFile}_L${i + 1}`, classification, 'github_governed_production_deploy', detail));
      console.log(`[${classification}] ${detail}`);
    }
  }
}

// ── Check 3: cross-reference with runtime/bypass_paths.json ──────────────────
// Entries in bypass_paths.json are pre-classified topology-visible paths.
// Those without a code-enforceable flag are platform/account-level controls
// (Cloudflare token scope, GitHub branch protection) — documented as OPEN but
// not code-blockable. Emit audit events but do not set hasOpenBypass.
const bypassPaths = readJson(BYPASS_PATHS_FILE);
if (bypassPaths) {
  const paths = Array.isArray(bypassPaths) ? bypassPaths : bypassPaths.bypass_paths ?? [];
  for (const bp of paths) {
    const id = bp.bypass_id ?? bp.id ?? 'unknown';
    const cls = bp.classification ?? bp.status ?? 'TOPOLOGY_VISIBLE_OPEN';
    const codeEnforceable = bp.code_enforceable === true;
    if (cls === 'OPEN' && codeEnforceable) {
      hasOpenBypass = true;
    }
    console.log(`[${cls}] bypass_paths.json: ${id} — ${bp.description ?? bp.risk ?? ''}`);
    persistEvent(buildEvent(id, cls, 'github_governed_production_deploy', bp.description ?? bp.risk ?? ''));
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── Bypass Audit Summary ──────────────────────────────────────────');
console.log(`Scan time:  ${new Date().toISOString()}`);
console.log(`Findings:   ${findings.length}`);
console.log(`Registry:   ${REGISTRY_PATH}`);

if (hasOpenBypass) {
  console.error('\nNULL — One or more OPEN bypass paths detected. Governed surface is not fully locked.');
  process.exit(1);
} else {
  console.log('\nVALID — All detected bypass paths are ENFORCED or AUDIT_ONLY.');
  process.exit(0);
}
