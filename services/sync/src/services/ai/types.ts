import { AgentTask, TaskResult } from '../claude-messaging-types.js';

export interface ModelCapabilities {
  /** Maximum context window size in tokens */
  maxContext: number;
  /** Supports image input */
  supportsImages: boolean;
  /** Relative cost/complexity score (1-10, where 1 is cheapest/fastest) */
  costScore: number;
}

export interface IModelProvider {
  /** Unique provider ID */
  id: string;
  /** Human readable name */
  name: string;
  /** Provider capabilities */
  capabilities: ModelCapabilities;
  
  /** Execute a task using this model */
  executeTask(task: AgentTask, context: unknown): Promise<TaskResult>;
  
  /** Check if provider is currently available (API reachable, within limits) */
  isAvailable(): Promise<boolean>;
}

export interface RoutingConfig {
  /** Default provider ID */
  defaultProvider: string;
  /** Rules for routing based on task type */
  typeRules?: Record<string, string>; // taskType -> providerId
  /** Threshold for using high-performance models (priority <= threshold) */
  highPriorityThreshold?: number; // e.g. 1
  /** Provider for high priority tasks */
  highPriorityProvider?: string;
}
