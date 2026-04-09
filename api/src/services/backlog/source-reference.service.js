const { v4: uuidv4 } = require('uuid');
const memgraph = require('../memgraph.service');

class SourceReferenceService {
  async addSource(backlogId, sourceData, context = {}) {
    const { addedBy = 'system', sourceContext = 'task_creation' } = context;
    const id = uuidv4();
    const now = new Date().toISOString();
    const source = {
      id, namespace: 'CORE', nodeType: 'SourceReference',
      ...sourceData,
      accessedAt: sourceData.accessedAt || now,
      accessedBy: sourceData.accessedBy || addedBy
    };
    const props = { ...source };
    if (props.toolInput) props.toolInput = JSON.stringify(props.toolInput);
    if (props.toolOutput) props.toolOutput = JSON.stringify(props.toolOutput);

    const query = `
      MATCH (b:BackLogItem {backlogId: $backlogId})
      CREATE (s:SourceReference {id: $id, namespace: $namespace, nodeType: $nodeType,
        sourceType: $sourceType, sourceId: $sourceId, sourceTitle: $sourceTitle,
        relevance: $relevance, excerpt: $excerpt, accessedAt: $accessedAt, accessedBy: $accessedBy,
        toolInput: $toolInput, toolOutput: $toolOutput, url: $url})
      CREATE (b)-[:SOURCED_FROM {context: $sourceContext, addedAt: $now, addedBy: $addedBy}]->(s)
      RETURN s
    `;
    const result = await memgraph.runQuery(query, {
      backlogId, id: props.id, namespace: props.namespace, nodeType: props.nodeType,
      sourceType: props.sourceType || '', sourceId: props.sourceId || '',
      sourceTitle: props.sourceTitle || '', relevance: props.relevance || '',
      excerpt: props.excerpt || '', accessedAt: props.accessedAt, accessedBy: props.accessedBy,
      toolInput: props.toolInput || '', toolOutput: props.toolOutput || '', url: props.url || '',
      sourceContext, now, addedBy
    });
    return result[0]?.s?.properties || props;
  }

  async addMCPToolSource(backlogId, toolName, toolInput, toolOutput, relevance, ctx = {}) {
    return this.addSource(backlogId, {
      sourceType: 'MCP_TOOL', sourceId: toolName,
      sourceTitle: `MCP Tool: ${toolName}`, relevance, toolInput,
      toolOutput: this._summarize(toolOutput)
    }, ctx);
  }

  async addCodexSource(backlogId, codexId, relevance, ctx = {}) {
    let title = codexId, excerpt = '';
    try {
      const r = await memgraph.runQuery('MATCH (r:CodexRule {codexId: $codexId}) RETURN r.title as t, r.summary as s', { codexId });
      if (r.length) { title = r[0].t || codexId; excerpt = r[0].s || ''; }
    } catch {}
    return this.addSource(backlogId, { sourceType: 'CODEX_RULE', sourceId: codexId, sourceTitle: title, relevance, excerpt }, ctx);
  }

  async addBlackCodexSource(backlogId, bcId, relevance, ctx = {}) {
    return this.addSource(backlogId, { sourceType: 'BLACKCODEX', sourceId: bcId, sourceTitle: bcId, relevance }, ctx);
  }

  async addExternalSource(backlogId, url, title, relevance, excerpt, ctx = {}) {
    return this.addSource(backlogId, { sourceType: 'EXTERNAL_URL', sourceId: url, url, sourceTitle: title, relevance, excerpt }, ctx);
  }

  async getSourcesForTask(backlogId) {
    const query = `
      MATCH (b:BackLogItem {backlogId: $backlogId})-[rel:SOURCED_FROM]->(s:SourceReference)
      RETURN s, rel.context as context, rel.addedAt as addedAt
      ORDER BY rel.addedAt DESC
    `;
    const result = await memgraph.runQuery(query, { backlogId });
    return result.map(r => ({ ...(r.s?.properties || r.s || {}), _context: r.context, _addedAt: r.addedAt }));
  }

  _summarize(output) {
    if (!output) return null;
    const str = JSON.stringify(output);
    if (str.length <= 1000) return output;
    return { _summarized: true, _originalLength: str.length, preview: str.substring(0, 500), keys: Object.keys(output) };
  }
}

module.exports = new SourceReferenceService();
