'use strict';

/**
 * ExportAssistantAgent — a focused tool-use agent that turns natural-language
 * requests into Graph Transfer exports. Reuses the platform's scoped LLM provider
 * (llm-access-control) — same streaming + retry path as the GXE agent — with just
 * the 6 export tools and an export-specialized system prompt.
 */

const { getScopedProvider } = require('../llm-access-control.service');
const { TOOLS, executeTool } = require('./tools');
const { buildSystemPrompt } = require('./system-prompt');

const MAX_ITERATIONS = parseInt(process.env.EXPORT_ASSISTANT_MAX_ITERATIONS || '8', 10);
// The scoped provider's 'sonnet' alias maps to a model this account can't access
// (claude-sonnet-4-20250514 → 404). Use the verified-available Haiku 4.5 by default
// (same model FlowDesk uses); override via EXPORT_ASSISTANT_MODEL.
const MODEL = process.env.EXPORT_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;

class ExportAssistantAgent {
    constructor() {
        this.provider = getScopedProvider('agent_service');
        this.system = buildSystemPrompt();
    }

    /**
     * Run the agentic loop over a conversation. Yields events:
     *   {type:'text', content} | {type:'tool_call', name, input} |
     *   {type:'tool_result', name, result} | {type:'tool_error', name, error} |
     *   {type:'done', iterations} | {type:'error', content}
     * @param {Array<{role,content}>} messages
     */
    async *chat(messages) {
        const convo = messages.map((m) => ({ role: m.role, content: m.content }));
        let iterations = 0;

        while (iterations < MAX_ITERATIONS) {
            iterations++;
            let stream;
            try {
                stream = this.provider.stream(convo, { model: MODEL, maxTokens: MAX_TOKENS, system: this.system, tools: TOOLS });
            } catch (e) {
                yield { type: 'error', content: `LLM call failed: ${e.message}` };
                return;
            }

            let assistantContent = [];
            try {
                for await (const event of stream) {
                    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                        yield { type: 'text', content: event.delta.text };
                    }
                }
                const final = await stream.finalMessage();
                if (final?.content) assistantContent = final.content;
            } catch (e) {
                yield { type: 'error', content: `Stream error: ${e.message}` };
                return;
            }

            const toolUses = assistantContent.filter((b) => b.type === 'tool_use');
            if (toolUses.length === 0) { yield { type: 'done', iterations }; return; }

            // Execute tools, feed results back. Emit tool_call here (the provider's
            // stream doesn't reliably surface tool_use blocks mid-stream).
            convo.push({ role: 'assistant', content: assistantContent });
            const toolResults = [];
            for (const block of toolUses) {
                yield { type: 'tool_call', name: block.name, input: block.input, id: block.id };
                try {
                    const result = await executeTool(block.name, block.input || {});
                    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
                    yield { type: 'tool_result', name: block.name, result };
                } catch (e) {
                    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: e.message }), is_error: true });
                    yield { type: 'tool_error', name: block.name, error: e.message };
                }
            }
            convo.push({ role: 'user', content: toolResults });
        }
        yield { type: 'error', content: `Max iterations (${MAX_ITERATIONS}) reached` };
    }

    /** Collect all events (non-streaming). */
    async run(messages) {
        const events = [];
        for await (const ev of this.chat(messages)) events.push(ev);
        const text = events.filter((e) => e.type === 'text').map((e) => e.content).join('');
        const toolCalls = events.filter((e) => e.type === 'tool_call').map((e) => ({ name: e.name, input: e.input }));
        // Keep tool_result + tool_error in emission order so the UI aligns them with tool_calls.
        const toolResults = events
            .filter((e) => e.type === 'tool_result' || e.type === 'tool_error')
            .map((e) => (e.type === 'tool_error' ? { name: e.name, error: e.error } : { name: e.name, result: e.result }));
        const error = events.find((e) => e.type === 'error');
        return { response: text, toolCalls, toolResults, error: error?.content || null };
    }
}

module.exports = { ExportAssistantAgent };
