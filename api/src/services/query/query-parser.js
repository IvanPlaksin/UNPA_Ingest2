/**
 * Query Parser
 * Parses natural language queries into structured ParsedQuery form
 */

const { QueryIntent, ParsedQuery } = require('./query-types');

class QueryParser {
  constructor(options = {}) {
    this.options = {
      defaultLimit: options.defaultLimit || 10,
      ...options
    };

    // Intent patterns (ordered by specificity)
    this.intentPatterns = {
      [QueryIntent.PATH]: [
        /^(?:how|what) (?:is the )?(?:path|connection|route) (?:from|between) (.+?) (?:to|and) (.+?)$/i,
        /^(?:find|show) (?:a )?path (?:from|between) (.+?) (?:to|and) (.+)/i,
        /^(?:how )?(?:can I )?(?:get|go) from (.+?) to (.+?)$/i
      ],
      [QueryIntent.COMPARISON]: [
        /^compare (.+?) (?:and|with|to|vs\.?) (.+)/i,
        /^(?:what (?:is|are) the )?differences? between (.+?) and (.+)/i,
        /^(.+?) vs\.? (.+)/i
      ],
      [QueryIntent.RELATIONAL]: [
        /^who (?:created|authored|owns|manages|assigned) (.+?)$/i,
        /^what (?:does|did) (.+?) (?:create|use|depend on|contain)/i,
        /^(?:show|list|find) (?:all )?(?:the )?(?:relationships?|connections?) (?:of|for|between) (.+)/i,
        /^how (?:is|are) (.+?) (?:related|connected) to (.+?)$/i
      ],
      [QueryIntent.AGGREGATION]: [
        /^how many (.+?) (?:are|is|does|do|have|has)/i,
        /^(?:count|number of) (.+)/i,
        /^list (?:all )?(.+)/i,
        /^(?:show|get) all (.+)/i
      ],
      [QueryIntent.TEMPORAL]: [
        /^what (?:changed|happened|was (?:created|modified|updated)) (?:in|on|since|after|before|last|this) (.+)/i,
        /^(?:show|list) (?:recent|latest|new) (.+)/i,
        /^(?:history|timeline) (?:of|for) (.+)/i
      ],
      [QueryIntent.FACTUAL]: [
        /^what (?:is|are) (.+?)$/i,
        /^(?:tell me|describe|explain) (?:about )?(.+?)$/i,
        /^who is (.+?)$/i,
        /^define (.+?)$/i
      ]
    };

    // Entity extraction patterns
    this.entityPatterns = [
      { pattern: /"([^"]+)"/g, priority: 10 },
      { pattern: /'([^']+)'/g, priority: 10 },
      { pattern: /(?:Bug|Task|Feature|Story|Issue|Epic)\s*#?\d+/gi, priority: 8 },
      { pattern: /\b[A-Z]{2,6}\b/g, priority: 3 },
      { pattern: /(?:Mr|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g, priority: 7 },
      { pattern: /[A-Z][a-z]+\s+[A-Z][a-z]+/g, priority: 5 }
    ];

    // Relation keywords → relation types
    this.relationKeywords = {
      'created': 'AUTHORED_BY',
      'authored': 'AUTHORED_BY',
      'wrote': 'AUTHORED_BY',
      'owns': 'OWNS',
      'manages': 'MANAGES',
      'assigned': 'ASSIGNED_TO',
      'belongs': 'PART_OF',
      'part of': 'PART_OF',
      'contains': 'CONTAINS',
      'includes': 'CONTAINS',
      'use': 'USES',
      'uses': 'USES',
      'depends': 'DEPENDS_ON',
      'requires': 'DEPENDS_ON',
      'implements': 'IMPLEMENTS',
      'references': 'REFERENCES',
      'related': 'RELATED_TO',
      'connected': 'RELATED_TO'
    };

    // Temporal keywords
    this.temporalKeywords = {
      'today': () => this._getDateRange('day'),
      'yesterday': () => this._getDateRange('day', -1),
      'this week': () => this._getDateRange('week'),
      'last week': () => this._getDateRange('week', -1),
      'this month': () => this._getDateRange('month'),
      'last month': () => this._getDateRange('month', -1)
    };

    this.stats = {
      totalParsed: 0,
      byIntent: {}
    };
  }

  /**
   * Parse a natural language query
   */
  parse(queryText) {
    this.stats.totalParsed++;

    const normalized = this._normalizeQuery(queryText);

    const { intent, confidence, matches } = this._detectIntent(normalized);
    this.stats.byIntent[intent] = (this.stats.byIntent[intent] || 0) + 1;

    const entities = this._extractEntities(normalized, matches);
    const relations = this._extractRelations(normalized);
    const constraints = this._extractConstraints(normalized);
    const temporal = this._extractTemporal(normalized);
    const limit = this._extractLimit(normalized);

    const parsed = new ParsedQuery({
      originalText: queryText,
      intent,
      confidence,
      entities,
      relations,
      constraints,
      temporal,
      limit: limit || this.options.defaultLimit
    });

    console.log(`[QueryParser] Parsed: intent=${intent}, entities=${entities.length}, confidence=${confidence.toFixed(2)}`);

    return parsed;
  }

