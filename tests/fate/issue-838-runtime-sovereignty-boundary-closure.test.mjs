import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const inventory = JSON.parse(readFileSync(new URL('../../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url), 'utf8'))
const bypass = JSON.parse(readFileSync(new URL('../../BYPASS_PATHS.json', import.meta.url), 'utf8'))
const executionSurfaces = JSON.parse(readFileSync(new URL('../../EXECUTION_SURFACES.json', import.meta.url), 'utf8'))
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const wrangler = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')

const byId = new Map(inventory.surfaces.map((s) => [s.surface_id, s]))

function classify(surface) {
  if (surface.evidence_only) return 'evidence-only'
  if (surface.surface_id.includes('legacy') || surface.surface_id.includes('demo')) return 'legacy/demo-only'
  if (surface.surface_id.includes('break_glass') || surface.surface_id.includes('root_override')) return 'break-glass'
  if (surface.deployment_capability) return 'execution-capable'
  if (surface.execution_capability || surface.mutation_capability) return 'authoritative'
  return 'read-only'
}

test('issue #838: all mutation-capable runtime surfaces are declared and classifiable', () => {
  const dbWrites = new Set([...source.matchAll(/(?:INSERT(?: OR IGNORE)? INTO|UPDATE|DELETE FROM)\s+(\w+)/g)].map((m) => m[1]).filter((t) => t !== 'ON'))
  for (const table of dbWrites) {
    const id = `db_write:${table}`
    assert.ok(byId.has(id), `${id} must be declared`)
  }

  for (const route of ['/session','/continuity','/authority','/compile','/validate','/execute','/proof']) {
    assert.ok(byId.has(`route:${route}`), `${route} must be declared`)
  }
  const gatewayCompile = byId.get('route:/gateway/tool/compile')
  assert.ok(gatewayCompile, '/gateway/tool/compile must be declared separately')
  assert.equal(gatewayCompile.surface_type, 'governed_gateway_compile_route')
  assert.equal(gatewayCompile.mutation_capability, true)
  assert.equal(gatewayCompile.execution_capability, false)
  assert.equal(gatewayCompile.deployment_capability, false)
  assert.equal(gatewayCompile.proof_generating, false)
  assert.equal(gatewayCompile.creates_authority, false)
  assert.equal(gatewayCompile.compile_only, true)
  assert.deepEqual(gatewayCompile.issue_lineage, ['#1627', '#1773'])

  for (const surface of inventory.surfaces.filter((s) => s.mutation_capability || s.execution_capability || s.deployment_capability)) {
    const cls = classify(surface)
    assert.ok(['authoritative','execution-capable','evidence-only','legacy/demo-only','break-glass','read-only'].includes(cls), surface.surface_id)
  }
})

test('issue #838: evidence-only surfaces cannot create authority, execution, or proof', () => {
  for (const surface of inventory.surfaces.filter((s) => s.evidence_only)) {
    assert.equal(surface.execution_capability, false, `${surface.surface_id} cannot execute`)
    assert.equal(surface.deployment_capability, false, `${surface.surface_id} cannot deploy`)
    assert.equal(surface.non_authoritative, true, `${surface.surface_id} cannot create authority`)
    assert.notEqual(surface.surface_id, 'route:/authority', 'evidence-only cannot be authority route')
    assert.notEqual(surface.surface_id, 'route:/execute', 'evidence-only cannot be execute route')
    assert.notEqual(surface.surface_id, 'route:/proof', 'evidence-only cannot be proof route')
  }
})

test('issue #838: deployment-adjacent mutation surfaces are declared and governed', () => {
  const workflowFiles = readdirSync(new URL('../../.github/workflows/', import.meta.url)).filter((f) => f.endsWith('.yml'))
  for (const file of workflowFiles) assert.ok(byId.has(`workflow:${file}`), `${file} missing from inventory`)

  for (const script of Object.keys(pkg.scripts)) assert.ok(byId.has(`package_script:${script}`), `${script} missing from inventory`)

  assert.match(wrangler, /name\s*=\s*"mindshift-demo"/)
  assert.equal(executionSurfaces.closure_verification.unclassified_mutation_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
})

test('issue #838: raw deploy and undeclared mutation bypasses are fail-closed', () => {
  const byBypassId = new Map(bypass.bypass_paths.filter((p) => p.bypass_id).map((p) => [p.bypass_id, p]))

  assert.equal(byBypassId.get('undeclared_mutation_surface')?.required_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  assert.match(byBypassId.get('local_authenticated_wrangler_direct_deploy')?.required_response ?? '', /ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL/)
  assert.match(byBypassId.get('cloudflare_account_or_token_direct_deploy')?.required_response ?? '', /ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL/)
})
