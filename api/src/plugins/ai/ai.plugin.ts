/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI PLUGIN
 * LLM and AI-related executors
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  PluginBase,
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
  PluginMetadata,
} from '../../core/aopeg/plugins/plugin-base';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN METADATA
// ────────────────────────────────────────────────────────────────────────────

const AI_PLUGIN_METADATA: PluginMetadata = {
  name: 'aopeg-ai',
  version: '1.0.0',
  domain: 'ai',
  description: 'AI and LLM executors for intelligent processing',
};

// ────────────────────────────────────────────────────────────────────────────
// LLM SERVICE INTERFACE
// ────────────────────────────────────────────────────────────────────────────

export interface LLMService {
  generate(options: {
    model: string;
    systemPrompt?: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json';
  }): Promise<{ content: string; tokensUsed: number }>;
}

// Default placeholder LLM service
let llmService: LLMService = {
  async generate(options) {
    console.warn('[AI Plugin] LLM service not configured, returning placeholder');
    return {
      content: `[Placeholder response for: ${options.userPrompt.slice(0, 100)}...]`,
      tokensUsed: 0,
    };
  },
};

/**
 * Set the LLM service to use
 */
export function setLLMService(service: LLMService): void {
  llmService = service;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTORS
// ────────────────────────────────────────────────────────────────────────────

/**
 * LLM Generate executor - generates text using LLM
 */
class LLMGenerateExecutor extends BaseExecutor {
  readonly type = 'ai.llm_generate';
  readonly displayName = 'LLM Generate';
  readonly description = 'Generate text using a language model';
  readonly domain = 'ai';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      model: { type: 'string', default: 'gemini-flash' },
      systemPrompt: { type: 'string' },
      prompt: { type: 'string', description: 'User prompt with {{input}} placeholder' },
      maxTokens: { type: 'number', default: 1000 },
      temperature: { type: 'number', default: 0.7 },
      responseFormat: { type: 'string', enum: ['text', 'json'], default: 'text' },
    },
    required: ['prompt'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    // Validate upstream input before sending to LLM
    const inputError = this.validateAIInput(context);
    if (inputError) return inputError;

    const model = this.getParam(parameters, 'model', 'gemini-flash');
    const systemPrompt = parameters.systemPrompt as string | undefined;
    const promptTemplate = this.getRequiredParam<string>(parameters, 'prompt');
    const maxTokens = this.getParam(parameters, 'maxTokens', 1000);
    const temperature = this.getParam(parameters, 'temperature', 0.7);
    const responseFormat = this.getParam(parameters, 'responseFormat', 'text') as 'text' | 'json';

    // Replace {{input}} placeholder
    const input = typeof context.input === 'string'
      ? context.input
      : JSON.stringify(context.input);
    const userPrompt = promptTemplate.replace(/\{\{input\}\}/g, input);

    try {
      const response = await llmService.generate({
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        responseFormat,
      });

      let output: unknown = response.content;
      if (responseFormat === 'json') {
        try {
          output = JSON.parse(response.content);
        } catch {
          // Keep as string if JSON parse fails
        }
      }

      return this.success(output, {
        model,
        tokensUsed: response.tokensUsed,
        promptLength: userPrompt.length,
      });
    } catch (error) {
      return this.error(
        'LLM_ERROR',
        `LLM generation failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
    }
  }
}

/**
 * LLM Extract executor - extracts structured data using LLM
 */
class LLMExtractExecutor extends BaseExecutor {
  readonly type = 'ai.llm_extract';
  readonly displayName = 'LLM Extract';
  readonly description = 'Extract structured data from text using LLM';
  readonly domain = 'ai';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      model: { type: 'string', default: 'gemini-flash' },
      schema: { type: 'object', description: 'JSON Schema for expected output' },
      instructions: { type: 'string', description: 'Additional extraction instructions' },
      maxTokens: { type: 'number', default: 2000 },
    },
    required: ['schema'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    // Validate upstream input before sending to LLM
    const inputError = this.validateAIInput(context);
    if (inputError) return inputError;

    const model = this.getParam(parameters, 'model', 'gemini-flash');
    const schema = this.getRequiredParam<Record<string, unknown>>(parameters, 'schema');
    const instructions = parameters.instructions as string | undefined;
    const maxTokens = this.getParam(parameters, 'maxTokens', 2000);

    const input = typeof context.input === 'string'
      ? context.input
      : JSON.stringify(context.input);

    const systemPrompt = `You are a data extraction assistant. Extract information from the provided text according to the given schema. Always respond with valid JSON.`;

    const userPrompt = `
Extract data from the following text according to this schema:

Schema:
${JSON.stringify(schema, null, 2)}

${instructions ? `Additional instructions: ${instructions}` : ''}

Text to extract from:
${input}

Respond with valid JSON only.`;

    try {
      const response = await llmService.generate({
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature: 0.2,
        responseFormat: 'json',
      });

      const extracted = JSON.parse(response.content);

      return this.success(extracted, {
        model,
        tokensUsed: response.tokensUsed,
        schemaFields: Object.keys(schema.properties || {}).length,
      }, 0.85);
    } catch (error) {
      return this.error(
        'EXTRACTION_ERROR',
        `Data extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
    }
  }
}

/**
 * LLM Classify executor - classifies text using LLM
 */
class LLMClassifyExecutor extends BaseExecutor {
  readonly type = 'ai.llm_classify';
  readonly displayName = 'LLM Classify';
  readonly description = 'Classify text into categories using LLM';
  readonly domain = 'ai';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      model: { type: 'string', default: 'gemini-flash' },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of possible categories',
      },
      multiLabel: { type: 'boolean', default: false },
      maxTokens: { type: 'number', default: 500 },
    },
    required: ['categories'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    // Validate upstream input before sending to LLM
    const inputError = this.validateAIInput(context);
    if (inputError) return inputError;

    const model = this.getParam(parameters, 'model', 'gemini-flash');
    const categories = this.getRequiredParam<string[]>(parameters, 'categories');
    const multiLabel = this.getParam(parameters, 'multiLabel', false);
    const maxTokens = this.getParam(parameters, 'maxTokens', 500);

    const input = typeof context.input === 'string'
      ? context.input
      : JSON.stringify(context.input);

    const systemPrompt = `You are a text classification assistant. Classify the given text into the provided categories. Respond with JSON only.`;

    const userPrompt = `
Classify the following text into ${multiLabel ? 'one or more' : 'exactly one'} of these categories:
${categories.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Text to classify:
${input}

Respond with JSON in this format:
${multiLabel
  ? '{"categories": ["category1", "category2"], "confidences": {"category1": 0.9, "category2": 0.7}}'
  : '{"category": "chosen_category", "confidence": 0.9}'}`;

    try {
      const response = await llmService.generate({
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature: 0.2,
        responseFormat: 'json',
      });

      const result = JSON.parse(response.content);

      return this.success(result, {
        model,
        tokensUsed: response.tokensUsed,
        categoriesCount: categories.length,
      }, result.confidence || (result.confidences ? Math.max(...Object.values(result.confidences as Record<string, number>)) : 0.8));
    } catch (error) {
      return this.error(
        'CLASSIFICATION_ERROR',
        `Classification failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
    }
  }
}

/**
 * LLM Summarize executor - summarizes text using LLM
 */
class LLMSummarizeExecutor extends BaseExecutor {
  readonly type = 'ai.llm_summarize';
  readonly displayName = 'LLM Summarize';
  readonly description = 'Summarize text using LLM';
  readonly domain = 'ai';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      model: { type: 'string', default: 'gemini-flash' },
      maxLength: { type: 'number', default: 200, description: 'Max summary length in words' },
      style: { type: 'string', enum: ['brief', 'detailed', 'bullet_points'], default: 'brief' },
      maxTokens: { type: 'number', default: 1000 },
    },
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    // Validate upstream input before sending to LLM
    const inputError = this.validateAIInput(context);
    if (inputError) return inputError;

    const model = this.getParam(parameters, 'model', 'gemini-flash');
    const maxLength = this.getParam(parameters, 'maxLength', 200);
    const style = this.getParam(parameters, 'style', 'brief');
    const maxTokens = this.getParam(parameters, 'maxTokens', 1000);

    const input = typeof context.input === 'string'
      ? context.input
      : JSON.stringify(context.input);

    let styleInstruction = '';
    switch (style) {
      case 'brief':
        styleInstruction = `Provide a brief summary in no more than ${maxLength} words.`;
        break;
      case 'detailed':
        styleInstruction = `Provide a detailed summary covering all key points, approximately ${maxLength} words.`;
        break;
      case 'bullet_points':
        styleInstruction = `Summarize as bullet points, maximum ${Math.ceil(maxLength / 20)} points.`;
        break;
    }

    const userPrompt = `${styleInstruction}

Text to summarize:
${input}`;

    try {
      const response = await llmService.generate({
        model,
        userPrompt,
        maxTokens,
        temperature: 0.3,
      });

      return this.success(response.content, {
        model,
        tokensUsed: response.tokensUsed,
        style,
        originalLength: input.length,
        summaryLength: response.content.length,
      });
    } catch (error) {
      return this.error(
        'SUMMARIZATION_ERROR',
        `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
    }
  }
}

