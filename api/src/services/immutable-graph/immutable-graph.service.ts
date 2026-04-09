/**
 * Immutable Graph Service
 * Main service for graph operations with versioning, state machine, and hash chain integrity
 */

import { v4 as uuidv4 } from 'uuid';
import { NodeVersionRepository } from '../../repositories/node-version.repository';
import { EdgeVersionRepository } from '../../repositories/edge-version.repository';
import { MergeRecordRepository } from '../../repositories/merge-record.repository';
import { NamespaceService } from './namespace.service';
import { GodModeService } from './god-mode.service';
import { HashService } from './hash.service';
import { StateMachineService } from './state-machine.service';
import { VersionNamingService } from './version-naming.service';
import {
  NodeVersion,
  EdgeVersion,
  NodeStatus,
  EdgeStatus,
  ChangeType,
  Namespace,
  VersionCodename,
  CreateNodeInput,
  UpdateNodeInput,
  CreateEdgeInput,
  MergeNodesInput,
  TemporalQueryParams,
  MergeRecord,
  GodModeActionType,
  EntityNotFoundError
} from '../../types/immutable-graph.types';

export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  affectedEntities?: string[];
}

export interface MergeResult {
  mergedNode: NodeVersion;
  mergeRecord: MergeRecord;
  sourceA: NodeVersion;
  sourceB: NodeVersion;
  migratedEdges: number;
}

export interface DeprecationResult {
  node: NodeVersion;
  orphanedEdgesCount: number;
}

export interface GodModeOperationContext {
  userId: string;
  namespace: Namespace;
  projectId?: string;
}

export class ImmutableGraphService {
  constructor(
    private nodeRepo: NodeVersionRepository,
    private edgeRepo: EdgeVersionRepository,
    private mergeRecordRepo: MergeRecordRepository,
    private namespaceService: NamespaceService,
    private godModeService: GodModeService
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // NODE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async createNode(input: CreateNodeInput): Promise<NodeVersion> {
    const entityId = uuidv4();
    const versionId = uuidv4();

    const codename = VersionNamingService.codenameFromChangeType(ChangeType.CREATE);
    const { versionName, sequence } = await this.namespaceService.getNextVersion(
      input.namespace,
      'node',
      codename,
      input.projectId
    );

    const now = new Date();
    const vtStart = input.validTimeStart || now;

    const partialNode: Partial<NodeVersion> = {
      entityId,
      nodeType: input.nodeType,
      namespace: input.namespace,
      properties: input.properties
    };

    const contentHash = HashService.calculateContentHash(partialNode);
    const chainHash = HashService.calculateChainHash(contentHash, null);

    const node: NodeVersion = {
      versionId,
      entityId,
      namespace: input.namespace,
      sequenceNumber: sequence,
      versionName,
      status: NodeStatus.ACTIVE,
      ttStart: now,
      ttEnd: null,
      vtStart,
      vtEnd: null,
      previousVersionId: null,
      supersededById: null,
      mergedFromIds: [],
      splitIntoIds: [],
      changeType: ChangeType.CREATE,
      changeReason: input.changeReason,
      changedBy: input.changedBy,
      changeSource: input.changeSource,
      extractionCycleId: null,
      contentHash,
      previousHash: null,
      chainHash,
      signature: null,
      properties: input.properties,
      nodeType: input.nodeType
    };

    return this.nodeRepo.create(node);
  }

  async updateNode(input: UpdateNodeInput, godModeContext?: GodModeOperationContext): Promise<NodeVersion> {
    const currentVersion = await this.nodeRepo.findActiveByEntityId(input.entityId);
    if (!currentVersion) {
      throw new EntityNotFoundError(input.entityId, 'NodeVersion');
    }

    if (godModeContext) {
      return this.updateNodeGodMode(currentVersion, input, godModeContext);
    }

    return this.updateNodeNormal(currentVersion, input);
  }

