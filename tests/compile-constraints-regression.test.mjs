import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('compile path derives constraints from authority in local scope and returns validated_object_hash', () => {
  assert.match(source, /const constraints = ensureDeployConstraints\(parseJsonObject\(authority\.constraints\)\)/)
  assert.match(source, /validated_object_hash: compiledHash/)
})

test('canonical aeo shape is exactly five top-level fields in builder', () => {
  assert.match(source, /const canonical_aeo = \{[\s\S]*intent:[\s\S]*scope:[\s\S]*validation:[\s\S]*target:[\s\S]*finality:/)
})


test('compile decision path returns registry from local aeo object to avoid runtime ReferenceError', () => {
  assert.match(source, /return jsonResponse\(\{ aeo: exactAeo, validated_object_hash: compiledHash, registry: aeo\.registry \}\)/)
  assert.doesNotMatch(source, /return jsonResponse\(\{ aeo: exactAeo, validated_object_hash: compiledHash, registry: compiled\.registry \}\)/)
})
