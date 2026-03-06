/**
 * IngestionGraphService
 *
 * Service for recording and reading ingestion process data in Memgraph.
 * Combines B.3 (Knowledge Graph persistence) and A.5 (Session Recorder).
 *
 * Two graph domains:
 *   INGESTION_PROCESS — meta-information about the extraction process itself
 *   INGESTION         — extracted knowledge (entities, rules, relationships)
 */

const { v4: uuidv4 } = require('uuid');

class IngestionGraphService {
  /**
   * @param {Object} memgraphService - Memgraph service instance with runQuery() method
   */
  constructor(memgraphService) {
    this.mg = memgraphService;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SESSION RECORDING (A.5)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a new ingestion session.
   */
  async createSession(sessionData) {
    const id = sessionData.id || uuidv4();
    await this.mg.runQuery(`
      CREATE (s:IngestionSession {
        id: $id,
        sourceDatabase: $sourceDatabase,
        sourceType: $sourceType,
        sourceServer: $sourceServer,
        startedAt: $startedAt,
        status: 'running',
        namespace: 'Core',
        label: 'INGESTION_PROCESS'
      })
    `, {
      id,
      sourceDatabase: sessionData.sourceDatabase || '',
      sourceType: sessionData.sourceType || 'mssql',
      sourceServer: sessionData.sourceServer || '',
      startedAt: new Date().toISOString(),
    });

    return id;
  }

  /**
   * Complete a session with summary data.
   */
  async completeSession(sessionId, summary) {
    await this.mg.runQuery(`
      MATCH (s:IngestionSession {id: $sessionId})
      SET s.completedAt = $completedAt,
          s.status = $status,
          s.qualityScore = $qualityScore,
          s.coveragePercent = $coveragePercent,
          s.tablesProcessed = $tablesProcessed,
          s.entitiesDiscovered = $entitiesDiscovered,
          s.rulesExtracted = $rulesExtracted,
          s.tokensUsed = $tokensUsed,
          s.durationMs = $durationMs
    `, {
      sessionId,
      completedAt: new Date().toISOString(),
      status: summary.status || 'complete',
      qualityScore: summary.qualityScore || 0,
      coveragePercent: summary.coveragePercent || 0,
      tablesProcessed: summary.tablesProcessed || 0,
      entitiesDiscovered: summary.entitiesDiscovered || 0,
      rulesExtracted: summary.rulesExtracted || 0,
      tokensUsed: summary.tokensUsed || 0,
      durationMs: summary.durationMs || 0,
    });
  }

  /**
   * Record a phase.
   */
  async recordPhase(sessionId, phaseData) {
    const id = phaseData.id || uuidv4();
    await this.mg.runQuery(`
      MATCH (s:IngestionSession {id: $sessionId})
      CREATE (p:IngestionPhase {
        id: $id,
        sessionId: $sessionId,
        phaseNumber: $phaseNumber,
        phaseName: $phaseName,
        startedAt: $startedAt,
        completedAt: $completedAt,
        status: $status,
        durationMs: $durationMs,
        itemsProcessed: $itemsProcessed,
        tokensUsed: $tokensUsed,
        toolCalls: $toolCalls,
        llmCalls: $llmCalls,
        errorMessage: $errorMessage
      })
      CREATE (s)-[:HAS_PHASE {order: $phaseNumber}]->(p)
    `, {
      id,
      sessionId,
      phaseNumber: phaseData.step ?? phaseData.phaseNumber ?? 0,
      phaseName: phaseData.phaseName || phaseData.phaseId || '',
      startedAt: phaseData.startedAt || '',
      completedAt: phaseData.completedAt || '',
      status: phaseData.status || 'complete',
      durationMs: phaseData.durationMs || 0,
      itemsProcessed: phaseData.tablesProcessed || phaseData.itemsProcessed || 0,
      tokensUsed: phaseData.tokensUsed || 0,
      toolCalls: phaseData.toolCalls || 0,
      llmCalls: phaseData.llmCalls || 0,
      errorMessage: phaseData.error || phaseData.errorMessage || '',
    });

    return id;
  }

  /**
   * Record an agent step.
   */
  async recordStep(phaseId, stepData) {
    const id = uuidv4();
    await this.mg.runQuery(`
      MATCH (p:IngestionPhase {id: $phaseId})
      CREATE (s:AgentStep {
        id: $id,
        phaseId: $phaseId,
        stepNumber: $stepNumber,
        stepType: $stepType,
        toolName: $toolName,
        inputSummary: $inputSummary,
        outputSummary: $outputSummary,
        reasoning: $reasoning,
        confidence: $confidence,
        durationMs: $durationMs,
        tokensIn: $tokensIn,
        tokensOut: $tokensOut,
        timestamp: $timestamp
      })
      CREATE (p)-[:HAS_STEP {order: $stepNumber}]->(s)
    `, {
      id,
      phaseId,
      stepNumber: stepData.stepNumber || 0,
      stepType: stepData.stepType || 'tool_call',
      toolName: stepData.toolName || '',
      inputSummary: (stepData.inputSummary || '').slice(0, 2000),
      outputSummary: (stepData.outputSummary || '').slice(0, 2000),
      reasoning: stepData.reasoning || '',
      confidence: stepData.confidence || 0,
      durationMs: stepData.durationMs || 0,
      tokensIn: stepData.tokensIn || 0,
      tokensOut: stepData.tokensOut || 0,
      timestamp: new Date().toISOString(),
    });

    return id;
  }

  /**
   * Record a prompt for reproducibility.
   */
  async recordPrompt(stepId, promptData) {
    const id = uuidv4();
    await this.mg.runQuery(`
      MATCH (s:AgentStep {id: $stepId})
      CREATE (p:PromptRecord {
        id: $id,
        stepId: $stepId,
        promptType: $promptType,
        promptTemplate: $promptTemplate,
        promptVariables: $promptVariables,
        responseRaw: $responseRaw,
        responseParsed: $responseParsed,
        qualityRating: $qualityRating
      })
      CREATE (s)-[:USED_PROMPT]->(p)
    `, {
      id,
      stepId,
      promptType: promptData.promptType || '',
      promptTemplate: (promptData.promptTemplate || '').slice(0, 5000),
      promptVariables: JSON.stringify(promptData.promptVariables || {}),
      responseRaw: (promptData.responseRaw || '').slice(0, 10000),
      responseParsed: JSON.stringify(promptData.responseParsed || {}),
      qualityRating: promptData.qualityRating || 0,
    });

    return id;
  }

  /**
   * Record an agent decision.
   */
  async recordDecision(stepId, decisionData) {
    const id = uuidv4();
    await this.mg.runQuery(`
      MATCH (s:AgentStep {id: $stepId})
      CREATE (d:AgentDecision {
        id: $id,
        stepId: $stepId,
        decisionType: $decisionType,
        subject: $subject,
        optionsConsidered: $optionsConsidered,
        chosenOption: $chosenOption,
        reasoning: $reasoning,
        confidence: $confidence
      })
      CREATE (s)-[:MADE_DECISION]->(d)
    `, {
      id,
      stepId,
      decisionType: decisionData.decisionType || '',
      subject: decisionData.subject || '',
      optionsConsidered: JSON.stringify(decisionData.optionsConsidered || []),
      chosenOption: decisionData.chosenOption || '',
      reasoning: decisionData.reasoning || '',
      confidence: decisionData.confidence || 0,
    });

    return id;
  }

  /**
   * Record a metric.
   */
  async recordMetric(sessionId, phaseId, metricData) {
    const id = uuidv4();
    await this.mg.runQuery(`
      MATCH (s:IngestionSession {id: $sessionId})
      CREATE (m:ExtractionMetric {
        id: $id,
        sessionId: $sessionId,
        phaseId: $phaseId,
        metricName: $metricName,
        metricValue: $metricValue,
        metricUnit: $metricUnit,
        context: $context,
        timestamp: $timestamp
      })
      CREATE (s)-[:HAS_METRIC]->(m)
    `, {
      id,
      sessionId,
      phaseId: phaseId || '',
      metricName: metricData.metricName || '',
      metricValue: metricData.metricValue || 0,
      metricUnit: metricData.metricUnit || '',
      context: JSON.stringify(metricData.context || {}),
      timestamp: new Date().toISOString(),
    });

    return id;
  }

  /**
   * Record a table profile.
   */
  async recordTableProfile(sessionId, profile) {
    const id = uuidv4();
    await this.mg.runQuery(`
      MATCH (s:IngestionSession {id: $sessionId})
      CREATE (t:TableProfile {
        id: $id,
        sessionId: $sessionId,
        schemaName: $schemaName,
        tableName: $tableName,
        rowCount: $rowCount,
        columnCount: $columnCount,
        fkInbound: $fkInbound,
        fkOutbound: $fkOutbound,
        signals: $signals,
        classifiedAs: $classifiedAs,
        confidence: $confidence,
        samplingStrategy: $samplingStrategy
      })
      CREATE (s)-[:PROFILED_TABLE]->(t)
    `, {
      id,
      sessionId,
      schemaName: profile.schemaName || profile.schema || '',
      tableName: profile.tableName || '',
      rowCount: profile.rowCount || 0,
      columnCount: profile.columnCount || 0,
      fkInbound: profile.fkInbound || 0,
      fkOutbound: profile.fkOutbound || 0,
      signals: JSON.stringify(profile.signals || []),
      classifiedAs: profile.classifiedAs || profile.tableType || 'unknown',
      confidence: profile.confidence || 0,
      samplingStrategy: profile.samplingStrategy || '',
    });

    return id;
  }

  /**
   * Record a meta-learning link between sessions.
   */
  async recordLearningLink(fromSessionId, toSessionId, relevanceScore) {
    await this.mg.runQuery(`
      MATCH (from:IngestionSession {id: $fromId})
      MATCH (to:IngestionSession {id: $toId})
      CREATE (from)-[:LEARNED_FROM {relevanceScore: $score}]->(to)
    `, {
      fromId: fromSessionId,
      toId: toSessionId,
      score: relevanceScore,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // KNOWLEDGE GRAPH PERSISTENCE (B.3)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Save a knowledge graph (nodes + edges) to Memgraph.
   */
  async saveKnowledgeGraph(sessionId, graphType, graph) {
    const graphId = uuidv4();

    // Create graph container
    await this.mg.runQuery(`
      CREATE (g:KnowledgeGraph {
        id: $graphId,
        sessionId: $sessionId,
        graphType: $graphType,
        createdAt: $createdAt,
        nodeCount: $nodeCount,
        edgeCount: $edgeCount,
        namespace: 'Core',
        label: 'INGESTION'
      })
    `, {
      graphId,
      sessionId,
      graphType,
      createdAt: new Date().toISOString(),
      nodeCount: graph.nodes?.length || 0,
      edgeCount: graph.edges?.length || 0,
    });

    // Link to session
    await this.mg.runQuery(`
      MATCH (s:IngestionSession {id: $sessionId})
      MATCH (g:KnowledgeGraph {id: $graphId})
      CREATE (s)-[:PRODUCED_GRAPH {graphType: $graphType}]->(g)
    `, { sessionId, graphId, graphType });

    // Save nodes
    for (const node of graph.nodes || []) {
      await this._saveNode(graphId, node);
    }

    // Save edges
    for (const edge of graph.edges || []) {
      await this._saveEdge(graphId, edge);
    }

    return graphId;
  }

  async _saveNode(graphId, node) {
    const nodeId = node.id || uuidv4();
    const kind = node.data?.kind || node.data?.tableType || 'default';
    const nodeLabel = this._mapNodeLabel(kind);

    // Flatten data into properties, serializing arrays/objects
    const props = { id: nodeId, graphId };
    if (node.data) {
      for (const [key, value] of Object.entries(node.data)) {
        if (value === null || value === undefined) continue;
        props[key] = typeof value === 'object' ? JSON.stringify(value) : value;
      }
    }

    const propsStr = Object.keys(props).map(k => `${k}: $${k}`).join(', ');

    try {
      await this.mg.runQuery(`
        MATCH (g:KnowledgeGraph {id: $graphId})
        CREATE (n:${nodeLabel} {${propsStr}})
        CREATE (g)-[:CONTAINS]->(n)
      `, props);
    } catch (err) {
      console.warn(`[IngestionGraph] Failed to save node ${nodeId}: ${err.message}`);
    }
  }

  async _saveEdge(graphId, edge) {
    const edgeType = this._mapEdgeType(edge.label || edge.type || 'RELATES_TO');

    try {
      await this.mg.runQuery(`
        MATCH (source {id: $sourceId, graphId: $graphId})
        MATCH (target {id: $targetId, graphId: $graphId})
        CREATE (source)-[:${edgeType}]->(target)
      `, {
        graphId,
        sourceId: edge.source,
        targetId: edge.target,
      });
    } catch (err) {
      // Silently skip — edges may reference nodes that failed to save
    }
  }

  _mapNodeLabel(kind) {
    const mapping = {
      entity: 'BusinessEntity',
      attribute: 'EntityAttribute',
      rule: 'BusinessRule',
      businessRule: 'BusinessRule',
      calculation: 'Calculation',
      enumeration: 'Enumeration',
      procedure: 'StoredProcedureKG',
      table: 'DatabaseTable',
      database: 'DatabaseTable',
      schema: 'DatabaseTable',
      column: 'EntityAttribute',
      anomaly: 'DiscoveredAnomaly',
      lifecycleRoot: 'BusinessEntity',
      lifecycleState: 'LifecycleState',
    };
    return mapping[kind] || 'KnowledgeNode';
  }

  _mapEdgeType(type) {
    const clean = type.replace(/[^A-Za-z_]/g, '_').toUpperCase();
    return clean || 'RELATES_TO';
  }

  // ═══════════════════════════════════════════════════════════════════
  // READING
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get session with all phases.
   */
  async getSession(sessionId) {
    const result = await this.mg.runQuery(`
      MATCH (s:IngestionSession {id: $sessionId})
      OPTIONAL MATCH (s)-[:HAS_PHASE]->(p:IngestionPhase)
      RETURN s, collect(p) as phases
    `, { sessionId });

    if (!result || result.length === 0) return null;

    const row = result[0];
    return {
      ...this._nodeProps(row.s || row),
      phases: (row.phases || []).map(p => this._nodeProps(p)),
    };
  }

  /**
   * List sessions for a database.
   */
  async getSessionsForDatabase(sourceDatabase) {
    const result = await this.mg.runQuery(`
      MATCH (s:IngestionSession)
      WHERE s.sourceDatabase = $db
      RETURN s
      ORDER BY s.startedAt DESC
      LIMIT 50
    `, { db: sourceDatabase });

    return (result || []).map(r => this._nodeProps(r.s || r));
  }

  /**
   * Get all completed sessions (for meta-learning).
   */
  async getCompletedSessions(limit = 20) {
    const result = await this.mg.runQuery(`
      MATCH (s:IngestionSession)
      WHERE s.status = 'complete'
      RETURN s
      ORDER BY s.qualityScore DESC
      LIMIT $limit
    `, { limit });

    return (result || []).map(r => this._nodeProps(r.s || r));
  }

  /**
   * Get knowledge graph with nodes and edges.
   */
  async getKnowledgeGraph(graphId) {
    const nodesResult = await this.mg.runQuery(`
      MATCH (g:KnowledgeGraph {id: $graphId})-[:CONTAINS]->(n)
      RETURN n, labels(n) as nodeLabels
    `, { graphId });

    const nodes = (nodesResult || []).map(r => ({
      ...this._nodeProps(r.n || r),
      type: (r.nodeLabels || [])[0] || 'KnowledgeNode',
    }));

    const edgesResult = await this.mg.runQuery(`
      MATCH (g:KnowledgeGraph {id: $graphId})-[:CONTAINS]->(src)
      MATCH (src)-[r]->(tgt)
      WHERE (g)-[:CONTAINS]->(tgt)
      RETURN src.id as sourceId, tgt.id as targetId, type(r) as relType
    `, { graphId });

    const edges = (edgesResult || []).map(r => ({
      source: r.sourceId,
      target: r.targetId,
      type: r.relType,
    }));

    return { nodes, edges };
  }

  /**
   * Extract properties from a Memgraph node result.
   */
  _nodeProps(node) {
    if (!node) return {};
    return node.properties || node;
  }
}

module.exports = { IngestionGraphService };
