import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export type ClosureStatus = 'OPEN' | 'PARTIAL' | 'CONTAINED' | 'CLOSED' | 'BREAK_GLASS'
export type Relation = 'CALLS' | 'VALIDATES' | 'WRITES_PROOF' | 'CONSUMES_NONCE' | 'DEPENDS_ON_AUTHORITY' | 'DEPENDS_ON_CONTINUITY' | 'RECONCILES_WITH' | 'CLASSIFIES_FINALITY' | 'MUTATES_STATE' | 'REFERENCES_REGISTRY'

const TARGET_ROOTS = ['src', 'runtime', 'graph', 'docs', 'tests', '.github/workflows']
const CLASS_PATTERNS = ['authority','continuity','compile','validate','execute','proof','replay','reconciliation','finality','partition','registry','deploy','workflow']

export interface RuntimeNode { id:string; type:string; label:string; file_path:string; symbol:string; mutation_capable:boolean; authority_bound:boolean; continuity_bound:boolean; validator_bound:boolean; replay_safe:boolean; proof_generating:boolean; topology_visible:boolean; closure_status:ClosureStatus }
export interface RuntimeEdge { from:string; to:string; relation:Relation; evidence:string; file_path:string }
export interface RuntimeTopology { generated_at:string; nodes:RuntimeNode[]; edges:RuntimeEdge[] }

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
  if (lower.includes('mutation') || lower.includes('execute') || lower.includes('deploy')) return 'OPEN'
  if (lower.includes('validate') || lower.includes('proof') || lower.includes('replay')) return 'CONTAINED'
  return 'PARTIAL'
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

export function extractRuntimeTopology(repoRoot = process.cwd()): RuntimeTopology {
  const files = TARGET_ROOTS.flatMap((r) => walkFiles(join(repoRoot, r)))
  const nodes: RuntimeNode[] = []
  for (const f of files) {
    const rel = relative(repoRoot, f).replaceAll('\\', '/')
    const content = readFileSync(f, 'utf8')
    const type = nodeType(rel, content)
    const lower = `${rel}\n${content}`.toLowerCase()
    nodes.push({
      id: rel,
      type,
      label: rel,
      file_path: rel,
      symbol: rel.split('/').at(-1) ?? rel,
      mutation_capable: /\b(post|put|patch|delete|mutat|execute|deploy)\b/.test(lower),
      authority_bound: lower.includes('authority'),
      continuity_bound: lower.includes('continuity'),
      validator_bound: lower.includes('validate') || lower.includes('validator'),
      replay_safe: lower.includes('replay') && (lower.includes('block') || lower.includes('reject') || lower.includes('safe')),
      proof_generating: lower.includes('proof'),
      topology_visible: true,
      closure_status: classifyClosure(rel, content),
    })
  }

  const edges: RuntimeEdge[] = []
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const from = nodes[i]!
    const to = nodes[i + 1]!
    edges.push({ from: from.id, to: to.id, relation: relationFromNodeType(from.type), evidence: `${from.type} -> ${to.type}`, file_path: from.file_path })
  }

  return { generated_at: new Date().toISOString(), nodes, edges }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const topology = extractRuntimeTopology()
  writeFileSync(join(process.cwd(), 'graph/runtime-topology.sample.json'), `${JSON.stringify(topology, null, 2)}\n`)
}
