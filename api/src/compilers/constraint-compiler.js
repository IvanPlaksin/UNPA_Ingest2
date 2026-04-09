/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONSTRAINT COMPILER
 *
 * Compiles a CONSTRAINT graph into various validation formats:
 *   - JSON Schema (for AJV backend validation)
 *   - Zod schema string (for frontend validation)
 *   - Visibility rules (for conditional field display)
 *   - Computed field definitions
 *   - Frontend/backend bundles
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { ConstraintRuleType, ConstraintSeverity } = require('../schemas/constraint-graph.schema');

class ConstraintCompiler {

  /**
   * Apply CONSTRAINT rules onto a base JSON Schema (from STRUCTURAL).
   * Returns a new schema with additional constraints (required, minLength, etc.)
   */
  compileToJsonSchema(constraintGraph, baseJsonSchema) {
    const schema = JSON.parse(JSON.stringify(baseJsonSchema));
    const { nodes } = constraintGraph;
    const requiredFields = new Set(schema.required || []);

    for (const rule of nodes) {
      const field = rule.targetField;

      if (!field || !schema.properties?.[field]) continue;

      switch (rule.ruleType) {
        case ConstraintRuleType.REQUIRED:
          requiredFields.add(field);
          break;
        case ConstraintRuleType.MIN_LENGTH:
          schema.properties[field].minLength = rule.value;
          break;
        case ConstraintRuleType.MAX_LENGTH:
          schema.properties[field].maxLength = rule.value;
          break;
        case ConstraintRuleType.PATTERN:
          schema.properties[field].pattern = rule.pattern;
          break;
        case ConstraintRuleType.MIN:
          schema.properties[field].minimum = rule.value;
          break;
        case ConstraintRuleType.MAX:
          schema.properties[field].maximum = rule.value;
          break;
        case ConstraintRuleType.EMAIL:
          schema.properties[field].format = 'email';
          break;
        case ConstraintRuleType.URL:
          schema.properties[field].format = 'uri';
          break;
      }
    }

    schema.required = Array.from(requiredFields);
    return schema;
  }

  /**
   * Compile to a Zod schema string for frontend use.
   */
  compileToZod(constraintGraph, structuralGraph) {
    const zodFields = [];
    const refinements = [];

    const fieldTypes = this._extractFieldTypes(structuralGraph);

    for (const [fieldName, fieldType] of Object.entries(fieldTypes)) {
      let zodType = this._mapToZodType(fieldType);
      const rules = this._getRulesForField(constraintGraph.nodes, fieldName);

      for (const rule of rules) {
        zodType = this._applyRuleToZod(zodType, rule);
      }

      zodFields.push(`  ${fieldName}: ${zodType}`);
    }

    for (const rule of constraintGraph.nodes) {
      if (this._isCrossFieldRule(rule)) {
        refinements.push(this._generateRefinement(rule));
      }
    }

    let zodSchema = `z.object({\n${zodFields.join(',\n')}\n})`;

    if (refinements.length > 0) {
      zodSchema += refinements.map(r => `\n  .refine(${r})`).join('');
    }

    return zodSchema;
  }

  /**
   * Extract visibility/disabled rules for frontend rendering.
   */
  compileVisibilityRules(constraintGraph) {
    const rules = {};

    for (const node of constraintGraph.nodes) {
      if (node.ruleType === ConstraintRuleType.VISIBLE_IF) {
        rules[node.targetField] = { type: 'visibility', condition: node.condition };
      } else if (node.ruleType === ConstraintRuleType.DISABLED_IF) {
        rules[node.targetField] = { type: 'disabled', condition: node.condition };
      }
    }

    return rules;
  }

  /**
   * Extract computed field definitions with dependency tracking.
   */
  compileComputedFields(constraintGraph) {
    const computed = {};

    for (const node of constraintGraph.nodes) {
      if (node.ruleType === ConstraintRuleType.COMPUTED) {
        computed[node.targetField] = {
          expression: node.expression,
          dependencies: this._extractDependencies(node.expression),
        };
      }
    }

    return computed;
  }

  /**
   * Full frontend validation bundle.
   */
  compileForFrontend(constraintGraph, structuralGraph) {
    return {
      zodSchema: this.compileToZod(constraintGraph, structuralGraph),
      visibilityRules: this.compileVisibilityRules(constraintGraph),
      computedFields: this.compileComputedFields(constraintGraph),
      asyncValidations: this._extractAsyncRules(constraintGraph),
      errorMessages: this._extractErrorMessages(constraintGraph),
    };
  }

