/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Validation Panel
 * Shows graph validation results with clickable error links - Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  Wrench,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  edgeId?: string;
  field?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info?: ValidationIssue[];
}

interface ValidationPanelProps {
  result: ValidationResult | null;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
  onClose?: () => void;
}

// ────────────────────────────────────────────────────────────────────────────
// ISSUE ITEM
// ────────────────────────────────────────────────────────────────────────────

const IssueItem: React.FC<{
  issue: ValidationIssue;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}> = ({ issue, onNodeClick, onEdgeClick }) => {
  const iconConfig = {
    error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
    warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  };

  const config = iconConfig[issue.type];
  const Icon = config.icon;

  const handleClick = () => {
    if (issue.nodeId && onNodeClick) {
      onNodeClick(issue.nodeId);
    } else if (issue.edgeId && onEdgeClick) {
      onEdgeClick(issue.edgeId);
    }
  };

  const hasLink = issue.nodeId || issue.edgeId;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg ${config.bg} ${
        hasLink ? 'cursor-pointer hover:opacity-80' : ''
      }`}
      onClick={hasLink ? handleClick : undefined}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${config.color}`}>{issue.message}</p>

        {issue.field && (
          <p className="text-xs text-[#6e7681] mt-1">
            Field: <span className="font-mono">{issue.field}</span>
          </p>
        )}

        {issue.suggestion && (
          <div className="flex items-center gap-1 mt-2 text-xs text-[#8b949e]">
            <Wrench className="w-3 h-3" />
            <span>{issue.suggestion}</span>
          </div>
        )}

        {hasLink && (
          <div className="flex items-center gap-1 mt-2 text-xs text-blue-400">
            <ChevronRight className="w-3 h-3" />
            <span>Go to {issue.nodeId ? 'node' : 'edge'}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  result,
  onNodeClick,
  onEdgeClick,
  onClose,
}) => {
  if (!result) return null;

  const { valid, errors, warnings, info = [] } = result;
  const totalIssues = errors.length + warnings.length + info.length;

  return (
    <div
      className={`rounded-lg border ${
        valid
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-red-500/10 border-red-500/30'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
        <div className="flex items-center gap-3">
          {valid ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <XCircle className="w-5 h-5 text-red-400" />
          )}
          <div>
            <h3 className={`font-medium ${valid ? 'text-green-400' : 'text-red-400'}`}>
              {valid ? 'Graph is Valid' : 'Validation Failed'}
            </h3>
            <p className="text-xs text-[#8b949e] mt-0.5">
              {totalIssues === 0
                ? 'No issues found'
                : `${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-[#f0f6fc] text-sm"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Issues List */}
      {totalIssues > 0 && (
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
          {/* Errors */}
          {errors.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-red-400 uppercase mb-2">
                Errors ({errors.length})
              </h4>
              <div className="space-y-2">
                {errors.map((error, i) => (
                  <IssueItem
                    key={`error-${i}`}
                    issue={{ ...error, type: 'error' }}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-amber-400 uppercase mb-2">
                Warnings ({warnings.length})
              </h4>
              <div className="space-y-2">
                {warnings.map((warning, i) => (
                  <IssueItem
                    key={`warning-${i}`}
                    issue={{ ...warning, type: 'warning' }}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          {info.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-blue-400 uppercase mb-2">
                Info ({info.length})
              </h4>
              <div className="space-y-2">
                {info.map((item, i) => (
                  <IssueItem
                    key={`info-${i}`}
                    issue={{ ...item, type: 'info' }}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Valid state message */}
      {valid && totalIssues === 0 && (
        <div className="p-4 text-center">
          <p className="text-sm text-green-400">
            Your graph is ready to execute!
          </p>
        </div>
      )}
    </div>
  );
};

export default ValidationPanel;
