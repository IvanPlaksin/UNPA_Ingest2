const axios = require('axios');
const { getApiKey, hasValidApiKey } = require('../config/ai-models.config');

// ── Provider selection ──
// Priority: LLM_PROVIDER env → gemini (if key set) → anthropic (if key set) → ollama
const LLM_PROVIDER = process.env.LLM_PROVIDER
  || (hasValidApiKey('gemini') ? 'gemini'
    : hasValidApiKey('anthropic') ? 'anthropic' : 'ollama');

// ── Ollama config ──
const OLLAMA_API_BASE = process.env.LLM_API_BASE || 'http://localhost:11434/v1';
const OLLAMA_MODEL = process.env.LLM_MODEL || 'llama3';

// ── Anthropic config ──
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_LLM_MODEL || 'claude-sonnet-4-20250514';
const ANTHROPIC_MAX_TOKENS = 4096;

// ── Gemini config ──
const GEMINI_MODEL = process.env.GEMINI_LLM_MODEL || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash';
const GEMINI_MAX_TOKENS = 8192;

// Lazy-load @google/generative-ai
let _GoogleGenerativeAI = null;
function getGoogleGenAI() {
    if (!_GoogleGenerativeAI) {
        try {
            const pkg = require('@google/generative-ai');
            _GoogleGenerativeAI = pkg.GoogleGenerativeAI;
        } catch (e) {
            console.warn('[LlmService] @google/generative-ai not installed');
        }
    }
    return _GoogleGenerativeAI;
}

// Lazy load structured output service
let _structuredOutput = null;
function getStructuredOutputLazy() {
    if (!_structuredOutput) {
        try {
            const { structuredOutput } = require('./ai/structured-output');
            _structuredOutput = structuredOutput;
        } catch (e) { /* structured output not available */ }
    }
    return _structuredOutput;
}

// Lazy load tensor service
let _tensorService = null;
function getTensorServiceLazy() {
    if (!_tensorService) {
        try {
            const { getTensorService } = require('./tensor.service');
            _tensorService = getTensorService();
        } catch (e) { /* tensor service not available */ }
    }
    return _tensorService;
}

class LlmService {
    constructor() {
        this.provider = LLM_PROVIDER;
        const modelMap = { gemini: GEMINI_MODEL, anthropic: ANTHROPIC_MODEL, ollama: OLLAMA_MODEL };
        console.log(`[LlmService] Provider: ${this.provider} (model: ${modelMap[this.provider] || 'unknown'})`);
    }

