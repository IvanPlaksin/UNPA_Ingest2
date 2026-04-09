/**
 * Answer Generator
 * Generates natural language answers from query results
 */

const { QueryIntent } = require('./query-types');

class AnswerGenerator {
  constructor(options = {}) {
    this.options = {
      defaultFormat: options.defaultFormat || 'detailed',
      maxCitations: options.maxCitations || 5,
      includePaths: options.includePaths !== false,
      includeConfidence: options.includeConfidence || false,
      ...options
    };

    this.stats = {
      totalGenerated: 0,
      byIntent: {},
      byFormat: {}
    };
  }

  /**
   * Generate answer from query result
   */
  generate(queryResult, parsedQuery, options = {}) {
    this.stats.totalGenerated++;
    const format = options.format || this.options.defaultFormat;
    const intent = parsedQuery.intent;

    this.stats.byIntent[intent] = (this.stats.byIntent[intent] || 0) + 1;
    this.stats.byFormat[format] = (this.stats.byFormat[format] || 0) + 1;

    try {
      let answer = this._generateByIntent(queryResult, parsedQuery, intent);
      answer = this._applyFormat(answer, queryResult, format);
      const citations = this._buildCitations(queryResult, parsedQuery);

      return {
        answer,
        citations,
        confidence: this._calculateConfidence(queryResult),
        metadata: {
          intent,
          format,
          dataPoints: queryResult.data?.length || 0,
          pathsFound: queryResult.paths?.length || 0
        }
      };
    } catch (error) {
      console.error('[AnswerGenerator] Generation failed:', error.message);
      return {
        answer: "I encountered an error while generating the answer.",
        citations: [],
        confidence: 0,
        metadata: { error: error.message }
      };
    }
  }

  generateBrief(queryResult, parsedQuery) {
    return this.generate(queryResult, parsedQuery, { format: 'brief' });
  }

  generateDetailed(queryResult, parsedQuery) {
    return this.generate(queryResult, parsedQuery, { format: 'detailed' });
  }

  generateStructured(queryResult, parsedQuery) {
    return this.generate(queryResult, parsedQuery, { format: 'structured' });
  }

  // ==================== Intent-based Generation ====================

  _generateByIntent(result, query, intent) {
    const data = result.data || [];
    const paths = result.paths || [];
    const aggregations = result.aggregations || {};

    switch (intent) {
      case QueryIntent.FACTUAL:
        return this._generateFactualAnswer(data, query);
      case QueryIntent.RELATIONAL:
        return this._generateRelationalAnswer(data, result, query);
      case QueryIntent.PATH:
        return this._generatePathAnswer(paths, query);
      case QueryIntent.AGGREGATION:
        return this._generateAggregationAnswer(data, aggregations, query);
      case QueryIntent.COMPARISON:
        return this._generateComparisonAnswer(data, query);
      case QueryIntent.TEMPORAL:
        return this._generateTemporalAnswer(data, query);
      default:
        return this._generateComplexAnswer(data, paths, aggregations, query);
    }
  }

  _generateFactualAnswer(data, query) {
    if (data.length === 0) {
      const searchTerm = query.entities?.[0]?.name || query.originalText;
      return `I couldn't find information about "${searchTerm}" in the knowledge graph.`;
    }

    const entity = data[0];
    const relations = data.slice(1).filter(d => d.depth || d.role);
    const base = `${entity.name} is a ${entity.type}${this._formatAttributes(entity)}.`;

    if (relations.length > 0) {
      return `${base} ${this._formatRelationsSummary(entity, relations)}`;
    }

    return base;
  }

  _generateRelationalAnswer(data, result, query) {
    if (data.length === 0) {
      const searchTerm = query.entities?.[0]?.name || query.originalText;
      return `I couldn't find any relationships for "${searchTerm}".`;
    }

    const subject = data.find(d => d.found && !d.role) || data[0];
    const relations = data.filter(d => d.role || d.connectedNode);

    if (relations.length === 0) {
      return `${subject.name} has no known relationships.`;
    }

    const byType = {};
    for (const rel of relations) {
      const type = rel.type || rel.edge?.type || 'RELATED_TO';
      if (!byType[type]) byType[type] = [];
      byType[type].push(rel.connectedNode?.name || rel.name || 'unknown');
    }

    const descriptions = Object.entries(byType)
      .slice(0, 4)
      .map(([type, names]) => {
        const humanType = this._humanizeRelationType(type);
        return `${humanType} ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` (+${names.length - 3} more)` : ''}`;
      });

    return `${subject.name} (${subject.type}) ${descriptions.join('; ')}.`;
  }

