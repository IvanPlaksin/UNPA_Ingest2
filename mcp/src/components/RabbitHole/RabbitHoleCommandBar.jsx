import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import {
    Paper,
    InputBase,
    IconButton,
    Stack,
    Typography,
    Divider
} from '@mui/material';

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
        <Paper
            component="form"
            onSubmit={handleSubmit}
            sx={{
                p: '8px 16px',
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                background: 'linear-gradient(to right, #f8f9fa, #ffffff)', // Keep subtle gradient or use theme
                borderRadius: 2
            }}
            variant="outlined"
        >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'primary.main', mr: 2 }}>
                <Sparkles size={18} />
                <Typography variant="body2" fontWeight={600} noWrap>Ask AI:</Typography>
            </Stack>

            <InputBase
                sx={{ flex: 1, fontSize: '0.875rem' }}
                placeholder="e.g., 'Show me high priority bugs in ATS' or 'Add a column for Created By'"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
            />

            <Divider sx={{ height: 28, m: 0.5 }} orientation="vertical" />

            <IconButton
                type="submit"
                color="primary"
                sx={{ p: '10px' }}
                disabled={loading || !input.trim()}
            >
                <ArrowRight size={18} />
            </IconButton>
        </Paper>
    );
};

export default RabbitHoleCommandBar;