    /**
     * Sends a chat completion request (non-streaming).
     * Routes to Gemini, Claude, or Ollama based on configured provider.
     * @param {Array} messages
     * @param {Array} tools
     * @param {string} parentTensorId
     * @param {Object} options - { provider, model, temperature, maxTokens }
     * @returns {Promise<object>}
     */
    async chat(messages, tools = [], parentTensorId = null, options = {}) {
        const provider = options.provider || this.provider;

        if (provider === 'gemini') {
            return this._chatGemini(messages, tools, parentTensorId, options);
        }
        if (provider === 'anthropic') {
            return this._chatAnthropic(messages, tools, parentTensorId, options);
        }
        return this._chatOllama(messages, tools, parentTensorId, options);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ANTHROPIC CLAUDE
    // ═════════════════════════════════════════════════════════════════════════

    async _chatAnthropic(messages, tools, parentTensorId, options = {}) {
        const model = options.model || ANTHROPIC_MODEL;
        const apiKey = getApiKey('anthropic');

        if (!apiKey) {
            console.warn('[LlmService] No ANTHROPIC_API_KEY, falling back to Ollama');
            return this._chatOllama(messages, tools, parentTensorId, options);
        }

        const tensorService = getTensorServiceLazy();
        const tensor = tensorService?.start('ai.llm.chat', {
            provider: 'anthropic', model,
            messageCount: messages?.length || 0,
            hasTools: tools?.length > 0
        }, parentTensorId);

        try {
            // Separate system message from user/assistant messages
            let system = '';
            const apiMessages = [];
            for (const msg of messages) {
                if (msg.role === 'system') {
                    system += (system ? '\n\n' : '') + msg.content;
                } else {
                    apiMessages.push({ role: msg.role, content: msg.content });
                }
            }

            // Merge consecutive same-role messages and ensure starts with user
            const mergedMessages = this._enforceAlternation(apiMessages);

            const payload = {
                model,
                max_tokens: options.maxTokens || ANTHROPIC_MAX_TOKENS,
                temperature: options.temperature ?? 0.0,
                messages: mergedMessages,
            };
            if (system) payload.system = system;
            if (tools && tools.length > 0) payload.tools = tools;

            let response = await axios.post(ANTHROPIC_API_URL, payload, {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                timeout: 120000,
            });

            let data = response.data;

            // Handle tool_use loop: if model wants to call tools, execute and continue
            const toolExecutor = options.toolExecutor; // function(toolName, toolInput) => string
            let toolLoopCount = 0;
            const MAX_TOOL_LOOPS = 5;

            while (data.stop_reason === 'tool_use' && toolExecutor && toolLoopCount < MAX_TOOL_LOOPS) {
                toolLoopCount++;
                const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
                const toolResults = [];

                for (const toolUse of toolUseBlocks) {
                    console.log(`[LlmService] Tool call: ${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 100)})`);
                    const result = await toolExecutor(toolUse.name, toolUse.input);
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: typeof result === 'string' ? result : JSON.stringify(result),
                    });
                }

                // Continue conversation with tool results
                const continuedMessages = [
                    ...mergedMessages,
                    { role: 'assistant', content: data.content },
                    { role: 'user', content: toolResults },
                ];

                response = await axios.post(ANTHROPIC_API_URL, {
                    ...payload,
                    messages: continuedMessages,
                }, {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json',
                    },
                    timeout: 120000,
                });
                data = response.data;
            }

            const content = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';

            // Normalize to OpenAI-compatible format for executor compatibility
            const result = {
                content,
                role: 'assistant',
                model: data.model,
                usage: data.usage ? {
                    prompt_tokens: data.usage.input_tokens,
                    completion_tokens: data.usage.output_tokens,
                    total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
                } : null,
            };

            tensorService?.complete(tensor?.id, {
                provider: 'anthropic', model,
                contentLength: content.length,
                usage: result.usage,
            });

