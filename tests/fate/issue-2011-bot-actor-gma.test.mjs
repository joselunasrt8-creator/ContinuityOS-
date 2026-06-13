import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const gate = readFileSync(join(root, '.github', 'workflows', 'merge-governance-check.yml'), 'utf8');

// Isolate the "Classify merge actor" step so assertions are scoped to the actor gate.
function actorStep() {
  const start = gate.indexOf('- name: Classify merge actor');
  assert.ok(start !== -1, 'Classify merge actor step must exist');
  const next = gate.indexOf('- name: Detect changed files and governed paths', start);
  assert.ok(next !== -1, 'a following step must exist to bound the actor step');
  return gate.slice(start, next);
}

test('Issue #2011: gate has actions:read so it can verify the owner-dispatched GMA run', () => {
  const perms = gate.slice(gate.indexOf('permissions:'), gate.indexOf('jobs:'));
  assert.match(perms, /actions:\s*read/, 'job must request actions:read to query the GMA issuance run');
});

test('Issue #2011: bot actor is admitted as GMA issuance only via the carve-out classification', () => {
  const step = actorStep();
  assert.match(step, /BOT_GMA_ISSUANCE/, 'a dedicated bot-GMA-issuance classification must exist');
  // The carve-out is conditioned on BOTH artifact-only AND an owner-dispatched run.
  assert.match(step, /\$ARTIFACT_ONLY"\s*=\s*"true"\s*\]\s*&&\s*\[\s*"\$OWNER_DISPATCH"\s*=\s*"true"/,
    'admission must require BOTH artifact-only diff AND an owner-dispatched GMA run');
});

test('Issue #2011: carve-out requires the head commit to change only GMA artifact files', () => {
  const step = actorStep();
  assert.match(step, /git diff --name-only "\$\{HEAD_SHA\}\^" "\$\{HEAD_SHA\}"/,
    'must diff the head commit against its parent to inspect the changed files');
  assert.match(step, /GOVERNANCE_MUTATION_AUTHORIZATION\.json/, 'GMA singleton is an allowed artifact path');
  assert.match(step, /gma_registry\.jsonl/, 'GMA registry is an allowed artifact path');
  assert.match(step, /ARTIFACT_ONLY="false"/, 'any non-artifact file must drop the carve-out');
});

test('Issue #2011: carve-out requires an owner-dispatched (non-bot) governance-mutation-authorization run', () => {
  const step = actorStep();
  assert.match(step, /actions\/workflows\/governance-mutation-authorization\.yml\/runs/,
    'must query runs of the GMA issuer workflow');
  assert.match(step, /event=workflow_dispatch/, 'must require a workflow_dispatch (owner) event');
  assert.match(step, /endswith\("\[bot\]"\)\)\s*\|\s*not/, 'must exclude bot triggering_actors (owner dispatch only)');
  assert.match(step, /branch=\$\{HEAD_REF\}/, 'the dispatch run must be on this PR head branch');
});

test('Issue #2011: arbitrary bot commits still fail closed (NULL)', () => {
  const step = actorStep();
  // The NULL/exit path must remain for the else branch (carve-out not satisfied).
  assert.match(step, /unrecognized bot not in permitted_bot_actors allowlist/, 'the bot NULL message must remain');
  assert.match(step, /Result: MERGE_LEGITIMACY_NULL/, 'bot rejection must still emit MERGE_LEGITIMACY_NULL');
  assert.match(step, /exit 1/, 'bot rejection must still hard-fail');
});

test('Issue #2011: an allowlisted bot is still classified BOT_MERGE_ACTOR (no regression)', () => {
  const step = actorStep();
  assert.match(step, /permitted_bot_actors/, 'permitted_bot_actors allowlist must still be consulted');
  assert.match(step, /BOT_MERGE_ACTOR/, 'allowlisted bots keep their existing classification');
});
