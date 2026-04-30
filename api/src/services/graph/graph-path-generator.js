/**
 * Graph Path Generator — generates all possible execution paths with
 * test data reverse-engineered from condition expressions.
 *
 * For each condition branch, analyzes the expression to determine what
 * upstream executor outputs are needed, then generates test inputs that
 * will produce those outputs.
 */

'use strict';

class GraphPathGenerator {

  constructor(nodes, edges) {
    this.nodes = new Map(nodes.map(n => [n.id, n]));
    this.edges = edges;
    this.outgoing = new Map();
    this.incoming = new Map();

    for (const e of edges) {
      const src = e.source || e.sourceNodeId;
      const tgt = e.target || e.targetNodeId;
      if (!this.outgoing.has(src)) this.outgoing.set(src, []);
      this.outgoing.get(src).push(e);
      if (!this.incoming.has(tgt)) this.incoming.set(tgt, []);
      this.incoming.get(tgt).push(e);
    }
  }

  generateAllPaths() {
    const startNode = [...this.nodes.values()].find(n => {
      const kind = n.data?.kind || n.data?.type || '';
      return kind === 'input' || n.data?.tool === 'workflow.start';
    });
    if (!startNode) throw new Error('No start node found');

    const paths = [];
    this._dfs(startNode.id, [], [], [], new Set(), paths);
    return paths.map((p, i) => this._buildTestScenario(p, i));
  }

  /**
   * DFS traversal — fork at conditions, track required branch constraints
   */
  _dfs(nodeId, currentPath, currentTurns, currentConstraints, visited, allPaths) {
    if (visited.has(nodeId)) return;

    const node = this.nodes.get(nodeId);
    if (!node) return;

    const newVisited = new Set(visited);
    newVisited.add(nodeId);
    const newPath = [...currentPath, nodeId];

    const kind = node.data?.kind || node.data?.type || '';
    const tool = node.data?.tool || node.data?.executorId || '';
    const isEnd = kind === 'output' || tool === 'workflow.end';
    const isCondition = kind === 'condition' || tool === 'workflow.condition';
    const isWait = node.data?.waitForInput || node.data?.config?.waitForInput;
    const isStart = kind === 'input' || tool === 'workflow.start';

    let newTurns = [...currentTurns];
    if (isWait && !isStart) {
      newTurns.push({
        nodeId,
        label: node.data?.label || nodeId,
        prompt: node.data?.config?.prompt || '',
        choices: node.data?.config?.choices || [],
        inputType: node.data?.config?.inputType || 'text',
        tool,
      });
    }

    if (isEnd) {
      allPaths.push({ nodes: newPath, turns: newTurns, constraints: [...currentConstraints], endNode: nodeId, endLabel: node.data?.label || nodeId });
      return;
    }

    const outEdges = this.outgoing.get(nodeId) || [];
    if (outEdges.length === 0) {
      allPaths.push({ nodes: newPath, turns: newTurns, constraints: [...currentConstraints], endNode: nodeId, endLabel: (node.data?.label || nodeId) + ' (dead end)' });
      return;
    }

    if (isCondition) {
      const expression = node.data?.config?.expression || '';
      for (const edge of outEdges) {
        const branchLabel = edge.label || edge.data?.label || 'unknown';
        const targetId = edge.target || edge.targetNodeId;
        const constraint = this._extractConstraint(nodeId, node, expression, branchLabel);
        this._dfs(targetId, newPath, newTurns, [...currentConstraints, constraint], newVisited, allPaths);
      }
    } else {
      for (const edge of outEdges) {
        this._dfs(edge.target || edge.targetNodeId, newPath, newTurns, currentConstraints, newVisited, allPaths);
      }
    }
  }

