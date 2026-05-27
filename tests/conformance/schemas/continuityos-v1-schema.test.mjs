import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

async function loadSchema(path) {
  return JSON.parse(await readFile(new URL(`../../../${path}`, import.meta.url), 'utf8'));
}

function createValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

const validAtao = {
  atao_id: 'atao-1',
  agent_id: 'agent-1',
  session_id: 'session-1',
  intent: 'bounded pre-execution request',
  proposed_action: {
    system: 'ci',
    action: 'plan',
    parameters: { dry_run: true }
  },
  scope: { repo: 'mindshift-demo' },
  risk_class: 'P1',
  timestamp: '2026-05-27T00:00:00.000Z'
};

const validAeo = {
  intent: 'execute continuity-safe action',
  scope: { repo: 'mindshift-demo' },
  validation: {
    decision_id: 'decision-1',
    authority_id: 'authority-1',
    require_active_authority: true,
    require_exact_object_hash: true,
    require_session_continuity: true
  },
  target: {
    system: 'worker',
    action: 'deploy'
  },
  finality: {
    proof_required: true,
    proof_type: 'dsse',
    registry_required: true
  }
};

test('continuityos v1 ATAO accepts valid object', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/atao.schema.json');
  const validate = createValidator(schema);
  assert.equal(validate(validAtao), true);
});

test('continuityos v1 ATAO rejects missing required field', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/atao.schema.json');
  const validate = createValidator(schema);
  const invalid = { ...validAtao };
  delete invalid.session_id;
  assert.equal(validate(invalid), false);
});

test('continuityos v1 ATAO rejects extra field', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/atao.schema.json');
  const validate = createValidator(schema);
  assert.equal(validate({ ...validAtao, extra: true }), false);
});

test('continuityos v1 ATAO rejects invalid risk_class enum value', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/atao.schema.json');
  const validate = createValidator(schema);
  assert.equal(validate({ ...validAtao, risk_class: 'P9' }), false);
});

test('continuityos v1 ATAO rejects invalid timestamp format with date-time validation', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/atao.schema.json');
  const validate = createValidator(schema);
  assert.equal(validate({ ...validAtao, timestamp: 'not-a-date-time' }), false);
});

test('continuityos v1 AEO accepts valid object', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const validate = createValidator(schema);
  assert.equal(validate(validAeo), true);
});

test('continuityos v1 AEO rejects missing required five-field member', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const validate = createValidator(schema);
  const invalid = { ...validAeo };
  delete invalid.finality;
  assert.equal(validate(invalid), false);
});

test('continuityos v1 AEO rejects extra top-level field', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const validate = createValidator(schema);
  assert.equal(validate({ ...validAeo, drift: true }), false);
});

test('continuityos v1 AEO rejects top-level schema_version', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const validate = createValidator(schema);
  assert.equal(validate({ ...validAeo, schema_version: 'CONTINUITYOS_V1' }), false);
});

test('continuityos v1 AEO rejects malformed nested validation object', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const validate = createValidator(schema);
  const invalid = {
    ...validAeo,
    validation: {
      ...validAeo.validation,
      require_exact_object_hash: 'yes'
    }
  };
  assert.equal(validate(invalid), false);
});

test('continuityos v1 AEO validation is order-independent', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const validate = createValidator(schema);
  const reordered = {
    finality: validAeo.finality,
    target: validAeo.target,
    validation: validAeo.validation,
    scope: validAeo.scope,
    intent: validAeo.intent
  };
  assert.equal(validate(reordered), true);
});

test('legacy and v1 AEO schemas both accept same valid fixture', async () => {
  const legacy = createValidator(await loadSchema('schemas/aeo.schema.json'));
  const v1 = createValidator(await loadSchema('schemas/json/continuityos/v1/aeo.schema.json'));
  assert.equal(legacy(validAeo), true);
  assert.equal(v1(validAeo), true);
});

test('legacy and v1 AEO schemas both reject same extra-field fixture', async () => {
  const legacy = createValidator(await loadSchema('schemas/aeo.schema.json'));
  const v1 = createValidator(await loadSchema('schemas/json/continuityos/v1/aeo.schema.json'));
  const invalid = { ...validAeo, extra_field: 'nope' };
  assert.equal(legacy(invalid), false);
  assert.equal(v1(invalid), false);
});