  private async updateNodeNormal(currentVersion: NodeVersion, input: UpdateNodeInput): Promise<NodeVersion> {
    StateMachineService.validateNodeTransition(
      currentVersion.status,
      NodeStatus.SUPERSEDED,
      false
    );

    const newVersionId = uuidv4();
    const codename = VersionNamingService.codenameFromChangeType(ChangeType.UPDATE);
    const { versionName, sequence } = await this.namespaceService.getNextVersion(
      currentVersion.namespace,
      'node',
      codename
    );

    const mergedProperties = { ...currentVersion.properties, ...input.newProperties };
    const now = new Date();
    const vtStart = input.validTimeStart || now;

    const partialNode: Partial<NodeVersion> = {
      entityId: currentVersion.entityId,
      nodeType: currentVersion.nodeType,
      namespace: currentVersion.namespace,
      properties: mergedProperties
    };

    const contentHash = HashService.calculateContentHash(partialNode);
    const chainHash = HashService.calculateChainHash(contentHash, currentVersion.chainHash);

    const newVersion: NodeVersion = {
      versionId: newVersionId,
      entityId: currentVersion.entityId,
      namespace: currentVersion.namespace,
      sequenceNumber: sequence,
      versionName,
      status: NodeStatus.ACTIVE,
      ttStart: now,
      ttEnd: null,
      vtStart,
      vtEnd: null,
      previousVersionId: currentVersion.versionId,
      supersededById: null,
      mergedFromIds: [],
      splitIntoIds: [],
      changeType: ChangeType.UPDATE,
      changeReason: input.changeReason,
      changedBy: input.changedBy,
      changeSource: currentVersion.changeSource,
      extractionCycleId: currentVersion.extractionCycleId,
      contentHash,
      previousHash: currentVersion.contentHash,
      chainHash,
      signature: null,
      properties: mergedProperties,
      nodeType: currentVersion.nodeType
    };

    await this.nodeRepo.updateStatus(currentVersion.versionId, NodeStatus.SUPERSEDED, newVersionId);
    const created = await this.nodeRepo.create(newVersion);

    await this.nodeRepo.createVersionOfRelationship(newVersionId, currentVersion.versionId);
    await this.nodeRepo.createSupersedesRelationship(newVersionId, currentVersion.versionId, input.changeReason);

    return created;
  }

  private async updateNodeGodMode(
    currentVersion: NodeVersion,
    input: UpdateNodeInput,
    context: GodModeOperationContext
  ): Promise<NodeVersion> {
    const session = await this.godModeService.requireActiveSession(
      context.userId,
      context.namespace,
      context.projectId
    );

    await this.godModeService.createAuditRecord(session.sessionId, context.userId, {
      actionType: GodModeActionType.MUTATE,
      targetType: 'NODE',
      targetVersionId: currentVersion.versionId,
      targetEntityId: currentVersion.entityId,
      previousState: currentVersion as unknown as Record<string, unknown>,
      newState: input.newProperties,
      reason: input.changeReason
    });

    // In God Mode, we still create a new version but mark it as mutation
    return this.updateNodeNormal(currentVersion, input);
  }

  async deprecateNode(
    entityId: string,
    deprecationReason: string,
    changedBy: string
  ): Promise<DeprecationResult> {
    const currentVersion = await this.nodeRepo.findActiveByEntityId(entityId);
    if (!currentVersion) {
      throw new EntityNotFoundError(entityId, 'NodeVersion');
    }

    StateMachineService.validateNodeTransition(
      currentVersion.status,
      NodeStatus.DEPRECATED,
      false
    );

    const updatedNode = await this.nodeRepo.updateStatus(currentVersion.versionId, NodeStatus.DEPRECATED);
    const orphanedEdgesCount = await this.cascadeOrphanEdges(entityId);

    return { node: updatedNode, orphanedEdgesCount };
  }

