/**
 * Data Migrator for Immutable Graph
 * UN ProjectAdvisor - Migration of existing data to immutable graph
 */

import { v4 as uuidv4 } from 'uuid';
import { MemgraphClient } from '../../../db/memgraph.client';
import { ImmutableGraphService } from '../immutable-graph.service';
import { NamespaceService } from '../namespace.service';
import {
  Namespace,
  NodeStatus,
  CreateNodeInput
} from '../../../types/immutable-graph.types';

export interface MigrationSource {
  type: 'legacy_graph' | 'qdrant' | 'json_export';
  connectionString?: string;
  filePath?: string;
  collectionName?: string;
}

export interface MigrationOptions {
  projectId: string;
  batchSize: number;
  dryRun: boolean;
  preserveIds: boolean;
  includeVectors: boolean;
}

export interface MigrationResult {
  success: boolean;
  migratedNodes: number;
  migratedEdges: number;
  skippedNodes: number;
  skippedEdges: number;
  errors: MigrationError[];
  duration: number;
  idMapping: Map<string, string>;
}

export interface MigrationError {
  sourceId: string;
  type: 'node' | 'edge';
  error: string;
  data?: Record<string, unknown>;
}

export interface LegacyNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface LegacyEdge {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties: Record<string, unknown>;
}

export class DataMigrator {
  private idMapping: Map<string, string> = new Map();

  constructor(
    private graphService: ImmutableGraphService,
    private namespaceService: NamespaceService,
    private client: MemgraphClient
  ) {}

  async migrateFromLegacyGraph(
    source: MigrationSource,
    options: MigrationOptions
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: true,
      migratedNodes: 0,
      migratedEdges: 0,
      skippedNodes: 0,
      skippedEdges: 0,
      errors: [],
      duration: 0,
      idMapping: new Map()
    };

    this.idMapping.clear();

    try {
      await this.namespaceService.getOrCreate(Namespace.PROJECT, options.projectId);

      const legacyNodes = await this.fetchLegacyNodes();
      const legacyEdges = await this.fetchLegacyEdges();

      console.log(`Found ${legacyNodes.length} nodes and ${legacyEdges.length} edges to migrate`);

      for (let i = 0; i < legacyNodes.length; i += options.batchSize) {
        const batch = legacyNodes.slice(i, i + options.batchSize);

        for (const legacyNode of batch) {
          try {
            if (this.shouldSkipNode(legacyNode)) {
              result.skippedNodes++;
              continue;
            }

            if (!options.dryRun) {
              const newNode = await this.migrateNode(legacyNode, options);
              this.idMapping.set(legacyNode.id, newNode.entityId);
              result.migratedNodes++;
            } else {
              const mockId = uuidv4();
              this.idMapping.set(legacyNode.id, mockId);
              result.migratedNodes++;
            }
          } catch (error) {
            result.errors.push({
              sourceId: legacyNode.id,
              type: 'node',
              error: (error as Error).message,
              data: legacyNode.properties
            });
          }
        }

        console.log(`Migrated ${Math.min(i + options.batchSize, legacyNodes.length)}/${legacyNodes.length} nodes`);
      }

      for (let i = 0; i < legacyEdges.length; i += options.batchSize) {
        const batch = legacyEdges.slice(i, i + options.batchSize);

        for (const legacyEdge of batch) {
          try {
            if (this.shouldSkipEdge(legacyEdge)) {
              result.skippedEdges++;
              continue;
            }

            const sourceEntityId = this.idMapping.get(legacyEdge.startNodeId);
            const targetEntityId = this.idMapping.get(legacyEdge.endNodeId);

            if (!sourceEntityId || !targetEntityId) {
              result.skippedEdges++;
              continue;
            }

            if (!options.dryRun) {
              await this.migrateEdge(legacyEdge, sourceEntityId, targetEntityId, options);
              result.migratedEdges++;
            } else {
              result.migratedEdges++;
            }
          } catch (error) {
            result.errors.push({
              sourceId: legacyEdge.id,
              type: 'edge',
              error: (error as Error).message,
              data: legacyEdge.properties
            });
          }
        }

        console.log(`Migrated ${Math.min(i + options.batchSize, legacyEdges.length)}/${legacyEdges.length} edges`);
      }

      result.idMapping = this.idMapping;
      result.duration = Date.now() - startTime;
      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push({
        sourceId: 'migration',
        type: 'node',
        error: (error as Error).message
      });
    }

