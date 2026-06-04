// Governed Action Template — invariant tests.
// Scope: GovernedSurfaceType discriminated union, GovernedATAOBase/GovernedProofBase
//        type-level constants, createGovernedAction factory, surface-registry dispatch.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const templateSource = readFileSync(
  new URL('../src/lib/governed-action-template.ts', import.meta.url),
  'utf8'
)

const registrySource = readFileSync(
  new URL('../src/lib/surface-registry.ts', import.meta.url),
  'utf8'
)

const {
  createGovernedAction,
} = await import('../src/lib/governed-action-template.ts')

const { getSurface } = await import('../src/lib/surface-registry.ts')

// ── Source structure: template ─────────────────────────────────────────────────

test('template exports GovernedActionSurface interface', () => {
  assert.match(templateSource, /export interface GovernedActionSurface/)
})

test('template exports createGovernedAction factory', () => {
  assert.match(templateSource, /export function createGovernedAction/)
})

test('template exports GovernedSurfaceType discriminated union', () => {
  assert.match(templateSource, /export type GovernedSurfaceType/)
})

test('GovernedSurfaceType includes filesystem', () => {
  assert.match(templateSource, /"filesystem"/)
})

test('GovernedSurfaceType includes github_comment', () => {
  assert.match(templateSource, /"github_comment"/)
})

test('GovernedSurfaceType includes github_pr_review', () => {
  assert.match(templateSource, /"github_pr_review"/)
})

test('GovernedSurfaceType includes terminal_command', () => {
  assert.match(templateSource, /"terminal_command"/)
})

test('GovernedSurfaceType includes deploy', () => {
  assert.match(templateSource, /"deploy"/)
})

test('GovernedSurfaceType includes mcp_tool_call', () => {
  assert.match(templateSource, /"mcp_tool_call"/)
})

test('GovernedSurfaceType includes langchain_action', () => {
  assert.match(templateSource, /"langchain_action"/)
})

test('GovernedATAOBase has creates_authority: false literal type', () => {
  assert.match(templateSource, /creates_authority: false/)
})

test('GovernedATAOBase has creates_execution_eligibility: false literal type', () => {
  assert.match(templateSource, /creates_execution_eligibility: false/)
})

test('GovernedProofBase has validated_object_hash', () => {
  assert.match(templateSource, /validated_object_hash/)
})

test('GovernedProofBase has executed_object_hash', () => {
  assert.match(templateSource, /executed_object_hash/)
})

test('GovernedProofBase has execution_result: "EXECUTED" | "NULL"', () => {
  assert.match(templateSource, /execution_result: "EXECUTED" \| "NULL"/)
})

test('template declares core invariants', () => {
  assert.match(templateSource, /If no valid object exists → nothing happens/)
  assert.match(templateSource, /validated_object_hash == executed_object_hash/)
})

// ── Source structure: registry ─────────────────────────────────────────────────

test('registry exports getSurface function', () => {
  assert.match(registrySource, /export function getSurface/)
})

test('registry imports FilesystemWriteSurface', () => {
  assert.match(registrySource, /FilesystemWriteSurface/)
})

test('registry imports GitHubCommentSurface', () => {
  assert.match(registrySource, /GitHubCommentSurface/)
})

// ── Runtime: createGovernedAction factory ────────────────────────────────────

test('createGovernedAction returns a frozen object', () => {
  const mockSurface = {
    surfaceType: 'filesystem',
    captureATAO: (input) => input ? { atao_id: 'sha256:test', agent_id: 'a', session_id: 's', intent: 'i', risk_class: 'P2', timestamp: 't', creates_authority: false, creates_execution_eligibility: false } : null,
    compileAEO: (_atao, _binding) => null,
    computeAEOHash: (_aeo) => 'sha256:00',
    execute: (_input) => null,
  }
  const governed = createGovernedAction(mockSurface)
  assert.ok(Object.isFrozen(governed))
})

test('createGovernedAction preserves surfaceType', () => {
  const mockSurface = {
    surfaceType: 'github_comment',
    captureATAO: (_input) => null,
    compileAEO: (_atao, _binding) => null,
    computeAEOHash: (_aeo) => 'sha256:00',
    execute: (_input) => null,
  }
  const governed = createGovernedAction(mockSurface)
  assert.equal(governed.surfaceType, 'github_comment')
})

test('createGovernedAction delegates captureATAO', () => {
  let called = false
  const mockSurface = {
    surfaceType: 'filesystem',
    captureATAO: (_input) => { called = true; return null },
    compileAEO: (_atao, _binding) => null,
    computeAEOHash: (_aeo) => 'sha256:00',
    execute: (_input) => null,
  }
  const governed = createGovernedAction(mockSurface)
  governed.captureATAO({})
  assert.ok(called)
})

// ── Runtime: surface-registry dispatch ───────────────────────────────────────

test('getSurface("filesystem") returns filesystem adapter', () => {
  const surface = getSurface('filesystem')
  assert.notEqual(surface, null)
  assert.equal(surface.type, 'filesystem')
  assert.equal(surface.surface.surfaceType, 'filesystem')
})

test('getSurface("github_comment") returns github_comment adapter', () => {
  const surface = getSurface('github_comment')
  assert.notEqual(surface, null)
  assert.equal(surface.type, 'github_comment')
  assert.equal(surface.surface.surfaceType, 'github_comment')
})

test('getSurface("deploy") returns null (not yet registered)', () => {
  const surface = getSurface('deploy')
  assert.equal(surface, null)
})

test('getSurface("terminal_command") returns null (not yet registered)', () => {
  const surface = getSurface('terminal_command')
  assert.equal(surface, null)
})

test('filesystem adapter captureATAO is a function', () => {
  const surface = getSurface('filesystem')
  assert.notEqual(surface, null)
  assert.equal(typeof surface.surface.captureATAO, 'function')
})

test('github_comment adapter captureATAO is a function', () => {
  const surface = getSurface('github_comment')
  assert.notEqual(surface, null)
  assert.equal(typeof surface.surface.captureATAO, 'function')
})

test('filesystem adapter returns null for null input (fail-closed)', () => {
  const surface = getSurface('filesystem')
  assert.notEqual(surface, null)
  const result = surface.surface.captureATAO(null)
  assert.equal(result, null)
})

test('github_comment adapter returns null for null input (fail-closed)', () => {
  const surface = getSurface('github_comment')
  assert.notEqual(surface, null)
  const result = surface.surface.captureATAO(null)
  assert.equal(result, null)
})
