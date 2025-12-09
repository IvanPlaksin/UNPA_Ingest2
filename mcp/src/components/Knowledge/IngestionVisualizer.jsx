// mcp/src/components/Knowledge/IngestionVisualizer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { getIngestionStreamUrl } from '../../services/api';
import ProcessStep from './ProcessStep';
import { Database, FileText, Cpu, Network, XCircle } from 'lucide-react';

const IngestionVisualizer = ({ jobId, onClose }) => {
  const [steps, setSteps] = useState({
    extraction: { status: 'pending', data: null },
    refining: { status: 'pending', data: null },
    vectorization: { status: 'pending', data: null },
    structuring: { status: 'pending', data: null },
  });

  const [globalError, setGlobalError] = useState(null); // ⭐ Global Error State
  const [expandedStep, setExpandedStep] = useState('extraction');
  const [logs, setLogs] = useState([]);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    // Сброс состояний при новом JobId
    setGlobalError(null);
    setSteps({
      extraction: { status: 'pending', data: null },
      refining: { status: 'pending', data: null },
      vectorization: { status: 'pending', data: null },
      structuring: { status: 'pending', data: null },
    });

    const url = getIngestionStreamUrl(jobId);
    const evtSource = new EventSource(url);
    eventSourceRef.current = evtSource;

    const handleEvent = (stepName, e) => {
      const payload = JSON.parse(e.data);

      // Если пришла ошибка в шаге
      if (payload.status === 'error') {
        setGlobalError(`Ошибка на этапе ${stepName}: ${payload.data}`);
        evtSource.close(); // ⭐ ОСТАНОВКА ПОТОКА
      }

      updateStep(stepName, payload.status, payload.data);
      if (payload.status === 'running') setExpandedStep(stepName);
    };

    evtSource.addEventListener('log', (e) => {
      const logData = JSON.parse(e.data);
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${logData.message}`]);
    });

    evtSource.addEventListener('step_extraction', (e) => handleEvent('extraction', e));
    evtSource.addEventListener('step_refining', (e) => handleEvent('refining', e));
    evtSource.addEventListener('step_vectorization', (e) => handleEvent('vectorization', e));
    evtSource.addEventListener('step_structuring', (e) => handleEvent('structuring', e));

    // Глобальная ошибка Job Failed
    evtSource.addEventListener('job_failed', (e) => {
      const payload = JSON.parse(e.data);
      setGlobalError(payload.message || "Unknown critical error");
      evtSource.close();
    });

    evtSource.addEventListener('job_complete', () => {
      evtSource.close();
      setLogs(prev => [...prev, "✅ Process Completed Successfully."]);
    });

    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, [jobId]);

  const updateStep = (stepName, status, data) => {
    setSteps(prev => ({
      ...prev,
      [stepName]: { status: status, data: data ? data : prev[stepName].data }
    }));
  };

  return (
    <div className="ingestion-visualizer" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="status-badge active" style={{ fontSize: '12px' }}>JOB #{jobId}</span>
          ETL Pipeline Status
        </h3>
        <button onClick={onClose} className="btn-secondary" style={{ padding: '4px 8px' }}>✕</button>
      </header>

      {/* Error Banner с использованием переменных */}
      {globalError && (
        <div style={{ background: '#fdecea', border: '1px solid var(--status-error)', color: 'var(--status-error)', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <XCircle size={20} />
          <div style={{ fontSize: '13px', fontWeight: 500 }}>{globalError}</div>
        </div>
      )}

      {/* Pipeline Steps - Card Style */}
      <div className="pipeline-container card" style={{ padding: '20px', flex: 1, overflowY: 'auto', border: 'none', boxShadow: 'none', background: 'var(--bg-panel)' }}>
        {Object.entries(steps).map(([key, stepData]) => (
          <ProcessStep
            key={key}
            title={`${key.charAt(0).toUpperCase() + key.slice(1)}`} // Capitalize step name
            icon={
              key === 'extraction' ? Database :
                key === 'refining' ? FileText :
                  key === 'vectorization' ? Cpu :
                    key === 'structuring' ? Network : null
            }
            status={stepData.status}
            data={stepData.data}
            isExpanded={expandedStep === key}
            onToggle={() => setExpandedStep(key)}
          />
        ))}
      </div>

      {/* Logs Console - Terminal Style */}
      <div className="logs-console" style={{
        marginTop: '16px',
        padding: '12px',
        background: '#263238', /* Terminal Dark */
        color: '#ECEFF1',
        fontFamily: "'Consolas', 'Monaco', monospace",
        borderRadius: 'var(--radius-sm)',
        height: '180px',
        overflowY: 'auto',
        fontSize: '12px',
        border: '1px solid #37474F'
      }}>
        {logs.map((log, i) => <div key={i} style={{ marginBottom: '4px', borderBottom: '1px solid #37474F', paddingBottom: '2px' }}>{log}</div>)}
      </div>
    </div>
  );
};

export default IngestionVisualizer;
