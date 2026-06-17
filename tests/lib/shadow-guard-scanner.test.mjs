import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ShadowGuardScanner,
} from '../../src/lib/shadow-guard-scanner.ts';

test('ShadowGuardScanner — scan returns PASS when all surfaces are declared and classified', async () => {
  const declaredSurfaces = [
    {
      surface_id: 'script:test',
      type: 'package-script',
      name: 'test',
      location: 'package.json:scripts.test',
      mutation_capable: false,
      classification: '@test-only',
      declared: true,
    },
    {
      surface_id: 'script:build',
      type: 'package-script',
      name: 'build',
      location: 'package.json:scripts.build',
      mutation_capable: false,
      classification: '@freeze',
      declared: true,
    },
  ];

  const scanner = new ShadowGuardScanner('.', declaredSurfaces);
  const result = await scanner.scan();

  assert.equal(result.status, 'PASS');
  assert.equal(result.summary.total_surfaces, 2);
  assert.equal(result.summary.declared_surfaces, 2);
  assert.equal(result.summary.undeclared_surfaces, 0);
  assert.equal(result.summary.unclassified_surfaces, 0);
  assert.equal(result.summary.all_classified, true);
});

test('ShadowGuardScanner — undeclared mutation-capable surface yields NULL', async () => {
  const surfaces = [
    {
      surface_id: 'workflow:shadow-deploy',
      type: 'workflow-job',
      name: 'shadow-deploy',
      location: '.github/workflows/shadow-deploy.yml',
      mutation_capable: true,
      classification: null,
      declared: false,
    },
  ];

  const scanner = new ShadowGuardScanner('.', surfaces);
  const result = await scanner.scan();

  assert.equal(result.status, 'NULL');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].root_cause, 'undeclared-mutation-surface');
  assert.equal(result.findings[0].topology_status, 'undeclared');
  assert.equal(result.findings[0].divergence_class, 'undeclared_mutation_surface');
  assert.equal(typeof result.findings[0].potential_consequence, 'string');
});

test('ShadowGuardScanner — declared but unclassified mutation surface yields NULL', async () => {
  const surfaces = [
    {
      surface_id: 'script:deploy',
      type: 'package-script',
      name: 'deploy',
      location: 'package.json:scripts.deploy',
      mutation_capable: true,
      classification: null,
      declared: true,
    },
  ];

  const scanner = new ShadowGuardScanner('.', surfaces);
  const result = await scanner.scan();

  assert.equal(result.status, 'NULL');
  assert.equal(result.findings[0].root_cause, 'unclassified-surface');
  assert.equal(result.findings[0].divergence_class, 'unclassified_mutation_surface');
});

test('ShadowGuardScanner — non-mutation undeclared surface still yields PASS', async () => {
  const surfaces = [
    {
      surface_id: 'script:read-only',
      type: 'package-script',
      name: 'read-only',
      location: 'package.json:scripts.readonly',
      mutation_capable: false,
      classification: null,
      declared: false,
    },
  ];

  const scanner = new ShadowGuardScanner('.', surfaces);
  const result = await scanner.scan();

  // non-mutation undeclared surfaces are PASS
  assert.equal(result.status, 'PASS');
  assert.equal(result.findings[0].status, 'PASS');
});

test('ShadowGuardScanner — mixed surfaces produce correct summary counts', async () => {
  const surfaces = [
    {
      surface_id: 'script:test',
      type: 'package-script',
      name: 'test',
      location: 'package.json:scripts.test',
      mutation_capable: false,
      classification: '@test-only',
      declared: true,
    },
    {
      surface_id: 'workflow:shadow-deploy',
      type: 'workflow-job',
      name: 'shadow-deploy',
      location: '.github/workflows/shadow-deploy.yml',
      mutation_capable: true,
      classification: null,
      declared: false,
    },
    {
      surface_id: 'script:deploy',
      type: 'package-script',
      name: 'deploy',
      location: 'package.json:scripts.deploy',
      mutation_capable: true,
      classification: null,
      declared: true,
    },
  ];

  const scanner = new ShadowGuardScanner('.', surfaces);
  const result = await scanner.scan();

  assert.equal(result.status, 'NULL');
  assert.equal(result.summary.total_surfaces, 3);
  assert.equal(result.summary.declared_surfaces, 2);
  assert.equal(result.summary.undeclared_surfaces, 1);
  assert.equal(result.summary.all_classified, false);
});

test('ShadowGuardScanner — default constructor uses PHASE_A_DECLARED_SURFACES', async () => {
  const scanner = new ShadowGuardScanner();
  const result = await scanner.scan();

  // PHASE_A_DECLARED_SURFACES has known NULL surfaces
  assert.equal(result.status, 'NULL');
  assert.ok(result.findings.length > 0);
});

test('ShadowGuardScanner — all findings carry DIAGNOSTIC_ONLY result field', async () => {
  const surfaces = [
    {
      surface_id: 'script:test',
      type: 'package-script',
      name: 'test',
      location: 'package.json:scripts.test',
      mutation_capable: false,
      classification: '@test-only',
      declared: true,
    },
    {
      surface_id: 'workflow:shadow-deploy',
      type: 'workflow-job',
      name: 'shadow-deploy',
      location: '.github/workflows/shadow-deploy.yml',
      mutation_capable: true,
      classification: null,
      declared: false,
    },
  ];

  const scanner = new ShadowGuardScanner('.', surfaces);
  const result = await scanner.scan();

  for (const finding of result.findings) {
    assert.equal(finding.result, 'DIAGNOSTIC_ONLY');
    assert.equal(finding.human_review, 'PASS');
    assert.equal(finding.shadow_guard, finding.status);
  }
});

test('ShadowGuardScanner — empty surface list returns PASS with zero counts', async () => {
  const scanner = new ShadowGuardScanner('.', []);
  const result = await scanner.scan();

  assert.equal(result.status, 'PASS');
  assert.equal(result.findings.length, 0);
  assert.equal(result.summary.total_surfaces, 0);
  assert.equal(result.summary.all_classified, true);
});
