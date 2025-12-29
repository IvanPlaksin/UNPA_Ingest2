import React, { useState, useEffect } from 'react';
import { GitCommit, User, Calendar, MessageSquare, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { fetchTfvcHistory } from '../../../services/api';
import ChangesetDetails from './ChangesetDetails';
import { Link } from 'react-router-dom';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Box,
    Typography,
    IconButton,
    Stack,
    CircularProgress,
    Chip
} from '@mui/material';

const ChangesetList = ({ path }) => {
    const [changesets, setChangesets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        if (!path) return;

        const loadHistory = async () => {
            setLoading(true);
            setChangesets([]); // Clear previous results immediately
            try {
                const data = await fetchTfvcHistory(path);
                setChangesets(data);
            } catch (error) {
                console.error("Error loading history:", error);
            } finally {
                setLoading(false);
            }
        };

        loadHistory();
    }, [path]);

    const toggleExpand = (id) => {
        setExpandedId(expandedId === id ? null : id);
    };

    if (!path) {
        return (
            <Box sx={{ p: 2, color: 'text.secondary', textAlign: 'center' }}>
                <Typography variant="body2">Select a file or folder to view history</Typography>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    if (changesets.length === 0) {
        return (
            <Box sx={{ p: 2, color: 'text.secondary', textAlign: 'center' }}>
                <Typography variant="body2">No history found.</Typography>
            </Box>
        );
    }

    return (
        <TableContainer component={Paper} elevation={0} sx={{ height: '100%', overflowY: 'auto', borderRadius: 0 }}>
            <Table stickyHeader size="small">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: 32, bgcolor: 'background.default' }} />
                        <TableCell sx={{ bgcolor: 'background.default', fontWeight: 600 }}>ID</TableCell>
                        <TableCell sx={{ bgcolor: 'background.default', fontWeight: 600 }}>Author</TableCell>
                        <TableCell sx={{ bgcolor: 'background.default', fontWeight: 600 }}>Date</TableCell>
                        <TableCell sx={{ bgcolor: 'background.default', fontWeight: 600 }}>Comment</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {changesets.map((cs) => (
                        <React.Fragment key={cs.changesetId}>
                            <TableRow
                                hover
                                onClick={() => toggleExpand(cs.changesetId)}
                                sx={{
                                    cursor: 'pointer',
                                    bgcolor: expandedId === cs.changesetId ? 'action.selected' : 'inherit',
                                    '&:last-child td, &:last-child th': { border: 0 }
                                }}
                            >
                                <TableCell sx={{ p: 1, textAlign: 'center' }}>
                                    {expandedId === cs.changesetId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <GitCommit size={14} style={{ opacity: 0.5 }} />
                                        <Typography variant="body2" fontFamily="monospace" color="primary.main" fontWeight={500}>
                                            {cs.changesetId}
                                        </Typography>
                                        <IconButton
                                            component={Link}
                                            to={`/nexus/changeset/${cs.changesetId}`}
                                            onClick={(e) => e.stopPropagation()}
                                            size="small"
                                            sx={{ p: 0.5, ml: 1, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                                        >
                                            <ExternalLink size={12} />
                                        </IconButton>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <User size={14} style={{ opacity: 0.5 }} />
                                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                                            {cs.author}
                                        </Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Calendar size={14} style={{ opacity: 0.5 }} />
                                        <Typography variant="body2" textTransform="none" color="text.secondary">
                                            {new Date(cs.date).toLocaleDateString()}
                                        </Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell sx={{ maxWidth: 300 }}>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <MessageSquare size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                                        <Typography variant="body2" noWrap title={cs.comment}>
                                            {cs.comment}
                                        </Typography>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                            {expandedId === cs.changesetId && (
                                <TableRow>
                                    <TableCell colSpan={5} sx={{ p: 0 }}>
                                        <ChangesetDetails changesetId={cs.changesetId} />
                                    </TableCell>
                                </TableRow>
                            )}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

export default ChangesetList;
