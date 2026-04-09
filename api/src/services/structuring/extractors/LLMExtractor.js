/**
 * LLMExtractor - Семантическое извлечение через LLM
 *
 * Извлекает бизнес-логику, концепции и семантические связи,
 * которые невозможно определить через AST-анализ.
 */

const NodeLabels = {
    BUSINESS_RULE: 'BusinessRule',
    CONCEPT: 'Concept',
    TERM: 'Term',
    VALIDATION: 'Validation',
    CALCULATION: 'Calculation',
};

const RelationTypes = {
    IMPLEMENTS_RULE: 'IMPLEMENTS_RULE',
    REFERENCES: 'REFERENCES',
    RELATED_TO: 'RELATED_TO',
    DEPENDS_ON: 'DEPENDS_ON',
    SIMILAR_TO: 'SIMILAR_TO',
    DEFINES: 'DEFINES',
    VALIDATES: 'VALIDATES',
};

class LLMExtractor {
    /**
     * @param {Object} llmService - LLM сервис с методом chat()
     * @param {Object} config - Конфигурация извлечения
     */
    constructor(llmService, config = {}) {
        this.llm = llmService;
        this.config = {
            extractBusinessRules: true,
            extractDomainConcepts: true,
            inferRelationships: true,
            confidenceThreshold: 0.7,
            maxCodeLength: 8000,
            temperature: 0.2,
            ...config,
        };
    }

    // ============ Business Rules Extraction ============

    /**
     * Извлечение бизнес-правил из кода
     * @param {string} code - Исходный код
     * @param {Object} context - Контекст (filePath, functionName, className)
     * @returns {Promise<Array>} - Массив бизнес-правил
     */
    async extractBusinessRules(code, context = {}) {
        const { filePath = 'unknown', functionName, className } = context;
        const truncatedCode = this._truncateCode(code);
        const prompt = this._buildBusinessRulesPrompt(truncatedCode, context);

        try {
            const response = await this.llm.chat([
                {
                    role: 'system',
                    content: `You are a senior software architect analyzing code to extract business rules.
A business rule is any logic that implements business requirements: validations, calculations, constraints, decisions, state transitions.
Respond ONLY with valid JSON array. No explanations, no markdown.`
                },
                { role: 'user', content: prompt }
            ]);

            const content = this._extractContent(response);
            const rules = this._parseJSONResponse(content);

            if (!Array.isArray(rules)) {
                return [];
            }

            return rules
                .filter(rule => rule && rule.confidence >= this.config.confidenceThreshold)
                .map(rule => this._createBusinessRuleEntity(rule, context));

        } catch (error) {
            console.error('LLMExtractor.extractBusinessRules error:', error.message);
            return [];
        }
    }

    _buildBusinessRulesPrompt(code, context) {
        const location = [
            context.filePath,
            context.className,
            context.functionName
        ].filter(Boolean).join(' > ');

        return `Analyze this code and extract business rules.

Location: ${location}

\`\`\`
${code}
\`\`\`

For each business rule found, return JSON object with:
{
  "name": "Short descriptive name in camelCase",
  "description": "What the rule does in plain English",
  "type": "validation|calculation|constraint|decision|stateTransition|authorization",
  "conditions": ["List of conditions that trigger this rule"],
  "actions": ["What happens when conditions are met"],
  "affectedFields": ["Fields/variables this rule affects"],
  "errorMessages": ["Error messages if rule fails"],
  "confidence": 0.0-1.0
}

Rules to follow:
- Only extract BUSINESS rules, not technical implementation details
- Each rule should be self-contained and understandable
- Confidence should reflect how certain you are this is a real business rule
- Skip generic error handling, logging, or infrastructure code

Return JSON array of rules. If no business rules found, return [].`;
    }

