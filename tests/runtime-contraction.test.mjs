import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const contraction = JSON.parse(readFileSync(new URL('../governance/runtime/RUNTIME_CONTRACTION_REGISTRY.json', import.meta.url), 'utf8'))

test('singular authoritative ownership classification exists', () => {
  assert.ok(Array.isArray(contraction.classifications.AUTHORITATIVE_KEEP))
  assert.equal(contraction.classifications.AUTHORITATIVE_KEEP.length > 0, true)
})

test('deleted artifacts are non-authoritative and absent', () => {
  for (const cls of ['DERIVED_DELETE', 'ARCHIVE_DELETE', 'GENERATED_DELETE', 'DUPLICATE_DELETE', 'HISTORICAL_DELETE']) {
    for (const file of contraction.classifications[cls]) {
      assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false)
    }
  }
})

test('archive/generated artifacts cannot become canonical', () => {
  const disallowed = ['ARCHIVE_DELETE', 'GENERATED_DELETE']
  const ownerText = readFileSync(new URL('../governance/runtime/CANONICAL_OBJECT_REGISTRY.json', import.meta.url), 'utf8')
  for (const cls of disallowed) {
    for (const file of contraction.classifications[cls]) {
      assert.equal(ownerText.includes(file), false)
    }
  }
})

test('topology ownership remains singular for deleted graph outputs', () => {
  for (const file of contraction.classifications.GENERATED_DELETE.filter((p) => p.startsWith('graph/output/'))) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false)
  }
})

test('execution surfaces remain bounded and no duplicate authoritative registries added', () => {
  const keep = contraction.classifications.AUTHORITATIVE_KEEP.join('\n')
  assert.equal(keep.includes('src/index.ts'), true)
  assert.equal(keep.includes('governance/runtime/CANONICAL_OBJECT_REGISTRY.json'), true)
})
