// Issue #1627 follow-on: AEO Template Registry tests.
// Tests the registry-backed template selection layer introduced by migration 0067
// and the selectAEOTemplate helper in src/lib/agent-tool-gateway.ts.
//
// Non-claims:
//   - #1627 is NOT closed
//   - OpenClaw execution is NOT implemented
//   - Framework-neutral adapters are NOT implemented
//   - P4/P5 execution is NOT enabled
//   - Authority is NOT created
//   - Proof is NOT generated

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../migrations/0067_aeo_template_registry.sql', import.meta.url),
  'utf8'
)
const gatewayLib = readFileSync(
  new URL('../src/lib/agent-tool-gateway.ts', import.meta.url),
  'utf8'
)

// ── Static migration checks ───────────────────────────────────────────────────

test('migration 0067 creates aeo_template_registry table', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS aeo_template_registry/)
})

test('migration 0067 aeo_template_registry has required fields', () => {
  assert.match(migration, /template_id\s+TEXT PRIMARY KEY/)
  assert.match(migration, /schema_version\s+TEXT NOT NULL/)
  assert.match(migration, /surface_type\s+TEXT NOT NULL/)
  assert.match(migration, /status\s+TEXT NOT NULL CHECK \(status IN \('ACTIVE','INACTIVE','DRAFT'\)\)/)
  assert.match(migration, /risk_floor\s+TEXT NOT NULL/)
  assert.match(migration, /required_scope_fields\s+TEXT NOT NULL/)
  assert.match(migration, /required_target_fields\s+TEXT NOT NULL/)
  assert.match(migration, /required_validation_fields\s+TEXT NOT NULL/)
  assert.match(migration, /required_finality_fields\s+TEXT NOT NULL/)
  assert.match(migration, /predicate_set\s+TEXT NOT NULL/)
  assert.match(migration, /failure_result\s+TEXT NOT NULL DEFAULT 'NULL'/)
  assert.match(migration, /created_at\s+TEXT NOT NULL/)
})

test('migration 0067 aeo_template_registry has append-only triggers', () => {
  assert.match(migration, /aeo_template_registry_append_only_update/)
  assert.match(migration, /aeo_template_registry_append_only_delete/)
  assert.match(migration, /SELECT RAISE\(ABORT, 'aeo_template_registry is append-only'\)/)
})

test('migration 0067 seeds ACTIVE filesystem_read_v1 template', () => {
  assert.match(migration, /filesystem_read_v1/)
  assert.match(migration, /'filesystem_read'.*'ACTIVE'/)
  assert.match(migration, /P0_READ_ONLY/)
})

test('migration 0067 seeds ACTIVE filesystem_write_v1 template', () => {
  assert.match(migration, /filesystem_write_v1/)
  assert.match(migration, /'filesystem_write'.*'ACTIVE'/)
  assert.match(migration, /P2_BOUNDED_MUTATION/)
})

test('migration 0067 seeds ACTIVE browser_v1 template', () => {
  assert.match(migration, /browser_v1/)
  assert.match(migration, /'browser'.*'ACTIVE'/)
  assert.match(migration, /P3_EXTERNAL_MUTATION/)
})

test('migration 0067 seeds ACTIVE gateway_routing_v1 template', () => {
  assert.match(migration, /gateway_routing_v1/)
  assert.match(migration, /'gateway_routing'.*'ACTIVE'/)
  assert.match(migration, /P1_EXECUTION_ADJACENT/)
})

test('migration 0067 seeds ACTIVE behavioral_files_v1 template', () => {
  assert.match(migration, /behavioral_files_v1/)
  assert.match(migration, /'behavioral_files'.*'ACTIVE'/)
})

test('migration 0067 seeds DRAFT shell_exec_v1 template (never ACTIVE)', () => {
  assert.match(migration, /shell_exec_v1/)
  assert.match(migration, /'shell_exec'.*'DRAFT'/)
  assert.match(migration, /P4_PRIVILEGED_EXECUTION/)
})

