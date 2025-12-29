import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';
import {
    Box,
    Paper,
    Typography,
    Avatar,
    TextField,
    IconButton,
    Stack
} from '@mui/material';

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
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}>
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light' }}>
                    <Bot size={20} className="text-blue-700" />
                </Avatar>
                <Box>
                    <Typography variant="subtitle2" fontWeight={600}>Rabbit Hole Guide</Typography>
                    <Typography variant="caption" color="text.secondary">AI Assistant</Typography>
                </Box>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {messages.map((msg, index) => (
                    <Box key={index} sx={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <Box sx={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 1, maxWidth: '90%' }}>
                            <Avatar sx={{
                                width: 28,
                                height: 28,
                                bgcolor: msg.role === 'user' ? 'primary.main' : 'action.selected',
                                color: msg.role === 'user' ? 'common.white' : 'text.secondary'
                            }}>
                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </Avatar>
                            <Paper
                                variant={msg.role === 'system' ? 'outlined' : 'elevation'}
                                elevation={msg.role === 'system' ? 0 : 1}
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    bgcolor: msg.role === 'user' ? 'primary.main' : (msg.role === 'system' ? 'background.default' : 'background.paper'),
                                    color: msg.role === 'user' ? 'primary.contrastText' : (msg.role === 'system' ? 'text.secondary' : 'text.primary'),
                                    fontSize: '0.875rem',
                                    fontStyle: msg.role === 'system' ? 'italic' : 'normal'
                                }}
                            >
                                <Typography variant="body2">{msg.text}</Typography>
                            </Paper>
                        </Box>
                    </Box>
                ))}
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', ml: 5 }}>
                        <Box sx={{ display: 'flex', gap: 0.5, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                            {[0, 200, 400].map(delay => (
                                <Box key={delay} sx={{
                                    width: 6,
                                    height: 6,
                                    bgcolor: 'text.disabled',
                                    borderRadius: '50%',
                                    animation: `bounce 1s infinite ${delay}ms`
                                }} />
                            ))}
                        </Box>
                    </Box>
                )}
                <div ref={messagesEndRef} />
            </Box>

            <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
                <Paper variant="outlined" component="form"
                    sx={{ p: '2px 4px', display: 'flex', alignItems: 'center', bgcolor: 'background.paper' }}
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                >
                    <TextField
                        variant="standard"
                        fullWidth
                        placeholder="Ask the guide..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={loading}
                        InputProps={{ disableUnderline: true, sx: { px: 1, fontSize: '0.875rem' } }}
                    />
                    <IconButton
                        type="submit"
                        disabled={loading || !input.trim()}
                        color="primary"
                        size="small"
                        sx={{ p: 1 }}
                    >
                        <Send size={18} />
                    </IconButton>
                </Paper>
            </Box>
            <style>{`
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
            `}</style>
        </Box>
    );
};

export default ContextualChat;
