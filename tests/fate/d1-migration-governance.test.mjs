import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');

// TEST: d1_migration_surface_declared
// GIVEN migrations/*.sql or schema.sql changes exist
// WHEN governance surface classification runs
// THEN migration mutation is mapped to a declared infrastructure mutation surface
// AND not treated as ordinary runtime execution
test('d1_migration_surface_declared: migrations/ is classified as governed infrastructure mutation surface', () => {
  const surfaces = JSON.parse(readFileSync(path.join(repoRoot, 'EXECUTION_SURFACES.json'), 'utf8'));

  const migrationSurface = surfaces.surfaces.find(s => s.surface_id === 'd1_schema_and_migrations');
  assert.ok(migrationSurface, 'd1_schema_and_migrations must be declared in EXECUTION_SURFACES.json');

  assert.equal(
    migrationSurface.classification, 'governed_infrastructure_mutation_surface',
    'migration surface classification must be governed_infrastructure_mutation_surface'
  );
  assert.equal(
    migrationSurface.governance_classification, 'governed_infrastructure_mutation',
    'migration surface must carry governance_classification = governed_infrastructure_mutation'
  );
  assert.equal(
    migrationSurface.surface_declaration, 'DECLARED',
    'migration surface must carry surface_declaration = DECLARED'
  );
  assert.equal(
    migrationSurface.production_apply_path, 'governed_workflow_only',
    'production apply path must be governed_workflow_only'
  );
  assert.equal(
    migrationSurface.raw_production_apply, 'DENIED',
    'raw production apply must be DENIED'
  );

  // Not treated as ordinary runtime execution
  assert.notEqual(
    migrationSurface.mutation_type, 'runtime_execution',
    'migration surface must not be classified as runtime_execution'
  );
  assert.notEqual(
    migrationSurface.classification, 'runtime_boundary_surface',
    'migration surface must not be a runtime_boundary_surface'
  );

  // Legitimacy column governance is declared
  assert.ok(
    Array.isArray(migrationSurface.legitimacy_columns_required) &&
    migrationSurface.legitimacy_columns_required.length > 0,
    'migration surface must declare legitimacy_columns_required'
  );
});

// TEST: migration_preserves_legitimacy_constraints (positive: schema has required columns/constraints)
// GIVEN a migration changes registry schema
// WHEN static migration validation runs
// THEN required columns and uniqueness constraints for authority, validation, execution, proof,
//      continuity, and replay remain present
test('migration_preserves_legitimacy_constraints: schema.sql declares required legitimacy columns and uniqueness constraints', () => {
  const schema = readFileSync(path.join(repoRoot, 'schema.sql'), 'utf8');

  const requiredColumns = [
    // authority
    'authority_registry',
    'decision_id',
    'continuity_id',
    // validation
    'validation_registry',
    'validated_object_hash',
    'invocation_nonce',
    // execution (replay)
    'execution_registry',
    'workflow_run_id',
    // proof
    'proof_registry',
    'decision_hash',
    // continuity
    'continuity_registry',
    'continuity_hash',
    // replay guard
    'invocation_registry',
  ];

  for (const token of requiredColumns) {
    assert.match(
      schema,
      new RegExp(token, 'i'),
      `schema.sql must contain legitimacy token: ${token}`
    );
  }

  // Required named uniqueness indexes
  const requiredUniqueIndexes = [
    'idx_proof_registry_decision_hash_unique',
    'idx_execution_registry_workflow_run_unique',
    'idx_proof_registry_workflow_run_unique',
  ];

  for (const idx of requiredUniqueIndexes) {
    assert.match(
      schema,
      new RegExp(idx),
      `schema.sql must declare required uniqueness index ${idx}`
    );
  }

  // Required append-only triggers
  const appendOnlyTables = [
    'external_authority_registry',
    'bootstrap_sovereignty_registry',
    'legitimacy_quarantine_registry',
    'cross_registry_reconciliation_registry',
    'install_base_telemetry_registry',
    'migration_governance_registry',
  ];

  for (const table of appendOnlyTables) {
    assert.match(
      schema,
      new RegExp(`trg_${table}_no_update`),
      `schema.sql must declare no-update trigger for append-only table ${table}`
    );
    assert.match(
      schema,
      new RegExp(`trg_${table}_no_delete`),
      `schema.sql must declare no-delete trigger for append-only table ${table}`
    );
  }
});

