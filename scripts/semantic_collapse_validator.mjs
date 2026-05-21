import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const registryPath = path.join(ROOT, 'governance/runtime/SEMANTIC_COLLAPSE_REGISTRY.json');
const scopes = ['governance/runtime', 'runtime/governance', 'docs', 'archive'];
const domainTokens = ['continuity', 'lineage', 'observability', 'orchestration', 'governance'];
const authorityTokens = ['authoritative primitive', 'authoritative domain', 'canonical semantic owner', 'semantic ownership'];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (/\.(json|md|txt|mjs|ts|js)$/i.test(entry.name)) out.push(full);
    }
  }
  return out.sort();
}

const registry = readJson(registryPath);
const report = {
  generated_at: 'deterministic',
  registry: 'governance/runtime/SEMANTIC_COLLAPSE_REGISTRY.json',
  files_scanned: [],
  authoritative_owners: {},
  duplicate_mentions: {},
  conflicts: [],
  observability_authority_escalation: []
};

for (const d of domainTokens) {
  report.authoritative_owners[d] = [];
  report.duplicate_mentions[d] = [];
}

for (const scope of scopes) {
  const files = collectFiles(path.join(ROOT, scope));
  for (const file of files) {
    const rel = path.relative(ROOT, file).replaceAll(path.sep, '/');
    const text = fs.readFileSync(file, 'utf8').toLowerCase();
    report.files_scanned.push(rel);
    for (const domain of domainTokens) {
      if (!text.includes(domain)) continue;
      report.duplicate_mentions[domain].push(rel);
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (!line.includes(domain)) return;
        if (authorityTokens.some((t) => line.includes(t))) {
          report.authoritative_owners[domain].push(`${rel}:${i + 1}`);
          if (domain === 'observability') {
            report.observability_authority_escalation.push(`${rel}:${i + 1}`);
          }
        }
      });
    }
  }
}

for (const domain of domainTokens) {
  const uniqOwners = [...new Set(report.authoritative_owners[domain])].sort();
  report.authoritative_owners[domain] = uniqOwners;
  const uniqOwnerFiles = [...new Set(uniqOwners.map((o) => o.split(':')[0]))].sort();
  report.duplicate_mentions[domain] = [...new Set(report.duplicate_mentions[domain])].sort();
  if (uniqOwnerFiles.length > 1) {
    report.conflicts.push({
      type: 'duplicate_authoritative_domain',
      domain,
      owners: uniqOwnerFiles,
      canonical_primitive: registry.authoritative_primitives[domain] ?? null
    });
  }
}

if (report.observability_authority_escalation.length > 0) {
  report.conflicts.push({
    type: 'observability_authority_escalation',
    occurrences: [...new Set(report.observability_authority_escalation)].sort()
  });
}

const reportPath = path.join(ROOT, 'governance/runtime/SEMANTIC_COLLAPSE_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

if (report.conflicts.length > 0) {
  console.error('Semantic collapse validation failed closed.');
  process.exit(1);
}

console.log('Semantic collapse validation passed.');
