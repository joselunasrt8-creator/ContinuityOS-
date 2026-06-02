import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../../.github/workflows/merge-proof.yml', import.meta.url), 'utf8')

test('merge proof resolves PR comparison commits before review legitimacy diff', () => {
  const baseFetch = workflow.indexOf('git fetch --no-tags --depth=1 origin "$BASE_SHA"')
  const headFetch = workflow.indexOf('git fetch --no-tags --depth=1 origin "$HEAD_SHA"')
  const baseVerify = workflow.indexOf('git cat-file -e "$BASE_SHA^{commit}"')
  const headVerify = workflow.indexOf('git cat-file -e "$HEAD_SHA^{commit}"')
  const diagnostic = workflow.indexOf('Unable to resolve PR comparison commits for review legitimacy check')
  const diff = workflow.indexOf('git diff --name-only "$BASE_SHA" "$HEAD_SHA" > changed_files_proof.txt')
  const classify = workflow.indexOf('RISK_CLASS="$(bash scripts/classify-risk.sh changed_files_proof.txt)"')

  assert.notEqual(baseFetch, -1, 'workflow must fetch missing base commit before diff')
  assert.notEqual(headFetch, -1, 'workflow must fetch missing head commit before diff')
  assert.notEqual(baseVerify, -1, 'workflow must verify base commit object before diff')
  assert.notEqual(headVerify, -1, 'workflow must verify head commit object before diff')
  assert.notEqual(diagnostic, -1, 'workflow must fail closed with a clear diagnostic when commits are unresolved')
  assert.notEqual(diff, -1, 'workflow must still produce changed_files_proof.txt using git diff')
  assert.notEqual(classify, -1, 'workflow must still classify risk from changed_files_proof.txt')

  assert.ok(baseFetch < diff, 'base commit fetch must happen before diff')
  assert.ok(headFetch < diff, 'head commit fetch must happen before diff')
  assert.ok(baseVerify < diff, 'base commit verification must happen before diff')
  assert.ok(headVerify < diff, 'head commit verification must happen before diff')
  assert.ok(diagnostic < diff, 'unresolved commit diagnostic must happen before diff')
  assert.ok(diff < classify, 'risk classification must remain after changed-file detection')
})
