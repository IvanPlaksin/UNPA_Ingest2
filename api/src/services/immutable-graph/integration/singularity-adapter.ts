/**
 * Singularity Adapter for Immutable Graph
 * UN ProjectAdvisor - Integration with Singularity visualization
 */

import { ImmutableGraphService } from '../immutable-graph.service';
import {
  NodeVersion,
  EdgeVersion,
  Namespace,
  NodeStatus,
  EdgeStatus,
  TemporalQueryParams
} from '../../../types/immutable-graph.types';

export interface SingularityNode {
  id: string;
  type: string;
  label: string;
  layer: 'strategic' | 'business' | 'code';
  status: string;
  properties: Record<string, unknown>;
  position?: { x: number; y: number; z: number };
  visual: {
    color: string;
    size: number;
    shape: string;
  };
}

export interface SingularityEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  status: string;
  properties: Record<string, unknown>;
  visual: {
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
  };
}

export interface SingularityGraph {
  nodes: SingularityNode[];
  edges: SingularityEdge[];
  metadata: {
    namespace: string;
    queryTime?: Date;
    validTime?: Date;
    transactionTime?: Date;
    totalNodes: number;
    totalEdges: number;
  };
}

export interface SingularityQueryOptions {
  namespace: Namespace;
  projectId?: string;
  validTime?: Date;
  transactionTime?: Date;
  centerEntityId?: string;
  depth?: number;
  nodeTypes?: string[];
  edgeTypes?: string[];
  includeDeprecated?: boolean;
  includeOrphaned?: boolean;
}

const LAYER_CONFIG = {
  strategic: {
    types: ['Epic', 'Feature', 'BusinessProcess', 'BusinessRule'],
    z: -200,
    color: '#8B5CF6'
  },
  business: {
    types: ['WorkItem', 'Task', 'Bug', 'UserStory', 'Sprint', 'Document'],
    z: 0,
    color: '#06B6D4'
  },
  code: {
    types: ['File', 'Class', 'Function', 'Method', 'Interface', 'Module', 'StoredProcedure', 'Table'],
    z: 200,
    color: '#EC4899'
  }
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#10B981',
  SUPERSEDED: '#6B7280',
  DEPRECATED: '#F59E0B',
  MERGED: '#8B5CF6',
  ORPHANED: '#F97316',
  DELETED: '#EF4444'
};

export class SingularityAdapter {
  constructor(private graphService: ImmutableGraphService) {}

  async getGraph(options: SingularityQueryOptions): Promise<SingularityGraph> {
    const queryParams: TemporalQueryParams = {
      namespace: options.namespace,
      projectId: options.projectId,
      validTime: options.validTime,
      transactionTime: options.transactionTime
    };

    let nodes = await this.graphService.queryNodes(queryParams);

    if (options.nodeTypes?.length) {
      nodes = nodes.filter(n => options.nodeTypes!.includes(n.nodeType));
    }

    if (!options.includeDeprecated) {
      nodes = nodes.filter(n => n.status !== NodeStatus.DEPRECATED);
    }

    if (options.centerEntityId && options.depth) {
      nodes = await this.expandFromCenter(options.centerEntityId, options.depth, nodes);
    }

    const nodeEntityIds = new Set(nodes.map(n => n.entityId));
    let edges: EdgeVersion[] = [];

    for (const node of nodes) {
      const connectedEdges = await this.graphService.getConnectedEdges(node.entityId);
      edges.push(...connectedEdges.filter(e =>
        nodeEntityIds.has(e.sourceEntityId) && nodeEntityIds.has(e.targetEntityId)
      ));
    }

    const uniqueEdges = this.deduplicateEdges(edges);

    if (options.edgeTypes?.length) {
      edges = uniqueEdges.filter(e => options.edgeTypes!.includes(e.edgeType));
    } else {
      edges = uniqueEdges;
    }

    if (!options.includeOrphaned) {
      edges = edges.filter(e => e.status !== EdgeStatus.ORPHANED);
    }

    const singularityNodes = nodes.map(n => this.convertNode(n));
    const singularityEdges = edges.map(e => this.convertEdge(e));

    this.assignPositions(singularityNodes);

    return {
      nodes: singularityNodes,
      edges: singularityEdges,
      metadata: {
        namespace: options.namespace,
        queryTime: new Date(),
        validTime: options.validTime,
        transactionTime: options.transactionTime,
        totalNodes: singularityNodes.length,
        totalEdges: singularityEdges.length
      }
    };
  }

  async expandNode(entityId: string, depth: number = 1): Promise<SingularityGraph> {
    const centerNode = await this.graphService.getNodeByEntityId(entityId);
    if (!centerNode) {
      return { nodes: [], edges: [], metadata: { namespace: Namespace.PROJECT, totalNodes: 0, totalEdges: 0 } };
    }

    const visited = new Set<string>();
    const nodes: NodeVersion[] = [centerNode];
    const edges: EdgeVersion[] = [];

    await this.expandRecursive(entityId, depth, visited, nodes, edges);

    const singularityNodes = nodes.map(n => this.convertNode(n));
    const singularityEdges = edges.map(e => this.convertEdge(e));

    this.assignPositions(singularityNodes, entityId);

    return {
      nodes: singularityNodes,
      edges: singularityEdges,
      metadata: {
        namespace: centerNode.namespace,
        totalNodes: singularityNodes.length,
        totalEdges: singularityEdges.length
      }
    };
  }

