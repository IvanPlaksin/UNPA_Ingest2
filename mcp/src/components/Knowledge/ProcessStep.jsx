import React from 'react';
import { CheckCircle, Circle, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

const ProcessStep = ({ title, status, data, error, icon: Icon, isExpanded, onToggle }) => {
    // status: 'pending' | 'running' | 'completed' | 'error'

    const getStatusColor = () => {
        switch (status) {
            case 'running': return 'text-blue-600';
            case 'completed': return 'text-green-600';
            case 'error': return 'text-red-600';
            default: return 'text-gray-400';
        }
    };

    const getStatusIcon = () => {
        switch (status) {
            case 'running': return <Loader2 className="animate-spin" size={20} />;
            case 'completed': return <CheckCircle size={20} />;
            case 'error': return <AlertCircle size={20} />;
            default: return <Circle size={20} />;
        }
    };

    return (
        <div className="process-step" style={{ borderLeft: '2px solid #eee', paddingLeft: '20px', paddingBottom: '20px', position: 'relative' }}>
            {/* Line Connector Dot */}
            <div style={{ position: 'absolute', left: '-11px', top: '0', background: 'white', padding: '2px' }} className={getStatusColor()}>
                {getStatusIcon()}
            </div>

            {/* Header */}
            <div
                onClick={onToggle}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '10px' }}
            >
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', flex: 1 }}>{title}</h3>
                <span style={{ fontSize: '12px', color: '#888', marginRight: '10px' }}>
                    {status.toUpperCase()}
                </span>
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>

            {/* Content / Data Visualization */}
            {isExpanded && (data || error) && (
                <div className="step-content" style={{ background: '#f8f9fa', borderRadius: '6px', padding: '15px', fontSize: '13px', overflowX: 'auto' }}>
                    {error && (
                        <div style={{ color: '#d32f2f', marginBottom: '10px', padding: '10px', background: '#ffebee', borderRadius: '4px' }}>
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    {data && (
                        <pre style={{ margin: 0, fontFamily: 'monospace', color: '#333' }}>
                            {typeof data === 'object' ? JSON.stringify(data, null, 2) : data}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
};

export default ProcessStep;