    _createBusinessRuleEntity(rule, context) {
        const id = `br_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        return {
            label: NodeLabels.BUSINESS_RULE,
            properties: {
                id,
                name: rule.name || 'unnamed',
                description: rule.description || '',
                ruleType: rule.type || 'unknown',
                conditions: rule.conditions || [],
                actions: rule.actions || [],
                affectedFields: rule.affectedFields || [],
                errorMessages: rule.errorMessages || [],
                confidence: rule.confidence || 0,
                // Provenance
                sourceFile: context.filePath || null,
                sourceClass: context.className || null,
                sourceFunction: context.functionName || null,
                extractionMethod: 'llm',
                extractedAt: new Date().toISOString(),
            },
        };
    }

    // ============ Domain Concepts Extraction ============

    /**
     * Извлечение доменных концепций из текста
     * @param {string} text - Текст (комментарии, документация, WorkItem)
     * @param {string} sourceType - Тип источника
     * @returns {Promise<Array>} - Массив концепций
     */
    async extractDomainConcepts(text, sourceType = 'documentation') {
        if (!text || text.trim().length < 20) {
            return [];
        }

        const prompt = this._buildConceptsPrompt(text, sourceType);

        try {
            const response = await this.llm.chat([
                {
                    role: 'system',
                    content: `You are a domain expert extracting business terminology and concepts.
Focus on domain-specific terms, not generic programming concepts.
Respond ONLY with valid JSON array.`
                },
                { role: 'user', content: prompt }
            ]);

            const content = this._extractContent(response);
            const concepts = this._parseJSONResponse(content);

            if (!Array.isArray(concepts)) {
                return [];
            }

            return concepts
                .filter(c => c && c.confidence >= this.config.confidenceThreshold)
                .map(c => this._createConceptEntity(c, sourceType));

        } catch (error) {
            console.error('LLMExtractor.extractDomainConcepts error:', error.message);
            return [];
        }
    }

    _buildConceptsPrompt(text, sourceType) {
        const sourceDescription = {
            comment: 'code comments',
            documentation: 'technical documentation',
            workitem: 'work item / user story',
            email: 'email correspondence',
            requirement: 'requirements specification',
            code: 'source code',
        }[sourceType] || 'text';

        return `Extract domain concepts from this ${sourceDescription}:

"""
${text.substring(0, 4000)}
"""

For each concept, return JSON object:
{
  "name": "ConceptName in PascalCase",
  "definition": "Clear, concise definition",
  "synonyms": ["alternative names", "abbreviations"],
  "type": "entity|process|metric|rule|term|role|status",
  "domain": "The business domain this belongs to",
  "examples": ["Usage examples if available"],
  "confidence": 0.0-1.0
}

Rules:
- Focus on BUSINESS/DOMAIN concepts, not programming terms
- Skip generic words like "user", "system", "data" unless domain-specific
- Include abbreviations and their expansions
- Confidence reflects how certain this is a domain concept

Return JSON array. If no domain concepts found, return [].`;
    }

    _createConceptEntity(concept, sourceType) {
        const id = `concept_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        return {
            label: NodeLabels.CONCEPT,
            properties: {
                id,
                name: concept.name || 'unnamed',
                definition: concept.definition || '',
                synonyms: concept.synonyms || [],
                conceptType: concept.type || 'unknown',
                domain: concept.domain || 'general',
                examples: concept.examples || [],
                confidence: concept.confidence || 0,
                // Provenance
                sourceType,
                extractionMethod: 'llm',
                extractedAt: new Date().toISOString(),
            },
        };
    }

    // ============ Relationship Inference ============

    /**
     * Вывод семантической связи между двумя сущностями
     * @param {Object} entity1 - Первая сущность
     * @param {Object} entity2 - Вторая сущность
     * @param {string} sharedContext - Общий контекст
     * @returns {Promise<Object|null>} - Связь или null
     */
    async inferRelationship(entity1, entity2, sharedContext = '') {
        const prompt = this._buildRelationshipPrompt(entity1, entity2, sharedContext);

        try {
            const response = await this.llm.chat([
                {
                    role: 'system',
                    content: `You are analyzing relationships between code/business entities.
Determine if a meaningful relationship exists. Be conservative - only identify clear relationships.
Respond with JSON object or null.`
                },
                { role: 'user', content: prompt }
            ]);

            const content = this._extractContent(response);
            const result = this._parseJSONResponse(content);

            if (!result || result.confidence < this.config.confidenceThreshold) {
                return null;
            }

            return this._createInferredRelationship(entity1, entity2, result);

        } catch (error) {
            console.error('LLMExtractor.inferRelationship error:', error.message);
            return null;
        }
    }

    _buildRelationshipPrompt(entity1, entity2, sharedContext) {
        return `Analyze if there's a semantic relationship between these two entities:

Entity 1:
- Type: ${entity1.label}
- Name: ${entity1.properties?.name || 'unknown'}
- Description: ${entity1.properties?.description || entity1.properties?.definition || 'N/A'}

Entity 2:
- Type: ${entity2.label}
- Name: ${entity2.properties?.name || 'unknown'}
- Description: ${entity2.properties?.description || entity2.properties?.definition || 'N/A'}

${sharedContext ? `Shared Context:\n${sharedContext.substring(0, 2000)}` : ''}

If a relationship exists, return:
{
  "relationshipType": "IMPLEMENTS_RULE|REFERENCES|RELATED_TO|DEPENDS_ON|SIMILAR_TO|DEFINES|VALIDATES",
  "direction": "1->2|2->1|bidirectional",
  "description": "Brief description of the relationship",
  "confidence": 0.0-1.0,
  "evidence": "Why you believe this relationship exists"
}

If NO meaningful relationship exists, return: null

Be conservative. Only identify relationships with clear evidence.`;
    }

