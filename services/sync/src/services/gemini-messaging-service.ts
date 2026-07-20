/**
 * Gemini Messaging Service
 *
 * Implementation using official Google Generative AI SDK
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import type { IMessagingService } from './messaging-service-interface.js';
import type {
    AgentTask,
    TaskRequest,
    TaskResult,
} from './claude-messaging-types.js';

const logger = createLogger('gemini-messaging');

export interface GeminiMessagingConfig {
    /** Google AI API key */
    apiKey: string;
    /** Model to use (default: gemini-2.5-flash) */
    model?: string;
}

interface GeminiConversation {
    id: string;
    history: Array<{
        role: 'user' | 'model';
        parts: Array<{ text: string }>;
    }>;
    created: number;
    updated: number;
}

export class GeminiMessagingService implements IMessagingService {
    private config: Required<GeminiMessagingConfig>;
    private client: GoogleGenerativeAI;
    private tasks: Map<string, AgentTask> = new Map();
    private conversations: Map<string, GeminiConversation> = new Map();

    constructor(config: GeminiMessagingConfig) {
        this.config = {
            apiKey: config.apiKey,
            model: config.model || 'gemini-2.0-flash-exp' // Defaulting to latest flash experimental or stable
        };

        this.client = new GoogleGenerativeAI(this.config.apiKey);

        logger.info({ model: this.config.model }, 'GeminiMessagingService initialized');
    }

    /**
     * Send task to Gemini
     */
    async sendTask(request: TaskRequest): Promise<TaskResult> {
        const taskId = uuidv4();
        const task: AgentTask = {
            id: taskId,
            ...request.task,
            status: 'pending',
            created: Date.now(),
            updated: Date.now()
        };

        this.tasks.set(taskId, task);

        try {
            // Get or create conversation history
            const conversationId = request.conversationId || 'default';
            const conversation = this.getOrCreateConversation(conversationId);

            // Format task prompt
            const prompt = this.formatTaskPrompt(task);

            // Get model
            const model = this.client.getGenerativeModel({
                model: this.config.model,
                safetySettings: [
                    {
                        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                ],
            });

            // Start chat with history
            const chat = model.startChat({
                history: conversation.history,
                generationConfig: {
                    maxOutputTokens: request.maxTokens || 8192,
                }
            });

            logger.debug({ taskId, historyLength: conversation.history.length }, 'Calling Gemini API');

            const result = await chat.sendMessage(prompt);
            const response = result.response;
            const text = response.text();

            // Update conversation history in memory
            // Note: startChat keeps internal history, but we need to persist it if we want to reuse it
            // actually, startChat returns a ChatSession which has history.
            // But we are statelessly creating chat session each time from our stored history?
            // Yes, to simulate persistence across server restarts if we were actually persisting,
            // but here we just store in Map.

            // Update our stored history manually to ensure we capture the latest turn
            conversation.history.push({ role: 'user', parts: [{ text: prompt }] });
            conversation.history.push({ role: 'model', parts: [{ text: text }] });
            conversation.updated = Date.now();
            this.conversations.set(conversationId, conversation);

            // Update task
            task.status = 'done';
            task.result = text;
            task.updated = Date.now();
            this.tasks.set(taskId, task);

            const usage = response.usageMetadata;
            const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

            logger.info({
                taskId,
                type: task.type,
                tokensUsed
            }, 'Task completed');

            return {
                taskId,
                status: 'done',
                result: text,
                tokensUsed
            };
        } catch (error) {
            task.status = 'failed';
            task.error = error instanceof Error ? error.message : String(error);
            task.updated = Date.now();
            this.tasks.set(taskId, task);

            logger.error({ taskId, error: task.error }, 'Task failed');

            return {
                taskId,
                status: 'failed',
                error: task.error
            };
        }
    }

    /**
     * Get task status
     */
    getTask(taskId: string): AgentTask | undefined {
        return this.tasks.get(taskId);
    }

    /**
     * List all tasks
     */
    listTasks(filter?: { status?: AgentTask['status']; type?: AgentTask['type'] }): AgentTask[] {
        const tasks = Array.from(this.tasks.values());

        if (!filter) return tasks;

        return tasks.filter(task => {
            if (filter.status && task.status !== filter.status) return false;
            if (filter.type && task.type !== filter.type) return false;
            return true;
        });
    }

    /**
     * Send message to chat (simplified)
     */
    async sendMessageToChat(
        conversationId: string,
        message: string,
        options?: {
            maxTokens?: number;
        }
    ): Promise<{
        success: boolean;
        response?: string;
        error?: string;
        tokensUsed?: number;
    }> {
        try {
            const conversation = this.getOrCreateConversation(conversationId);

            const model = this.client.getGenerativeModel({
                model: this.config.model,
            });

            const chat = model.startChat({
                history: conversation.history,
                generationConfig: {
                    maxOutputTokens: options?.maxTokens || 8192,
                }
            });

            const result = await chat.sendMessage(message);
            const response = result.response;
            const text = response.text();

            // Update history
            conversation.history.push({ role: 'user', parts: [{ text: message }] });
            conversation.history.push({ role: 'model', parts: [{ text: text }] });
            conversation.updated = Date.now();
            this.conversations.set(conversationId, conversation);

            const usage = response.usageMetadata;
            const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

            return {
                success: true,
                response: text,
                tokensUsed
            };
        } catch (error) {
            logger.error({ conversationId, error }, 'Failed to send message to chat');
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get messages from chat
     */
    async getMessagesFromChat(
        conversationId: string,
        options?: {
            limit?: number;
            offset?: number;
            sender?: 'human' | 'assistant';
        }
    ): Promise<{
        success: boolean;
        messages?: Array<{
            id: string; // Gemini doesn't have msg IDs, we'll generate mock ones or use index
            sender: 'human' | 'assistant';
            text: string;
            created_at: string;
        }>;
        total?: number;
        error?: string;
    }> {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) {
            return { success: true, messages: [], total: 0 };
        }

        let messages = conversation.history.map((msg, index) => ({
            id: `${conversationId}-${index}`,
            sender: (msg.role === 'user' ? 'human' : 'assistant') as 'human' | 'assistant',
            text: msg.parts.map(p => p.text).join(''),
            created_at: new Date(conversation.created).toISOString() // Approximate
        }));

        if (options?.sender) {
            messages = messages.filter(m => m.sender === options.sender);
        }

        const total = messages.length;
        const offset = options?.offset || 0;
        const limit = options?.limit || 100;

        messages = messages.slice(offset, offset + limit);

        return {
            success: true,
            messages,
            total
        };
    }

    private getOrCreateConversation(id: string): GeminiConversation {
        if (!this.conversations.has(id)) {
            this.conversations.set(id, {
                id,
                history: [],
                created: Date.now(),
                updated: Date.now()
            });
        }
        return this.conversations.get(id)!;
    }

    /**
     * Format task as minimal English prompt
     */
    private formatTaskPrompt(task: AgentTask): string {
        const parts: string[] = [
            `TASK_ID: ${task.id}`,
            `TYPE: ${task.type}`,
            `DESC: ${task.desc}`
        ];

        if (task.priority) {
            parts.push(`PRIORITY: ${task.priority}`);
        }

        if (task.context && Object.keys(task.context).length > 0) {
            parts.push(`CONTEXT: ${JSON.stringify(task.context)}`);
        }

        parts.push('');
        parts.push('Execute task. Reply format:');
        parts.push('STATUS: [done/failed]');
        parts.push('RESULT: [task output]');
        parts.push('ERROR: [error if failed]');

        return parts.join('\n');
    }
}
