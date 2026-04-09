/**
 * GXE Graph Compiler - Type Checker
 *
 * Phase 0: Foundation (Day 3)
 *
 * Implements type compatibility checking between ports and
 * automatic adapter insertion for type coercion.
 *
 * Key functions:
 * - checkTypeCompatibility: Check if output type can connect to input type
 * - applyAdapter: Apply type conversion adapter
 * - typeCheckPlan: Validate entire execution plan
 */

import {
  PortType,
  CompatResult,
  CompatStatus,
  AdapterId,
  TypeCheckResult,
  TypeCheckError,
  TypeCheckWarning,
  JsonPortType,
  ListPortType,
  EmbeddingPortType,
  RecordPortType,
  GraphNodePortType,
  GraphEdgePortType,
  DEFAULT_EMBEDDING_DIMENSIONS,
} from './compiler-types';

import { ExecutionPlan, ExecutionEdge, ExecutionNode } from './ir-types';
import { getToolSpec, getInputPort, getOutputPort } from './tool-port-registry';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE COMPATIBILITY CHECKER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check type compatibility between an output port and an input port.
 *
 * Returns compatibility status and any required adapter or fix suggestion.
 *
 * Priority order of checks (short-circuit):
 * 1. Exact kind match → check sub-constraints
 * 2. Output is 'void' → INCOMPATIBLE
 * 3. Input is 'void' → INCOMPATIBLE
 * 4. Input is 'any' → COMPATIBLE + warning
 * 5. Output is 'any' → COMPATIBLE + warning
 * 6. Input is 'json' → check adapter A
 * 7. Input is 'text' → check adapters B, D
 * 8. Input is 'boolean' → check adapter C
 * 9. Input is 'record' → check adapter E
 * 10. Output is 'record', input is 'json' → adapter F
 * 11. Output is 'text', input is 'embedding' → NEEDS_NODE_INSERT
 * 12. Everything else → INCOMPATIBLE
 */
export function checkTypeCompatibility(
  output: PortType,
  input: PortType
): CompatResult {
  // Step 1: Exact kind match
  if (output.kind === input.kind) {
    return checkExactKindMatch(output, input);
  }

  // Step 2: Output is void - nothing to give
  if (output.kind === 'void') {
    return {
      status: 'INCOMPATIBLE',
      error: 'Void output cannot connect to any input',
    };
  }

  // Step 3: Input is void - nothing to receive
  if (input.kind === 'void') {
    return {
      status: 'INCOMPATIBLE',
      error: 'Void input cannot receive any data',
    };
  }

  // Step 4: Input is 'any' - accepts everything
  if (input.kind === 'any') {
    return {
      status: 'COMPATIBLE',
      warning: 'Untyped input port - type safety not guaranteed',
    };
  }

  // Step 5: Output is 'any' - can go anywhere
  if (output.kind === 'any') {
    return {
      status: 'COMPATIBLE',
      warning: 'Untyped output port - type safety not guaranteed',
    };
  }

  // Step 6: Input is 'json' - most things can serialize to JSON
  if (input.kind === 'json') {
    return checkToJson(output);
  }

  // Step 7: Input is 'text' - check adapters B (number/boolean → text), D (json → text)
  if (input.kind === 'text') {
    return checkToText(output);
  }

  // Step 8: Input is 'boolean' - check adapter C (number → boolean)
  if (input.kind === 'boolean') {
    return checkToBoolean(output);
  }

  // Step 9: Input is 'record' - check adapter E (json → record)
  if (input.kind === 'record') {
    return checkToRecord(output, input as RecordPortType);
  }

  // Step 10: Output is 'record', input is 'json' - adapter F (record → json)
  // This is handled in Step 6 (checkToJson)

  // Step 11: Output is 'text', input is 'embedding' - NEEDS_NODE_INSERT
  if (output.kind === 'text' && input.kind === 'embedding') {
    return {
      status: 'NEEDS_NODE_INSERT',
      fix: 'Insert vector.embed to generate embedding from text',
    };
  }

  // Step 12: Everything else - INCOMPATIBLE
  return {
    status: 'INCOMPATIBLE',
    error: `Cannot convert ${output.kind} to ${input.kind}`,
  };
}

