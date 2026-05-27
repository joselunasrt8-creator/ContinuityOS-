import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyBehavioralAuthoritySurface,
  classifyBehavioralMutationRisk,
  computeBehavioralSurfaceHash,
  creates_authority,
  replay_neutral,
  evidence_only
} from '../src/lib/behavioral-authority-surfaces.ts'

test('AGENTS.md classifies as behavioral authority or cognition shaping surface', () => {
  const result = classifyBehavioralAuthoritySurface('AGENTS.md', 'x')
  assert.ok(['BEHAVIORAL_AUTHORITY_SURFACE', 'COGNITION_SHAPING_SURFACE'].includes(result.classification))
})

test('SOUL.md classifies as COGNITION_SHAPING_SURFACE', () => {
  assert.equal(classifyBehavioralAuthoritySurface('SOUL.md', 'x').classification, 'COGNITION_SHAPING_SURFACE')
})

test('TOOLS.md classifies as TOOL_ROUTING_SURFACE', () => {
  assert.equal(classifyBehavioralAuthoritySurface('TOOLS.md', 'x').classification, 'TOOL_ROUTING_SURFACE')
})

test('HEARTBEAT.md classifies as memory inheritance or cognition shaping', () => {
  const c = classifyBehavioralAuthoritySurface('HEARTBEAT.md', 'x').classification
  assert.ok(['MEMORY_INHERITANCE_SURFACE', 'COGNITION_SHAPING_SURFACE'].includes(c))
})

test('BOOTSTRAP.md classifies as BOOTSTRAP_SURFACE', () => {
  assert.equal(classifyBehavioralAuthoritySurface('BOOTSTRAP.md', 'x').classification, 'BOOTSTRAP_SURFACE')
})

test('unrelated documentation classifies as NON_GOVERNANCE_SURFACE', () => {
  assert.equal(classifyBehavioralAuthoritySurface('docs/readme.md', 'x').classification, 'NON_GOVERNANCE_SURFACE')
})

test('classification does not create authority', () => {
  const result = classifyBehavioralAuthoritySurface('AGENTS.md', 'x')
  assert.equal(result.creates_authority, false)
  assert.equal(creates_authority, false)
})

test('helper exports replay_neutral=true and evidence_only=true', () => {
  assert.equal(replay_neutral, true)
  assert.equal(evidence_only, true)
})

test('mutation risk is deterministic', () => {
  const a = classifyBehavioralMutationRisk({ path: 'AGENTS.md' })
  const b = classifyBehavioralMutationRisk({ path: 'AGENTS.md' })
  assert.deepEqual(a, b)
})

test('surface hash is deterministic', () => {
  assert.equal(computeBehavioralSurfaceHash('abc'), computeBehavioralSurfaceHash('abc'))
})
