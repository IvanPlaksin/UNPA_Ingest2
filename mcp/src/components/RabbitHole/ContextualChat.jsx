import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';

const ContextualChat = ({ filters, visibleItems, visibleColumns, fieldDefinitions, onAIAction, pendingCommand, onCommandHandled }) => {
    const [messages, setMessages] = useState([
        { role: 'assistant', text: "Welcome to the Rabbit Hole. I'm your guide. Ask me to find something, or just complain about the backlog." }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (pendingCommand) {
            handleSend(pendingCommand);
            onCommandHandled();
        }
    }, [pendingCommand]);

    const handleSend = async (textOverride = null) => {
        const textToSend = textOverride || input;
        if (!textToSend.trim()) return;

        const userMessage = { role: 'user', text: textToSend };
        setMessages(prev => [...prev, userMessage]);
        if (!textOverride) setInput('');
        setLoading(true);

        try {
            const response = await fetch('http://localhost:3000/api/v1/rabbithole/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.text,
                    filters: filters,
                    visibleItems: visibleItems,
                    visibleColumns: visibleColumns,
                    fieldDefinitions: fieldDefinitions
                })
            });

            const data = await response.json();

            if (data.error) {
                setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${data.error}` }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: data.text }]);

                if (data.action) {
                    console.log("AI Action:", data.action);
                    onAIAction(data.action);

                    if (data.action.type === 'UPDATE_FILTERS') {
                        setMessages(prev => [...prev, { role: 'system', text: "Filters updated based on your request." }]);
                    } else if (data.action.type === 'UPDATE_COLUMNS') {
                        setMessages(prev => [...prev, { role: 'system', text: "Columns updated based on your request." }]);
                    }
                }
            }
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, { role: 'assistant', text: "I tripped over a root. Connection failed." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e3f2fd', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--un-blue)' }}>
                    <Bot size={16} />
                </div>
                <div>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>Rabbit Hole Guide</h3>
                    <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: 0 }}>AI Assistant</p>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.map((msg, index) => (
                    <div key={index} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '8px', maxWidth: '90%' }}>
                            <div style={{
                                width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: msg.role === 'user' ? 'var(--un-blue)' : '#eee',
                                color: msg.role === 'user' ? 'white' : '#666'
                            }}>
                                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                            </div>
                            <div style={{
                                padding: '8px 12px',
                                borderRadius: 'var(--radius)',
                                fontSize: '12px',
                                lineHeight: '1.4',
                                background: msg.role === 'user' ? 'var(--un-blue)' : (msg.role === 'system' ? '#f8f9fa' : '#f0f0f0'),
                                color: msg.role === 'user' ? 'white' : (msg.role === 'system' ? 'var(--text-secondary)' : 'var(--text-primary)'),
                                border: msg.role === 'system' ? '1px solid var(--border-color)' : 'none',
                                fontStyle: msg.role === 'system' ? 'italic' : 'normal'
                            }}>
                                {msg.text}
                            </div>
                        </div>
                    </div>
                ))}
                {loading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginLeft: '32px' }}>
                        <div style={{ display: 'flex', gap: '4px', padding: '8px', background: '#f0f0f0', borderRadius: 'var(--radius)' }}>
                            <div style={{ width: '6px', height: '6px', background: '#999', borderRadius: '50%', animation: 'bounce 1s infinite 0ms' }}></div>
                            <div style={{ width: '6px', height: '6px', background: '#999', borderRadius: '50%', animation: 'bounce 1s infinite 200ms' }}></div>
                            <div style={{ width: '6px', height: '6px', background: '#999', borderRadius: '50%', animation: 'bounce 1s infinite 400ms' }}></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)', background: '#FAFAFA' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '4px' }}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask the guide..."
                        style={{ flex: 1, border: 'none', outline: 'none', fontSize: '12px', padding: '4px 8px' }}
                        disabled={loading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        style={{
                            background: 'var(--un-blue)', color: 'white', border: 'none', borderRadius: '2px', width: '28px', height: '28px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (loading || !input.trim()) ? 0.5 : 1
                        }}
                    >
                        <Send size={14} />
                    </button>
                </div>
            </div>
            <style>{`
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
            `}</style>
        </div>
    );
};

export default ContextualChat;
