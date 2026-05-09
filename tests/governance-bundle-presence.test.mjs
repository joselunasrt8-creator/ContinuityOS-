import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const bundleDir = join(process.cwd(), 'governance', 'runtime');

const requiredFiles = [
  {
    file: 'EXECUTION_SURFACES.json',
    requiredKeys: ['version', 'purpose', 'surfaces'],
  },
  {
    file: 'BYPASS_PATHS.json',
    requiredKeys: ['version', 'purpose', 'bypass_paths'],
  },
  {
    file: 'AEO_REQUIREMENTS.json',
    requiredKeys: ['version', 'purpose', 'required_fields', 'invariants'],
  },
  {
    file: 'PROOF_REQUIREMENTS.json',
    requiredKeys: ['version', 'purpose', 'required_proof_fields'],
  },
  {
    file: 'REPLAY_TESTS.json',
    requiredKeys: ['version', 'purpose', 'tests'],
  },
  {
    file: 'DRIFT_TESTS.json',
    requiredKeys: ['version', 'purpose', 'tests'],
  },
];

test('canonical governance runtime bundle exists and parses', () => {
  for (const { file, requiredKeys } of requiredFiles) {
    const filePath = join(bundleDir, file);

    assert.equal(
      existsSync(filePath),
      true,
      `Missing governance runtime bundle file: ${file}`,
    );

    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));

    for (const key of requiredKeys) {
      assert.ok(
        Object.hasOwn(parsed, key),
        `${file} missing required top-level key: ${key}`,
      );
    }
  }
});