            return result;
        } catch (error) {
            console.error(`[LlmService] Anthropic error: ${error.message}`);
            tensorService?.fail(tensor?.id, error);
            throw error;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GOOGLE GEMINI
    // ═════════════════════════════════════════════════════════════════════════

    _getGeminiModel(model) {
        const GoogleGenAI = getGoogleGenAI();
        if (!GoogleGenAI) throw new Error('Google Generative AI SDK not available');
        const apiKey = getApiKey('gemini');
        if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
        const genAI = new GoogleGenAI(apiKey);
        return genAI.getGenerativeModel({ model });
    }

    /**
     * Convert OpenAI-style messages to Gemini format.
     * Gemini uses { role: 'user'|'model', parts: [{ text }] }
     * System messages become the first user message prefix.
     */
    _toGeminiFormat(messages) {
        let systemText = '';
        const geminiMessages = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemText += (systemText ? '\n\n' : '') + msg.content;
            } else {
                const role = msg.role === 'assistant' ? 'model' : 'user';
                geminiMessages.push({ role, parts: [{ text: msg.content }] });
            }
        }

        // Gemini requires history to start with 'user'
        if (geminiMessages.length === 0) {
            geminiMessages.push({ role: 'user', parts: [{ text: '(начни)' }] });
        }

        // Merge consecutive same-role messages (Gemini also requires alternation)
        const merged = [];
        for (const msg of geminiMessages) {
            if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
                merged[merged.length - 1].parts[0].text += '\n\n' + msg.parts[0].text;
            } else {
                merged.push({ role: msg.role, parts: [{ text: msg.parts[0].text }] });
            }
        }

        if (merged[0].role !== 'user') {
            merged.unshift({ role: 'user', parts: [{ text: '(начни)' }] });
        }

        return { systemText, history: merged };
    }

    async _chatGemini(messages, tools, parentTensorId, options = {}) {
        const modelName = options.model || GEMINI_MODEL;
        const tensorService = getTensorServiceLazy();
        const tensor = tensorService?.start('ai.llm.chat', {
            provider: 'gemini', model: modelName,
            messageCount: messages?.length || 0,
        }, parentTensorId);

        try {
            const model = this._getGeminiModel(modelName);
            const { systemText, history } = this._toGeminiFormat(messages);

            // Last message is the prompt, rest is history
            const lastMsg = history.pop();
            const prompt = lastMsg.parts[0].text;

            const chatOpts = {};
            if (history.length > 0) chatOpts.history = history;
            if (systemText) chatOpts.systemInstruction = { parts: [{ text: systemText }] };
            chatOpts.generationConfig = {
                temperature: options.temperature ?? 0.0,
                maxOutputTokens: options.maxTokens || GEMINI_MAX_TOKENS,
            };

            const chat = model.startChat(chatOpts);
            const result = await chat.sendMessage(prompt);
            const response = result.response;
            const content = response.text();

            const geminiResult = {
                content,
                role: 'assistant',
                model: modelName,
                usage: response.usageMetadata ? {
                    prompt_tokens: response.usageMetadata.promptTokenCount || 0,
                    completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
                    total_tokens: response.usageMetadata.totalTokenCount || 0,
                } : null,
            };

            tensorService?.complete(tensor?.id, {
                provider: 'gemini', model: modelName,
                contentLength: content.length,
                usage: geminiResult.usage,
            });

            return geminiResult;
        } catch (error) {
            tensorService?.fail(tensor?.id, error);
            // 429 rate limit — retry with fallback model
            if (error.message?.includes('429') && modelName !== GEMINI_FALLBACK_MODEL) {
                console.warn(`[LlmService] Gemini 429 on ${modelName}, retrying with ${GEMINI_FALLBACK_MODEL}`);
                return this._chatGemini(messages, tools, parentTensorId, { ...options, model: GEMINI_FALLBACK_MODEL });
            }
            console.error(`[LlmService] Gemini error: ${error.message}`);
            throw error;
        }
    }

    async _streamGemini(messages, onChunk, parentTensorId, options = {}) {
        const modelName = options.model || GEMINI_MODEL;
        const tensorService = getTensorServiceLazy();
        const tensor = tensorService?.start('ai.llm.streamChat', {
            provider: 'gemini', model: modelName,
            messageCount: messages?.length || 0,
        }, parentTensorId);

        let totalContentLength = 0;

        try {
            const model = this._getGeminiModel(modelName);
            const { systemText, history } = this._toGeminiFormat(messages);

            const lastMsg = history.pop();
            const prompt = lastMsg.parts[0].text;

            const chatOpts = {};
            if (history.length > 0) chatOpts.history = history;
            if (systemText) chatOpts.systemInstruction = { parts: [{ text: systemText }] };
            chatOpts.generationConfig = {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: options.maxTokens || GEMINI_MAX_TOKENS,
            };

            const chat = model.startChat(chatOpts);
            const result = await chat.sendMessageStream(prompt);

            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) {
                    totalContentLength += text.length;
                    onChunk(text);
                }
            }

            tensorService?.complete(tensor?.id, {
                provider: 'gemini', model: modelName,
                totalContentLength,
            });
        } catch (error) {
            tensorService?.fail(tensor?.id, error);
            // 429 rate limit — retry with fallback model
            if (error.message?.includes('429') && modelName !== GEMINI_FALLBACK_MODEL) {
                console.warn(`[LlmService] Gemini stream 429 on ${modelName}, retrying with ${GEMINI_FALLBACK_MODEL}`);
                return this._streamGemini(messages, onChunk, parentTensorId, { ...options, model: GEMINI_FALLBACK_MODEL });
            }
            console.error(`[LlmService] Gemini stream error: ${error.message}`);
            throw error;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // OLLAMA (LOCAL)
    // ═════════════════════════════════════════════════════════════════════════

    async _chatOllama(messages, tools, parentTensorId, options = {}) {
        const model = options.model || OLLAMA_MODEL;
        const tensorService = getTensorServiceLazy();
        const tensor = tensorService?.start('ai.llm.chat', {
            provider: 'ollama', model,
            messageCount: messages?.length || 0,
            hasTools: tools?.length > 0
        }, parentTensorId);

        try {
            const payload = {
                model,
                messages: messages,
                stream: false,
                temperature: options.temperature ?? 0.0,
            };

            if (tools && tools.length > 0) {
                payload.tools = tools;
                payload.tool_choice = 'auto';
            }

            const response = await axios.post(
                `${OLLAMA_API_BASE}/chat/completions`,
                payload
            );

            const result = response.data.choices[0].message;
            tensorService?.complete(tensor?.id, {
                provider: 'ollama', model,
                hasToolCalls: !!result.tool_calls,
                contentLength: result.content?.length || 0
            });

            return result;
        } catch (error) {
            console.error('[LlmService] Ollama error:', error.message);
            tensorService?.fail(tensor?.id, error);
            throw error;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STREAMING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Streams chat completion from the LLM.
     * @param {Array<{role: string, content: string}>} messages
     * @param {Function} onChunk - Callback for each text chunk.
     * @param {string} parentTensorId
     * @param {Object} options - { provider, model, temperature }
     * @returns {Promise<void>}
     */
    async streamChat(messages, onChunk, parentTensorId = null, options = {}) {
        const provider = options.provider || this.provider;

        if (provider === 'gemini') {
            return this._streamGemini(messages, onChunk, parentTensorId, options);
        }
        if (provider === 'anthropic') {
            return this._streamAnthropic(messages, onChunk, parentTensorId, options);
        }
        return this._streamOllama(messages, onChunk, parentTensorId, options);
    }

    async _streamAnthropic(messages, onChunk, parentTensorId, options = {}) {
        const model = options.model || ANTHROPIC_MODEL;
        const apiKey = getApiKey('anthropic');
        if (!apiKey) {
            return this._streamOllama(messages, onChunk, parentTensorId, options);
        }

        const tensorService = getTensorServiceLazy();
        const tensor = tensorService?.start('ai.llm.streamChat', {
            provider: 'anthropic', model,
            messageCount: messages?.length || 0
        }, parentTensorId);

        let totalContentLength = 0;

        try {
            let system = '';
            const apiMessages = [];
            for (const msg of messages) {
                if (msg.role === 'system') {
                    system += (system ? '\n\n' : '') + msg.content;
                } else {
                    apiMessages.push({ role: msg.role, content: msg.content });
                }
            }
            const mergedMessages = this._enforceAlternation(apiMessages);

            const payload = {
                model,
                max_tokens: options.maxTokens || ANTHROPIC_MAX_TOKENS,
                temperature: options.temperature ?? 0.7,
                stream: true,
                messages: mergedMessages,
            };
            if (system) payload.system = system;

            const response = await axios.post(ANTHROPIC_API_URL, payload, {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                responseType: 'stream',
                timeout: 120000,
            });

            return new Promise((resolve, reject) => {
                const stream = response.data;
                let buffer = '';

                stream.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const jsonStr = line.slice(6).trim();
                        if (jsonStr === '[DONE]') continue;

                        try {
                            const event = JSON.parse(jsonStr);
                            if (event.type === 'content_block_delta' && event.delta?.text) {
                                totalContentLength += event.delta.text.length;
                                onChunk(event.delta.text);
                            }
                        } catch (_) {}
                    }
                });

                stream.on('end', () => {
                    tensorService?.complete(tensor?.id, { totalContentLength });
                    resolve();
                });

                stream.on('error', (err) => {
                    tensorService?.fail(tensor?.id, err);
                    reject(err);
                });
            });
        } catch (error) {
            console.error('[LlmService] Anthropic stream error:', error.message);
            tensorService?.fail(tensor?.id, error);
            throw error;
        }
    }

    async _streamOllama(messages, onChunk, parentTensorId, options = {}) {
        const model = options.model || OLLAMA_MODEL;
        const tensorService = getTensorServiceLazy();
        const tensor = tensorService?.start('ai.llm.streamChat', {
            provider: 'ollama', model,
            messageCount: messages?.length || 0
        }, parentTensorId);

        let totalChunks = 0;
        let totalContentLength = 0;

        try {
            const response = await axios.post(
                `${OLLAMA_API_BASE}/chat/completions`,
                {
                    model,
                    messages: messages,
                    stream: true,
                    temperature: options.temperature ?? 0.7
                },
                { responseType: 'stream' }
            );

            const stream = response.data;

            return new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        if (line.includes('[DONE]')) return;
                        if (line.startsWith('data: ')) {
                            try {
                                const json = JSON.parse(line.replace('data: ', ''));
                                const content = json.choices[0]?.delta?.content;
                                if (content) {
                                    totalChunks++;
                                    totalContentLength += content.length;
                                    onChunk(content);
                                }
                            } catch (e) {
                                console.warn('Error parsing stream chunk:', e.message);
                            }
                        }
                    }
                });

                stream.on('end', () => {
                    tensorService?.complete(tensor?.id, { totalChunks, totalContentLength });
                    resolve();
                });

                stream.on('error', (err) => {
                    tensorService?.fail(tensor?.id, err);
                    reject(err);
                });
            });

        } catch (error) {
            console.error('[LlmService] Ollama stream error:', error.message);
            tensorService?.fail(tensor?.id, error);
            throw error;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STRUCTURED OUTPUT
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Generate structured output with JSON Schema validation.
     * @param {string} prompt
     * @param {string|Object} schema
     * @param {Object} options
     * @param {string} parentTensorId
     * @returns {Promise<Object>}
     */
    async generateStructured(prompt, schema, options = {}, parentTensorId = null) {
        const tensorService = getTensorServiceLazy();
        const tensor = tensorService?.start('ai.llm.generateStructured', {
            schema: typeof schema === 'string' ? schema : 'custom',
            provider: options.provider || 'gemini'
        }, parentTensorId);

        try {
            const structuredOutput = getStructuredOutputLazy();
            if (!structuredOutput) {
                throw new Error('StructuredOutputService not available');
            }

            const result = await structuredOutput.generate(prompt, schema, options);

            tensorService?.complete(tensor?.id, {
                success: result.success,
                provider: result.provider,
                method: result.method,
                validationErrors: result.validation?.errors?.length || 0
            });

            return result;
        } catch (error) {
            console.error('LLM Structured Generation Error:', error.message);
            tensorService?.fail(tensor?.id, error);
            throw error;
        }
    }

    registerSchema(name, schema) {
        const structuredOutput = getStructuredOutputLazy();
        if (structuredOutput) {
            structuredOutput.registerSchema(name, schema);
        }
    }

    getRegisteredSchemas() {
        const structuredOutput = getStructuredOutputLazy();
        return structuredOutput ? structuredOutput.getRegisteredSchemas() : [];
    }

    /**
     * Merge consecutive same-role messages and ensure the array starts with 'user'.
     * Required by the Anthropic Messages API which enforces strict alternation.
     */
    _enforceAlternation(messages) {
        if (!messages || messages.length === 0) {
            return [{ role: 'user', content: '(начни)' }];
        }

        const merged = [];
        for (const msg of messages) {
            if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
                merged[merged.length - 1] = {
                    role: msg.role,
                    content: merged[merged.length - 1].content + '\n\n' + msg.content,
                };
            } else {
                merged.push({ role: msg.role, content: msg.content });
            }
        }

        if (merged[0].role !== 'user') {
            merged.unshift({ role: 'user', content: '(начни)' });
        }

        return merged;
    }
}

module.exports = new LlmService();
