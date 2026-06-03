/**
 * src/visualizer/topology-graph-viewer.ts
 * Issue #1813 — Runtime Topology Graph Viewer
 *
 * Pure, read-only, evidence-only static visualization helpers for existing
 * topology graph artifacts. These functions normalize graph data, compute a
 * deterministic SVG lane layout, and render a static HTML string. They do not
 * write files, fetch data, create authority, or expose mutation behavior.
 */

export type TopologyGraphNode = {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly closure_status?: string
  readonly artifact_role?: string
  readonly topology_observations: readonly string[]
  readonly observations: Readonly<Record<string, string | number | boolean>>
}

export type TopologyGraphEdge = {
  readonly from: string
  readonly to: string
  readonly relation: string
  readonly evidence?: string
  readonly observations: Readonly<Record<string, string | number | boolean>>
}

export type NormalizedTopologyGraph = {
  readonly evidence_only: true
  readonly read_only: true
  readonly observational: true
  readonly generated_at?: string
  readonly nodes: readonly TopologyGraphNode[]
  readonly edges: readonly TopologyGraphEdge[]
  readonly summary: Readonly<Record<string, unknown>>
}

export type TopologyGraphLayoutNode = TopologyGraphNode & {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly lane: string
}

export type TopologyGraphLayoutEdge = TopologyGraphEdge & {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly labelX: number
  readonly labelY: number
}

export type TopologyGraphLayout = {
  readonly graph: NormalizedTopologyGraph
  readonly width: number
  readonly height: number
  readonly lanes: readonly { readonly type: string; readonly x: number; readonly count: number }[]
  readonly nodes: readonly TopologyGraphLayoutNode[]
  readonly edges: readonly TopologyGraphLayoutEdge[]
}

type UnknownRecord = Record<string, unknown>

const NODE_WIDTH = 240
const NODE_HEIGHT = 72
const LANE_GAP = 96
const ROW_GAP = 36
const MARGIN = 48
const HEADER_HEIGHT = 120
const SUMMARY_HEIGHT = 150

