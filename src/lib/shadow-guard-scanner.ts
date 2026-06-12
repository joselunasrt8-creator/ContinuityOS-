export type ShadowGuardReviewStatus = 'PASS'
export type ShadowGuardDiagnosticStatus = 'PASS' | 'NULL'

export type ShadowGuardSurfaceKind =
  | 'filesystem_write'
  | 'filesystem_delete'
  | 'database_mutation'
  | 'network_mutation'
  | 'deployment_mutation'
  | 'package_script'

export type ShadowGuardFinding = {
  readonly finding_id: string
  readonly surface_id: string
  readonly file: string
  readonly surface_kind: ShadowGuardSurfaceKind
  readonly human_review: ShadowGuardReviewStatus
  readonly shadow_guard: ShadowGuardDiagnosticStatus
  readonly diagnostic_only: true
  readonly enforcement: false
  readonly branch_protection: false
  readonly authority_created: false
  readonly governance_runtime_state_mutation: false
  readonly reason: string
  readonly evidence: readonly string[]
}

export type ShadowGuardDivergenceEntry = {
  readonly divergence_id: string
  readonly finding_id: string
  readonly surface_id: string
  readonly human_review: ShadowGuardReviewStatus
  readonly shadow_guard: 'NULL'
  readonly diagnostic_only: true
  readonly enforcement: false
  readonly null_semantics: 'undeclared_or_insufficiently_classified_mutation_surface_detected'
  readonly blocks_execution: false
}

export type ShadowGuardDiagnosticArtifact = {
  readonly schema_version: 'shadow_guard_phase_a_diagnostic_v1'
  readonly phase: 'Phase A'
  readonly mode: 'diagnostic_demo'
  readonly diagnostic_only: true
  readonly enforcement: false
  readonly branch_protection: false
  readonly authority_created: false
  readonly governance_runtime_state_mutation: false
  readonly null_semantics: {
    readonly meaning: 'undeclared_or_insufficiently_classified_mutation_surface_detected'
    readonly blocks: false
    readonly enforces: false
    readonly emits_diagnostic_evidence_only: true
  }
  readonly summary: {
    readonly human_review_pass_count: number
    readonly shadow_guard_pass_count: number
    readonly shadow_guard_null_count: number
    readonly divergence_entry_count: number
  }
  readonly findings: readonly ShadowGuardFinding[]
  readonly divergence_registry_path: 'evidence/shadow-guard/legitimacy_divergence_registry.jsonl'
}

export type ShadowGuardSourceFile = {
  readonly file: string
  readonly text: string
}

type CandidateSurface = {
  readonly file: string
  readonly surface_kind: ShadowGuardSurfaceKind
  readonly evidence: readonly string[]
}

