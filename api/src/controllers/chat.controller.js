
const geminiService = require('../services/gemini.service');
const ragService = require('../services/rag.service');
const { getInstance: getLLMProvider } = require('../services/llm/LLMProviderService');

async function handleChatRequest(req, res) {
    // Legacy non-streaming endpoint (kept for compatibility if needed)
    try {
        const { message, context, userId } = req.body;
        if (!message) return res.status(400).json({ error: "No message provided" });

        const agentResponse = await geminiService.runAgent(message, userId, context);
        res.status(200).json({ response: agentResponse });
    } catch (error) {
        console.error("Error in handleChatRequest:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

const AVAILABLE_TOOLS = [
    {
        type: "function",
        function: {
            "name": "search_knowledge_base",
            "description": "Use this tool to search for technical information, documentation, tasks, and people.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "The search query" }
                },
                "required": ["query"]
            }
        }
    }
];

/**
 * Handles streaming chat requests with Agentic Tool Calling.
 */
async function handleChatMessage(req, res) {
    try {
        const { message, history = [] } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        console.log(`[Chat] Agent request: "${message}"`);

        // Set Headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 1. Prepare Initial Messages
        const initialSystemPrompt = `You are UN ProjectAdvisor.
You have access to a knowledge base via the 'search_knowledge_base' tool.
If the user asks a question that requires external knowledge, call the tool.
If the user just says hello or asks a general question, answer directly.
ALWAYS cite sources using [1], [2] if you use the tool results.`;

        let currentMessages = [
            { role: 'system', content: initialSystemPrompt },
            ...history,
            { role: 'user', content: message }
        ];

        // 2. Initial LLM Call (Check for Tools)
        const firstResponse = await getLLMProvider().chat(currentMessages, { tools: AVAILABLE_TOOLS, caller: 'controllers' });

        // 3. Handle Tool Calls (Anthropic format: content blocks with type=tool_use)
        const toolUseBlocks = Array.isArray(firstResponse.content)
            ? firstResponse.content.filter(b => b.type === 'tool_use')
            : [];
        if (toolUseBlocks.length > 0) {
            const toolBlock = toolUseBlocks[0];
            const toolCall = {
                function: { name: toolBlock.name, arguments: JSON.stringify(toolBlock.input || {}) },
                id: toolBlock.id,
            };
            console.log(`[Chat] Tool Call: ${toolCall.function.name}`);

            if (toolCall.function.name === 'search_knowledge_base') {
                const args = toolBlock.input || {};
                const query = args.query;

                // Notify Client: Status
                res.write(`data: ${JSON.stringify({ type: 'status', message: `Searching for "${query}"...` })}\n\n`);

                // Execute Tool (RAG)
                const { context, sources } = await ragService.retrieveContext(query);

                // Notify Client: Sources
                res.write(`data: ${JSON.stringify({ type: 'sources', sources: sources })}\n\n`);

                // Add Tool Result to History (Anthropic format)
                currentMessages.push({ role: 'assistant', content: firstResponse.content });
                currentMessages.push({
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: toolBlock.id,
                        content: context,
                    }],
                });
            }
        } else {
            // No tool called, just stream the text response
            // If firstResponse has content, we could just send it, but to be consistent with streaming interface,
            // we might want to stream it or just send it as one chunk.
            // However, llmService.chat returns the full message.
            // Let's just continue to streamChat for the final pass if we want streaming.
            // BUT, if we already got the answer in firstResponse (because no tool was needed), 
            // we should just send it.

            const noToolContent = Array.isArray(firstResponse.content)
                ? firstResponse.content.filter(b => b.type === 'text').map(b => b.text).join('')
                : (firstResponse.content || '');
            if (noToolContent) {
                res.write(`data: ${JSON.stringify({ type: 'token', content: noToolContent })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            }
        }

        // 4. Final Streaming Response (Answer based on Tool Result)
        const streamObj = getLLMProvider().stream(currentMessages, { caller: 'controllers' });
        for await (const event of streamObj) {
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                res.write(`data: ${JSON.stringify({ type: 'token', content: event.delta.text })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error("Error in handleChatMessage:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
        }
    }
}

module.exports = {
    handleChatRequest,
    handleChatMessage
};