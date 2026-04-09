/**
 * Immutable Graph API Registration
 * UN ProjectAdvisor - Bi-temporal versioned graph system
 */

import { Express } from 'express';
import { createImmutableGraphRouter } from '../routes/immutable-graph.routes';
import { createSSERouter } from '../routes/immutable-graph-sse.routes';
import { ImmutableGraphService } from '../services/immutable-graph/immutable-graph.service';
import { GodModeService } from '../services/immutable-graph/god-mode.service';

export function registerImmutableGraphAPI(
  app: Express,
  graphService: ImmutableGraphService,
  godModeService: GodModeService
): void {
  const graphRouter = createImmutableGraphRouter(graphService, godModeService);
  const sseRouter = createSSERouter();

  app.use('/api/v1/graph', graphRouter);
  app.use('/api/v1/graph/sse', sseRouter);
}

export { GraphEventEmitter, GraphEvent } from '../routes/immutable-graph-sse.routes';
export * from '../routes/immutable-graph-sse.routes';
