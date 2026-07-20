/**
 * MCP Tools for Inter-Agent Communication
 *
 * Tools for AI-to-AI task delegation and status reporting
 */

import type { IMessagingService } from '../services/messaging-service-interface.js';
import type { ClaudeMessagingService } from '../services/claude-messaging-service.js';
import { CapabilityNotSupportedError } from '../services/messaging-provider-manager.js';

/**
 * Get messaging tool definitions for MCP server
 */
export function getMessagingToolDefinitions() {
  return [
    {
      name: 'send_agent_task',
      description: `Send task to Claude AI agent. Use minimal English for token efficiency.
        Creates conversation and sends task request, returns taskId and result.`,
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['analyze', 'code', 'refactor', 'test', 'document', 'research', 'custom'],
            description: 'Task type'
          },
          desc: {
            type: 'string',
            description: 'Brief task description (max 200 chars)'
          },
          context: {
            type: 'object',
            description: 'Task context/input data (optional)'
          },
          priority: {
            type: 'number',
            enum: [1, 2, 3, 4],
            description: 'Priority: 1=critical, 2=high, 3=normal, 4=low (optional)'
          },
          conversationId: {
            type: 'string',
            description: 'Target conversation ID (optional, creates new if not provided)'
          },
          maxTokens: {
            type: 'number',
            description: 'Max response tokens (100-8000, optional, default 4096)'
          },
          provider: {
            type: 'string',
            enum: ['claude', 'gemini'],
            description: 'AI Provider to use (optional, default: claude)'
          }
        },
        required: ['type', 'desc']
      }
    },
    {
      name: 'get_agent_task',
      description: 'Get task status and result by ID',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task ID to retrieve'
          }
        },
        required: ['taskId']
      }
    },
    {
      name: 'list_agent_tasks',
      description: 'List all agent tasks with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'active', 'done', 'failed'],
            description: 'Filter by status (optional)'
          },
          type: {
            type: 'string',
            enum: ['analyze', 'code', 'refactor', 'test', 'document', 'research', 'custom'],
            description: 'Filter by task type (optional)'
          }
        }
      }
    },
    {
      name: 'get_conversation',
      description: 'Get conversation details by ID',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: 'Conversation ID to retrieve'
          }
        },
        required: ['conversationId']
      }
    },
    {
      name: 'list_conversations',
      description: 'List all conversations in the Claude.ai project',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'send_message_to_chat',
      description: `Send a regular message to a specific Claude.ai chat conversation and receive response.
        Use this for natural conversation flow (not structured task delegation).`,
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: 'Target conversation ID'
          },
          message: {
            type: 'string',
            description: 'Message text to send'
          },
          maxTokens: {
            type: 'number',
            description: 'Max response tokens (100-8000, optional, default 4096)'
          },
          pollInterval: {
            type: 'number',
            description: 'Poll interval in milliseconds (default 2000)'
          },
          maxPolls: {
            type: 'number',
            description: 'Max number of polls (default 30)'
          },
          provider: {
            type: 'string',
            enum: ['claude', 'gemini'],
            description: 'AI Provider to use (optional, default: claude)'
          }
        },
        required: ['conversationId', 'message']
      }
    },
    {
      name: 'get_messages_from_chat',
      description: `Get messages from a specific Claude.ai chat conversation.
        Supports pagination and filtering by sender (human/assistant).`,
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: 'Conversation ID to retrieve messages from'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of messages to return (default 100)'
          },
          offset: {
            type: 'number',
            description: 'Number of messages to skip (default 0)'
          },
          sender: {
            type: 'string',
            enum: ['human', 'assistant'],
            description: 'Filter by sender (optional)'
          }
        },
        required: ['conversationId']
      }
    }
  ];
}

/**
 * Handle messaging tool calls
 */
export async function handleMessagingToolCall(
  name: string,
  args: Record<string, unknown>,
  messagingService: IMessagingService
) {
  switch (name) {
    case 'send_agent_task': {
      const result = await messagingService.sendTask({
        task: {
          type: args.type as any,
          desc: args.desc as string,
          context: args.context as Record<string, unknown>,
          priority: args.priority as 1 | 2 | 3 | 4
        },
        conversationId: args.conversationId as string,
        maxTokens: args.maxTokens as number,
        provider: args.provider as string
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }

    case 'get_agent_task': {
      const task = messagingService.getTask(args.taskId as string);

      if (!task) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'Task not found' })
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(task, null, 2)
          }
        ]
      };
    }

    case 'list_agent_tasks': {
      const tasks = messagingService.listTasks({
        status: args.status as any,
        type: args.type as any
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              count: tasks.length,
              tasks: tasks.map(t => ({
                id: t.id,
                type: t.type,
                desc: t.desc,
                status: t.status,
                created: t.created,
                updated: t.updated
              }))
            }, null, 2)
          }
        ]
      };
    }

    case 'get_conversation': {
      try {
        const conversation = await messagingService.getConversation!(args.conversationId as string);

        if (!conversation) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: 'Conversation not found' })
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(conversation, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof CapabilityNotSupportedError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'get_conversation only available with Web API (not Anthropic API)',
                  hint: 'Use default conversation ID or manage conversations through Anthropic API'
                })
              }
            ]
          };
        }
        throw error;
      }
    }

    case 'list_conversations': {
      try {
        const conversations = await messagingService.listConversations!();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: conversations.length,
                conversations: conversations.map(c => ({
                  id: c.id,
                  title: c.title,
                  messageCount: c.messageCount,
                  lastActivity: c.lastActivity
                }))
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        if (error instanceof CapabilityNotSupportedError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'list_conversations only available with Web API (not Anthropic API)',
                  hint: 'Anthropic API manages conversations internally'
                })
              }
            ]
          };
        }
        throw error;
      }
    }

    case 'send_message_to_chat': {
      // Only available for ClaudeMessagingService (web API)
      if ('sendMessageToChat' in messagingService) {
        const webService = messagingService as ClaudeMessagingService;
        const result = await webService.sendMessageToChat(
          args.conversationId as string,
          args.message as string,
          {
            maxTokens: args.maxTokens as number,
            pollInterval: args.pollInterval as number,
            maxPolls: args.maxPolls as number
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }
          ],
          ...(result.success === false && { isError: true })
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'send_message_to_chat only available with Web API (not Anthropic API)',
                hint: 'Use send_agent_task for Anthropic API'
              })
            }
          ]
        };
      }
    }

    case 'get_messages_from_chat': {
      // Only available for ClaudeMessagingService (web API)
      if ('getMessagesFromChat' in messagingService) {
        const webService = messagingService as ClaudeMessagingService;
        const result = await webService.getMessagesFromChat(
          args.conversationId as string,
          {
            limit: args.limit as number,
            offset: args.offset as number,
            sender: args.sender as 'human' | 'assistant'
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }
          ],
          ...(result.success === false && { isError: true })
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'get_messages_from_chat only available with Web API (not Anthropic API)',
                hint: 'Anthropic API manages conversation history internally'
              })
            }
          ]
        };
      }
    }

    default:
      throw new Error(`Unknown messaging tool: ${name}`);
  }
}

/**
 * Register messaging tools with MCP server
 */
export function registerMessagingTools(
  _server: any,
  _messagingService: ClaudeMessagingService
) {
  // This is a placeholder - tools are registered directly in index.ts
  // using getMessagingToolDefinitions() and handleMessagingToolCall()
}
