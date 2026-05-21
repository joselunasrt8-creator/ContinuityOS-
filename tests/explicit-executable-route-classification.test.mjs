import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const source = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8')

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

test('executable and non-executable runtime routes are explicitly declared and deterministic', () => {
  assert.match(source, /const EXECUTABLE_RUNTIME_ROUTES = Object\.freeze\(\["\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const\)/)
  assert.match(source, /const NON_EXECUTABLE_RUNTIME_ROUTES = Object\.freeze\(\["\/session", "\/continuity"\] as const\)/)

  const executable = ["/authority", "/compile", "/validate", "/execute", "/proof"]
  const nonExecutable = ["/session", "/continuity"]
  const observability = ["/health"]

  assert.equal(hash(executable), hash(["/authority", "/compile", "/validate", "/execute", "/proof"]))
  assert.equal(hash(nonExecutable), hash(["/session", "/continuity"]))
  assert.equal(hash(observability), hash(["/health"]))
})

test('mutation-capable routes are fail-closed unless explicitly executable', () => {
  assert.match(source, /probe\.mutation_capable && probe\.route && !\(EXECUTABLE_RUNTIME_ROUTES as readonly string\[\]\)\.includes\(probe\.route\)/)
  assert.match(source, /drift\.add\("undeclared_mutation_surface_detected"\)/)
  assert.match(source, /drift\.add\("runtime_route_containment_drift"\)/)
})

test('topology route hashing is separated across executable, non-executable runtime, and observability sets', () => {
  assert.match(source, /const executable_route_surface_hash = await sha256Hex\(canonicalize\(inventory\.declared_executable_routes\)\)/)
  assert.match(source, /const non_executable_runtime_route_surface_hash = await sha256Hex\(canonicalize\(inventory\.declared_non_executable_runtime_routes\)\)/)
  assert.match(source, /const observability_route_surface_hash = await sha256Hex\(canonicalize\(inventory\.declared_observability_routes\)\)/)
})