    _createInferredRelationship(entity1, entity2, inference) {
        let sourceId, targetId;

        if (inference.direction === '2->1') {
            sourceId = entity2.properties?.id || entity2.properties?.qualifiedName || entity2.properties?.name;
            targetId = entity1.properties?.id || entity1.properties?.qualifiedName || entity1.properties?.name;
        } else {
            sourceId = entity1.properties?.id || entity1.properties?.qualifiedName || entity1.properties?.name;
            targetId = entity2.properties?.id || entity2.properties?.qualifiedName || entity2.properties?.name;
        }

        return {
            type: inference.relationshipType,
            sourceId,
            targetId,
            properties: {
                description: inference.description,
                confidence: inference.confidence,
                evidence: inference.evidence,
                bidirectional: inference.direction === 'bidirectional',
                inferenceMethod: 'llm',
                inferredAt: new Date().toISOString(),
            },
        };
    }

    // ============ Batch Extraction ============

    /**
     * Batch extraction - извлечение всего из кода за один вызов
     * @param {string} code - Исходный код
     * @param {Object} context - Контекст
     * @returns {Promise<Object>} - { businessRules, concepts, suggestedRelationships }
     */
    async extractAll(code, context = {}) {
        const prompt = this._buildBatchExtractionPrompt(code, context);

        try {
            const response = await this.llm.chat([
                {
                    role: 'system',
                    content: `You are a code analyst extracting business knowledge from source code.
Extract business rules, domain concepts, and suggest relationships.
Respond ONLY with valid JSON object.`
                },
                { role: 'user', content: prompt }
            ]);

            const content = this._extractContent(response);
            const result = this._parseJSONResponse(content);

            if (!result || typeof result !== 'object') {
                return { businessRules: [], concepts: [], suggestedRelationships: [] };
            }

            return {
                businessRules: (result.businessRules || [])
                    .filter(r => r && r.confidence >= this.config.confidenceThreshold)
                    .map(r => this._createBusinessRuleEntity(r, context)),
                concepts: (result.concepts || [])
                    .filter(c => c && c.confidence >= this.config.confidenceThreshold)
                    .map(c => this._createConceptEntity(c, 'code')),
                suggestedRelationships: result.relationships || [],
            };

        } catch (error) {
            console.error('LLMExtractor.extractAll error:', error.message);
            return { businessRules: [], concepts: [], suggestedRelationships: [] };
        }
    }

    _buildBatchExtractionPrompt(code, context) {
        const location = [context.filePath, context.className, context.functionName]
            .filter(Boolean).join(' > ');

        return `Analyze this code and extract all business knowledge:

Location: ${location || 'unknown'}

\`\`\`
${this._truncateCode(code)}
\`\`\`

Return JSON object with:
{
  "businessRules": [
    {
      "name": "ruleName",
      "description": "What the rule does",
      "type": "validation|calculation|constraint|decision|stateTransition|authorization",
      "conditions": ["conditions"],
      "actions": ["actions"],
      "confidence": 0.0-1.0
    }
  ],
  "concepts": [
    {
      "name": "ConceptName",
      "definition": "Definition",
      "type": "entity|process|metric|rule|term",
      "confidence": 0.0-1.0
    }
  ],
  "relationships": [
    {
      "from": "entity or rule name",
      "to": "entity or rule name",
      "type": "IMPLEMENTS|VALIDATES|REFERENCES|DEPENDS_ON",
      "description": "relationship description"
    }
  ]
}

Focus on BUSINESS logic, not technical implementation. Be selective and confident.`;
    }

    // ============ Extraction from WorkItems ============

