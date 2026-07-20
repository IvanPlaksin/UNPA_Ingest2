/**
 * Messaging Provider Manager
 *
 * Facade capable of routing requests to different messaging providers (Claude, Gemini, etc.)
 */

import type { IMessagingService } from './messaging-service-interface.js';
import type { AgentTask, ConversationContext, TaskRequest, TaskResult } from './claude-messaging-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('messaging-manager');

export const CAPABILITY_NOT_SUPPORTED = 'CAPABILITY_NOT_SUPPORTED';

export class CapabilityNotSupportedError extends Error {
    readonly code = CAPABILITY_NOT_SUPPORTED;
    readonly providerName: string;
    readonly capability: string;

    constructor(providerName: string, capability: string) {
        super(`Provider '${providerName}' does not support '${capability}'`);
        this.name = 'CapabilityNotSupportedError';
        this.providerName = providerName;
        this.capability = capability;
    }
}

export class MessagingProviderManager implements IMessagingService {
    private providers: Map<string, IMessagingService> = new Map();
    private defaultProvider: string;

    constructor(defaultProvider: string = 'claude') {
        this.defaultProvider = defaultProvider;
    }

    registerProvider(name: string, provider: IMessagingService) {
        this.providers.set(name, provider);
        logger.info({ name }, 'Registered messaging provider');
    }

    getProvider(name?: string): IMessagingService {
        const providerName = name || this.defaultProvider;
        const provider = this.providers.get(providerName);

        if (!provider) {
            throw new Error(`Messaging provider '${providerName}' not found`);
        }
        return provider;
    }

    async sendTask(request: TaskRequest): Promise<TaskResult> {
        const providerName = request.provider || this.defaultProvider;
        logger.debug({ provider: providerName, taskType: request.task.type }, 'Routing sendTask');
        return this.getProvider(providerName).sendTask(request);
    }

    getTask(taskId: string): AgentTask | undefined {
        // We need to check all providers as we don't know which one executed it
        // Or we could enforce ID Prefixing. For now, check all.
        for (const [name, provider] of this.providers) {
            const task = provider.getTask(taskId);
            if (task) return task;
        }
        return undefined;
    }

    listTasks(filter?: { status?: AgentTask['status']; type?: AgentTask['type'] }): AgentTask[] {
        // Aggregate tasks from all providers
        const allTasks: AgentTask[] = [];
        for (const provider of this.providers.values()) {
            allTasks.push(...provider.listTasks(filter));
        }
        return allTasks;
    }

    // --- Optional methods delegation ---

    async getConversation(
        conversationId: string,
        providerName?: string
    ): Promise<ConversationContext | null> {
        const resolvedName = providerName || this.defaultProvider;
        const provider = this.getProvider(resolvedName);

        if (provider.getConversation) {
            return provider.getConversation(conversationId);
        }

        throw new CapabilityNotSupportedError(resolvedName, 'getConversation');
    }

    async listConversations(providerName?: string): Promise<ConversationContext[]> {
        const resolvedName = providerName || this.defaultProvider;
        const provider = this.getProvider(resolvedName);

        if (provider.listConversations) {
            return provider.listConversations();
        }

        throw new CapabilityNotSupportedError(resolvedName, 'listConversations');
    }

    async sendMessageToChat(
        conversationId: string,
        message: string,
        options?: {
            maxTokens?: number;
            pollInterval?: number;
            maxPolls?: number;
            provider?: string;
        }
    ): Promise<{
        success: boolean;
        response?: string;
        error?: string;
        messageId?: string;
        tokensUsed?: number;
    }> {
        const providerName = options?.provider || this.defaultProvider;
        const provider = this.getProvider(providerName);

        if (provider.sendMessageToChat) {
            return provider.sendMessageToChat(conversationId, message, options);
        }

        return {
            success: false,
            error: `Provider '${providerName}' does not support sendMessageToChat`
        };
    }

    async getMessagesFromChat(
        conversationId: string,
        options?: {
            limit?: number;
            offset?: number;
            sender?: 'human' | 'assistant';
            provider?: string;
        }
    ): Promise<{
        success: boolean;
        messages?: Array<{
            id: string;
            sender: 'human' | 'assistant';
            text: string;
            created_at: string;
        }>;
        total?: number;
        error?: string;
    }> {
        // For getMessages, we might need to know the provider or try to find where the conversation exists.
        // For simplicity, we use the requested provider or default, or iterate if needed.
        // Given conversation IDs might not be unique across services, passing provider is best.
        const providerName = options?.provider || this.defaultProvider;

        // Slight issue: if user doesn't specify provider, we might look in wrong place.
        // But usually conversation interaction follows creation.
        const provider = this.getProvider(providerName);

        if (provider.getMessagesFromChat) {
            return provider.getMessagesFromChat(conversationId, options);
        }

        return {
            success: false,
            error: `Provider '${providerName}' does not support getMessagesFromChat`
        };
    }
}
