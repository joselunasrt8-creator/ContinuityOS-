import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/constitutional-integrity.yml', import.meta.url), 'utf8')
const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const inventory = readFileSync(new URL('../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url), 'utf8')

const expectedDeclaration = 'const CANONICAL_RUNTIME_ROUTES = ["/session", "/continuity", "/authority", "/compile", "/validate", "/execute", "/proof"] as const'

function canonicalRouteDeclarationStatus(text) {
  const declarations = text.split('\n').filter((line) => /^const CANONICAL_RUNTIME_ROUTES = /.test(line))
  return {
    declaration_count: declarations.length,
    status: declarations.length === 1 && declarations[0] === expectedDeclaration ? 'CANONICAL_RUNTIME_ROUTES_UNCHANGED' : 'NULL',
  }
}

test('constitutional guard scopes canonical route checks to the executable route declaration', () => {
  assert.doesNotMatch(workflow, /git diff origin\/main\.\.\.HEAD -- \| grep -E "CANONICAL_RUNTIME_ROUTES"/)
  assert.match(workflow, /grep -E '\^const CANONICAL_RUNTIME_ROUTES = ' src\/index\.ts/)
  assert.match(workflow, /EXPECTED_CANONICAL_RUNTIME_ROUTES='const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const'/)
})

test('artifact mentions of OUTSIDE_CANONICAL_RUNTIME_ROUTES do not fail scoped route guard', () => {
  assert.match(inventory, /OUTSIDE_CANONICAL_RUNTIME_ROUTES/)
  const sourceWithArtifactText = `${source}\n${inventory}`
  assert.equal(canonicalRouteDeclarationStatus(sourceWithArtifactText).status, 'CANONICAL_RUNTIME_ROUTES_UNCHANGED')
})

test('canonical route mutation still fails closed', () => {
  const mutated = source.replace(expectedDeclaration, 'const CANONICAL_RUNTIME_ROUTES = ["/session", "/authority", "/compile", "/validate", "/execute", "/proof"] as const')
  assert.deepEqual(canonicalRouteDeclarationStatus(mutated), { declaration_count: 1, status: 'NULL' })
})

test('canonical lifecycle remains exactly ordered', () => {
  assert.deepEqual(canonicalRouteDeclarationStatus(source), { declaration_count: 1, status: 'CANONICAL_RUNTIME_ROUTES_UNCHANGED' })
})
