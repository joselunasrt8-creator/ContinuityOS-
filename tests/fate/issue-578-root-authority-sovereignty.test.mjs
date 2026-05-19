import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

test('issue #578: required sovereignty classification artifacts exist', () => {
  for (const path of [
    'governance/SOVEREIGNTY_ASSUMPTION_REGISTRY.json',
    'governance/ROOT_AUTHORITY_CLASSIFICATION.json',
    'governance/BYPASS_CAPABLE_SURFACES.json'
  ]) {
    const raw = readFileSync(join(root, path), 'utf8')
    assert.ok(raw.length > 0, `${path} must exist`) 
  }
})

test('issue #578: Cloudflare Git Integration is explicitly classified', () => {
  const classification = readJson('governance/ROOT_AUTHORITY_CLASSIFICATION.json')
  const found = classification.surfaces.find((s) => s.surface_name === 'Cloudflare Git Integration')
  assert.ok(found)
  assert.equal(found.issue_reference, '#578')
  assert.equal(typeof found.production_capability, 'boolean')
})

test('issue #578: bypass-capable surfaces include required containment fields', () => {
  const bypass = readJson('governance/BYPASS_CAPABLE_SURFACES.json')
  for (const surface of bypass.surfaces) {
    assert.equal(typeof surface.production_capability, 'boolean')
    assert.equal(typeof surface.governed_by_mindshift, 'boolean')
    assert.ok(surface.containment_recommendation)
    assert.ok(surface.evidence_path)
  }
})

test('issue #578: production-capable bypass cannot be silently marked safe', () => {
  const bypass = readJson('governance/BYPASS_CAPABLE_SURFACES.json')
  for (const surface of bypass.surfaces) {
    if (surface.production_capability && surface.governed_by_mindshift === false) {
      assert.ok(['P2', 'P3'].includes(surface.bypass_risk), `${surface.surface_name} risk must be P2/P3`)
    }
  }
})

test('issue #578 remains open while any production-capable bypass exists', () => {
  const sovereignty = readJson('governance/SOVEREIGNTY_ASSUMPTION_REGISTRY.json')
  const openBypass = sovereignty.assumptions.some((s) => s.production_capability && s.governed_by_mindshift === false && s.status === 'OPEN')
  assert.equal(openBypass, true)
})

test('issue #577 closure remains separate from #578 sovereignty containment', () => {
  const bypass = readJson('governance/BYPASS_CAPABLE_SURFACES.json')
  assert.equal(bypass.issue_577_separation.production_deploy_closure_issue, '#577')
  assert.equal(bypass.issue_577_separation.sovereignty_containment_issue, '#578')
  assert.equal(bypass.issue_577_separation.status, 'SEPARATE_TRACKS_REQUIRED')
})
