import React, { useRef, useEffect } from 'react';

const LEVEL_COLORS = {
  info: '#8b949e',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',
  progress: '#58a6ff',
};

const LEVEL_ICONS = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✗',
  progress: '►',
};

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ImportSqlLog({ logs = [], maxHeight = 300 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div
      ref={containerRef}
      style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 6,
        padding: 12,
        maxHeight,
        overflowY: 'auto',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {logs.length === 0 ? (
        <div style={{ color: '#484f58', fontStyle: 'italic' }}>
          Waiting for import to start...
        </div>
      ) : (
        logs.map((log, i) => (
          <div key={i} style={{ color: LEVEL_COLORS[log.level] || '#8b949e', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span style={{ color: '#484f58' }}>[{formatTime(log.timestamp)}]</span>{' '}
            <span>{LEVEL_ICONS[log.level] || '·'}</span>{' '}
            {log.message}
          </div>
        ))
      )}
    </div>
  );
}
