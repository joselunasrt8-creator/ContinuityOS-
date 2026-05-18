import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const artifactPaths = [
  'runtime/unauthorized_mutation_surface_inventory.json',
  'runtime/unauthorized_mutation_path_closure_audit.json',
]

function artifactBytes() {
  return Object.fromEntries(artifactPaths.map((path) => [path, readFileSync(path)]))
}

test('governance inventory regeneration is byte-identical across repeated runs', () => {
  execFileSync('npm', ['run', 'governance:regenerate'], { stdio: 'pipe' })
  const first = artifactBytes()

  execFileSync('npm', ['run', 'governance:regenerate'], { stdio: 'pipe' })
  const second = artifactBytes()

  for (const path of artifactPaths) {
    assert.equal(Buffer.compare(first[path], second[path]), 0, `${path} drifted across repeated governance regeneration`)
  }
})
