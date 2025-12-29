import React from 'react';
import { Paperclip, Activity, Microscope } from 'lucide-react';
import {
    Paper,
    Box,
    Typography,
    List,
    ListItem,
    ListItemText,
    ListItemAvatar,
    Avatar,
    Button,
    Stack
} from '@mui/material';

const AttachmentsList = ({ attachments, onAnalyze, analyzingAttachmentUrl }) => {
    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Paperclip size={18} className="text-gray-600" />
                <Typography variant="subtitle1" fontWeight={700}>Attachments</Typography>
            </Box>

            <List disablePadding>
                {(attachments && attachments.length > 0) ? (
                    attachments.map((att, idx) => (
                        <ListItem
                            key={idx}
                            disablePadding
                            sx={{
                                mb: 1,
                                p: 1,
                                bgcolor: 'background.default',
                                borderRadius: 1,
                                border: 1,
                                borderColor: 'divider',
                                '&:hover': { bgcolor: 'action.hover' }
                            }}
                            secondaryAction={
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => onAnalyze(att)}
                                    disabled={analyzingAttachmentUrl === att.url}
                                    startIcon={analyzingAttachmentUrl === att.url ? <Activity size={14} className="animate-spin" /> : <Microscope size={14} />}
                                    sx={{
                                        textTransform: 'none',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        minWidth: 'auto',
                                        ml: 2
                                    }}
                                >
                                    Analyze
                                </Button>
                            }
                        >
                            <ListItemAvatar sx={{ minWidth: 40 }}>
                                <Avatar
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        bgcolor: 'error.light',
                                        color: 'error.main',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold'
                                    }}
                                    variant="rounded"
                                >
                                    {att.name.split('.').pop().toUpperCase().slice(0, 3)}
                                </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                                primary={att.name}
                                secondary={att.size ? `${(att.size / 1024).toFixed(1)} KB` : 'Unknown Size'}
                                primaryTypographyProps={{ variant: 'body2', fontWeight: 500, noWrap: true, title: att.name }}
                                secondaryTypographyProps={{ variant: 'caption' }}
                            />
                        </ListItem>
                    ))
                ) : (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic" sx={{ p: 1 }}>
                        No attachments found.
                    </Typography>
                )}
            </List>
        </Paper>
    );
};

export default AttachmentsList;
