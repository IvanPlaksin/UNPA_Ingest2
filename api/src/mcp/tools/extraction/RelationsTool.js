const { BaseTool } = require('../primitives/BaseTool.js');

class RelationsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'extraction.relations',
      name: 'Extract Relations',
      version: '1.0.0',
      level: 2,
      category: 'extraction',
      description: 'Extract relationships between entities from text',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to analyze' },
          entities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Pre-extracted entities to find relations between'
          },
          options: {
            type: 'object',
            properties: {
              relationTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Types of relations to extract',
                default: ['is_a', 'has', 'part_of', 'located_in', 'works_for', 'created_by', 'related_to']
              },
              maxDistance: { type: 'integer', default: 50, description: 'Max word distance between entities' },
              useLLM: { type: 'boolean', default: false, description: 'Use LLM for extraction' }
            }
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          relations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                predicate: { type: 'string' },
                object: { type: 'string' },
                confidence: { type: 'number' },
                context: { type: 'string' }
              }
            }
          },
          metadata: {
            type: 'object',
            properties: {
              totalRelations: { type: 'integer' },
              relationTypes: { type: 'object' }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context) {
    const { text, entities = [], options = {} } = args;
    const { relationTypes = ['is_a', 'has', 'part_of', 'located_in', 'works_for', 'created_by', 'related_to'], maxDistance = 50, useLLM = false } = options;

    // If LLM requested and available
    if (useLLM && context?.services?.llm) {
      return this.extractWithLLM(text, entities, relationTypes, context.services.llm);
    }

    // Pattern-based extraction
    const relations = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());

    // Relation patterns
    const patterns = [
      { regex: /(\w+(?:\s+\w+)?)\s+is\s+(?:a|an|the)\s+(\w+(?:\s+\w+)?)/gi, type: 'is_a' },
      { regex: /(\w+(?:\s+\w+)?)\s+(?:has|have|had)\s+(?:a|an|the)?\s*(\w+(?:\s+\w+)?)/gi, type: 'has' },
      { regex: /(\w+(?:\s+\w+)?)\s+(?:is\s+)?part\s+of\s+(?:the)?\s*(\w+(?:\s+\w+)?)/gi, type: 'part_of' },
      { regex: /(\w+(?:\s+\w+)?)\s+(?:is\s+)?(?:located|based)\s+in\s+(\w+(?:\s+\w+)?)/gi, type: 'located_in' },
      { regex: /(\w+(?:\s+\w+)?)\s+(?:works|worked)\s+(?:for|at)\s+(\w+(?:\s+\w+)?)/gi, type: 'works_for' },
      { regex: /(\w+(?:\s+\w+)?)\s+(?:was\s+)?(?:created|made|built)\s+by\s+(\w+(?:\s+\w+)?)/gi, type: 'created_by' },
      { regex: /(\w+(?:\s+\w+)?)\s+(?:and|with|of)\s+(\w+(?:\s+\w+)?)/gi, type: 'related_to' }
    ];

    for (const sentence of sentences) {
      for (const pattern of patterns) {
        if (!relationTypes.includes(pattern.type)) continue;

        let match;
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        while ((match = regex.exec(sentence)) !== null) {
          const subject = match[1].trim();
          const object = match[2].trim();

          // Filter by provided entities if any
          if (entities.length > 0) {
            const hasSubject = entities.some(e => subject.toLowerCase().includes(e.toLowerCase()));
            const hasObject = entities.some(e => object.toLowerCase().includes(e.toLowerCase()));
            if (!hasSubject && !hasObject) continue;
          }

          relations.push({
            subject,
            predicate: pattern.type,
            object,
            confidence: 0.6,
            context: sentence.trim().substring(0, 100)
          });
        }
      }
    }

    // Deduplicate
    const unique = this.deduplicateRelations(relations);

    // Count relation types
    const typeCounts = {};
    for (const rel of unique) {
      typeCounts[rel.predicate] = (typeCounts[rel.predicate] || 0) + 1;
    }

    return this.success({
      relations: unique,
      metadata: {
        totalRelations: unique.length,
        relationTypes: typeCounts
      }
    });
  }

  async extractWithLLM(text, entities, relationTypes, llmService) {
    const prompt = `Extract relationships from the following text.
${entities.length > 0 ? `Focus on these entities: ${entities.join(', ')}` : ''}
Relation types to extract: ${relationTypes.join(', ')}

Text:
${text}

Return JSON array of relations: [{"subject": "...", "predicate": "...", "object": "...", "confidence": 0.0-1.0}]`;

    try {
      const response = await llmService.complete(prompt, { maxTokens: 2000 });
      const content = response.text || response.content || response;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const relations = JSON.parse(jsonMatch[0]);
        return this.success({
          relations,
          metadata: { totalRelations: relations.length, method: 'llm' }
        });
      }
    } catch (e) {
      // Fallback handled by caller
    }

    return this.success({ relations: [], metadata: { totalRelations: 0, error: 'LLM extraction failed' } });
  }

  deduplicateRelations(relations) {
    const seen = new Set();
    return relations.filter(r => {
      const key = `${r.subject.toLowerCase()}|${r.predicate}|${r.object.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

module.exports = { RelationsTool };
