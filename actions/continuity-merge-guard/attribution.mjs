// actions/continuity-merge-guard/attribution.mjs
// ContinuityOS Agent Identity — Phase 1 (CI / Merge Guard plane).
//
// Turns available PR / workflow metadata into a normalized, descriptive
// actor-attribution object. This is an ATTRIBUTION layer, not an execution
// surface, not an authority class, and not a runtime route:
//
//   - It does NOT alter merge execution semantics.
//   - It does NOT grant merge permission (attribution != authority).
//   - It does NOT touch the canonical object-identity payload or its hash.
//
// Classification follows governance/merge-legitimacy/AGENT_ATTRIBUTION_SPEC.json
// (#2003): AUTHORITATIVE signals (pr_label, pr_body_metadata_block,
// commit_trailer) decide the class; SUPPORTING / HEURISTIC signals only
// corroborate or are recorded as context. Conflicting authoritative signals are
// UNKNOWN/ambiguous and fail closed — never silently upgraded.
//
// Phase 1 gate policy (the binding the spec deferred to policy_binding_note):
//   identity_present   -> continue (non-blocking; classification recorded)
//   identity_missing   -> PARTIAL, non-blocking (ordinary human PRs are NOT blocked)
//   identity_ambiguous -> NULL    (conflicting attribution could create false legitimacy)

import { canonicalize, sha256Hex } from './canonical.mjs'

// Recognized agent-session branch prefixes (heuristic tier only — never
// authoritative on their own, per the spec).
const AGENT_BRANCH_PREFIXES = ['claude/', 'codex/', 'cursor/', 'devin/', 'copilot/']

// Map a declared marker value to a normalized attribution class.
const DECLARATION_MAP = {
  agent_authored: 'AGENT_AUTHORED',
  'agent-authored': 'AGENT_AUTHORED',
  agent: 'AGENT_AUTHORED',
  agent_assisted: 'AGENT_ASSISTED',
  'agent-assisted': 'AGENT_ASSISTED',
  assisted: 'AGENT_ASSISTED',
  human_authored: 'HUMAN_AUTHORED',
  'human-authored': 'HUMAN_AUTHORED',
  human: 'HUMAN_AUTHORED',
}

