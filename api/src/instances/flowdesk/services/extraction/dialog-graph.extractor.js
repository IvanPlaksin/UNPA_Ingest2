/**
 * FlowDesk Dialog Graph Importer
 *
 * Imports dialog/process graph definitions from JSON files.
 * Creates DraftWorkflow nodes with states, transitions, actors.
 *
 * @module services/workspace/extraction/flowdesk/dialog-graph
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[DialogGraphExtractor]';
const GRAPHS_DIR = path.resolve(__dirname, '../../../../services/flowdesk/graphs');

/**
 * Import all FlowDesk graph definitions → DraftWorkflow
 * @param {Object} [options]
 * @param {string} [options.graphsDir] - Override graphs directory
 * @returns {Promise<{success, workflows[], stats, log[]}>}
 */
async function extractDialogGraphs(options = {}) {
  const graphsDir = options.graphsDir || GRAPHS_DIR;
  const log = [];
  const addLog = (msg) => log.push({ timestamp: new Date().toISOString(), step: 'DIALOG_GRAPH', message: msg });
  const workflows = [];

  try {
    if (!fs.existsSync(graphsDir)) {
      addLog(`Graphs directory not found: ${graphsDir}`);
      return { success: true, workflows: [], stats: { total: 0 }, log };
    }

    const files = fs.readdirSync(graphsDir).filter(f => f.endsWith('.json') || f.endsWith('.graph.json'));
    addLog(`Found ${files.length} graph files in ${graphsDir}`);

    for (const file of files) {
      try {
        const filePath = path.join(graphsDir, file);
        const graphData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const workflow = convertGraphToWorkflow(graphData, file);
        if (workflow) {
          workflows.push(workflow);
          addLog(`Imported: ${file} → ${workflow.name} (${workflow.content.states.length} states, ${workflow.content.transitions.length} transitions)`);
        }
      } catch (err) {
        addLog(`Failed to parse ${file}: ${err.message}`);
      }
    }

    addLog(`Total: ${workflows.length} workflows imported`);

    return {
      success: true,
      workflows,
      stats: {
        filesProcessed: files.length,
        workflowsCreated: workflows.length,
        totalStates: workflows.reduce((s, w) => s + w.content.states.length, 0),
        totalTransitions: workflows.reduce((s, w) => s + w.content.transitions.length, 0)
      },
      log
    };
  } catch (error) {
    addLog(`ERROR: ${error.message}`);
    return { success: false, error: error.message, workflows: [], log };
  }
}

/**
 * Convert a graph JSON to DraftWorkflow format
 */
function convertGraphToWorkflow(graphData, filename) {
  // Handle different graph formats
  const nodes = graphData.nodes || graphData.definition?.nodes || [];
  const edges = graphData.edges || graphData.definition?.edges || [];
  const meta = graphData.metadata || graphData.meta || {};

  if (nodes.length === 0) return null;

  // Extract states from nodes
  const states = nodes
    .filter(n => !n.isToolRef && !n.data?.isToolRef)
    .map(node => {
      const label = node.data?.label || node.label || node.id;
      const kind = node.data?.kind || node.kind || 'intermediate';
      return {
        name: label,
        type: mapNodeKindToStateType(kind, label),
        description: node.data?.description || '',
        nodeId: node.id,
        executorId: node.data?.tool || node.data?.executorId || '',
        parameters: node.data?.parameters || {}
      };
    });

  // Extract transitions from edges
  const transitions = edges
    .filter(e => e.type !== 'USES_TOOL')
    .map(edge => {
      const sourceNode = nodes.find(n => n.id === (edge.source || edge.sourceNodeId));
      const targetNode = nodes.find(n => n.id === (edge.target || edge.targetNodeId));
      return {
        from: sourceNode?.data?.label || sourceNode?.label || edge.source,
        to: targetNode?.data?.label || targetNode?.label || edge.target,
        trigger: edge.data?.label || edge.label || edge.sourceHandle || 'next',
        guard: edge.data?.condition || '',
        action: '',
        actor: ''
      };
    });

  // Detect actors from executor types
  const actors = new Set();
  for (const state of states) {
    if (state.executorId) {
      if (state.executorId.includes('user') || state.executorId.includes('ask') || state.executorId.includes('confirm')) {
        actors.add('User');
      }
      if (state.executorId.includes('classify') || state.executorId.includes('search') || state.executorId.includes('check')) {
        actors.add('System');
      }
      if (state.executorId.includes('approval') || state.executorId.includes('assign')) {
        actors.add('Manager');
      }
    }
  }

  const workflowName = meta.name || meta.title || filename.replace('.graph.json', '').replace('.json', '').replace(/-/g, ' ');

  return {
    type: 'workflow',
    name: workflowName,
    description: meta.description || `FlowDesk workflow: ${workflowName}`,
    confidence: 1.0,
    content: {
      name: workflowName,
      description: meta.description || '',
      triggerEvent: meta.triggerEvent || 'User initiates request',
      states,
      transitions,
      actors: [...actors],
      sla: meta.sla || {},
      metadata: {
        sourceFile: filename,
        namespace: meta.namespace || 'FLOWDESK',
        graphId: meta.id || graphData.id,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        originalFormat: graphData.definition ? 'AOPEG' : 'GXE'
      }
    }
  };
}

function mapNodeKindToStateType(kind, label) {
  const labelLower = (label || '').toLowerCase();
  if (kind === 'input' || labelLower.includes('start') || labelLower === 'wf-start') return 'INITIAL';
  if (kind === 'output' || labelLower.includes('end') || labelLower === 'wf-end') return 'FINAL';
  if (labelLower.includes('error') || labelLower.includes('fail')) return 'ERROR';
  return 'INTERMEDIATE';
}

module.exports = { extractDialogGraphs, convertGraphToWorkflow };