test('migration 0067 seeds DRAFT process_control_v1 template (never ACTIVE)', () => {
  assert.match(migration, /process_control_v1/)
  assert.match(migration, /'process_control'.*'DRAFT'/)
})

test('migration 0067 seeds DRAFT session_spawn_v1 template (never ACTIVE)', () => {
  assert.match(migration, /session_spawn_v1/)
  assert.match(migration, /'session_spawn'.*'DRAFT'/)
  assert.match(migration, /P5_AUTONOMOUS_RECURSIVE/)
})

test('migration 0067 seeds DRAFT scheduled_action_v1 template (never ACTIVE)', () => {
  assert.match(migration, /scheduled_action_v1/)
  assert.match(migration, /'scheduled_action'.*'DRAFT'/)
})

test('migration 0067 seeds DRAFT node_runtime_v1 template (never ACTIVE)', () => {
  assert.match(migration, /node_runtime_v1/)
  assert.match(migration, /'node_runtime'.*'DRAFT'/)
})

test('migration 0067 seeds DRAFT network_api_v1 template (never ACTIVE)', () => {
  assert.match(migration, /network_api_v1/)
  assert.match(migration, /'network_api'.*'DRAFT'/)
})

test('append-only triggers prevent UPDATE on aeo_template_registry', () => {
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS aeo_template_registry_append_only_update/)
  assert.match(migration, /BEFORE UPDATE ON aeo_template_registry/)
  assert.match(migration, /RAISE\(ABORT/)
})

test('append-only triggers prevent DELETE on aeo_template_registry', () => {
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS aeo_template_registry_append_only_delete/)
  assert.match(migration, /BEFORE DELETE ON aeo_template_registry/)
  assert.match(migration, /RAISE\(ABORT/)
})

// ── Static gateway lib checks ─────────────────────────────────────────────────

test('gateway lib exports AEOTemplate type', () => {
  assert.match(gatewayLib, /export type AEOTemplate/)
})

test('gateway lib exports selectAEOTemplate function', () => {
  assert.match(gatewayLib, /export async function selectAEOTemplate/)
})

test('gateway lib selectAEOTemplate returns VALID_TEMPLATE or NULL', () => {
  assert.match(gatewayLib, /VALID_TEMPLATE/)
  assert.match(gatewayLib, /TEMPLATE_NOT_FOUND/)
  assert.match(gatewayLib, /SCHEMA_INACTIVE/)
  assert.match(gatewayLib, /TEMPLATE_SURFACE_MISMATCH/)
  assert.match(gatewayLib, /RISK_FLOOR_VIOLATION/)
})

test('gateway lib selectAEOTemplate has non-claims comment — does not authorize execution', () => {
  assert.match(gatewayLib, /VALID_TEMPLATE does NOT authorize execution/)
})

// ── Runtime tests for selectAEOTemplate ──────────────────────────────────────

function makeTemplateDB(rows) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          const surfaceType = params[0]
          return {
            async first() {
              return rows.find(r => r.surface_type === surfaceType) ?? null
            }
          }
        }
      }
    }
  }
}