function str(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeDeclaration(raw) {
  const key = str(raw).toLowerCase().replace(/\s+/g, '_')
  return DECLARATION_MAP[key] || null
}

// Split a comma- or newline-separated list into trimmed, non-empty tokens.
function splitList(raw) {
  return str(raw)
    .split(/[,\n]/)
    .map(t => t.trim())
    .filter(Boolean)
}

function isBotLogin(login) {
  return /\[bot\]$/i.test(str(login))
}

// ── Signal extraction ────────────────────────────────────────────────────────
// Each extractor returns zero or more evidence entries:
//   { signal_id, tier, value, declares }
// where `declares` is a normalized class or null (signal present but no class).

function fromLabels(labels) {
  const evidence = []
  for (const label of splitList(labels)) {
    const declares = normalizeDeclaration(label)
    if (declares) evidence.push({ signal_id: 'pr_label', tier: 'authoritative', value: label, declares })
  }
  return evidence
}

// Parse a fenced/HTML-comment attribution block in the PR body, e.g.
//   <!-- attribution
//   attribution: AGENT_AUTHORED
//   agent_id: agent:continuityos-session-123
//   operator_id: github-user
//   -->
function fromBody(body) {
  const text = str(body)
  if (!text) return { evidence: [], agent_id: '', operator_id: '' }
  const attrMatch = text.match(/attribution\s*[:=]\s*([A-Za-z_-]+)/i)
  const agentMatch = text.match(/agent_id\s*[:=]\s*([^\s<>]+)/i)
  const operatorMatch = text.match(/operator_id\s*[:=]\s*([^\s<>]+)/i)
  const evidence = []
  if (attrMatch) {
    const declares = normalizeDeclaration(attrMatch[1])
    if (declares) {
      evidence.push({ signal_id: 'pr_body_metadata_block', tier: 'authoritative', value: attrMatch[1], declares })
    }
  }
  return {
    evidence,
    agent_id: agentMatch ? agentMatch[1] : '',
    operator_id: operatorMatch ? operatorMatch[1] : '',
  }
}

// Parse structured commit trailers (newline-separated), e.g.
//   Agent-Authored-By: agent:claude-code
//   Agent-Assisted-By: ...
function fromTrailers(trailers) {
  const evidence = []
  let agent_id = ''
  for (const line of str(trailers).split('\n')) {
    const m = line.match(/^(Agent-Authored-By|Agent-Assisted-By)\s*:\s*(.+)$/i)
    if (!m) continue
    const declares = /assisted/i.test(m[1]) ? 'AGENT_ASSISTED' : 'AGENT_AUTHORED'
    const value = m[2].trim()
    evidence.push({ signal_id: 'commit_trailer', tier: 'authoritative', value, declares })
    if (declares === 'AGENT_AUTHORED' && !agent_id) agent_id = value
  }
  return { evidence, agent_id }
}

function fromBranch(headRef) {
  const ref = str(headRef)
  const prefix = AGENT_BRANCH_PREFIXES.find(p => ref.toLowerCase().startsWith(p))
  if (!prefix) return []
  return [{ signal_id: 'branch_naming_convention', tier: 'heuristic', value: ref, declares: null }]
}

// ── Classification ───────────────────────────────────────────────────────────
// input: { actor, pr_author, head_ref, pr_body, pr_labels, commit_trailers, operator_id }
export function classifyAttribution(input = {}) {
  const actor = str(input.actor)
  const prAuthor = str(input.pr_author) || actor

  const body = fromBody(input.pr_body)
  const trailers = fromTrailers(input.commit_trailers)

  const evidence = [
    ...fromLabels(input.pr_labels),
    ...body.evidence,
    ...trailers.evidence,
    ...fromBranch(input.head_ref),
  ]

  // Supporting signals: the GitHub actor / PR author login.
  const botDetected = isBotLogin(actor) || isBotLogin(prAuthor)
  if (actor) {
    evidence.push({
      signal_id: 'github_actor_or_bot_account',
      tier: 'supporting',
      value: actor,
      declares: botDetected ? 'BOT' : null,
    })
  }

  const authoritativeClasses = [
    ...new Set(evidence.filter(e => e.tier === 'authoritative' && e.declares).map(e => e.declares)),
  ]

  let attribution_classification
  let actor_kind
  let confidence
  let attribution_status
  let attribution_source

  if (authoritativeClasses.length > 1) {
    // Conflicting authoritative declarations — never guess. Fail closed.
    attribution_classification = 'UNKNOWN'
    actor_kind = 'unknown'
    confidence = 'ambiguous'
    attribution_status = 'identity_ambiguous'
    attribution_source = 'declared'
  } else if (authoritativeClasses.length === 1) {
    attribution_classification = authoritativeClasses[0]
    actor_kind = attribution_classification === 'AGENT_AUTHORED' ? 'agent' : 'human'
    confidence = 'declared'
    attribution_status = 'identity_present'
    // Source = which authoritative signal drove it.
    const driver = evidence.find(e => e.tier === 'authoritative' && e.declares === attribution_classification)
    attribution_source = driver && driver.signal_id === 'commit_trailer' ? 'commit_metadata' : 'declared'
  } else if (botDetected) {
    // Observed bot account, no authoritative authorship claim.
    attribution_classification = 'UNKNOWN'
    actor_kind = 'bot'
    confidence = 'observed'
    attribution_status = 'identity_present'
    attribution_source = 'workflow_actor'
  } else {
    // No authoritative signal (heuristic-only resolves to UNKNOWN per spec).
    attribution_classification = 'UNKNOWN'
    actor_kind = 'unknown'
    const heuristicOnly = evidence.some(e => e.tier === 'heuristic')
    confidence = heuristicOnly ? 'inferred' : 'observed'
    attribution_status = 'identity_missing'
    attribution_source = 'pr_metadata'
  }

  // Resolve actor_id / operator_id.
  const agentId = body.agent_id || trailers.agent_id
  let actor_id
  if (actor_kind === 'agent') actor_id = agentId || actor || 'unknown'
  else actor_id = actor || prAuthor || 'unknown'

  let operator_id = str(input.operator_id) || body.operator_id || null
  if (!operator_id && actor_kind === 'agent' && actor && !isBotLogin(actor)) {
    // Agent driven through a human's authenticated account.
    operator_id = actor
  }

  const attribution_evidence_hash = sha256Hex(canonicalize(evidence))

  return {
    actor_attribution: {
      actor_kind,
      actor_id,
      operator_id,
      attribution_source,
      confidence,
      evidence,
    },
    attribution_classification,
    attribution_status,
    attribution_evidence_hash,
  }
}