  _generatePathAnswer(paths, query) {
    const entities = query.entities || [];
    const source = entities[0]?.name || 'source';
    const target = entities[1]?.name || 'target';

    if (paths.length === 0) {
      return `I couldn't find a connection between "${source}" and "${target}".`;
    }

    const firstPath = paths[0];
    const pathArray = firstPath.path || firstPath;

    if (paths.length === 1) {
      if (!Array.isArray(pathArray) || pathArray.length === 0) {
        return `No path found between ${source} and ${target}.`;
      }
      const pathNames = pathArray.map(node => node.name || node.id).join(' \u2192 ');
      const length = pathArray.length - 1;
      return `${source} is connected to ${target} through ${length} step${length !== 1 ? 's' : ''}: ${pathNames}.`;
    }

    const parts = [`Found ${paths.length} path${paths.length > 1 ? 's' : ''} between ${source} and ${target}:`];
    for (let i = 0; i < Math.min(paths.length, 3); i++) {
      const p = paths[i].path || paths[i];
      const pathNames = Array.isArray(p)
        ? p.map(node => node.name || node.id).join(' \u2192 ')
        : 'unknown path';
      parts.push(`  ${i + 1}. ${pathNames}`);
    }
    if (paths.length > 3) {
      parts.push(`  ...and ${paths.length - 3} more.`);
    }
    return parts.join('\n');
  }

  _generateAggregationAnswer(data, aggregations, query) {
    const targetType = this._inferTargetType(query);

    if (aggregations.count !== undefined) {
      return `There are ${aggregations.count} ${targetType}${aggregations.count !== 1 ? 's' : ''}.`;
    }

    if (aggregations.groups) {
      return this._formatGroupedAnswer(aggregations);
    }

    if (data.length > 0) {
      return this._formatListAnswer(data, targetType);
    }

    return `No ${targetType}s found.`;
  }

  _generateComparisonAnswer(data, query) {
    if (data.length < 2) {
      return `I couldn't find enough information to compare these items.`;
    }

    const entity1 = data[0];
    const entity2 = data.find(d => d.id !== entity1.id) || data[1];

    const parts = [`Comparison of ${entity1.name} and ${entity2.name}:`];
    parts.push(`\nTypes: ${entity1.type || 'Unknown'} vs ${entity2.type || 'Unknown'}`);

    const attrs1 = entity1.attributes || {};
    const attrs2 = entity2.attributes || {};
    const allKeys = new Set([...Object.keys(attrs1), ...Object.keys(attrs2)]);

    if (allKeys.size > 0) {
      parts.push('\nAttributes:');
      for (const key of [...allKeys].slice(0, 5)) {
        const val1 = attrs1[key] || 'N/A';
        const val2 = attrs2[key] || 'N/A';
        parts.push(`  \u2022 ${this._humanizeKey(key)}: ${val1} vs ${val2}`);
      }
    }

    return parts.join('\n');
  }

  _generateTemporalAnswer(data, query) {
    const timeframe = query.temporal?.keyword || 'the specified period';

    if (data.length === 0) {
      return `No changes found for ${timeframe}.`;
    }

    const parts = [`${data.length} item${data.length > 1 ? 's' : ''} changed during ${timeframe}:`];
    for (const item of data.slice(0, 5)) {
      const date = item.createdAt || item.updatedAt || '';
      const dateStr = date ? ` (${new Date(date).toLocaleDateString()})` : '';
      parts.push(`  \u2022 ${item.name || item.id}${dateStr}`);
    }
    if (data.length > 5) {
      parts.push(`  ...and ${data.length - 5} more.`);
    }
    return parts.join('\n');
  }

  _generateComplexAnswer(data, paths, aggregations, query) {
    const parts = [];

    if (data.length > 0) {
      const types = this._groupByType(data);
      const typeSummary = Object.entries(types)
        .map(([type, items]) => `${items.length} ${type}${items.length > 1 ? 's' : ''}`)
        .join(', ');
      parts.push(`Found ${typeSummary}.`);
    }

    if (paths.length > 0) {
      parts.push(`Discovered ${paths.length} connection${paths.length > 1 ? 's' : ''}.`);
    }

    if (aggregations.count !== undefined) {
      parts.push(`Total count: ${aggregations.count}.`);
    }

    if (parts.length === 0) {
      return "I couldn't find relevant information for your query.";
    }

    return parts.join(' ');
  }

  // ==================== Formatting Helpers ====================

