import React, { useRef, useEffect } from 'react';

const ExecutionLog = ({ logs = [] }) => {
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const logIcons = { success: '✓', error: '✗', warning: '⚠', complete: '🎉', info: '•' };

  if (logs.length === 0) return null;

  return (
    <div className="execution-log">
      <div className="execution-log__header">
        <span className="execution-log__title">📋 Execution Log</span>
        <span className="execution-log__count">{logs.length} entries</span>
      </div>
      <div className="execution-log__content">
        {logs.map((log, index) => (
          <div key={index} className={`execution-log__entry execution-log__entry--${log.type || 'info'}`}>
            <span className="execution-log__icon">{logIcons[log.type] || '•'}</span>
            <span className="execution-log__message">{log.message}</span>
            <span className="execution-log__time">
              {new Date(log.timestamp || Date.now()).toLocaleTimeString()}
            </span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default ExecutionLog;