const MUTATION_PATTERNS: readonly [ShadowGuardSurfaceKind, RegExp][] = Object.freeze([
  ['filesystem_write', /\b(writeFileSync|appendFileSync|createWriteStream|mkdirSync|cpSync|copyFileSync|renameSync)\b/],
  ['filesystem_delete', /\b(rmSync|unlinkSync|rmdirSync)\b/],
  ['database_mutation', /\b(INSERT|UPDATE|DELETE|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE|\.run\()\b/i],
  ['network_mutation', /\bfetch\([^\n]*(POST|PUT|PATCH|DELETE)|method:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/],
  ['deployment_mutation', /\b(wrangler\s+deploy|wrangler\s+d1\s+migrations\s+apply|git\s+push|npm\s+publish)\b/],
])

const SUFFICIENT_DIAGNOSTIC_MARKERS: readonly RegExp[] = Object.freeze([
  /diagnostic[-_ ]only/i,
  /evidence[-_ ]only/i,
  /observability[-_ ]only/i,
  /enforcement:\s*false/,
  /readonly\s+enforcement:\s*false/,
])

function packageScriptSurfaces(packageJsonText: string): CandidateSurface[] {
  const packageJson = JSON.parse(packageJsonText) as {
    readonly scripts?: Record<string, string>
  }

  return Object.entries(packageJson.scripts ?? {})
    .filter(([, command]) => /\b(wrangler\s+deploy|wrangler\s+d1\s+migrations\s+apply|node\s+scripts\/shadow-guard\.mjs)\b/.test(command))
    .map(([scriptName, command]) => ({
      file: 'package.json',
      surface_kind: 'package_script' as const,
      evidence: [`script:${scriptName}`, command],
    }))
}

function sourceFileSurfaces(sourceFile: ShadowGuardSourceFile): CandidateSurface[] {
  const { file, text } = sourceFile
  if (file === 'package.json') return []
  const surfaces: CandidateSurface[] = []

  for (const [surface_kind, pattern] of MUTATION_PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    surfaces.push({
      file,
      surface_kind,
      evidence: [match[0]],
    })
  }

  return surfaces
}

function isSufficientlyClassified(surface: CandidateSurface, sourceTextByFile: ReadonlyMap<string, string>): boolean {
  if (surface.file === 'package.json' && surface.evidence.includes('script:shadow-guard:demo')) {
    return true
  }

  const text = surface.file === 'package.json'
    ? surface.evidence.join('\n')
    : sourceTextByFile.get(surface.file) ?? ''

  return SUFFICIENT_DIAGNOSTIC_MARKERS.some((marker) => marker.test(text))
}

function findingId(index: number): string {
  return `shadow_guard_phase_a_finding_${String(index + 1).padStart(4, '0')}`
}

function surfaceId(surface: CandidateSurface): string {
  const evidenceKey = surface.evidence.join('|').replace(/\s+/g, ' ').slice(0, 96)
  return `${surface.surface_kind}:${surface.file}:${evidenceKey}`
}

export function scanShadowGuardSurfaces(input: {
  readonly packageJsonText: string
  readonly sourceFiles: readonly ShadowGuardSourceFile[]
}): ShadowGuardFinding[] {
  const sourceTextByFile = new Map(input.sourceFiles.map((sourceFile) => [sourceFile.file, sourceFile.text] as const))
  const surfaces = [
    ...packageScriptSurfaces(input.packageJsonText),
    ...input.sourceFiles.flatMap((sourceFile) => sourceFileSurfaces(sourceFile)),
  ].sort((a, b) => `${a.file}:${a.surface_kind}:${a.evidence.join('|')}`.localeCompare(`${b.file}:${b.surface_kind}:${b.evidence.join('|')}`))

  return surfaces.map((surface, index) => {
    const sufficientlyClassified = isSufficientlyClassified(surface, sourceTextByFile)
    const shadow_guard: ShadowGuardDiagnosticStatus = sufficientlyClassified ? 'PASS' : 'NULL'

    return {
      finding_id: findingId(index),
      surface_id: surfaceId(surface),
      file: surface.file,
      surface_kind: surface.surface_kind,
      human_review: 'PASS',
      shadow_guard,
      diagnostic_only: true,
      enforcement: false,
      branch_protection: false,
      authority_created: false,
      governance_runtime_state_mutation: false,
      reason: sufficientlyClassified
        ? 'mutation surface is explicitly marked as diagnostic/evidence/observability only for this Phase A scan'
        : 'undeclared or insufficiently classified mutation surface detected; NULL is diagnostic evidence only',
      evidence: surface.evidence,
    }
  })
}

export function divergenceEntriesFor(findings: readonly ShadowGuardFinding[]): ShadowGuardDivergenceEntry[] {
  return findings
    .filter((finding) => finding.shadow_guard === 'NULL')
    .map((finding, index) => ({
      divergence_id: `shadow_guard_phase_a_divergence_${String(index + 1).padStart(4, '0')}`,
      finding_id: finding.finding_id,
      surface_id: finding.surface_id,
      human_review: 'PASS',
      shadow_guard: 'NULL',
      diagnostic_only: true,
      enforcement: false,
      null_semantics: 'undeclared_or_insufficiently_classified_mutation_surface_detected',
      blocks_execution: false,
    }))
}

export function buildShadowGuardDiagnostic(input: {
  readonly packageJsonText: string
  readonly sourceFiles: readonly ShadowGuardSourceFile[]
}): ShadowGuardDiagnosticArtifact {
  const findings = scanShadowGuardSurfaces(input)
  const divergences = divergenceEntriesFor(findings)

  return {
    schema_version: 'shadow_guard_phase_a_diagnostic_v1',
    phase: 'Phase A',
    mode: 'diagnostic_demo',
    diagnostic_only: true,
    enforcement: false,
    branch_protection: false,
    authority_created: false,
    governance_runtime_state_mutation: false,
    null_semantics: {
      meaning: 'undeclared_or_insufficiently_classified_mutation_surface_detected',
      blocks: false,
      enforces: false,
      emits_diagnostic_evidence_only: true,
    },
    summary: {
      human_review_pass_count: findings.filter((finding) => finding.human_review === 'PASS').length,
      shadow_guard_pass_count: findings.filter((finding) => finding.shadow_guard === 'PASS').length,
      shadow_guard_null_count: divergences.length,
      divergence_entry_count: divergences.length,
    },
    findings,
    divergence_registry_path: 'evidence/shadow-guard/legitimacy_divergence_registry.jsonl',
  }
}
