/**
 * Extraction Adapter for Immutable Graph
 * UN ProjectAdvisor - Integration with extraction pipeline
 */

import { v4 as uuidv4 } from 'uuid';
import { ImmutableGraphService } from '../immutable-graph.service';
import {
  NodeVersion,
  EdgeVersion,
  Namespace,
  ChangeType,
  CreateNodeInput,
  CreateEdgeInput
} from '../../../types/immutable-graph.types';
import { GraphEventEmitter, emitNodeCreated, emitNodeUpdated } from '../../../routes/immutable-graph-sse.routes';

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  sourceInfo: ExtractionSourceInfo;
}

export interface ExtractedEntity {
  externalId: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  sourceRef: string;
}

export interface ExtractedRelationship {
  sourceExternalId: string;
  targetExternalId: string;
  type: string;
  properties: Record<string, unknown>;
  confidence: number;
}

export interface ExtractionSourceInfo {
  cycleId: string;
  projectId: string;
  sourceSystem: string;
  extractedAt: Date;
  extractorVersion: string;
}

export interface ImportResult {
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  edgesUpdated: number;
  errors: ImportError[];
  entityIdMap: Map<string, string>;
}

export interface ImportError {
  externalId: string;
  type: 'node' | 'edge';
  error: string;
}

export class ExtractionAdapter {
  private entityIdMap: Map<string, string> = new Map();

  constructor(
    private graphService: ImmutableGraphService,
    private projectId: string
  ) {}

  async importExtractionResult(result: ExtractionResult): Promise<ImportResult> {
    const importResult: ImportResult = {
      nodesCreated: 0,
      nodesUpdated: 0,
      edgesCreated: 0,
      edgesUpdated: 0,
      errors: [],
      entityIdMap: new Map()
    };

    this.entityIdMap.clear();

    for (const entity of result.entities) {
      try {
        const nodeResult = await this.importEntity(entity, result.sourceInfo);
        if (nodeResult.created) {
          importResult.nodesCreated++;
        } else {
          importResult.nodesUpdated++;
        }
        this.entityIdMap.set(entity.externalId, nodeResult.entityId);
        importResult.entityIdMap.set(entity.externalId, nodeResult.entityId);
      } catch (error) {
        importResult.errors.push({
          externalId: entity.externalId,
          type: 'node',
          error: (error as Error).message
        });
      }
    }

    for (const rel of result.relationships) {
      try {
        const edgeResult = await this.importRelationship(rel, result.sourceInfo);
        if (edgeResult.created) {
          importResult.edgesCreated++;
        } else {
          importResult.edgesUpdated++;
        }
      } catch (error) {
        importResult.errors.push({
          externalId: `${rel.sourceExternalId}->${rel.targetExternalId}`,
          type: 'edge',
          error: (error as Error).message
        });
      }
    }

    return importResult;
  }