  async restoreNode(
    entityId: string,
    restoreReason: string,
    userId: string,
    godModeContext: GodModeOperationContext
  ): Promise<NodeVersion> {
    const session = await this.godModeService.requireActiveSession(
      godModeContext.userId,
      godModeContext.namespace,
      godModeContext.projectId
    );

    const currentVersion = await this.nodeRepo.findActiveByEntityId(entityId);
    if (currentVersion) {
      return currentVersion; // Already active
    }

    // Find the deprecated version
    const allVersions = await this.nodeRepo.findAllVersionsByEntityId(entityId);
    const deprecatedVersion = allVersions.find(v => v.status === NodeStatus.DEPRECATED);

    if (!deprecatedVersion) {
      throw new EntityNotFoundError(entityId, 'Deprecated NodeVersion');
    }

    StateMachineService.validateNodeTransition(
      deprecatedVersion.status,
      NodeStatus.ACTIVE,
      true
    );

    await this.godModeService.createAuditRecord(session.sessionId, userId, {
      actionType: GodModeActionType.RESTORE,
      targetType: 'NODE',
      targetVersionId: deprecatedVersion.versionId,
      targetEntityId: entityId,
      previousState: deprecatedVersion as unknown as Record<string, unknown>,
      newState: { status: NodeStatus.ACTIVE },
      reason: restoreReason
    });

    // Restore by creating a new ACTIVE version
    const newVersionId = uuidv4();
    const codename = VersionNamingService.codenameFromChangeType(ChangeType.RESTORE);
    const { versionName, sequence } = await this.namespaceService.getNextVersion(
      deprecatedVersion.namespace,
      'node',
      codename
    );

    const contentHash = HashService.calculateContentHash({
      entityId: deprecatedVersion.entityId,
      nodeType: deprecatedVersion.nodeType,
      namespace: deprecatedVersion.namespace,
      properties: deprecatedVersion.properties
    });
    const chainHash = HashService.calculateChainHash(contentHash, deprecatedVersion.chainHash);

    const restoredVersion: NodeVersion = {
      ...deprecatedVersion,
      versionId: newVersionId,
      sequenceNumber: sequence,
      versionName,
      status: NodeStatus.ACTIVE,
      ttStart: new Date(),
      ttEnd: null,
      previousVersionId: deprecatedVersion.versionId,
      supersededById: null,
      changeType: ChangeType.RESTORE,
      changeReason: restoreReason,
      changedBy: userId,
      contentHash,
      previousHash: deprecatedVersion.contentHash,
      chainHash
    };

    const created = await this.nodeRepo.create(restoredVersion);

    // Restore orphaned edges
    await this.edgeRepo.restoreOrphanedEdges(entityId);

    return created;
  }

  private async cascadeOrphanEdges(nodeEntityId: string): Promise<number> {
    return this.edgeRepo.orphanEdgesByNodeId(nodeEntityId);
  }

  async mergeNodes(input: MergeNodesInput): Promise<MergeResult> {
    const nodeA = await this.nodeRepo.findActiveByEntityId(input.entityIdA);
    const nodeB = await this.nodeRepo.findActiveByEntityId(input.entityIdB);

    if (!nodeA) throw new EntityNotFoundError(input.entityIdA, 'NodeVersion');
    if (!nodeB) throw new EntityNotFoundError(input.entityIdB, 'NodeVersion');

    if (nodeA.namespace !== nodeB.namespace) {
      throw new Error('Cannot merge nodes from different namespaces');
    }

    if (nodeA.nodeType !== nodeB.nodeType) {
      throw new Error('Cannot merge nodes of different types');
    }

    StateMachineService.validateNodeTransition(nodeA.status, NodeStatus.MERGED, false);
    StateMachineService.validateNodeTransition(nodeB.status, NodeStatus.MERGED, false);

    const { mergedProperties, conflictResolutions, contributionWeights } = this.mergeProperties(
      nodeA.properties,
      nodeB.properties,
      nodeA.entityId,
      nodeB.entityId
    );

    const newEntityId = uuidv4();
    const newVersionId = uuidv4();
    const mergeId = uuidv4();

    const codename = VersionCodename.Consolidation;
    const { versionName, sequence } = await this.namespaceService.getNextVersion(
      nodeA.namespace,
      'node',
      codename
    );

    const now = new Date();

    const partialNode: Partial<NodeVersion> = {
      entityId: newEntityId,
      nodeType: nodeA.nodeType,
      namespace: nodeA.namespace,
      properties: mergedProperties
    };

    const contentHash = HashService.calculateContentHash(partialNode);
    const chainHash = HashService.calculateChainHash(contentHash, null);

    const mergedNode: NodeVersion = {
      versionId: newVersionId,
      entityId: newEntityId,
      namespace: nodeA.namespace,
      sequenceNumber: sequence,
      versionName,
      status: NodeStatus.ACTIVE,
      ttStart: now,
      ttEnd: null,
      vtStart: now,
      vtEnd: null,
      previousVersionId: null,
      supersededById: null,
      mergedFromIds: [nodeA.entityId, nodeB.entityId],
      splitIntoIds: [],
      changeType: ChangeType.MERGE,
      changeReason: input.mergeReason,
      changedBy: input.mergedBy,
      changeSource: 'merge_operation',
      extractionCycleId: null,
      contentHash,
      previousHash: null,
      chainHash,
      signature: null,
      properties: mergedProperties,
      nodeType: nodeA.nodeType
    };

    const createdNode = await this.nodeRepo.create(mergedNode);

    await this.nodeRepo.updateStatus(nodeA.versionId, NodeStatus.MERGED, newVersionId);
    await this.nodeRepo.updateStatus(nodeB.versionId, NodeStatus.MERGED, newVersionId);

    await this.nodeRepo.createMergedFromRelationship(newVersionId, nodeA.versionId, mergeId, 0.5);
    await this.nodeRepo.createMergedFromRelationship(newVersionId, nodeB.versionId, mergeId, 0.5);

    const mergeRecord: MergeRecord = {
      mergeId,
      namespace: nodeA.namespace,
      sourceEntityIds: [nodeA.entityId, nodeB.entityId],
      sourceVersionIds: [nodeA.versionId, nodeB.versionId],
      resultEntityId: newEntityId,
      resultVersionId: newVersionId,
      mergedAt: now,
      mergedBy: input.mergedBy,
      mergeReason: input.mergeReason,
      mergeStrategy: 'UNION',
      conflictResolutions,
      contributionWeights
    };

    await this.mergeRecordRepo.create(mergeRecord);

    const migratedEdges = await this.migrateEdgesAfterMerge(
      nodeA.entityId,
      nodeB.entityId,
      newEntityId,
      input.mergedBy
    );

    return {
      mergedNode: createdNode,
      mergeRecord,
      sourceA: nodeA,
      sourceB: nodeB,
      migratedEdges
    };
  }