  _formatAttributes(entity) {
    const attrs = entity.attributes || {};
    const attrList = Object.entries(attrs)
      .filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k))
      .slice(0, 3);

    if (attrList.length === 0) return '';

    const formatted = attrList
      .map(([k, v]) => `${this._humanizeKey(k)}: ${v}`)
      .join(', ');

    return ` with ${formatted}`;
  }

  _formatRelationsSummary(entity, relations) {
    if (relations.length === 0) return '';

    const byType = {};
    for (const rel of relations) {
      const type = rel.type || rel.edge?.type || 'connected to';
      if (!byType[type]) byType[type] = [];
      byType[type].push(rel.connectedNode?.name || rel.name || 'unknown');
    }

    const summaries = Object.entries(byType)
      .slice(0, 3)
      .map(([type, names]) => {
        const humanType = this._humanizeRelationType(type);
        if (names.length === 1) {
          return `It ${humanType} ${names[0]}`;
        }
        return `It ${humanType} ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''}`;
      });

    return summaries.join('. ') + '.';
  }

  _formatListAnswer(items, type) {
    if (items.length === 0) return `No ${type}s found.`;

    const header = `Found ${items.length} ${type}${items.length > 1 ? 's' : ''}:`;
    const list = items
      .slice(0, 10)
      .map((item, i) => `  ${i + 1}. ${item.name || item.id}${item.type ? ` (${item.type})` : ''}`)
      .join('\n');
    const footer = items.length > 10 ? `\n  ...and ${items.length - 10} more.` : '';

    return `${header}\n${list}${footer}`;
  }

  _formatGroupedAnswer(aggregations) {
    const { groups } = aggregations;
    if (!groups || Object.keys(groups).length === 0) return 'No grouped data available.';

    const parts = ['Grouped results:'];
    for (const [groupName, items] of Object.entries(groups).slice(0, 5)) {
      parts.push(`  \u2022 ${groupName}: ${items.length} item${items.length !== 1 ? 's' : ''}`);
    }
    if (Object.keys(groups).length > 5) {
      parts.push(`  ...and ${Object.keys(groups).length - 5} more groups.`);
    }
    return parts.join('\n');
  }

  // ==================== Format Application ====================

  _applyFormat(answer, result, format) {
    switch (format) {
      case 'brief':
        return this._toBrief(answer);
      case 'detailed':
        return answer;
      case 'structured':
        return this._toStructured(answer, result);
      default:
        return answer;
    }
  }

  _toBrief(answer) {
    if (typeof answer !== 'string') return answer;
    const firstSentence = answer.split(/[.!?]\s/)[0];
    if (firstSentence.length <= 150) {
      return firstSentence + (firstSentence.endsWith('.') ? '' : '.');
    }
    return firstSentence.slice(0, 147) + '...';
  }

  _toStructured(answer, result) {
    return {
      summary: typeof answer === 'string' ? this._toBrief(answer) : answer,
      details: answer,
      data: {
        entities: (result.data || []).slice(0, 10).map(e => ({
          id: e.id,
          name: e.name,
          type: e.type
        })),
        paths: (result.paths || []).slice(0, 3),
        aggregations: result.aggregations || {}
      }
    };
  }

  // ==================== Citations ====================

  _buildCitations(result) {
    const citations = [];
    const seen = new Set();

    for (const entity of (result.data || []).slice(0, this.options.maxCitations)) {
      if (!entity?.id || seen.has(entity.id)) continue;
      seen.add(entity.id);
      citations.push({
        id: entity.id,
        name: entity.name || entity.id,
        type: entity.type || 'Entity',
        relevance: entity.found ? 'primary' : 'secondary'
      });
    }

    for (const pathResult of (result.paths || []).slice(0, 2)) {
      const path = pathResult.path || pathResult;
      if (!Array.isArray(path)) continue;
      for (const node of path) {
        if (!node?.id || seen.has(node.id)) continue;
        if (citations.length >= this.options.maxCitations) break;
        seen.add(node.id);
        citations.push({
          id: node.id,
          name: node.name || node.id,
          type: node.type || 'Entity',
          relevance: 'path'
        });
      }
    }

    return citations;
  }

  // ==================== Utility Methods ====================

  _calculateConfidence(result) {
    if (!result.success) return 0;

    let confidence = 0.5;

    if (result.data?.length > 0) confidence += 0.2;

    const exactMatches = (result.data || []).filter(d => d.found).length;
    if (exactMatches > 0) {
      confidence += 0.1 * Math.min(exactMatches, 3);
    }

    if (result.paths?.length > 0) confidence += 0.1;

    return Math.min(confidence, 1);
  }

  _inferTargetType(query) {
    const text = query.originalText?.toLowerCase() || '';
    if (/bugs?/.test(text)) return 'bug';
    if (/tasks?/.test(text)) return 'task';
    if (/people|persons?|users?/.test(text)) return 'person';
    if (/systems?/.test(text)) return 'system';
    if (/documents?/.test(text)) return 'document';
    if (/teams?/.test(text)) return 'team';
    return 'item';
  }

  _groupByType(data) {
    const groups = {};
    for (const item of data) {
      const type = item.type || 'Unknown';
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    }
    return groups;
  }

  _humanizeKey(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/^\s+/, '')
      .toLowerCase()
      .replace(/^./, c => c.toUpperCase());
  }

  _humanizeRelationType(type) {
    const mappings = {
      'AUTHORED_BY': 'was authored by',
      'CREATED_BY': 'was created by',
      'ASSIGNED_TO': 'is assigned to',
      'DEPENDS_ON': 'depends on',
      'USES': 'uses',
      'CONTAINS': 'contains',
      'PART_OF': 'is part of',
      'OWNS': 'owns',
      'MANAGES': 'manages',
      'IMPLEMENTS': 'implements',
      'REFERENCES': 'references',
      'RELATED_TO': 'is related to'
    };
    return mappings[type] || type.toLowerCase().replace(/_/g, ' ');
  }

  getStats() {
    return { ...this.stats };
  }
}

function createAnswerGenerator(options) {
  return new AnswerGenerator(options);
}

const answerGenerator = new AnswerGenerator();

module.exports = {
  AnswerGenerator,
  createAnswerGenerator,
  answerGenerator
};
