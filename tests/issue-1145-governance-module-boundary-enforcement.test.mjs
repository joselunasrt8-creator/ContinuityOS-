import test from 'node:test'
import assert from 'node:assert/strict'

import { canonicalize, sha256Hex } from '../src/canonical.js'
import { enforceGovernanceModuleBoundaries } from '../src/governance-module-boundary-enforcement.ts'

const modules = [
  {
    module_id: 'authority-core',
    module_surface: 'authority',
    role: 'authority',
    owner_invariants: ['inv.validate_eq_execute'],
    depends_on: ['reconciliation-core', 'observability-view'],
    allows_outbound_to: ['reconciliation-core'],
    authority_scopes: ['root'],
    semantic_tags: ['legitimacy'],
  },
  {
    module_id: 'observability-view',
    module_surface: 'observability',
    role: 'observability',
    owner_invariants: ['inv.validate_eq_execute'],
    depends_on: ['authority-core'],
    authority_scopes: ['unexpected'],
    semantic_tags: ['legitimacy'],
  },
  {
    module_id: 'reconciliation-core',
    module_surface: 'reconciliation',
    role: 'reconciliation',
    owner_invariants: ['inv.reconcile_recursively'],
    depends_on: ['authority-core'],
    allows_outbound_to: ['authority-core'],
    semantic_tags: ['lineage'],
  },
  {
    module_id: 'shadow-bridge',
    module_surface: 'shadow',
    role: 'unknown',
    depends_on: ['authority-core'],
    semantic_tags: ['legitimacy'],
  },
]

const input = { analysis_id: 'issue-1145', evidence_only: true, modules }

test('Issue #1145: deterministic ordering and inventories', () => {
  const result = enforceGovernanceModuleBoundaries({ ...input, modules: [...modules].reverse() })
  assert.deepEqual(result.module_boundary_inventory, [
    'authority-core:authority',
    'observability-view:observability',
    'reconciliation-core:reconciliation',
    'shadow-bridge:shadow',
  ])
  assert.ok(result.dependency_direction_inventory.includes('authority-core->observability-view'))
  assert.ok(result.circular_dependency_inventory.includes('authority-core<->observability-view'))
})

test('Issue #1145: required detections are emitted', () => {
  const result = enforceGovernanceModuleBoundaries(input)
  assert.equal(result.classification, 'UNKNOWN_MODULE_SURFACE')
  assert.ok(result.boundary_violation_inventory.some((v) => v.startsWith('forbidden_dependency_direction:authority-core->observability-view')))
  assert.ok(result.boundary_violation_inventory.some((v) => v.startsWith('unknown_module_surface:shadow-bridge')))
  assert.ok(result.authority_leakage_inventory.some((v) => v.startsWith('observability_authority_leakage:observability-view')))
  assert.ok(result.authority_leakage_inventory.some((v) => v.startsWith('observability_to_authority:observability-view->authority-core')))
  assert.ok(result.semantic_fragmentation_inventory.some((v) => v.startsWith('owner_fragmentation:inv.validate_eq_execute')))
  assert.ok(result.module_responsibility_drift_inventory.some((v) => v.startsWith('module_responsibility_drift:authority-core->observability-view')))
})

test('Issue #1145: observability-only and immutable semantics', () => {
  const result = enforceGovernanceModuleBoundaries(input)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.mutates_state, false)
  assert.equal(result.validates_execution, false)
  assert.ok(result.observability_containment_inventory.includes('module_visibility_neq_authority'))
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.boundary_violation_inventory))
})

test('Issue #1145: canonical hashing verification', () => {
  const result = enforceGovernanceModuleBoundaries(input)
  const copy = { ...result }
  delete copy.boundary_hash
  assert.equal(result.boundary_hash, sha256Hex(canonicalize(copy)))
})

test('Issue #1145: fail-closed NULL behavior', () => {
  const result = enforceGovernanceModuleBoundaries({ analysis_id: 'x', evidence_only: true, modules: [] })
  assert.equal(result.classification, 'NULL')
  assert.deepEqual(result.module_boundary_inventory, [])
})
