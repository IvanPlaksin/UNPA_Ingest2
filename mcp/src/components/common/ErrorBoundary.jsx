/**
 * ErrorBoundary (PH-004)
 *
 * Catches React rendering errors and displays a user-friendly fallback
 * instead of a blank screen. Supports:
 *   - Two levels: 'component' (inline card) and 'page' (full-page)
 *   - Retry via onReset callback
 *   - Dev-only stack trace
 *   - Error logging hook (onError) for monitoring
 *
 * Usage:
 *   <ErrorBoundary name="Canvas" level="component" onReset={() => reload()}>
 *     <WorkspaceCanvas />
 *   </ErrorBoundary>
 */

import React from 'react';

const styles = {
  container: (level) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: level === 'page' ? 'center' : 'flex-start',
    justifyContent: level === 'page' ? 'center' : 'flex-start',
    padding: level === 'page' ? 40 : 16,
    minHeight: level === 'page' ? '60vh' : 100,
    background: '#1a1a2e',
    borderRadius: level === 'page' ? 0 : 8,
    border: '1px solid #e74c3c33',
    color: '#e2e8f0',
    fontFamily: 'inherit'
  }),
  icon: { fontSize: 32, opacity: 0.5, marginBottom: 8 },
  title: { fontWeight: 600, fontSize: 14, marginBottom: 4 },
  message: { fontSize: 13, color: '#8b949e', marginBottom: 12, maxWidth: 400 },
  btnRow: { display: 'flex', gap: 8 },
  retryBtn: {
    padding: '6px 14px', fontSize: 13, fontWeight: 500, border: 'none',
    borderRadius: 6, cursor: 'pointer', background: '#238636', color: '#fff'
  },
  detailsBtn: {
    padding: '6px 14px', fontSize: 13, fontWeight: 500, border: '1px solid #30363d',
    borderRadius: 6, cursor: 'pointer', background: 'transparent', color: '#8b949e'
  },
  stack: {
    marginTop: 12, padding: 10, background: '#0d1117', borderRadius: 6,
    fontSize: 12, fontFamily: 'monospace', color: '#c9d1d9', overflow: 'auto',
    maxHeight: 200, maxWidth: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    border: '1px solid #30363d'
  }
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary:${this.props.name || 'unnamed'}]`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const level = this.props.level || 'component';
    const name = this.props.name || 'Component';
    const isDev = typeof process !== 'undefined'
      ? process.env?.NODE_ENV === 'development'
      : window?.location?.hostname === 'localhost';

    return (
      <div style={styles.container(level)}>
        <div style={styles.icon}>{level === 'page' ? '💥' : '⚠️'}</div>
        <div style={styles.title}>
          {level === 'page' ? 'Something went wrong' : `${name} encountered an error`}
        </div>
        <div style={styles.message}>
          {this.state.error?.message || 'An unexpected error occurred. You can try again or reload the page.'}
        </div>
        <div style={styles.btnRow}>
          <button style={styles.retryBtn} onClick={this.handleReset}>
            ↻ Retry
          </button>
          {level === 'page' && (
            <button style={styles.detailsBtn} onClick={() => window.location.reload()}>
              Reload page
            </button>
          )}
          {isDev && (
            <button
              style={styles.detailsBtn}
              onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
            >
              {this.state.showDetails ? 'Hide' : 'Show'} details
            </button>
          )}
        </div>
        {this.state.showDetails && isDev && (
          <pre style={styles.stack}>
            {this.state.error?.stack}
            {this.state.errorInfo?.componentStack}
          </pre>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
