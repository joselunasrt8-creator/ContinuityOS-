/**
 * Runtime Topology Graph Viewer — Issue #1813
 * Satisfies SC-6 of issue #1625.
 *
 * This module is evidence-only and read-only.
 * It contains ONLY pure functions: no file I/O, no network, no registry writes.
 * All output is returned as values — callers decide what to do with them.
 *
 * Invariants:
 *   evidence_only      = true   (surfaces raw topology; makes no legitimacy claims)
 *   read_only          = true   (no writes of any kind in this module)
 *   creates_authority  = false
 *   mutation_capable   = false
 *   executable         = false  (no governed workflow execution)
 *   deployment_capable = false
 *   proof_generating   = false
 */

// ---------------------------------------------------------------------------
// Viewer metadata — verifiable by tests
// ---------------------------------------------------------------------------

export const VIEWER_METADATA = Object.freeze({
  evidence_only: true,
  read_only: true,
  creates_authority: false,
  mutation_capable: false,
  executable: false,
  deployment_capable: false,
  proof_generating: false,
  issue: '#1813',
  satisfies: 'SC-6 of #1625',
});

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface TopologyNode {
  id: string;
  type: string;
  label?: string;
  file_path?: string;
  symbol?: string;
  mutation_capable?: boolean;
  authority_bound?: boolean;
  continuity_bound?: boolean;
  validator_bound?: boolean;
  replay_safe?: boolean;
  proof_generating?: boolean;
  topology_visible?: boolean;
  closure_status?: string;
  artifact_role?: string;
  risk_scope?: string;
  production_closure_relevant?: boolean;
  governance_class?: string;
  surface_category?: string;
  description?: string;
  route?: string;
  lifecycle_index?: number;
}

export interface TopologyEdge {
  from: string;
  to: string;
  relation?: string;
  type?: string;
  evidence?: string;
  file_path?: string;
  note?: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  summary?: Record<string, unknown>;
  generated_at?: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface LaneDescriptor {
  type: string;
  laneX: number;
  nodes: TopologyNode[];
}

export interface Layout {
  nodePositions: Map<string, NodePosition>;
  lanes: LaneDescriptor[];
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// normalizeTopologyGraph — accepts raw parsed JSON, returns typed graph
// ---------------------------------------------------------------------------

export function normalizeTopologyGraph(raw: unknown): TopologyGraph {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('Graph input must be a non-null object');
  }
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.nodes)) throw new TypeError('Graph must have a nodes array');
  if (!Array.isArray(r.edges)) throw new TypeError('Graph must have an edges array');

  const nodes: TopologyNode[] = r.nodes.map((n: unknown, i: number) => {
    if (n === null || typeof n !== 'object') throw new TypeError(`Node[${i}] must be an object`);
    const node = n as Record<string, unknown>;
    if (typeof node.id !== 'string' || !node.id) throw new TypeError(`Node[${i}] must have a non-empty id`);
    if (typeof node.type !== 'string' || !node.type) throw new TypeError(`Node[${i}] must have a non-empty type`);
    return node as unknown as TopologyNode;
  });

  const edges: TopologyEdge[] = r.edges.map((e: unknown, i: number) => {
    if (e === null || typeof e !== 'object') throw new TypeError(`Edge[${i}] must be an object`);
    const edge = e as Record<string, unknown>;
    if (typeof edge.from !== 'string' || !edge.from) throw new TypeError(`Edge[${i}] must have a non-empty from`);
    if (typeof edge.to !== 'string' || !edge.to) throw new TypeError(`Edge[${i}] must have a non-empty to`);
    return edge as unknown as TopologyEdge;
  });

  return {
    nodes,
    edges,
    summary: typeof r.summary === 'object' && r.summary !== null
      ? r.summary as Record<string, unknown>
      : undefined,
    generated_at: typeof r.generated_at === 'string' ? r.generated_at : undefined,
  };
}

