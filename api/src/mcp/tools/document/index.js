/**
 * Document MCP Tools — classify documents, retrieve extraction prompts
 */

const { BaseTool } = require('../primitives/BaseTool');

class ClassifyDocumentTool extends BaseTool {
  getDefinition() {
    return {
      id: 'document.classify',
      name: 'Classify Document',
      version: '1.0.0',
      level: 2,
      category: 'document',
      description: 'Classify a document to determine its type and retrieve appropriate extraction prompts. Call this BEFORE adding any document processing task to the backlog (CODEX-RULE-DOC-001).',
      inputSchema: {
        type: 'object',
        required: ['document_text'],
        properties: {
          document_text: { type: 'string', description: 'First 2000 characters of document for classification' },
          document_title: { type: 'string', description: 'Document title if available' },
          file_extension: { type: 'string', description: 'File extension (pdf, docx, txt, md)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    this.validateArgs(args, ['document_text']);
    const classifier = require('../../../services/knowledge/document-classifier');
    const result = await classifier.classify(args.document_text, { document_title: args.document_title, file_extension: args.file_extension });
    return this.success(result);
  }
}

class GetExtractionPromptTool extends BaseTool {
  getDefinition() {
    return {
      id: 'document.get_prompt',
      name: 'Get Extraction Prompt',
      version: '1.0.0',
      level: 1,
      category: 'document',
      description: 'Retrieve versioned extraction prompt for a specific document type and extraction task. Returns system_prompt, extraction_prompt, output_format.',
      inputSchema: {
        type: 'object',
        required: ['document_type_id', 'prompt_type'],
        properties: {
          document_type_id: { type: 'string', description: 'e.g., sop, policy, technical, report, contract' },
          prompt_type: { type: 'string', enum: ['structure', 'roles', 'procedures', 'gxe_generation'], description: 'Type of extraction' },
          version: { type: 'string', description: 'Optional specific version. If omitted, returns latest active.' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    this.validateArgs(args, ['document_type_id', 'prompt_type']);
    const classifier = require('../../../services/knowledge/document-classifier');
    const prompt = await classifier.getExtractionPrompt(args.document_type_id, args.prompt_type, args.version);
    if (!prompt) return this.error('NOT_FOUND', `No prompt found for ${args.document_type_id}/${args.prompt_type}`);
    return this.success(prompt);
  }
}

class ListDocumentTypesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'document.list_types',
      name: 'List Document Types',
      version: '1.0.0',
      level: 1,
      category: 'document',
      description: 'List all registered document types and their available extraction prompts.',
      inputSchema: { type: 'object', properties: {} },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute() {
    const classifier = require('../../../services/knowledge/document-classifier');
    const types = await classifier.listDocumentTypes();
    return this.success(types);
  }
}

class RegisterExtractionPromptTool extends BaseTool {
  getDefinition() {
    return {
      id: 'document.register_prompt',
      name: 'Register Extraction Prompt',
      version: '1.0.0',
      level: 3,
      category: 'document',
      description: 'Register a new or updated extraction prompt for a document type. Creates new version, preserving history via SUPERSEDES relationship.',
      inputSchema: {
        type: 'object',
        required: ['document_type_id', 'prompt_type', 'system_prompt', 'extraction_prompt'],
        properties: {
          document_type_id: { type: 'string' },
          prompt_type: { type: 'string' },
          system_prompt: { type: 'string', description: 'System prompt for the LLM' },
          extraction_prompt: { type: 'string', description: 'Extraction instructions' },
          output_format: { type: 'string', description: 'Expected JSON output schema' },
          validation_rules: { type: 'string', description: 'JSON array of validation rules' },
          change_log: { type: 'string', description: 'What changed in this version' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args) {
    this.validateArgs(args, ['document_type_id', 'prompt_type', 'system_prompt', 'extraction_prompt']);
    const classifier = require('../../../services/knowledge/document-classifier');
    const result = await classifier.registerExtractionPrompt(args);
    return this.success(result);
  }
}

function createDocumentTools() {
  return [
    new ClassifyDocumentTool(),
    new GetExtractionPromptTool(),
    new ListDocumentTypesTool(),
    new RegisterExtractionPromptTool()
  ];
}

module.exports = { createDocumentTools };
