/**
 * NodeVersionHistory Component
 * UN ProjectAdvisor - Version lineage visualization
 *
 * Features:
 * - Timeline visualization of version history
 * - Chain integrity verification display
 * - Status and change type indicators
 * - Clickable version selection
 */

import React, { useState, useEffect } from 'react';

interface NodeVersion {
  versionId: string;
  entityId: string;
  versionName: string;
  status: string;
  changeType: string;
  changeReason: string;
  changedBy: string;
  ttStart: string;
  vtStart: string;
  contentHash: string;
  properties: Record<string, unknown>;
}

interface NodeVersionHistoryProps {
  entityId: string;
  apiBaseUrl?: string;
  onVersionSelect?: (version: NodeVersion) => void;
}

export const NodeVersionHistory: React.FC<NodeVersionHistoryProps> = ({
  entityId,
  apiBaseUrl = '/api/v1/graph',
  onVersionSelect
}) => {
  const [versions, setVersions] = useState<NodeVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  useEffect(() => {
    fetchLineage();
    verifyChain();
  }, [entityId]);

  const fetchLineage = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/nodes/${entityId}/lineage`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setVersions(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const verifyChain = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/nodes/${entityId}/verify-chain`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setChainValid(data.data.valid);
      }
    } catch (err) {
      console.error('Failed to verify chain:', err);
    }
  };

  const handleVersionClick = (version: NodeVersion) => {
    setSelectedVersion(version.versionId);
    onVersionSelect?.(version);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: '#10b981',
      SUPERSEDED: '#6b7280',
      DEPRECATED: '#f59e0b',
      MERGED: '#8b5cf6',
      DELETED: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  const getChangeTypeIcon = (changeType: string) => {
    const icons: Record<string, string> = {
      CREATE: '✨',
      UPDATE: '📝',
      DEPRECATE: '🚫',
      MERGE: '🔀',
      SPLIT: '✂️',
      RESTORE: '♻️'
    };
    return icons[changeType] || '•';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return <div className="version-history-loading">Loading version history...</div>;
  }

  if (error) {
    return <div className="version-history-error">{error}</div>;
  }

  return (
    <div className="version-history">
      <div className="history-header">
        <h3>Version History</h3>
        <div className={`chain-status ${chainValid ? 'valid' : 'invalid'}`}>
          {chainValid === null ? '...' : chainValid ? '🔒 Chain Valid' : '⚠️ Chain Broken'}
        </div>
      </div>

      <div className="timeline">
        {versions.map((version, index) => (
          <div
            key={version.versionId}
            className={`timeline-item ${selectedVersion === version.versionId ? 'selected' : ''}`}
            onClick={() => handleVersionClick(version)}
          >
            <div className="timeline-connector">
              <div className="timeline-dot" style={{ backgroundColor: getStatusColor(version.status) }} />
              {index < versions.length - 1 && <div className="timeline-line" />}
            </div>

            <div className="timeline-content">
              <div className="version-header">
                <span className="change-type-icon">{getChangeTypeIcon(version.changeType)}</span>
                <span className="version-name">{version.versionName}</span>
                <span className="status-badge" style={{ backgroundColor: getStatusColor(version.status) }}>
                  {version.status}
                </span>
              </div>

              <div className="version-meta">
                <span className="meta-item">
                  <span className="meta-label">By:</span> {version.changedBy}
                </span>
                <span className="meta-item">
                  <span className="meta-label">At:</span> {formatDate(version.ttStart)}
                </span>
              </div>

              <div className="version-reason">{version.changeReason}</div>

              <div className="version-hash" title={version.contentHash}>
                Hash: {version.contentHash.substring(0, 12)}...
              </div>
            </div>
          </div>
        ))}
      </div>

      {versions.length === 0 && (
        <div className="no-versions">No version history available</div>
      )}

      <style>{`
        .version-history {
          background: #1f2937;
          border-radius: 12px;
          padding: 20px;
          color: #f3f4f6;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .history-header h3 {
          margin: 0;
        }

        .chain-status {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .chain-status.valid {
          background: #065f46;
          color: #10b981;
        }

        .chain-status.invalid {
          background: #7f1d1d;
          color: #f87171;
        }

        .timeline {
          position: relative;
        }

        .timeline-item {
          display: flex;
          gap: 16px;
          cursor: pointer;
          padding: 8px;
          border-radius: 8px;
          transition: background 0.2s;
        }

        .timeline-item:hover {
          background: #374151;
        }

        .timeline-item.selected {
          background: #374151;
          border: 1px solid #6b7280;
        }

        .timeline-connector {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 20px;
        }

        .timeline-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .timeline-line {
          width: 2px;
          flex-grow: 1;
          background: #4b5563;
          min-height: 40px;
        }

        .timeline-content {
          flex: 1;
          padding-bottom: 16px;
        }

        .version-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .change-type-icon {
          font-size: 1rem;
        }

        .version-name {
          font-weight: 600;
          font-family: monospace;
          font-size: 0.875rem;
        }

        .status-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .version-meta {
          display: flex;
          gap: 16px;
          font-size: 0.75rem;
          color: #9ca3af;
          margin-bottom: 4px;
        }

        .meta-label {
          color: #6b7280;
        }

        .version-reason {
          font-size: 0.875rem;
          color: #d1d5db;
          margin-bottom: 4px;
        }

        .version-hash {
          font-family: monospace;
          font-size: 0.75rem;
          color: #6b7280;
        }

        .no-versions {
          text-align: center;
          color: #6b7280;
          padding: 24px;
        }

        .version-history-loading, .version-history-error {
          padding: 24px;
          text-align: center;
          color: #9ca3af;
        }

        .version-history-error {
          color: #f87171;
        }
      `}</style>
    </div>
  );
};

export default NodeVersionHistory;