// ---------------------------------------------------------------------------
// layoutTopologyGraph — deterministic lane layout, no randomness or simulation
// ---------------------------------------------------------------------------

// Canonical lifecycle order drives left-to-right lane placement.
const LANE_TYPE_ORDER = [
  'SESSION', 'CONTINUITY', 'AUTHORITY', 'AEO',
  'VALIDATION', 'EXECUTION', 'PROOF', 'RECONCILIATION',
  'BYPASS_SURFACE',
];

const LANE_WIDTH = 170;
const NODE_SPACING = 68;
const NODE_RADIUS = 22;
const LANE_HEADER_H = 40;
const PAD_X = 70;
const PAD_Y = 56;

function groupNodesByType(nodes: TopologyNode[]): Map<string, TopologyNode[]> {
  const groups = new Map<string, TopologyNode[]>();
  for (const n of nodes) {
    const t = (n.type ?? 'UNKNOWN').toUpperCase();
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(n);
  }
  return groups;
}

function orderedLanes(groups: Map<string, TopologyNode[]>): Array<{ type: string; nodes: TopologyNode[] }> {
  const result: Array<{ type: string; nodes: TopologyNode[] }> = [];
  const remaining = new Map(groups);
  for (const t of LANE_TYPE_ORDER) {
    if (remaining.has(t)) {
      result.push({ type: t, nodes: remaining.get(t)! });
      remaining.delete(t);
    }
  }
  // Remaining types sorted alphabetically for determinism
  for (const [t, ns] of [...remaining.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    result.push({ type: t, nodes: ns });
  }
  return result;
}

export function layoutTopologyGraph(graph: TopologyGraph): Layout {
  const groups = groupNodesByType(graph.nodes);
  const lanes = orderedLanes(groups);
  const nodePositions = new Map<string, NodePosition>();
  const laneDescriptors: LaneDescriptor[] = [];

  for (let li = 0; li < lanes.length; li++) {
    const { type, nodes } = lanes[li];
    const laneX = PAD_X + li * LANE_WIDTH;
    laneDescriptors.push({ type, laneX, nodes });
    for (let ni = 0; ni < nodes.length; ni++) {
      nodePositions.set(nodes[ni].id, {
        x: laneX,
        y: PAD_Y + LANE_HEADER_H + ni * NODE_SPACING,
      });
    }
  }

  const maxNodes = Math.max(...lanes.map(l => l.nodes.length), 1);
  const width = PAD_X * 2 + lanes.length * LANE_WIDTH;
  const height = PAD_Y * 2 + LANE_HEADER_H + maxNodes * NODE_SPACING;

  return { nodePositions, lanes: laneDescriptors, width, height };
}

// ---------------------------------------------------------------------------
// Colour helpers (pure, side-effect-free)
// ---------------------------------------------------------------------------

function closureColor(s?: string): string {
  return ({
    CLOSED:      '#22c55e',
    CONTAINED:   '#86efac',
    PARTIAL:     '#fbbf24',
    OPEN:        '#ef4444',
    BREAK_GLASS: '#f97316',
  } as Record<string, string>)[s ?? ''] ?? '#64748b';
}

function nodeColor(type?: string): string {
  return ({
    SESSION:       '#1d4ed8',
    CONTINUITY:    '#4338ca',
    AUTHORITY:     '#7e22ce',
    AEO:           '#6d28d9',
    VALIDATION:    '#0891b2',
    EXECUTION:     '#b91c1c',
    PROOF:         '#15803d',
    RECONCILIATION:'#0f766e',
    BYPASS_SURFACE:'#c2410c',
  } as Record<string, string>)[(type ?? '').toUpperCase()] ?? '#374151';
}

function edgeColor(relation?: string): string {
  return ({
    BYPASSES:              '#f97316',
    MUTATES_STATE:         '#ef4444',
    VALIDATES:             '#22c55e',
    WRITES_PROOF:          '#7e22ce',
    CLASSIFIES_FINALITY:   '#22c55e',
    CALLS:                 '#3b82f6',
    COMPILES_TO:           '#f59e0b',
    EXECUTES:              '#b91c1c',
    PROVES:                '#15803d',
    CONSUMES_NONCE:        '#f59e0b',
    RECONCILES_WITH:       '#0f766e',
    DEPENDS_ON:            '#64748b',
    DEPENDS_ON_AUTHORITY:  '#7e22ce',
    DEPENDS_ON_CONTINUITY: '#4338ca',
    REFERENCES_REGISTRY:   '#f59e0b',
  } as Record<string, string>)[(relation ?? '').toUpperCase()] ?? '#64748b';
}

// ---------------------------------------------------------------------------
// SVG path computation (pure)
// ---------------------------------------------------------------------------

function edgePath(
  sx: number, sy: number,
  tx: number, ty: number,
): string {
  if (Math.abs(sx - tx) < 5) {
    // Same column — curve out to the right
    const bulge = sx + 90;
    return `M ${sx} ${sy} C ${bulge} ${sy} ${bulge} ${ty} ${tx} ${ty}`;
  }
  // Cross-column — horizontal S-curve
  const mx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${mx} ${sy} ${mx} ${ty} ${tx} ${ty}`;
}

// ---------------------------------------------------------------------------
// renderTopologyGraphHtml — pure function, returns HTML string
// ---------------------------------------------------------------------------

export function renderTopologyGraphHtml(graph: TopologyGraph): string {
  const layout = layoutTopologyGraph(graph);
  const { nodePositions, lanes, width, height } = layout;

  const generatedAt = graph.generated_at ?? new Date().toISOString();
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;

  // Normalise edges (unify .relation / .type field)
  const edges = graph.edges.map(e => ({
    ...e,
    relation: e.relation ?? e.type ?? 'UNKNOWN',
  }));

  // Only render edges whose endpoints exist in nodePositions
  const renderableEdges = edges.filter(
    e => nodePositions.has(e.from) && nodePositions.has(e.to)
  );

  // --- Build static SVG content ---
  const svgParts: string[] = [];

  // Arrow markers
  const relations = [...new Set(renderableEdges.map(e => e.relation))];
  svgParts.push('<defs>');
  for (const rel of relations) {
    const col = edgeColor(rel);
    svgParts.push(
      `<marker id="arr-${rel}" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">` +
      `<path d="M0,0 L0,6 L8,3 z" fill="${col}" opacity="0.85"/>` +
      `</marker>`
    );
  }
  svgParts.push('</defs>');

  // Lane background columns
  svgParts.push('<g class="lanes">');
  for (const lane of lanes) {
    const lx = lane.laneX - LANE_WIDTH / 2 + 10;
    const lw = LANE_WIDTH - 20;
    const lh = height - PAD_Y;
    svgParts.push(
      `<rect x="${lx}" y="${PAD_Y / 2}" width="${lw}" height="${lh}" ` +
      `rx="8" fill="#1e2235" stroke="#2d3150" stroke-width="1" opacity="0.5"/>`
    );
    svgParts.push(
      `<text x="${lane.laneX}" y="${PAD_Y / 2 + 22}" ` +
      `text-anchor="middle" font-size="11" font-weight="700" fill="#6b7280" ` +
      `font-family="'Segoe UI',system-ui,sans-serif" letter-spacing="0.06em">` +
      `${lane.type}</text>`
    );
  }
  svgParts.push('</g>');

  // Edges
  svgParts.push('<g class="edges">');
  for (const e of renderableEdges) {
    const sp = nodePositions.get(e.from)!;
    const tp = nodePositions.get(e.to)!;
    const col = edgeColor(e.relation);

    // Attachment points: right/left of circle for cross-lane, top/bottom for same-lane
    const sameLane = Math.abs(sp.x - tp.x) < 5;
    const sx = sameLane ? sp.x + NODE_RADIUS : sp.x + NODE_RADIUS;
    const sy = sameLane ? sp.y : sp.y;
    const tx = sameLane ? tp.x + NODE_RADIUS : tp.x - NODE_RADIUS;
    const ty = sameLane ? tp.y : tp.y;

    const path = edgePath(sx, sy, tx, ty);
    svgParts.push(
      `<path d="${path}" fill="none" stroke="${col}" stroke-width="1.5" ` +
      `stroke-opacity="0.65" marker-end="url(#arr-${e.relation})"/>`
    );
    // Relation label at midpoint
    const lx = (sx + tx) / 2;
    const ly = (sy + ty) / 2 - 5;
    svgParts.push(
      `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="8.5" fill="#6b7280" ` +
      `font-family="'Segoe UI',system-ui,sans-serif">${e.relation}</text>`
    );
  }
  svgParts.push('</g>');

  // Nodes
  svgParts.push('<g class="nodes">');
  for (const n of graph.nodes) {
    const p = nodePositions.get(n.id);
    if (!p) continue;
    const fill = nodeColor(n.type);
    const stroke = n.closure_status ? closureColor(n.closure_status) : '#334155';
    const lbl = (n.label ?? n.id ?? '').split('/').pop()!.substring(0, 14);
    svgParts.push(
      `<g class="node" data-node-id="${esc(n.id)}" ` +
      `transform="translate(${p.x},${p.y})" style="cursor:pointer">` +
      `<circle r="${NODE_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="2.5" opacity="0.92"/>` +
      `<text text-anchor="middle" dominant-baseline="middle" font-size="8" fill="#f1f5f9" ` +
      `font-family="'Segoe UI',system-ui,sans-serif">${esc(lbl)}</text>` +
      `</g>`
    );
  }
  svgParts.push('</g>');

  const svgContent = svgParts.join('\n');

  // Embed node data for the inspector panel (read-only, observation-only)
  const embeddedNodes = JSON.stringify(
    graph.nodes.map(n => ({
      id: n.id, type: n.type, label: n.label,
      closure_status: n.closure_status, artifact_role: n.artifact_role,
      risk_scope: n.risk_scope, mutation_capable: n.mutation_capable,
      authority_bound: n.authority_bound, continuity_bound: n.continuity_bound,
      validator_bound: n.validator_bound, replay_safe: n.replay_safe,
      proof_generating: n.proof_generating, topology_visible: n.topology_visible,
      production_closure_relevant: n.production_closure_relevant,
      governance_class: n.governance_class, surface_category: n.surface_category,
      description: n.description,
    }))
  );
  const embeddedEdges = JSON.stringify(
    edges.map(e => ({ from: e.from, to: e.to, relation: e.relation, note: e.note }))
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Runtime Topology Graph Viewer</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0d1117;color:#e2e8f0;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{padding:10px 20px;background:#161b27;border-bottom:1px solid #2d3150;display:flex;align-items:center;gap:12px;flex-shrink:0;min-height:44px}
h1{font-size:14px;font-weight:600;color:#93c5fd}
.badge{font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:.06em}
.ev{background:#14291c;color:#4ade80;border:1px solid #166534}
.ro{background:#172033;color:#60a5fa;border:1px solid #1e3a5f}
.meta{font-size:10px;color:#475569;margin-left:auto}
#main{display:flex;flex:1;overflow:hidden}
#gc{flex:1;overflow:auto;position:relative;background:#0d1117}
svg#graph{display:block}
#panel{width:268px;background:#161b27;border-left:1px solid #2d3150;overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column;font-size:12px}
#pt{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;padding:10px 14px 8px;border-bottom:1px solid #2d3150}
#sts{display:flex;gap:14px;padding:7px 14px;border-bottom:1px solid #2d3150;font-size:11px;color:#64748b}
#sts strong{color:#93c5fd}
#nd{flex:1;overflow-y:auto}
.emp{color:#475569;padding:14px;text-align:center}
.sec{padding:10px 14px;border-bottom:1px solid #1e2a3e}
.sec h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;margin-bottom:8px}
.pr{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;align-items:flex-start}
.pk{font-size:11px;color:#64748b;flex-shrink:0}
.pv{font-size:11px;color:#cbd5e1;text-align:right;word-break:break-all}
.pt{color:#4ade80!important}.pf{color:#f87171!important}
.cb{font-size:10px;padding:1px 6px;border-radius:3px;font-weight:600}
.leg{padding:10px 14px}
.leg h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;margin-bottom:7px}
.li{display:flex;align-items:center;gap:7px;margin-bottom:4px;font-size:11px;color:#94a3b8}
.ld{width:10px;height:10px;border-radius:50%;flex-shrink:0}
#notice{font-size:10px;color:#475569;padding:8px 14px;border-top:1px solid #2d3150;text-align:center;font-style:italic;line-height:1.5}
</style>
</head>
<body>
<header>
  <h1>Runtime Topology Graph Viewer</h1>
  <span class="badge ev">EVIDENCE ONLY</span>
  <span class="badge ro">READ-ONLY</span>
  <span class="meta">Issue #1813 &middot; SC-6 of #1625 &middot; ${generatedAt}</span>
</header>
<div id="main">
  <div id="gc">
    <svg id="graph" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${svgContent}
    </svg>
  </div>
  <div id="panel">
    <div id="pt">Node Inspector</div>
    <div id="sts">
      <span><strong>${nodeCount}</strong> nodes</span>
      <span><strong>${edgeCount}</strong> edges</span>
    </div>
    <div id="nd"><p class="emp">Click a node to inspect</p></div>
    <div class="leg">
      <h3>Closure Status <span style="font-weight:400;text-transform:none">(observed)</span></h3>
      <div class="li"><div class="ld" style="background:#22c55e"></div>CLOSED</div>
      <div class="li"><div class="ld" style="background:#86efac"></div>CONTAINED</div>
      <div class="li"><div class="ld" style="background:#fbbf24"></div>PARTIAL</div>
      <div class="li"><div class="ld" style="background:#ef4444"></div>OPEN</div>
      <div class="li"><div class="ld" style="background:#f97316"></div>BREAK_GLASS</div>
    </div>
    <div class="leg" style="border-top:1px solid #2d3150">
      <h3>Node Types</h3>
      <div class="li"><div class="ld" style="background:#1d4ed8"></div>SESSION</div>
      <div class="li"><div class="ld" style="background:#4338ca"></div>CONTINUITY</div>
      <div class="li"><div class="ld" style="background:#7e22ce"></div>AUTHORITY / AEO</div>
      <div class="li"><div class="ld" style="background:#0891b2"></div>VALIDATION</div>
      <div class="li"><div class="ld" style="background:#b91c1c"></div>EXECUTION</div>
      <div class="li"><div class="ld" style="background:#15803d"></div>PROOF</div>
      <div class="li"><div class="ld" style="background:#c2410c"></div>BYPASS_SURFACE</div>
      <div class="li"><div class="ld" style="background:#374151"></div>Other</div>
    </div>
    <div id="notice">
      Closure classifications are observed labels only.<br>
      This viewer creates no authority and mutates no registry.
    </div>
  </div>
</div>
<script>
(function(){
'use strict';
// Viewer invariants — identical to VIEWER_METADATA exported by the TS module
var META=Object.freeze({evidence_only:true,read_only:true,creates_authority:false,mutation_capable:false,executable:false,deployment_capable:false,proof_generating:false});
var NODES=${embeddedNodes};
var EDGES=${embeddedEdges};
var nodeMap=new Map(NODES.map(function(n){return[n.id,n];}));
function cColor(s){return{CLOSED:'#22c55e',CONTAINED:'#86efac',PARTIAL:'#fbbf24',OPEN:'#ef4444',BREAK_GLASS:'#f97316'}[s]||'#64748b';}
function eColor(r){return{BYPASSES:'#f97316',MUTATES_STATE:'#ef4444',VALIDATES:'#22c55e',WRITES_PROOF:'#7e22ce',CLASSIFIES_FINALITY:'#22c55e',CALLS:'#3b82f6',COMPILES_TO:'#f59e0b',EXECUTES:'#b91c1c',PROVES:'#15803d',CONSUMES_NONCE:'#f59e0b',RECONCILES_WITH:'#0f766e',DEPENDS_ON:'#64748b',DEPENDS_ON_AUTHORITY:'#7e22ce',DEPENDS_ON_CONTINUITY:'#4338ca',REFERENCES_REGISTRY:'#f59e0b'}[(r||'').toUpperCase()]||'#64748b';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

document.getElementById('graph').addEventListener('click',function(ev){
  var g=ev.target.closest('.node');
  // Deselect all
  document.querySelectorAll('.node circle').forEach(function(c){c.setAttribute('stroke-width','2.5');c.setAttribute('filter','');});
  if(!g){document.getElementById('nd').innerHTML='<p class="emp">Click a node to inspect</p>';return;}
  g.querySelector('circle').setAttribute('stroke-width','4');
  var id=g.getAttribute('data-node-id');
  var n=nodeMap.get(id);
  if(!n)return;
  var nd=document.getElementById('nd');
  nd.innerHTML='';
  var sec=document.createElement('div');sec.className='sec';
  sec.innerHTML='<h3>Node Properties</h3>';
  var props=[['id',n.id],['type',n.type],['label',n.label],['closure_status',n.closure_status],['artifact_role',n.artifact_role],['risk_scope',n.risk_scope],['mutation_capable',n.mutation_capable],['authority_bound',n.authority_bound],['continuity_bound',n.continuity_bound],['validator_bound',n.validator_bound],['replay_safe',n.replay_safe],['proof_generating',n.proof_generating],['topology_visible',n.topology_visible],['production_closure_relevant',n.production_closure_relevant],['governance_class',n.governance_class],['surface_category',n.surface_category],['description',n.description]].filter(function(p){return p[1]!==undefined&&p[1]!==null;});
  props.forEach(function(p){
    var k=p[0],v=p[1];
    var row=document.createElement('div');row.className='pr';
    var kk=document.createElement('span');kk.className='pk';kk.textContent=k;
    var vv=document.createElement('span');
    vv.className='pv'+(v===true?' pt':v===false?' pf':'');
    if(k==='closure_status'){
      var col=cColor(v);
      vv.innerHTML='<span class="cb" style="background:'+col+'22;color:'+col+';border:1px solid '+col+'44">'+esc(v)+'</span>';
      row.appendChild(kk);row.appendChild(vv);sec.appendChild(row);
      var obs=document.createElement('div');
      obs.style.cssText='font-size:10px;color:#475569;margin-bottom:3px;font-style:italic;text-align:right';
      obs.textContent='observed classification — not a legitimacy claim';
      sec.appendChild(obs);
      return;
    }
    vv.textContent=String(v);
    row.appendChild(kk);row.appendChild(vv);sec.appendChild(row);
  });
  nd.appendChild(sec);
  var adj=EDGES.filter(function(e){return e.from===n.id||e.to===n.id;});
  if(adj.length){
    var esec=document.createElement('div');esec.className='sec';
    esec.innerHTML='<h3>Relationships ('+adj.length+')</h3>';
    adj.forEach(function(e){
      var row=document.createElement('div');row.className='pr';
      var dir=e.from===n.id?'→':'←';
      var peer=e.from===n.id?e.to:e.from;
      var kk=document.createElement('span');kk.className='pk';kk.textContent=dir+' '+e.relation;
      var vv=document.createElement('span');vv.className='pv';vv.style.color=eColor(e.relation);vv.textContent=peer;
      row.appendChild(kk);row.appendChild(vv);esec.appendChild(row);
    });
    nd.appendChild(esec);
  }
});
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Tiny XML-escaping helper (used in SVG text/attributes above)
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
