import React, { useState, useEffect } from 'react';
import { Activity, Server, Database, Cpu, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { getHealth } from '../../services/api';
import { Box, Paper, Typography, Stack, CircularProgress } from '@mui/material';

const ServiceStatusWidget = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchStatus = async () => {
        try {
            const data = await getHealth();
            if (data) {
                setStatus(data);
            }
        } catch (e) {
            console.error("Health check failed", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading && !status) return <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>;

    if (!status) return (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'error.main', bgcolor: 'error.lighter' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'error.main', mb: 1 }}>
                <Activity size={16} />
                <Typography variant="subtitle2" fontWeight="bold">System Status</Typography>
            </Stack>
            <Typography variant="caption" color="error">Error loading status</Typography>
        </Paper>
    );

    const getIcon = (state) => {
        if (state === 'connected' || state === 'active') return <CheckCircle size={14} color="#4caf50" />;
        if (state === 'mocked') return <AlertCircle size={14} color="#ff9800" />;
        return <XCircle size={14} color="#f44336" />;
    };

    const StatusItem = ({ label, icon: Icon, state }) => (
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 0.5 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <Icon size={12} className="text-gray-500" />
                <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Stack>
            {getIcon(state)}
        </Stack>
    );

    return (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, color: 'text.secondary' }}>
                <Activity size={16} />
                <Typography variant="subtitle2" fontWeight="bold">System Status</Typography>
            </Stack>

            <StatusItem label="ADO" icon={Server} state={status.ado} />
            <StatusItem label="Redis" icon={Database} state={status.redis} />
            <StatusItem label="Worker" icon={Cpu} state={status.worker} />

            <Typography variant="caption" display="block" textAlign="right" color="text.disabled" sx={{ mt: 1, fontSize: '0.65rem' }}>
                Updated: {new Date(status.timestamp).toLocaleTimeString()}
            </Typography>
        </Paper>
    );
};

export default ServiceStatusWidget;
