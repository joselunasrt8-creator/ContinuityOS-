import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export type ClosureStatus = 'OPEN' | 'PARTIAL' | 'CONTAINED' | 'CLOSED' | 'BREAK_GLASS'
export type Relation = 'CALLS' | 'VALIDATES' | 'WRITES_PROOF' | 'CONSUMES_NONCE' | 'DEPENDS_ON_AUTHORITY' | 'DEPENDS_ON_CONTINUITY' | 'RECONCILES_WITH' | 'CLASSIFIES_FINALITY' | 'MUTATES_STATE' | 'REFERENCES_REGISTRY'
export type ArtifactRole = 'runtime' | 'workflow' | 'script' | 'migration' | 'test' | 'fixture' | 'doc' | 'generated' | 'topology_metadata' | 'config' | 'unknown'
export type RiskScope = 'production_runtime' | 'governance_runtime' | 'ci_workflow' | 'test_only' | 'documentation_only' | 'metadata_only' | 'generated_only' | 'unknown'

const TARGET_ROOTS = ['src', 'runtime', 'graph', 'docs', 'tests', '.github/workflows']
const CLASS_PATTERNS = ['authority','continuity','compile','validate','execute','proof','replay','reconciliation','finality','partition','registry','deploy','workflow']

export interface RuntimeNode { id:string; type:string; label:string; file_path:string; symbol:string; mutation_capable:boolean; authority_bound:boolean; continuity_bound:boolean; validator_bound:boolean; replay_safe:boolean; proof_generating:boolean; topology_visible:boolean; closure_status:ClosureStatus; artifact_role:ArtifactRole; risk_scope:RiskScope; production_closure_relevant:boolean }
export interface RuntimeEdge { from:string; to:string; relation:Relation; evidence:string; file_path:string }
export interface RuntimeTopologySummary {
  closure_status_counts_all: Record<ClosureStatus, number>
  closure_status_counts_production_relevant: Record<ClosureStatus, number>
  artifact_role_counts: Record<ArtifactRole, number>
  risk_scope_counts: Record<RiskScope, number>
  mutation_surface_counts_by_role: Record<ArtifactRole, number>
}
export interface RuntimeTopology { generated_at:string; nodes:RuntimeNode[]; edges:RuntimeEdge[]; summary: RuntimeTopologySummary }

function walkFiles(root:string): string[] {
  const out:string[] = []
  const walk=(dir:string)=>{ for(const e of readdirSync(dir)){ const p=join(dir,e); const s=statSync(p); if(s.isDirectory()) walk(p); else out.push(p) } }
  if (statSync(root).isDirectory()) walk(root)
  return out
}

function nodeType(filePath:string, content:string): string {
  const lower = `${filePath}\n${content}`.toLowerCase()
  const hit = CLASS_PATTERNS.find((p) => lower.includes(p))
  return hit ?? 'topology'
}

function classifyClosure(filePath:string, content:string): ClosureStatus {
  const lower = `${filePath}\n${content}`.toLowerCase()
  if (lower.includes('break_glass')) return 'BREAK_GLASS'
  if (lower.includes('fail-closed') || lower.includes('non-bypassability') || lower.includes('cannot')) return 'CLOSED'
  if (lower.includes('validate') || lower.includes('proof') || lower.includes('replay')) return 'CONTAINED'
  if (lower.includes('mutation') || lower.includes('execute') || lower.includes('deploy')) return 'OPEN'
  return 'PARTIAL'
}

function extractWorkflowReplayFeatures(lower:string): { replayIdentity:boolean; lineageBinding:boolean; proofProvenanceLink:boolean } {
  const replayIdentity = [
    'workflow_run.id',
    'decision_id',
    'nonce',
    'duplicate',
    'replay',
  ].some((token) => lower.includes(token))

  const lineageBinding = [
    'github.sha',
    'github.ref',
    'lineage',
    'rollback',
    'constitutional',
    'sco',
  ].some((token) => lower.includes(token))

  const proofProvenanceLink = [
    'proof',
    'provenance',
    'attest',
    'decision_id',
  ].some((token) => lower.includes(token))

  return { replayIdentity, lineageBinding, proofProvenanceLink }
}

function replaySafeFromSignals(lower:string, role: ArtifactRole): boolean {
  const rejectionSignals = ['reject', 'block', 'invalid', 'mismatch', 'stale']
  const replaySignals = ['replay', 'duplicate', 'nonce', 'workflow_run.id', 'decision_id']
  const lineageSignals = ['lineage', 'rollback', 'provenance', 'github.sha']
  const hasRejection = rejectionSignals.some((token) => lower.includes(token))
  const hasReplaySemantics = replaySignals.some((token) => lower.includes(token))
  const hasLineageSemantics = lineageSignals.some((token) => lower.includes(token))

  if (role === 'workflow') {
    const wf = extractWorkflowReplayFeatures(lower)
    return (wf.replayIdentity && hasRejection) || (wf.lineageBinding && wf.proofProvenanceLink && hasReplaySemantics)
  }
  return hasReplaySemantics && (hasRejection || hasLineageSemantics || lower.includes('safe'))
}

