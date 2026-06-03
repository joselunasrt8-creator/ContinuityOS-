/**
 * tests/issue-1813-runtime-topology-graph-viewer.test.mjs
 * Issue #1813 — Runtime Topology Graph Viewer
 *
 * FATE tests proving the runtime topology graph viewer is a deterministic,
 * static, read-only visualization surface over existing graph evidence.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  normalizeTopologyGraph,
  layoutTopologyGraph,
  renderTopologyGraphHtml,
} from '../src/visualizer/topology-graph-viewer.ts'

const SAMPLE_GRAPH = JSON.parse(readFileSync(new URL('../graph/runtime-topology.sample.json', import.meta.url), 'utf8'))
const VIEWER_SOURCE = readFileSync(
  new URL('../src/visualizer/topology-graph-viewer.ts', import.meta.url),
  'utf8',
)

function focusedGraph() {
  return {
    ...SAMPLE_GRAPH,
    nodes: SAMPLE_GRAPH.nodes.slice(0, 4),
    edges: SAMPLE_GRAPH.edges.slice(0, 3),
    summary: {
      closure_status_counts_all: SAMPLE_GRAPH.summary.closure_status_counts_all,
      artifact_role_counts: SAMPLE_GRAPH.summary.artifact_role_counts,
    },
  }
}

// ── 1. Graph normalization succeeds ───────────────────────────────────────────

test('graph normalization succeeds over existing runtime topology artifact shape', () => {
  const graph = normalizeTopologyGraph(focusedGraph())
  assert.equal(graph.evidence_only, true)
  assert.equal(graph.read_only, true)
  assert.equal(graph.observational, true)
  assert.ok(graph.nodes.length > 0)
  assert.ok(graph.edges.length > 0)
  assert.equal(graph.nodes[0].topology_observations.some((item) => item.startsWith('closure_status:')), true)
})

// ── 2. Layout generation is deterministic ─────────────────────────────────────

test('layout generation is deterministic', () => {
  const graph = normalizeTopologyGraph(focusedGraph())
  assert.deepEqual(layoutTopologyGraph(graph), layoutTopologyGraph(graph))
})

// ── 3. HTML rendering succeeds ────────────────────────────────────────────────

test('HTML rendering succeeds as a static SVG document', () => {
  const html = renderTopologyGraphHtml(normalizeTopologyGraph(focusedGraph()))
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /<svg role="img"/)
  assert.match(html, /Runtime Topology Graph/)
})

// ── 4. Node labels appear ─────────────────────────────────────────────────────

test('node labels appear in the viewer', () => {
  const graph = normalizeTopologyGraph(focusedGraph())
  const html = renderTopologyGraphHtml(graph)
  assert.match(html, /src\/canonical-authority\.js/)
  assert.match(html, /src\/canonical\.d\.ts/)
})

// ── 5. Edge labels appear ─────────────────────────────────────────────────────

test('edge relationship labels appear in the viewer', () => {
  const html = renderTopologyGraphHtml(normalizeTopologyGraph(focusedGraph()))
  assert.match(html, /DEPENDS_ON_AUTHORITY/)
  assert.match(html, /CALLS/)
})

// ── 6. Evidence-only banner appears ───────────────────────────────────────────

test('evidence-only read-only observational banner appears', () => {
  const html = renderTopologyGraphHtml(normalizeTopologyGraph(focusedGraph()))
  assert.match(html, /EVIDENCE_ONLY/)
  assert.match(html, /READ_ONLY/)
  assert.match(html, /OBSERVATIONAL/)
  assert.match(html, /does not assert legitimacy certainty, authority, execution eligibility, or convergence/)
})

// ── 7. No mutation behavior exists ────────────────────────────────────────────

test('viewer exposes no mutation behavior', () => {
  const html = renderTopologyGraphHtml(normalizeTopologyGraph(focusedGraph()))
  assert.doesNotMatch(html, /<button\b/i)
  assert.doesNotMatch(html, /onclick\s*=/i)
  assert.doesNotMatch(html, /\bPOST\b|\bPUT\b|\bPATCH\b|\bDELETE\b/i)
  assert.doesNotMatch(VIEWER_SOURCE, /\bfetch\s*\(|XMLHttpRequest|new\s+Request\b/)
})

// ── 8. No form elements exist ─────────────────────────────────────────────────

test('viewer contains no form elements', () => {
  const html = renderTopologyGraphHtml(normalizeTopologyGraph(focusedGraph()))
  assert.doesNotMatch(html, /<form\b/i)
  assert.doesNotMatch(html, /<input\b/i)
  assert.doesNotMatch(html, /<textarea\b/i)
  assert.doesNotMatch(html, /<select\b/i)
})

// ── 9. No write APIs are invoked ──────────────────────────────────────────────

test('viewer source invokes no file, network, registry, or workflow write APIs', () => {
  assert.doesNotMatch(VIEWER_SOURCE, /\bwriteFile(?:Sync)?\s*\(/)
  assert.doesNotMatch(VIEWER_SOURCE, /\bappendFile(?:Sync)?\s*\(/)
  assert.doesNotMatch(VIEWER_SOURCE, /\bmkdir(?:Sync)?\s*\(/)
  assert.doesNotMatch(VIEWER_SOURCE, /\bexec(?:File)?(?:Sync)?\s*\(/)
  assert.doesNotMatch(VIEWER_SOURCE, /\bspawn(?:Sync)?\s*\(/)
  assert.doesNotMatch(VIEWER_SOURCE, /\bfetch\s*\(/)
})

// ── 10. Same input produces identical output ──────────────────────────────────

test('same input produces identical normalized graph, layout, and HTML output', () => {
  const input = focusedGraph()
  const before = JSON.stringify(input)
  const graphA = normalizeTopologyGraph(input)
  const graphB = normalizeTopologyGraph(input)
  const layoutA = layoutTopologyGraph(graphA)
  const layoutB = layoutTopologyGraph(graphB)
  const htmlA = renderTopologyGraphHtml(graphA)
  const htmlB = renderTopologyGraphHtml(graphB)

  assert.equal(JSON.stringify(input), before)
  assert.deepEqual(graphA, graphB)
  assert.deepEqual(layoutA, layoutB)
  assert.equal(htmlA, htmlB)
})
