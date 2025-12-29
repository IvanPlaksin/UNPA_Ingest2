import React, { useState, useEffect } from 'react';
import { Database, GitBranch, FolderOpen, ToggleLeft, ToggleRight, Check, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Collapse,
    TextField,
    Typography,
    IconButton,
    Chip,
    CircularProgress,
    Stack,
    Paper,
    Divider
} from '@mui/material';
import WorkItemDetails from '../WorkItemDetails';

const SourceSelector = ({ activeSources = [], lockedSources = [], sourceStatus = {}, entityData = {}, onToggleSource, onConfigChange }) => {
    // Local state for configuration inputs
    const [workItemId, setWorkItemId] = useState('');
    const [expandedSources, setExpandedSources] = useState([]);

    // Auto-expand active sources once
    useEffect(() => {
        setExpandedSources(prev => {
            const newActive = activeSources.filter(s => !prev.includes(s));
            return [...prev, ...newActive];
        });
    }, [activeSources]);


    const toggleExpand = (id) => {
        setExpandedSources(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    };

    const SourceItem = ({ id, label, icon: Icon, description, children }) => {
        const isLocked = lockedSources.includes(id);
        const isActive = activeSources.includes(id) || isLocked;
        const isExpanded = expandedSources.includes(id);
        const status = sourceStatus[id];

        return (
            <Paper elevation={0} square sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <ListItem
                    disablePadding
                    secondaryAction={
                        <IconButton
                            edge="end"
                            aria-label="toggle"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isLocked) onToggleSource(id);
                            }}
                            disabled={isLocked}
                            color={isActive ? "primary" : "default"}
                        >
                            {isActive ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                        </IconButton>
                    }
                >
                    <ListItemButton
                        onClick={() => isActive && toggleExpand(id)}
                        selected={isActive}
                        sx={{
                            py: 2,
                            opacity: !isActive && !isLocked ? 0.7 : 1,
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'primary.main' : 'text.disabled' }}>
                            <Icon size={24} />
                        </ListItemIcon>
                        <ListItemText
                            primary={
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography variant="subtitle2" fontWeight="bold">{label}</Typography>
                                    {isLocked && <Chip label="Locked" size="small" sx={{ height: 16, fontSize: '0.6rem' }} />}
                                </Stack>
                            }
                            secondary={description}
                            secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                        />
                        {isActive && (
                            <Box sx={{ mr: 2, color: 'text.secondary', display: 'flex' }}>
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </Box>
                        )}
                    </ListItemButton>
                </ListItem>

                <Collapse in={isActive && isExpanded} timeout="auto" unmountOnExit>
                    <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                        {/* Input Area (if needed) */}
                        {!entityData[id] && id === 'ado' && (
                            <Box mb={2}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Enter Work Item ID..."
                                    value={workItemId}
                                    onChange={(e) => {
                                        setWorkItemId(e.target.value);
                                        if (onConfigChange) onConfigChange({ workItemId: e.target.value });
                                    }}
                                    variant="outlined"
                                />
                            </Box>
                        )}

                        {/* Status Message */}
                        {status && (
                            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                                {status.message !== 'Done.' ? (
                                    <CircularProgress size={14} />
                                ) : (
                                    <Check size={14} color="green" />
                                )}
                                <Typography variant="caption" fontFamily="monospace">{status.message}</Typography>
                            </Box>
                        )}

                        {/* Content Children */}
                        <Box>
                            {children}
                        </Box>
                    </Box>
                </Collapse>
            </Paper>
        );
    };

    return (
        <List sx={{ width: '100%', bgcolor: 'background.paper', p: 0 }}>
            <SourceItem
                id="ado"
                label="Azure DevOps"
                icon={Database}
                description="Work Items, Tasks, Bugs"
            >
                {/* Embedded Work Item Details */}
                {entityData.workItem ? (
                    <Box sx={{ mt: 1, fontSize: '0.7rem' }}>
                        <WorkItemDetails
                            core={entityData.workItem.core}
                            fields={entityData.workItem.fields}
                        />
                    </Box>
                ) : entityData.ado ? (
                    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'primary.light', bgOpacity: 0.1, borderColor: 'primary.main' }}>
                        <Typography variant="body2" fontWeight="bold">
                            {entityData.ado.type || 'Work Item'} {entityData.ado.id}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary" noWrap>
                            {entityData.ado.title || 'Loading details...'}
                        </Typography>
                    </Paper>
                ) : (
                    <Typography variant="caption" color="text.secondary" fontStyle="italic">No Work Item loaded.</Typography>
                )}
            </SourceItem>

            <SourceItem
                id="git"
                label="Git Repositories"
                icon={GitBranch}
                description="Commits, PRs, File Changes"
            >
                {entityData.git ? (
                    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'warning.light', bgOpacity: 0.1, borderColor: 'warning.main' }}>
                        <Typography variant="body2" fontWeight="bold">
                            Commit {entityData.git.id?.substring(0, 8)}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                            {entityData.git.message || 'Loading commit...'}
                        </Typography>
                    </Paper>
                ) : (
                    <Typography variant="caption" color="text.secondary" fontStyle="italic">No Git data loaded.</Typography>
                )}
            </SourceItem>

            <SourceItem
                id="kb"
                label="Knowledge Base"
                icon={FolderOpen}
                description="Vectors, Documentation, Context"
            >
                <Stack spacing={1}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                        <FileText size={14} className="text-gray-400" />
                        <Typography variant="caption">index.ts</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                        <FileText size={14} className="text-gray-400" />
                        <Typography variant="caption">readme.md</Typography>
                    </Box>
                </Stack>
            </SourceItem>
        </List>
    );
};

export default SourceSelector;