  private async expandRecursive(
    entityId: string,
    depth: number,
    visited: Set<string>,
    nodes: NodeVersion[],
    edges: EdgeVersion[]
  ): Promise<void> {
    if (depth <= 0 || visited.has(entityId)) return;
    visited.add(entityId);

    const connectedEdges = await this.graphService.getConnectedEdges(entityId, EdgeStatus.ACTIVE);

    for (const edge of connectedEdges) {
      if (!edges.find(e => e.edgeId === edge.edgeId)) {
        edges.push(edge);
      }

      const neighborId = edge.sourceEntityId === entityId ? edge.targetEntityId : edge.sourceEntityId;

      if (!visited.has(neighborId)) {
        const neighborNode = await this.graphService.getNodeByEntityId(neighborId);
        if (neighborNode && !nodes.find(n => n.entityId === neighborId)) {
          nodes.push(neighborNode);
        }
        await this.expandRecursive(neighborId, depth - 1, visited, nodes, edges);
      }
    }
  }

  private async expandFromCenter(
    centerId: string,
    depth: number,
    existingNodes: NodeVersion[]
  ): Promise<NodeVersion[]> {
    const visited = new Set(existingNodes.map(n => n.entityId));
    const result = [...existingNodes];

    const expand = async (entityId: string, currentDepth: number) => {
      if (currentDepth <= 0) return;

      const connectedEdges = await this.graphService.getConnectedEdges(entityId, EdgeStatus.ACTIVE);

      for (const edge of connectedEdges) {
        const neighborId = edge.sourceEntityId === entityId ? edge.targetEntityId : edge.sourceEntityId;

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          const neighbor = await this.graphService.getNodeByEntityId(neighborId);
          if (neighbor) {
            result.push(neighbor);
            await expand(neighborId, currentDepth - 1);
          }
        }
      }
    };

    await expand(centerId, depth);
    return result;
  }

  private convertNode(node: NodeVersion): SingularityNode {
    const layer = this.determineLayer(node.nodeType);
    const layerConfig = LAYER_CONFIG[layer];

    return {
      id: node.entityId,
      type: node.nodeType,
      label: (node.properties.name as string) || node.nodeType,
      layer,
      status: node.status,
      properties: node.properties,
      visual: {
        color: node.status === NodeStatus.ACTIVE ? layerConfig.color : STATUS_COLORS[node.status],
        size: this.calculateNodeSize(node),
        shape: this.determineShape(node.nodeType)
      }
    };
  }

  private convertEdge(edge: EdgeVersion): SingularityEdge {
    return {
      id: edge.edgeId,
      source: edge.sourceEntityId,
      target: edge.targetEntityId,
      type: edge.edgeType,
      status: edge.status,
      properties: edge.properties,
      visual: {
        color: edge.status === EdgeStatus.ACTIVE ? '#6B7280' : STATUS_COLORS[edge.status],
        width: this.calculateEdgeWidth(edge),
        style: edge.status === EdgeStatus.ORPHANED ? 'dashed' : 'solid'
      }
    };
  }

  private determineLayer(nodeType: string): 'strategic' | 'business' | 'code' {
    for (const [layer, config] of Object.entries(LAYER_CONFIG)) {
      if (config.types.includes(nodeType)) {
        return layer as 'strategic' | 'business' | 'code';
      }
    }
    return 'business';
  }

  private determineShape(nodeType: string): string {
    const shapes: Record<string, string> = {
      Epic: 'diamond',
      Feature: 'hexagon',
      BusinessProcess: 'octagon',
      WorkItem: 'square',
      Task: 'square',
      Bug: 'triangle',
      File: 'circle',
      Class: 'pentagon',
      Function: 'circle',
      Method: 'circle',
      StoredProcedure: 'cylinder'
    };
    return shapes[nodeType] || 'circle';
  }

  private calculateNodeSize(node: NodeVersion): number {
    const baseSize = 10;
    const complexity = (node.properties.complexity as number) || 0;
    const connections = (node.properties._connectionCount as number) || 0;
    return baseSize + Math.min(complexity / 2, 10) + Math.min(connections, 10);
  }

  private calculateEdgeWidth(edge: EdgeVersion): number {
    const confidence = (edge.properties.confidence as number) || 1;
    const weight = (edge.properties.weight as number) || 1;
    return Math.max(1, Math.min(confidence * weight * 3, 5));
  }

  private assignPositions(nodes: SingularityNode[], centerId?: string): void {
    const layerNodes: Record<string, SingularityNode[]> = {
      strategic: [],
      business: [],
      code: []
    };

    for (const node of nodes) {
      layerNodes[node.layer].push(node);
    }

    for (const [layer, layerNodeList] of Object.entries(layerNodes)) {
      const z = LAYER_CONFIG[layer as keyof typeof LAYER_CONFIG].z;
      const count = layerNodeList.length;
      const radius = Math.max(100, count * 20);

      layerNodeList.forEach((node, i) => {
        if (centerId && node.id === centerId) {
          node.position = { x: 0, y: 0, z };
        } else {
          const angle = (2 * Math.PI * i) / count;
          node.position = {
            x: radius * Math.cos(angle),
            y: radius * Math.sin(angle),
            z
          };
        }
      });
    }
  }

  private deduplicateEdges(edges: EdgeVersion[]): EdgeVersion[] {
    const seen = new Set<string>();
    return edges.filter(e => {
      if (seen.has(e.edgeId)) return false;
      seen.add(e.edgeId);
      return true;
    });
  }
}
