import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

const schemaFiles = [
  'AUTHORITY.schema.json',
  'ATAO.schema.json',
  'AEO.schema.json',
  'PREO.schema.json',
  'SCO.schema.json',
  'PROOF_OBJECT.schema.json',
  'CONTINUITY_OBJECT.schema.json',
  'FEDERATION_ENVELOPE.schema.json'
];

const topologyFiles = [
  'runtime/topology/runtime_graph.json',
  'runtime/topology/TOPOLOGY_FATE_EXPANSION_SPEC.json',
  'runtime/topology/UNDECLARED_MUTATION_CAPABILITY_POLICY.json',
  'runtime/topology/CANONICAL_GOVERNANCE_COMPILER_SPEC.json'
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

test('legitimacy schemas expose deterministic validator metadata', () => {
  for (const file of schemaFiles) {
    const schema = readJson(`runtime/legitimacy/schemas/${file}`);
    assert.equal(schema.type, 'object', `${file} must define an object schema`);
    assert.equal(schema.additionalProperties, false, `${file} must forbid undeclared fields`);
    assert.ok(Array.isArray(schema.required), `${file} must define required fields`);
    assert.ok(schema['x-mindshift'], `${file} must define MindShift metadata`);
    assert.equal(schema['x-mindshift'].failure_mode, 'NULL', `${file} must fail closed`);
    assert.equal(schema['x-mindshift'].canonicalization, 'required', `${file} must require canonicalization`);
    assert.ok(Array.isArray(schema['x-mindshift'].hash_relevant_fields), `${file} must define hash-relevant fields`);
  }
});

test('schema hash-relevant fields are required or intentionally exact-object bounded', () => {
  for (const file of schemaFiles) {
    const schema = readJson(`runtime/legitimacy/schemas/${file}`);
    const required = new Set(schema.required);
    const hashFields = schema['x-mindshift'].hash_relevant_fields;

    for (const field of hashFields) {
      assert.ok(required.has(field), `${file} hash-relevant field ${field} must be required`);
    }
  }
});

test('AEO schema preserves exact five-field canonical object discipline', () => {
  const aeo = readJson('runtime/legitimacy/schemas/AEO.schema.json');
  assert.deepEqual(aeo.required, ['intent', 'scope', 'validation', 'target', 'finality']);
  assert.equal(aeo.additionalProperties, false);
  assert.equal(aeo['x-mindshift'].exact_object_rule, 'validated_object == executed_object');
});

test('federation schema denies remote authority inheritance', () => {
  const federation = readJson('runtime/legitimacy/schemas/FEDERATION_ENVELOPE.schema.json');
  assert.match(federation['x-mindshift'].federation_rule, /remote evidence does not imply local authority/);
});

test('topology-aware FATE specs bind schema validation to topology drift semantics', () => {
  for (const file of topologyFiles) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing topology binding file ${file}`);
  }

  const topologyFate = readJson('runtime/topology/TOPOLOGY_FATE_EXPANSION_SPEC.json');
  const undeclaredPolicy = readJson('runtime/topology/UNDECLARED_MUTATION_CAPABILITY_POLICY.json');
  const compilerSpec = readJson('runtime/topology/CANONICAL_GOVERNANCE_COMPILER_SPEC.json');

  assert.equal(topologyFate.required_failure_mode, 'NULL');
  assert.equal(undeclaredPolicy.failure_mode, 'NULL');
  assert.equal(compilerSpec.failure_mode, 'NULL');

  assert.ok(
    topologyFate.fate_cases.some((item) => item.expected_result === 'UNDECLARED_MUTATION_CAPABILITY'),
    'topology-aware FATE must cover undeclared mutation capability'
  );

  assert.ok(
    undeclaredPolicy.violation_classes.includes('UNDECLARED_MUTATION_SURFACE'),
    'undeclared mutation policy must cover undeclared mutation surfaces'
  );

  assert.ok(
    compilerSpec.validation_outputs.includes('UNDECLARED_MUTATION_CAPABILITY'),
    'governance compiler must expose undeclared mutation capability output'
  );
});

test('schema validator spec and FATE binding spec preserve non-execution boundary', () => {
  const validatorSpec = fs.readFileSync(path.join(root, 'runtime/legitimacy/validators/SCHEMA_VALIDATOR_SPEC.md'), 'utf8');
  const fateSpec = fs.readFileSync(path.join(root, 'tests/fate/LEGITIMACY_SCHEMA_FATE_SPEC.md'), 'utf8');

  assert.match(validatorSpec, /does not:\n\n- grant authority/);
  assert.match(validatorSpec, /execute actions/);
  assert.match(fateSpec, /schema-valid object\n≠\nexecution legitimacy/);
  assert.match(fateSpec, /FATE validation must not:/);
});
