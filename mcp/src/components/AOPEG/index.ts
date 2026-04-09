/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG Components Index
 * Exports all AOPEG graph editor components
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Core editor components
export { AOPEGNode } from './AOPEGNode';
export { AOPEGEdge } from './AOPEGEdge';
export { GraphEditor, GraphEditor as default } from './GraphEditor';

// UI Components
export { GraphEditorToolbar } from './GraphEditorToolbar';
export { NodeCatalogSidebar } from './NodeCatalogSidebar';
export { PropertiesPanel } from './PropertiesPanel';

// Execution components
export { ExecutionOverlay } from './ExecutionOverlay';
export type { ExecutionOverlayState, NodeExecutionState } from './ExecutionOverlay';

export { InputDataModal } from './InputDataModal';

// Validation
export { ValidationPanel } from './ValidationPanel';
export type { ValidationResult, ValidationIssue } from './ValidationPanel';

// History
export { ExecutionHistory } from './ExecutionHistory';
export type { ExecutionRecord } from './ExecutionHistory';
