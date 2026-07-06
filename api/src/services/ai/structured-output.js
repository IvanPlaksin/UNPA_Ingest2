/**
 * Structured Output Service — гарантированно валидный JSON от LLM
 *
 * Обеспечивает constrained decoding через:
 * 1. Claude API: tool_use с JSON Schema (нативная поддержка)
 * 2. Gemini: responseSchema для structured output
 * 3. Ollama: JSON mode + post-validation
 * 4. Fallback: prompt engineering + retry
 *
 * Научные основания:
 * - JSONSchemaBench (2025) — Guidance + XGrammar = лучшая эффективность
 * - XGrammar (2024) — 100× быстрее предыдущих grammar-библиотек
 * - Constrained decoding гарантирует 100% структурную валидность
 *
 * @module services/ai/structured-output
 */

'use strict';

const axios = require('axios');
const { getScopedProvider } = require('../llm-access-control.service');
const llmProvider = getScopedProvider('structured_output');
const {
    AI_PROVIDERS,
    AI_MODELS,
    getModel,
    getProviderForModel,
    getApiKey,
    getDefaultModelId
} = require('../../config/ai-models.config');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_OPTIONS = {
    maxRetries: 2,
    temperature: 0.1,       // Low for deterministic output
    defaultProvider: 'gemini',
    strictValidation: true,
    timeout: 30000,         // 30 seconds
    verbose: false
};

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED OUTPUT SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class StructuredOutputService {
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };

        // Registry for JSON Schemas
        this.schemaRegistry = new Map();
        this._registerDefaultSchemas();

        // Statistics tracking
        this.stats = {
            totalCalls: 0,
            successful: 0,
            failed: 0,
            retries: 0,
            byProvider: {}
        };
    }

    /**
     * Генерация с гарантированным JSON output
     * @param {string} prompt - Промпт для LLM
     * @param {string|Object} schema - Имя схемы или сама схема
     * @param {Object} options - Дополнительные параметры
     * @returns {Promise<Object>} Результат генерации
     */
    async generate(prompt, schema, options = {}) {
        const startTime = Date.now();
        this.stats.totalCalls++;

        const resolvedSchema = typeof schema === 'string'
            ? this.schemaRegistry.get(schema)
            : schema;

        if (!resolvedSchema) {
            return {
                success: false,
                error: `Schema not found: ${schema}`,
                duration: Date.now() - startTime
            };
        }

        const provider = options.provider || this.options.defaultProvider;
        const modelId = options.modelId || this._getDefaultModelForProvider(provider);

        // Track by provider
        if (!this.stats.byProvider[provider]) {
            this.stats.byProvider[provider] = { calls: 0, success: 0, failed: 0 };
        }
        this.stats.byProvider[provider].calls++;

        let result;
        try {
            switch (provider) {
                case 'anthropic':
                    result = await this._generateWithClaude(prompt, resolvedSchema, { ...options, modelId });
                    break;
                case 'gemini':
                    result = await this._generateWithGemini(prompt, resolvedSchema, { ...options, modelId });
                    break;
                case 'ollama':
                    result = await this._generateWithOllama(prompt, resolvedSchema, { ...options, modelId });
                    break;
                default:
                    result = await this._generateWithFallback(prompt, resolvedSchema, { ...options, modelId });
            }
        } catch (error) {
            result = {
                success: false,
                error: error.message,
                provider,
                duration: Date.now() - startTime
            };
        }

        // Update stats
        if (result.success) {
            this.stats.successful++;
            this.stats.byProvider[provider].success++;
        } else {
            this.stats.failed++;
            this.stats.byProvider[provider].failed++;
        }

        result.duration = Date.now() - startTime;
        return result;
    }

    /**
     * Claude API: использовать tool_use для structured output
     * @private
     */
    async _generateWithClaude(prompt, schema, options = {}) {
        const apiKey = getApiKey('anthropic');
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY not configured');
        }

        const modelId = options.modelId || 'claude-sonnet-4-5-20250929';
        const toolName = options.toolName || 'structured_output';

        // Конвертировать JSON Schema в tool definition
        const tool = {
            name: toolName,
            description: schema.description || 'Generate structured output according to the schema',
            input_schema: this._cleanSchemaForClaude(schema)
        };

        try {
            const llmResp = await llmProvider.chat(
                [{ role: 'user', content: prompt }],
                {
                    model: modelId,
                    maxTokens: options.maxTokens || 4096,
                    temperature: options.temperature ?? this.options.temperature,
                    tools: [tool],
                }
            );

            // Извлечь tool use result
            const toolUse = this._extractClaudeToolUse({ content: llmResp.content }, toolName);

            if (!toolUse) {
                throw new Error('No tool use in Claude response');
            }

            // Валидация против схемы
            const validation = this._validateAgainstSchema(toolUse.input, schema);

            return {
                success: true,
                data: toolUse.input,
                validation,
                provider: 'anthropic',
                model: modelId,
                method: 'tool_use',
                usage: {
                    inputTokens: response.data.usage?.input_tokens || 0,
                    outputTokens: response.data.usage?.output_tokens || 0
                }
            };
        } catch (error) {
            if (this.options.verbose) {
                console.warn('[StructuredOutput] Claude error:', error.message);
            }
            return this._handleError(prompt, schema, error, { ...options, provider: 'anthropic' });
        }
    }

    /**
     * Gemini: responseSchema для structured output
     * @private
     */
    async _generateWithGemini(prompt, schema, options = {}) {
        const apiKey = getApiKey('gemini');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        const modelId = options.modelId || 'gemini-pro-latest';

        // Gemini требует специальный формат схемы
        const geminiSchema = this._cleanSchemaForGemini(schema);

        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
                {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: options.temperature ?? this.options.temperature,
                        maxOutputTokens: options.maxTokens || 4096,
                        responseMimeType: 'application/json',
                        responseSchema: geminiSchema
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    params: { key: apiKey },
                    timeout: options.timeout || this.options.timeout
                }
            );

            // Извлечь и парсить ответ
            const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = this._parseJSON(text);

            if (!parsed.success) {
                throw new Error(`JSON parse failed: ${parsed.error}`);
            }

            const validation = this._validateAgainstSchema(parsed.data, schema);

            return {
                success: true,
                data: parsed.data,
                validation,
                provider: 'gemini',
                model: modelId,
                method: 'response_schema',
                usage: {
                    inputTokens: response.data.usageMetadata?.promptTokenCount || 0,
                    outputTokens: response.data.usageMetadata?.candidatesTokenCount || 0
                }
            };
        } catch (error) {
            if (this.options.verbose) {
                console.warn('[StructuredOutput] Gemini error:', error.message);
            }
            return this._handleError(prompt, schema, error, { ...options, provider: 'gemini' });
        }
    }

    /**
     * Ollama: JSON mode + post-validation
     * @private
     */
    async _generateWithOllama(prompt, schema, options = {}) {
        const provider = AI_PROVIDERS.ollama;
        const modelId = options.modelId || 'llama3.1:8b';

        // Добавить инструкцию по формату в промпт
        const schemaPrompt = this._buildSchemaPrompt(prompt, schema);

        try {
            const response = await axios.post(
                `${provider.baseUrl}/chat/completions`,
                {
                    model: modelId,
                    messages: [{ role: 'user', content: schemaPrompt }],
                    temperature: options.temperature ?? this.options.temperature,
                    stream: false,
                    format: 'json' // Ollama JSON mode
                },
                {
                    timeout: options.timeout || this.options.timeout
                }
            );

            // Парсинг JSON из ответа
            const text = response.data.choices?.[0]?.message?.content;
            const parsed = this._parseJSON(text);

            if (!parsed.success) {
                throw new Error(`JSON parse failed: ${parsed.error}`);
            }

            // Валидация против схемы
            const validation = this._validateAgainstSchema(parsed.data, schema);

            if (!validation.valid && this.options.strictValidation) {
                throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
            }

            return {
                success: true,
                data: parsed.data,
                validation,
                provider: 'ollama',
                model: modelId,
                method: 'json_mode',
                usage: {
                    inputTokens: response.data.usage?.prompt_tokens || 0,
                    outputTokens: response.data.usage?.completion_tokens || 0
                }
            };
        } catch (error) {
            if (this.options.verbose) {
                console.warn('[StructuredOutput] Ollama error:', error.message);
            }
            return this._handleError(prompt, schema, error, { ...options, provider: 'ollama' });
        }
    }

    /**
     * Fallback: prompt engineering + retry
     * @private
     */
    async _generateWithFallback(prompt, schema, options = {}) {
        const schemaPrompt = this._buildSchemaPrompt(prompt, schema);
        const provider = options.provider || this.options.defaultProvider;
        let lastError = null;

        for (let attempt = 1; attempt <= this.options.maxRetries + 1; attempt++) {
            try {
                const correctedPrompt = attempt === 1
                    ? schemaPrompt
                    : this._buildCorrectionPrompt(schemaPrompt, lastError);

                // Use the appropriate provider
                let text;
                if (provider === 'anthropic') {
                    text = await this._callClaudeRaw(correctedPrompt, options);
                } else if (provider === 'gemini') {
                    text = await this._callGeminiRaw(correctedPrompt, options);
                } else {
                    text = await this._callOllamaRaw(correctedPrompt, options);
                }

                const parsed = this._parseJSON(text);

                if (!parsed.success) {
                    lastError = `JSON parse error: ${parsed.error}`;
                    this.stats.retries++;
                    continue;
                }

                const validation = this._validateAgainstSchema(parsed.data, schema);

                if (!validation.valid && this.options.strictValidation) {
                    lastError = `Validation error: ${validation.errors.join(', ')}`;
                    this.stats.retries++;
                    continue;
                }

                return {
                    success: true,
                    data: parsed.data,
                    validation,
                    provider,
                    method: 'prompt_engineering',
                    attempts: attempt
                };
            } catch (error) {
                lastError = error.message;
                this.stats.retries++;
            }
        }

        return {
            success: false,
            error: lastError,
            provider,
            method: 'prompt_engineering',
            attempts: this.options.maxRetries + 1
        };
    }

    /**
     * Обработка ошибок с retry
     * @private
     */
    async _handleError(prompt, schema, error, options) {
        const retryCount = options._retryCount || 0;

        if (retryCount >= this.options.maxRetries) {
            return {
                success: false,
                error: error.message,
                provider: options.provider,
                attempts: retryCount + 1
            };
        }

        this.stats.retries++;

        // Retry с fallback стратегией
        if (this.options.verbose) {
            console.info(`[StructuredOutput] Retrying (attempt ${retryCount + 2})...`);
        }

        return this._generateWithFallback(prompt, schema, {
            ...options,
            _retryCount: retryCount + 1
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RAW LLM CALLS (for fallback)
    // ═══════════════════════════════════════════════════════════════════════════

    async _callClaudeRaw(prompt, options = {}) {
        const modelId = options.modelId || 'claude-sonnet-4-5-20250929';

        const llmResp = await llmProvider.chat(
            [{ role: 'user', content: prompt }],
            {
                model: modelId,
                maxTokens: options.maxTokens || 4096,
                temperature: options.temperature ?? this.options.temperature,
            }
        );

        return llmResp.content?.[0]?.text || '';
    }

    async _callGeminiRaw(prompt, options = {}) {
        const apiKey = getApiKey('gemini');
        const modelId = options.modelId || 'gemini-pro-latest';

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: options.temperature ?? this.options.temperature,
                    maxOutputTokens: options.maxTokens || 4096
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                params: { key: apiKey },
                timeout: options.timeout || this.options.timeout
            }
        );

        return response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    async _callOllamaRaw(prompt, options = {}) {
        const provider = AI_PROVIDERS.ollama;
        const modelId = options.modelId || 'llama3.1:8b';

        const response = await axios.post(
            `${provider.baseUrl}/chat/completions`,
            {
                model: modelId,
                messages: [{ role: 'user', content: prompt }],
                temperature: options.temperature ?? this.options.temperature,
                stream: false
            },
            {
                timeout: options.timeout || this.options.timeout
            }
        );

        return response.data.choices?.[0]?.message?.content || '';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROMPT BUILDING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Построить промпт с инструкцией по схеме
     * @private
     */
    _buildSchemaPrompt(prompt, schema) {
        const schemaStr = JSON.stringify(schema, null, 2);

        return `${prompt}

IMPORTANT: Your response must be valid JSON that conforms to this schema:
\`\`\`json
${schemaStr}
\`\`\`

Respond ONLY with the JSON object, no additional text, no markdown code fences, no explanation.`;
    }

    /**
     * Промпт для коррекции после ошибки
     * @private
     */
    _buildCorrectionPrompt(originalPrompt, error) {
        return `${originalPrompt}

CORRECTION NEEDED: Previous response was invalid.
Error: ${error}

Please provide a corrected JSON response that exactly matches the required schema.
Respond ONLY with valid JSON, no other text.`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RESPONSE PARSING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Извлечь tool_use из ответа Claude
     * @private
     */
    _extractClaudeToolUse(response, toolName) {
        if (!response || !response.content) return null;

        for (const block of response.content) {
            if (block.type === 'tool_use' && block.name === toolName) {
                return block;
            }
        }

        return null;
    }

    /**
     * Парсинг JSON из текста
     * @private
     */
    _parseJSON(text) {
        if (!text) {
            return { success: false, error: 'Empty response' };
        }

        // Если уже объект
        if (typeof text === 'object') {
            return { success: true, data: text };
        }

        try {
            // Попробовать прямой парсинг
            const data = JSON.parse(text);
            return { success: true, data };
        } catch (e) {
            // Попробовать извлечь JSON из markdown
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                try {
                    const data = JSON.parse(jsonMatch[1].trim());
                    return { success: true, data };
                } catch (e2) {
                    // Continue to next strategy
                }
            }

            // Попробовать найти JSON объект в тексте
            const objectMatch = text.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                try {
                    const data = JSON.parse(objectMatch[0]);
                    return { success: true, data };
                } catch (e3) {
                    // Continue
                }
            }

            // Попробовать найти JSON массив
            const arrayMatch = text.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                try {
                    const data = JSON.parse(arrayMatch[0]);
                    return { success: true, data };
                } catch (e4) {
                    // Final fallback
                }
            }

            return { success: false, error: e.message };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SCHEMA VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Валидация данных против JSON Schema
     * @private
     */
    _validateAgainstSchema(data, schema) {
        const errors = [];
        const warnings = [];

        // Базовая валидация типов
        if (schema.type === 'object' && typeof data !== 'object') {
            errors.push(`Expected object, got ${typeof data}`);
            return { valid: false, errors, warnings };
        }

        if (schema.type === 'array' && !Array.isArray(data)) {
            errors.push(`Expected array, got ${typeof data}`);
            return { valid: false, errors, warnings };
        }

        // Проверка required полей
        if (schema.required && schema.type === 'object') {
            for (const field of schema.required) {
                if (!(field in data)) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }

        // Проверка properties
        if (schema.properties && schema.type === 'object' && data) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in data) {
                    const propValidation = this._validateProperty(data[key], propSchema, key);
                    errors.push(...propValidation.errors);
                    warnings.push(...propValidation.warnings);
                }
            }
        }

        // Проверка items для массивов
        if (schema.items && Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                const itemValidation = this._validateProperty(data[i], schema.items, `[${i}]`);
                errors.push(...itemValidation.errors);
                warnings.push(...itemValidation.warnings);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Валидация отдельного свойства
     * @private
     */
    _validateProperty(value, schema, path) {
        const errors = [];
        const warnings = [];

        // Type check
        if (schema.type) {
            const expectedType = schema.type;
            const actualType = Array.isArray(value) ? 'array' : typeof value;

            if (expectedType !== actualType && value !== null && value !== undefined) {
                errors.push(`${path}: expected ${expectedType}, got ${actualType}`);
            }
        }

        // Enum check
        if (schema.enum && !schema.enum.includes(value)) {
            errors.push(`${path}: value must be one of [${schema.enum.join(', ')}]`);
        }

        // String constraints
        if (schema.type === 'string' && typeof value === 'string') {
            if (schema.minLength && value.length < schema.minLength) {
                errors.push(`${path}: string too short (min: ${schema.minLength})`);
            }
            if (schema.maxLength && value.length > schema.maxLength) {
                errors.push(`${path}: string too long (max: ${schema.maxLength})`);
            }
            if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
                errors.push(`${path}: string doesn't match pattern`);
            }
        }

        // Number constraints
        if (schema.type === 'number' && typeof value === 'number') {
            if (schema.minimum !== undefined && value < schema.minimum) {
                errors.push(`${path}: number too small (min: ${schema.minimum})`);
            }
            if (schema.maximum !== undefined && value > schema.maximum) {
                errors.push(`${path}: number too large (max: ${schema.maximum})`);
            }
        }

        // Array constraints
        if (schema.type === 'array' && Array.isArray(value)) {
            if (schema.minItems !== undefined && value.length < schema.minItems) {
                errors.push(`${path}: array too short (min: ${schema.minItems})`);
            }
            if (schema.maxItems !== undefined && value.length > schema.maxItems) {
                errors.push(`${path}: array too long (max: ${schema.maxItems})`);
            }
        }

        return { errors, warnings };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SCHEMA CLEANING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Очистить схему для Claude (убрать неподдерживаемые поля)
     * @private
     */
    _cleanSchemaForClaude(schema) {
        const cleaned = { ...schema };

        // Claude не поддерживает $defs напрямую — нужно inline
        if (cleaned.$defs) {
            delete cleaned.$defs;
        }

        // Рекурсивно очистить properties
        if (cleaned.properties) {
            cleaned.properties = Object.fromEntries(
                Object.entries(cleaned.properties).map(([key, value]) => [
                    key,
                    this._cleanSchemaForClaude(value)
                ])
            );
        }

        if (cleaned.items) {
            cleaned.items = this._cleanSchemaForClaude(cleaned.items);
        }

        return cleaned;
    }

    /**
     * Очистить схему для Gemini
     * @private
     */
    _cleanSchemaForGemini(schema) {
        // Gemini требует type: "OBJECT" вместо "object"
        const cleaned = { ...schema };

        if (cleaned.type) {
            cleaned.type = cleaned.type.toUpperCase();
        }

        // Gemini не поддерживает description на root level в responseSchema
        if (cleaned.description) {
            delete cleaned.description;
        }

        // Рекурсивно обработать properties
        if (cleaned.properties) {
            cleaned.properties = Object.fromEntries(
                Object.entries(cleaned.properties).map(([key, value]) => [
                    key,
                    this._cleanSchemaForGemini(value)
                ])
            );
        }

        if (cleaned.items) {
            cleaned.items = this._cleanSchemaForGemini(cleaned.items);
        }

        // $defs не поддерживаются
        if (cleaned.$defs) {
            delete cleaned.$defs;
        }

        return cleaned;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SCHEMA REGISTRY
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Регистрация схемы в registry
     * @param {string} name - Имя схемы
     * @param {Object} schema - JSON Schema
     */
    registerSchema(name, schema) {
        this.schemaRegistry.set(name, schema);
    }

    /**
     * Получить схему по имени
     * @param {string} name - Имя схемы
     * @returns {Object|null}
     */
    getSchema(name) {
        return this.schemaRegistry.get(name) || null;
    }

    /**
     * Получить зарегистрированные схемы
     * @returns {string[]}
     */
    getRegisteredSchemas() {
        return Array.from(this.schemaRegistry.keys());
    }

    /**
     * Регистрация default schemas
     * @private
     */
    _registerDefaultSchemas() {
        // Схема для ProcessRepresentation (IR)
        this.registerSchema('ProcessRepresentation', {
            type: 'object',
            description: 'POWL-like process representation for graph generation',
            required: ['type', 'steps'],
            properties: {
                type: {
                    type: 'string',
                    enum: ['sequence', 'choice', 'parallel', 'loop']
                },
                id: { type: 'string' },
                steps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['id', 'intent', 'capability'],
                        properties: {
                            id: { type: 'string' },
                            intent: { type: 'string' },
                            capability: { type: 'string' },
                            inputs: { type: 'array', items: { type: 'string' } },
                            outputs: { type: 'array', items: { type: 'string' } },
                            conditions: { type: 'object' },
                            metadata: { type: 'object' }
                        }
                    }
                },
                loopCondition: { type: 'object' },
                choiceCondition: { type: 'object' }
            }
        });

        // Схема для Entity Extraction
        this.registerSchema('EntityExtractionResult', {
            type: 'object',
            description: 'Result of entity extraction from text',
            required: ['entities'],
            properties: {
                entities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['name', 'type'],
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            attributes: { type: 'object' },
                            confidence: { type: 'number', minimum: 0, maximum: 1 }
                        }
                    }
                },
                relations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['subject', 'predicate', 'object'],
                        properties: {
                            subject: { type: 'string' },
                            predicate: { type: 'string' },
                            object: { type: 'string' },
                            confidence: { type: 'number', minimum: 0, maximum: 1 }
                        }
                    }
                }
            }
        });

        // Схема для Task Planning
        this.registerSchema('TaskPlan', {
            type: 'object',
            description: 'Task plan for graph execution',
            required: ['steps'],
            properties: {
                summary: { type: 'string' },
                steps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['id', 'tool', 'description'],
                        properties: {
                            id: { type: 'string' },
                            tool: { type: 'string' },
                            description: { type: 'string' },
                            params: { type: 'object' },
                            outputKeys: { type: 'array', items: { type: 'string' } }
                        }
                    }
                },
                dependencies: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['from', 'to'],
                        properties: {
                            from: { type: 'string' },
                            to: { type: 'string' },
                            dataMapping: { type: 'string' }
                        }
                    }
                },
                parallelGroups: {
                    type: 'array',
                    items: {
                        type: 'array',
                        items: { type: 'string' }
                    }
                }
            }
        });

        // Схема для Intent Classification
        this.registerSchema('IntentDescriptor', {
            type: 'object',
            description: 'Intent classification result',
            required: ['domain', 'intent'],
            properties: {
                domain: { type: 'string' },
                intent: { type: 'string' },
                complexity: {
                    type: 'string',
                    enum: ['simple', 'medium', 'complex']
                },
                requiredCapabilities: {
                    type: 'array',
                    items: { type: 'string' }
                },
                entities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' }
                        }
                    }
                },
                confidence: { type: 'number', minimum: 0, maximum: 1 }
            }
        });

        // Схема для Relationship Extraction
        this.registerSchema('RelationshipExtractionResult', {
            type: 'object',
            description: 'Result of relationship extraction',
            required: ['triples'],
            properties: {
                triples: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['subject', 'predicate', 'object'],
                        properties: {
                            subject: { type: 'string' },
                            predicate: { type: 'string' },
                            object: { type: 'string' },
                            evidence: { type: 'string' },
                            confidence: { type: 'number', minimum: 0, maximum: 1 }
                        }
                    }
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Получить default model для провайдера
     * @private
     */
    _getDefaultModelForProvider(provider) {
        const defaults = {
            anthropic: 'claude-sonnet-4-5-20250929',
            gemini: 'gemini-pro-latest',
            ollama: 'llama3.1:8b'
        };
        return defaults[provider] || defaults.gemini;
    }

    /**
     * Получить статистику
     * @returns {Object}
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalCalls > 0
                ? ((this.stats.successful / this.stats.totalCalls) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Сбросить статистику
     */
    resetStats() {
        this.stats = {
            totalCalls: 0,
            successful: 0,
            failed: 0,
            retries: 0,
            byProvider: {}
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Factory function
 * @param {Object} options - Configuration options
 * @returns {StructuredOutputService}
 */
function createStructuredOutputService(options) {
    return new StructuredOutputService(options);
}

// Singleton instance
const structuredOutput = new StructuredOutputService();

module.exports = {
    StructuredOutputService,
    createStructuredOutputService,
    structuredOutput
};