  private async importEntity(
    entity: ExtractedEntity,
    sourceInfo: ExtractionSourceInfo
  ): Promise<{ entityId: string; created: boolean }> {
    const existingNode = await this.findExistingNode(entity.externalId, sourceInfo.projectId);

    if (existingNode) {
      const hasChanges = this.detectChanges(existingNode.properties, entity.properties);

      if (hasChanges) {
        const updated = await this.graphService.updateNode({
          entityId: existingNode.entityId,
          newProperties: {
            ...entity.properties,
            _externalId: entity.externalId,
            _lastExtractedAt: sourceInfo.extractedAt.toISOString(),
            _extractionCycleId: sourceInfo.cycleId
          },
          changeReason: `Updated from extraction cycle ${sourceInfo.cycleId}`,
          changedBy: 'extraction-pipeline',
          validTimeStart: sourceInfo.extractedAt
        });

        emitNodeUpdated(updated as unknown as Record<string, unknown>, 'extraction-pipeline');
        return { entityId: existingNode.entityId, created: false };
      }

      return { entityId: existingNode.entityId, created: false };
    }

    const input: CreateNodeInput = {
      namespace: Namespace.PROJECT,
      projectId: sourceInfo.projectId,
      nodeType: this.mapEntityType(entity.type),
      properties: {
        ...entity.properties,
        name: entity.name,
        _externalId: entity.externalId,
        _sourceRef: entity.sourceRef,
        _sourceSystem: sourceInfo.sourceSystem,
        _firstExtractedAt: sourceInfo.extractedAt.toISOString(),
        _lastExtractedAt: sourceInfo.extractedAt.toISOString(),
        _extractionCycleId: sourceInfo.cycleId,
        _extractorVersion: sourceInfo.extractorVersion
      },
      validTimeStart: sourceInfo.extractedAt,
      changeReason: `Extracted from ${sourceInfo.sourceSystem} in cycle ${sourceInfo.cycleId}`,
      changedBy: 'extraction-pipeline',
      changeSource: sourceInfo.sourceSystem
    };

    const created = await this.graphService.createNode(input);
    emitNodeCreated(created as unknown as Record<string, unknown>, 'extraction-pipeline');

    return { entityId: created.entityId, created: true };
  }

  private async importRelationship(
    rel: ExtractedRelationship,
    sourceInfo: ExtractionSourceInfo
  ): Promise<{ edgeId: string; created: boolean }> {
    const sourceEntityId = this.entityIdMap.get(rel.sourceExternalId);
    const targetEntityId = this.entityIdMap.get(rel.targetExternalId);

    if (!sourceEntityId || !targetEntityId) {
      throw new Error(`Missing entity mapping for relationship ${rel.sourceExternalId} -> ${rel.targetExternalId}`);
    }

    const existingEdges = await this.graphService.getConnectedEdges(sourceEntityId);
    const existingEdge = existingEdges.find(
      e => e.targetEntityId === targetEntityId && e.edgeType === rel.type
    );

    if (existingEdge) {
      return { edgeId: existingEdge.edgeId, created: false };
    }

    const input: CreateEdgeInput = {
      sourceEntityId,
      targetEntityId,
      edgeType: rel.type,
      namespace: Namespace.PROJECT,
      properties: {
        ...rel.properties,
        confidence: rel.confidence,
        _extractionCycleId: sourceInfo.cycleId,
        _extractedAt: sourceInfo.extractedAt.toISOString()
      },
      changeReason: `Extracted relationship from ${sourceInfo.sourceSystem}`,
      changedBy: 'extraction-pipeline'
    };

    const created = await this.graphService.createEdge(input);
    return { edgeId: created.edgeId, created: true };
  }

  private async findExistingNode(externalId: string, projectId: string): Promise<NodeVersion | null> {
    const nodes = await this.graphService.queryNodes({
      namespace: Namespace.PROJECT,
      projectId
    });

    return nodes.find(n => n.properties._externalId === externalId) || null;
  }

  private detectChanges(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>
  ): boolean {
    const ignoredKeys = ['_lastExtractedAt', '_extractionCycleId'];

    for (const [key, value] of Object.entries(incoming)) {
      if (ignoredKeys.includes(key)) continue;
      if (JSON.stringify(existing[key]) !== JSON.stringify(value)) {
        return true;
      }
    }

    return false;
  }

  private mapEntityType(extractedType: string): string {
    const typeMap: Record<string, string> = {
      'function': 'Function',
      'class': 'Class',
      'method': 'Method',
      'interface': 'Interface',
      'file': 'File',
      'module': 'Module',
      'workitem': 'WorkItem',
      'epic': 'Epic',
      'feature': 'Feature',
      'bug': 'Bug',
      'task': 'Task',
      'userstory': 'UserStory',
      'stored_procedure': 'StoredProcedure',
      'table': 'Table',
      'view': 'View',
      'document': 'Document',
      'business_rule': 'BusinessRule',
      'business_process': 'BusinessProcess'
    };

    return typeMap[extractedType.toLowerCase()] || extractedType;
  }
}