  /**
   * Extract constraint from condition expression for a specific branch
   */
  _extractConstraint(condNodeId, condNode, expression, branchLabel) {
    // Parse expression to find what node output fields are checked
    // e.g., "N06.confidence === 'high'" → needs N06 to output confidence: 'high'
    const constraint = {
      conditionNode: condNodeId,
      conditionLabel: condNode.data?.label || condNodeId,
      branch: branchLabel,
      expression,
      requiredOutputs: {},  // nodeId → { field: value }
      requiredUserInputs: {}, // nodeId → value (for dialog nodes)
    };

    // Extract NodeID.field references from expression
    const refPattern = /(\w+)\.(\w+)\s*===?\s*['"]([\w_]+)['"]/g;
    const numPattern = /(\w+)\.(\w+)\s*>=?\s*([\d.]+)/g;
    const nullPattern = /(\w+)\.(\w+)\s*!=\s*null/g;

    let match;

    // String comparisons: N06.confidence === 'high'
    while ((match = refPattern.exec(expression)) !== null) {
      const [, nodeRef, field, value] = match;
      if (this.nodes.has(nodeRef)) {
        if (!constraint.requiredOutputs[nodeRef]) constraint.requiredOutputs[nodeRef] = {};
        constraint.requiredOutputs[nodeRef][field] = value;
      }
    }

    // Numeric comparisons: N06.score >= 0.85
    while ((match = numPattern.exec(expression)) !== null) {
      const [, nodeRef, field, value] = match;
      if (this.nodes.has(nodeRef)) {
        if (!constraint.requiredOutputs[nodeRef]) constraint.requiredOutputs[nodeRef] = {};
        constraint.requiredOutputs[nodeRef][field] = parseFloat(value);
      }
    }

    // Null checks: N16.beneficiary != null
    while ((match = nullPattern.exec(expression)) !== null) {
      const [, nodeRef, field] = match;
      if (this.nodes.has(nodeRef)) {
        if (!constraint.requiredOutputs[nodeRef]) constraint.requiredOutputs[nodeRef] = {};
        constraint.requiredOutputs[nodeRef][field] = branchLabel === 'true' || branchLabel === 'found' ? '__NOT_NULL__' : null;
      }
    }

    return constraint;
  }

  /**
   * Build test scenario with inputs reverse-engineered from constraints
   */
  _buildTestScenario(path, index) {
    // Analyze constraints to determine what test inputs are needed
    const inputMap = this._reverseEngineerInputs(path);

    // T1: initial request
    const firstWait = path.turns.length > 0 ? path.turns[0].nodeId : null;
    const scenarioTurns = [{
      message: inputMap.initialMessage || 'I need a new laptop',
      description: 'Initial request',
      expectedWait: firstWait,
      expectedPathContains: firstWait ? [path.nodes[0], firstWait] : [path.nodes[0]],
      expectedComplete: path.turns.length === 0,
    }];

    // Subsequent turns
    for (let ti = 0; ti < path.turns.length; ti++) {
      const turn = path.turns[ti];
      const nextWait = ti + 1 < path.turns.length ? path.turns[ti + 1].nodeId : null;
      const testValue = inputMap.turnInputs[turn.nodeId] || this._generateFallbackInput(turn, ti);

      scenarioTurns.push({
        message: testValue,
        description: `${turn.label}: ${testValue}`,
        nodeId: turn.nodeId,
        expectedWait: nextWait,
        expectedPathContains: [turn.nodeId],
        expectedComplete: !nextWait,
      });
    }

    // Condition branches description
    const conditionBranches = path.constraints.map(c => `${c.conditionLabel}=${c.branch}`);

    return {
      name: `Path ${index + 1}: ${conditionBranches.join(', ')} → ${path.endLabel}`,
      pathNodes: path.nodes,
      endNode: path.endNode,
      endLabel: path.endLabel,
      conditionBranches,
      constraints: path.constraints,
      turns: scenarioTurns,
      totalNodes: path.nodes.length,
      inputMap,
    };
  }

  /**
   * Reverse-engineer test inputs from path constraints
   */
  _reverseEngineerInputs(path) {
    const result = {
      initialMessage: 'I need a new laptop',  // default
      turnInputs: {},  // nodeId → test value
      notes: [],
    };

    // Analyze each constraint to determine what user inputs are needed
    for (const constraint of path.constraints) {
      const { conditionLabel, branch, requiredOutputs } = constraint;

      for (const [nodeRef, fields] of Object.entries(requiredOutputs)) {
        const refNode = this.nodes.get(nodeRef);
        if (!refNode) continue;
        const tool = refNode.data?.tool || '';
        const label = (refNode.data?.label || '').toLowerCase();

        // Map executor output requirements to user input values
        if (tool === 'flowdesk.classify_intent' || label.includes('classif')) {
          // Classification confidence depends on initial message quality
          if (fields.confidence === 'high' || fields.score >= 0.85 || branch === 'high') {
            result.initialMessage = 'I need a new laptop';  // clear intent → high confidence
          } else if (fields.confidence === 'medium' || branch === 'medium') {
            result.initialMessage = 'computer stuff help please';
            result.notes.push('CANNOT TEST: medium confidence requires semantic classifier (keyword always returns high for known terms)');
          } else if (fields.confidence === 'low' || branch === 'low') {
            result.initialMessage = 'something for work';
            result.notes.push('CANNOT TEST: low confidence requires semantic classifier');
          } else if (branch === 'unclassified') {
            result.initialMessage = 'asdfghjkl';
            result.notes.push('CANNOT TEST: unclassified requires all classifiers to fail');
          }
        }

        if (tool === 'flowdesk.ask_beneficiary' || label.includes('beneficiary') || label.includes('for-whom')) {
          // Find the dialog node that feeds this condition
          const dialogNode = this._findUpstreamDialogNode(constraint.conditionNode);
          if (dialogNode) {
            if (branch === 'self_current' || branch === 'self') {
              result.turnInputs[dialogNode] = 'myself';
            } else if (branch === 'self_different' || branch === 'different') {
              result.turnInputs[dialogNode] = 'different';
            } else if (branch === 'other') {
              result.turnInputs[dialogNode] = 'other';
            }
          }
        }

        if (tool === 'flowdesk.find_user' || label.includes('find')) {
          const dialogNode = this._findUpstreamDialogNode(constraint.conditionNode);
          if (dialogNode) {
            if (branch === 'true' || branch === 'found') {
              result.turnInputs[dialogNode] = 'Donika Gjaka';  // known user in KB
              result.notes.push('Beneficiary found: using known user');
            } else if (branch === 'false' || branch === 'not_found') {
              result.turnInputs[dialogNode] = 'Nonexistent Person XYZ123';
              result.notes.push('Beneficiary not found: using fake name');
            }
          }
        }

        if (tool === 'flowdesk.search_location' || label.includes('location')) {
          const dialogNode = this._findUpstreamDialogNode(constraint.conditionNode);
          if (dialogNode) {
            if (branch === 'true' || branch === 'found') {
              result.turnInputs[dialogNode] = 'Brindisi';  // known location
              result.notes.push('Location found: using known location');
            } else if (branch === 'false' || branch === 'not_found') {
              result.turnInputs[dialogNode] = 'Nonexistent City XYZ';
              result.notes.push('Location not found: using fake location');
            }
          }
        }

        if (tool === 'flowdesk.confirm_request' || label.includes('confirm')) {
          const dialogNode = this._findUpstreamDialogNode(constraint.conditionNode);
          if (dialogNode) {
            if (branch === 'true' || branch === 'create' || branch === 'confirmed') {
              result.turnInputs[dialogNode] = 'confirm';
            } else if (branch === 'edit') {
              result.turnInputs[dialogNode] = 'edit';
            } else if (branch === 'false' || branch === 'cancel') {
              result.turnInputs[dialogNode] = 'cancel';
            }
          }
        }

        if (tool === 'flowdesk.check_location' || label.includes('profile') || label.includes('load')) {
          // Profile check depends on userId — can't easily control
          if (branch === 'false' || branch === 'failed') {
            result.notes.push('CANNOT TEST: profile failure requires non-existent userId');
          }
        }
      }
    }

    // Fill remaining dialog nodes with sensible defaults
    for (const turn of path.turns) {
      if (!result.turnInputs[turn.nodeId]) {
        result.turnInputs[turn.nodeId] = this._generateFallbackInput(turn, 0);
      }
    }

    return result;
  }

  /**
   * Find the dialog node (waitForInput) that feeds a condition
   */
  _findUpstreamDialogNode(condNodeId) {
    // Walk backward from condition to find nearest waitForInput node
    const queue = [condNodeId];
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      const inEdges = this.incoming.get(current) || [];
      for (const edge of inEdges) {
        const srcId = edge.source || edge.sourceNodeId;
        const srcNode = this.nodes.get(srcId);
        if (!srcNode) continue;
        if (srcNode.data?.waitForInput || srcNode.data?.config?.waitForInput) {
          return srcId;
        }
        queue.push(srcId);
      }
    }
    return null;
  }

