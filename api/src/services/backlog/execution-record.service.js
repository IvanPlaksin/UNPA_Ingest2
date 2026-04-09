const { v4: uuidv4 } = require('uuid');
const memgraph = require('../memgraph.service');

class ExecutionRecordService {
  async startExecution(backlogId, executedBy) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const query = `
      MATCH (b:BackLogItem {backlogId: $backlogId})
      CREATE (e:ExecutionRecord {id: $id, backlogId: $backlogId, namespace: 'CORE',
        nodeType: 'ExecutionRecord', status: 'IN_PROGRESS', startedAt: $now, executedBy: $executedBy,
        summary: '', completedAt: '', filesCreated: '[]', filesModified: '[]', acceptanceCriteriaMet: '[]'})
      CREATE (b)-[:HAS_EXECUTION]->(e)
      RETURN e
    `;
    const result = await memgraph.runQuery(query, { backlogId, id, now, executedBy: executedBy || 'system' });
    return result[0]?.e?.properties || { id, backlogId, status: 'IN_PROGRESS' };
  }

  async addDecision(backlogId, data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const query = `
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      CREATE (d:DecisionLog {id: $id, nodeType: 'DecisionLog', decision: $decision,
        rationale: $rationale, confidenceLevel: $confidence, decidedBy: $decidedBy, decidedAt: $now,
        alternativesConsidered: $alternatives})
      CREATE (e)-[:HAS_DECISION]->(d)
      RETURN d
    `;
    const result = await memgraph.runQuery(query, {
      backlogId, id, decision: data.decision, rationale: data.rationale,
      confidence: data.confidenceLevel || 'MEDIUM', decidedBy: data.decidedBy || 'system',
      now, alternatives: JSON.stringify(data.alternativesConsidered || [])
    });
    return result[0]?.d?.properties || { id, decision: data.decision };
  }

  async addImpactAssessment(backlogId, data) {
    const id = uuidv4();
    const query = `
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      CREATE (i:ImpactAssessment {id: $id, nodeType: 'ImpactAssessment',
        overallRisk: $risk, directImpacts: $direct, indirectImpacts: $indirect, mitigationSteps: $mitigation})
      CREATE (e)-[:HAS_IMPACT]->(i)
      RETURN i
    `;
    const result = await memgraph.runQuery(query, {
      backlogId, id, risk: data.overallRisk || 'LOW',
      direct: JSON.stringify(data.directImpacts || []),
      indirect: JSON.stringify(data.indirectImpacts || []),
      mitigation: JSON.stringify(data.mitigationSteps || [])
    });
    return result[0]?.i?.properties || { id, overallRisk: data.overallRisk };
  }

  async completeExecution(backlogId, summary, status = 'COMPLETED') {
    const now = new Date().toISOString();
    const query = `
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      SET e.status = $status, e.summary = $summary, e.completedAt = $now
      RETURN e
    `;
    const result = await memgraph.runQuery(query, { backlogId, status, summary, now });
    return result[0]?.e?.properties || { backlogId, status, summary };
  }

  /**
   * Record a file change (CREATE or MODIFY)
   */
  async recordFileChange(backlogId, changeType, filePath) {
    const field = changeType === 'CREATE' ? 'filesCreated' : 'filesModified';
    const getQ = `
      MATCH (:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      RETURN e.${field} as current
    `;
    const getR = await memgraph.runQuery(getQ, { backlogId });
    let arr = [];
    try { arr = JSON.parse(getR[0]?.current || '[]'); } catch { arr = []; }
    if (!arr.includes(filePath)) arr.push(filePath);

    await memgraph.runQuery(`
      MATCH (:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      SET e.${field} = $val
    `, { backlogId, val: JSON.stringify(arr) });

    return { field, files: arr };
  }

  /**
   * Record a graph change (node/edge/relationship created or modified)
   */
  async recordGraphChange(backlogId, data) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const query = `
      MATCH (:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      CREATE (gc:GraphChange {id: $id, nodeType: 'GraphChange',
        changeType: $changeType, description: $description,
        targetLabel: $targetLabel, targetId: $targetId,
        relationship: $relationship, createdAt: $now})
      CREATE (e)-[:HAS_GRAPH_CHANGE]->(gc)
      RETURN gc
    `;
    const result = await memgraph.runQuery(query, {
      backlogId, id, now,
      changeType: data.changeType || 'CREATE',
      description: data.description || '',
      targetLabel: data.targetLabel || '',
      targetId: data.targetId || '',
      relationship: data.relationship || ''
    });
    return result[0]?.gc?.properties || { id, ...data };
  }

  /**
   * Record a tool call made during execution
   */
  async recordToolUsage(backlogId, toolName, input, output) {
    const getQ = `
      MATCH (:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      RETURN e.toolsUsed as current
    `;
    const getR = await memgraph.runQuery(getQ, { backlogId });
    let arr = [];
    try { arr = JSON.parse(getR[0]?.current || '[]'); } catch { arr = []; }
    arr.push({
      tool: toolName,
      at: new Date().toISOString(),
      inputSummary: typeof input === 'string' ? input.substring(0, 200) : JSON.stringify(input).substring(0, 200),
      success: output?.success !== false
    });

    await memgraph.runQuery(`
      MATCH (:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      SET e.toolsUsed = $val
    `, { backlogId, val: JSON.stringify(arr) });

    return { toolsUsed: arr.length };
  }

  async getFullExecutionRecord(backlogId) {
    const query = `
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_EXECUTION]->(e:ExecutionRecord)
      OPTIONAL MATCH (e)-[:HAS_DECISION]->(d:DecisionLog)
      OPTIONAL MATCH (e)-[:HAS_IMPACT]->(i:ImpactAssessment)
      OPTIONAL MATCH (e)-[:HAS_GRAPH_CHANGE]->(gc:GraphChange)
      RETURN e, collect(DISTINCT d) as decisions, collect(DISTINCT i) as impacts, collect(DISTINCT gc) as graphChanges
    `;
    const result = await memgraph.runQuery(query, { backlogId });
    if (!result.length) return null;
    const r = result[0];
    const exec = r.e?.properties || r.e || {};
    const decisions = (r.decisions || []).map(d => d?.properties || d || {});
    const impacts = (r.impacts || []).map(i => i?.properties || i || {});
    const graphChanges = (r.graphChanges || []).map(gc => gc?.properties || gc || {});
    return { execution: exec, decisions, impacts, graphChanges };
  }
}

module.exports = new ExecutionRecordService();
