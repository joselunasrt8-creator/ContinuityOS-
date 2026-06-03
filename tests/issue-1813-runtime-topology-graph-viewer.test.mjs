/**
 * Tests for Issue #1813 — Runtime Topology Graph Viewer
 * Acceptance criteria:
 *   [AC-1]  VIEWER_METADATA declares evidence_only, read_only, creates_authority=false
 *   [AC-2]  normalizeTopologyGraph accepts valid graph data
 *   [AC-3]  normalizeTopologyGraph rejects missing nodes/edges
 *   [AC-4]  normalizeTopologyGraph rejects nodes without id or type
 *   [AC-5]  layoutTopologyGraph returns deterministic positions for all nodes
 *   [AC-6]  Layout lane order follows canonical lifecycle (SESSION before PROOF)
 *   [AC-7]  renderTopologyGraphHtml returns a string containing an SVG
 *   [AC-8]  HTML output contains "EVIDENCE ONLY" and "READ-ONLY" banners
 *   [AC-9]  HTML output surfaces node labels and node types
 *   [AC-10] HTML output surfaces edge relationship types
 *   [AC-11] HTML output contains observational disclaimer for closure status
 *   [AC-12] HTML output contains no <form> tags
 *   [AC-13] HTML output contains no fetch/POST/PUT/PATCH/DELETE calls
 *   [AC-14] HTML output contains no authority creation or GLOBAL_VALID claims
 *   [AC-15] Bypass surface nodes appear in the rendered output
 *   [AC-16] layoutTopologyGraph is deterministic (same input → same output)
 *   [AC-17] renderTopologyGraphHtml is a pure function (does not throw on empty graph)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWER_METADATA,
  normalizeTopologyGraph,
  layoutTopologyGraph,
  renderTopologyGraphHtml,
} from '../src/visualizer/topology-graph-viewer.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MINIMAL_GRAPH = {
  nodes: [
    { id: 'session',   type: 'SESSION' },
    { id: 'authority', type: 'AUTHORITY' },
    { id: 'execution', type: 'EXECUTION' },
    { id: 'proof',     type: 'PROOF' },
    {
      id: 'bypass:agent_tool_call',
      type: 'BYPASS_SURFACE',
      governance_class: 'UNKNOWN',
      mutation_capable: true,
      description: 'Ungoverned agent tool call',
    },
  ],
  edges: [
    { from: 'session',   to: 'authority', relation: 'DEPENDS_ON' },
    { from: 'authority', to: 'execution', relation: 'VALIDATES' },
    { from: 'execution', to: 'proof',     relation: 'PROVES' },
    { from: 'bypass:agent_tool_call', to: 'execution', relation: 'BYPASSES' },
  ],
  generated_at: '2026-01-01T00:00:00.000Z',
};

const FULL_GRAPH = {
  nodes: [
    { id: 'session',    type: 'SESSION',    closure_status: 'CLOSED',   label: 'session' },
    { id: 'continuity', type: 'CONTINUITY', closure_status: 'CLOSED',   label: 'continuity' },
    { id: 'authority',  type: 'AUTHORITY',  closure_status: 'PARTIAL',  label: 'authority',
      mutation_capable: false, authority_bound: true },
    { id: 'aeo',        type: 'AEO',        closure_status: 'CLOSED',   label: 'aeo' },
    { id: 'validation', type: 'VALIDATION', closure_status: 'CLOSED',   label: 'validation' },
    { id: 'execution',  type: 'EXECUTION',  closure_status: 'OPEN',     label: 'execution',
      mutation_capable: true, risk_scope: 'production_runtime' },
    { id: 'proof',      type: 'PROOF',      closure_status: 'CLOSED',   label: 'proof',
      proof_generating: true },
    { id: 'bypass:direct_git_push', type: 'BYPASS_SURFACE',
      closure_status: 'BREAK_GLASS', governance_class: 'BREAK_GLASS',
      surface_category: 'git', mutation_capable: true,
      description: 'Direct git push bypasses PR legitimacy chain' },
  ],
  edges: [
    { from: 'session',    to: 'continuity', relation: 'DEPENDS_ON' },
    { from: 'continuity', to: 'authority',  relation: 'DEPENDS_ON' },
    { from: 'authority',  to: 'aeo',        relation: 'COMPILES_TO' },
    { from: 'aeo',        to: 'validation', relation: 'VALIDATES' },
    { from: 'validation', to: 'execution',  relation: 'EXECUTES' },
    { from: 'execution',  to: 'proof',      relation: 'PROVES' },
    { from: 'bypass:direct_git_push', to: 'authority', relation: 'BYPASSES' },
  ],
  generated_at: '2026-05-26T00:00:00.000Z',
  summary: { closure_status_counts_all: { CLOSED: 5, OPEN: 1, PARTIAL: 1, BREAK_GLASS: 1 } },
};

// ---------------------------------------------------------------------------
// [AC-1] VIEWER_METADATA invariants
// ---------------------------------------------------------------------------

test('[AC-1] VIEWER_METADATA declares evidence_only=true', () => {
  assert.equal(VIEWER_METADATA.evidence_only, true);
});

test('[AC-1] VIEWER_METADATA declares read_only=true', () => {
  assert.equal(VIEWER_METADATA.read_only, true);
});

test('[AC-1] VIEWER_METADATA declares creates_authority=false', () => {
  assert.equal(VIEWER_METADATA.creates_authority, false);
});

test('[AC-1] VIEWER_METADATA declares mutation_capable=false', () => {
  assert.equal(VIEWER_METADATA.mutation_capable, false);
});

test('[AC-1] VIEWER_METADATA declares executable=false', () => {
  assert.equal(VIEWER_METADATA.executable, false);
});

test('[AC-1] VIEWER_METADATA declares proof_generating=false', () => {
  assert.equal(VIEWER_METADATA.proof_generating, false);
});

test('[AC-1] VIEWER_METADATA references issue #1813', () => {
  assert.equal(VIEWER_METADATA.issue, '#1813');
});

test('[AC-1] VIEWER_METADATA satisfies SC-6 of #1625', () => {
  assert.match(VIEWER_METADATA.satisfies, /SC-6/);
});

// ---------------------------------------------------------------------------
// [AC-2, AC-3, AC-4] normalizeTopologyGraph
// ---------------------------------------------------------------------------

test('[AC-2] normalizeTopologyGraph accepts valid graph with nodes and edges', () => {
  const g = normalizeTopologyGraph(MINIMAL_GRAPH);
  assert.equal(g.nodes.length, 5);
  assert.equal(g.edges.length, 4);
});

test('[AC-2] normalizeTopologyGraph preserves generated_at', () => {
  const g = normalizeTopologyGraph(MINIMAL_GRAPH);
  assert.equal(g.generated_at, '2026-01-01T00:00:00.000Z');
});

test('[AC-2] normalizeTopologyGraph preserves summary when present', () => {
  const g = normalizeTopologyGraph(FULL_GRAPH);
  assert.ok(g.summary);
});

test('[AC-3] normalizeTopologyGraph throws when nodes is missing', () => {
  assert.throws(
    () => normalizeTopologyGraph({ edges: [] }),
    /nodes/
  );
});

test('[AC-3] normalizeTopologyGraph throws when edges is missing', () => {
  assert.throws(
    () => normalizeTopologyGraph({ nodes: [] }),
    /edges/
  );
});

test('[AC-3] normalizeTopologyGraph throws for non-object input', () => {
  assert.throws(() => normalizeTopologyGraph(null), TypeError);
  assert.throws(() => normalizeTopologyGraph('string'), TypeError);
  assert.throws(() => normalizeTopologyGraph(42), TypeError);
});

test('[AC-4] normalizeTopologyGraph throws when a node has no id', () => {
  assert.throws(
    () => normalizeTopologyGraph({ nodes: [{ type: 'SESSION' }], edges: [] }),
    /id/
  );
});

test('[AC-4] normalizeTopologyGraph throws when a node has no type', () => {
  assert.throws(
    () => normalizeTopologyGraph({ nodes: [{ id: 'x' }], edges: [] }),
    /type/
  );
});

test('[AC-4] normalizeTopologyGraph throws when an edge has no from', () => {
  assert.throws(
    () => normalizeTopologyGraph({ nodes: [], edges: [{ to: 'x' }] }),
    /from/
  );
});

// ---------------------------------------------------------------------------
// [AC-5, AC-6] layoutTopologyGraph
// ---------------------------------------------------------------------------

test('[AC-5] layoutTopologyGraph returns positions for every node', () => {
  const g = normalizeTopologyGraph(FULL_GRAPH);
  const layout = layoutTopologyGraph(g);
  for (const n of g.nodes) {
    assert.ok(layout.nodePositions.has(n.id), `Missing position for node "${n.id}"`);
  }
});

test('[AC-5] layoutTopologyGraph returns numeric x and y for each position', () => {
  const g = normalizeTopologyGraph(FULL_GRAPH);
  const layout = layoutTopologyGraph(g);
  for (const [, pos] of layout.nodePositions) {
    assert.equal(typeof pos.x, 'number');
    assert.equal(typeof pos.y, 'number');
  }
});

test('[AC-5] layoutTopologyGraph returns positive width and height', () => {
  const g = normalizeTopologyGraph(FULL_GRAPH);
  const layout = layoutTopologyGraph(g);
  assert.ok(layout.width > 0, 'width must be positive');
  assert.ok(layout.height > 0, 'height must be positive');
});

test('[AC-6] SESSION lane appears before PROOF lane', () => {
  const g = normalizeTopologyGraph(FULL_GRAPH);
  const layout = layoutTopologyGraph(g);
  const sessionLane = layout.lanes.find(l => l.type === 'SESSION');
  const proofLane   = layout.lanes.find(l => l.type === 'PROOF');
  assert.ok(sessionLane, 'SESSION lane must exist');
  assert.ok(proofLane,   'PROOF lane must exist');
  assert.ok(sessionLane.laneX < proofLane.laneX, 'SESSION must be left of PROOF');
});

test('[AC-6] BYPASS_SURFACE lane appears after canonical lifecycle lanes', () => {
  const g = normalizeTopologyGraph(FULL_GRAPH);
  const layout = layoutTopologyGraph(g);
  const executionLane = layout.lanes.find(l => l.type === 'EXECUTION');
  const bypassLane    = layout.lanes.find(l => l.type === 'BYPASS_SURFACE');
  assert.ok(executionLane, 'EXECUTION lane must exist');
  assert.ok(bypassLane,    'BYPASS_SURFACE lane must exist');
  assert.ok(executionLane.laneX < bypassLane.laneX, 'EXECUTION must be left of BYPASS_SURFACE');
});

test('[AC-16] layoutTopologyGraph is deterministic', () => {
  const g = normalizeTopologyGraph(FULL_GRAPH);
  const layout1 = layoutTopologyGraph(g);
  const layout2 = layoutTopologyGraph(g);
  for (const [id, p1] of layout1.nodePositions) {
    const p2 = layout2.nodePositions.get(id);
    assert.ok(p2, `missing position for ${id} in second layout`);
    assert.equal(p1.x, p2.x);
    assert.equal(p1.y, p2.y);
  }
});

// ---------------------------------------------------------------------------
// [AC-7–AC-15] renderTopologyGraphHtml
// ---------------------------------------------------------------------------

let _html;
function getHtml() {
  if (!_html) _html = renderTopologyGraphHtml(normalizeTopologyGraph(FULL_GRAPH));
  return _html;
}

test('[AC-7] renderTopologyGraphHtml returns a non-empty string', () => {
  assert.equal(typeof getHtml(), 'string');
  assert.ok(getHtml().length > 0);
});

test('[AC-7] HTML output contains an SVG element', () => {
  assert.ok(getHtml().includes('<svg'), 'must contain <svg');
  assert.ok(getHtml().includes('</svg>'), 'must close </svg>');
});

test('[AC-8] HTML output contains EVIDENCE ONLY banner', () => {
  assert.ok(getHtml().includes('EVIDENCE ONLY'));
});

test('[AC-8] HTML output contains READ-ONLY banner', () => {
  assert.ok(getHtml().includes('READ-ONLY'));
});

test('[AC-9] HTML output contains node label text', () => {
  // "session" should appear as a text element inside the SVG
  assert.ok(getHtml().includes('session'));
});

test('[AC-9] HTML output references node types from the graph', () => {
  assert.ok(getHtml().includes('SESSION'));
  assert.ok(getHtml().includes('EXECUTION'));
  assert.ok(getHtml().includes('PROOF'));
});

test('[AC-10] HTML output surfaces edge relationship types', () => {
  assert.ok(getHtml().includes('DEPENDS_ON'));
  assert.ok(getHtml().includes('VALIDATES') || getHtml().includes('EXECUTES'));
  assert.ok(getHtml().includes('BYPASSES'));
});

test('[AC-11] HTML output includes observational disclaimer for closure status', () => {
  const html = getHtml();
  // The disclaimer must appear somewhere
  assert.ok(
    html.includes('observed') || html.includes('observation'),
    'must include observational disclaimer'
  );
  assert.ok(
    html.includes('not a legitimacy claim') || html.includes('no authority'),
    'must disclaim authority claims'
  );
});

test('[AC-12] HTML output contains no <form> tags', () => {
  assert.ok(!getHtml().toLowerCase().includes('<form'), 'must not contain <form>');
});

test('[AC-13] HTML output contains no fetch() calls', () => {
  assert.ok(!getHtml().includes('fetch('), 'must not contain fetch()');
});

test('[AC-13] HTML output contains no XMLHttpRequest', () => {
  assert.ok(!getHtml().includes('XMLHttpRequest'), 'must not contain XHR');
});

test('[AC-13] HTML output contains no POST/PUT/PATCH/DELETE method strings', () => {
  const html = getHtml();
  assert.ok(!html.includes("method:'POST'") && !html.includes('method:"POST"'), 'no POST');
  assert.ok(!html.includes("method:'PUT'")  && !html.includes('method:"PUT"'),  'no PUT');
  assert.ok(!html.includes("method:'PATCH'")&& !html.includes('method:"PATCH"'),'no PATCH');
  assert.ok(!html.includes("method:'DELETE'")&&!html.includes('method:"DELETE"'),'no DELETE');
});

test('[AC-14] HTML output contains no creates_authority=true claim', () => {
  assert.ok(!getHtml().includes('creates_authority:true'), 'must not claim creates_authority=true');
  assert.ok(!getHtml().includes('creates_authority: true'), 'must not claim creates_authority=true');
});

test('[AC-14] HTML output contains no GLOBAL_VALID claim', () => {
  assert.ok(!getHtml().includes('GLOBAL_VALID'), 'must not emit GLOBAL_VALID');
});

test('[AC-15] Bypass surface nodes appear in the rendered output', () => {
  assert.ok(getHtml().includes('bypass:direct_git_push'));
  assert.ok(getHtml().includes('BYPASS_SURFACE'));
});

test('[AC-17] renderTopologyGraphHtml handles a graph with zero nodes and edges', () => {
  const empty = normalizeTopologyGraph({ nodes: [], edges: [] });
  const html = renderTopologyGraphHtml(empty);
  assert.equal(typeof html, 'string');
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('EVIDENCE ONLY'));
});

test('[AC-17] renderTopologyGraphHtml handles a single-node graph', () => {
  const g = normalizeTopologyGraph({ nodes: [{ id: 'x', type: 'SESSION' }], edges: [] });
  const html = renderTopologyGraphHtml(g);
  assert.ok(html.includes('<svg'));
});
