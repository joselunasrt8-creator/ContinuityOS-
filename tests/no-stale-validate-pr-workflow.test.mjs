import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir) {
  try {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
  } catch {
    return []
  }
}

test('operational GitHub workflows do not call stale /validate-pr endpoint', () => {
  const workflowFiles = walk(new URL('../.github/workflows', import.meta.url).pathname)
  for (const file of workflowFiles) {
    const text = readFileSync(file, 'utf8')
    assert.equal(text.includes('/validate-pr'), false, `${file} must not call /validate-pr`)
  }
})
