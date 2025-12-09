import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

const RabbitHoleCommandBar = ({ onCommand, loading }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim()) {
            onCommand(input);
            setInput('');
        }
    };

    return (
        <div className="card" style={{ padding: '12px', marginBottom: '16px', background: 'linear-gradient(to right, #f8f9fa, #ffffff)' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--un-blue)' }}>
                    <Sparkles size={16} />
                    <span style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' }}>Ask AI:</span>
                </div>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g., 'Show me high priority bugs in ATS' or 'Add a column for Created By'"
                    style={{
                        flex: 1,
                        height: '36px',
                        padding: '0 12px',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-color)',
                        fontSize: '13px',
                        outline: 'none'
                    }}
                    disabled={loading}
                />
                <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="btn-primary"
                    style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    Go <ArrowRight size={14} />
                </button>
            </form>
        </div>
    );
};

export default RabbitHoleCommandBar;
