import React, { useState, useEffect } from 'react';
import TfvcTree from '../components/Knowledge/TFVC/TfvcTree';
import FileViewer from '../components/Knowledge/TFVC/FileViewer';
import ChangesetList from '../components/Knowledge/TFVC/ChangesetList';
import { Folder, FileText, History, ChevronRight } from 'lucide-react';
import { Storage } from '../utils/storage';

const STORAGE_KEY_SELECTION = 'tfvc_selected_item';
const STORAGE_KEY_TAB = 'tfvc_active_tab';

import TfvcBreadcrumbs from '../components/Knowledge/TFVC/TfvcBreadcrumbs';

const TfvcBrowserPage = () => {
    const [selectedItem, setSelectedItem] = useState(() => Storage.load(STORAGE_KEY_SELECTION, null));
    const [activeTab, setActiveTab] = useState(() => Storage.load(STORAGE_KEY_TAB, 'contents'));

    useEffect(() => {
        Storage.save(STORAGE_KEY_SELECTION, selectedItem);
    }, [selectedItem]);

    useEffect(() => {
        Storage.save(STORAGE_KEY_TAB, activeTab);
    }, [activeTab]);

    const handleSelect = (item) => {
        setSelectedItem(item);
        if (item.isFolder) {
            // Optional: could show folder contents in right pane too
        } else {
            setActiveTab('contents');
        }
    };

    const handleBreadcrumbNavigate = (newPath) => {
        // When navigating via breadcrumbs, we assume the target is a folder
        // (unless it's the leaf file, but breadcrumbs usually navigate up)
        handleSelect({ path: newPath, isFolder: true });
    };

    return (
        <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            {/* Header / Breadcrumbs */}
            <TfvcBreadcrumbs
                path={selectedItem?.path}
                onNavigate={handleBreadcrumbNavigate}
            />

            {/* Main Content - Split View */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel - Tree */}
                <div style={{
                    width: '300px',
                    minWidth: '250px',
                    maxWidth: '400px',
                    borderRight: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{
                        padding: '8px 12px',
                        background: '#f8f9fa',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase'
                    }}>
                        Explorer
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
                        <TfvcTree
                            onSelect={handleSelect}
                            selectedPath={selectedItem?.path}
                            persistenceKey="tfvc_tree_main"
                        />
                    </div>
                </div>

                {/* Right Panel - Content/History */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
                    {/* Tabs */}
                    <div style={{
                        display: 'flex',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        paddingLeft: '16px'
                    }}>
                        <button
                            onClick={() => setActiveTab('contents')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '10px 16px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'contents' ? '2px solid var(--un-blue)' : '2px solid transparent',
                                color: activeTab === 'contents' ? 'var(--un-blue)' : 'var(--text-secondary)',
                                fontWeight: 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                borderRadius: 0
                            }}
                        >
                            <FileText size={14} />
                            Contents
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '10px 16px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === 'history' ? '2px solid var(--un-blue)' : '2px solid transparent',
                                color: activeTab === 'history' ? 'var(--un-blue)' : 'var(--text-secondary)',
                                fontWeight: 500,
                                fontSize: '13px',
                                cursor: 'pointer',
                                borderRadius: 0
                            }}
                        >
                            <History size={14} />
                            History
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
                        {activeTab === 'contents' && (
                            selectedItem && !selectedItem.isFolder ? (
                                <div className="card" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                    <FileViewer path={selectedItem.path} />
                                </div>
                            ) : (
                                <div style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    height: '100%', color: 'var(--text-secondary)', opacity: 0.5
                                }}>
                                    <Folder size={48} style={{ marginBottom: '16px' }} />
                                    <p>Select a file to view content</p>
                                </div>
                            )
                        )}
                        {activeTab === 'history' && (
                            <div className="card" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                <ChangesetList path={selectedItem?.path} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TfvcBrowserPage;
