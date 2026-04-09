/**
 * Test Subgraph Segmentation Service on the audit graph (namespace GXE).
 *
 * Usage: cd api && node scripts/test-segmentation.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { subgraphSegmentationService } = require('../src/services/graph/subgraph-segmentation.service');

async function main() {
  console.log('=== Subgraph Segmentation Test (namespace: GXE) ===\n');

  // Run analysis with community + ontology strategies (skip semantic for now if TEI fails)
  const result = await subgraphSegmentationService.analyze('GXE', {
    strategies: ['community', 'ontology'],
    useLlm: false,  // heuristic for first test
  });

  // ── Structural ─────────────────────────────────────────
  console.log('\n=== STRUCTURAL ANALYSIS ===');
  const s = result.structural;
  console.log(`  Nodes: ${s.nodeCount}, Edges: ${s.edgeCount}, Density: ${s.density}`);
  console.log(`  Avg degree: ${s.avgDegree}, Max degree: ${s.maxDegree}`);
  console.log(`  Connected components: ${s.connectedComponents.count} (largest ratio: ${s.connectedComponents.largestComponentRatio})`);
  console.log(`  Avg clustering coefficient: ${s.avgClusteringCoefficient}`);
  console.log(`  Bridge edges: ${s.bridgeEdges?.length ?? 'skipped'}`);
  console.log('\n  Hub nodes (top 5):');
  for (const h of s.hubNodes.slice(0, 5)) {
    console.log(`    ${h.name} (${h.label}): degree=${h.degree}`);
  }

  // ── Community Detection ────────────────────────────────
  if (result.strategies.community) {
    const c = result.strategies.community;
    console.log(`\n=== COMMUNITY DETECTION (${c.method || 'unknown'}) ===`);
    console.log(`  Total: ${c.totalCommunities}, Filtered (>=2): ${c.filteredCommunities}`);
    for (const cl of (c.clusters || []).slice(0, 8)) {
      console.log(`  Community ${cl.communityId}: ${cl.nodeCount} nodes`);
      for (const nd of cl.nodeDetails.slice(0, 5)) {
        console.log(`    - ${nd.name} (${nd.label})`);
      }
      if (cl.nodeDetails.length > 5) console.log(`    ... and ${cl.nodeDetails.length - 5} more`);
    }
  }

  // ── Ontology Split ─────────────────────────────────────
  if (result.strategies.ontology) {
    const o = result.strategies.ontology;
    console.log('\n=== ONTOLOGY LAYER SPLIT ===');
    console.log(`  Summary:`, JSON.stringify(o.summary));
    for (const cl of o.clusters) {
      console.log(`  ${cl.layer}: ${cl.nodeCount} nodes`);
      for (const nd of (cl.nodeDetails || []).slice(0, 5)) {
        console.log(`    - ${nd.name} (${nd.label})`);
      }
    }
    if (o.crossLayerEdges?.length) {
      console.log(`  Cross-layer edges: ${o.crossLayerEdges.length}`);
    }
  }

  // ── Ranked candidates ──────────────────────────────────
  console.log('\n=== RANKED CANDIDATES (by coherence) ===');
  for (const c of result.candidates.slice(0, 10)) {
    console.log(`  [${c.strategy}] "${c.suggestedName || c.layer || 'unnamed'}" — score: ${c.coherenceScore}, nodes: ${c.nodeCount}, internal: ${c.internalEdgeCount}, external: ${c.externalEdgeCount}`);
  }

  console.log(`\n=== Done in ${result.durationMs}ms ===`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
