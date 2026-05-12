import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('authority lifecycle reserves before execution and consumes after execution', () => {
  assert.match(
    source,
    /UPDATE authority_registry SET status='RESERVED'[\s\S]*WHERE decision_id=\?1[\s\S]*status='ACTIVE'/,
    'runtime must reserve only ACTIVE authority before execution',
  )

  assert.match(
    source,
    /UPDATE authority_registry SET status='CONSUMED'[\s\S]*WHERE decision_id=\?1[\s\S]*status='EXECUTED'/,
    'runtime must consume only EXECUTED authority after proof persistence',
  )

  assert.match(
    source,
    /event_type: "AUTHORITY_CONSUMED"/,
    'runtime must emit AUTHORITY_CONSUMED telemetry after authority consumption',
  )
})

test('reused consumed authority returns NULL instead of executing again', () => {
  assert.match(
    source,
    /!authority \|\| !\["RESERVED","VALIDATED"\]\.includes\(String\(authority\.status\)[\s\S]*reason:"authority_not_reserved"/,
    'runtime must reject execution when authority is no longer reserved or validated',
  )

  assert.match(
    source,
    /authority_reuse_after_consumed/,
    'runtime must classify consumed authority reuse as replay drift',
  )

  assert.match(
    source,
    /status:"NULL", result:"INVALID", reason:"authority_not_reserved"/,
    'runtime must return NULL / INVALID for consumed authority reuse',
  )
})