/**
 * Check compatibility when both types have the same kind.
 */
function checkExactKindMatch(output: PortType, input: PortType): CompatResult {
  switch (output.kind) {
    case 'text':
      // Text encoding differences are handled at runtime
      return { status: 'COMPATIBLE' };

    case 'number':
      // Number constraints (min/max/integer) validated at runtime
      return { status: 'COMPATIBLE' };

    case 'boolean':
      return { status: 'COMPATIBLE' };

    case 'json':
      return checkJsonToJson(output as JsonPortType, input as JsonPortType);

    case 'embedding':
      return checkEmbeddingToEmbedding(
        output as EmbeddingPortType,
        input as EmbeddingPortType
      );

    case 'list':
      return checkListToList(output as ListPortType, input as ListPortType);

    case 'graph_node':
      return checkGraphNodeToGraphNode(
        output as GraphNodePortType,
        input as GraphNodePortType
      );

    case 'graph_edge':
      return checkGraphEdgeToGraphEdge(
        output as GraphEdgePortType,
        input as GraphEdgePortType
      );

    case 'record':
      return checkRecordToRecord(
        output as RecordPortType,
        input as RecordPortType
      );

    case 'binary':
      // Binary MIME type compatibility - checked at runtime
      return { status: 'COMPATIBLE' };

    case 'void':
      return { status: 'COMPATIBLE' };

    case 'any':
      return {
        status: 'COMPATIBLE',
        warning: 'Both ports use "any" type - no type safety',
      };

    default:
      return { status: 'COMPATIBLE' };
  }
}

/**
 * Check JSON → JSON compatibility.
 */
function checkJsonToJson(output: JsonPortType, input: JsonPortType): CompatResult {
  // If input has no schema, it accepts any JSON
  if (!input.schema) {
    return { status: 'COMPATIBLE' };
  }

  // If output has no schema, we can't verify compatibility
  if (!output.schema) {
    return {
      status: 'COMPATIBLE',
      warning: 'Output has no schema, runtime validation may fail',
    };
  }

  // Simple schema compatibility check (only top-level required fields)
  const inputRequired = (input.schema as any).required as string[] | undefined;
  const outputProperties = (output.schema as any).properties as Record<string, unknown> | undefined;

  if (inputRequired && outputProperties) {
    const missingFields = inputRequired.filter(
      field => !(field in outputProperties)
    );
    if (missingFields.length > 0) {
      return {
        status: 'INCOMPATIBLE',
        error: `Missing required fields: ${missingFields.join(', ')}`,
      };
    }
  }

  return { status: 'COMPATIBLE' };
}

/**
 * Check embedding → embedding compatibility.
 */
function checkEmbeddingToEmbedding(
  output: EmbeddingPortType,
  input: EmbeddingPortType
): CompatResult {
  const outDims = output.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  const inDims = input.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;

  if (outDims !== inDims) {
    return {
      status: 'INCOMPATIBLE',
      error: `Dimension mismatch: ${outDims} → ${inDims}. Cannot auto-convert embeddings.`,
    };
  }

  return { status: 'COMPATIBLE' };
}

/**
 * Check list → list compatibility (recursive).
 */
function checkListToList(output: ListPortType, input: ListPortType): CompatResult {
  const innerResult = checkTypeCompatibility(output.itemType, input.itemType);

  switch (innerResult.status) {
    case 'COMPATIBLE':
      return {
        status: 'COMPATIBLE',
        warning: innerResult.warning,
      };

    case 'NEEDS_ADAPTER':
      // Apply adapter per element - use '[]' suffix
      return {
        status: 'NEEDS_ADAPTER',
        adapterId: innerResult.adapterId,
        innerAdapterId: innerResult.adapterId,
        warning: innerResult.warning,
      };

    case 'NEEDS_NODE_INSERT':
      // Can't auto-insert node for each list element
      return {
        status: 'INCOMPATIBLE',
        error: `Cannot auto-insert node for each list element. ${innerResult.fix}`,
      };

    case 'INCOMPATIBLE':
      return {
        status: 'INCOMPATIBLE',
        error: `List item type mismatch: ${innerResult.error}`,
      };

    default:
      return innerResult;
  }
}

