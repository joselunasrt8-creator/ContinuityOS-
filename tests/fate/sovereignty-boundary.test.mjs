import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../..', import.meta.url)
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const map = JSON.parse(readFileSync(new URL('../../runtime/sovereignty_map.json', import.meta.url), 'utf8'))
const gaps = JSON.parse(readFileSync(new URL('../../runtime/sovereignty_gaps.json', import.meta.url), 'utf8'))
const external = JSON.parse(readFileSync(new URL('../../runtime/external_execution_surfaces.json', import.meta.url), 'utf8'))
const workflowsDir = new URL('../../.github/workflows', import.meta.url)
const workflows = existsSync(workflowsDir) ? readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')) : []
const workflowText = workflows.map((f) => readFileSync(join(workflowsDir.pathname, f), 'utf8')).join('\n')
const surfaceIds = new Set(map.surfaces.map((s) => s.surface_id))
const gapIds = new Set(gaps.gaps.map((g) => g.surface_id))

test('no unauthorized direct deploy workflow exists', () => {
  assert.deepEqual(workflows.filter((f) => /deploy/i.test(f) && !external.adapters[0].allowed_targets.includes(f)), [])
})

test('no stale endpoint workflow remains active', () => {
  assert.doesNotMatch(workflowText, /validate-pr|stale-endpoint|direct-validate/i)
})

test('no package deploy script bypass exists', () => {
  assert.match(packageJson.scripts.deploy, /Direct deploy disabled/)
  assert.match(packageJson.scripts.deploy, /exit 1/)
})

test('no direct wrangler deploy path exists outside governed workflow', () => {
  assert.doesNotMatch(packageJson.scripts.deploy, /wrangler\s+deploy/)
  for (const f of workflows) {
    const text = readFileSync(join(workflowsDir.pathname, f), 'utf8')
    if (/wrangler\s+deploy/.test(text)) assert.ok(external.adapters[0].allowed_targets.includes(f), `${f} must be an approved adapter target`)
  }
})

test('no unclassified execution surface exists in sovereignty map', () => {
  for (const id of ['github_actions','npm_dependency_graph','outbound_curl_requests','workflow_shell_scripts','environment_variables','docker_base_images','mcp_remote_servers','arbitrary_shell_execution','direct_cloud_console_mutation','unmanaged_saas_apis','local_mcp_stdio_servers','manual_database_mutation','unrestricted_outbound_network','direct_deploy_commands','direct_db_write_paths','stale_workflow_endpoints']) assert.ok(surfaceIds.has(id), id)
})

test('all S1 surfaces have proof_capable, revocable, and drift_observable fields', () => {
  for (const s of map.surfaces.filter((x) => x.sovereignty_tier === 'S1')) {
    assert.equal(typeof s.proof_capable, 'boolean')
    assert.equal(typeof s.revocable, 'boolean')
    assert.equal(typeof s.drift_observable, 'boolean')
  }
})

test('all S2/S3 surfaces are listed in sovereignty_gaps.json', () => {
  for (const s of map.surfaces.filter((x) => ['S2','S3'].includes(x.sovereignty_tier))) assert.ok(gapIds.has(s.surface_id), s.surface_id)
})

test('outbound curl / network usage is either classified or blocked', () => {
  assert.ok(surfaceIds.has('outbound_curl_requests'))
  assert.ok(gapIds.has('unrestricted_outbound_network'))
})

test('adapter targets match approved workflow targets', () => {
  assert.deepEqual(external.adapters[0].allowed_targets.sort(), ['governed-deploy.yml','prepare-governed-deploy.yml'].sort())
})

test('proofless external execution paths are flagged', () => {
  assert.ok(gaps.failure_classes.includes('proofless external execution'))
})

test('federated revocation observability does not create an authority federation surface', () => {
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const spec = JSON.parse(readFileSync(new URL('../../governance/runtime/FEDERATED_RECONCILIATION_SPEC.json', import.meta.url), 'utf8'))
  assert.match(source, /observability_federation_not_authority_federation/)
  assert.match(source, /distributed_legitimacy_awareness_without_distributed_authority_collapse/)
  assert.match(source, /read_only: true/)
  assert.match(source, /mutation_capable: false/)
  assert.match(source, /remote_authority_inherited: false/)
  assert.match(source, /remote_execution_legitimacy: false/)
  assert.match(source, /replay_state_consumed: false/)
  assert.equal(spec.governance_position, 'observability federation, not authority federation; distributed legitimacy awareness WITHOUT distributed authority collapse')
})
