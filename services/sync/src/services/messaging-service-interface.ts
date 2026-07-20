/**
 * Common interface for messaging services
 */

import type { AgentTask, ConversationContext, TaskRequest, TaskResult } from './claude-messaging-types.js';

export interface IMessagingService {
  sendTask(request: TaskRequest): Promise<TaskResult>;
  getTask(taskId: string): AgentTask | undefined;
  listTasks(filter?: { status?: AgentTask['status']; type?: AgentTask['type'] }): AgentTask[];

  // Optional methods for chat-based services (Web API)
  getConversation?(conversationId: string): Promise<ConversationContext | null>;
  listConversations?(): Promise<ConversationContext[]>;

  sendMessageToChat?(
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
  }>;

  getMessagesFromChat?(
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
  }>;
}
