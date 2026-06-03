/**
 * ActivityFeed — vertical timeline of recent knowledge events
 *
 * Event types with icons:
 *   UPLOAD    📄 Document uploaded
 *   CLASSIFY  ✅ Document classified
 *   GAP_OPEN  ⚠️  Gap identified
 *   GAP_CLOSED ✅ Gap closed
 *   GAP_UPDATE  ℹ️  Gap updated
 *
 * Props:
 *   activities   array of { type, id, description, namespace, timestamp }
 *   loading      boolean
 *   onActivityClick (activity) => void
 */
import React from 'react';
import { Box, Typography, Stack, Paper, Skeleton, Chip } from '@mui/material';
import { FileText, CheckCircle, AlertTriangle, Info, Upload } from 'lucide-react';

const EVENT_META = {
    UPLOAD:     { Icon: Upload,       color: '#3b82f6', label: 'Upload'   },
    CLASSIFY:   { Icon: CheckCircle,  color: '#14b8a6', label: 'Classify' },
    GAP_OPEN:   { Icon: AlertTriangle, color: '#f59e0b', label: 'Gap'    },
    GAP_CLOSED: { Icon: CheckCircle,  color: '#22c55e', label: 'Closed'  },
    GAP_UPDATE: { Icon: Info,         color: '#94a3b8', label: 'Gap'     }
};

function fmtTs(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
               ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
}

export default function ActivityFeed({ activities = [], loading = false, onActivityClick }) {
    if (loading) {
        return (
            <Box>
                {[1,2,3,4,5].map(i => (
                    <Stack key={i} direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
                        <Skeleton variant="circular" width={28} height={28} />
                        <Box sx={{ flex: 1 }}>
                            <Skeleton width="70%" height={16} />
                            <Skeleton width="40%" height={12} />
                        </Box>
                    </Stack>
                ))}
            </Box>
        );
    }

    if (activities.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography variant="body2" color="text.disabled">No recent activity</Typography>
            </Box>
        );
    }

    return (
        <Box>
            {activities.map((a, idx) => {
                const meta = EVENT_META[a.type] || EVENT_META.GAP_UPDATE;
                const { Icon, color } = meta;
                const isLast = idx === activities.length - 1;
                return (
                    <Stack
                        key={`${a.id}-${idx}`}
                        direction="row"
                        spacing={1.5}
                        sx={{ mb: isLast ? 0 : 1.5, cursor: onActivityClick ? 'pointer' : 'default',
                              '&:hover': onActivityClick ? { opacity: 0.8 } : {} }}
                        onClick={() => onActivityClick?.(a)}
                    >
                        {/* Timeline dot + line */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.25 }}>
                            <Box sx={{
                                width: 28, height: 28, borderRadius: '50%',
                                bgcolor: color + '22',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <Icon size={14} color={color} />
                            </Box>
                            {!isLast && (
                                <Box sx={{ width: 1, flex: 1, bgcolor: 'divider', mt: 0.5, mb: -1 }} />
                            )}
                        </Box>

                        {/* Content */}
                        <Box sx={{ flex: 1, pb: isLast ? 0 : 1.5 }}>
                            <Typography variant="body2" sx={{ fontSize: 12, lineHeight: 1.4 }}>
                                {a.description}
                            </Typography>
                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                                    {fmtTs(a.timestamp)}
                                </Typography>
                                {a.namespace && (
                                    <Chip label={a.namespace} size="small"
                                        sx={{ height: 14, fontSize: 9,
                                              '& .MuiChip-label': { px: 0.75 } }} />
                                )}
                            </Stack>
                        </Box>
                    </Stack>
                );
            })}
        </Box>
    );
}
