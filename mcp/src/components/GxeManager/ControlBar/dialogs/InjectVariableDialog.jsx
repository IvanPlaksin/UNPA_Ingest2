import React, { useState, useEffect } from 'react';
import {
  X, Edit3, AlertTriangle,
  Loader2, AlertCircle, Plus
} from 'lucide-react';
import { injectVariable, fetchVariables } from '../../../../services/gxeManager.service';

import './DialogStyles.css';

const InjectVariableDialog = ({ execution, onClose }) => {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [valueType, setValueType] = useState('string');
  const [reason, setReason] = useState('');
  const [existingVariables, setExistingVariables] = useState({});
  const [loading, setLoading] = useState(false);
  const [varsLoading, setVarsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadVariables = async () => {
      setVarsLoading(true);
      try {
        const vars = await fetchVariables(execution.executionId);
        setExistingVariables(vars);
      } catch (err) {
        console.error('Failed to load variables:', err);
      } finally {
        setVarsLoading(false);
      }
    };
    loadVariables();
  }, [execution.executionId]);

  const parseValue = () => {
    switch (valueType) {
      case 'json':
        return JSON.parse(value);
      case 'number':
        return Number(value);
      case 'boolean':
        return value.toLowerCase() === 'true';
      default:
        return value;
    }
  };

  const validateValue = () => {
    if (!value) return true;
    if (valueType === 'json') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    if (valueType === 'number') {
      return !isNaN(Number(value));
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!key.trim()) {
      setError('Variable key is required');
      return;
    }
    if (!reason || reason.length < 10) {
      setError('Reason must be at least 10 characters');
      return;
    }
    if (!validateValue()) {
      setError(`Invalid ${valueType} value`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const parsedValue = parseValue();
      await injectVariable(
        execution.executionId,
        key.trim(),
        parsedValue,
        reason
      );
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isKeyExisting = key && key in existingVariables;
  const isReasonValid = reason.length >= 10;
  const isValueValid = validateValue();

  return (
    <div className="gxe-dialog-overlay" onClick={onClose}>
      <div className="gxe-dialog" onClick={e => e.stopPropagation()}>
        <div className="gxe-dialog__header">
          <h2>
            <Edit3 size={20} />
            Inject Variable
          </h2>
          <button className="gxe-dialog__close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="gxe-dialog__body">
          <div className="gxe-dialog__warning">
            <AlertTriangle size={16} />
            <div>
              Injecting a variable will modify the execution context. The change will
              be visible to all subsequent nodes.
            </div>
          </div>

          {!varsLoading && Object.keys(existingVariables).length > 0 && (
            <div className="gxe-dialog__field">
              <label>Existing Variables</label>
              <div className="gxe-dialog__node-list">
                {Object.keys(existingVariables).map(varKey => (
                  <button
                    key={varKey}
                    className="gxe-dialog__node-tag"
                    onClick={() => {
                      setKey(varKey);
                      const val = existingVariables[varKey];
                      if (typeof val === 'object') {
                        setValueType('json');
                        setValue(JSON.stringify(val, null, 2));
                      } else if (typeof val === 'number') {
                        setValueType('number');
                        setValue(String(val));
                      } else if (typeof val === 'boolean') {
                        setValueType('boolean');
                        setValue(String(val));
                      } else {
                        setValueType('string');
                        setValue(String(val));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {varKey}
                  </button>
                ))}
              </div>
              <span className="gxe-dialog__hint">Click to edit an existing variable</span>
            </div>
          )}

          <div className="gxe-dialog__field">
            <label>Variable Key *</label>
            <input
              type="text"
              value={key}
              onChange={e => { setKey(e.target.value); setError(null); }}
              placeholder="e.g., approvalStatus"
              className="gxe-dialog__input"
            />
            {isKeyExisting && (
              <span className="gxe-dialog__hint" style={{ color: 'var(--nexus-warning)' }}>
                This will overwrite the existing value
              </span>
            )}
          </div>

          <div className="gxe-dialog__field">
            <label>Value Type</label>
            <select
              className="gxe-dialog__select"
              value={valueType}
              onChange={e => setValueType(e.target.value)}
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="json">JSON Object</option>
            </select>
          </div>

          <div className="gxe-dialog__field">
            <label>Value *</label>
            {valueType === 'json' ? (
              <textarea
                value={value}
                onChange={e => { setValue(e.target.value); setError(null); }}
                placeholder='{"key": "value"}'
                rows={4}
                className={`gxe-dialog__textarea ${!isValueValid && value ? 'error' : ''}`}
              />
            ) : valueType === 'boolean' ? (
              <select
                className="gxe-dialog__select"
                value={value}
                onChange={e => setValue(e.target.value)}
              >
                <option value="">Select...</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type={valueType === 'number' ? 'number' : 'text'}
                value={value}
                onChange={e => { setValue(e.target.value); setError(null); }}
                placeholder={valueType === 'number' ? '0' : 'Value...'}
                className={`gxe-dialog__input ${!isValueValid && value ? 'error' : ''}`}
              />
            )}
            {!isValueValid && value && (
              <span className="gxe-dialog__error-hint">Invalid {valueType} format</span>
            )}
          </div>

          <div className="gxe-dialog__field">
            <label>Reason (required, min 10 characters) *</label>
            <input
              type="text"
              value={reason}
              onChange={e => { setReason(e.target.value); setError(null); }}
              placeholder="e.g., Setting override value per ticket #12345"
              className="gxe-dialog__input"
            />
            <span className="gxe-dialog__hint">
              {reason.length}/10 characters minimum
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
            disabled={loading || !key.trim() || !isReasonValid || !isValueValid || !value}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinning" />
                Injecting...
              </>
            ) : (
              <>
                <Plus size={16} />
                Inject Variable
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InjectVariableDialog;
