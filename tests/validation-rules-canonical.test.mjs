import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/governed-deploy.yml', import.meta.url), 'utf8')
const workflowNames = readdirSync(new URL('../.github/workflows/', import.meta.url)).map((name) => name.toLowerCase())

const canonicalAeoObjectPattern = /const exactAeo = \{ intent: aeo\.intent, scope: aeo\.scope, validation: aeo\.validation, target: aeo\.target, finality: aeo\.finality \}/

test('AEO canonical schema is exact and closed', () => {
  assert.match(source, canonicalAeoObjectPattern)
  assert.match(source, /requiredAeoKeys = \["intent", "scope", "validation", "target", "finality"\]/)
  assert.match(source, /keys\.length === requiredAeoKeys\.length/)
})

test('authority registry checks exist and require ACTIVE authority', () => {
  assert.match(source, /INSERT INTO authority_registry/)
  assert.match(source, /status: "ACTIVE"/)
  assert.match(source, /Authority is not ACTIVE for this validated object\./)
})

test('validated object hash must equal executed object hash', () => {
  assert.match(source, /validated_object_hash: compiledHash/)
  assert.match(source, /No existing VALID validation found for decision_id and validated_object_hash/)
})

test('canonical execution path is authority -> compile -> validate -> execute -> proof', () => {
  const order = [
    'AUTHORITY — Create deploy authority',
    'COMPILE — Create exact AEO and canonical hash',
    'VALIDATE — Fail closed unless exact VALID + exact hash + nonce reserved',
    'EXECUTE — Require exact validated object hash',
    'PROOF — Required for production completion'
  ]

  let lastIndex = -1
  for (const step of order) {
    const index = workflow.indexOf(step)
    assert.ok(index > lastIndex, `${step} must appear in canonical order`)
    lastIndex = index
  }
})

test('no alternate deploy paths exist', () => {
  assert.equal(workflowNames.includes('governed-deploy.yml'), true)

  for (const name of workflowNames) {
    assert.equal(name.includes('direct-deploy'), false)
    assert.equal(name.includes('webhook-deploy'), false)
    assert.equal(name.includes('deploy-prod'), false)
  }

  assert.match(source, /webhook_deploy_disabled/)
})

test('replay protection exists and is enforced', () => {
  assert.match(source, /nonce_not_reserved_or_replayed/)
  assert.match(source, /transitionInvocationReservedToExecuting/)
  assert.match(source, /consumeInvocationAuthority/)
})

test('proof is required and fail closed behavior is explicit', () => {
  assert.match(workflow, /PROOF — Required for production completion/)
  assert.match(workflow, /NULL — Missing required proof/)
  assert.match(source, /proof_required: true/)
})
