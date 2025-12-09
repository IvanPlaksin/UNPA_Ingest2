import React, { useState, useEffect } from 'react';
import { GitCommit, User, Calendar, MessageSquare, ChevronRight, ChevronDown } from 'lucide-react';
import { fetchTfvcHistory } from '../../../services/api';
import ChangesetDetails from './ChangesetDetails';

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
        return <div style={{ padding: '16px', color: 'var(--text-secondary)', textAlign: 'center' }}>Select a file or folder to view history</div>;
    }

    if (loading) {
        return <div style={{ padding: '16px', color: 'var(--text-secondary)', textAlign: 'center' }}>Loading history...</div>;
    }

    if (changesets.length === 0) {
        return <div style={{ padding: '16px', color: 'var(--text-secondary)', textAlign: 'center' }}>No history found.</div>;
    }

    return (
        <div style={{ height: '100%', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ background: '#f8f9fa', color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                        <th style={{ width: '32px', padding: '8px', borderBottom: '1px solid var(--border-color)' }}></th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>ID</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Author</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Date</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Comment</th>
                    </tr>
                </thead>
                <tbody>
                    {changesets.map((cs) => (
                        <React.Fragment key={cs.changesetId}>
                            <tr
                                onClick={() => toggleExpand(cs.changesetId)}
                                style={{
                                    cursor: 'pointer',
                                    backgroundColor: expandedId === cs.changesetId ? '#f1f8ff' : 'transparent',
                                    borderBottom: '1px solid #f0f0f0'
                                }}
                                onMouseEnter={(e) => { if (expandedId !== cs.changesetId) e.currentTarget.style.backgroundColor = '#f8fdff'; }}
                                onMouseLeave={(e) => { if (expandedId !== cs.changesetId) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    {expandedId === cs.changesetId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </td>
                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--un-blue)', fontWeight: 500 }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <GitCommit size={12} style={{ marginRight: '4px', opacity: 0.5 }} />
                                        {cs.changesetId}
                                    </div>
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <User size={12} style={{ marginRight: '4px', opacity: 0.5 }} />
                                        {cs.author}
                                    </div>
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <Calendar size={12} style={{ marginRight: '4px', opacity: 0.5 }} />
                                        {new Date(cs.date).toLocaleDateString()}
                                    </div>
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cs.comment}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <MessageSquare size={12} style={{ marginRight: '4px', opacity: 0.5 }} />
                                        {cs.comment}
                                    </div>
                                </td>
                            </tr>
                            {expandedId === cs.changesetId && (
                                <tr>
                                    <td colSpan="5" style={{ padding: 0, borderBottom: '1px solid var(--border-color)' }}>
                                        <ChangesetDetails changesetId={cs.changesetId} />
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ChangesetList;
