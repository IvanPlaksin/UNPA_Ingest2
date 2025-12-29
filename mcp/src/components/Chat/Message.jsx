import React from 'react';
import { Box, Paper, Typography } from '@mui/material';

const Message = ({ sender, text }) => {
    const isAi = sender === 'ai';
    return (
        <Box sx={{ display: 'flex', justifyContent: isAi ? 'flex-start' : 'flex-end', mb: 2 }}>
            <Paper
                elevation={1}
                sx={{
                    p: 2,
                    maxWidth: '80%',
                    bgcolor: isAi ? 'background.paper' : 'primary.main',
                    color: isAi ? 'text.primary' : 'primary.contrastText',
                    borderRadius: 2,
                    borderTopLeftRadius: isAi ? 0 : 2,
                    borderTopRightRadius: isAi ? 2 : 0
                }}
            >
                <Typography variant="body1">{text}</Typography>
            </Paper>
        </Box>
    );
};

export default Message;
