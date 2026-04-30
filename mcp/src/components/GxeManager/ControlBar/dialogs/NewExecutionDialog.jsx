import React, { useState, useEffect } from 'react';
import {
  X, Play, Search, Loader2, AlertCircle
} from 'lucide-react';
import { launchExecution } from '../../../../services/gxeManager.service';

import './DialogStyles.css';

const PRIORITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical', description: 'Highest priority, preempts others' },
  { value: 'HIGH', label: 'High', description: 'Important, processed before normal' },
  { value: 'NORMAL', label: 'Normal', description: 'Standard priority (default)' },
  { value: 'LOW', label: 'Low', description: 'Can wait for capacity' },
  { value: 'BACKGROUND', label: 'Background', description: 'Lowest priority, best effort' }
];

const NewExecutionDialog = ({ onClose, onSuccess }) => {
  const [graphId, setGraphId] = useState('');
  const [graphSearch, setGraphSearch] = useState('');
  const [availableGraphs, setAvailableGraphs] = useState([]);
  const [graphsLoading, setGraphsLoading] = useState(true);
  const [inputPayload, setInputPayload] = useState('{}');
  const [payloadError, setPayloadError] = useState(null);
  const [priority, setPriority] = useState('NORMAL');
  const [timeoutSeconds, setTimeoutSeconds] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadGraphs = async () => {
      setGraphsLoading(true);
      try {
        const response = await fetch('/api/v1/graph-catalog?limit=100');
        if (response.ok) {
          const data = await response.json();
          setAvailableGraphs(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load graphs:', err);
      } finally {
        setGraphsLoading(false);
      }
    };
    loadGraphs();
  }, []);

  const filteredGraphs = availableGraphs.filter(g =>
    (g.id || '').toLowerCase().includes(graphSearch.toLowerCase()) ||
    (g.name || '').toLowerCase().includes(graphSearch.toLowerCase())
  );

  const validatePayload = (value) => {
    try {
      JSON.parse(value);
      setPayloadError(null);
      return true;
    } catch (e) {
      setPayloadError('Invalid JSON: ' + e.message);
      return false;
    }
  };

  const handlePayloadChange = (e) => {
    const value = e.target.value;
    setInputPayload(value);
    if (value.trim()) {
      validatePayload(value);
    } else {
      setPayloadError(null);
    }
  };

  const handleSubmit = async () => {
    if (!graphId) {
      setError('Please select a graph');
      return;
    }

    if (inputPayload.trim() && !validatePayload(inputPayload)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = inputPayload.trim() ? JSON.parse(inputPayload) : {};
      const execution = await launchExecution(graphId, payload, {
        priority,
        timeoutSeconds: timeoutSeconds ? parseInt(timeoutSeconds) : undefined
      });
      onSuccess?.(execution);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gxe-dialog-overlay" onClick={onClose}>
      <div className="gxe-dialog gxe-dialog--wide" onClick={e => e.stopPropagation()}>
        <div className="gxe-dialog__header">
          <h2>
            <Play size={20} />
            New Execution
          </h2>
          <button className="gxe-dialog__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="gxe-dialog__body">
          <div className="gxe-dialog__field">
            <label>Select Graph *</label>
            <div className="gxe-dialog__search">
              <Search size={16} />
              <input
                type="text"
                value={graphSearch}
                onChange={e => setGraphSearch(e.target.value)}
                placeholder="Search graphs..."
                className="gxe-dialog__search-input"
              />
            </div>

            <div className="gxe-dialog__graph-list">
              {graphsLoading ? (
                <div className="gxe-dialog__loading">
                  <Loader2 size={16} className="spinning" />
                  Loading graphs...
                </div>
              ) : filteredGraphs.length === 0 ? (
                <div className="gxe-dialog__hint" style={{ padding: 12 }}>No graphs found</div>
              ) : (
                filteredGraphs.slice(0, 10).map(graph => (
                  <label
                    key={graph.id}
                    className={`gxe-dialog__graph-item ${graphId === graph.id ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="graphId"
                      value={graph.id}
                      checked={graphId === graph.id}
                      onChange={() => setGraphId(graph.id)}
                    />
                    <div className="gxe-dialog__graph-info">
                      <span className="gxe-dialog__graph-name">{graph.name || graph.id}</span>
                      {graph.description && (
                        <span className="gxe-dialog__graph-desc">{graph.description}</span>
                      )}
                    </div>
                    <span className="gxe-dialog__graph-version">v{graph.version || '1'}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="gxe-dialog__field">
            <label>Input Payload (JSON)</label>
            <textarea
              value={inputPayload}
              onChange={handlePayloadChange}
              placeholder='{"key": "value"}'
              rows={6}
              className={`gxe-dialog__textarea ${payloadError ? 'error' : ''}`}
            />
            {payloadError && (
              <span className="gxe-dialog__error-hint">{payloadError}</span>
            )}
          </div>

          <div className="gxe-dialog__field">
            <label>Priority</label>
            <select
              className="gxe-dialog__select"
              value={priority}
              onChange={e => setPriority(e.target.value)}
            >
              {PRIORITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>

          <div className="gxe-dialog__field">
            <label>Timeout (seconds, optional)</label>
            <input
              type="number"
              value={timeoutSeconds}
              onChange={e => setTimeoutSeconds(e.target.value)}
              placeholder="No timeout"
              min="1"
              className="gxe-dialog__input"
            />
            <span className="gxe-dialog__hint">
              Leave empty for no timeout. Execution will be cancelled if it exceeds this duration.
            </span>
          </div>

          {error && (
            <div className="gxe-dialog__error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>

        <div className="gxe-dialog__footer">
          <button
            className="gxe-dialog__btn gxe-dialog__btn--secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="gxe-dialog__btn gxe-dialog__btn--primary"
            onClick={handleSubmit}
            disabled={loading || !graphId || !!payloadError}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinning" />
                Launching...
              </>
            ) : (
              <>
                <Play size={16} />
                Launch Execution
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewExecutionDialog;
