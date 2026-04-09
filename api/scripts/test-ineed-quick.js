#!/usr/bin/env node
/**
 * Quick iNeed Graph Verification
 *
 * Validates graph definitions without requiring running services.
 * Checks structure, node connectivity, tool references, and edge integrity.
 *
 * Usage:
 *   node api/scripts/test-ineed-quick.js
 *   node api/scripts/test-ineed-quick.js --verbose
 *   node api/scripts/test-ineed-quick.js --graph INEED-G1-IT-HARDWARE-V1
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { GraphLoaderService } = require('../src/services/graph-definitions/graph-loader.service');

// ====================================================================
// VALIDATION FUNCTIONS
// ====================================================================

function validateGraph(graphDef) {
  const issues = [];
  const warnings = [];
  const nodeIds = new Set(graphDef.nodes.map(n => n.id));
  const nodeMap = new Map(graphDef.nodes.map(n => [n.id, n]));

  // 1. Check for start/end nodes
  const startNodes = graphDef.nodes.filter(n => n.type === 'start');
  const endNodes = graphDef.nodes.filter(n => n.type === 'end');

  if (startNodes.length === 0) issues.push('No start node found');
  if (startNodes.length > 1) warnings.push(`Multiple start nodes: ${startNodes.map(n => n.id).join(', ')}`);
  if (endNodes.length === 0) issues.push('No end node found');

  // 2. Check edges reference valid nodes
  for (const edge of graphDef.edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push(`Edge ${edge.id}: source '${edge.source}' does not exist`);
    }
    if (!nodeIds.has(edge.target)) {
      issues.push(`Edge ${edge.id}: target '${edge.target}' does not exist`);
    }
    if (edge.source === edge.target) {
      warnings.push(`Edge ${edge.id}: self-loop on ${edge.source}`);
    }
  }

  // 3. Check node reachability (except start nodes)
  const nodesWithIncoming = new Set(graphDef.edges.map(e => e.target));
  for (const node of graphDef.nodes) {
    if (node.type !== 'start' && !nodesWithIncoming.has(node.id)) {
      issues.push(`Node ${node.id} (${node.data?.label}) is unreachable`);
    }
  }

  // 4. Check nodes have outgoing edges (except end nodes)
  const nodesWithOutgoing = new Set(graphDef.edges.map(e => e.source));
  for (const node of graphDef.nodes) {
    if (node.type !== 'end' && !nodesWithOutgoing.has(node.id)) {
      warnings.push(`Node ${node.id} (${node.data?.label}) has no outgoing edges`);
    }
  }

  // 5. Check all nodes have tool defined
  for (const node of graphDef.nodes) {
    if (!node.data?.tool) {
      issues.push(`Node ${node.id} missing 'tool' in data`);
    }
    if (!node.data?.label) {
      warnings.push(`Node ${node.id} missing label`);
    }
  }

  // 6. Check condition nodes have 2+ outgoing edges
  const conditionNodes = graphDef.nodes.filter(n => n.type === 'condition');
  for (const cn of conditionNodes) {
    const outEdges = graphDef.edges.filter(e => e.source === cn.id);
    if (outEdges.length < 2) {
      warnings.push(`Condition node ${cn.id} has only ${outEdges.length} outgoing edge(s)`);
    }
    const hasLabels = outEdges.every(e => e.label);
    if (!hasLabels) {
      warnings.push(`Condition node ${cn.id}: not all outgoing edges have labels`);
    }
  }

  // 7. Check wait_input nodes have config
  const waitNodes = graphDef.nodes.filter(n => n.type === 'wait_input');
  for (const wn of waitNodes) {
    const config = wn.data?.config;
    if (!config?.expected_inputs) {
      issues.push(`Wait node ${wn.id} missing expected_inputs`);
    }
    if (!config?.recipients) {
      warnings.push(`Wait node ${wn.id} missing recipients`);
    }
    if (!config?.timeout_hours) {
      warnings.push(`Wait node ${wn.id} missing timeout_hours`);
    }
  }

  // 8. Check unique edge IDs
  const edgeIds = graphDef.edges.map(e => e.id);
  const duplicateEdges = edgeIds.filter((id, idx) => edgeIds.indexOf(id) !== idx);
  if (duplicateEdges.length > 0) {
    issues.push(`Duplicate edge IDs: ${duplicateEdges.join(', ')}`);
  }

  // 9. Check unique node IDs
  const nodeIdList = graphDef.nodes.map(n => n.id);
  const duplicateNodes = nodeIdList.filter((id, idx) => nodeIdList.indexOf(id) !== idx);
  if (duplicateNodes.length > 0) {
    issues.push(`Duplicate node IDs: ${duplicateNodes.join(', ')}`);
  }

  return { issues, warnings };
}

function getGraphStats(graphDef) {
  const types = {};
  for (const node of graphDef.nodes) {
    types[node.type] = (types[node.type] || 0) + 1;
  }

  const tools = {};
  for (const node of graphDef.nodes) {
    const tool = node.data?.tool || 'unknown';
    const prefix = tool.split('.')[0];
    tools[prefix] = (tools[prefix] || 0) + 1;
  }

  return { types, tools };
}

// ====================================================================
// MAIN
// ====================================================================

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const specificGraph = args.includes('--graph')
    ? args[args.indexOf('--graph') + 1]
    : null;

  console.log('=== iNeed Graph Verification ===\n');

  const loader = new GraphLoaderService(null, null);
  const graphs = loader.listGraphs();

  console.log(`Loaded ${graphs.length} graph definitions:\n`);

  let totalIssues = 0;
  let totalWarnings = 0;

  for (const g of graphs) {
    if (specificGraph && g.graphId !== specificGraph) continue;

    const def = loader.getGraph(g.graphId);
    const { issues, warnings } = validateGraph(def);
    const stats = getGraphStats(def);

    totalIssues += issues.length;
    totalWarnings += warnings.length;

    const statusIcon = issues.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'OK';
    console.log(`[${statusIcon}] ${g.graphId}`);
    console.log(`     Name: ${g.name}`);
    console.log(`     Nodes: ${g.nodes} | Edges: ${g.edges} | Version: ${g.version}`);
    console.log(`     Types: ${Object.entries(stats.types).map(([k, v]) => `${k}:${v}`).join(', ')}`);
    console.log(`     Tools: ${Object.entries(stats.tools).map(([k, v]) => `${k}:${v}`).join(', ')}`);

    if (issues.length > 0) {
      console.log(`     Issues (${issues.length}):`);
      for (const issue of issues) {
        console.log(`       - ${issue}`);
      }
    }

    if (warnings.length > 0 && verbose) {
      console.log(`     Warnings (${warnings.length}):`);
      for (const w of warnings) {
        console.log(`       - ${w}`);
      }
    } else if (warnings.length > 0) {
      console.log(`     Warnings: ${warnings.length} (use --verbose to see)`);
    }

    if (verbose) {
      // Print node list
      console.log('     Nodes:');
      for (const node of def.nodes) {
        const waitFlag = node.type === 'wait_input' ? ' [WAIT]' : '';
        const condFlag = node.type === 'condition' ? ' [COND]' : '';
        const llmFlag = node.type === 'ai_node' ? ' [LLM]' : '';
        console.log(`       ${node.id}: ${node.data?.label || 'untitled'} (${node.data?.tool})${waitFlag}${condFlag}${llmFlag}`);
      }
    }

    console.log();
  }

  // Summary
  console.log('='.repeat(50));
  console.log(`Graphs: ${graphs.length} | Issues: ${totalIssues} | Warnings: ${totalWarnings}`);

  if (totalIssues === 0) {
    console.log('\nAll graphs valid.');
  } else {
    console.log(`\n${totalIssues} issue(s) found.`);
    process.exit(1);
  }
}

main();
