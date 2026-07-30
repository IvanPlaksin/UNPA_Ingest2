'use strict';

/**
 * Contract 4B — interpreter node registry (data + guards).
 *
 * The universal flow-as-data interpreter executes a linear DAG of these nodes,
 * re-executed per turn against the DraftSR (SessionEnvelope). This module is the
 * canonical registry; it validates against interpreter-nodes.schema.json.
 *
 * @module instances/flowdesk/contracts/interpreter-nodes
 */

/** @type {{nodes: Array}} */
const REGISTRY = {
  nodes: [
    { id: 'LOAD_DRAFT',       kind: 'deterministic', llmMethods: [],                            tools: ['draft.get'] },
    { id: 'ROUTER',           kind: 'hybrid',        llmMethods: ['embedding', 'structuredOutput'], tools: [] },
    { id: 'RESOLVE',          kind: 'deterministic', llmMethods: [],                            tools: ['resolve.search'] },
    { id: 'INTAKE_DECOMPOSE', kind: 'llm',           llmMethods: ['structuredOutput'],          tools: [] },
    { id: 'SLOT_EXTRACT',     kind: 'llm',           llmMethods: ['structuredOutput'],          tools: [] },
    { id: 'ACTIVE_SLOTS',     kind: 'deterministic', llmMethods: [],                            tools: [] },
    { id: 'RESOLVERS',        kind: 'deterministic', llmMethods: [],                            tools: ['catalog.resolvers', 'inventory.check'] },
    { id: 'VALIDATE',         kind: 'deterministic', llmMethods: [],                            tools: [] },
    { id: 'PATCH',            kind: 'deterministic', llmMethods: [],                            tools: ['draft.patch'] },
    { id: 'TERM_CHECK',       kind: 'deterministic', llmMethods: [],                            tools: [] },
    { id: 'QUESTION_PLANNER', kind: 'llm',           llmMethods: ['completion'],                tools: [] },
    { id: 'INFO_ANSWER',      kind: 'llm',           llmMethods: ['completion'],                tools: ['resolve.search', 'inventory.check'], readOnly: true },
    { id: 'CONFIRM',          kind: 'human',         llmMethods: [],                            tools: ['draft.get'] },
    { id: 'SUBMIT',           kind: 'deterministic', llmMethods: [],                            tools: ['draft.submit', 'sr.create'] },
  ],
};

const NODE_BY_ID = new Map(REGISTRY.nodes.map((n) => [n.id, n]));

/** NODE_TOOLS whitelist map: nodeId → toolId[] */
const NODE_TOOLS = Object.fromEntries(REGISTRY.nodes.map((n) => [n.id, n.tools]));

const READ_ONLY_TOOLS = new Set(['draft.get', 'resolve.search', 'catalog.resolvers', 'inventory.check']);

/**
 * Guard: assert a node is permitted to call a tool. Throws on violation.
 * This is the deterministic guardrail — tools are bound to nodes by the graph,
 * not chosen freely by the model.
 */
function assertToolAllowed(nodeId, toolId) {
  const node = NODE_BY_ID.get(nodeId);
  if (!node) throw new Error(`[interpreter] unknown node: ${nodeId}`);
  if (!node.tools.includes(toolId)) {
    throw new Error(`[interpreter] node ${nodeId} may not call tool ${toolId} (allowed: ${node.tools.join(', ') || 'none'})`);
  }
  if (node.readOnly && !READ_ONLY_TOOLS.has(toolId)) {
    throw new Error(`[interpreter] node ${nodeId} is read-only and may not call side-effecting tool ${toolId}`);
  }
  return true;
}

/**
 * Invoke a tool from a node through the whitelist guard.
 * @param {string} nodeId
 * @param {string} toolId
 * @param {Object} args
 * @param {Object} toolImpls - map toolId → async fn(args)
 */
async function callTool(nodeId, toolId, args, toolImpls) {
  assertToolAllowed(nodeId, toolId);
  const impl = toolImpls && toolImpls[toolId];
  if (typeof impl !== 'function') throw new Error(`[interpreter] no impl for tool ${toolId}`);
  return impl(args);
}

/** Assert a node is permitted to call an LLM method. Throws on violation. */
function assertLLMMethodAllowed(nodeId, method) {
  const node = NODE_BY_ID.get(nodeId);
  if (!node) throw new Error(`[interpreter] unknown node: ${nodeId}`);
  if (!node.llmMethods.includes(method)) {
    throw new Error(`[interpreter] node ${nodeId} may not use LLM method ${method} (allowed: ${node.llmMethods.join(', ') || 'none'})`);
  }
  return true;
}

module.exports = {
  REGISTRY,
  NODE_BY_ID,
  NODE_TOOLS,
  READ_ONLY_TOOLS,
  assertToolAllowed,
  assertLLMMethodAllowed,
  callTool,
};
