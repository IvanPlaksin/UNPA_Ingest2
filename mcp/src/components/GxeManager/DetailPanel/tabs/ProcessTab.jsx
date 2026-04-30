import React, { useMemo, useState, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Clock, Loader2, Hourglass,
  SkipForward, Ban, CircleDot, FileInput, X
} from 'lucide-react';
import FormRenderer from '../../../Forms/FormRenderer';
import { waitingNodeToFormDefinition, extractFormResponse } from '../../../FlowDesk/waitingNodeToForm';
import { resumeExecution } from '../../../../services/gxeManager.service';
import './ProcessTab.css';

const getNodeStatus = (s) => typeof s === 'object' && s !== null ? s.status : s;
const getNodeData = (s) => typeof s === 'object' && s !== null ? s : {};

const STATUS_ICON = {
  SUCCEEDED:     { Icon: CheckCircle2, color: '#22c55e' },
  COMPLETED:     { Icon: CheckCircle2, color: '#22c55e' },
  FAILED:        { Icon: XCircle,      color: '#ef4444' },
  RUNNING:       { Icon: Loader2,      color: '#22d3ee', spin: true },
  EXECUTING:     { Icon: Loader2,      color: '#22d3ee', spin: true },
  WAITING_INPUT: { Icon: Hourglass,    color: '#a78bfa' },
  WAITING:       { Icon: Hourglass,    color: '#a78bfa' },
  SKIPPED:       { Icon: SkipForward,  color: '#71717a' },
  CANCELLED:     { Icon: Ban,          color: '#71717a' },
  PENDING:       { Icon: Clock,        color: '#334155' },
};

/**
 * Build an ordered execution path from nodeStates.
 * Filters out PENDING/SKIPPED/CANCELLED nodes to show the actual execution path.
 */
function buildPath(nodeStates) {
  if (!nodeStates) return [];
  return Object.entries(nodeStates)
    .map(([nodeId, stateOrObj]) => {
      const status = getNodeStatus(stateOrObj);
      const data = getNodeData(stateOrObj);
      return { nodeId, status, ...data };
    })
    .filter(n => !['PENDING', 'READY', 'QUEUED'].includes(n.status));
}

function hasFormData(nodeEntry) {
  return nodeEntry.status === 'WAITING_INPUT' && (
    nodeEntry.waitContext?.formId ||
    nodeEntry.waitContext?.payloadSchema ||
    nodeEntry.waitContext?.expected_inputs ||
    true // WAITING_INPUT always allows text input at minimum
  );
}

// ─── Tree Node Component ─────────────────────────────────────────────
const TreeNode = ({ node, isLast, isCurrent, onFormOpen }) => {
  const cfg = STATUS_ICON[node.status] || STATUS_ICON.PENDING;
  const Icon = cfg.Icon;
  const showForm = node.status === 'WAITING_INPUT' && hasFormData(node);

  return (
    <div className="gxe-process-node">
      {/* Vertical connector line */}
      <div className="gxe-process-node__connector">
        <div className={`gxe-process-node__line ${isLast ? 'last' : ''}`} />
        <div
          className={`gxe-process-node__dot ${isCurrent ? 'current' : ''}`}
          style={{ borderColor: cfg.color, background: isCurrent ? cfg.color : 'transparent' }}
        >
          <Icon size={12} style={{ color: isCurrent ? '#000' : cfg.color }}
            className={cfg.spin ? 'spinning' : ''} />
        </div>
        {!isLast && <div className="gxe-process-node__line" />}
      </div>

      {/* Node content */}
      <div className={`gxe-process-node__body ${isCurrent ? 'current' : ''}`}
        style={{ borderColor: isCurrent ? cfg.color : undefined }}>
        {/* Form button above node */}
        {showForm && (
          <button className="gxe-process-node__form-btn" onClick={() => onFormOpen(node)}
            title="Open input form">
            <FileInput size={14} />
            <span>Input Required</span>
          </button>
        )}
        <div className="gxe-process-node__header">
          <span className="gxe-process-node__id">{node.nodeId}</span>
          <span className="gxe-process-node__status" style={{ color: cfg.color }}>
            {node.status}
          </span>
        </div>
        {node.error && (
          <div className="gxe-process-node__error">{typeof node.error === 'string' ? node.error : node.error.message}</div>
        )}
      </div>
    </div>
  );
};

// ─── Form Dialog ─────────────────────────────────────────────────────
const FormDialog = ({ node, execution, onClose }) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const formDef = useMemo(() => {
    return waitingNodeToFormDefinition({
      nodeId: node.nodeId,
      label: node.nodeId,
      prompt: node.waitContext?.contextMessage || node.waitContext?.prompt || `Input required for ${node.nodeId}`,
      inputType: node.waitContext?.payloadSchema ? 'form' : 'text',
      choices: node.waitContext?.choices,
    });
  }, [node]);

  const handleSubmit = useCallback(async (formData) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = extractFormResponse(formData);
      const resumeToken = node.waitContext?.resumeToken || null;
      await resumeExecution(execution.executionId, { userInput: response, ...formData }, resumeToken);
      setSubmitted(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [node, execution, onClose]);

  return (
    <div className="gxe-form-dialog-overlay" onClick={onClose}>
      <div className="gxe-form-dialog" onClick={e => e.stopPropagation()}>
        <div className="gxe-form-dialog__header">
          <h3>
            <FileInput size={18} />
            Input: {node.nodeId}
          </h3>
          <button className="gxe-form-dialog__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="gxe-form-dialog__body">
          {submitted ? (
            <div className="gxe-form-dialog__success">
              <CheckCircle2 size={32} color="#22c55e" />
              <span>Input submitted successfully</span>
            </div>
          ) : (
            <FormRenderer
              formDefinition={formDef}
              mode="EMBEDDED"
              onSubmit={handleSubmit}
              onCancel={onClose}
              showCancel={true}
              submitLabel={submitting ? 'Submitting...' : 'Submit'}
              disabled={submitting}
            />
          )}
          {submitError && (
            <div className="gxe-form-dialog__error">{submitError}</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main ProcessTab ─────────────────────────────────────────────────
const ProcessTab = ({ execution }) => {
  const [formNode, setFormNode] = useState(null);

  const path = useMemo(() => buildPath(execution?.nodeStates), [execution?.nodeStates]);

  // Find current active node
  const currentNodeId = useMemo(() => {
    if (execution?.currentNodeId) return execution.currentNodeId;
    const active = path.find(n => ['RUNNING', 'EXECUTING', 'WAITING_INPUT', 'WAITING'].includes(n.status));
    return active?.nodeId || null;
  }, [path, execution?.currentNodeId]);

  if (!path.length) {
    return <div className="gxe-tab__empty">No execution path data available</div>;
  }

  return (
    <div className="gxe-tab" style={{ paddingBottom: 32 }}>
      <div className="gxe-tab__section">
        <h4 className="gxe-tab__section-title">Execution Path</h4>
        <div className="gxe-process-tree">
          {path.map((node, idx) => (
            <TreeNode
              key={node.nodeId}
              node={node}
              isLast={idx === path.length - 1}
              isCurrent={node.nodeId === currentNodeId}
              onFormOpen={setFormNode}
            />
          ))}
        </div>
      </div>

      {formNode && (
        <FormDialog
          node={formNode}
          execution={execution}
          onClose={() => setFormNode(null)}
        />
      )}
    </div>
  );
};

export default ProcessTab;
