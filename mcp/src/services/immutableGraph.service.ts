/**
 * Immutable Graph API Service
 * UN ProjectAdvisor - Client for bi-temporal versioned graph system
 */

const API_BASE = '/api/v1/graph';

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export interface NodeVersion {
  versionId: string;
  entityId: string;
  namespace: string;
  nodeType: string;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'DEPRECATED' | 'MERGED' | 'DELETED';
  properties: Record<string, unknown>;
  versionName: string;
  sequenceNumber: number;
  ttStart: string;
  ttEnd: string | null;
  vtStart: string;
  vtEnd: string | null;
  changeType: string;
  changeReason: string;
  changedBy: string;
  contentHash: string;
  chainHash: string;
}

export interface EdgeVersion {
  versionId: string;
  edgeId: string;
  sourceEntityId: string;
  targetEntityId: string;
  edgeType: string;
  namespace: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'ORPHANED' | 'DEPRECATED' | 'DELETED';
  properties: Record<string, unknown>;
  versionName: string;
}

export interface NodeLineage {
  entityId: string;
  versions: NodeVersion[];
  mergeHistory: MergeRecord[];
}

export interface MergeRecord {
  mergeId: string;
  entityIdA: string;
  entityIdB: string;
  mergedEntityId: string;
  mergeReason: string;
  mergedBy: string;
  mergedAt: string;
}

export interface GodModeSession {
  sessionId: string;
  userId: string;
  namespace: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  isActive: boolean;
  remainingMinutes: number;
}

export interface PendingDeletion {
  pendingId: string;
  entityId: string;
  entityType: 'NODE' | 'EDGE';
  markedAt: string;
  confirmDeadline: string;
  waitSeconds: number;
}

