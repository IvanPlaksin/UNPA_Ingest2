import React from 'react';
import KnowledgeGraphViewer from '../components/KnowledgeGraph/KnowledgeGraphViewer';

const KnowledgeGraphPage = () => {
    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <KnowledgeGraphViewer />
        </div>
    );
};

export default KnowledgeGraphPage;
