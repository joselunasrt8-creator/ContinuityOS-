import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const protocol = readFileSync(new URL('../../docs/codex-execution-protocol.md', import.meta.url), 'utf8');
const contributing = readFileSync(new URL('../../CONTRIBUTING.md', import.meta.url), 'utf8');
const prTemplate = readFileSync(new URL('../../.github/pull_request_template.md', import.meta.url), 'utf8');

test('Codex execution protocol records the one-issue closure invariant', () => {
  assert.match(protocol, /one issue → one branch → one PR → one invariant → one FATE expansion/);
  assert.match(protocol, /If no valid object exists → nothing happens/);
  assert.match(protocol, /proposal → structure → validation → authority → execution boundary → proof/);
  assert.match(protocol, /\/authority → \/compile → \/validate → \/execute → \/proof/);
});

test('Codex execution protocol is explicitly non-runtime and fail-closed', () => {
  assert.match(protocol, /non-runtime governance artifact/);
  assert.match(protocol, /does not modify canonical runtime routes/);
  assert.match(protocol, /Invalid, missing, replayed, malformed, unauthorized, or mismatched objects must resolve to NULL or blocked execution/);
  assert.match(protocol, /validated_object == executed_object/);
});

test('Contributing guide points Codex work to the execution protocol', () => {
  assert.match(contributing, /docs\/codex-execution-protocol\.md/);
  assert.match(contributing, /one issue → one branch → one PR → one invariant → one FATE expansion/);
  assert.match(contributing, /must not modify runtime logic, canonical routes, authority behavior, proof behavior, replay behavior, validator behavior, reconciliation behavior, or schema behavior/);
});

test('PR template requires Codex protocol closure evidence', () => {
  const requiredChecklistItems = [
    'One issue only.',
    'One issue-scoped branch only.',
    'One PR only.',
    'One invariant protected.',
    'One deterministic FATE/static expansion added or updated.',
    'No bundled refactors or unrelated cleanup.',
    'Does not modify runtime logic unless explicitly scoped by the issue.',
    'Does not modify canonical routes unless explicitly scoped by the issue.',
    'Does not create alternate execution paths, implicit authority, direct deploy paths, or proofless execution.',
    '`npm test`',
    '`npx tsc --noEmit`',
  ];

  for (const item of requiredChecklistItems) {
    assert.match(prTemplate, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