export interface ChainVerification {
  valid: boolean;
  chainLength: number;
  errors: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// NODE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

export async function createNode(input: {
  namespace: string;
  projectId?: string;
  nodeType: string;
  properties: Record<string, unknown>;
  validTimeStart?: string;
  changeReason?: string;
  changeSource?: string;
}): Promise<ApiResponse<NodeVersion>> {
  const response = await fetch(`${API_BASE}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function getNode(
  entityId: string,
  includeLineage = false
): Promise<ApiResponse<{ node: NodeVersion; lineage?: NodeLineage }>> {
  const params = includeLineage ? '?includeLineage=true' : '';
  const response = await fetch(`${API_BASE}/nodes/${entityId}${params}`);
  return response.json();
}

export async function updateNode(
  entityId: string,
  input: {
    properties: Record<string, unknown>;
    changeReason?: string;
    validTimeStart?: string;
    godMode?: boolean;
  }
): Promise<ApiResponse<NodeVersion>> {
  const response = await fetch(`${API_BASE}/nodes/${entityId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function deprecateNode(
  entityId: string,
  reason?: string
): Promise<ApiResponse<{ node: NodeVersion; orphanedEdgesCount: number }>> {
  const response = await fetch(`${API_BASE}/nodes/${entityId}/deprecate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return response.json();
}

export async function mergeNodes(input: {
  entityIdA: string;
  entityIdB: string;
  mergeReason?: string;
}): Promise<ApiResponse<{ mergedNode: NodeVersion; mergeRecord: MergeRecord; migratedEdges: number }>> {
  const response = await fetch(`${API_BASE}/nodes/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function getNodeLineage(entityId: string): Promise<ApiResponse<NodeLineage>> {
  const response = await fetch(`${API_BASE}/nodes/${entityId}/lineage`);
  return response.json();
}

export async function verifyNodeChain(entityId: string): Promise<ApiResponse<ChainVerification>> {
  const response = await fetch(`${API_BASE}/nodes/${entityId}/verify-chain`);
  return response.json();
}

// ════════════════════════════════════════════════════════════════════════════
// EDGE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

export async function createEdge(input: {
  sourceEntityId: string;
  targetEntityId: string;
  edgeType: string;
  namespace: string;
  properties?: Record<string, unknown>;
  changeReason?: string;
}): Promise<ApiResponse<EdgeVersion>> {
  const response = await fetch(`${API_BASE}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function getEdge(edgeId: string): Promise<ApiResponse<EdgeVersion>> {
  const response = await fetch(`${API_BASE}/edges/${edgeId}`);
  return response.json();
}

export async function deprecateEdge(
  edgeId: string,
  reason?: string
): Promise<ApiResponse<EdgeVersion>> {
  const response = await fetch(`${API_BASE}/edges/${edgeId}/deprecate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return response.json();
}

export async function getConnectedEdges(
  entityId: string,
  status?: string
): Promise<ApiResponse<EdgeVersion[]>> {
  const params = status ? `?status=${status}` : '';
  const response = await fetch(`${API_BASE}/nodes/${entityId}/edges${params}`);
  return response.json();
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPORAL QUERIES
// ════════════════════════════════════════════════════════════════════════════

export async function queryNodes(params: {
  namespace?: string;
  projectId?: string;
  validTime?: string;
  transactionTime?: string;
  versionName?: string;
}): Promise<ApiResponse<NodeVersion[]>> {
  const searchParams = new URLSearchParams();
  if (params.namespace) searchParams.set('namespace', params.namespace);
  if (params.projectId) searchParams.set('projectId', params.projectId);
  if (params.validTime) searchParams.set('validTime', params.validTime);
  if (params.transactionTime) searchParams.set('transactionTime', params.transactionTime);
  if (params.versionName) searchParams.set('versionName', params.versionName);

  const response = await fetch(`${API_BASE}/query/nodes?${searchParams}`);
  return response.json();
}

// ════════════════════════════════════════════════════════════════════════════
// GOD MODE
// ════════════════════════════════════════════════════════════════════════════

export async function activateGodMode(
  reason: string,
  durationMinutes?: number
): Promise<ApiResponse<GodModeSession>> {
  const response = await fetch(`${API_BASE}/god-mode/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, durationMinutes }),
  });
  return response.json();
}

export async function deactivateGodMode(): Promise<ApiResponse<{ deactivatedAt: string }>> {
  const response = await fetch(`${API_BASE}/god-mode/deactivate`, {
    method: 'POST',
  });
  return response.json();
}

export async function getGodModeStatus(): Promise<ApiResponse<GodModeSession | { active: false }>> {
  const response = await fetch(`${API_BASE}/god-mode/status`);
  return response.json();
}

export async function markForDeletion(
  entityId: string,
  entityType: 'NODE' | 'EDGE',
  reason?: string
): Promise<ApiResponse<PendingDeletion>> {
  const response = await fetch(`${API_BASE}/god-mode/delete/${entityId}/mark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, reason }),
  });
  return response.json();
}

export async function confirmDeletion(
  entityId: string
): Promise<ApiResponse<{ deleted: boolean; tombstoneId: string }>> {
  const response = await fetch(`${API_BASE}/god-mode/delete/${entityId}/confirm`, {
    method: 'POST',
  });
  return response.json();
}

export async function getAuditTrail(entityId: string): Promise<ApiResponse<unknown[]>> {
  const response = await fetch(`${API_BASE}/god-mode/audit/${entityId}`);
  return response.json();
}

export async function getSessionAuditTrail(sessionId: string): Promise<ApiResponse<unknown[]>> {
  const response = await fetch(`${API_BASE}/god-mode/session/${sessionId}/audit`);
  return response.json();
}

// ════════════════════════════════════════════════════════════════════════════
// SSE STREAM
// ════════════════════════════════════════════════════════════════════════════

export function createGraphEventSource(options?: {
  namespace?: string;
  entityId?: string;
  types?: string[];
}): EventSource {
  const params = new URLSearchParams();
  if (options?.namespace) params.set('namespace', options.namespace);
  if (options?.entityId) params.set('entityId', options.entityId);
  if (options?.types) params.set('types', options.types.join(','));

  return new EventSource(`${API_BASE}/sse/events?${params}`);
}

export function createGodModeEventSource(): EventSource {
  return new EventSource(`${API_BASE}/sse/events/god-mode`);
}

// ════════════════════════════════════════════════════════════════════════════
// GRAPH CATALOG (для списка графов)
// ════════════════════════════════════════════════════════════════════════════

export interface GraphInfo {
  entityId: string;
  name: string;
  namespace: string;
  nodeType: string;
  status: string;
  nodeCount?: number;
  edgeCount?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export async function getGraphCatalog(params?: {
  namespace?: string;
  projectId?: string;
  nodeType?: string;
}): Promise<ApiResponse<GraphInfo[]>> {
  const searchParams = new URLSearchParams();
  if (params?.namespace) searchParams.set('namespace', params.namespace);
  if (params?.projectId) searchParams.set('projectId', params.projectId);
  if (params?.nodeType) searchParams.set('nodeType', params.nodeType || 'ExecutionGraph');

  // Query nodes that are graphs (ExecutionGraph type)
  const response = await fetch(`${API_BASE}/query/nodes?${searchParams}`);
  const result = await response.json();

  if (result.success && result.data) {
    // Transform to GraphInfo
    const graphs: GraphInfo[] = result.data.map((node: NodeVersion) => ({
      entityId: node.entityId,
      name: (node.properties.name as string) || node.versionName,
      namespace: node.namespace,
      nodeType: node.nodeType,
      status: node.status,
      nodeCount: node.properties.nodeCount as number,
      edgeCount: node.properties.edgeCount as number,
      createdAt: node.ttStart,
      updatedAt: node.vtStart,
      createdBy: node.changedBy,
    }));
    return { success: true, data: graphs };
  }

  return result;
}
