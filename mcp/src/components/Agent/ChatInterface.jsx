import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, FileText, Loader2 } from 'lucide-react';
import {
    Paper,
    Box,
    Typography,
    TextField,
    IconButton,
    Avatar,
    Stack,
    Chip,
    InputAdornment,
    CircularProgress,
    alpha
} from '@mui/material';

const ChatInterface = () => {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hello! I am your UN Project Advisor. How can I help you today?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Create a placeholder for the assistant's message
        const assistantMessage = { role: 'assistant', content: '', sources: [] };
        setMessages(prev => [...prev, assistantMessage]);

        try {
            const response = await fetch('http://localhost:3000/api/v1/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: userMessage.content,
                    history: messages.map(m => ({ role: m.role, content: m.content }))
                }),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '').trim();
                        if (dataStr === '[DONE]') break;

                        try {
                            const data = JSON.parse(dataStr);

                            if (data.type === 'sources') {
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const lastMsg = newMessages[newMessages.length - 1];
                                    lastMsg.sources = data.sources;
                                    return newMessages;
                                });
                            } else if (data.type === 'token') {
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const lastMsg = newMessages[newMessages.length - 1];
                                    lastMsg.content += data.content;
                                    return newMessages;
                                });
                            } else if (data.type === 'error') {
                                console.error("Stream error:", data.message);
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const lastMsg = newMessages[newMessages.length - 1];
                                    lastMsg.content += `\n\n**Error:** ${data.message}`;
                                    return newMessages;
                                });
                            }
                        } catch (e) {
                            console.warn("Error parsing stream chunk", e);
                        }
                    }
                }
            }

        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                lastMsg.content += "\n\n**Error:** Failed to connect to the server.";
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
            {/* Messages Area */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    return (
                        <Box key={idx} sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                            <Box sx={{
                                display: 'flex',
                                flexDirection: isUser ? 'row-reverse' : 'row',
                                gap: 2,
                                maxWidth: '85%'
                            }}>
                                {/* Avatar */}
                                <Avatar
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        bgcolor: isUser ? 'primary.main' : 'secondary.main'
                                    }}
                                >
                                    {isUser ? <User size={18} /> : <Bot size={18} />}
                                </Avatar>

                                {/* Message Bubble */}
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                                    <Paper
                                        elevation={1}
                                        sx={{
                                            p: 2,
                                            borderRadius: 2,
                                            borderTopLeftRadius: isUser ? 2 : 0,
                                            borderTopRightRadius: isUser ? 0 : 2,
                                            bgcolor: isUser ? 'primary.main' : 'background.paper',
                                            color: isUser ? 'primary.contrastText' : 'text.primary',
                                            maxWidth: '100%'
                                        }}
                                    >
                                        {/* Sources (Assistant Only) */}
                                        {!isUser && msg.sources && msg.sources.length > 0 && (
                                            <Box sx={{ mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {msg.sources.map((source, sIdx) => (
                                                    <Chip
                                                        key={sIdx}
                                                        icon={<FileText size={12} />}
                                                        label={`${source.title || 'Unknown'} (${(source.score * 100).toFixed(0)}%)`}
                                                        size="small"
                                                        variant="outlined"
                                                        color="secondary"
                                                        sx={{ fontSize: '0.7rem', height: 20 }}
                                                        component="a"
                                                        href={source.url} // Assuming source has a URL if clickable
                                                        target="_blank"
                                                        clickable
                                                    />
                                                ))}
                                            </Box>
                                        )}

                                        {/* Content */}
                                        <Typography
                                            variant="body1"
                                            component="div"
                                            sx={{
                                                '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
                                                '& a': { color: isUser ? 'inherit' : 'primary.main', textDecoration: 'underline' },
                                                '& pre': { bgcolor: 'rgba(0,0,0,0.1)', p: 1, borderRadius: 1, overflowX: 'auto' },
                                                '& code': { fontFamily: 'monospace' }
                                            }}
                                        >
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                        </Typography>
                                    </Paper>
                                </Box>
                            </Box>
                        </Box>
                    );
                })}

                {isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <Box sx={{ display: 'flex', gap: 2, maxWidth: '85%' }}>
                            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                                <Bot size={18} />
                            </Avatar>
                            <Paper sx={{ p: 2, borderRadius: 2, borderTopLeftRadius: 0, bgcolor: 'background.paper' }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={16} color="inherit" />
                                    <Typography variant="body2" color="text.secondary">Thinking...</Typography>
                                </Stack>
                            </Paper>
                        </Box>
                    </Box>
                )}
                <div ref={messagesEndRef} />
            </Box>

            {/* Input Area */}
            <Paper elevation={3} sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', zIndex: 1 }}>
                <Box sx={{ maxWidth: 'lg', mx: 'auto', display: 'flex', gap: 1 }}>
                    <TextField
                        fullWidth
                        placeholder="Ask about your projects..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        variant="outlined"
                        size="medium"
                        multiline
                        maxRows={4}
                        sx={{
                            '& .MuiOutlinedInput-root': { borderRadius: 3 },
                            bgcolor: 'background.default'
                        }}
                    />
                    <IconButton
                        color="primary"
                        onClick={sendMessage}
                        disabled={isLoading || !input.trim()}
                        sx={{
                            width: 50,
                            height: 50,
                            bgcolor: 'primary.main',
                            color: 'common.white',
                            '&:hover': { bgcolor: 'primary.dark' },
                            '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' }
                        }}
                    >
                        <Send size={20} />
                    </IconButton>
                </Box>
            </Paper>
        </Paper>
    );
};

export default ChatInterface;
