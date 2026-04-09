/**
 * Unit tests for Immutable Graph REST API Routes
 */

// Mock uuid before imports
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-v4'
}));

import express, { Express } from 'express';
import request from 'supertest';
import { createImmutableGraphRouter } from '../immutable-graph.routes';
import { ImmutableGraphService } from '../../services/immutable-graph/immutable-graph.service';
import { GodModeService } from '../../services/immutable-graph/god-mode.service';
import {
  Namespace,
  NodeStatus,
  EdgeStatus,
  ChangeType,
  EntityNotFoundError,
  GodModeRequiredError
} from '../../types/immutable-graph.types';

// Mock the SSE emitters
jest.mock('../immutable-graph-sse.routes', () => ({
  emitNodeCreated: jest.fn(),
  emitNodeUpdated: jest.fn(),
  emitNodeDeprecated: jest.fn(),
  emitNodeMerged: jest.fn(),
  emitGodModeActivated: jest.fn(),
  emitGodModeDeactivated: jest.fn(),
  emitDeletionPending: jest.fn()
}));

describe('Immutable Graph API Routes', () => {
  let app: Express;
  let mockGraphService: jest.Mocked<ImmutableGraphService>;
  let mockGodModeService: jest.Mocked<GodModeService>;

  const createMockNode = (overrides: Partial<any> = {}) => ({
    versionId: 'v-001',
    entityId: 'e-001',
    namespace: Namespace.PROJECT,
    sequenceNumber: 1 as any,
    versionName: 'PRJ-9000-Genesis-node-001',
    status: NodeStatus.ACTIVE,
    nodeType: 'Function',
    properties: { name: 'Test' },
    ttStart: new Date('2024-01-01'),
    ttEnd: null,
    vtStart: new Date('2024-01-01'),
    vtEnd: null,
    previousVersionId: null,
    supersededById: null,
    mergedFromIds: [],
    splitIntoIds: [],
    changeType: ChangeType.CREATE,
    changeReason: 'Test',
    changedBy: 'test-user',
    changeSource: 'api',
    extractionCycleId: null,
    contentHash: 'abc123',
    chainHash: 'def456',
    previousHash: null,
    signature: null,
    ...overrides
  });

  const createMockEdge = (overrides: Partial<any> = {}) => ({
    versionId: 'edge-v-001',
    edgeId: 'edge-001',
    namespace: Namespace.PROJECT,
    sourceEntityId: 'e-001',
    targetEntityId: 'e-002',
    edgeType: 'CALLS',
    sequenceNumber: 1 as any,
    versionName: 'PRJ-9000-Genesis-edge-001',
    status: EdgeStatus.ACTIVE,
    orphanedReason: null,
    orphanedAt: null,
    orphanedByNodeId: null,
    originalStatus: null,
    properties: {},
    ttStart: new Date('2024-01-01'),
    ttEnd: null,
    vtStart: new Date('2024-01-01'),
    vtEnd: null,
    previousVersionId: null,
    supersededById: null,
    changeType: ChangeType.CREATE,
    changeReason: 'Test',
    changedBy: 'test-user',
    contentHash: 'abc123',
    chainHash: 'def456',
    previousHash: null,
    ...overrides
  });

  beforeEach(() => {
    // Create mock services
    mockGraphService = {
      createNode: jest.fn(),
      getNodeByEntityId: jest.fn(),
      updateNode: jest.fn(),
      deprecateNode: jest.fn(),
      mergeNodes: jest.fn(),
      getNodeLineage: jest.fn(),
      verifyNodeChain: jest.fn(),
      createEdge: jest.fn(),
      getEdgeByEdgeId: jest.fn(),
      deprecateEdge: jest.fn(),
      getConnectedEdges: jest.fn(),
      queryNodes: jest.fn(),
      physicalDeleteNode: jest.fn(),
      recoverNode: jest.fn()
    } as unknown as jest.Mocked<ImmutableGraphService>;

    mockGodModeService = {
      activate: jest.fn(),
      deactivate: jest.fn(),
      getActiveSession: jest.fn(),
      requireActiveSession: jest.fn(),
      markForDeletion: jest.fn(),
      canConfirmDeletion: jest.fn(),
      getAuditTrail: jest.fn(),
      getSessionAuditTrail: jest.fn()
    } as unknown as jest.Mocked<GodModeService>;

    // Create Express app with router
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      (req as any).user = { id: 'test-user' };
      next();
    });
    app.use('/api/v1/graph', createImmutableGraphRouter(mockGraphService, mockGodModeService));
  });

  describe('POST /nodes', () => {
    it('should create a new node', async () => {
      const mockNode = createMockNode();
      mockGraphService.createNode.mockResolvedValue(mockNode);

      const response = await request(app)
        .post('/api/v1/graph/nodes')
        .send({
          namespace: 'PROJECT',
          nodeType: 'Function',
          properties: { name: 'Test' },
          changeReason: 'Test creation'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.entityId).toBe('e-001');
      expect(mockGraphService.createNode).toHaveBeenCalledWith(expect.objectContaining({
        namespace: Namespace.PROJECT,
        nodeType: 'Function',
        properties: { name: 'Test' }
      }));
    });

    it('should handle missing properties', async () => {
      const mockNode = createMockNode({ properties: {} });
      mockGraphService.createNode.mockResolvedValue(mockNode);

      const response = await request(app)
        .post('/api/v1/graph/nodes')
        .send({
          namespace: 'PROJECT',
          nodeType: 'Function'
        });

      expect(response.status).toBe(201);
      expect(mockGraphService.createNode).toHaveBeenCalledWith(expect.objectContaining({
        properties: {}
      }));
    });
  });

  describe('GET /nodes/:entityId', () => {
    it('should get node by entityId', async () => {
      const mockNode = createMockNode();
      mockGraphService.getNodeByEntityId.mockResolvedValue(mockNode);

      const response = await request(app)
        .get('/api/v1/graph/nodes/e-001');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.node.entityId).toBe('e-001');
    });

    it('should return 404 for non-existent node', async () => {
      mockGraphService.getNodeByEntityId.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/graph/nodes/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should include lineage when requested', async () => {
      const mockNode = createMockNode();
      const mockLineage = [mockNode];
      mockGraphService.getNodeByEntityId.mockResolvedValue(mockNode);
      mockGraphService.getNodeLineage.mockResolvedValue(mockLineage);

      const response = await request(app)
        .get('/api/v1/graph/nodes/e-001?includeLineage=true');

      expect(response.status).toBe(200);
      expect(response.body.data.lineage).toBeDefined();
      expect(mockGraphService.getNodeLineage).toHaveBeenCalledWith('e-001');
    });
  });

  describe('PATCH /nodes/:entityId', () => {
    it('should update node', async () => {
      const updatedNode = createMockNode({
        versionId: 'v-002',
        properties: { name: 'Updated' },
        changeType: ChangeType.UPDATE
      });
      mockGraphService.updateNode.mockResolvedValue(updatedNode);

      const response = await request(app)
        .patch('/api/v1/graph/nodes/e-001')
        .send({
          properties: { name: 'Updated' },
          changeReason: 'Update test'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.properties.name).toBe('Updated');
    });
  });

  describe('POST /nodes/:entityId/deprecate', () => {
    it('should deprecate node and return orphaned edge count', async () => {
      const deprecatedNode = createMockNode({ status: NodeStatus.DEPRECATED });
      mockGraphService.deprecateNode.mockResolvedValue({
        node: deprecatedNode,
        orphanedEdgesCount: 2
      });

      const response = await request(app)
        .post('/api/v1/graph/nodes/e-001/deprecate')
        .send({ reason: 'No longer needed' });

      expect(response.status).toBe(200);
      expect(response.body.data.node.status).toBe('DEPRECATED');
      expect(response.body.data.orphanedEdgesCount).toBe(2);
    });
  });

  describe('POST /nodes/merge', () => {
    it('should merge two nodes', async () => {
      const mergedNode = createMockNode({
        entityId: 'e-003',
        changeType: ChangeType.MERGE
      });
      const sourceA = createMockNode({ entityId: 'e-001' });
      const sourceB = createMockNode({ entityId: 'e-002' });
      mockGraphService.mergeNodes.mockResolvedValue({
        mergedNode,
        mergeRecord: { mergeId: 'm-001' } as any,
        sourceA,
        sourceB,
        migratedEdges: 0
      });

      const response = await request(app)
        .post('/api/v1/graph/nodes/merge')
        .send({
          entityIdA: 'e-001',
          entityIdB: 'e-002',
          mergeReason: 'Duplicate entities'
        });

      expect(response.status).toBe(201);
      expect(response.body.data.mergedNode.entityId).toBe('e-003');
    });
  });

  describe('POST /edges', () => {
    it('should create edge between nodes', async () => {
      const mockEdge = createMockEdge();
      mockGraphService.createEdge.mockResolvedValue(mockEdge);

      const response = await request(app)
        .post('/api/v1/graph/edges')
        .send({
          sourceEntityId: 'e-001',
          targetEntityId: 'e-002',
          edgeType: 'CALLS',
          namespace: 'PROJECT'
        });

      expect(response.status).toBe(201);
      expect(response.body.data.edgeType).toBe('CALLS');
    });
  });

  describe('GET /edges/:edgeId', () => {
    it('should get edge by edgeId', async () => {
      const mockEdge = createMockEdge();
      mockGraphService.getEdgeByEdgeId.mockResolvedValue(mockEdge);

      const response = await request(app)
        .get('/api/v1/graph/edges/edge-001');

      expect(response.status).toBe(200);
      expect(response.body.data.edgeId).toBe('edge-001');
    });

    it('should return 404 for non-existent edge', async () => {
      mockGraphService.getEdgeByEdgeId.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/graph/edges/non-existent');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /query/nodes', () => {
    it('should query nodes by namespace', async () => {
      const mockNodes = [createMockNode(), createMockNode({ entityId: 'e-002' })];
      mockGraphService.queryNodes.mockResolvedValue(mockNodes);

      const response = await request(app)
        .get('/api/v1/graph/query/nodes?namespace=PROJECT');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });
  });

  describe('GET /nodes/:entityId/lineage', () => {
    it('should return version history', async () => {
      const mockLineage = [
        createMockNode({ sequenceNumber: 1 }),
        createMockNode({ sequenceNumber: 2, versionId: 'v-002' })
      ];
      mockGraphService.getNodeLineage.mockResolvedValue(mockLineage);

      const response = await request(app)
        .get('/api/v1/graph/nodes/e-001/lineage');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('GET /nodes/:entityId/verify-chain', () => {
    it('should verify chain integrity', async () => {
      mockGraphService.verifyNodeChain.mockResolvedValue({ valid: true });

      const response = await request(app)
        .get('/api/v1/graph/nodes/e-001/verify-chain');

      expect(response.status).toBe(200);
      expect(response.body.data.valid).toBe(true);
    });
  });

  describe('God Mode endpoints', () => {
    describe('POST /god-mode/activate', () => {
      it('should activate god mode session', async () => {
        const mockSession = {
          sessionId: 'session-001',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60000)
        };
        mockGodModeService.activate.mockResolvedValue(mockSession as any);

        const response = await request(app)
          .post('/api/v1/graph/god-mode/activate')
          .send({ reason: 'Testing god mode functionality' });

        expect(response.status).toBe(200);
        expect(response.body.data.sessionId).toBe('session-001');
      });

      it('should reject short reason', async () => {
        const response = await request(app)
          .post('/api/v1/graph/god-mode/activate')
          .send({ reason: 'short' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('10 characters');
      });
    });

    describe('POST /god-mode/deactivate', () => {
      it('should deactivate session', async () => {
        mockGodModeService.getActiveSession.mockResolvedValue({
          sessionId: 'session-001'
        } as any);
        mockGodModeService.deactivate.mockResolvedValue({
          endedAt: new Date()
        } as any);

        const response = await request(app)
          .post('/api/v1/graph/god-mode/deactivate');

        expect(response.status).toBe(200);
      });

      it('should return 404 when no active session', async () => {
        mockGodModeService.getActiveSession.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/v1/graph/god-mode/deactivate');

        expect(response.status).toBe(404);
      });
    });

    describe('GET /god-mode/status', () => {
      it('should return active status', async () => {
        mockGodModeService.getActiveSession.mockResolvedValue({
          sessionId: 'session-001',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60000),
          reason: 'Testing'
        } as any);

        const response = await request(app)
          .get('/api/v1/graph/god-mode/status');

        expect(response.status).toBe(200);
        expect(response.body.data.active).toBe(true);
      });

      it('should return inactive status', async () => {
        mockGodModeService.getActiveSession.mockResolvedValue(null);

        const response = await request(app)
          .get('/api/v1/graph/god-mode/status');

        expect(response.status).toBe(200);
        expect(response.body.data.active).toBe(false);
      });
    });

    describe('POST /god-mode/delete/:entityId/mark', () => {
      it('should mark entity for deletion', async () => {
        const mockNode = createMockNode();
        mockGraphService.getNodeByEntityId.mockResolvedValue(mockNode);
        mockGodModeService.requireActiveSession.mockResolvedValue({ sessionId: 'session-001' } as any);
        mockGodModeService.markForDeletion.mockResolvedValue({
          pendingId: 'pending-001',
          scheduledAt: new Date(),
          executeAfter: new Date(Date.now() + 5000),
          reason: 'Test deletion'
        } as any);

        const response = await request(app)
          .post('/api/v1/graph/god-mode/delete/e-001/mark')
          .send({ entityType: 'NODE', reason: 'Test deletion' });

        expect(response.status).toBe(200);
        expect(response.body.data.waitSeconds).toBeGreaterThan(0);
      });
    });

    describe('POST /god-mode/delete/:entityId/confirm', () => {
      it('should confirm deletion when ready', async () => {
        mockGodModeService.requireActiveSession.mockResolvedValue({} as any);
        mockGodModeService.canConfirmDeletion.mockResolvedValue({
          canConfirm: true,
          pending: { reason: 'Test', namespace: Namespace.PROJECT } as any
        });
        mockGraphService.physicalDeleteNode.mockResolvedValue({
          phase: 'deleted',
          tombstoneId: 'tombstone-001'
        });

        const response = await request(app)
          .post('/api/v1/graph/god-mode/delete/e-001/confirm');

        expect(response.status).toBe(200);
      });

      it('should reject when wait period not passed', async () => {
        mockGodModeService.requireActiveSession.mockResolvedValue({} as any);
        mockGodModeService.canConfirmDeletion.mockResolvedValue({
          canConfirm: false,
          pending: { reason: 'Test', namespace: Namespace.PROJECT } as any,
          waitMs: 3000
        });

        const response = await request(app)
          .post('/api/v1/graph/god-mode/delete/e-001/confirm');

        expect(response.status).toBe(400);
        expect(response.body.data.waitSeconds).toBe(3);
      });
    });

    describe('GET /god-mode/audit/:entityId', () => {
      it('should return audit trail', async () => {
        mockGodModeService.getAuditTrail.mockResolvedValue([
          { auditId: 'audit-001', action: 'PHYSICAL_DELETE' }
        ] as any);

        const response = await request(app)
          .get('/api/v1/graph/god-mode/audit/e-001');

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
      });
    });
  });

  describe('GET /nodes/:entityId/edges', () => {
    it('should return connected edges', async () => {
      const mockEdges = [createMockEdge(), createMockEdge({ edgeId: 'edge-002' })];
      mockGraphService.getConnectedEdges.mockResolvedValue(mockEdges);

      const response = await request(app)
        .get('/api/v1/graph/nodes/e-001/edges');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const mockEdges = [createMockEdge()];
      mockGraphService.getConnectedEdges.mockResolvedValue(mockEdges);

      const response = await request(app)
        .get('/api/v1/graph/nodes/e-001/edges?status=ACTIVE');

      expect(mockGraphService.getConnectedEdges).toHaveBeenCalledWith('e-001', 'ACTIVE');
    });
  });

  describe('Error handling', () => {
    it('should handle EntityNotFoundError', async () => {
      const error = new EntityNotFoundError('Node', 'e-999');
      mockGraphService.getNodeByEntityId.mockImplementation(() => {
        throw error;
      });

      const response = await request(app)
        .get('/api/v1/graph/nodes/e-999');

      expect(response.status).toBe(404);
    });

    it('should handle GodModeRequiredError', async () => {
      const error = new GodModeRequiredError('Physical deletion');
      mockGraphService.physicalDeleteNode.mockImplementation(() => {
        throw error;
      });
      mockGodModeService.requireActiveSession.mockResolvedValue({} as any);
      mockGodModeService.canConfirmDeletion.mockResolvedValue({
        canConfirm: true,
        pending: { reason: 'Test', namespace: Namespace.PROJECT } as any
      });

      const response = await request(app)
        .post('/api/v1/graph/god-mode/delete/e-001/confirm');

      expect(response.status).toBe(403);
    });
  });
});
