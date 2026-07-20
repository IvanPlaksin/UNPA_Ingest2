/**
 * Contract 4A — LLMProvider interface (FlowDesk Chat V2).
 *
 * The single boundary through which all chat/interpreter LLM calls flow
 * (CODEX-RULE-073). No dialog/interpreter code may spawn the Claude Code CLI
 * or call the Anthropic SDK/API directly — it goes through a provider obtained
 * from getLLMProvider(). Backend and model are switchable by config.
 *
 * This is a contract type file; the runtime is JavaScript. It documents the
 * shape the stub (llm-provider.stub.js) and the production providers implement.
 */

export type JSONSchema = Record<string, unknown>;

export type ProviderId = 'claude-code' | 'claude-sdk' | 'anthropic-api';

export interface LLMCallOpts {
  /** Model id/alias; provider resolves. Enables per-call model switching. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** completion() only. */
  stop?: string[];
  /** Abort/timeouts. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface StructuredResult<T = unknown> {
  data: T;
  raw: string;
  provider: ProviderId;
  tokens: number;
  cost?: number;
}

export interface CompletionResult {
  text: string;
  provider: ProviderId;
  tokens: number;
  cost?: number;
}

export interface LLMProvider {
  readonly id: ProviderId;

  /**
   * Constrained/structured generation. Mechanism is provider-specific:
   *   claude-code   → prompt + retry + validate (no server-side constraint)
   *   claude-sdk    → tool_use forced schema
   *   anthropic-api → tool_use forced schema
   * Throws if a schema-valid result cannot be produced within retries.
   */
  structuredOutput<T = unknown>(
    prompt: string,
    schema: JSONSchema,
    opts?: LLMCallOpts
  ): Promise<StructuredResult<T>>;

  /** Free-form text (e.g. QUESTION_PLANNER phrasing) where strict schema is unneeded. */
  completion(prompt: string, opts?: LLMCallOpts): Promise<CompletionResult>;

  /** Embedding vector (ROUTER similarity). Backed by TEI in all providers. */
  embedding(text: string): Promise<number[]>;
}

export interface LLMProviderConfig {
  provider?: ProviderId;
  model?: string;
}

/**
 * Factory with switching. Default provider:
 *   env LLM_PROVIDER || (dev: 'claude-code' | prod: 'claude-sdk')
 * structuredOutput must be honoured by every backend (CODEX-RULE-073).
 */
export declare function getLLMProvider(config?: LLMProviderConfig): LLMProvider;
