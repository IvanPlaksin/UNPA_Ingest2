/**
 * GXE Translate Executor
 *
 * Translates SQL AST (or raw SQL) into a GXE-executable graph
 * using the SqlProcedureTranslator.
 */

const { BaseExecutor } = require('../../plugin-base');

class GxeTranslateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sql.gxe_translate';
    this.displayName = 'GXE Translate';
    this.description = 'Translate SQL procedure to GXE executable graph';
    this.domain = 'sql-extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        ast: { type: 'object', description: 'Parsed AST (from sql.ast_parse)' },
        sql: { type: 'string', description: 'Raw SQL text (fallback if no AST)' },
        procedureName: { type: 'string' },
        procedureSchema: { type: 'string', default: 'dbo' },
      },
      required: ['procedureName'],
    };
  }

  async execute(parameters, context) {
    const ast = this.getParam(parameters, 'ast', null);
    const sql = this.getParam(parameters, 'sql', null);
    const procedureName = this.getRequiredParam(parameters, 'procedureName');
    const procedureSchema = this.getParam(parameters, 'procedureSchema', 'dbo');

    if (!ast && !sql) {
      return this.error('GXE_NO_INPUT', 'Either ast or sql is required', false);
    }

    try {
      const { SqlProcedureTranslator } = require(
        '../../../../../services/connectors/sql-to-gxe/procedure-translator'
      );
      const translator = new SqlProcedureTranslator();

      let translation;
      if (ast) {
        translation = translator.translateFromAst(ast, {
          name: procedureName,
          schema: procedureSchema,
          sql: sql || '',
        });
      } else {
        translation = translator.translate(sql);
        translation.procedureName = procedureName;
        translation.procedureSchema = procedureSchema;
      }

      const gxeGraph = translation.toGxeGraph
        ? translation.toGxeGraph()
        : { nodes: translation.nodes, edges: translation.edges };

      return this.success(
        {
          gxeGraph,
          nodes: gxeGraph.nodes || [],
          edges: gxeGraph.edges || [],
          nodeCount: (gxeGraph.nodes || []).length,
          edgeCount: (gxeGraph.edges || []).length,
          confidence: translation.confidence,
          metadata: translation.metadata,
          inputSchema: translation.inputSchema,
          outputSchema: translation.outputSchema,
          referencedTables: translation.metadata?.referencedTables || [],
          calledProcedures: translation.metadata?.calledProcedures || [],
          success: translation.success,
          errors: translation.errors || [],
          warnings: translation.warnings || [],
        },
        {
          procedureName,
          confidence: translation.confidence,
          nodeCount: (gxeGraph.nodes || []).length,
        },
        translation.confidence || 0.5,
      );
    } catch (error) {
      return this.error('GXE_TRANSLATE_ERROR', `Translation failed: ${error.message}`, true);
    }
  }
}

module.exports = { GxeTranslateExecutor };
