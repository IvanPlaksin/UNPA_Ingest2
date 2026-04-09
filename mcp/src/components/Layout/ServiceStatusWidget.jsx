import React, { useState, useEffect } from 'react';
import { Activity, Server, Database, Cpu, Cloud, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getHealth } from '../../services/api';
import { Box, Paper, Typography, Stack, CircularProgress, Collapse, IconButton } from '@mui/material';

const ServiceStatusWidget = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

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

    // Вычисляем общее состояние системы для пиктограммы в заголовке
    const getOverallStatus = () => {
        if (!status) return 'error';
        const states = [status.ado, status.redis, status.worker];
        if (states.some(s => s === 'disconnected' || s === 'error')) return 'error';
        if (states.some(s => s === 'mocked')) return 'warning';
        return 'ok';
    };

    const getOverallIcon = () => {
        const overall = getOverallStatus();
        if (overall === 'ok') return <CheckCircle size={14} color="#4caf50" />;
        if (overall === 'warning') return <AlertCircle size={14} color="#ff9800" />;
        return <XCircle size={14} color="#f44336" />;
    };

    // Мини-индикаторы для свёрнутого состояния
    const getMiniIndicators = () => {
        if (!status) return null;
        const services = [
            { key: 'ado', state: status.ado },
            { key: 'redis', state: status.redis },
            { key: 'worker', state: status.worker },
        ];
        return (
            <Stack direction="row" spacing={0.3}>
                {services.map(s => {
                    const color = s.state === 'connected' || s.state === 'active'
                        ? '#4caf50'
                        : s.state === 'mocked'
                            ? '#ff9800'
                            : '#f44336';
                    return (
                        <Box
                            key={s.key}
                            sx={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                bgcolor: color,
                            }}
                        />
                    );
                })}
            </Stack>
        );
    };

    if (loading && !status) return (
        <Paper variant="outlined" sx={{ bgcolor: 'background.default', overflow: 'hidden' }}>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 2, py: 1 }}
            >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'text.secondary' }}>
                    <Activity size={16} />
                    <Typography variant="subtitle2" fontWeight="bold">System Status</Typography>
                </Stack>
                <CircularProgress size={14} />
            </Stack>
        </Paper>
    );

    if (!status) return (
        <Paper variant="outlined" sx={{ bgcolor: 'background.default', overflow: 'hidden', borderColor: 'error.main' }}>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 2, py: 1 }}
            >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'error.main' }}>
                    <Activity size={16} />
                    <Typography variant="subtitle2" fontWeight="bold">System Status</Typography>
                </Stack>
                <XCircle size={14} color="#f44336" />
            </Stack>
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
        <Paper variant="outlined" sx={{ bgcolor: 'background.default', overflow: 'hidden' }}>
            {/* Кликабельный заголовок */}
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{
                    px: 2,
                    py: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'text.secondary' }}>
                    <Activity size={16} />
                    <Typography variant="subtitle2" fontWeight="bold">System Status</Typography>
                    {/* Пиктограмма общего состояния */}
                    {getOverallIcon()}
                    {/* Мини-индикаторы когда свёрнуто */}
                    {!expanded && getMiniIndicators()}
                </Stack>
                <IconButton size="small" sx={{ p: 0.5 }}>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </IconButton>
            </Stack>

            {/* Коллапсирующее содержимое */}
            <Collapse in={expanded}>
                <Box sx={{ px: 2, pb: 1.5 }}>
                    <StatusItem label="DevOps Server" icon={Cloud} state={status.ado} />
                    <StatusItem label="Redis" icon={Database} state={status.redis} />
                    <StatusItem label="Worker" icon={Cpu} state={status.worker} />

                    <Typography variant="caption" display="block" textAlign="right" color="text.disabled" sx={{ mt: 1, fontSize: '0.65rem' }}>
                        Updated: {new Date(status.timestamp).toLocaleTimeString()}
                    </Typography>
                </Box>
            </Collapse>
        </Paper>
    );
};

export default ServiceStatusWidget;
