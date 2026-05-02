import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/governed-deploy.yml', import.meta.url), 'utf8')
const workflows = readdirSync(new URL('../.github/workflows/', import.meta.url)).map((name) => name.toLowerCase())

test('records endpoints require API key', () => {
  assert.match(source, /route\("\/records\/authorities"\)[\s\S]*requireApiKey\(request, env\)/)
  assert.match(source, /route\("\/records\/executions"\)[\s\S]*requireApiKey\(request, env\)/)
  assert.match(source, /route\("\/records\/proofs"\)[\s\S]*requireApiKey\(request, env\)/)
})

test('test mutation routes are API-key protected', () => {
  assert.match(source, /route\("\/replay-test"\)[\s\S]*requireApiKey\(request, env\)/)
  assert.match(source, /route\("\/github-proof-test"\)[\s\S]*requireApiKey\(request, env\)/)
  assert.match(source, /route\("\/nonce-validation-test"\)[\s\S]*requireApiKey\(request, env\)/)
})

test('/execute blocks arbitrary webhook_url payload path', () => {
  assert.match(source, /webhook_execution_disabled/)
  assert.doesNotMatch(source, /fetch\(String\(body\.webhook_url\)/)
})

test('governed-deploy.yml is the only production deploy workflow', () => {
  assert.match(source, /workflow: "governed-deploy\.yml"/)
  assert.match(workflow, /name: governed-deploy/)
  assert.match(workflow, /--arg workflow "governed-deploy\.yml"/)

  assert.equal(workflows.includes('governed-deploy.yml'), true)
  for (const file of workflows) {
    assert.equal(/^transfer(?:-v2|-v3)?/.test(file), false)
    assert.equal(file.includes('direct-deploy'), false)
    assert.equal(file.includes('webhook-deploy'), false)
  }
})

test('replay protection by decision+hash+nonce remains enforced', () => {
  assert.match(source, /nonce_not_reserved_or_replayed/)
  assert.match(source, /transitionInvocationReservedToExecuting/)
  assert.match(source, /consumeInvocationAuthority/)
})