  private mergeProperties(
    propsA: Record<string, unknown>,
    propsB: Record<string, unknown>,
    entityIdA: string,
    entityIdB: string
  ): {
    mergedProperties: Record<string, unknown>;
    conflictResolutions: Record<string, unknown>;
    contributionWeights: Record<string, number>;
  } {
    const mergedProperties: Record<string, unknown> = {};
    const conflictResolutions: Record<string, unknown> = {};

    const allKeys = new Set([...Object.keys(propsA), ...Object.keys(propsB)]);

    for (const key of allKeys) {
      const aValue = propsA[key];
      const bValue = propsB[key];

      if (bValue !== undefined) {
        mergedProperties[key] = bValue;
        if (aValue !== undefined && JSON.stringify(aValue) !== JSON.stringify(bValue)) {
          conflictResolutions[key] = { resolvedTo: 'B', aValue, bValue };
        }
      } else {
        mergedProperties[key] = aValue;
      }
    }

    const contributionWeights = {
      [entityIdA]: 0.5,
      [entityIdB]: 0.5
    };

    return { mergedProperties, conflictResolutions, contributionWeights };
  }

  private async migrateEdgesAfterMerge(
    oldEntityIdA: string,
    oldEntityIdB: string,
    newEntityId: string,
    changedBy: string
  ): Promise<number> {
    const edgesA = await this.edgeRepo.findConnectedEdges(oldEntityIdA, EdgeStatus.ACTIVE);
    const edgesB = await this.edgeRepo.findConnectedEdges(oldEntityIdB, EdgeStatus.ACTIVE);

    let migratedCount = 0;
    const processedEdgeSignatures = new Set<string>();

    const migrateEdge = async (edge: EdgeVersion, oldEntityId: string) => {
      const newSourceId = edge.sourceEntityId === oldEntityId ? newEntityId : edge.sourceEntityId;
      const newTargetId = edge.targetEntityId === oldEntityId ? newEntityId : edge.targetEntityId;

      const signature = `${newSourceId}-${edge.edgeType}-${newTargetId}`;
      if (processedEdgeSignatures.has(signature)) {
        await this.edgeRepo.updateStatus(edge.versionId, EdgeStatus.DEPRECATED);
        return;
      }
      processedEdgeSignatures.add(signature);

      await this.createEdge({
        sourceEntityId: newSourceId,
        targetEntityId: newTargetId,
        edgeType: edge.edgeType,
        namespace: edge.namespace,
        properties: { ...edge.properties, migratedFrom: edge.edgeId },
        changeReason: 'Migrated from merge operation',
        changedBy
      });

      await this.edgeRepo.updateStatus(edge.versionId, EdgeStatus.SUPERSEDED);
      migratedCount++;
    };

    for (const edge of edgesA) {
      await migrateEdge(edge, oldEntityIdA);
    }

    for (const edge of edgesB) {
      await migrateEdge(edge, oldEntityIdB);
    }

    return migratedCount;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async createEdge(input: CreateEdgeInput): Promise<EdgeVersion> {
    const sourceNode = await this.nodeRepo.findActiveByEntityId(input.sourceEntityId);
    const targetNode = await this.nodeRepo.findActiveByEntityId(input.targetEntityId);

    if (!sourceNode) throw new EntityNotFoundError(input.sourceEntityId, 'NodeVersion (source)');
    if (!targetNode) throw new EntityNotFoundError(input.targetEntityId, 'NodeVersion (target)');

    const edgeId = uuidv4();
    const versionId = uuidv4();

    const codename = VersionNamingService.codenameFromChangeType(ChangeType.CREATE);
    const { versionName, sequence } = await this.namespaceService.getNextVersion(
      input.namespace,
      'edge',
      codename
    );

    const now = new Date();

    const partialEdge: Partial<EdgeVersion> = {
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      edgeType: input.edgeType,
      properties: input.properties
    };

    const contentHash = HashService.calculateContentHash(partialEdge);
    const chainHash = HashService.calculateChainHash(contentHash, null);

    const edge: EdgeVersion = {
      versionId,
      edgeId,
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      edgeType: input.edgeType,
      namespace: input.namespace,
      sequenceNumber: sequence,
      versionName,
      status: EdgeStatus.ACTIVE,
      orphanedReason: null,
      orphanedAt: null,
      orphanedByNodeId: null,
      originalStatus: null,
      ttStart: now,
      ttEnd: null,
      vtStart: now,
      vtEnd: null,
      previousVersionId: null,
      supersededById: null,
      changeType: ChangeType.CREATE,
      changeReason: input.changeReason,
      changedBy: input.changedBy,
      contentHash,
      previousHash: null,
      chainHash,
      properties: input.properties
    };

    const created = await this.edgeRepo.create(edge);

    await this.edgeRepo.createConnectsRelationship(versionId, sourceNode.versionId, 'SOURCE');
    await this.edgeRepo.createConnectsRelationship(versionId, targetNode.versionId, 'TARGET');

    return created;
  }

  async deprecateEdge(
    edgeId: string,
    deprecationReason: string,
    changedBy: string
  ): Promise<EdgeVersion> {
    const currentVersion = await this.edgeRepo.findActiveByEdgeId(edgeId);
    if (!currentVersion) {
      throw new EntityNotFoundError(edgeId, 'EdgeVersion');
    }

    StateMachineService.validateEdgeTransition(
      currentVersion.status,
      EdgeStatus.DEPRECATED,
      false
    );

    return this.edgeRepo.updateStatus(currentVersion.versionId, EdgeStatus.DEPRECATED);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPORAL QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  async queryNodes(params: TemporalQueryParams): Promise<NodeVersion[]> {
    if (params.versionName) {
      return this.queryAtVersion(params.versionName, params.namespace);
    }

    if (params.validTime && params.transactionTime) {
      return this.nodeRepo.queryAtBothTimes(params.namespace, params.validTime, params.transactionTime);
    }

    if (params.validTime) {
      return this.nodeRepo.queryAtValidTime(params.namespace, params.validTime, params.filters);
    }

    if (params.transactionTime) {
      return this.nodeRepo.queryAtTransactionTime(params.namespace, params.transactionTime);
    }

    return this.nodeRepo.findByNamespace(params.namespace, NodeStatus.ACTIVE);
  }

  private async queryAtVersion(versionName: string, namespace: Namespace): Promise<NodeVersion[]> {
    const parsed = VersionNamingService.parse(versionName);
    if (!parsed) {
      throw new Error(`Invalid version name format: ${versionName}`);
    }

    const targetSequence = BigInt(parsed.sequence);
    const allNodes = await this.nodeRepo.findByNamespace(namespace);

    return allNodes.filter(node => {
      return node.sequenceNumber <= targetSequence;
    });
  }

  async getNodeLineage(entityId: string): Promise<NodeVersion[]> {
    return this.nodeRepo.getLineage(entityId);
  }

  async getNodeByEntityId(entityId: string): Promise<NodeVersion | null> {
    return this.nodeRepo.findActiveByEntityId(entityId);
  }

  async getNodeByVersionId(versionId: string): Promise<NodeVersion | null> {
    return this.nodeRepo.findByVersionId(versionId);
  }

  async getEdgeByEdgeId(edgeId: string): Promise<EdgeVersion | null> {
    return this.edgeRepo.findActiveByEdgeId(edgeId);
  }

  async getEdgeByVersionId(versionId: string): Promise<EdgeVersion | null> {
    return this.edgeRepo.findByVersionId(versionId);
  }

  async getConnectedEdges(entityId: string, status?: EdgeStatus): Promise<EdgeVersion[]> {
    return this.edgeRepo.findConnectedEdges(entityId, status);
  }

  async getAllVersionsByEntityId(entityId: string): Promise<NodeVersion[]> {
    return this.nodeRepo.findAllVersionsByEntityId(entityId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GOD MODE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async physicalDeleteNode(
    entityId: string,
    reason: string,
    godModeContext: GodModeOperationContext
  ): Promise<{ phase: 'marked' | 'confirmed' | 'deleted'; pendingId?: string; tombstoneId?: string }> {
    const session = await this.godModeService.requireActiveSession(
      godModeContext.userId,
      godModeContext.namespace,
      godModeContext.projectId
    );

    const currentNode = await this.nodeRepo.findActiveByEntityId(entityId);
    if (!currentNode) {
      throw new EntityNotFoundError(entityId, 'NodeVersion');
    }

    StateMachineService.validateNodeTransition(
      currentNode.status,
      NodeStatus.DELETED,
      true
    );

    const { canConfirm, pending } = await this.godModeService.canConfirmDeletion(entityId, godModeContext.userId);

    if (!pending) {
      const newPending = await this.godModeService.markForDeletion(
        entityId,
        'NODE',
        currentNode.versionId,
        currentNode.namespace,
        godModeContext.userId,
        session.sessionId,
        reason
      );
      return { phase: 'marked', pendingId: newPending.pendingId };
    }

    if (!canConfirm) {
      return { phase: 'marked', pendingId: pending.pendingId };
    }

    // Confirm and execute deletion
    await this.godModeService.confirmDeletion(entityId, godModeContext.userId, godModeContext.userId);

    const tombstone = await this.godModeService.createTombstone(
      entityId,
      'NODE',
      currentNode.versionId,
      currentNode.namespace,
      godModeContext.userId,
      session.sessionId,
      reason,
      currentNode.contentHash,
      currentNode.chainHash,
      { nodeSnapshot: currentNode as unknown as Record<string, unknown> }
    );

    await this.godModeService.createAuditRecord(session.sessionId, godModeContext.userId, {
      actionType: GodModeActionType.PHYSICAL_DELETE,
      targetType: 'NODE',
      targetVersionId: currentNode.versionId,
      targetEntityId: entityId,
      previousState: currentNode as unknown as Record<string, unknown>,
      newState: null,
      reason
    });

    // Mark as DELETED (actual physical delete would be a separate operation)
    await this.nodeRepo.updateStatus(currentNode.versionId, NodeStatus.DELETED);

    // Cascade delete edges
    const connectedEdges = await this.edgeRepo.findConnectedEdges(entityId);
    for (const edge of connectedEdges) {
      await this.edgeRepo.updateStatus(edge.versionId, EdgeStatus.DELETED);
    }

    await this.godModeService.markDeletionExecuted(pending.pendingId);

    return { phase: 'deleted', tombstoneId: tombstone.tombstoneId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAIN VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  async verifyNodeChain(entityId: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const versions = await this.nodeRepo.findAllVersionsByEntityId(entityId);

    for (let i = 0; i < versions.length; i++) {
      const current = versions[i];
      const previous = i > 0 ? versions[i - 1] : null;

      const isValid = HashService.verifyChain(current, previous);
      if (!isValid) {
        return { valid: false, brokenAt: current.versionId };
      }
    }

    return { valid: true };
  }

  async verifyEdgeChain(edgeId: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const edges = await this.edgeRepo.findBySourceEntityId(edgeId);

    for (let i = 0; i < edges.length; i++) {
      const current = edges[i];
      const previous = i > 0 ? edges[i - 1] : null;

      const isValid = HashService.verifyChain(current, previous);
      if (!isValid) {
        return { valid: false, brokenAt: current.versionId };
      }
    }

    return { valid: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getNamespaceStats(namespace: Namespace): Promise<{
    totalNodes: number;
    activeNodes: number;
    totalEdges: number;
    activeEdges: number;
  }> {
    const allNodes = await this.nodeRepo.findByNamespace(namespace);
    const activeNodes = allNodes.filter(n => n.status === NodeStatus.ACTIVE);

    // For edges, we'd need a separate query - simplified here
    return {
      totalNodes: allNodes.length,
      activeNodes: activeNodes.length,
      totalEdges: 0,
      activeEdges: 0
    };
  }
}