const NODE_OBSERVATION_KEYS = [
  'file_path',
  'symbol',
  'mutation_capable',
  'authority_bound',
  'continuity_bound',
  'validator_bound',
  'replay_safe',
  'proof_generating',
  'topology_visible',
  'risk_scope',
  'production_closure_relevant',
] as const

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = 'unknown'): string {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function scalarObservation(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return null
}

function collectNodeObservations(node: UnknownRecord): Readonly<Record<string, string | number | boolean>> {
  const observations: Record<string, string | number | boolean> = {}
  for (const key of NODE_OBSERVATION_KEYS) {
    const value = scalarObservation(node[key])
    if (value !== null) observations[key] = value
  }
  return observations
}

function collectEdgeObservations(edge: UnknownRecord): Readonly<Record<string, string | number | boolean>> {
  const observations: Record<string, string | number | boolean> = {}
  for (const key of Object.keys(edge).sort()) {
    if (key === 'from' || key === 'source' || key === 'to' || key === 'target' || key === 'relation' || key === 'type') {
      continue
    }
    const value = scalarObservation(edge[key])
    if (value !== null) observations[key] = value
  }
  return observations
}

function normalizeNodes(input: UnknownRecord): TopologyGraphNode[] {
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : []
  const nodeById = new Map<string, TopologyGraphNode>()

  for (const rawNode of rawNodes) {
    if (!isRecord(rawNode)) continue
    const id = stringValue(rawNode.id ?? rawNode.key ?? rawNode.path, '')
    if (id.length === 0) continue

    const type = stringValue(rawNode.type ?? rawNode.kind ?? rawNode.category, 'unknown')
    const label = stringValue(rawNode.label ?? rawNode.name ?? rawNode.file_path ?? id, id)
    const closureStatus = scalarObservation(rawNode.closure_status)
    const artifactRole = scalarObservation(rawNode.artifact_role)
    const topologyObservations = [
      `node_type:${type}`,
      closureStatus === null ? null : `closure_status:${closureStatus}`,
      artifactRole === null ? null : `artifact_role:${artifactRole}`,
      scalarObservation(rawNode.topology_visible) === null ? null : `topology_visible:${rawNode.topology_visible}`,
    ].filter((value): value is string => typeof value === 'string')

    nodeById.set(id, {
      id,
      type,
      label,
      closure_status: typeof closureStatus === 'string' ? closureStatus : undefined,
      artifact_role: typeof artifactRole === 'string' ? artifactRole : undefined,
      topology_observations: topologyObservations,
      observations: collectNodeObservations(rawNode),
    })
  }

  return [...nodeById.values()].sort(compareNodes)
}

function normalizeEdges(input: UnknownRecord, nodeIds: ReadonlySet<string>): TopologyGraphEdge[] {
  const rawEdges = Array.isArray(input.edges) ? input.edges : []
  const edges: TopologyGraphEdge[] = []

  for (const rawEdge of rawEdges) {
    if (!isRecord(rawEdge)) continue
    const from = stringValue(rawEdge.from ?? rawEdge.source, '')
    const to = stringValue(rawEdge.to ?? rawEdge.target, '')
    if (from.length === 0 || to.length === 0) continue
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue

    edges.push({
      from,
      to,
      relation: stringValue(rawEdge.relation ?? rawEdge.type, 'RELATED_TO'),
      evidence: typeof rawEdge.evidence === 'string' ? rawEdge.evidence : undefined,
      observations: collectEdgeObservations(rawEdge),
    })
  }

  return edges.sort(compareEdges)
}

function compareNodes(a: TopologyGraphNode, b: TopologyGraphNode): number {
  return a.type.localeCompare(b.type) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
}

function compareEdges(a: TopologyGraphEdge, b: TopologyGraphEdge): number {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.relation.localeCompare(b.relation)
}

function cloneSummary(summary: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(summary)) return {}
  return Object.fromEntries(Object.keys(summary).sort().map((key) => [key, summary[key]]))
}

/**
 * Normalize an existing topology graph artifact without changing its semantics.
 */
export function normalizeTopologyGraph(input: unknown): NormalizedTopologyGraph {
  const source = isRecord(input) ? input : {}
  const nodes = normalizeNodes(source)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = normalizeEdges(source, nodeIds)
  const generatedAt = typeof source.generated_at === 'string' ? source.generated_at : undefined

  return {
    evidence_only: true,
    read_only: true,
    observational: true,
    ...(generatedAt ? { generated_at: generatedAt } : {}),
    nodes,
    edges,
    summary: cloneSummary(source.summary),
  }
}

// Canonical runtime lifecycle ordering for lane placement.
// Types matching this list appear in lifecycle sequence; remaining types follow alphabetically.
const CANONICAL_TYPE_ORDER = ['session', 'continuity', 'authority', 'compile', 'validate', 'execute', 'proof']

