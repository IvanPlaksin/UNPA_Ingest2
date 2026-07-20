/**
 * Claude Messaging Service
 *
 * Inter-agent communication service for task delegation and result reporting.
 * Uses minimal, token-efficient English messages for AI-to-AI communication.
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import { CloudflareBypasser, describeHttpError } from '../utils/cloudflare-bypasser.js';
import type { IMessagingService } from './messaging-service-interface.js';
import type {
  AgentTask,
  AgentMessage,
  TaskRequest,
  TaskResult,
  ConversationContext
} from './claude-messaging-types.js';

const logger = createLogger('claude-messaging');

export interface ClaudeMessagingConfig {
  /** Session key for Claude.ai */
  sessionKey: string;
  /** Organization ID */
  organizationId: string;
  /** Project ID */
  projectId: string;
  /** Base URL */
  baseUrl?: string;
}

export class ClaudeMessagingService implements IMessagingService {
  private config: Required<ClaudeMessagingConfig>;
  private bypasser: CloudflareBypasser;
  private tasks: Map<string, AgentTask> = new Map();
  private messages: Map<string, AgentMessage> = new Map();

  constructor(config: ClaudeMessagingConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || 'https://claude.ai/api'
    };

    this.bypasser = new CloudflareBypasser({
      sessionKey: config.sessionKey,
      baseReferer: `https://claude.ai/project/${config.projectId}`,
      timeout: 60000
    });