/**
 * Check graph_node → graph_node compatibility.
 */
function checkGraphNodeToGraphNode(
  output: GraphNodePortType,
  input: GraphNodePortType
): CompatResult {
  // If input has no label requirements, it accepts any node
  if (!input.labels || input.labels.length === 0) {
    return { status: 'COMPATIBLE' };
  }

  // If output has no labels defined, we can't verify
  if (!output.labels || output.labels.length === 0) {
    return {
      status: 'COMPATIBLE',
      warning: 'Output node labels unknown, runtime validation may fail',
    };
  }

  // Check if output labels include all required input labels
  const missingLabels = input.labels.filter(
    label => !output.labels!.includes(label)
  );

  if (missingLabels.length > 0) {
    return {
      status: 'COMPATIBLE',
      warning: `Label mismatch possible: missing ${missingLabels.join(', ')}`,
    };
  }

  return { status: 'COMPATIBLE' };
}

/**
 * Check graph_edge → graph_edge compatibility.
 */
function checkGraphEdgeToGraphEdge(
  output: GraphEdgePortType,
  input: GraphEdgePortType
): CompatResult {
  // If input has no type requirements, it accepts any edge
  if (!input.types || input.types.length === 0) {
    return { status: 'COMPATIBLE' };
  }

  // If output has no types defined, we can't verify
  if (!output.types || output.types.length === 0) {
    return {
      status: 'COMPATIBLE',
      warning: 'Output edge types unknown, runtime validation may fail',
    };
  }

  // Check if output types include any required input types
  const hasMatchingType = input.types.some(type => output.types!.includes(type));

  if (!hasMatchingType) {
    return {
      status: 'COMPATIBLE',
      warning: `Edge type mismatch possible: expected one of ${input.types.join(', ')}`,
    };
  }

  return { status: 'COMPATIBLE' };
}

/**
 * Check record → record compatibility (structural).
 */
function checkRecordToRecord(
  output: RecordPortType,
  input: RecordPortType
): CompatResult {
  const warnings: string[] = [];

  for (const [fieldName, inputFieldType] of Object.entries(input.fields)) {
    const outputFieldType = output.fields[fieldName];

    if (!outputFieldType) {
      return {
        status: 'INCOMPATIBLE',
        error: `Missing required field: ${fieldName}`,
      };
    }

    const fieldResult = checkTypeCompatibility(outputFieldType, inputFieldType);

    if (fieldResult.status === 'INCOMPATIBLE') {
      return {
        status: 'INCOMPATIBLE',
        error: `Field '${fieldName}': ${fieldResult.error}`,
      };
    }

    if (fieldResult.warning) {
      warnings.push(`Field '${fieldName}': ${fieldResult.warning}`);
    }
  }

  return {
    status: 'COMPATIBLE',
    warning: warnings.length > 0 ? warnings.join('; ') : undefined,
  };
}

/**
 * Check if output type can convert to JSON.
 */
function checkToJson(output: PortType): CompatResult {
  switch (output.kind) {
    case 'text':
    case 'number':
    case 'boolean':
    case 'list':
    case 'graph_node':
    case 'graph_edge':
    case 'record':
      return {
        status: 'NEEDS_ADAPTER',
        adapterId: 'ANY_TO_JSON',
      };

    case 'json':
      // Already JSON - should have been caught by exact match
      return { status: 'COMPATIBLE' };

    case 'embedding':
      // Embedding → JSON is almost always a mistake (1024 floats)
      return {
        status: 'INCOMPATIBLE',
        error: 'Converting embedding to JSON is not recommended (1024 float values)',
      };

    case 'binary':
      return {
        status: 'INCOMPATIBLE',
        error: 'Binary data cannot be directly converted to JSON',
      };

    default:
      return {
        status: 'NEEDS_ADAPTER',
        adapterId: 'ANY_TO_JSON',
      };
  }
}

/**
 * Check if output type can convert to text.
 */