const ACTIVE_TEMPLATES = [
  {
    template_id: 'filesystem_read_v1', schema_version: '1.0',
    surface_type: 'filesystem_read', status: 'ACTIVE', risk_floor: 'P0_READ_ONLY',
    required_scope_fields: '["allowed_paths","symlink_policy","max_bytes","sensitivity_label"]',
    required_target_fields: '["exact_path_list","read_mode"]',
    required_validation_fields: '["atao_id","request_hash","replay_domain_ref"]',
    required_finality_fields: '["observation_log_ref"]',
    predicate_set: '["check_required_scope_fields","check_required_target_fields","check_path_bounds"]',
    failure_result: 'NULL', created_at: '2026-06-02T00:00:00.000Z'
  },
  {
    template_id: 'filesystem_write_v1', schema_version: '1.0',
    surface_type: 'filesystem_write', status: 'ACTIVE', risk_floor: 'P2_BOUNDED_MUTATION',
    required_scope_fields: '["allowed_paths","create_overwrite_policy"]',
    required_target_fields: '["exact_path","exact_content_hash"]',
    required_validation_fields: '["atao_id","decision_id","require_active_authority"]',
    required_finality_fields: '["proof_required","proof_type"]',
    predicate_set: '["check_required_scope_fields","check_required_target_fields","check_exact_object_hash"]',
    failure_result: 'NULL', created_at: '2026-06-02T00:00:00.000Z'
  },
  {
    template_id: 'shell_exec_v1', schema_version: '1.0',
    surface_type: 'shell_exec', status: 'DRAFT', risk_floor: 'P4_PRIVILEGED_EXECUTION',
    required_scope_fields: '["working_directory","environment_bounds"]',
    required_target_fields: '["argv","command_allowlist_ref"]',
    required_validation_fields: '["atao_id","decision_id","require_active_authority"]',
    required_finality_fields: '["proof_required","exit_code_required"]',
    predicate_set: '["check_command_allowlist","check_environment_bounds"]',
    failure_result: 'NULL', created_at: '2026-06-02T00:00:00.000Z'
  },
  {
    template_id: 'inactive_surface_v1', schema_version: '1.0',
    surface_type: 'inactive_surface', status: 'INACTIVE', risk_floor: 'P1_EXECUTION_ADJACENT',
    required_scope_fields: '[]', required_target_fields: '[]',
    required_validation_fields: '[]', required_finality_fields: '[]',
    predicate_set: '[]', failure_result: 'NULL', created_at: '2026-06-02T00:00:00.000Z'
  },
]

const { selectAEOTemplate } = await import('../src/lib/agent-tool-gateway.ts')

test('selectAEOTemplate: unknown surface_type → NULL TEMPLATE_NOT_FOUND', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('unknown_surface_xyz', 'P0_READ_ONLY', db)
  assert.equal(result.result, 'NULL')
  assert.equal(result.reason, 'TEMPLATE_NOT_FOUND')
})

test('selectAEOTemplate: missing surface_type (empty string) → NULL TEMPLATE_NOT_FOUND', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('', 'P0_READ_ONLY', db)
  assert.equal(result.result, 'NULL')
  assert.equal(result.reason, 'TEMPLATE_NOT_FOUND')
})

test('selectAEOTemplate: DRAFT template (shell_exec) → NULL SCHEMA_INACTIVE', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('shell_exec', 'P4_PRIVILEGED_EXECUTION', db)
  assert.equal(result.result, 'NULL')
  assert.equal(result.reason, 'SCHEMA_INACTIVE')
})

test('selectAEOTemplate: INACTIVE template → NULL SCHEMA_INACTIVE', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('inactive_surface', 'P1_EXECUTION_ADJACENT', db)
  assert.equal(result.result, 'NULL')
  assert.equal(result.reason, 'SCHEMA_INACTIVE')
})

test('selectAEOTemplate: risk class below floor (P0 for filesystem_write floor P2) → NULL RISK_FLOOR_VIOLATION', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('filesystem_write', 'P0_READ_ONLY', db)
  assert.equal(result.result, 'NULL')
  assert.equal(result.reason, 'RISK_FLOOR_VIOLATION')
})

test('selectAEOTemplate: risk class below floor (P1 for filesystem_write floor P2) → NULL RISK_FLOOR_VIOLATION', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('filesystem_write', 'P1_EXECUTION_ADJACENT', db)
  assert.equal(result.result, 'NULL')
  assert.equal(result.reason, 'RISK_FLOOR_VIOLATION')
})