// TEST: migration_no_drop_legitimacy_constraints (negative: no migration removes required constraints)
test('migration_no_drop_legitimacy_constraints: no migration drops required legitimacy tables, columns, indexes, or append-only triggers', () => {
  const migrationsDir = path.join(repoRoot, 'migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  const legitimacyTables = [
    'authority_registry', 'validation_registry', 'execution_registry',
    'proof_registry', 'continuity_registry', 'invocation_registry',
  ];
  const requiredLegitimacyColumns = [
    'decision_id', 'continuity_id', 'validated_object_hash', 'invocation_nonce',
    'workflow_run_id', 'decision_hash', 'continuity_hash',
  ];
  const requiredUniqueIndexes = [
    'idx_proof_registry_decision_hash_unique',
    'idx_execution_registry_workflow_run_unique',
    'idx_proof_registry_workflow_run_unique',
  ];
  const appendOnlyTriggers = [
    'trg_external_authority_registry_no_update',
    'trg_external_authority_registry_no_delete',
    'trg_bootstrap_sovereignty_registry_no_update',
    'trg_bootstrap_sovereignty_registry_no_delete',
    'trg_legitimacy_quarantine_registry_no_update',
    'trg_legitimacy_quarantine_registry_no_delete',
    'trg_cross_registry_reconciliation_registry_no_update',
    'trg_cross_registry_reconciliation_registry_no_delete',
    'trg_install_base_telemetry_registry_no_update',
    'trg_install_base_telemetry_registry_no_delete',
  ];

  const violations = [];

  for (const file of files) {
    const raw = readFileSync(path.join(migrationsDir, file), 'utf8');
    const content = raw.toLowerCase();

    // Detect unconditional DROP TABLE on legitimacy tables
    for (const table of legitimacyTables) {
      if (
        content.includes(`drop table if exists ${table}`) ||
        new RegExp(`drop table\\s+${table}\\b`).test(content)
      ) {
        violations.push(`${file}: drops legitimacy table ${table}`);
      }
    }

    // Detect ALTER TABLE ... DROP COLUMN on required legitimacy columns
    for (const table of legitimacyTables) {
      for (const column of requiredLegitimacyColumns) {
        if (
          content.includes(`alter table ${table}`) &&
          content.includes('drop column') &&
          content.includes(column)
        ) {
          violations.push(`${file}: drops legitimacy column ${column} from ${table}`);
        }
      }
    }

    // Detect DROP INDEX on required unique indexes without recreation in same file
    for (const idx of requiredUniqueIndexes) {
      const dropped =
        content.includes(`drop index if exists ${idx}`) ||
        content.includes(`drop index ${idx}`);
      const recreated =
        content.includes(`create unique index if not exists ${idx}`) ||
        content.includes(`create unique index ${idx}`);
      if (dropped && !recreated) {
        violations.push(`${file}: drops required unique index ${idx} without recreation`);
      }
    }

    // Detect DROP TRIGGER on append-only triggers without recreation in same file
    for (const trigger of appendOnlyTriggers) {
      const dropped =
        content.includes(`drop trigger if exists ${trigger}`) ||
        content.includes(`drop trigger ${trigger}`);
      const recreated =
        content.includes(`create trigger if not exists ${trigger}`) ||
        content.includes(`create trigger ${trigger}`);
      if (dropped && !recreated) {
        violations.push(`${file}: drops append-only trigger ${trigger} without recreation`);
      }
    }
  }

  assert.deepEqual(
    violations, [],
    `Migration legitimacy constraint violations:\n${violations.join('\n')}`
  );
});