    logger.info('ClaudeMessagingService initialized');
  }

  /**
   * Send task to Claude AI
   * Creates new conversation or uses existing one
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
      // Create conversation if needed
      let conversationId = request.conversationId;
      if (!conversationId) {
        conversationId = await this.createConversation(
          `Task: ${task.type} - ${task.desc.substring(0, 50)}`
        );
      }

      // Format task message (minimal, English)
      const prompt = this.formatTaskPrompt(task);

      // Send message to Claude with response polling
      const response = await this.sendMessageWithResponse(
        conversationId,
        prompt,
        request.maxTokens,
        2000, // Poll every 2 seconds
        30    // Max 30 polls (60 seconds total)
      );

      // Update task
      task.status = 'done';
      task.result = response.content;
      task.updated = Date.now();
      this.tasks.set(taskId, task);

      logger.info({ taskId, type: task.type }, 'Task completed');

      return {
        taskId,
        status: 'done',
        result: response.content,
        tokensUsed: response.tokensUsed
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
   * Create new conversation
   */
  private async createConversation(title: string): Promise<string> {
    const url = `${this.config.baseUrl}/organizations/${this.config.organizationId}/chat_conversations`;

    const body = {
      name: title,
      project_uuid: this.config.projectId,
      uuid: uuidv4()
    };

    logger.debug({ title }, 'Creating conversation');

    const response = await this.bypasser.post(url, body);

    if (response.statusCode !== 200 && response.statusCode !== 201) {
      throw new Error(`Failed to create conversation: ${describeHttpError(response.statusCode, response.body, url)}`);
    }

    const data = JSON.parse(response.body);
    logger.info({ conversationId: data.uuid, title }, 'Conversation created');

    return data.uuid;
  }

  /**
   * Send message to conversation
   * Note: This endpoint doesn't reliably return parsed content
   * Use sendMessageWithResponse() for reliable message+response flow
   */
  private async sendMessage(
    conversationId: string,
    prompt: string,
    maxTokens: number = 4096
  ): Promise<{ content: string; tokensUsed: number }> {
    const url = `${this.config.baseUrl}/organizations/${this.config.organizationId}/chat_conversations/${conversationId}/completion`;

    // Get the last message UUID (parent_message_uuid is required for web API)
    const messages = await this.getMessages(conversationId);
    const lastMessage = messages[messages.length - 1];

    // Build complete request body with all required fields
    const body: any = {
      prompt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      locale: 'en-US',
      model: 'claude-opus-4-5-20251101', // Can be configured: opus-4-5, sonnet-4-5, haiku-3-5
      tools: [
        { type: 'web_search_v0', name: 'web_search' },
        { type: 'artifacts_v0', name: 'artifacts' },
        { type: 'repl_v0', name: 'repl' },
        { type: 'project_knowledge_search', name: 'project_knowledge_search' }
      ],
      personalized_styles: [
        {
          type: 'default',
          key: 'Default',
          name: 'Normal',
          nameKey: 'normal_style_name',
          prompt: 'Normal\n',
          summary: 'Default responses from Claude',
          summaryKey: 'normal_style_summary',
          isDefault: true
        }
      ],
      attachments: [],
      files: [],
      sync_sources: [],
      rendering_mode: 'messages'
    };

    // Add parent_message_uuid if there are existing messages
    if (lastMessage) {
      body.parent_message_uuid = lastMessage.id;
    }

    logger.debug({
      conversationId,
      promptLength: prompt.length,
      parentMessageUuid: body.parent_message_uuid,
      model: body.model
    }, 'Sending message with full body');

    const response = await this.bypasser.post(url, body);

    if (response.statusCode !== 200) {
      throw new Error(`Message send failed: ${describeHttpError(response.statusCode, response.body, url)}`);
    }

    // Parse streaming response (Claude returns Server-Sent Events)
    const content = this.parseSSEResponse(response.body);

    logger.info({
      conversationId,
      responseLength: content.length
    }, 'Message sent successfully');

    return {
      content,
      tokensUsed: this.estimateTokens(prompt) + this.estimateTokens(content)
    };
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

  /**
   * Parse Server-Sent Events response from Claude
   */
  private parseSSEResponse(body: string): string {
    const lines = body.split('\n');
    const contentParts: string[] = [];

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));

          if (data.type === 'content_block_delta' && data.delta?.text) {
            contentParts.push(data.delta.text);
          } else if (data.completion) {
            contentParts.push(data.completion);
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }

    return contentParts.join('');
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get conversation history
   */
  async getConversation(conversationId: string): Promise<ConversationContext | null> {
    const url = `${this.config.baseUrl}/organizations/${this.config.organizationId}/chat_conversations/${conversationId}`;
    try {
      const response = await this.bypasser.get(url);

      if (response.statusCode === 404) {
        return null;
      }

      if (response.statusCode !== 200) {
        throw new Error(describeHttpError(response.statusCode, response.body, url));
      }

      const data = JSON.parse(response.body);

      return {
        id: data.uuid,
        projectId: data.project_uuid || this.config.projectId,
        title: data.name || 'Untitled',
        messageCount: data.chat_messages?.length || 0,
        created: new Date(data.created_at).getTime(),
        lastActivity: new Date(data.updated_at).getTime()
      };
    } catch (error) {
      logger.error({ conversationId, error: error instanceof Error ? error.message : String(error) }, 'Failed to get conversation');
      throw error;
    }
  }

  /**
   * List project conversations
   */
  async listConversations(): Promise<ConversationContext[]> {
    const url = `${this.config.baseUrl}/organizations/${this.config.organizationId}/chat_conversations?project_uuid=${this.config.projectId}`;
    try {
      const response = await this.bypasser.get(url);

      if (response.statusCode !== 200) {
        throw new Error(describeHttpError(response.statusCode, response.body, url));
      }

      const conversations = JSON.parse(response.body);

      return conversations.map((conv: any) => ({
        id: conv.uuid,
        projectId: conv.project_uuid || this.config.projectId,
        title: conv.name || 'Untitled',
        messageCount: 0,
        created: new Date(conv.created_at).getTime(),
        lastActivity: new Date(conv.updated_at).getTime()
      }));
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to list conversations');
      throw error;
    }
  }

  /**
   * Get messages from conversation
   */
  async getMessages(conversationId: string): Promise<Array<{
    id: string;
    sender: 'human' | 'assistant';
    text: string;
    created_at: string;
  }>> {
    const url = `${this.config.baseUrl}/organizations/${this.config.organizationId}/chat_conversations/${conversationId}`;

    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      return [];
    }

    const response = await this.bypasser.get(url);

    if (response.statusCode !== 200) {
      throw new Error(describeHttpError(response.statusCode, response.body, url));
    }

    const data = JSON.parse(response.body);

    return (data.chat_messages || []).map((msg: any) => ({
      id: msg.uuid,
      sender: msg.sender,
      text: msg.text || '',
      created_at: msg.created_at
    }));
  }

  /**
   * Send message and wait for response using polling
   */
  async sendMessageWithResponse(
    conversationId: string,
    prompt: string,
    maxTokens: number = 4096,
    pollInterval: number = 2000,
    maxPolls: number = 30
  ): Promise<{ content: string; tokensUsed: number }> {
    // Get current message count
    const messagesBefore = await this.getMessages(conversationId);
    const countBefore = messagesBefore.length;

    logger.debug({ conversationId, countBefore }, 'Messages before sending');

    // Send message using existing method
    try {
      await this.sendMessage(conversationId, prompt, maxTokens);
    } catch (error) {
      // Even if sendMessage fails to parse, the message might still be sent
      logger.warn({ error }, 'sendMessage returned error, but checking for new messages anyway');
    }

    // Poll for new assistant message
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const messagesAfter = await this.getMessages(conversationId);
      const countAfter = messagesAfter.length;

      logger.debug({
        conversationId,
        countBefore,
        countAfter,
        poll: i + 1
      }, 'Polling for response');

      if (countAfter > countBefore) {
        // Find new assistant messages
        const newMessages = messagesAfter.slice(countBefore);
        const assistantMessage = newMessages.find(m => m.sender === 'assistant');

        if (assistantMessage) {
          logger.info({
            conversationId,
            messageId: assistantMessage.id,
            length: assistantMessage.text.length
          }, 'Got assistant response');

          return {
            content: assistantMessage.text,
            tokensUsed: this.estimateTokens(prompt) + this.estimateTokens(assistantMessage.text)
          };
        }
      }
    }

    throw new Error('Timeout waiting for assistant response');
  }

  /**
   * Send a regular message to a chat conversation and get response
   * This is a simplified version for sending user messages (not tasks)
   */
  async sendMessageToChat(
    conversationId: string,
    message: string,
    options?: {
      maxTokens?: number;
      pollInterval?: number;
      maxPolls?: number;
    }
  ): Promise<{
    success: boolean;
    response?: string;
    error?: string;
    messageId?: string;
    tokensUsed?: number;
  }> {
    try {
      const result = await this.sendMessageWithResponse(
        conversationId,
        message,
        options?.maxTokens || 4096,
        options?.pollInterval || 2000,
        options?.maxPolls || 30
      );

      return {
        success: true,
        response: result.content,
        tokensUsed: result.tokensUsed
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
   * Get messages from a specific chat conversation
   * Supports pagination and filtering
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
      id: string;
      sender: 'human' | 'assistant';
      text: string;
      created_at: string;
    }>;
    total?: number;
    error?: string;
  }> {
    try {
      let messages = await this.getMessages(conversationId);

      // Filter by sender if specified
      if (options?.sender) {
        messages = messages.filter(m => m.sender === options.sender);
      }

      // Apply pagination
      const total = messages.length;
      const offset = options?.offset || 0;
      const limit = options?.limit || 100;

      messages = messages.slice(offset, offset + limit);

      return {
        success: true,
        messages,
        total
      };
    } catch (error) {
      logger.error({ conversationId, error }, 'Failed to get messages from chat');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
