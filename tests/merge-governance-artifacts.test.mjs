import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const runtimeDir = join(process.cwd(), 'governance', 'runtime');

const requiredArtifacts = [
  {
    file: 'PREO_REQUIREMENTS.json',
    requiredKeys: ['version', 'purpose', 'required_fields', 'rules'],
  },
  {
    file: 'SCO_REQUIREMENTS.json',
    requiredKeys: ['version', 'purpose', 'required_fields', 'rules', 'governed_paths'],
  },
  {
    file: 'AGENT_EXECUTION_GOVERNANCE_MODEL.json',
    requiredKeys: ['version', 'purpose', 'canonical_invariants', 'execution_gate', 'topology', 'pr_governance_object', 'registry_requirements', 'fail_closed_requirements', 'agent_surfaces', 'enforcement_routing'],
  },
  {
    file: 'MERGE_GOVERNANCE_RULES.json',
    requiredKeys: ['version', 'purpose', 'rules', 'required_proof_fields', 'bypass_paths'],
  },
];

test('merge governance artifacts exist and parse', () => {
  for (const artifact of requiredArtifacts) {
    const artifactPath = join(runtimeDir, artifact.file);

    assert.equal(
      existsSync(artifactPath),
      true,
      `Missing governance artifact: ${artifact.file}`,
    );

    const parsed = JSON.parse(readFileSync(artifactPath, 'utf8'));

    for (const key of artifact.requiredKeys) {
      assert.ok(
        Object.hasOwn(parsed, key),
        `${artifact.file} missing required key: ${key}`,
      );
    }
  }
});
