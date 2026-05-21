import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ownershipPath = path.join(repoRoot, 'governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json');

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = stable(value[k]);
      return acc;
    }, {});
  }
  return value;
};

const exists = (p) => fs.existsSync(path.join(repoRoot, p));
const ownership = JSON.parse(fs.readFileSync(ownershipPath, 'utf8'));
const errors = [];

for (const [cls, owner] of Object.entries(ownership.authoritative_sources).sort()) {
  if (!exists(owner)) errors.push(`missing_authoritative_source:${cls}:${owner}`);
}

for (const [cls, derived] of Object.entries(ownership.derived_surfaces).sort()) {
  if (!ownership.authoritative_sources[cls]) {
    errors.push(`unknown_derived_class:${cls}`);
    continue;
  }
  for (const item of [...derived].sort()) {
    if (!exists(item)) errors.push(`missing_derived_artifact:${cls}:${item}`);
    if (item.startsWith('archive/')) errors.push(`archive_derivation_forbidden:${cls}:${item}`);
  }
}

for (const [artifact, owner] of Object.entries(ownership.generated_artifacts).sort()) {
  if (!exists(artifact)) errors.push(`missing_generated_artifact:${artifact}`);
  if (!exists(owner)) errors.push(`missing_generated_lineage_owner:${artifact}:${owner}`);
}

for (const [item, reason] of Object.entries(ownership.archive_only_objects || {}).sort()) {
  if (ownership.authoritative_sources[item]) errors.push(`archive_authority_escalation:${item}:${reason}`);
}

const report = {
  registry: 'governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json',
  status: errors.length ? 'FAIL_CLOSED' : 'OK',
  error_count: errors.length,
  errors: [...errors].sort(),
  canonical_classes: Object.keys(ownership.authoritative_sources).sort(),
  generated_at: 'deterministic-static-timestamp',
  ownership_snapshot: stable(ownership)
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${report.status} runtime reference reconciliation\n`);
  for (const e of report.errors) process.stdout.write(`- ${e}\n`);
}

if (errors.length) process.exit(1);
