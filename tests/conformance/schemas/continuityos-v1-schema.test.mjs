import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadSchema(path) {
  return JSON.parse(await readFile(new URL(`../../../${path}`, import.meta.url), 'utf8'));
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validate(schema, candidate) {
  if (schema.type === 'object') {
    if (!isObject(candidate)) return false;

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in candidate)) return false;
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(candidate)) {
        if (!(key in schema.properties)) return false;
      }
    }

    if (schema.properties) {
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (key in candidate && !validate(propertySchema, candidate[key])) return false;
      }
    }

    return true;
  }

  if (schema.type === 'string') {
    if (typeof candidate !== 'string') return false;
    if (typeof schema.minLength === 'number' && candidate.length < schema.minLength) return false;
    if (Array.isArray(schema.enum) && !schema.enum.includes(candidate)) return false;
    return true;
  }

  if (schema.type === 'boolean') {
    return typeof candidate === 'boolean';
  }

  return true;
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
  assert.equal(validate(schema, validAtao), true);
});

test('continuityos v1 ATAO rejects missing required field', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/atao.schema.json');
  const invalid = { ...validAtao };
  delete invalid.session_id;
  assert.equal(validate(schema, invalid), false);
});

test('continuityos v1 ATAO rejects extra field', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/atao.schema.json');
  assert.equal(validate(schema, { ...validAtao, extra: true }), false);
});

test('continuityos v1 AEO accepts valid object', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  assert.equal(validate(schema, validAeo), true);
});

test('continuityos v1 AEO rejects missing required five-field member', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const invalid = { ...validAeo };
  delete invalid.finality;
  assert.equal(validate(schema, invalid), false);
});

test('continuityos v1 AEO rejects extra top-level field', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  assert.equal(validate(schema, { ...validAeo, drift: true }), false);
});

test('continuityos v1 AEO rejects top-level schema_version', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  assert.equal(validate(schema, { ...validAeo, schema_version: 'CONTINUITYOS_V1' }), false);
});

test('continuityos v1 AEO validation is order-independent', async () => {
  const schema = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const reordered = {
    finality: validAeo.finality,
    target: validAeo.target,
    validation: validAeo.validation,
    scope: validAeo.scope,
    intent: validAeo.intent
  };
  assert.equal(validate(schema, reordered), true);
});

test('legacy and v1 AEO schemas both accept same valid fixture', async () => {
  const legacy = await loadSchema('schemas/aeo.schema.json');
  const v1 = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  assert.equal(validate(legacy, validAeo), true);
  assert.equal(validate(v1, validAeo), true);
});

test('legacy and v1 AEO schemas both reject same extra-field fixture', async () => {
  const legacy = await loadSchema('schemas/aeo.schema.json');
  const v1 = await loadSchema('schemas/json/continuityos/v1/aeo.schema.json');
  const invalid = { ...validAeo, extra_field: 'nope' };
  assert.equal(validate(legacy, invalid), false);
  assert.equal(validate(v1, invalid), false);
});
