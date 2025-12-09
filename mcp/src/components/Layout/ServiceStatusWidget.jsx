import React, { useState, useEffect } from 'react';
import { Activity, Server, Database, Cpu, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { getHealth } from '../../services/api';

const ServiceStatusWidget = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchStatus = async () => {
        const data = await getHealth();
        if (data) {
            setStatus(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading && !status) return <div className="service-widget loading">Loading status...</div>;
    if (!status) return (
        <div className="service-widget" style={{ padding: '10px', borderTop: '1px solid #eee', fontSize: '12px', color: 'red' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', fontWeight: '600' }}>
                <Activity size={16} /> System Status
            </div>
            <div>Error loading status</div>
        </div>
    );

    const getIcon = (state) => {
        if (state === 'connected' || state === 'active') return <CheckCircle size={14} color="#4caf50" />;
        if (state === 'mocked') return <AlertCircle size={14} color="#ff9800" />;
        return <XCircle size={14} color="#f44336" />;
    };

    return (
        <div className="service-widget" style={{ padding: '10px', borderTop: '1px solid #eee', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', fontWeight: '600', color: '#666' }}>
                <Activity size={16} /> System Status
            </div>

            <div className="status-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Server size={12} /> ADO</span>
                {getIcon(status.ado)}
            </div>

            <div className="status-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Database size={12} /> Redis</span>
                {getIcon(status.redis)}
            </div>

            <div className="status-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Cpu size={12} /> Worker</span>
                {getIcon(status.worker)}
            </div>

            <div style={{ fontSize: '10px', color: '#999', marginTop: '5px', textAlign: 'right' }}>
                Updated: {new Date(status.timestamp).toLocaleTimeString()}
            </div>
        </div>
    );
};

export default ServiceStatusWidget;
