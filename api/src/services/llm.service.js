const axios = require('axios');

const LLM_API_BASE = process.env.LLM_API_BASE || 'http://localhost:11434/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'llama3';

class LlmService {
    /**
     * Sends a chat completion request (non-streaming).
     * @param {Array} messages
     * @param {Array} tools
     * @returns {Promise<object>}
     */
    async chat(messages, tools = []) {
        try {
            const payload = {
                model: LLM_MODEL,
                messages: messages,
                stream: false,
                temperature: 0.0 // Deterministic for tool calling
            };

            if (tools && tools.length > 0) {
                payload.tools = tools;
                payload.tool_choice = "auto";
            }

            const response = await axios.post(
                `${LLM_API_BASE}/chat/completions`,
                payload
            );

            return response.data.choices[0].message;
        } catch (error) {
            console.error('LLM Chat Error:', error.message);
            throw error;
        }
    }

    /**
     * Streams chat completion from the LLM.
     * @param {Array<{role: string, content: string}>} messages - Chat history.
     * @param {Function} onChunk - Callback for each text chunk.
     * @returns {Promise<void>}
     */
    async streamChat(messages, onChunk) {
        try {
            const response = await axios.post(
                `${LLM_API_BASE}/chat/completions`,
                {
                    model: LLM_MODEL,
                    messages: messages,
                    stream: true,
                    temperature: 0.7
                },
                {
                    responseType: 'stream'
                }
            );

            const stream = response.data;

            return new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        if (line.includes('[DONE]')) {
                            return; // Stream finished
                        }
                        if (line.startsWith('data: ')) {
                            try {
                                const jsonStr = line.replace('data: ', '');
                                const json = JSON.parse(jsonStr);
                                const content = json.choices[0]?.delta?.content;
                                if (content) {
                                    onChunk(content);
                                }
                            } catch (e) {
                                console.warn('Error parsing stream chunk:', e.message);
                            }
                        }
                    }
                });

                stream.on('end', () => {
                    resolve();
                });

                stream.on('error', (err) => {
                    reject(err);
                });
            });

        } catch (error) {
            console.error('LLM Stream Error:', error.message);
            throw error;
        }
    }
}

module.exports = new LlmService();