  /**
   * Batch parse multiple queries
   */
  parseBatch(queries) {
    return queries.map(q => this.parse(q));
  }

  // ==================== Private Methods ====================

  _normalizeQuery(text) {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[?!.]+$/, '');
  }

  _detectIntent(text) {
    const textLower = text.toLowerCase();
    let bestMatch = { intent: QueryIntent.COMPLEX, confidence: 0.3, matches: [] };

    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      for (const pattern of patterns) {
        const match = textLower.match(pattern);
        if (match) {
          const confidence = 0.7 + (match[0].length / text.length) * 0.3;
          if (confidence > bestMatch.confidence) {
            bestMatch = { intent, confidence: Math.min(confidence, 1.0), matches: match.slice(1) };
          }
        }
      }
    }

    return bestMatch;
  }

  _extractEntities(text, intentMatches = []) {
    const entities = new Set();

    // Add entities from intent pattern matches
    for (const match of intentMatches) {
      if (match && match.length > 1) {
        entities.add(this._cleanEntity(match));
      }
    }

    // Extract using entity patterns
    for (const { pattern } of this.entityPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = text.matchAll(regex);
      for (const match of matches) {
        const entity = match[1] || match[0];
        if (entity && entity.length > 1) {
          entities.add(this._cleanEntity(entity));
        }
      }
    }

    return [...entities].map(name => ({
      name,
      type: this._inferEntityType(name)
    }));
  }

  _cleanEntity(text) {
    return text.trim().replace(/^(the|a|an)\s+/i, '');
  }

  _inferEntityType(name) {
    if (/^(?:Bug|Task|Feature|Story|Issue|Epic)\s*#?\d+$/i.test(name)) return 'WorkItem';
    if (/^[A-Z]{2,6}$/.test(name)) return 'System';
    if (/^(?:Mr|Ms|Dr|Prof)\.?\s+/.test(name)) return 'Person';
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(name)) return 'Person';
    if (/Department|Division|Office|Team/i.test(name)) return 'Organization';
    return 'Entity';
  }

  _extractRelations(text) {
    const relations = [];
    const textLower = text.toLowerCase();

    for (const [keyword, relationType] of Object.entries(this.relationKeywords)) {
      if (textLower.includes(keyword)) {
        relations.push({
          type: relationType,
          keyword,
          direction: this._inferRelationDirection(keyword)
        });
      }
    }

    return relations;
  }

  _inferRelationDirection(keyword) {
    const outgoing = ['created', 'authored', 'wrote', 'owns', 'manages', 'use', 'uses', 'contains', 'includes'];
    const incoming = ['assigned', 'belongs'];

    if (outgoing.includes(keyword)) return 'outgoing';
    if (incoming.includes(keyword)) return 'incoming';
    return 'any';
  }

  _extractConstraints(text) {
    const constraints = [];
    const textLower = text.toLowerCase();

    const typeMatch = textLower.match(/(?:of type|type\s*[:=])\s*(\w+)/i);
    if (typeMatch) {
      constraints.push({ field: 'type', op: 'eq', value: typeMatch[1] });
    }

    const statusMatch = textLower.match(/(?:status|state)\s*(?:is|[:=])\s*(\w+)/i);
    if (statusMatch) {
      constraints.push({ field: 'status', op: 'eq', value: statusMatch[1] });
    }

    const priorityMatch = textLower.match(/(?:priority)\s*(?:is|[:=])\s*(\w+)/i);
    if (priorityMatch) {
      constraints.push({ field: 'priority', op: 'eq', value: priorityMatch[1] });
    }

    return constraints;
  }

  _extractTemporal(text) {
    const textLower = text.toLowerCase();

    for (const [keyword, dateRangeFn] of Object.entries(this.temporalKeywords)) {
      if (textLower.includes(keyword)) {
        return {
          keyword,
          range: dateRangeFn()
        };
      }
    }

    const dateMatch = text.match(/(?:on|since|after|before)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (dateMatch) {
      const date = new Date(dateMatch[1]);
      const op = dateMatch[0].toLowerCase().startsWith('before') ? 'before' : 'after';
      return {
        keyword: dateMatch[0],
        range: { start: op === 'after' ? date.toISOString() : null, end: op === 'before' ? date.toISOString() : null }
      };
    }

    return null;
  }

  _extractLimit(text) {
    const limitMatch = text.match(/(?:top|first|limit)\s+(\d+)/i);
    if (limitMatch) {
      return parseInt(limitMatch[1], 10);
    }

    if (/\ball\b/i.test(text)) {
      return 100;
    }

    return null;
  }

  _getDateRange(unit, offset = 0) {
    const now = new Date();
    let start, end;

    switch (unit) {
      case 'day':
        start = new Date(now);
        start.setDate(start.getDate() + offset);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
        break;

      case 'week':
        start = new Date(now);
        start.setDate(start.getDate() - start.getDay() + (offset * 7));
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;

      case 'month':
        start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
        break;
    }

    return {
      start: start.toISOString(),
      end: end.toISOString()
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

function createQueryParser(options) {
  return new QueryParser(options);
}

const queryParser = new QueryParser();

module.exports = {
  QueryParser,
  createQueryParser,
  queryParser
};