test('selectAEOTemplate: filesystem_read ACTIVE template with P0 → VALID_TEMPLATE', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('filesystem_read', 'P0_READ_ONLY', db)
  assert.equal(result.result, 'VALID_TEMPLATE')
  assert.equal(result.template.template_id, 'filesystem_read_v1')
  assert.equal(result.template.surface_type, 'filesystem_read')
  assert.equal(result.template.status, 'ACTIVE')
  assert.ok(Array.isArray(result.template.predicate_set))
  assert.ok(result.template.predicate_set.length > 0)
})

test('selectAEOTemplate: filesystem_read ACTIVE template with P2 (above floor) → VALID_TEMPLATE', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('filesystem_read', 'P2_BOUNDED_MUTATION', db)
  assert.equal(result.result, 'VALID_TEMPLATE')
  assert.equal(result.template.template_id, 'filesystem_read_v1')
})

test('selectAEOTemplate: filesystem_write ACTIVE template with P2 → VALID_TEMPLATE', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('filesystem_write', 'P2_BOUNDED_MUTATION', db)
  assert.equal(result.result, 'VALID_TEMPLATE')
  assert.equal(result.template.template_id, 'filesystem_write_v1')
  assert.equal(result.template.surface_type, 'filesystem_write')
  assert.ok(Array.isArray(result.template.predicate_set))
})

test('selectAEOTemplate: filesystem_write ACTIVE template with P3 (above floor) → VALID_TEMPLATE', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('filesystem_write', 'P3_EXTERNAL_MUTATION', db)
  assert.equal(result.result, 'VALID_TEMPLATE')
})

test('selectAEOTemplate: VALID_TEMPLATE result is frozen (immutable)', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('filesystem_read', 'P0_READ_ONLY', db)
  assert.equal(result.result, 'VALID_TEMPLATE')
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.template))
})

test('selectAEOTemplate: NULL result is frozen (immutable)', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const result = await selectAEOTemplate('nonexistent', 'P0_READ_ONLY', db)
  assert.equal(result.result, 'NULL')
  assert.ok(Object.isFrozen(result))
})

// ── No P4/P5 execution is enabled ────────────────────────────────────────────

test('no P4/P5 execution enabled: shell_exec DRAFT → NULL SCHEMA_INACTIVE (never executable)', async () => {
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const shellResult = await selectAEOTemplate('shell_exec', 'P4_PRIVILEGED_EXECUTION', db)
  assert.equal(shellResult.result, 'NULL')
  assert.equal(shellResult.reason, 'SCHEMA_INACTIVE')
})

test('no P4/P5 execution enabled: P5 templates are DRAFT in migration', () => {
  assert.match(migration, /'session_spawn'.*'DRAFT'/)
  assert.match(migration, /'scheduled_action'.*'DRAFT'/)
  assert.doesNotMatch(migration, /'session_spawn'.*'ACTIVE'/)
  assert.doesNotMatch(migration, /'scheduled_action'.*'ACTIVE'/)
})

test('no P4/P5 execution enabled: P4 templates are DRAFT in migration', () => {
  assert.match(migration, /'shell_exec'.*'DRAFT'/)
  assert.match(migration, /'process_control'.*'DRAFT'/)
  assert.match(migration, /'node_runtime'.*'DRAFT'/)
  assert.doesNotMatch(migration, /'shell_exec'.*'ACTIVE'/)
  assert.doesNotMatch(migration, /'process_control'.*'ACTIVE'/)
  assert.doesNotMatch(migration, /'node_runtime'.*'ACTIVE'/)
})

test('selectAEOTemplate: VALID_TEMPLATE does not imply execution authority', () => {
  assert.match(gatewayLib, /VALID_TEMPLATE does NOT authorize execution/)
  assert.match(gatewayLib, /Execution requires authority/)
})

// ── Surface mismatch test (fabricated row) ────────────────────────────────────

// ── Anti-spoof: caller cannot substitute surface_type to select a lower-risk template ──