// TEST: raw_d1_apply_not_in_workflows
// GIVEN GitHub workflows and package scripts are scanned
// WHEN `wrangler d1 migrations apply --remote` or equivalent direct production apply appears
//      outside governed workflow
// THEN FATE/static check fails
test('raw_d1_apply_not_in_workflows: no workflow or package script applies D1 migrations to production directly', () => {
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  const workflowFiles = readdirSync(workflowsDir).filter(f => f.endsWith('.yml'));
  const violations = [];

  for (const file of workflowFiles) {
    const content = readFileSync(path.join(workflowsDir, file), 'utf8');
    if (/d1\s+migrations\s+apply/i.test(content)) {
      violations.push(`workflow ${file}: contains d1 migrations apply (production migration bypass risk)`);
    }
  }

  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  for (const [name, cmd] of Object.entries(packageJson.scripts)) {
    // Any d1 migrations apply without --local flag is a production apply risk
    if (/d1.*migrations.*apply/i.test(cmd) && !cmd.includes('--local')) {
      violations.push(`package.json script "${name}": applies d1 migrations without --local guard`);
    }
    // Explicit --remote is always a violation regardless of other flags
    if (/d1.*migrations.*apply.*--remote/i.test(cmd) || /--remote.*d1.*migrations.*apply/i.test(cmd)) {
      violations.push(`package.json script "${name}": explicitly applies d1 migrations --remote`);
    }
  }

  assert.deepEqual(
    violations, [],
    `Raw production D1 migration apply paths found:\n${violations.join('\n')}`
  );
});

// raw_d1_migration_apply bypass path is declared
test('raw_d1_migration_apply_bypass_declared: bypass path is registered in BYPASS_PATHS.json', () => {
  const bypass = JSON.parse(readFileSync(path.join(repoRoot, 'BYPASS_PATHS.json'), 'utf8'));
  const found = bypass.bypass_paths.find(
    b => b.bypass_id === 'raw_d1_migration_apply' ||
         b.bypass_id === 'raw_d1_migration_apply_production'
  );
  assert.ok(found, 'raw D1 migration apply bypass path must be declared in BYPASS_PATHS.json');
  assert.match(
    found.required_response, /UNBOUND_DATABASE_WRITE.*NULL/,
    'bypass must fail closed with UNBOUND_DATABASE_WRITE -> NULL'
  );
});

// undeclared_migration_schema_mutation bypass path is declared
test('undeclared_migration_schema_mutation_bypass_declared: legitimacy-dropping migration bypass is declared', () => {
  const bypass = JSON.parse(readFileSync(path.join(repoRoot, 'BYPASS_PATHS.json'), 'utf8'));
  const found = bypass.bypass_paths.find(b => b.bypass_id === 'undeclared_migration_schema_mutation');
  assert.ok(found, 'undeclared_migration_schema_mutation bypass path must be declared in BYPASS_PATHS.json');
  assert.match(
    found.required_response, /UNDECLARED_MUTATION_SURFACE.*NULL/,
    'bypass must fail closed with UNDECLARED_MUTATION_SURFACE -> NULL'
  );
});

// migration_governance_registry is declared as append-only evidence table in migration 0047
test('migration_governance_registry_declared: 0047 migration creates append-only evidence surface declaration', () => {
  const content = readFileSync(
    path.join(repoRoot, 'migrations', '0047_migration_governance_registry.sql'),
    'utf8'
  ).toLowerCase();

  assert.ok(
    content.includes('create table if not exists migration_governance_registry'),
    'migration 0047 must create migration_governance_registry table'
  );
  assert.ok(content.includes('creates_authority'), 'table must declare creates_authority constraint');
  assert.ok(content.includes('evidence_only'), 'table must declare evidence_only constraint');
  assert.ok(content.includes('executable'), 'table must declare executable constraint');
  assert.ok(content.includes('raw_production_apply_path'), 'table must declare raw_production_apply_path constraint');
  assert.ok(
    content.includes('trg_migration_governance_registry_no_update'),
    'table must have no-update append-only trigger'
  );
  assert.ok(
    content.includes('trg_migration_governance_registry_no_delete'),
    'table must have no-delete append-only trigger'
  );
});
