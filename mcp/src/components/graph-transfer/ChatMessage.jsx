/**
 * ChatMessage — one turn in the Export Assistant conversation. Renders the
 * assistant's tool calls (ToolCallCard, aligned with results by order) and the
 * markdown text (GFM tables/lists), user turns as plain bubbles.
 */

import { Box, Typography, Paper, Avatar } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ToolCallCard from './ToolCallCard';

const mdSx = {
    '& p': { m: 0, mb: 1 }, '& p:last-child': { mb: 0 },
    '& ul, & ol': { m: 0, pl: 2.5 },
    '& pre': { overflow: 'auto', bgcolor: 'grey.900', color: 'grey.100', p: 1, borderRadius: 1, fontSize: '0.8rem' },
    '& code': { bgcolor: 'action.selected', px: 0.5, borderRadius: 0.5, fontSize: '0.85em' },
    '& table': { borderCollapse: 'collapse', width: '100%', my: 1 },
    '& th, & td': { border: '1px solid', borderColor: 'divider', p: 0.5, fontSize: '0.82rem' },
    '& th': { bgcolor: 'action.hover' },
};

export default function ChatMessage({ message }) {
    const { role, content, toolCalls, toolResults } = message;
    const isUser = role === 'user';

    return (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexDirection: isUser ? 'row-reverse' : 'row' }}>
            <Avatar sx={{ width: 30, height: 30, bgcolor: isUser ? 'primary.main' : 'secondary.main' }}>
                {isUser ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
            </Avatar>
            <Box sx={{ flex: 1, maxWidth: '85%', minWidth: 0 }}>
                <Paper elevation={0} sx={{ p: 1.5, bgcolor: isUser ? 'primary.dark' : 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
                    {(toolCalls || []).map((tc, i) => (
                        <ToolCallCard key={i} tool={tc.name} input={tc.input}
                            result={toolResults?.[i]?.result} error={toolResults?.[i]?.error}
                            loading={toolResults ? !toolResults[i] : false} />
                    ))}
                    {content && (
                        <Box sx={mdSx}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        </Box>
                    )}
                </Paper>
            </Box>
        </Box>
    );
}
