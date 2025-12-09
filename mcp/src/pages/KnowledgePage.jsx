import React, { useState } from 'react';
import { triggerIngestion } from '../services/api';

const KnowledgePage = () => {
    const [status, setStatus] = useState('Idle');

    const handleIngest = async (source) => {
        setStatus(`Processing ${source}...`);
        await triggerIngestion(source);
        setStatus(`Finished ${source}`);
    };

    const btnStyle = {
        padding: '10px 20px',
        border: '1px solid #ccc',
        background: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        fontWeight: '500'
    };

    return (
        <div className="page-content" style={{ padding: '20px', background: '#f9f9f9', height: '100%' }}>
            <h1>Knowledge Base Manager</h1>

            <div className="card" style={{ border: '1px solid #ddd', padding: '20px', marginTop: '20px', borderRadius: '8px', background: 'white' }}>
                <h3>Data Sources</h3>
                <p style={{ color: '#666', marginBottom: '15px' }}>Trigger manual ingestion from connected sources.</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                    <button onClick={() => handleIngest('Email')} style={btnStyle}>Sync Emails</button>
                    <button onClick={() => handleIngest('SharePoint')} style={btnStyle}>Sync Docs</button>
                    <button onClick={() => handleIngest('DevOps')} style={btnStyle}>Sync Work Items</button>
                </div>
                <div style={{ marginTop: '20px', fontWeight: 'bold', color: '#0078d4' }}>
                    Status: {status}
                </div>
            </div>
        </div>
    );
};

export default KnowledgePage;
