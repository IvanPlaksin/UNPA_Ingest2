import React from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

const WorkItemsTable = ({ items, page, pageSize, onNextPage, onPrevPage, visibleColumns, fieldDefinitions }) => {
    return (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
                <table>
                    <thead>
                        <tr>
                            {visibleColumns.map(col => (
                                <th key={col} style={{ whiteSpace: 'nowrap' }}>
                                    {fieldDefinitions[col]?.label || col}
                                </th>
                            ))}
                            <th style={{ width: '80px', textAlign: 'right' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => (
                            <tr key={item.id}>
                                {visibleColumns.map(col => (
                                    <td key={col}>
                                        {col === 'System.Title' ? (
                                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }} title={item.fields[col]}>
                                                {item.fields[col]}
                                            </div>
                                        ) : col === 'System.State' ? (
                                            <span className={`status-badge ${item.fields[col]?.toLowerCase()}`}>
                                                {item.fields[col]}
                                            </span>
                                        ) : (
                                            typeof item.fields[col] === 'object' && item.fields[col] !== null ? (
                                                item.fields[col].displayName || JSON.stringify(item.fields[col])
                                            ) : (
                                                item.fields[col]
                                            )
                                        )}
                                    </td>
                                ))}
                                <td style={{ textAlign: 'right' }}>
                                    <Link
                                        to={`/nexus/workitem/${item.id}`}
                                        className="btn-secondary"
                                        style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '11px' }}
                                    >
                                        Nexus <ExternalLink size={10} />
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid var(--border-color)', background: '#FAFAFA' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Page {page}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={onPrevPage}
                        disabled={page === 1}
                        className="btn-secondary"
                        style={{ padding: '4px 8px' }}
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        onClick={onNextPage}
                        disabled={items.length < pageSize}
                        className="btn-secondary"
                        style={{ padding: '4px 8px' }}
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WorkItemsTable;
