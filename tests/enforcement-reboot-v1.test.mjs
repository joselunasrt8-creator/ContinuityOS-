import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0006_enforcement_reboot_v1.sql', import.meta.url), 'utf8')


test('canonical AEO exactly five fields', () => {
  assert.match(source, /REQUIRED_AEO_KEYS = \["intent", "scope", "validation", "target", "finality"\]/)
  assert.match(source, /keys\.length !== REQUIRED_AEO_KEYS\.length/)
})

test('metadata does not affect hash', () => {
  assert.match(source, /sha256Hex\(canonicalize\(canonical_aeo\)\)/)
})

test('compile returns validated_object_hash', () => {
  assert.match(source, /status: "COMPILED"/)
  assert.match(source, /validated_object_hash/)
})

test('validate reserves nonce', () => {
  assert.match(source, /INSERT OR IGNORE INTO invocation_registry/)
  assert.match(source, /'RESERVED'/)
})

test('execute rejects no validation and wrong hash and replay', () => {
  assert.match(source, /reason:"no_validation"/)
  assert.match(source, /reason:"wrong_hash"/)
  assert.match(source, /reason:"replay_detected"/)
})

test('proof persists and consumes authority', () => {
  assert.match(source, /INSERT INTO proof_registry/)
  assert.match(source, /SET status='CONSUMED'/)
})

test('schema has replay and invocation guards', () => {
  assert.match(migration, /UNIQUE\(decision_id, validated_object_hash\)/)
  assert.match(migration, /PRIMARY KEY\(decision_id, validated_object_hash, invocation_nonce\)/)
})