/**
 * LLM Transform executor - transforms data using LLM
 */
class LLMTransformExecutor extends BaseExecutor {
  readonly type = 'ai.llm_transform';
  readonly displayName = 'LLM Transform';
  readonly description = 'Transform data format using LLM';
  readonly domain = 'ai';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      model: { type: 'string', default: 'gemini-flash' },
      transformation: { type: 'string', description: 'Description of the transformation' },
      outputFormat: { type: 'string', enum: ['text', 'json', 'markdown', 'csv'], default: 'text' },
      maxTokens: { type: 'number', default: 2000 },
    },
    required: ['transformation'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    // Validate upstream input before sending to LLM
    const inputError = this.validateAIInput(context);
    if (inputError) return inputError;

    const model = this.getParam(parameters, 'model', 'gemini-flash');
    const transformation = this.getRequiredParam<string>(parameters, 'transformation');
    const outputFormat = this.getParam(parameters, 'outputFormat', 'text');
    const maxTokens = this.getParam(parameters, 'maxTokens', 2000);

    const input = typeof context.input === 'string'
      ? context.input
      : JSON.stringify(context.input, null, 2);

    const userPrompt = `Transform the following data according to these instructions:

Instructions: ${transformation}

Output format: ${outputFormat}

Input data:
${input}

Provide the transformed output:`;

    try {
      const response = await llmService.generate({
        model,
        userPrompt,
        maxTokens,
        temperature: 0.3,
        responseFormat: outputFormat === 'json' ? 'json' : 'text',
      });

      let output: unknown = response.content;
      if (outputFormat === 'json') {
        try {
          output = JSON.parse(response.content);
        } catch {
          // Keep as string
        }
      }

      return this.success(output, {
        model,
        tokensUsed: response.tokensUsed,
        transformation,
        outputFormat,
      });
    } catch (error) {
      return this.error(
        'TRANSFORM_ERROR',
        `Transformation failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN CLASS
// ────────────────────────────────────────────────────────────────────────────

export class AIPlugin extends PluginBase {
  constructor() {
    super(AI_PLUGIN_METADATA);

    // Register executors
    this.addExecutor(new LLMGenerateExecutor());
    this.addExecutor(new LLMExtractExecutor());
    this.addExecutor(new LLMClassifyExecutor());
    this.addExecutor(new LLMSummarizeExecutor());
    this.addExecutor(new LLMTransformExecutor());
  }
}

// Singleton instance
export const aiPlugin = new AIPlugin();
