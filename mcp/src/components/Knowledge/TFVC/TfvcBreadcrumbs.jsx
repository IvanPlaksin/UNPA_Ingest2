import React from 'react';
import { Folder, ChevronRight } from 'lucide-react';

const TfvcBreadcrumbs = ({ path, onNavigate }) => {
    // path is like $/ATSBranch/Folder/File
    const parts = path ? path.split('/').filter(p => p) : [];

    const handleBreadcrumbClick = (index) => {
        // Reconstruct path up to the clicked index
        // e.g. if path is $/A/B/C and we click B (index 2 in parts ["$", "A", "B", "C"])
        // we want $/A/B

        // parts array: ["$", "A", "B", "C"]
        // slice(0, index + 1) -> ["$", "A", "B"]
        // join('/') -> "$/A/B"
        // But wait, the first part is "$" which usually doesn't have a leading slash in the split array if we split by '/'
        // "$/A".split('/') -> ["$", "A"]
        // "$".split('/') -> ["$"]

        // Let's verify split behavior:
        // "$/A/B".split('/') -> ["$", "A", "B"]
        // join('/') -> "$/A/B" - Correct.

        const newPath = parts.slice(0, index + 1).join('/');
        if (newPath !== path) {
            onNavigate(newPath);
        }
    };

    return (
        <header style={{
            height: '48px',
            padding: '0 16px',
            background: 'var(--bg-header)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--un-navy)', fontWeight: 500 }}>
                <Folder size={18} />
                <span>TFVC Browser</span>
            </div>

            <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }}></div>

            <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden' }}>
                {path ? (
                    parts.map((part, index) => {
                        const isLast = index === parts.length - 1;
                        return (
                            <React.Fragment key={index}>
                                {index > 0 && <ChevronRight size={14} style={{ margin: '0 4px', color: '#ccc' }} />}
                                <span
                                    onClick={() => !isLast && handleBreadcrumbClick(index)}
                                    style={{
                                        fontWeight: isLast ? 600 : 400,
                                        color: isLast ? 'var(--text-primary)' : 'var(--un-blue)',
                                        cursor: isLast ? 'default' : 'pointer',
                                        textDecoration: isLast ? 'none' : 'underline',
                                        textDecorationColor: 'transparent', // Hide underline by default
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => !isLast && (e.target.style.textDecorationColor = 'var(--un-blue)')}
                                    onMouseLeave={(e) => !isLast && (e.target.style.textDecorationColor = 'transparent')}
                                >
                                    {part}
                                </span>
                            </React.Fragment>
                        );
                    })
                ) : (
                    <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Select a file or folder...</span>
                )}
            </div>
        </header>
    );
};

export default TfvcBreadcrumbs;
