export interface LLMProvider {
  name: string;
  generate(prompt: string, options?: any): Promise<string>;
  embed(text: string): Promise<number[]>;
  getCapabilities(): Promise<LLMCapabilities>;
  healthCheck?(): Promise<boolean>;
  generateStream?(prompt: string, options?: any): AsyncGenerator<string>;
}

export interface LLMCapabilities {
  maxInputLength: number;
  supportsEmbedding: boolean;
  supportsGeneration: boolean;
  costPerToken?: number;
}
