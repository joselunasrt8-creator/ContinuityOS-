/**
 * Build-artifact generator for the Runtime Topology Graph Viewer.
 * This is the ONLY write surface for issue #1813.
 *
 * Usage:
 *   npx tsx scripts/render-topology-graph-viewer.ts [output-path] [graph-json-path]
 *
 * Defaults:
 *   output:    graph/topology-viewer.html
 *   graph data: first of graph/runtime-topology.sample.json,
 *               runtime-topology.json, runtime/topology/runtime_graph.json
 *
 * The viewer module itself (src/visualizer/topology-graph-viewer.ts) is pure —
 * all I/O lives here, explicitly invoked as a build step.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import {
  normalizeTopologyGraph,
  renderTopologyGraphHtml,
} from '../src/visualizer/topology-graph-viewer.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..');

const CANDIDATE_SOURCES = [
  'graph/repo_graph.json',                  // primary: produced by npm run graph:extract
  'graph/runtime-topology.sample.json',
  'runtime-topology.json',
  'runtime/topology/runtime_graph.json',
];

function findGraphSource(root: string, override?: string): string {
  if (override) {
    const abs = resolve(override);
    if (!existsSync(abs)) throw new Error(`Graph source not found: ${abs}`);
    return abs;
  }
  for (const rel of CANDIDATE_SOURCES) {
    const abs = join(root, rel);
    if (existsSync(abs)) return abs;
  }
  throw new Error(
    'No topology graph data found. Run `npm run graph:extract` first (produced by #1625).'
  );
}

const outputArg = process.argv[2];
const sourceArg = process.argv[3];

const sourcePath = findGraphSource(repoRoot, sourceArg);
const outputPath = outputArg
  ? resolve(outputArg)
  : join(repoRoot, 'graph', 'topology-viewer.html');

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
const graph = normalizeTopologyGraph(raw);
const html = renderTopologyGraphHtml(graph);

writeFileSync(outputPath, html, 'utf8');

console.log('[render-topology-graph-viewer] evidence_only=true read_only=true observational=true');
console.log(`  source : ${sourcePath}`);
console.log(`  nodes  : ${graph.nodes.length}`);
console.log(`  edges  : ${graph.edges.length}`);
console.log(`  output : ${outputPath}`);
