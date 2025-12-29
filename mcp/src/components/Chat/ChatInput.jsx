import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Box, TextField, IconButton } from '@mui/material';

const ChatInput = ({ onSend, disabled }) => {
    const [text, setText] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (text.trim() && !disabled) {
            onSend(text);
            setText('');
        }
    };

    return (
        <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
                display: 'flex',
                gap: 1,
                p: 2,
                bgcolor: 'background.paper',
                borderTop: 1,
                borderColor: 'divider'
            }}
        >
            <TextField
                fullWidth
                variant="outlined"
                size="small"
                placeholder="Type a message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={disabled}
                sx={{ bgcolor: 'background.default' }}
            />
            <IconButton
                type="submit"
                color="primary"
                disabled={disabled || !text.trim()}
                sx={{
                    bgcolor: 'primary.main',
                    color: 'white',
                    '&:hover': { bgcolor: 'primary.dark' },
                    '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' }
                }}
            >
                <Send size={20} />
            </IconButton>
        </Box>
    );
};

export default ChatInput;