    /**
     * Извлечение бизнес-контекста из WorkItem
     * @param {Object} workItem - WorkItem объект из ADO
     * @returns {Promise<Object>} - { concepts, rules, requirements }
     */
    async extractFromWorkItem(workItem) {
        const text = this._buildWorkItemText(workItem);

        if (!text || text.length < 50) {
            return { concepts: [], rules: [], requirements: [] };
        }

        const prompt = this._buildWorkItemExtractionPrompt(workItem);

        try {
            const response = await this.llm.chat([
                {
                    role: 'system',
                    content: `You are a business analyst extracting structured information from work items (user stories, bugs, tasks).
Extract domain concepts, business rules, and acceptance criteria.
Respond ONLY with valid JSON object.`
                },
                { role: 'user', content: prompt }
            ]);

            const content = this._extractContent(response);
            const result = this._parseJSONResponse(content);

            if (!result) {
                return { concepts: [], rules: [], requirements: [] };
            }

            return {
                concepts: (result.concepts || [])
                    .filter(c => c && c.confidence >= this.config.confidenceThreshold)
                    .map(c => this._createConceptEntity(c, 'workitem')),
                rules: (result.rules || [])
                    .filter(r => r && r.confidence >= this.config.confidenceThreshold)
                    .map(r => this._createBusinessRuleEntity(r, { workItemId: workItem.id })),
                requirements: result.requirements || [],
            };

        } catch (error) {
            console.error('LLMExtractor.extractFromWorkItem error:', error.message);
            return { concepts: [], rules: [], requirements: [] };
        }
    }

    _buildWorkItemText(workItem) {
        const parts = [];
        if (workItem.title) parts.push(`Title: ${workItem.title}`);
        if (workItem.description) parts.push(`Description: ${workItem.description}`);
        if (workItem.acceptanceCriteria) parts.push(`Acceptance Criteria: ${workItem.acceptanceCriteria}`);
        if (workItem.reproSteps) parts.push(`Repro Steps: ${workItem.reproSteps}`);
        return parts.join('\n\n');
    }

    _buildWorkItemExtractionPrompt(workItem) {
        const text = this._buildWorkItemText(workItem);

        return `Analyze this ${workItem.type || 'work item'} and extract business knowledge:

Type: ${workItem.type || 'Unknown'}
State: ${workItem.state || 'Unknown'}

${text.substring(0, 4000)}

Return JSON object:
{
  "concepts": [
    {
      "name": "ConceptName",
      "definition": "What this concept means",
      "type": "entity|process|metric|rule|term|role|status",
      "confidence": 0.0-1.0
    }
  ],
  "rules": [
    {
      "name": "ruleName",
      "description": "Business rule description",
      "type": "validation|constraint|requirement",
      "conditions": ["conditions"],
      "confidence": 0.0-1.0
    }
  ],
  "requirements": [
    {
      "description": "Requirement description",
      "priority": "must|should|could",
      "testable": true/false
    }
  ]
}

Focus on business meaning, not technical implementation.`;
    }

    // ============ Utilities ============

    /**
     * Извлечение контента из ответа LLM
     */
    _extractContent(response) {
        if (!response) return null;

        // Если это строка, возвращаем как есть
        if (typeof response === 'string') {
            return response;
        }

        // Если это объект с content полем (OpenAI format)
        if (response.content) {
            return response.content;
        }

        // Если это объект с message полем
        if (response.message?.content) {
            return response.message.content;
        }

        // Если это объект с text полем
        if (response.text) {
            return response.text;
        }

        // Попробуем JSON.stringify
        try {
            return JSON.stringify(response);
        } catch {
            return null;
        }
    }

    /**
     * Парсинг JSON ответа с обработкой markdown и ошибок
     */
    _parseJSONResponse(response) {
        if (!response) return null;

        // Если уже объект
        if (typeof response === 'object') {
            return response;
        }

        let cleaned = response.trim();

        // Удаляем markdown code blocks
        cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

        // Удаляем текст до и после JSON
        const jsonMatch = cleaned.match(/[\[\{][\s\S]*[\]\}]/);
        if (jsonMatch) {
            cleaned = jsonMatch[0];
        }

        // Обработка ответа "null"
        if (cleaned.toLowerCase() === 'null') {
            return null;
        }

        try {
            return JSON.parse(cleaned);
        } catch (e) {
            console.warn('Failed to parse LLM JSON response:', e.message);
            console.debug('Raw response (first 500 chars):', response.substring(0, 500));
            return null;
        }
    }

    /**
     * Обрезка кода до максимальной длины
     */
    _truncateCode(code) {
        if (!code) return '';

        if (code.length <= this.config.maxCodeLength) {
            return code;
        }

        // Обрезаем, но пытаемся сохранить полные функции
        const truncated = code.substring(0, this.config.maxCodeLength);
        const lastBrace = truncated.lastIndexOf('}');

        if (lastBrace > this.config.maxCodeLength * 0.8) {
            return truncated.substring(0, lastBrace + 1) + '\n// ... truncated';
        }

        return truncated + '\n// ... truncated';
    }
}

module.exports = { LLMExtractor, NodeLabels, RelationTypes };
