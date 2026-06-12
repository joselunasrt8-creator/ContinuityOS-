/**
 * Shadow Guard Scanner — Phase A
 *
 * Detects undeclared mutation surfaces in the codebase.
 * Diagnostic-only (non-enforcing). Emits PASS ∧ NULL divergence evidence.
 *
 * JavaScript implementation for Phase A demo.
 */

/**
 * Phase A hardcoded declared topology reference.
 * In Phase B, will be replaced with governance registry lookup.
 */
const PHASE_A_DECLARED_SURFACES = [
  // PASS examples — declared and classified surfaces
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
  {
    surface_id: 'script:dev',
    type: 'package-script',
    name: 'dev',
    location: 'package.json:scripts.dev',
    mutation_capable: false,
    classification: '@freeze',
    declared: true,
  },
  {
    surface_id: 'workflow:build',
    type: 'workflow-job',
    name: 'build',
    location: '.github/workflows/build.yml',
    mutation_capable: false,
    classification: '@verified',
    declared: true,
  },
  {
    surface_id: 'workflow:test',
    type: 'workflow-job',
    name: 'test',
    location: '.github/workflows/test.yml',
    mutation_capable: false,
    classification: '@verified',
    declared: true,
  },
  {
    surface_id: 'workflow:lint',
    type: 'workflow-job',
    name: 'lint',
    location: '.github/workflows/lint.yml',
    mutation_capable: false,
    classification: '@test-only',
    declared: true,
  },
  {
    surface_id: 'script:lint',
    type: 'package-script',
    name: 'lint',
    location: 'package.json:scripts.lint',
    mutation_capable: false,
    classification: '@test-only',
    declared: true,
  },
  {
    surface_id: 'script:format',
    type: 'package-script',
    name: 'format',
    location: 'package.json:scripts.format',
    mutation_capable: false,
    classification: '@freeze',
    declared: true,
  },
  {
    surface_id: 'workflow:conformance',
    type: 'workflow-job',
    name: 'conformance',
    location: '.github/workflows/conformance.yml',
    mutation_capable: false,
    classification: '@verified',
    declared: true,
  },
  {
    surface_id: 'workflow:security-scan',
    type: 'workflow-job',
    name: 'security-scan',
    location: '.github/workflows/security-scan.yml',
    mutation_capable: false,
    classification: '@verified',
    declared: true,
  },
  {
    surface_id: 'script:generate',
    type: 'package-script',
    name: 'generate',
    location: 'package.json:scripts.generate',
    mutation_capable: false,
    classification: '@freeze',
    declared: true,
  },
  {
    surface_id: 'script:verify',
    type: 'package-script',
    name: 'verify',
    location: 'package.json:scripts.verify',
    mutation_capable: false,
    classification: '@test-only',
    declared: true,
  },
  {
    surface_id: 'script:docs',
    type: 'package-script',
    name: 'docs',
    location: 'package.json:scripts.docs',
    mutation_capable: false,
    classification: '@freeze',
    declared: true,
  },

  // NULL examples — undeclared or unclassified surfaces
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
    declared: false,
  },
];

export class ShadowGuardScanner {
  constructor(repoPath = '.', declaredSurfaces = null) {
    this.repoPath = repoPath;
    this.declaredSurfaces = declaredSurfaces || PHASE_A_DECLARED_SURFACES;
  }

  /**
   * Main entry point for scanning.
   * Returns diagnostic result with PASS/NULL findings.
   */
  async scan() {
    const findings = [];

    // Scan all declared surfaces to generate findings
    for (const surface of this.declaredSurfaces) {
      const finding = this.generateFinding(surface);
      findings.push(finding);
    }

    // Compute summary
    const declaredCount = findings.filter((f) => f.topology_status === 'declared').length;
    const undeclaredCount = findings.filter((f) => f.topology_status === 'undeclared').length;
    const unclassifiedCount = findings.filter((f) => f.classification === null && f.topology_status !== 'undeclared').length;

    const nullFindings = findings.filter((f) => f.status === 'NULL').length;
    const overallStatus = nullFindings > 0 ? 'NULL' : 'PASS';

    return {
      status: overallStatus,
      findings,
      summary: {
        total_surfaces: findings.length,
        declared_surfaces: declaredCount,
        undeclared_surfaces: undeclaredCount,
        unclassified_surfaces: unclassifiedCount,
        all_classified: unclassifiedCount === 0 && undeclaredCount === 0,
      },
    };
  }

  /**
   * Generate a finding for a single surface.
   * Determines PASS vs NULL status and root cause.
   */
  generateFinding(surface) {
    const declared = surface.declared;
    const classified = surface.classification !== null;

    let status;
    let rootCause;
    let potentialConsequence;
    let divergenceClass = null;

    if (declared && classified) {
      // PASS: surface is declared and properly classified
      status = 'PASS';
      rootCause = 'declared-and-classified';
    } else if (!declared && surface.mutation_capable) {
      // NULL: undeclared mutation surface (governance blind spot)
      status = 'NULL';
      rootCause = 'undeclared-mutation-surface';
      potentialConsequence = 'Untracked mutation authority may bypass governance validation';
      divergenceClass = 'undeclared_mutation_surface';
    } else if (!classified && surface.mutation_capable) {
      // NULL: mutation-capable surface without safety classification
      status = 'NULL';
      rootCause = 'unclassified-surface';
      potentialConsequence = 'Untagged mutation capability could leak to production';
      divergenceClass = 'unclassified_mutation_surface';
    } else {
      // PASS: surface is either read-only or properly safe
      status = 'PASS';
      rootCause = 'declared-and-classified';
    }

    return {
      surface_id: surface.surface_id,
      type: surface.type,
      status,
      location: surface.location,
      mutation_capable: surface.mutation_capable,
      classification: surface.classification,
      topology_status: surface.declared ? 'declared' : 'undeclared',
      root_cause: rootCause,
      potential_consequence: potentialConsequence,
      human_review: 'PASS', // Phase A: human always reviews, Shadow Guard diverges on NULL findings
      shadow_guard: status,
      divergence_class: divergenceClass,
      result: 'DIAGNOSTIC_ONLY',
    };
  }
}
