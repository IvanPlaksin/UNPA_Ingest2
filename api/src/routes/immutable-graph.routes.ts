/**
 * Immutable Graph REST API Routes
 * UN ProjectAdvisor - Bi-temporal versioned graph system
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ImmutableGraphService } from '../services/immutable-graph/immutable-graph.service';
import { GodModeService } from '../services/immutable-graph/god-mode.service';
import {
  Namespace,
  NodeStatus,
  EdgeStatus,
  CreateNodeInput,
  UpdateNodeInput,
  CreateEdgeInput,
  MergeNodesInput,
  TemporalQueryParams,
  ImmutableGraphError,
  GodModeRequiredError,
  EntityNotFoundError
} from '../types/immutable-graph.types';
import { emitNodeCreated, emitNodeUpdated, emitNodeDeprecated, emitNodeMerged, emitGodModeActivated, emitGodModeDeactivated, emitDeletionPending } from './immutable-graph-sse.routes';

export function createImmutableGraphRouter(
  graphService: ImmutableGraphService,
  godModeService: GodModeService
): Router {
  const router = Router();

  const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);

  const getUserId = (req: Request): string => {
    return (req as any).user?.id || req.headers['x-user-id'] as string || 'anonymous';
  };

  const getClientInfo = (req: Request) => ({
    ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NODE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/nodes', asyncHandler(async (req: Request, res: Response) => {
    const { namespace, projectId, nodeType, properties, validTimeStart, changeReason, changeSource } = req.body;

    const input: CreateNodeInput = {
      namespace: namespace as Namespace,
      projectId,
      nodeType,
      properties: properties || {},
      validTimeStart: validTimeStart ? new Date(validTimeStart) : undefined,
      changeReason: changeReason || 'API creation',
      changedBy: getUserId(req),
      changeSource: changeSource || 'api'
    };

    const node = await graphService.createNode(input);
    emitNodeCreated(node as unknown as Record<string, unknown>, getUserId(req));
    res.status(201).json({ success: true, data: node });
  }));

  router.get('/nodes/:entityId', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const { includeLineage } = req.query;

    const node = await graphService.getNodeByEntityId(entityId);
    if (!node) {
      res.status(404).json({ success: false, error: 'Node not found' });
      return;
    }

    let lineage;
    if (includeLineage === 'true') {
      lineage = await graphService.getNodeLineage(entityId);
    }

    res.json({ success: true, data: { node, lineage } });
  }));

  router.patch('/nodes/:entityId', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const { properties, changeReason, validTimeStart, godMode } = req.body;
    const userId = getUserId(req);

    const input: UpdateNodeInput = {
      entityId,
      newProperties: properties,
      changeReason: changeReason || 'API update',
      changedBy: userId,
      validTimeStart: validTimeStart ? new Date(validTimeStart) : undefined
    };

    // Get current node to determine namespace for god mode context
    const currentNode = await graphService.getNodeByEntityId(entityId);
    const godModeContext = godMode && currentNode ? {
      userId,
      namespace: currentNode.namespace,
      projectId: undefined
    } : undefined;
    const updated = await graphService.updateNode(input, godModeContext);
    emitNodeUpdated(updated as unknown as Record<string, unknown>, userId);

    res.json({ success: true, data: updated });
  }));

  router.post('/nodes/:entityId/deprecate', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const { reason } = req.body;
    const userId = getUserId(req);

    const result = await graphService.deprecateNode(entityId, reason || 'Deprecated via API', userId);
    emitNodeDeprecated(result.node as unknown as Record<string, unknown>, result.orphanedEdgesCount, userId);

    res.json({
      success: true,
      data: {
        node: result.node,
        orphanedEdgesCount: result.orphanedEdgesCount
      }
    });
  }));

  router.post('/nodes/merge', asyncHandler(async (req: Request, res: Response) => {
    const { entityIdA, entityIdB, mergeReason } = req.body;
    const userId = getUserId(req);

    const input: MergeNodesInput = {
      entityIdA,
      entityIdB,
      mergeReason: mergeReason || 'Merged via API',
      mergedBy: userId
    };

    const result = await graphService.mergeNodes(input);
    emitNodeMerged(result as unknown as Record<string, unknown>, userId);

    res.status(201).json({
      success: true,
      data: {
        mergedNode: result.mergedNode,
        mergeRecord: result.mergeRecord,
        migratedEdges: result.migratedEdges
      }
    });
  }));

  router.get('/nodes/:entityId/lineage', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const lineage = await graphService.getNodeLineage(entityId);
    res.json({ success: true, data: lineage });
  }));

  router.get('/nodes/:entityId/verify-chain', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const result = await graphService.verifyNodeChain(entityId);
    res.json({ success: true, data: result });
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/edges', asyncHandler(async (req: Request, res: Response) => {
    const { sourceEntityId, targetEntityId, edgeType, namespace, properties, changeReason } = req.body;

    const input: CreateEdgeInput = {
      sourceEntityId,
      targetEntityId,
      edgeType,
      namespace: namespace as Namespace,
      properties: properties || {},
      changeReason: changeReason || 'API creation',
      changedBy: getUserId(req)
    };

    const edge = await graphService.createEdge(input);
    res.status(201).json({ success: true, data: edge });
  }));

  router.get('/edges/:edgeId', asyncHandler(async (req: Request, res: Response) => {
    const { edgeId } = req.params;
    const edge = await graphService.getEdgeByEdgeId(edgeId);

    if (!edge) {
      res.status(404).json({ success: false, error: 'Edge not found' });
      return;
    }

    res.json({ success: true, data: edge });
  }));

  router.post('/edges/:edgeId/deprecate', asyncHandler(async (req: Request, res: Response) => {
    const { edgeId } = req.params;
    const { reason } = req.body;
    const userId = getUserId(req);

    const edge = await graphService.deprecateEdge(edgeId, reason || 'Deprecated via API', userId);
    res.json({ success: true, data: edge });
  }));

  router.get('/nodes/:entityId/edges', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const { status } = req.query;

    const edgeStatus = status ? status as EdgeStatus : undefined;
    const edges = await graphService.getConnectedEdges(entityId, edgeStatus);

    res.json({ success: true, data: edges });
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPORAL QUERY ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  router.get('/query/nodes', asyncHandler(async (req: Request, res: Response) => {
    const { namespace, projectId, validTime, transactionTime, versionName } = req.query;

    const params: TemporalQueryParams = {
      namespace: namespace as Namespace,
      projectId: projectId as string,
      validTime: validTime ? new Date(validTime as string) : undefined,
      transactionTime: transactionTime ? new Date(transactionTime as string) : undefined,
      versionName: versionName as string
    };

    const nodes = await graphService.queryNodes(params);
    res.json({ success: true, data: nodes, count: nodes.length });
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // GOD MODE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  router.post('/god-mode/activate', asyncHandler(async (req: Request, res: Response) => {
    const { reason, durationMinutes } = req.body;
    const userId = getUserId(req);
    const { ipAddress, userAgent } = getClientInfo(req);

    if (!reason || reason.trim().length < 10) {
      res.status(400).json({
        success: false,
        error: 'Reason must be at least 10 characters'
      });
      return;
    }

    const session = await godModeService.activate({
      userId,
      namespace: Namespace.PROJECT,
      reason,
      durationMinutes
    });

    emitGodModeActivated(session as unknown as Record<string, unknown>, userId);

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        activatedAt: session.startedAt,
        autoDisableAt: session.expiresAt,
        remainingMinutes: Math.ceil((session.expiresAt.getTime() - Date.now()) / 60000)
      }
    });
  }));

  router.post('/god-mode/deactivate', asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const session = await godModeService.getActiveSession(userId, Namespace.PROJECT);

    if (!session) {
      res.status(404).json({ success: false, error: 'No active God Mode session' });
      return;
    }

    const deactivated = await godModeService.deactivate(session.sessionId);
    emitGodModeDeactivated(session.sessionId, userId);
    res.json({ success: true, data: { deactivatedAt: deactivated.endedAt } });
  }));

  router.get('/god-mode/status', asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const session = await godModeService.getActiveSession(userId, Namespace.PROJECT);

    if (!session) {
      res.json({ success: true, data: { active: false } });
      return;
    }

    res.json({
      success: true,
      data: {
        active: true,
        sessionId: session.sessionId,
        activatedAt: session.startedAt,
        autoDisableAt: session.expiresAt,
        remainingMinutes: Math.ceil((session.expiresAt.getTime() - Date.now()) / 60000),
        reason: session.reason
      }
    });
  }));

  router.post('/god-mode/delete/:entityId/mark', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const { entityType, reason } = req.body;
    const userId = getUserId(req);

    // Get active session
    const session = await godModeService.requireActiveSession(userId, Namespace.PROJECT);

    // Get entity to determine versionId and namespace
    const node = await graphService.getNodeByEntityId(entityId);
    if (!node) {
      res.status(404).json({ success: false, error: 'Entity not found' });
      return;
    }

    const pending = await godModeService.markForDeletion(
      entityId,
      entityType || 'NODE',
      node.versionId,
      node.namespace,
      userId,
      session.sessionId,
      reason || 'Marked for deletion'
    );

    const waitMs = pending.executeAfter.getTime() - Date.now();
    emitDeletionPending({ entityId, entityType, ...pending } as unknown as Record<string, unknown>, userId);

    res.json({
      success: true,
      data: {
        pendingId: pending.pendingId,
        markedAt: pending.scheduledAt,
        confirmDeadline: pending.executeAfter,
        waitSeconds: Math.ceil(waitMs / 1000)
      }
    });
  }));

  router.post('/god-mode/delete/:entityId/confirm', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const userId = getUserId(req);

    await godModeService.requireActiveSession(userId, Namespace.PROJECT);

    const { canConfirm, pending, waitMs } = await godModeService.canConfirmDeletion(entityId, userId);

    if (!pending) {
      res.status(404).json({
        success: false,
        error: 'No pending deletion found. Mark for deletion first.'
      });
      return;
    }

    if (!canConfirm) {
      res.status(400).json({
        success: false,
        error: `Must wait ${Math.ceil((waitMs || 0) / 1000)} more seconds before confirming`,
        data: { waitSeconds: Math.ceil((waitMs || 0) / 1000) }
      });
      return;
    }

    // Build god mode context from pending deletion
    const godModeContext = {
      userId,
      namespace: pending.namespace,
      projectId: undefined
    };

    const result = await graphService.physicalDeleteNode(entityId, pending.reason, godModeContext);

    res.json({
      success: true,
      data: result
    });
  }));

  // Note: Recovery endpoint - tombstone recovery would need to be implemented in the service
  router.post('/god-mode/recover/:originalEntityId', asyncHandler(async (req: Request, res: Response) => {
    // Recovery functionality is not yet implemented in the service layer
    res.status(501).json({
      success: false,
      error: 'Recovery functionality not yet implemented'
    });
  }));

  router.get('/god-mode/audit/:entityId', asyncHandler(async (req: Request, res: Response) => {
    const { entityId } = req.params;
    const trail = await godModeService.getAuditTrail(entityId);
    res.json({ success: true, data: trail });
  }));

  router.get('/god-mode/session/:sessionId/audit', asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const trail = await godModeService.getSessionAuditTrail(sessionId);
    res.json({ success: true, data: trail });
  }));

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLER
  // ═══════════════════════════════════════════════════════════════════════════

  router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Immutable Graph API Error:', err);

    if (err instanceof EntityNotFoundError) {
      res.status(404).json({ success: false, error: err.message, code: err.code });
      return;
    }

    if (err instanceof GodModeRequiredError) {
      res.status(403).json({ success: false, error: err.message, code: err.code });
      return;
    }

    if (err instanceof ImmutableGraphError) {
      res.status(400).json({ success: false, error: err.message, code: err.code, details: err.details });
      return;
    }

    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return router;
}
