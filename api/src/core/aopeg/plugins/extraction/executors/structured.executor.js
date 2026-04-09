/**
 * Structured Extraction Executor — parses structured data from text
 * using configurable regex patterns and JSON validation.
 * Primary use: extracting %%ACTION%% blocks from AI assistant responses.
 */

const { BaseExecutor } = require('../../plugin-base');

// Default parsers with pre-built regex patterns
const BUILT_IN_PARSERS = {
  'GraphActionParser': {
    regex: '%%ACTION%%\\s*([\\s\\S]*?)\\s*%%END_ACTION%{0,2}',
    jsonRequired: true,
    multiMatch: true,
  },
  'RationaleParser': {
    regex: '%%RATIONALE%%\\s*([\\s\\S]*?)\\s*%%END_RATIONALE%{0,2}',
    jsonRequired: false,
    multiMatch: false,
  },
  'LessonParser': {
    regex: '%%LESSON%%\\s*([\\s\\S]*?)\\s*%%END_LESSON%{0,2}',
    jsonRequired: true,
    multiMatch: true,
  },
};

class StructuredExtractorExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'extraction.structured';
    this.displayName = 'Structured Extraction';
    this.description = 'Extracts structured data from text using configurable regex patterns and JSON validation';
    this.domain = 'extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Input text to extract from' },
        format: { type: 'string', description: 'Expected format hint', default: 'json' },
        parser: {
          type: 'string',
          description: 'Parser identifier (built-in: GraphActionParser, RationaleParser, LessonParser) or custom',
        },
        regex: { type: 'string', description: 'Custom regex pattern with capture group' },
        jsonRequired: { type: 'boolean', description: 'Whether extracted content must be valid JSON', default: true },
        multiMatch: { type: 'boolean', description: 'Whether to extract all matches or just the first', default: true },
        validation: { type: 'object', description: 'Optional JSON schema to validate extracted objects' },
      },
      required: ['text', 'parser'],
    };
  }

  async execute(parameters, context) {
    const text = this.getRequiredParam(parameters, 'text');
    const parserName = this.getRequiredParam(parameters, 'parser');
    const customRegex = this.getParam(parameters, 'regex', null);
    const jsonRequired = this.getParam(parameters, 'jsonRequired', true);
    const multiMatch = this.getParam(parameters, 'multiMatch', true);
    const validation = this.getParam(parameters, 'validation', null);

    if (!text || typeof text !== 'string') {
      return this.error('INVALID_INPUT', 'Parameter "text" must be a non-empty string', false);
    }

    // Resolve parser config
    const parserConfig = BUILT_IN_PARSERS[parserName];
    const regexStr = customRegex || parserConfig?.regex;
    const useJson = customRegex ? jsonRequired : (parserConfig?.jsonRequired ?? jsonRequired);
    const useMulti = customRegex ? multiMatch : (parserConfig?.multiMatch ?? multiMatch);

    if (!regexStr) {
      return this.error('UNKNOWN_PARSER',
        `Unknown parser: "${parserName}". Built-in: ${Object.keys(BUILT_IN_PARSERS).join(', ')}. Or provide a "regex" parameter.`,
        false);
    }

    // If using GraphActionParser, delegate to the existing service
    if (parserName === 'GraphActionParser' && !customRegex) {
      return this._useGraphActionParser(text, validation);
    }

    // Generic regex extraction
    try {
      const regex = new RegExp(regexStr, 'g');
      const extracted = [];
      const errors = [];
      const patternsMatched = [];
      let match;

      while ((match = regex.exec(text)) !== null) {
        const raw = (match[1] || match[0]).trim();
        patternsMatched.push(regexStr);

        if (useJson) {
          try {
            const parsed = JSON.parse(raw);
            if (validation) {
              const valResult = this._validateAgainstSchema(parsed, validation);
              if (!valResult.valid) {
                errors.push(`Validation failed: ${valResult.errors.join('; ')}`);
                continue;
              }
            }
            extracted.push(parsed);
          } catch (parseErr) {
            // Attempt JSON repair
            const repaired = this._attemptJsonRepair(raw);
            if (repaired !== null) {
              extracted.push(repaired);
            } else {
              errors.push(`JSON parse error at match ${extracted.length + errors.length + 1}: ${parseErr.message}`);
            }
          }
        } else {
          extracted.push(raw);
        }

        if (!useMulti) break;
      }

      return this.success(
        {
          extracted,
          metadata: {
            count: extracted.length,
            patterns_matched: [...new Set(patternsMatched)],
            errors: errors.length > 0 ? errors : undefined,
          },
        },
        { parser: parserName, matchCount: extracted.length, errorCount: errors.length },
        extracted.length > 0 ? 1.0 : 0.5,
      );
    } catch (err) {
      return this.error('EXTRACTION_ERROR', `Extraction failed: ${err.message}`, true);
    }
  }

  /**
   * Delegate to the existing GraphActionParser service for %%ACTION%% parsing.
   */
  _useGraphActionParser(text, validation) {
    try {
      const { graphActionParser } = require('../../../../../services/agents/GraphActionParser');
      const result = graphActionParser.parse(text);

      // Optionally validate extracted actions
      if (validation && result.actions.length > 0) {
        const validActions = [];
        const valErrors = [];
        for (const action of result.actions) {
          const valResult = this._validateAgainstSchema(action, validation);
          if (valResult.valid) {
            validActions.push(action);
          } else {
            valErrors.push(`Action ${action.type}: ${valResult.errors.join('; ')}`);
          }
        }
        return this.success(
          {
            extracted: validActions,
            metadata: {
              count: validActions.length,
              patterns_matched: ['%%ACTION%%'],
              errors: [...(result.errors.map(e => e.errors?.join('; ') || 'parse error')), ...valErrors],
              rationale: result.rationale,
              lessons: result.lessons,
              cleanText: result.text,
            },
          },
          { parser: 'GraphActionParser', matchCount: validActions.length },
          validActions.length > 0 ? 1.0 : 0.5,
        );
      }

      return this.success(
        {
          extracted: result.actions,
          metadata: {
            count: result.actions.length,
            patterns_matched: ['%%ACTION%%'],
            errors: result.errors.length > 0
              ? result.errors.map(e => e.errors?.join('; ') || 'parse error')
              : undefined,
            rationale: result.rationale,
            lessons: result.lessons,
            cleanText: result.text,
          },
        },
        { parser: 'GraphActionParser', matchCount: result.actions.length, errorCount: result.errors.length },
        result.actions.length > 0 ? 1.0 : 0.5,
      );
    } catch (err) {
      return this.error('GRAPH_ACTION_PARSER_ERROR',
        `GraphActionParser failed: ${err.message}`, true);
    }
  }

  /**
   * Validate an object against a simple JSON schema.
   */
  _validateAgainstSchema(data, schema) {
    const errors = [];

    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (key in data && prop.type) {
          const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
          if (prop.type !== 'any' && actualType !== prop.type) {
            errors.push(`Field "${key}": expected ${prop.type}, got ${actualType}`);
          }
        }
        if (prop.enum && key in data && !prop.enum.includes(data[key])) {
          errors.push(`Field "${key}": value "${data[key]}" not in enum [${prop.enum.join(', ')}]`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Attempt basic JSON repair for common LLM issues.
   */
  _attemptJsonRepair(raw) {
    let s = raw;
    // Remove trailing commas
    s = s.replace(/,\s*([}\]])/g, '$1');
    // Fix single quotes
    s = s.replace(/'/g, '"');
    // Fix unquoted keys
    s = s.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
    // Balance braces
    let braceDepth = 0;
    let bracketDepth = 0;
    for (const ch of s) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth--;
    }
    while (bracketDepth > 0) { s += ']'; bracketDepth--; }
    while (braceDepth > 0) { s += '}'; braceDepth--; }

    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
}

module.exports = { StructuredExtractorExecutor };
