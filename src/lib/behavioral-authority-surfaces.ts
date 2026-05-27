import { createHash } from 'node:crypto'

export const creates_authority = false
export const replay_neutral = true
export const evidence_only = true

const CLASSIFICATIONS = {
  BEHAVIORAL_AUTHORITY_SURFACE: 'BEHAVIORAL_AUTHORITY_SURFACE',
  COGNITION_SHAPING_SURFACE: 'COGNITION_SHAPING_SURFACE',
  TOOL_ROUTING_SURFACE: 'TOOL_ROUTING_SURFACE',
  MEMORY_INHERITANCE_SURFACE: 'MEMORY_INHERITANCE_SURFACE',
  BOOTSTRAP_SURFACE: 'BOOTSTRAP_SURFACE',
  NON_GOVERNANCE_SURFACE: 'NON_GOVERNANCE_SURFACE'
}

function normalizePath(path = '') {
  return String(path).replace(/\\/g, '/').toLowerCase()
}

export function computeBehavioralSurfaceHash(content = '') {
  return createHash('sha256').update(String(content)).digest('hex')
}

export function classifyBehavioralAuthoritySurface(path, contentOrHash = '', metadata = {}) {
  const normalized = normalizePath(path)
  const surface_hash = metadata.surface_hash || computeBehavioralSurfaceHash(contentOrHash)
  const classification = classifyPath(normalized)
  const governance_relevance = classification !== CLASSIFICATIONS.NON_GOVERNANCE_SURFACE

  return {
    surface_id: normalized || 'unknown_surface',
    surface_path: path || '',
    surface_kind: 'OPENCLAW_BEHAVIORAL_TOPOLOGY_SURFACE',
    surface_hash,
    governance_relevance,
    mutation_capable: true,
    affects_execution_eligibility: governance_relevance,
    lineage_scope: governance_relevance ? 'behavioral_instruction_lineage' : 'none',
    classification,
    status: normalized ? 'CLASSIFIED' : 'NULL',
    reason: normalized ? 'deterministic_path_classification' : 'missing_surface_path',
    creates_authority,
    replay_neutral,
    evidence_only
  }
}

function classifyPath(normalized) {
  if (!normalized) return CLASSIFICATIONS.NON_GOVERNANCE_SURFACE
  if (normalized.endsWith('/agents.md') || normalized === 'agents.md') return CLASSIFICATIONS.BEHAVIORAL_AUTHORITY_SURFACE
  if (normalized.endsWith('/soul.md') || normalized === 'soul.md') return CLASSIFICATIONS.COGNITION_SHAPING_SURFACE
  if (normalized.endsWith('/tools.md') || normalized === 'tools.md') return CLASSIFICATIONS.TOOL_ROUTING_SURFACE
  if (normalized.endsWith('/heartbeat.md') || normalized === 'heartbeat.md') return CLASSIFICATIONS.MEMORY_INHERITANCE_SURFACE
  if (normalized.endsWith('/bootstrap.md') || normalized === 'bootstrap.md') return CLASSIFICATIONS.BOOTSTRAP_SURFACE
  if (normalized.includes('/memory/')) return CLASSIFICATIONS.MEMORY_INHERITANCE_SURFACE
  return CLASSIFICATIONS.NON_GOVERNANCE_SURFACE
}

export function isBehavioralAuthoritySurface(path) {
  return classifyPath(normalizePath(path)) !== CLASSIFICATIONS.NON_GOVERNANCE_SURFACE
}

export function classifyBehavioralMutationRisk(surface) {
  const normalized = normalizePath(surface?.surface_path || surface?.path || '')
  const classification = classifyPath(normalized)
  const riskLevel = classification === CLASSIFICATIONS.NON_GOVERNANCE_SURFACE ? 'LOW' : 'ELEVATED'
  return {
    classification,
    mutation_visibility: classification !== CLASSIFICATIONS.NON_GOVERNANCE_SURFACE,
    affects_execution_eligibility: classification !== CLASSIFICATIONS.NON_GOVERNANCE_SURFACE,
    deterministic: true,
    risk_level: riskLevel,
    creates_authority,
    replay_neutral,
    evidence_only
  }
}