function classifyArtifactRole(filePath: string): ArtifactRole {
  if (filePath.startsWith('.github/workflows/')) return 'workflow'
  if (filePath.startsWith('tests/fixtures/')) return 'fixture'
  if (filePath.startsWith('tests/')) return 'test'
  if (filePath.startsWith('docs/')) return 'doc'
  if (filePath.startsWith('migrations/')) return 'migration'
  if (filePath === 'graph/runtime-topology.sample.json') return 'generated'
  if (filePath.startsWith('graph/') && filePath.endsWith('.json')) return 'topology_metadata'
  if (filePath.startsWith('runtime/topology/') && filePath.endsWith('.json')) return 'topology_metadata'
  if (filePath.startsWith('runtime/') && filePath.endsWith('.json')) return 'topology_metadata'
  if (filePath === 'runtime/bypass_paths.json') return 'topology_metadata'
  if (filePath.endsWith('.config.js') || filePath.endsWith('.config.ts') || filePath === 'wrangler.toml' || filePath === 'package.json' || filePath === 'tsconfig.json') return 'config'
  if (filePath.startsWith('scripts/')) return 'script'
  if (filePath.startsWith('src/')) return 'runtime'
  return 'unknown'
}

function riskScopeFromRole(role: ArtifactRole): RiskScope {
  if (role === 'runtime' || role === 'script' || role === 'migration' || role === 'config') return 'production_runtime'
  if (role === 'workflow') return 'ci_workflow'
  if (role === 'test' || role === 'fixture') return 'test_only'
  if (role === 'doc') return 'documentation_only'
  if (role === 'topology_metadata') return 'metadata_only'
  if (role === 'generated') return 'generated_only'
  return 'unknown'
}

function productionClosureRelevant(role: ArtifactRole, mutationCapable: boolean): boolean {
  if (role === 'test' || role === 'fixture' || role === 'doc' || role === 'generated' || role === 'topology_metadata') return false
  if (role === 'config') return mutationCapable
  return role === 'runtime' || role === 'workflow' || role === 'script' || role === 'migration'
}

function relationFromNodeType(type:string): Relation {
  if (type === 'validate') return 'VALIDATES'
  if (type === 'proof') return 'WRITES_PROOF'
  if (type === 'replay') return 'CONSUMES_NONCE'
  if (type === 'authority') return 'DEPENDS_ON_AUTHORITY'
  if (type === 'continuity') return 'DEPENDS_ON_CONTINUITY'
  if (type === 'reconciliation') return 'RECONCILES_WITH'
  if (type === 'finality' || type === 'partition') return 'CLASSIFIES_FINALITY'
  if (type === 'registry') return 'REFERENCES_REGISTRY'
  if (type === 'execute' || type === 'deploy') return 'MUTATES_STATE'
  return 'CALLS'
}

function emptyCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return keys.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as Record<T, number>)
}

export function extractRuntimeTopology(repoRoot = process.cwd()): RuntimeTopology {
  const files = TARGET_ROOTS.flatMap((r) => walkFiles(join(repoRoot, r)))
  const nodes: RuntimeNode[] = []
  for (const f of files) {
    const rel = relative(repoRoot, f).replaceAll('\\', '/')
    const content = readFileSync(f, 'utf8')
    const type = nodeType(rel, content)
    const lower = `${rel}\n${content}`.toLowerCase()
    const mutation_capable = /\b(post|put|patch|delete|mutat|execute|deploy)\b/.test(lower)
    const artifact_role = classifyArtifactRole(rel)
    const risk_scope = riskScopeFromRole(artifact_role)
    nodes.push({
      id: rel,
      type,
      label: rel,
      file_path: rel,
      symbol: rel.split('/').at(-1) ?? rel,
      mutation_capable,
      authority_bound: lower.includes('authority'),
      continuity_bound: lower.includes('continuity'),
      validator_bound: lower.includes('validate') || lower.includes('validator'),
      replay_safe: replaySafeFromSignals(lower, artifact_role),
      proof_generating: lower.includes('proof'),
      topology_visible: true,
      closure_status: classifyClosure(rel, content),
      artifact_role,
      risk_scope,
      production_closure_relevant: productionClosureRelevant(artifact_role, mutation_capable),
    })
  }

  const edges: RuntimeEdge[] = []
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const from = nodes[i]!
    const to = nodes[i + 1]!
    edges.push({ from: from.id, to: to.id, relation: relationFromNodeType(from.type), evidence: `${from.type} -> ${to.type}`, file_path: from.file_path })
  }

  const closureKeys = ['OPEN','PARTIAL','CONTAINED','CLOSED','BREAK_GLASS'] as const
  const roleKeys = ['runtime','workflow','script','migration','test','fixture','doc','generated','topology_metadata','config','unknown'] as const
  const riskKeys = ['production_runtime','governance_runtime','ci_workflow','test_only','documentation_only','metadata_only','generated_only','unknown'] as const

  const summary: RuntimeTopologySummary = {
    closure_status_counts_all: emptyCounts(closureKeys),
    closure_status_counts_production_relevant: emptyCounts(closureKeys),
    artifact_role_counts: emptyCounts(roleKeys),
    risk_scope_counts: emptyCounts(riskKeys),
    mutation_surface_counts_by_role: emptyCounts(roleKeys),
  }

  for (const n of nodes) {
    summary.closure_status_counts_all[n.closure_status] += 1
    if (n.production_closure_relevant) summary.closure_status_counts_production_relevant[n.closure_status] += 1
    summary.artifact_role_counts[n.artifact_role] += 1
    summary.risk_scope_counts[n.risk_scope] += 1
    if (n.mutation_capable) summary.mutation_surface_counts_by_role[n.artifact_role] += 1
  }

  return { generated_at: new Date().toISOString(), nodes, edges, summary }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const topology = extractRuntimeTopology()
  writeFileSync(join(process.cwd(), 'graph/runtime-topology.sample.json'), `${JSON.stringify(topology, null, 2)}\n`)
}
