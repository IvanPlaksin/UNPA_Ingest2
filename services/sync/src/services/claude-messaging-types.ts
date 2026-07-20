/**
 * Types for Inter-Agent Communication with Claude AI
 *
 * Minimal, token-efficient message format for AI-to-AI communication
 */

export interface AgentTask {
  /** Task ID */
  id: string;
  /** Task type */
  type: 'analyze' | 'code' | 'refactor' | 'test' | 'document' | 'research' | 'custom';
  /** Brief task description (max 200 chars) */
  desc: string;
  /** Task context/input data */
  context?: Record<string, unknown>;
  /** Priority: 1=critical, 2=high, 3=normal, 4=low */
  priority?: 1 | 2 | 3 | 4;
  /** Task status */
  status: 'pending' | 'active' | 'done' | 'failed';
  /** Error message if failed */
  error?: string;
  /** Task result */
  result?: unknown;
  /** Created timestamp */
  created: number;
  /** Updated timestamp */
  updated: number;
}

export interface AgentMessage {
  /** Message ID */
  id: string;
  /** Sender agent ID */
  from: string;
  /** Target agent ID */
  to: string;
  /** Message type */
  type: 'task' | 'result' | 'status' | 'query' | 'response';
  /** Message payload */
  payload: unknown;
  /** Timestamp */
  ts: number;
}

export interface TaskRequest {
  /** Task definition */
  task: Omit<AgentTask, 'id' | 'created' | 'updated' | 'status'>;
  /** Target conversation ID (optional) */
  conversationId?: string;
  /** Max response tokens */
  maxTokens?: number;
  /** Target provider (e.g., 'claude', 'gemini') */
  provider?: string;
}

export interface TaskResult {
  /** Task ID */
  taskId: string;
  /** Status */
  status: 'done' | 'failed';
  /** Result data */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Tokens used */
  tokensUsed?: number;
}

export interface ConversationContext {
  /** Conversation ID */
  id: string;
  /** Project ID */
  projectId: string;
  /** Conversation title */
  title: string;
  /** Message count */
  messageCount: number;
  /** Created timestamp */
  created: number;
  /** Last activity */
  lastActivity: number;
}