function checkToText(output: PortType): CompatResult {
  switch (output.kind) {
    case 'number':
      return {
        status: 'NEEDS_ADAPTER',
        adapterId: 'NUMBER_TO_TEXT',
      };

    case 'boolean':
      return {
        status: 'NEEDS_ADAPTER',
        adapterId: 'BOOLEAN_TO_TEXT',
      };

    case 'json':
      return {
        status: 'NEEDS_ADAPTER',
        adapterId: 'JSON_TO_TEXT',
      };

    case 'text':
      // Already text - should have been caught by exact match
      return { status: 'COMPATIBLE' };

    default:
      return {
        status: 'INCOMPATIBLE',
        error: `Cannot convert ${output.kind} to text`,
      };
  }
}

/**
 * Check if output type can convert to boolean.
 */
function checkToBoolean(output: PortType): CompatResult {
  switch (output.kind) {
    case 'number':
      return {
        status: 'NEEDS_ADAPTER',
        adapterId: 'NUMBER_TO_BOOLEAN',
      };

    case 'boolean':
      // Already boolean - should have been caught by exact match
      return { status: 'COMPATIBLE' };

    default:
      return {
        status: 'INCOMPATIBLE',
        error: `Cannot convert ${output.kind} to boolean`,
      };
  }
}

/**
 * Check if output type can convert to record.
 */
