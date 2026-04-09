/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WRITE GRAPH EXECUTOR
 * Writes entities and relationships to Memgraph knowledge graph
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
} from '../../../plugins/plugin-base';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface Entity {
  name: string;
  type: string;
  normalizedForm: string;
  confidence: number;
  context?: string;
  graphLabel?: string;
  properties?: Record<string, unknown>;
}

interface Relationship {
  source: string;
  sourceType: string;
  target: string;
  targetType: string;
  type: string;
  confidence: number;
  properties?: Record<string, unknown>;
}

interface WriteGraphParameters {
  entities?: Entity[];
  relationships?: Relationship[];
  sourceId?: string;
  sourceType?: string;
  namespace?: string;
  createProvenance?: boolean;
  mergeExisting?: boolean;
  minConfidence?: number;
}

interface WriteGraphResult {
  nodesCreated: number;
  nodesUpdated: number;
  relationshipsCreated: number;
  errors: string[];
  nodeIds: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class WriteGraphExecutor extends BaseExecutor {
  readonly type = 'ingestion.write_graph';
  readonly displayName = 'Write to Graph';
  readonly description = 'Write entities and relationships to Memgraph knowledge graph';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        description: 'Entities to write (can use context.variables.entities)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            normalizedForm: { type: 'string' },
            confidence: { type: 'number' },
            graphLabel: { type: 'string' },
          },
        },
      },
      relationships: {
        type: 'array',
        description: 'Relationships to write (can use context.variables.relationships)',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            type: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
      sourceId: {
        type: 'string',
        description: 'ID of the source document/item',
      },
      sourceType: {
        type: 'string',
        description: 'Type of the source (document, workitem, code)',
      },
      namespace: {
        type: 'string',
        default: 'core',
        description: 'Namespace for the data',
      },
      createProvenance: {
        type: 'boolean',
        default: true,
        description: 'Create provenance relationships to source',
      },
      mergeExisting: {
        type: 'boolean',
        default: true,
        description: 'Merge with existing nodes instead of creating duplicates',
      },
      minConfidence: {
        type: 'number',
        default: 0.5,
        description: 'Minimum confidence to write',
      },
    },
    required: [],
  };

  private memgraphService: typeof import('../../../../../services/memgraph.service') | null = null;

  /**
   * Lazy load Memgraph service
   */
  private async getMemgraph() {
    if (!this.memgraphService) {
      this.memgraphService = await import('../../../../../services/memgraph.service');
    }
    return this.memgraphService.default || this.memgraphService;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as WriteGraphParameters;

      // Get entities from parameters or context
      const entities = params.entities ||
        (context.variables.entities as Entity[]) ||
        [];

      // Get relationships from parameters or context
      const relationships = params.relationships ||
        (context.variables.relationships as Relationship[]) ||
        [];

      if (entities.length === 0 && relationships.length === 0) {
        return this.success(
          {
            nodesCreated: 0,
            nodesUpdated: 0,
            relationshipsCreated: 0,
            errors: [],
            nodeIds: [],
          },
          {
            message: 'No entities or relationships to write',
            duration: Date.now() - startTime,
          },
          0.5
        );
      }

      const memgraph = await this.getMemgraph();
      const minConfidence = params.minConfidence ?? 0.5;
      const mergeExisting = params.mergeExisting ?? true;
      const namespace = params.namespace || 'core';

      const result: WriteGraphResult = {
        nodesCreated: 0,
        nodesUpdated: 0,
        relationshipsCreated: 0,
        errors: [],
        nodeIds: [],
      };

      // Filter entities by confidence
      const filteredEntities = entities.filter(e => e.confidence >= minConfidence);

      // Write entities
      for (const entity of filteredEntities) {
        try {
          const nodeResult = await this.writeEntity(memgraph, entity, namespace, mergeExisting);
          if (nodeResult.created) {
            result.nodesCreated++;
          } else {
            result.nodesUpdated++;
          }
          if (nodeResult.id) {
            result.nodeIds.push(nodeResult.id);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Entity "${entity.name}": ${message}`);
        }
      }

      // Filter relationships by confidence
      const filteredRels = relationships.filter(r => r.confidence >= minConfidence);

      // Write relationships
      for (const rel of filteredRels) {
        try {
          await this.writeRelationship(memgraph, rel, namespace);
          result.relationshipsCreated++;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Relationship "${rel.source}" -> "${rel.target}": ${message}`);
        }
      }

      // Create provenance if source is provided
      if (params.createProvenance && params.sourceId && result.nodeIds.length > 0) {
        try {
          await this.createProvenance(memgraph, params.sourceId, params.sourceType || 'unknown', result.nodeIds, namespace);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Provenance: ${message}`);
        }
      }

      // Quality score based on success rate
      const totalOps = filteredEntities.length + filteredRels.length;
      const successfulOps = result.nodesCreated + result.nodesUpdated + result.relationshipsCreated;
      const qualityScore = totalOps > 0 ? successfulOps / totalOps : 0.5;

      return this.success(
        result,
        {
          entitiesProcessed: filteredEntities.length,
          relationshipsProcessed: filteredRels.length,
          errorCount: result.errors.length,
          namespace,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('WRITE_GRAPH_ERROR', `Graph write failed: ${message}`, true);
    }
  }

  /**
   * Write a single entity to the graph
   */
  private async writeEntity(
    memgraph: unknown,
    entity: Entity,
    namespace: string,
    merge: boolean
  ): Promise<{ created: boolean; id?: string }> {
    const mg = memgraph as {
      executeQuery: (query: string, params: Record<string, unknown>) => Promise<{
        records: Array<{ get: (key: string) => unknown }>;
      }>;
    };

    const label = entity.graphLabel || this.getLabel(entity.type);
    const nodeId = `${namespace}:${entity.normalizedForm}`;

    const query = merge
      ? `
        MERGE (n:KnowledgeQuantum:${label} {id: $id})
        ON CREATE SET
          n.name = $name,
          n.normalizedForm = $normalizedForm,
          n.type = $type,
          n.confidence = $confidence,
          n.namespace = $namespace,
          n.createdAt = timestamp()
        ON MATCH SET
          n.confidence = CASE WHEN n.confidence < $confidence THEN $confidence ELSE n.confidence END,
          n.updatedAt = timestamp()
        RETURN n.id as id, n.createdAt = n.updatedAt as created
      `
      : `
        CREATE (n:KnowledgeQuantum:${label} {
          id: $id,
          name: $name,
          normalizedForm: $normalizedForm,
          type: $type,
          confidence: $confidence,
          namespace: $namespace,
          createdAt: timestamp()
        })
        RETURN n.id as id, true as created
      `;

    const result = await mg.executeQuery(query, {
      id: nodeId,
      name: entity.name,
      normalizedForm: entity.normalizedForm,
      type: entity.type,
      confidence: entity.confidence,
      namespace,
    });

    const record = result.records[0];
    return {
      created: record?.get('created') as boolean,
      id: record?.get('id') as string,
    };
  }

  /**
   * Write a relationship to the graph
   */
  private async writeRelationship(
    memgraph: unknown,
    rel: Relationship,
    namespace: string
  ): Promise<void> {
    const mg = memgraph as {
      executeQuery: (query: string, params: Record<string, unknown>) => Promise<unknown>;
    };

    const relType = rel.type.toUpperCase().replace(/[^A-Z_]/g, '_');
    const sourceId = `${namespace}:${rel.source}`;
    const targetId = `${namespace}:${rel.target}`;

    const query = `
      MATCH (a:KnowledgeQuantum {id: $sourceId})
      MATCH (b:KnowledgeQuantum {id: $targetId})
      MERGE (a)-[r:${relType}]->(b)
      ON CREATE SET
        r.confidence = $confidence,
        r.createdAt = timestamp()
      ON MATCH SET
        r.confidence = CASE WHEN r.confidence < $confidence THEN $confidence ELSE r.confidence END
    `;

    await mg.executeQuery(query, {
      sourceId,
      targetId,
      confidence: rel.confidence,
    });
  }

  /**
   * Create provenance relationships
   */
  private async createProvenance(
    memgraph: unknown,
    sourceId: string,
    sourceType: string,
    nodeIds: string[],
    namespace: string
  ): Promise<void> {
    const mg = memgraph as {
      executeQuery: (query: string, params: Record<string, unknown>) => Promise<unknown>;
    };

    const query = `
      MERGE (source:Provenance:${sourceType} {id: $sourceId})
      ON CREATE SET
        source.namespace = $namespace,
        source.createdAt = timestamp()
      WITH source
      UNWIND $nodeIds AS nodeId
      MATCH (n:KnowledgeQuantum {id: nodeId})
      MERGE (n)-[:EXTRACTED_FROM]->(source)
    `;

    await mg.executeQuery(query, {
      sourceId,
      namespace,
      nodeIds,
    });
  }

  /**
   * Get graph label for entity type
   */
  private getLabel(type: string): string {
    const labelMap: Record<string, string> = {
      PERSON: 'Person',
      TEAM: 'Team',
      ORGANIZATION: 'Organization',
      SYSTEM: 'System',
      MODULE: 'Module',
      API: 'API',
      DATABASE: 'Database',
      TABLE: 'Table',
      PROCESS: 'Process',
      BUSINESS_RULE: 'BusinessRule',
      CONCEPT: 'Concept',
      TECHNOLOGY: 'Technology',
      DOCUMENT: 'Document',
      PROJECT: 'Project',
      WORK_ITEM_REF: 'WorkItem',
      FILE_PATH: 'File',
    };

    return labelMap[type] || 'Entity';
  }
}

export default WriteGraphExecutor;