    return result;
  }

  private async fetchLegacyNodes(): Promise<LegacyNode[]> {
    const cypher = `
      MATCH (n)
      WHERE NOT n:NodeVersion AND NOT n:EdgeVersion AND NOT n:NamespaceConfig
        AND NOT n:GodModeSession AND NOT n:GodModeAuditRecord
        AND NOT n:Tombstone AND NOT n:PendingDeletion AND NOT n:MergeRecord
      RETURN id(n) as id, labels(n) as labels, properties(n) as properties
    `;

    const results = await this.client.executeQuery<{
      id: number;
      labels: string[];
      properties: Record<string, unknown>;
    }>(cypher);

    return results.map(r => ({
      id: r.id.toString(),
      labels: r.labels,
      properties: r.properties
    }));
  }

  private async fetchLegacyEdges(): Promise<LegacyEdge[]> {
    const cypher = `
      MATCH (a)-[r]->(b)
      WHERE NOT a:NodeVersion AND NOT b:NodeVersion
      RETURN id(r) as id, type(r) as type, id(a) as startNodeId, id(b) as endNodeId, properties(r) as properties
    `;

    const results = await this.client.executeQuery<{
      id: number;
      type: string;
      startNodeId: number;
      endNodeId: number;
      properties: Record<string, unknown>;
    }>(cypher);

    return results.map(r => ({
      id: r.id.toString(),
      type: r.type,
      startNodeId: r.startNodeId.toString(),
      endNodeId: r.endNodeId.toString(),
      properties: r.properties
    }));
  }

  private shouldSkipNode(node: LegacyNode): boolean {
    const skipLabels = ['_Migration', '_Temp', '_System'];
    return node.labels.some(l => skipLabels.includes(l));
  }

  private shouldSkipEdge(edge: LegacyEdge): boolean {
    const skipTypes = ['_MIGRATED', '_TEMP'];
    return skipTypes.includes(edge.type);
  }

  private async migrateNode(
    legacyNode: LegacyNode,
    options: MigrationOptions
  ): Promise<{ entityId: string }> {
    const nodeType = this.inferNodeType(legacyNode.labels);

    const input: CreateNodeInput = {
      namespace: Namespace.PROJECT,
      projectId: options.projectId,
      nodeType,
      properties: {
        ...legacyNode.properties,
        _legacyId: legacyNode.id,
        _legacyLabels: legacyNode.labels,
        _migratedAt: new Date().toISOString()
      },
      changeReason: 'Migrated from legacy graph',
      changedBy: 'data-migrator',
      changeSource: 'migration'
    };

    const node = await this.graphService.createNode(input);
    return { entityId: node.entityId };
  }

  private async migrateEdge(
    legacyEdge: LegacyEdge,
    sourceEntityId: string,
    targetEntityId: string,
    options: MigrationOptions
  ): Promise<void> {
    await this.graphService.createEdge({
      sourceEntityId,
      targetEntityId,
      edgeType: legacyEdge.type,
      namespace: Namespace.PROJECT,
      properties: {
        ...legacyEdge.properties,
        _legacyId: legacyEdge.id,
        _migratedAt: new Date().toISOString()
      },
      changeReason: 'Migrated from legacy graph',
      changedBy: 'data-migrator'
    });
  }

  private inferNodeType(labels: string[]): string {
    const typeMapping: Record<string, string> = {
      'WorkItem': 'WorkItem',
      'Epic': 'Epic',
      'Feature': 'Feature',
      'Bug': 'Bug',
      'Task': 'Task',
      'UserStory': 'UserStory',
      'File': 'File',
      'Class': 'Class',
      'Function': 'Function',
      'Method': 'Method',
      'Document': 'Document',
      'Entity': 'Concept',
      'Person': 'Person',
      'Atom': 'Concept'
    };

    for (const label of labels) {
      if (typeMapping[label]) {
        return typeMapping[label];
      }
    }

    return labels[0] || 'Unknown';
  }

  async generateMigrationReport(result: MigrationResult): Promise<string> {
    const report = `
# Data Migration Report

## Summary
- **Status**: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}
- **Duration**: ${(result.duration / 1000).toFixed(2)} seconds
- **Nodes Migrated**: ${result.migratedNodes}
- **Nodes Skipped**: ${result.skippedNodes}
- **Edges Migrated**: ${result.migratedEdges}
- **Edges Skipped**: ${result.skippedEdges}
- **Errors**: ${result.errors.length}

## Errors
${result.errors.length === 0 ? 'No errors occurred.' : result.errors.map(e => `
### ${e.type.toUpperCase()}: ${e.sourceId}
- **Error**: ${e.error}
- **Data**: \`${JSON.stringify(e.data || {})}\`
`).join('\n')}

## ID Mapping
${result.idMapping.size} IDs were mapped from legacy to new format.
    `.trim();

    return report;
  }
}
