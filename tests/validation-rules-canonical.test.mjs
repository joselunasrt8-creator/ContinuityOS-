import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/governed-deploy.yml', import.meta.url), 'utf8')
const workflowNames = readdirSync(new URL('../.github/workflows/', import.meta.url)).map((name) => name.toLowerCase())

const canonicalAeoObjectPattern = /const exactAeo = toAeoCore\(aeo\)/

test('AEO canonical schema is exact and closed', () => {
  assert.match(source, canonicalAeoObjectPattern)
  assert.match(source, /function toAeoCore\(aeo: any\)/)
  assert.match(source, /requiredAeoKeys = \["intent", "scope", "validation", "target", "finality"\]/)
  assert.match(source, /keys\.length === requiredAeoKeys\.length/)
})

test('authority registry checks exist and require ACTIVE authority', () => {
  assert.match(source, /INSERT INTO authority_registry/)
  assert.match(source, /status: "ACTIVE"/)
  assert.match(source, /Authority is not ACTIVE for this validated object\./)
})

test('validated object hash must equal executed object hash', () => {
  assert.match(source, /const validated_object_hash = await sha256Hex\(canonicalizeJson\(canonicalAeo\)\)/)
  assert.match(source, /JSON\.stringify\(canonicalAeo\)/)
  assert.match(source, /validated_object_hash: compiledHash/)
  assert.match(source, /No existing VALID validation found for decision_id and validated_object_hash/)
})

test('metadata is separated from canonical object for hashing', () => {
  assert.match(source, /const metadata = \{\s*aeo_id: crypto\.randomUUID\(\),\s*authority_id: authority\.authority_id,\s*decision_id: authority\.decision_id,\s*status: "COMPILED",\s*created_at: new Date\(\)\.toISOString\(\)\s*\}/)
  assert.match(source, /return \{ canonical_aeo, metadata \}/)
})

test('canonical execution path is authority -> compile -> validate -> execute -> proof', () => {
  const order = [
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


test('canonical governed workflow constant is enforced in runtime and workflows', () => {
  const prepareWorkflow = readFileSync(new URL('../.github/workflows/prepare-governed-deploy.yml', import.meta.url), 'utf8')
  assert.match(source, /const CANONICAL_GOVERNED_WORKFLOW = "governed-deploy\.yml"/)
  assert.match(source, /constraints\.workflow === CANONICAL_GOVERNED_WORKFLOW/)
  assert.match(workflow, /--arg workflow "governed-deploy\.yml"/)
  assert.match(prepareWorkflow, /constraints:\{repo:"\$\{\{ github\.repository \}\}",branch:"\$\{\{ github\.ref_name \}\}",workflow:"governed-deploy\.yml",max_executions:1\}/)
})

test('prepare-governed-deploy summary prints copyable values safely', () => {
  const prepareWorkflow = readFileSync(new URL('../.github/workflows/prepare-governed-deploy.yml', import.meta.url), 'utf8')
  assert.match(prepareWorkflow, /printf '### governed-deploy\.yml manual inputs/) 
  assert.match(prepareWorkflow, /printf '%s\n' '```text'/)
  assert.doesNotMatch(prepareWorkflow, /echo "- decision_id: \\`\$DECISION_ID\\`"/)
})


test('validated hash is computed from canonical AEO only (metadata excluded)', () => {
  assert.match(source, /function buildAeo\(authority: any, target: GithubDeployTarget\) \{/)
  assert.match(source, /return \{ canonical_aeo, registry \}/)
  assert.match(source, /const validated_object_hash = await sha256Hex\(canonicalizeJson\(canonicalAeoFrom\(aeo\)\)\)/)
  assert.match(source, /JSON\.stringify\(compiled\.canonical_aeo\)/)
})
