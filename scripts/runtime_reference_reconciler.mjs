import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const registryPath = path.join(repoRoot, 'governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json');

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
};

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(repoRoot, p), 'utf8'));
const writeJson = (p, data) => fs.writeFileSync(path.join(repoRoot, p), `${JSON.stringify(stable(data), null, 2)}\n`);
const exists = (p) => fs.existsSync(path.join(repoRoot, p));

const registry = readJson('governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json');
const errors = [];

for (const [domain, src] of Object.entries(registry.authoritative_sources)) {
  if (!exists(src)) errors.push(`missing_authoritative_source:${domain}:${src}`);
}

const authoritySet = new Set(Object.values(registry.authoritative_sources));
if (authoritySet.size !== Object.keys(registry.authoritative_sources).length) {
  errors.push('duplicate_authoritative_definition');
}

for (const [domain, derivedFiles] of Object.entries(registry.derived_surfaces)) {
  const source = registry.authoritative_sources[domain];
  if (!source) {
    errors.push(`derived_domain_without_authority:${domain}`);
    continue;
  }
  for (const file of derivedFiles) {
    if (authoritySet.has(file)) errors.push(`derived_became_authoritative:${domain}:${file}`);
  }
}

for (const archived of Object.keys(registry.archive_only_objects || {})) {
  if (authoritySet.has(archived)) errors.push(`archive_promoted_to_authority:${archived}`);
}

if (!errors.length) {
  for (const [artifact, source] of Object.entries(registry.generated_artifacts)) {
    if (!exists(source)) {
      errors.push(`missing_generated_source:${artifact}:${source}`);
      continue;
    }
    writeJson(artifact, readJson(source));
  }
}

const report = {
  registry: path.relative(repoRoot, registryPath),
  status: errors.length ? 'FAIL_CLOSED' : 'OK',
  errors: [...errors].sort(),
  authoritative_domain_count: Object.keys(registry.authoritative_sources).length,
  regenerated_artifact_count: errors.length ? 0 : Object.keys(registry.generated_artifacts).length,
  deterministic: true
};

const reportPath = path.join(repoRoot, 'governance/runtime/runtime_reference_reconciliation_report.json');
writeJson(path.relative(repoRoot, reportPath), report);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${report.status} runtime reference reconciliation\n`);
  for (const e of report.errors) process.stdout.write(`- ${e}\n`);
}

if (errors.length) process.exit(1);