  /**
   * Backend validation bundle (JSON Schema + async rules).
   */
  compileForBackend(constraintGraph, baseJsonSchema) {
    return {
      jsonSchema: this.compileToJsonSchema(constraintGraph, baseJsonSchema),
      asyncValidations: this._extractAsyncRules(constraintGraph).filter(r => r.backendOnly),
      errorMessages: this._extractErrorMessages(constraintGraph),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  _extractFieldTypes(structuralGraph) {
    const types = {};
    for (const node of structuralGraph.nodes) {
      if (node.nodeType === 'FIELD') {
        types[node.name] = node.dataType;
      } else if (node.nodeType === 'ENUM') {
        types[node.name] = 'enum';
      }
    }
    return types;
  }

  _mapToZodType(dataType) {
    const mapping = {
      string: 'z.string()',
      text: 'z.string()',
      email: 'z.string().email()',
      url: 'z.string().url()',
      uuid: 'z.string().uuid()',
      number: 'z.number()',
      integer: 'z.number().int()',
      boolean: 'z.boolean()',
      date: 'z.string().date()',
      datetime: 'z.string().datetime()',
      enum: 'z.enum([])',
      any: 'z.any()',
    };
    return mapping[dataType] || 'z.string()';
  }

  _getRulesForField(nodes, fieldName) {
    return nodes.filter(n => n.targetField === fieldName);
  }

  _applyRuleToZod(zodType, rule) {
    switch (rule.ruleType) {
      case ConstraintRuleType.REQUIRED:
        return zodType;
      case ConstraintRuleType.MIN_LENGTH:
        return `${zodType}.min(${rule.value}, "${this._getErrorMsg(rule)}")`;
      case ConstraintRuleType.MAX_LENGTH:
        return `${zodType}.max(${rule.value}, "${this._getErrorMsg(rule)}")`;
      case ConstraintRuleType.PATTERN:
        return `${zodType}.regex(/${rule.pattern}/, "${this._getErrorMsg(rule)}")`;
      case ConstraintRuleType.MIN:
        return `${zodType}.min(${rule.value})`;
      case ConstraintRuleType.MAX:
        return `${zodType}.max(${rule.value})`;
      default:
        return zodType;
    }
  }

  _isCrossFieldRule(rule) {
    return [
      ConstraintRuleType.EQUALS,
      ConstraintRuleType.NOT_EQUALS,
      ConstraintRuleType.GREATER_THAN,
      ConstraintRuleType.LESS_THAN,
      ConstraintRuleType.AT_LEAST_ONE,
      ConstraintRuleType.EXACTLY_ONE,
      ConstraintRuleType.CUSTOM,
    ].includes(rule.ruleType);
  }

  _generateRefinement(rule) {
    switch (rule.ruleType) {
      case ConstraintRuleType.AT_LEAST_ONE: {
        const fields = rule.targetFields.map(f => `data.${f}`).join(' || ');
        return `(data) => ${fields}, { message: "${this._getErrorMsg(rule)}" }`;
      }
      case ConstraintRuleType.EQUALS:
        return `(data) => data.${rule.targetFields[0]} === data.${rule.targetFields[1]}, { message: "${this._getErrorMsg(rule)}" }`;
      case ConstraintRuleType.GREATER_THAN:
        return `(data) => data.${rule.targetFields[0]} > data.${rule.targetFields[1]}, { message: "${this._getErrorMsg(rule)}" }`;
      case ConstraintRuleType.CUSTOM:
        return `(data) => ${rule.expression}, { message: "${this._getErrorMsg(rule)}" }`;
      default:
        return `() => true`;
    }
  }

  _extractAsyncRules(constraintGraph) {
    return constraintGraph.nodes
      .filter(n =>
        n.ruleType === ConstraintRuleType.ASYNC_VALIDATE ||
        n.ruleType === ConstraintRuleType.UNIQUE ||
        n.ruleType === ConstraintRuleType.EXISTS
      )
      .map(n => ({
        field: n.targetField,
        type: n.ruleType,
        config: n.asyncConfig,
        backendOnly: n.backendOnly,
        errorMessage: n.errorMessage,
      }));
  }

  _extractErrorMessages(constraintGraph) {
    const messages = {};
    for (const node of constraintGraph.nodes) {
      if (node.errorMessage && node.targetField) {
        if (!messages[node.targetField]) messages[node.targetField] = {};
        messages[node.targetField][node.ruleType] = node.errorMessage;
      }
    }
    return messages;
  }

  _extractDependencies(expression) {
    const matches = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    return [...new Set(matches)];
  }

  _getErrorMsg(rule, locale = 'en') {
    if (!rule.errorMessage) return 'Validation error';
    return rule.errorMessage[locale] || rule.errorMessage.en || 'Validation error';
  }
}

module.exports = {
  ConstraintCompiler,
  constraintCompiler: new ConstraintCompiler(),
};
