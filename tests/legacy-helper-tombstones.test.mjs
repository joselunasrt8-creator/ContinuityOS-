import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const canonicalSpine = '/session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof'

function runInTemp(command, args) {
  const cwd = mkdtempSync(join(tmpdir(), 'legacy-helper-tombstone-'))
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  return { cwd, result }
}

test('legacy registry validator is tombstoned fail-closed', async () => {
  const mod = await import('../registry.js')
  assert.equal(typeof mod.validate, 'function')
  assert.throws(() => mod.validate({}), /Legacy registry\.js helper disabled/)
})

test('legacy compile helper exits fail-closed and creates no artifacts', () => {
  const { cwd, result } = runInTemp(process.execPath, [resolve(root, 'compile-decision.js')])

  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}${result.stdout}`, /Legacy compile-decision\.js helper disabled/)
  assert.match(`${result.stderr}${result.stdout}`, new RegExp(canonicalSpine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(existsSync(join(cwd, 'aeo.json')), false)
  assert.equal(existsSync(join(cwd, 'signature.txt')), false)
})

test('legacy bundle generator exits fail-closed and creates no artifacts', () => {
  const { cwd, result } = runInTemp('bash', [resolve(root, 'mindshift_bundle_generator.sh')])

  assert.notEqual(result.status, 0)
  const output = `${result.stderr}${result.stdout}`
  assert.match(output, /Legacy mindshift_bundle_generator\.sh helper disabled/)
  assert.match(output, new RegExp(canonicalSpine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  for (const artifact of [
    'deploy_aeo.json',
    'deploy_aeo.canonical.json',
    'aeo_hash.txt',
    'signature.bin',
    'signature.b64',
    'activation_receipt.json',
    'fulfillment_bundle.json',
    'founder_private.pem',
    'founder_public.pem',
  ]) {
    assert.equal(existsSync(join(cwd, artifact)), false, `${artifact} must not be created`)
  }
})

test('legacy helper source cannot emit governed-looking outputs', () => {
  const registry = readFileSync(resolve(root, 'registry.js'), 'utf8')
  const compile = readFileSync(resolve(root, 'compile-decision.js'), 'utf8')
  const bundle = readFileSync(resolve(root, 'mindshift_bundle_generator.sh'), 'utf8')

  assert.doesNotMatch(registry, /return\s+['"]VALID['"]|\bVALID\b/)
  assert.doesNotMatch(compile, /writeFileSync\(|aeo\.json|signature\.txt|createHash\(|\bAEO\b|\bVALID\b/)
  assert.doesNotMatch(bundle, /openssl|pkeyutl|deploy_aeo|aeo_hash|signature\.(?:bin|b64)|activation_receipt|fulfillment_bundle|\bAEO\b|\bVALID\b/)
})

test('decision root object is fixture-only and non-authoritative', () => {
  const decision = JSON.parse(readFileSync(resolve(root, 'decision.json'), 'utf8'))

  assert.equal(decision.fixture_classification, 'FIXTURE_ONLY_NON_AUTHORITATIVE')
  assert.equal(decision.runtime_effect, 'none')
  assert.equal(decision.authority_status, 'non_authoritative_fixture')
  assert.deepEqual(decision.canonical_runtime_spine, [
    '/session',
    '/continuity',
    '/authority',
    '/compile',
    '/validate',
    '/execute',
    '/proof',
  ])
})