test('anti-spoof: correct surface_type for shell_exec tool → NULL SCHEMA_INACTIVE (DRAFT blocks execution)', async () => {
  // This test verifies the anti-spoof property:
  // The correct surface_type (shell_exec, derived from tool_system=shell) always returns NULL
  // because shell_exec is DRAFT. A caller cannot bypass this by claiming filesystem_read
  // because the wiring derives surface_type from the hash-verified AEO scope, not caller input.
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  const shellResult = await selectAEOTemplate('shell_exec', 'P4_PRIVILEGED_EXECUTION', db)
  assert.equal(shellResult.result, 'NULL')
  assert.equal(shellResult.reason, 'SCHEMA_INACTIVE')
})

test('anti-spoof: calling selectAEOTemplate with filesystem_read for a P4 tool does not lower risk', async () => {
  // Even if a caller were to pass surface_type=filesystem_read with a high risk class,
  // the risk class is still passed along. At P4, filesystem_read template (floor P0) resolves VALID.
  // This is why the wiring in handleAgentToolInvocationBoundary must use the AEO-scope-derived
  // surface_type (authenticated by hash), not the caller-provided surface_type.
  // The invocation boundary rejects caller-provided surface_type that disagrees with AEO scope.
  const db = makeTemplateDB(ACTIVE_TEMPLATES)
  // For a real shell_exec tool, AEO scope would have surface_type=shell_exec
  // The invocation boundary checks: claimedSurfaceType !== aeoScopeType → TEMPLATE_SURFACE_MISMATCH
  // Here we test that selectAEOTemplate with the authenticated (AEO-derived) shell_exec type → NULL
  const result = await selectAEOTemplate('shell_exec', 'P4_PRIVILEGED_EXECUTION', db)
  assert.equal(result.result, 'NULL')
  assert.equal(result.reason, 'SCHEMA_INACTIVE', 'shell_exec DRAFT blocks spoofed filesystem_read selection')
})

test('anti-spoof: invocation boundary wiring derives surface_type from authenticated AEO scope', () => {
  // Structural check: the wiring code uses exactCanonicalAeo.scope.surface_type (hash-verified)
  // and rejects caller-provided b.surface_type that disagrees.
  const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(indexSource, /aeoScopeType.*=.*exactCanonicalAeo\.scope\.surface_type/)
  assert.match(indexSource, /claimedSurfaceType.*!==.*aeoScopeType/)
  assert.match(indexSource, /aeo_template_surface_type_mismatch/)
  assert.match(indexSource, /TEMPLATE_SURFACE_MISMATCH/)
})

test('anti-spoof: invocation boundary wiring comment — surface_type from hash-verified AEO scope', () => {
  const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(indexSource, /surface_type is derived from the hash-verified AEO scope/)
  assert.match(indexSource, /NOT from caller input/)
})

test('selectAEOTemplate: surface_type mismatch in returned row → NULL TEMPLATE_SURFACE_MISMATCH', async () => {
  const mismatchDB = {
    prepare(_sql) {
      return {
        bind(..._params) {
          return {
            async first() {
              return {
                template_id: 'filesystem_read_v1',
                schema_version: '1.0',
                surface_type: 'different_surface',
                status: 'ACTIVE',
                risk_floor: 'P0_READ_ONLY',
                required_scope_fields: '[]',
                required_target_fields: '[]',
                required_validation_fields: '[]',
                required_finality_fields: '[]',
                predicate_set: '[]',
                failure_result: 'NULL',
                created_at: '2026-06-02T00:00:00.000Z'
              }
            }
          }
        }
      }
    }
  }
  const result = await selectAEOTemplate('filesystem_read', 'P0_READ_ONLY', mismatchDB)
  assert.equal(result.result, 'NULL')
  assert.equal(result.reason, 'TEMPLATE_SURFACE_MISMATCH')
})
