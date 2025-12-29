import React, { useState, useEffect } from 'react';
import { Folder, FileCode, ChevronRight, ChevronDown } from 'lucide-react';
import { fetchTfvcTree } from '../../../services/api';
import { Storage } from '../../../utils/storage';
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Collapse,
    CircularProgress,
    Typography,
    alpha
} from '@mui/material';

const TreeNode = ({ item, onSelect, selectedPath, level = 0, expandedPaths, onToggle }) => {
    const [children, setChildren] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    const isExpanded = expandedPaths.has(item.path);
    const isSelected = selectedPath === item.path;

    // Load children when expanded
    useEffect(() => {
        if (isExpanded && !hasLoaded && !loading && item.isFolder) {
            const loadChildren = async () => {
                setLoading(true);
                try {
                    const data = await fetchTfvcTree(item.path);
                    // Filter out the item itself if returned
                    const childItems = data.filter(child => child.path !== item.path);
                    // Sort: Folders first, then alphabetical by name
                    childItems.sort((a, b) => {
                        if (a.isFolder === b.isFolder) {
                            return a.path.split('/').pop().localeCompare(b.path.split('/').pop());
                        }
                        return a.isFolder ? -1 : 1;
                    });
                    setChildren(childItems);
                    setHasLoaded(true);
                } catch (error) {
                    console.error("Error loading tree node:", error);
                } finally {
                    setLoading(false);
                }
            };
            loadChildren();
        }
    }, [isExpanded, hasLoaded, loading, item.path, item.isFolder]);

    const handleExpand = (e) => {
        e.stopPropagation();
        if (!item.isFolder) return;
        onToggle(item.path);
    };

    const handleClick = () => {
        onSelect(item);
        if (item.isFolder && !isExpanded) {
            onToggle(item.path);
        }
    };

    return (
        <Box>
            <ListItemButton
                onClick={handleClick}
                selected={isSelected}
                sx={{
                    pl: level * 2 + (item.isFolder ? 0 : 2), // Adjust padding based on level
                    pr: 1,
                    py: 0.5,
                    minHeight: 32,
                    '&.Mui-selected': {
                        bgcolor: 'primary.lighter',
                        color: 'primary.main',
                        '&:hover': {
                            bgcolor: 'primary.lighter',
                        },
                        borderLeft: 3,
                        borderLeftColor: 'primary.main',
                        paddingLeft: `${level * 16 + (item.isFolder ? 0 : 16) - 3}px` // Compensate for border
                    },
                    '&:hover': {
                        bgcolor: 'action.hover'
                    }
                }}
            >
                {/* Expand/Collapse Icon */}
                <Box
                    component="span"
                    onClick={handleExpand}
                    sx={{
                        display: 'inline-flex',
                        mr: 0.5,
                        width: 20,
                        height: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        '&:hover': { bgcolor: 'action.selected' },
                        visibility: item.isFolder ? 'visible' : 'hidden'
                    }}
                >
                    {loading ? (
                        <CircularProgress size={12} color="inherit" />
                    ) : (
                        isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                </Box>

                {/* File/Folder Icon */}
                <ListItemIcon sx={{ minWidth: 24, color: item.isFolder ? '#FBC02D' : 'primary.main' }}>
                    {item.isFolder ? <Folder size={16} /> : <FileCode size={16} />}
                </ListItemIcon>

                {/* Label */}
                <ListItemText
                    primary={item.path.split('/').pop()}
                    primaryTypographyProps={{
                        variant: 'body2',
                        noWrap: true,
                        fontWeight: isSelected ? 600 : 400,
                        fontSize: '0.8125rem'
                    }}
                />
            </ListItemButton>

            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                    {children.map(child => (
                        <TreeNode
                            key={child.path}
                            item={child}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                            level={level + 1}
                            expandedPaths={expandedPaths}
                            onToggle={onToggle}
                        />
                    ))}
                    {children.length === 0 && hasLoaded && (
                        <ListItem sx={{ pl: (level + 2) * 2 }}>
                            <ListItemText
                                primary="(Empty)"
                                primaryTypographyProps={{ variant: 'caption', color: 'text.secondary', fontStyle: 'italic' }}
                            />
                        </ListItem>
                    )}
                </List>
            </Collapse>
        </Box>
    );
};

const TfvcTree = ({ onSelect, selectedPath, persistenceKey = 'tfvc_tree_expanded' }) => {
    const [rootItems, setRootItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Initialize expanded paths from storage
    const [expandedPaths, setExpandedPaths] = useState(() => {
        const saved = Storage.load(persistenceKey, []);
        return new Set(saved);
    });

    // Save to storage whenever expandedPaths changes
    useEffect(() => {
        Storage.save(persistenceKey, Array.from(expandedPaths));
    }, [expandedPaths, persistenceKey]);

    const handleToggle = (path) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    useEffect(() => {
        const loadRoot = async () => {
            try {
                // Start with root
                const rootPath = "$/ATSBranch";
                const data = await fetchTfvcTree(rootPath);

                // Ensure root is expanded by default if it's the first load
                setExpandedPaths(prev => {
                    if (prev.size === 0) {
                        const next = new Set(prev);
                        next.add(rootPath);
                        return next;
                    }
                    return prev;
                });

                // Check if root exists in data
                const rootNode = data.find(i => i.path === rootPath);
                if (rootNode) {
                    setRootItems([rootNode]);
                } else {
                    // Fallback if API behaves differently
                    setRootItems([{ path: rootPath, isFolder: true }]);
                }
            } catch (error) {
                console.error("Error loading root:", error);
            } finally {
                setLoading(false);
            }
        };
        loadRoot();
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    return (
        <Box sx={{ overflowY: 'auto', height: '100%' }}>
            <List component="nav" disablePadding>
                {rootItems.map(item => (
                    <TreeNode
                        key={item.path}
                        item={item}
                        onSelect={onSelect}
                        selectedPath={selectedPath}
                        expandedPaths={expandedPaths}
                        onToggle={handleToggle}
                    />
                ))}
            </List>
        </Box>
    );
};

export default TfvcTree;