function sortTypes(rawTypes: string[]): string[] {
  return [...rawTypes].sort((a, b) => {
    const ai = CANONICAL_TYPE_ORDER.indexOf(a)
    const bi = CANONICAL_TYPE_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
}

/**
 * Compute a deterministic grouped-column SVG layout by node type.
 * Canonical lifecycle types (session → continuity → authority → compile → validate → execute → proof)
 * appear as left-to-right lanes in lifecycle order; remaining types follow alphabetically.
 */
export function layoutTopologyGraph(graph: NormalizedTopologyGraph): TopologyGraphLayout {
  const normalized = normalizeTopologyGraph(graph)
  const types = sortTypes([...new Set(normalized.nodes.map((node) => node.type))])
  const laneIndex = new Map(types.map((type, index) => [type, index]))
  const rowByType = new Map<string, number>()
  const layoutNodeById = new Map<string, TopologyGraphLayoutNode>()
  const layoutNodes: TopologyGraphLayoutNode[] = []

  for (const node of normalized.nodes) {
    const lane = laneIndex.get(node.type) ?? 0
    const row = rowByType.get(node.type) ?? 0
    rowByType.set(node.type, row + 1)

    const layoutNode: TopologyGraphLayoutNode = {
      ...node,
      x: MARGIN + lane * (NODE_WIDTH + LANE_GAP),
      y: HEADER_HEIGHT + row * (NODE_HEIGHT + ROW_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      lane: node.type,
    }
    layoutNodes.push(layoutNode)
    layoutNodeById.set(node.id, layoutNode)
  }

  const layoutEdges = normalized.edges
    .map((edge) => {
      const from = layoutNodeById.get(edge.from)
      const to = layoutNodeById.get(edge.to)
      if (!from || !to) return null
      const x1 = from.x + from.width / 2
      const y1 = from.y + from.height
      const x2 = to.x + to.width / 2
      const y2 = to.y
      return {
        ...edge,
        x1,
        y1,
        x2,
        y2,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 6,
      }
    })
    .filter((edge): edge is TopologyGraphLayoutEdge => edge !== null)

  const maxRows = Math.max(1, ...types.map((type) => rowByType.get(type) ?? 0))
  const width = Math.max(720, MARGIN * 2 + Math.max(1, types.length) * NODE_WIDTH + Math.max(0, types.length - 1) * LANE_GAP)
  const height = HEADER_HEIGHT + maxRows * (NODE_HEIGHT + ROW_GAP) + SUMMARY_HEIGHT

  return {
    graph: normalized,
    width,
    height,
    lanes: types.map((type) => ({ type, x: MARGIN + (laneIndex.get(type) ?? 0) * (NODE_WIDTH + LANE_GAP), count: rowByType.get(type) ?? 0 })),
    nodes: layoutNodes,
    edges: layoutEdges,
  }
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Serialize a value as JSON that is safe to embed inside an HTML <script> block.
 * HTML parsers treat </script> as a tag boundary even inside quoted JS strings, so
 * < and > are replaced with their Unicode escape sequences (< / >).
 * The result must NOT be passed through escapeHtml — it is already script-safe.
 */
export function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
}

function renderObservationList(observations: Readonly<Record<string, string | number | boolean>>): string {
  const entries = Object.keys(observations).sort()
  if (entries.length === 0) return '<li>observation:none</li>'
  return entries.map((key) => `<li>${escapeHtml(key)}: ${escapeHtml(observations[key])}</li>`).join('')
}

function renderSummary(summary: Readonly<Record<string, unknown>>): string {
  const keys = Object.keys(summary).sort()
  if (keys.length === 0) return '<li>summary:none</li>'
  return keys
    .map((key) => `<li><strong>${escapeHtml(key)}</strong>: <code>${escapeHtml(JSON.stringify(summary[key]))}</code></li>`)
    .join('')
}

/**
 * Render a static, read-only, evidence-only topology graph viewer as an HTML string.
 */
export function renderTopologyGraphHtml(graph: NormalizedTopologyGraph): string {
  const layout = layoutTopologyGraph(graph)
  const laneLabels = layout.lanes
    .map((lane) => `<text class="lane-label" x="${lane.x}" y="96">${escapeHtml(lane.type)} (${lane.count})</text>`)
    .join('')
  const edgeMarkup = layout.edges
    .map(
      (edge, index) => `
        <g class="edge" data-relation="${escapeHtml(edge.relation)}">
          <path id="edge-${index}" d="M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}" marker-end="url(#arrow)" />
          <text class="edge-label" x="${edge.labelX}" y="${edge.labelY}">${escapeHtml(edge.relation)}</text>
          <title>${escapeHtml(edge.from)} → ${escapeHtml(edge.to)} | relation:${escapeHtml(edge.relation)}${edge.evidence ? ` | evidence:${escapeHtml(edge.evidence)}` : ''}</title>
        </g>`,
    )
    .join('')
  const nodeMarkup = layout.nodes
    .map(
      (node) => `
        <g class="node" data-node-id="${escapeHtml(node.id)}" data-node-type="${escapeHtml(node.type)}">
          <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="10" />
          <text class="node-type" x="${node.x + 12}" y="${node.y + 20}">${escapeHtml(node.type)}</text>
          <text class="node-label" x="${node.x + 12}" y="${node.y + 42}">${escapeHtml(node.label)}</text>
          <text class="node-observation" x="${node.x + 12}" y="${node.y + 62}">closure:${escapeHtml(node.closure_status ?? 'unknown')} role:${escapeHtml(node.artifact_role ?? 'unknown')}</text>
          <title>${escapeHtml(node.topology_observations.join(' | '))}</title>
        </g>`,
    )
    .join('')

  const nodeObservationMarkup = layout.nodes
    .map(
      (node) => `<section class="observation-card"><h3>${escapeHtml(node.label)}</h3><p>EVIDENCE_ONLY observation. No legitimacy, authority, execution eligibility, or convergence is asserted.</p><ul><li>closure_status: ${escapeHtml(node.closure_status ?? 'unknown')}</li><li>artifact_role: ${escapeHtml(node.artifact_role ?? 'unknown')}</li>${renderObservationList(node.observations)}</ul></section>`,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Runtime Topology Graph Viewer — EVIDENCE_ONLY READ_ONLY OBSERVATIONAL</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f8fafc; color: #0f172a; }
    main { padding: 24px; }
    .banner { border: 2px solid #334155; background: #e2e8f0; padding: 16px; border-radius: 12px; margin-bottom: 20px; }
    .banner strong { display: inline-block; margin-right: 12px; letter-spacing: 0.08em; }
    svg { width: 100%; height: auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; }
    .lane-label { font-size: 14px; font-weight: 700; fill: #334155; }
    .edge path { stroke: #64748b; stroke-width: 1.5; fill: none; }
    .edge-label { font-size: 11px; fill: #475569; paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; }
    .node rect { fill: #eff6ff; stroke: #2563eb; stroke-width: 1.5; }
    .node-type { font-size: 11px; font-weight: 700; fill: #1d4ed8; text-transform: uppercase; }
    .node-label { font-size: 12px; fill: #0f172a; }
    .node-observation { font-size: 10px; fill: #475569; }
    .observations { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 20px; }
    .observation-card, .summary { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; }
    .observation-card h3 { font-size: 14px; margin: 0 0 8px; }
    .observation-card p, .summary p { color: #475569; font-size: 12px; }
    code { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <main data-viewer-mode="EVIDENCE_ONLY READ_ONLY OBSERVATIONAL">
    <section class="banner" aria-label="viewer boundary">
      <strong>EVIDENCE_ONLY</strong>
      <strong>READ_ONLY</strong>
      <strong>OBSERVATIONAL</strong>
      <p>This static viewer renders existing graph evidence only. It does not assert legitimacy certainty, authority, execution eligibility, or convergence.</p>
    </section>
    <svg role="img" aria-label="Runtime topology graph" viewBox="0 0 ${layout.width} ${layout.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
      </defs>
      <text x="${MARGIN}" y="42" font-size="24" font-weight="700" fill="#0f172a">Runtime Topology Graph</text>
      <text x="${MARGIN}" y="68" font-size="13" fill="#475569">nodes:${layout.nodes.length} edges:${layout.edges.length} generated_at:${escapeHtml(layout.graph.generated_at ?? 'unknown')}</text>
      ${laneLabels}
      ${edgeMarkup}
      ${nodeMarkup}
    </svg>
    <section class="summary">
      <h2>Topology observations</h2>
      <p>Closure classifications, artifact roles, and topology metadata are displayed only as observations.</p>
      <ul>${renderSummary(layout.graph.summary)}</ul>
    </section>
    <section class="observations" aria-label="node observations">${nodeObservationMarkup}</section>
  </main>
  <script type="application/json" id="topology-summary">${safeInlineJson(layout.graph.summary)}</script>
</body>
</html>`
}
