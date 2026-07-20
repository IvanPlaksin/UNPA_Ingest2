import { LLMProvider, LLMCapabilities } from '../providers/llm-provider.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('model-router');

export type LLMTask = {
  type: 'embedding' | 'generation';
  text: string;
  complexity?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  requiresReasoning?: boolean;
};

export interface RoutingMetrics {
  taskId: string;
  taskType: string;
  complexity: string;
  selectedModel: string;
  tokenCount: number;
  estimatedCost: number;
  actualCost?: number;
  executionTime: number;
  timestamp: Date;
}

export class ModelRouterService {
  private metrics: RoutingMetrics[] = [];
  private providerCapabilities = new Map<string, LLMCapabilities>();

  constructor(private providers: LLMProvider[]) {
    this.initializeCapabilities();
  }

  private async initializeCapabilities(): Promise<void> {
    for (const provider of this.providers) {
      try {
        const capabilities = await provider.getCapabilities();
        this.providerCapabilities.set(provider.name, capabilities);
        logger.info({ provider: provider.name, capabilities }, 'Provider capabilities loaded');
      } catch (error) {
        logger.error({ provider: provider.name, error }, 'Failed to load capabilities');
      }
    }
  }

  async routeTask(task: LLMTask): Promise<LLMProvider> {
    const startTime = Date.now();

    // Auto-detect complexity if not provided
    const complexity = task.complexity || this.estimateComplexity(task);

    let selectedProvider: LLMProvider;

    if (task.type === 'embedding') {
      selectedProvider = await this.selectEmbeddingProvider(task);
    } else {
      selectedProvider = await this.selectGenerationProvider(task, complexity);
    }

    // Log routing decision
    const tokenCount = this.estimateTokenCount(task.text);
    const capabilities = this.providerCapabilities.get(selectedProvider.name);
    const estimatedCost = capabilities?.costPerToken
      ? tokenCount * capabilities.costPerToken
      : 0;

    logger.info({
      taskType: task.type,
      complexity,
      selectedModel: selectedProvider.name,
      tokenCount,
      estimatedCost: estimatedCost.toFixed(6)
    }, 'Task routed');

    // Store metrics
    this.metrics.push({
      taskId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      taskType: task.type,
      complexity,
      selectedModel: selectedProvider.name,
      tokenCount,
      estimatedCost,
      executionTime: Date.now() - startTime,
      timestamp: new Date()
    });

    return selectedProvider;
  }

  private async selectEmbeddingProvider(task: LLMTask): Promise<LLMProvider> {
    // Prefer providers with embedding support, prioritize by cost
    const embeddingProviders = this.providers.filter(p => {
      const caps = this.providerCapabilities.get(p.name);
      return caps?.supportsEmbedding;
    });

    if (embeddingProviders.length === 0) {
      logger.warn('No embedding providers available, using first provider');
      return this.providers[0];
    }

    // For short texts (<512 chars), use cheaper/local model
    if (task.text.length < 512) {
      return this.getProvider('llama') || embeddingProviders[0];
    }

    // Otherwise use Gemini (good quality/cost ratio)
    return this.getProvider('gemini-flash') || embeddingProviders[0];
  }

  private async selectGenerationProvider(
    task: LLMTask,
    complexity: 'low' | 'medium' | 'high'
  ): Promise<LLMProvider> {
    // Economic routing strategy based on complexity

    if (complexity === 'low' && !task.requiresReasoning) {
      // Simple tasks: use Llama (free) or Gemini Flash (cheap)
      return this.getProvider('llama')
        || this.getProvider('gemini-flash')
        || this.providers[0];
    }

    if (complexity === 'medium' || (complexity === 'low' && task.requiresReasoning)) {
      // Medium complexity: use Gemini Flash or Claude Haiku
      return this.getProvider('gemini-flash')
        || this.getProvider('claude-haiku')
        || this.getProvider('gemini-pro')
        || this.providers[0];
    }

    // High complexity or reasoning-heavy: use Claude Sonnet/Opus
    if (task.requiresReasoning || task.text.length > 10000) {
      return this.getProvider('claude-sonnet')
        || this.getProvider('claude-opus')
        || this.getProvider('gemini-pro')
        || this.providers[0];
    }

    // Default to Gemini Pro for balance
    return this.getProvider('gemini-pro') || this.providers[0];
  }

  private estimateComplexity(task: LLMTask): 'low' | 'medium' | 'high' {
    const text = task.text.toLowerCase();
    const length = text.length;

    // Keyword-based complexity detection
    const highComplexityKeywords = [
      'analyze', 'explain', 'compare', 'evaluate', 'design',
      'architecture', 'reasoning', 'complex', 'algorithm'
    ];

    const mediumComplexityKeywords = [
      'summarize', 'describe', 'list', 'what', 'how', 'why'
    ];

    const hasHighKeywords = highComplexityKeywords.some(kw => text.includes(kw));
    const hasMediumKeywords = mediumComplexityKeywords.some(kw => text.includes(kw));

    // Length-based complexity
    if (length > 5000 || hasHighKeywords) {
      return 'high';
    }

    if (length > 1000 || hasMediumKeywords) {
      return 'medium';
    }

    return 'low';
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  private getProvider(nameOrPattern: string): LLMProvider | undefined {
    // Exact match first
    let provider = this.providers.find(p => p.name === nameOrPattern);
    if (provider) return provider;

    // Partial match (e.g., 'gemini' matches 'gemini-flash')
    provider = this.providers.find(p => p.name.includes(nameOrPattern));
    if (provider) return provider;

    // Pattern match (e.g., 'claude' matches 'claude-sonnet')
    return this.providers.find(p => p.name.startsWith(nameOrPattern));
  }

  getMetrics(): RoutingMetrics[] {
    return [...this.metrics];
  }

  getTotalCost(): number {
    return this.metrics.reduce((sum, m) => sum + (m.actualCost || m.estimatedCost), 0);
  }

  getCostByModel(): Record<string, number> {
    const costByModel: Record<string, number> = {};

    for (const metric of this.metrics) {
      const cost = metric.actualCost || metric.estimatedCost;
      costByModel[metric.selectedModel] = (costByModel[metric.selectedModel] || 0) + cost;
    }

    return costByModel;
  }

  getTaskDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const metric of this.metrics) {
      distribution[metric.selectedModel] = (distribution[metric.selectedModel] || 0) + 1;
    }

    return distribution;
  }

  clearMetrics(): void {
    this.metrics = [];
    logger.info('Metrics cleared');
  }
}
