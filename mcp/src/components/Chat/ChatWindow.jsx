import React, { useEffect, useRef } from 'react';
import { useChat } from '../../context/ChatContext';
import Message from './Message';
import { Box, Typography, CircularProgress, Paper, Stack } from '@mui/material';

const ChatWindow = () => {
    const { messages, isLoading } = useChat();
    const endRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <Paper elevation={0} sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default' }}>
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                {messages.map((msg, index) => (
                    <Message key={index} sender={msg.sender} text={msg.text} />
                ))}
                {isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
                        <Paper sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, borderTopLeftRadius: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CircularProgress size={16} />
                                <Typography variant="body2" color="text.secondary">AI is thinking...</Typography>
                            </Stack>
                        </Paper>
                    </Box>
                )}
                <div ref={endRef} />
            </Box>
        </Paper>
    );
};

export default ChatWindow;