function checkToRecord(output: PortType, input: RecordPortType): CompatResult {
  if (output.kind === 'json') {
    return {
      status: 'NEEDS_ADAPTER',
      adapterId: 'JSON_TO_RECORD',
      warning: 'Runtime validation required - JSON structure must match record fields',
    };
  }

  if (output.kind === 'record') {
    // Should have been caught by exact match
    return checkRecordToRecord(output as RecordPortType, input);
  }

  return {
    status: 'INCOMPATIBLE',
    error: `Cannot convert ${output.kind} to record`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adapter implementations for type conversion.
 */
const ADAPTERS: Record<AdapterId, (value: unknown) => unknown> = {
  'ANY_TO_JSON': (v) => JSON.stringify(v),
  'NUMBER_TO_TEXT': (v) => String(v),
  'BOOLEAN_TO_TEXT': (v) => String(v),
  'NUMBER_TO_BOOLEAN': (v) => v !== 0 && v !== null && v !== undefined,
  'JSON_TO_TEXT': (v) => typeof v === 'string' ? v : JSON.stringify(v, null, 2),
  'JSON_TO_RECORD': (v) => v, // Pass-through, runtime validates
  'RECORD_TO_JSON': (v) => v, // Trivial upcast
  'LIST_ITEM_ADAPTER': (v) => v, // Placeholder - actual logic in applyAdapter
};

/**
 * Apply an adapter to convert a value.
 *
 * @param adapterId - Adapter identifier
 * @param value - Value to convert
 * @param isListPort - Whether this is a list port (apply per element)
 * @returns Converted value
 */
export function applyAdapter(
  adapterId: AdapterId,
  value: unknown,
  isListPort: boolean = false
): unknown {
  const adapter = ADAPTERS[adapterId];
  if (!adapter) {
    throw new Error(`Unknown adapter: ${adapterId}`);
  }

  if (isListPort && Array.isArray(value)) {
    return value.map(item => adapter(item));
  }

  return adapter(value);
}

/**
 * Get adapter function by ID.
 */
export function getAdapter(adapterId: AdapterId): ((value: unknown) => unknown) | null {
  return ADAPTERS[adapterId] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN TYPE CHECKER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type check an entire execution plan.
 *
 * Steps:
 * 1. Validate port existence (edges reference real ports)
 * 2. Check required inputs have sources (edges or defaults)
 * 3. Check type compatibility per edge + assign adapters
 * 4. Check unused outputs (warnings)
 * 5. Return aggregated result
 */
export function typeCheckPlan(plan: ExecutionPlan): TypeCheckResult {
  const errors: TypeCheckError[] = [];
  const warnings: TypeCheckWarning[] = [];
  let adaptersApplied = 0;

  // Build edge lookup by target
  const edgesByTarget = new Map<string, ExecutionEdge[]>();
  for (const edge of plan.edges) {
    const key = `${edge.target.nodeId}:${edge.target.port}`;
    const existing = edgesByTarget.get(key) || [];
    existing.push(edge);
    edgesByTarget.set(key, existing);
  }

  // Build edge lookup by source
  const edgesBySource = new Map<string, ExecutionEdge[]>();
  for (const edge of plan.edges) {
    const key = `${edge.source.nodeId}:${edge.source.port}`;
    const existing = edgesBySource.get(key) || [];
    existing.push(edge);
    edgesBySource.set(key, existing);
  }

  // Step 1 & 2: Validate nodes and their port connections
  for (const node of plan.nodes) {
    const toolSpec = getToolSpec(node.toolId);

    if (!toolSpec) {
      errors.push({
        type: 'PORT_NOT_FOUND',
        nodeId: node.id,
        message: `Unknown tool: ${node.toolId}`,
      });
      continue;
    }

    // Check each input port
    for (const inputPort of node.inputPorts) {
      const portDef = getInputPort(node.toolId, inputPort.name);

      if (!portDef) {
        errors.push({
          type: 'PORT_NOT_FOUND',
          nodeId: node.id,
          port: inputPort.name,
          message: `Input port '${inputPort.name}' not found in tool '${node.toolId}'`,
        });
        continue;
      }

      // Check if required input has a source
      if (inputPort.required) {
        const edgeKey = `${node.id}:${inputPort.name}`;
        const incomingEdges = edgesByTarget.get(edgeKey) || [];

        // Check for __params source (runtime parameter)
        const hasParamSource = inputPort.source.startsWith('__params:');

        if (incomingEdges.length === 0 && !hasParamSource) {
          // Check if there's a default value
          const binding = node.inputPorts.find(p => p.name === inputPort.name);
          if (!binding || binding.source === '') {
            errors.push({
              type: 'MISSING_SOURCE',
              nodeId: node.id,
              port: inputPort.name,
              message: `Required input '${inputPort.name}' has no source connection`,
            });
          }
        }

        if (hasParamSource) {
          warnings.push({
            type: 'SCHEMA_UNKNOWN',
            nodeId: node.id,
            port: inputPort.name,
            message: 'Parameter type will be validated at runtime',
          });
        }
      }
    }

    // Check output ports exist
    for (const outputPort of node.outputPorts) {
      const portDef = getOutputPort(node.toolId, outputPort.name);

      if (!portDef) {
        errors.push({
          type: 'PORT_NOT_FOUND',
          nodeId: node.id,
          port: outputPort.name,
          message: `Output port '${outputPort.name}' not found in tool '${node.toolId}'`,
        });
      }
    }
  }

  // Step 3: Check type compatibility for each edge
  for (const edge of plan.edges) {
    // Skip edges from __params (runtime validated)
    if (edge.source.nodeId === '__params') {
      continue;
    }

    const sourceNode = plan.nodes.find(n => n.id === edge.source.nodeId);
    const targetNode = plan.nodes.find(n => n.id === edge.target.nodeId);

    if (!sourceNode || !targetNode) {
      errors.push({
        type: 'PORT_NOT_FOUND',
        edge: {
          sourceNodeId: edge.source.nodeId,
          sourcePort: edge.source.port,
          targetNodeId: edge.target.nodeId,
          targetPort: edge.target.port,
        },
        message: `Edge references non-existent node`,
      });
      continue;
    }

    const sourcePortDef = getOutputPort(sourceNode.toolId, edge.source.port);
    const targetPortDef = getInputPort(targetNode.toolId, edge.target.port);

    if (!sourcePortDef || !targetPortDef) {
      errors.push({
        type: 'PORT_NOT_FOUND',
        edge: {
          sourceNodeId: edge.source.nodeId,
          sourcePort: edge.source.port,
          targetNodeId: edge.target.nodeId,
          targetPort: edge.target.port,
        },
        message: `Edge references non-existent port`,
      });
      continue;
    }

    // Check type compatibility
    const compat = checkTypeCompatibility(sourcePortDef.type, targetPortDef.type);

    switch (compat.status) {
      case 'COMPATIBLE':
        if (compat.warning) {
          warnings.push({
            type: 'ANY_TYPE_USED',
            edge: {
              sourceNodeId: edge.source.nodeId,
              sourcePort: edge.source.port,
              targetNodeId: edge.target.nodeId,
              targetPort: edge.target.port,
            },
            message: compat.warning,
          });
        }
        break;

      case 'NEEDS_ADAPTER':
        // Mark edge with adapter
        edge.adapter = compat.adapterId;
        edge.innerAdapter = compat.innerAdapterId;
        edge.typeCompatible = true;
        adaptersApplied++;

        warnings.push({
          type: 'ADAPTER_APPLIED',
          edge: {
            sourceNodeId: edge.source.nodeId,
            sourcePort: edge.source.port,
            targetNodeId: edge.target.nodeId,
            targetPort: edge.target.port,
          },
          message: `Adapter '${compat.adapterId}' auto-inserted`,
        });
        break;

      case 'NEEDS_NODE_INSERT':
        errors.push({
          type: 'TYPE_MISMATCH_FIXABLE',
          edge: {
            sourceNodeId: edge.source.nodeId,
            sourcePort: edge.source.port,
            targetNodeId: edge.target.nodeId,
            targetPort: edge.target.port,
          },
          outputType: sourcePortDef.type,
          inputType: targetPortDef.type,
          fix: compat.fix,
          message: `Type mismatch: ${sourcePortDef.type.kind} → ${targetPortDef.type.kind}. ${compat.fix}`,
        });
        break;

      case 'INCOMPATIBLE':
        errors.push({
          type: 'TYPE_MISMATCH',
          edge: {
            sourceNodeId: edge.source.nodeId,
            sourcePort: edge.source.port,
            targetNodeId: edge.target.nodeId,
            targetPort: edge.target.port,
          },
          outputType: sourcePortDef.type,
          inputType: targetPortDef.type,
          message: compat.error || `Incompatible types: ${sourcePortDef.type.kind} → ${targetPortDef.type.kind}`,
        });
        break;
    }
  }

  // Step 4: Check for unused outputs (warnings)
  for (const node of plan.nodes) {
    for (const outputPort of node.outputPorts) {
      const edgeKey = `${node.id}:${outputPort.name}`;
      const outgoingEdges = edgesBySource.get(edgeKey) || [];

      if (outgoingEdges.length === 0 && outputPort.consumers.length === 0) {
        // Check if this is not a terminal node (no outgoing edges at all)
        const nodeHasAnyOutgoing = Array.from(edgesBySource.keys()).some(
          key => key.startsWith(`${node.id}:`)
        );

        if (nodeHasAnyOutgoing) {
          warnings.push({
            type: 'UNUSED_OUTPUT',
            nodeId: node.id,
            port: outputPort.name,
            message: `Output '${outputPort.name}' is not consumed by any node`,
          });
        }
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    adaptersApplied,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a human-readable description of a port type.
 */
export function describePortType(type: PortType): string {
  switch (type.kind) {
    case 'text':
      return 'text';
    case 'number':
      const numType = type as { integer?: boolean };
      return numType.integer ? 'integer' : 'number';
    case 'boolean':
      return 'boolean';
    case 'json':
      return 'JSON';
    case 'embedding':
      return `embedding[${(type as EmbeddingPortType).dimensions}]`;
    case 'list':
      return `list<${describePortType((type as ListPortType).itemType)}>`;
    case 'record':
      const fields = Object.keys((type as RecordPortType).fields);
      return `record{${fields.join(', ')}}`;
    case 'graph_node':
      const labels = (type as GraphNodePortType).labels;
      return labels ? `node:${labels.join(':')}` : 'node';
    case 'graph_edge':
      const types = (type as GraphEdgePortType).types;
      return types ? `edge:${types.join('|')}` : 'edge';
    case 'binary':
      return 'binary';
    case 'void':
      return 'void';
    case 'any':
      return 'any';
    default:
      return 'unknown';
  }
}

/**
 * Check if a type is a list type.
 */
export function isListType(type: PortType): type is ListPortType {
  return type.kind === 'list';
}

/**
 * Extract the item type from a list type.
 */
export function getListItemType(type: PortType): PortType | null {
  if (type.kind === 'list') {
    return (type as ListPortType).itemType;
  }
  return null;
}