  _generateFallbackInput(turn, turnIndex) {
    const { choices, label, tool } = turn;
    if (choices && choices.length > 0) {
      return typeof choices[0] === 'string' ? choices[0] : choices[0].value || choices[0].label;
    }
    if (tool === 'flowdesk.ask_beneficiary') return 'myself';
    if (tool === 'flowdesk.find_user') return 'Donika Gjaka';
    if (tool === 'flowdesk.search_location') return 'Brindisi';
    if (tool === 'flowdesk.confirm_request') return 'confirm';
    return 'yes';
  }
}

async function generatePathsForGraph(graphId) {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver(
    process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph',
      process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123'
    ),
    { disableLosslessIntegers: true }
  );
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });

  try {
    const r = await session.run(
      `MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
       WHERE c.entryId = $gid OR c.id = $gid
       RETURN g.nodes AS nodes, g.edges AS edges, v.versionNumber AS ver, c.name AS name
       ORDER BY v.versionNumber DESC LIMIT 1`,
      { gid: graphId }
    );

    if (!r.records.length) throw new Error(`Graph not found: ${graphId}`);

    const nodes = JSON.parse(r.records[0].get('nodes')).filter(n => !n.data?.isToolRef);
    const edges = JSON.parse(r.records[0].get('edges')).filter(e => e.label !== 'USES_TOOL');

    const generator = new GraphPathGenerator(nodes, edges);
    const paths = generator.generateAllPaths();

    return {
      graphId,
      graphName: r.records[0].get('name'),
      version: r.records[0].get('ver'),
      totalNodes: nodes.length,
      totalEdges: edges.length,
      totalPaths: paths.length,
      testable: paths.filter(p => !p.inputMap.notes.some(n => n.startsWith('CANNOT TEST'))).length,
      untestable: paths.filter(p => p.inputMap.notes.some(n => n.startsWith('CANNOT TEST'))).length,
      paths,
    };
  } finally {
    await session.close();
    await driver.close();
  }
}

module.exports = { GraphPathGenerator, generatePathsForGraph };
