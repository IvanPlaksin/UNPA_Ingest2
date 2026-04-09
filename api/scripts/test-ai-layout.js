#!/usr/bin/env node
/**
 * Test AI Layout on FlowDesc — Database Structure graph.
 * Fetches graph from catalog, calls AI Layout service directly,
 * validates result (no overlaps, all nodes present, proper spacing).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const aiLayoutService = require('../src/services/graph/ai-layout.service');

async function main() {
  console.log('=== AI Layout Test: FlowDesc — Database Structure ===\n');

  // Simulate the graph data (37 nodes, 71 edges from FlowDesc)
  // Use default sizes since we don't have DOM
  const W = 260, H = 130;

  // Fetch from catalog API
  let graphData;
  try {
    const resp = await fetch('http://localhost:3010/api/v1/graph-catalog/5966f002-f9cb-4745-ac2d-d92aef7d27da');
    const json = await resp.json();
    graphData = json.data || json;
    console.log(`Loaded graph: "${graphData.name}" — ${graphData.nodes.length} nodes, ${graphData.edges.length} edges\n`);
  } catch (e) {
    console.error('Failed to fetch graph from catalog. Is the API running?', e.message);
    process.exit(1);
  }

  const nodes = graphData.nodes.map(n => ({
    id: n.id,
    label: n.data?.label || n.id,
    width: W,
    height: H,
    type: n.data?.kind || 'default',
  }));

  const edges = graphData.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));

  // Compute canvas size like the hook does
  const cellW = 350, cellH = 250;
  const cols = Math.max(3, Math.ceil(Math.sqrt(nodes.length * 1.5)));
  const rows = Math.max(3, Math.ceil(nodes.length / cols));
  const canvasW = Math.max(1600, cols * cellW + 200);
  const canvasH = Math.max(1200, rows * cellH + 200);

  console.log(`Canvas: ${canvasW}x${canvasH}, Columns: ${cols}, Rows: ${rows}\n`);

  // Build request
  const request = {
    canvas: { width: canvasW, height: canvasH, padding: 50 },
    nodes,
    edges,
    hints: { preferredDirection: 'TB' },
  };

  // Build and show the user prompt
  const userPrompt = aiLayoutService.buildUserPrompt(request);
  console.log('--- User Prompt (first 1000 chars) ---');
  console.log(userPrompt.substring(0, 1000));
  console.log('...\n');

  // Call Claude
  console.log('Calling Claude API...');
  const startTime = Date.now();

  try {
    const result = await aiLayoutService.computeLayout(request);
    const elapsed = Date.now() - startTime;

    console.log(`\n=== RESULT ===`);
    console.log(`Success: ${result.success}`);
    console.log(`Model: ${result.metadata.model} (${result.metadata.modelId})`);
    console.log(`Time: ${result.metadata.layoutTime}ms`);
    console.log(`Tokens: ${result.metadata.inputTokens} in + ${result.metadata.outputTokens} out = ${result.metadata.tokensUsed}`);
    console.log(`Overlaps fixed: ${result.metadata.overlapsFixed}`);
    console.log(`Validation errors: ${result.metadata.validationErrors.length}`);
    if (result.metadata.validationErrors.length > 0) {
      for (const err of result.metadata.validationErrors) {
        console.log(`  - ${err}`);
      }
    }

    // Validate all nodes present
    const posCount = Object.keys(result.nodePositions).length;
    console.log(`\nPositions returned: ${posCount} / ${nodes.length} nodes`);

    const missing = nodes.filter(n => !result.nodePositions[n.id]);
    if (missing.length > 0) {
      console.log(`MISSING: ${missing.map(n => n.id).join(', ')}`);
    }

    // Check for overlaps in final result
    const rects = [];
    for (const [id, pos] of Object.entries(result.nodePositions)) {
      rects.push({ id, x: pos.x, y: pos.y, w: W, h: H });
    }

    let overlapCount = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const gap = 10;
        const ox = !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x);
        const oy = !(a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
        if (ox && oy) {
          overlapCount++;
          if (overlapCount <= 5) {
            console.log(`  OVERLAP: ${a.id} (${a.x},${a.y}) vs ${b.id} (${b.x},${b.y})`);
          }
        }
      }
    }
    console.log(`\nOverlaps in final result: ${overlapCount}`);

    // Show position stats
    const xs = Object.values(result.nodePositions).map(p => p.x);
    const ys = Object.values(result.nodePositions).map(p => p.y);
    console.log(`X range: ${Math.min(...xs)} — ${Math.max(...xs)}`);
    console.log(`Y range: ${Math.min(...ys)} — ${Math.max(...ys)}`);

    // Show a few positions
    console.log('\nSample positions (hubs first):');
    const degrees = new Map();
    for (const n of nodes) degrees.set(n.id, 0);
    for (const e of edges) {
      degrees.set(e.source, (degrees.get(e.source) || 0) + 1);
      degrees.set(e.target, (degrees.get(e.target) || 0) + 1);
    }
    const sorted = [...Object.entries(result.nodePositions)]
      .sort((a, b) => (degrees.get(b[0]) || 0) - (degrees.get(a[0]) || 0));
    for (const [id, pos] of sorted.slice(0, 10)) {
      console.log(`  ${id}: (${pos.x}, ${pos.y}) degree=${degrees.get(id)}`);
    }

    console.log(`\n=== TEST ${overlapCount === 0 && posCount === nodes.length ? 'PASSED' : 'NEEDS REVIEW'} ===`);

  } catch (err) {
    console.error('\n=== TEST FAILED ===');
    console.error(err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
  }
}

main().catch(console.error);
