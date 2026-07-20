/**
 * Claude API Messaging Service
 *
 * Alternative implementation using official Anthropic API
 * More reliable than web API scraping
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import type { IMessagingService } from './messaging-service-interface.js';
import type {
  AgentTask,
  TaskRequest,
  TaskResult,
} from './claude-messaging-types.js';

const logger = createLogger('claude-api-messaging');

export interface ClaudeApiMessagingConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet) */
  model?: string;
}

export class ClaudeApiMessagingService implements IMessagingService {
  private config: Required<ClaudeApiMessagingConfig>;
  private client: Anthropic;
  private tasks: Map<string, AgentTask> = new Map();
  private conversations: Map<string, Array<Anthropic.MessageParam>> = new Map();

  constructor(config: ClaudeApiMessagingConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || 'claude-3-5-sonnet-20241022'
    };

    this.client = new Anthropic({
      apiKey: this.config.apiKey
    });

    logger.info({ model: this.config.model }, 'ClaudeApiMessagingService initialized');
  }

  /**
   * Send task to Claude AI via official API
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
      let messages = this.conversations.get(conversationId) || [];

      // Format task prompt
      const prompt = this.formatTaskPrompt(task);

      // Add user message
      messages.push({
        role: 'user',
        content: prompt
      });

      // Call Claude API
      logger.debug({ taskId, messageCount: messages.length }, 'Calling Claude API');

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: request.maxTokens || 4096,
        messages: messages as Anthropic.MessageParam[]
      });

      // Extract text response
      const textContent = response.content.find(block => block.type === 'text');
      const content = textContent && textContent.type === 'text' ? textContent.text : '';

      // Add assistant response to history
      messages.push({
        role: 'assistant',
        content: content
      });

      this.conversations.set(conversationId, messages);

      // Update task
      task.status = 'done';
      task.result = content;
      task.updated = Date.now();
      this.tasks.set(taskId, task);

      logger.info({
        taskId,
        type: task.type,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens
      }, 'Task completed');

      return {
        taskId,
        status: 'done',
        result: content,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens
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
   * Get conversation history
   */
  getConversationHistory(conversationId: string = 'default'): Array<Anthropic.MessageParam> {
    return this.conversations.get(conversationId) || [];
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId: string = 'default'): void {
    this.conversations.delete(conversationId);
    logger.info({ conversationId }, 'Conversation cleared');
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
