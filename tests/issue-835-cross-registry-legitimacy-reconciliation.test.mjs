import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('Issue #835: reconciliation is read-only and fail-closed for invalid cross-registry lineage', () => {
  assert.match(source, /if \(\(CROSS_REGISTRY_RECONCILIATION_ROUTES as readonly string\[\]\)\.includes\(url\.pathname\) && request\.method !== "GET"\) return json\(\{ status: "NULL"/)
  assert.match(source, /if \(!String\(row\.parent_compilation_hash \|\| ""\)\) return "orphan_legitimacy_object_drift"/)
  assert.match(source, /if \(String\(row\.parent_compilation_hash \|\| ""\) !== String\(context\.aeo\.validated_object_hash \|\| ""\)\) return "recursive_ancestry_drift"/)
  assert.match(source, /if \(!String\(row\.parent_validation_hash \|\| ""\)\) return "orphan_legitimacy_object_drift"/)
  assert.match(source, /if \(String\(row\.parent_validation_hash \|\| ""\) !== String\(context\.validation\.lineage_origin_hash \|\| ""\)\) return "proof_lineage_drift"/)
  assert.match(source, /if \(!String\(row\.parent_execution_hash \|\| ""\)\) return "orphan_legitimacy_object_drift"/)
  assert.match(source, /if \(String\(row\.parent_execution_hash \|\| ""\) !== String\(context\.execution\.lineage_origin_hash \|\| ""\)\) return "proof_lineage_drift"/)
})

test('Issue #835: reconciliation verifies deterministic lineage origin chain for validate/execute/proof', () => {
  assert.match(source, /const validationLineageOrigin = verifyLineageOrigin\(\{[\s\S]*stage: "validate"/)
  assert.match(source, /const executionLineageOrigin = verifyLineageOrigin\(\{[\s\S]*stage: "execute"/)
  assert.match(source, /const proofLineageOrigin = verifyLineageOrigin\(\{[\s\S]*stage: "proof"/)
  assert.match(source, /if \(!validationLineageOrigin\.ok\) return "recursive_ancestry_drift"/)
  assert.match(source, /if \(!executionLineageOrigin\.ok\) return "proof_lineage_drift"/)
  assert.match(source, /if \(!proofLineageOrigin\.ok\) return "proof_lineage_drift"/)
})
