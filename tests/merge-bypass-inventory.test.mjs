import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = resolve(__dirname, '../governance/merge-legitimacy/MERGE_BYPASS_INVENTORY.json');

const REQUIRED_PATHWAYS = [
  'normal_pr_merge',
  'admin_merge_override',
  'direct_push_to_main',
  'force_push_to_main',
  'workflow_generated_merge',
  'bot_merge',
  'auto_merge',
  'merge_queue',
  'branch_protection_bypass',
  'break_glass_manual_path',
];

const VALID_CLASSIFICATIONS = [
  'GOVERNED',
  'PARTIAL',
  'BREAK_GLASS',
  'UNKNOWN',
];

const REQUIRED_PATHWAY_FIELDS = [
  'pathway',
  'mechanism',
  'required_control',
  'current_evidence',
  'classification',
  'closure_state',
];

const VALID_CLOSURE_STATES = [
  'OPEN',
  'PENDING_EXTERNAL_VERIFICATION',
  'CLOSED',
];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

// --- load and parse ---
let inventory;
test('JSON parses without error', () => {
  const raw = readFileSync(INVENTORY_PATH, 'utf8');
  inventory = JSON.parse(raw);
});

if (!inventory) {
  console.error('\nCannot continue — inventory failed to parse.');
  process.exit(1);
}

// --- top-level structure ---
test('version field is "1.0"', () => {
  assert.equal(inventory.version, '1.0');
});

test('phase field is "phase-2"', () => {
  assert.equal(inventory.phase, 'phase-2');
});

test('anchor_issue field is "#1604"', () => {
  assert.equal(inventory.anchor_issue, '#1604');
});

test('slice_issue field is "#1681"', () => {
  assert.equal(inventory.slice_issue, '#1681');
});

test('pathways is an array', () => {
  assert.ok(Array.isArray(inventory.pathways), 'pathways must be an array');
});

test('classifications array contains all required values', () => {
  assert.ok(Array.isArray(inventory.classifications));
  for (const cls of VALID_CLASSIFICATIONS) {
    assert.ok(
      inventory.classifications.includes(cls),
      `classifications must include "${cls}"`,
    );
  }
});

// --- all required pathways present ---
test('all required pathways exist', () => {
  const found = new Set(inventory.pathways.map((p) => p.pathway));
  for (const name of REQUIRED_PATHWAYS) {
    assert.ok(found.has(name), `pathway "${name}" is missing`);
  }
});

// --- per-pathway field validation ---
for (const pathway of inventory.pathways) {
  const id = pathway.pathway ?? '(unnamed)';

  test(`pathway "${id}" has all required fields`, () => {
    for (const field of REQUIRED_PATHWAY_FIELDS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(pathway, field),
        `pathway "${id}" is missing field "${field}"`,
      );
    }
  });

  test(`pathway "${id}" classification is a valid value`, () => {
    assert.ok(
      VALID_CLASSIFICATIONS.includes(pathway.classification),
      `pathway "${id}" has invalid classification "${pathway.classification}"`,
    );
  });

  test(`pathway "${id}" required_control is a non-empty string`, () => {
    assert.ok(
      typeof pathway.required_control === 'string' && pathway.required_control.length > 0,
      `pathway "${id}" required_control must be a non-empty string`,
    );
  });

  test(`pathway "${id}" current_evidence is an array`, () => {
    assert.ok(
      Array.isArray(pathway.current_evidence),
      `pathway "${id}" current_evidence must be an array`,
    );
  });

  test(`pathway "${id}" closure_state is a valid value`, () => {
    assert.ok(
      VALID_CLOSURE_STATES.includes(pathway.closure_state),
      `pathway "${id}" has invalid closure_state "${pathway.closure_state}"`,
    );
  });

  // No pathway may claim GOVERNED without at least one current_evidence entry
  // that constitutes supporting proof lineage evidence (non-empty array).
  if (pathway.classification === 'GOVERNED') {
    test(`pathway "${id}" GOVERNED classification is backed by non-empty current_evidence`, () => {
      assert.ok(
        Array.isArray(pathway.current_evidence) && pathway.current_evidence.length > 0,
        `pathway "${id}" claims GOVERNED but current_evidence is empty — no supporting proof lineage`,
      );
    });
  }
}

// --- summary ---
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
