import React, { useState, useEffect } from 'react';
import { Folder, FileCode, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { fetchTfvcTree } from '../../../services/api';
import { Storage } from '../../../utils/storage';

const TreeNode = ({ item, onSelect, selectedPath, level = 0, expandedPaths, onToggle }) => {
    const [children, setChildren] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    const isExpanded = expandedPaths.has(item.path);
    const isSelected = selectedPath === item.path;
    // Add extra indentation for files to distinguish them from folders
    const paddingLeft = `${level * 20 + (item.isFolder ? 0 : 16)}px`;

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
        <div>
            <div
                onClick={handleClick}
                style={{
                    paddingLeft,
                    display: 'flex',
                    alignItems: 'center',
                    paddingTop: '4px',
                    paddingBottom: '4px',
                    paddingRight: '8px',
                    cursor: 'pointer',
                    color: isSelected ? 'var(--un-blue)' : 'var(--text-primary)',
                    fontWeight: isSelected ? 600 : 400,
                    backgroundColor: isSelected ? '#e3f2fd' : 'transparent',
                    fontSize: '13px'
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f1f1f1'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
                <div
                    style={{ marginRight: '4px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={handleExpand}
                >
                    {item.isFolder && (
                        loading ? <Loader2 size={12} className="animate-spin" /> :
                            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                    )}
                </div>
                {item.isFolder ? (
                    <Folder size={16} style={{ marginRight: '8px', color: '#FBC02D' }} />
                ) : (
                    <FileCode size={16} style={{ marginRight: '8px', color: 'var(--un-blue)' }} />
                )}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.path.split('/').pop()}
                </span>
            </div>

            {isExpanded && (
                <div>
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
                        <div style={{ paddingLeft: `${(level + 1) * 20 + 24}px`, fontSize: '12px', color: 'var(--text-secondary)', paddingTop: '4px', paddingBottom: '4px' }}>
                            (Empty)
                        </div>
                    )}
                </div>
            )}
        </div>
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
        return <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}><Loader2 className="animate-spin" style={{ color: 'var(--un-blue)' }} /></div>;
    }

    return (
        <div style={{ overflowY: 'auto', height: '100%' }}>
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
        </div>
    );
};

export default TfvcTree;
