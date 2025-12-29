import React from 'react';
import { Folder, ChevronRight, Home } from 'lucide-react';
import { Paper, Breadcrumbs, Typography, Link as MuiLink, Box, Stack } from '@mui/material';

const TfvcBreadcrumbs = ({ path, onNavigate }) => {
    // path is like $/ATSBranch/Folder/File
    const parts = path ? path.split('/').filter(p => p) : [];

    const handleBreadcrumbClick = (index) => {
        // Reconstruct path up to the clicked index
        const newPath = parts.slice(0, index + 1).join('/');
        if (newPath !== path) {
            onNavigate(newPath);
        }
    };

    return (
        <Paper
            elevation={0}
            sx={{
                height: 48,
                px: 2,
                display: 'flex',
                alignItems: 'center',
                borderBottom: 1,
                borderColor: 'divider',
                borderRadius: 0,
                bgcolor: 'background.default'
            }}
        >
            <Stack direction="row" alignItems="center" spacing={2} width="100%">
                <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'text.secondary' }}>
                    <Folder size={18} />
                    <Typography variant="subtitle2" fontWeight={600} color="text.primary">TFVC Browser</Typography>
                </Stack>

                <Box sx={{ width: 1, height: 24, bgcolor: 'divider' }} />

                <Breadcrumbs
                    separator={<ChevronRight size={14} />}
                    aria-label="breadcrumb"
                    sx={{
                        '& .MuiBreadcrumbs-li': { overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 },
                        '& .MuiBreadcrumbs-separator': { mx: 0.5 }
                    }}
                >
                    {parts.length > 0 ? parts.map((part, index) => {
                        const isLast = index === parts.length - 1;
                        return isLast ? (
                            <Typography key={index} color="text.primary" variant="body2" fontWeight={600} noWrap>
                                {part}
                            </Typography>
                        ) : (
                            <MuiLink
                                key={index}
                                component="button"
                                variant="body2"
                                onClick={() => handleBreadcrumbClick(index)}
                                color="primary"
                                underline="hover"
                                sx={{ cursor: 'pointer', maxWidth: 200, display: 'block' }}
                                noWrap
                            >
                                {part}
                            </MuiLink>
                        );
                    }) : (
                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                            Select a file or folder...
                        </Typography>
                    )}
                </Breadcrumbs>
            </Stack>
        </Paper>
    );
};

export default TfvcBreadcrumbs;
