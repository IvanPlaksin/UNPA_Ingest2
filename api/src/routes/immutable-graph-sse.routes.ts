/**
 * Immutable Graph SSE (Server-Sent Events) Routes
 * UN ProjectAdvisor - Real-time graph event streaming
 */

import { Router, Request, Response } from 'express';
import { EventEmitter } from 'events';

export interface GraphEvent {
  type: 'NODE_CREATED' | 'NODE_UPDATED' | 'NODE_DEPRECATED' | 'NODE_MERGED' | 'NODE_DELETED' |
        'EDGE_CREATED' | 'EDGE_DEPRECATED' | 'EDGE_ORPHANED' |
        'GOD_MODE_ACTIVATED' | 'GOD_MODE_DEACTIVATED' | 'DELETION_PENDING' | 'DELETION_CONFIRMED';
  entityId: string;
  entityType: 'NODE' | 'EDGE' | 'SESSION';
  namespace?: string;
  data: Record<string, unknown>;
  timestamp: Date;
  userId: string;
}

export class GraphEventEmitter extends EventEmitter {
  private static instance: GraphEventEmitter;

  static getInstance(): GraphEventEmitter {
    if (!GraphEventEmitter.instance) {
      GraphEventEmitter.instance = new GraphEventEmitter();
      GraphEventEmitter.instance.setMaxListeners(1000);
    }
    return GraphEventEmitter.instance;
  }

  emitGraphEvent(event: GraphEvent): void {
    this.emit('graph-event', event);
    if (event.namespace) {
      this.emit(`namespace:${event.namespace}`, event);
    }
    this.emit(`entity:${event.entityId}`, event);
    this.emit(`type:${event.type}`, event);
  }
}

export function createSSERouter(): Router {
  const router = Router();
  const eventEmitter = GraphEventEmitter.getInstance();

  router.get('/events', (req: Request, res: Response) => {
    const { namespace, entityId, types } = req.query;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write('retry: 10000\n\n');

    const sendEvent = (event: GraphEvent) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const typeFilter = types ? (types as string).split(',') : null;

    const handleEvent = (event: GraphEvent) => {
      if (typeFilter && !typeFilter.includes(event.type)) return;
      sendEvent(event);
    };

    if (entityId) {
      eventEmitter.on(`entity:${entityId}`, handleEvent);
    } else if (namespace) {
      eventEmitter.on(`namespace:${namespace}`, handleEvent);
    } else {
      eventEmitter.on('graph-event', handleEvent);
    }

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      if (entityId) {
        eventEmitter.off(`entity:${entityId}`, handleEvent);
      } else if (namespace) {
        eventEmitter.off(`namespace:${namespace}`, handleEvent);
      } else {
        eventEmitter.off('graph-event', handleEvent);
      }
    });
  });

  router.get('/events/god-mode', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write('retry: 10000\n\n');

    const godModeTypes = [
      'GOD_MODE_ACTIVATED',
      'GOD_MODE_DEACTIVATED',
      'DELETION_PENDING',
      'DELETION_CONFIRMED',
      'NODE_DELETED'
    ];

    const handleEvent = (event: GraphEvent) => {
      if (godModeTypes.includes(event.type)) {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    eventEmitter.on('graph-event', handleEvent);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      eventEmitter.off('graph-event', handleEvent);
    });
  });

  return router;
}

// Event emission helpers
export function emitNodeCreated(node: Record<string, unknown>, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'NODE_CREATED',
    entityId: node.entityId as string,
    entityType: 'NODE',
    namespace: node.namespace as string,
    data: node,
    timestamp: new Date(),
    userId
  });
}

export function emitNodeUpdated(node: Record<string, unknown>, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'NODE_UPDATED',
    entityId: node.entityId as string,
    entityType: 'NODE',
    namespace: node.namespace as string,
    data: node,
    timestamp: new Date(),
    userId
  });
}

export function emitNodeDeprecated(node: Record<string, unknown>, orphanedEdgesCount: number, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'NODE_DEPRECATED',
    entityId: node.entityId as string,
    entityType: 'NODE',
    namespace: node.namespace as string,
    data: { ...node, orphanedEdgesCount },
    timestamp: new Date(),
    userId
  });
}

export function emitNodeMerged(mergeResult: Record<string, unknown>, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'NODE_MERGED',
    entityId: (mergeResult.mergedNode as any).entityId,
    entityType: 'NODE',
    namespace: (mergeResult.mergedNode as any).namespace,
    data: mergeResult,
    timestamp: new Date(),
    userId
  });
}

export function emitEdgeCreated(edge: Record<string, unknown>, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'EDGE_CREATED',
    entityId: edge.edgeId as string,
    entityType: 'EDGE',
    namespace: edge.namespace as string,
    data: edge,
    timestamp: new Date(),
    userId
  });
}

export function emitEdgeDeprecated(edge: Record<string, unknown>, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'EDGE_DEPRECATED',
    entityId: edge.edgeId as string,
    entityType: 'EDGE',
    namespace: edge.namespace as string,
    data: edge,
    timestamp: new Date(),
    userId
  });
}

export function emitGodModeActivated(session: Record<string, unknown>, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'GOD_MODE_ACTIVATED',
    entityId: session.sessionId as string,
    entityType: 'SESSION',
    data: session,
    timestamp: new Date(),
    userId
  });
}

export function emitGodModeDeactivated(sessionId: string, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'GOD_MODE_DEACTIVATED',
    entityId: sessionId,
    entityType: 'SESSION',
    data: { sessionId },
    timestamp: new Date(),
    userId
  });
}

export function emitDeletionPending(pending: Record<string, unknown>, userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'DELETION_PENDING',
    entityId: pending.entityId as string,
    entityType: pending.entityType as 'NODE' | 'EDGE',
    data: pending,
    timestamp: new Date(),
    userId
  });
}

export function emitDeletionConfirmed(entityId: string, entityType: 'NODE' | 'EDGE', userId: string): void {
  GraphEventEmitter.getInstance().emitGraphEvent({
    type: 'DELETION_CONFIRMED',
    entityId,
    entityType,
    data: { entityId, entityType },
    timestamp: new Date(),
    userId
  });
}
