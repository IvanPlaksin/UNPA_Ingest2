import React, { useState } from 'react';
import { triggerIngestion } from '../services/api';
import { Box, Paper, Typography, Button, Stack, Container, CircularProgress } from '@mui/material';
import { CloudDownload, Mail, FileText, Trello } from 'lucide-react';

const KnowledgePage = () => {
    const [status, setStatus] = useState('Idle');
    const [loadingSource, setLoadingSource] = useState(null);

    const handleIngest = async (source) => {
        setLoadingSource(source);
        setStatus(`Processing ${source}...`);
        try {
            await triggerIngestion(source);
            setStatus(`Finished ${source}`);
        } catch (error) {
            setStatus(`Error syncing ${source}`);
        } finally {
            setLoadingSource(null);
        }
    };

    const IngestButton = ({ source, icon: Icon, label }) => (
        <Button
            variant="outlined"
            size="large"
            onClick={() => handleIngest(source)}
            disabled={!!loadingSource}
            startIcon={loadingSource === source ? <CircularProgress size={20} /> : <Icon size={20} />}
            sx={{ flex: 1, py: 3, display: 'flex', flexDirection: 'column', gap: 1, textTransform: 'none' }}
        >
            <Typography variant="subtitle1" fontWeight="bold">{label}</Typography>
        </Button>
    );

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Typography variant="h4" fontWeight="bold" gutterBottom color="text.primary">
                Knowledge Base Manager
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
                Manage data sources and trigger manual ingestion processes to keep the Knowledge Graph up to date.
            </Typography>

            <Paper variant="outlined" sx={{ p: 4, mt: 4, borderRadius: 2 }}>
                <Stack spacing={3}>
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                            <CloudDownload size={24} className="text-blue-500" />
                            <Typography variant="h6">Data Sources</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            Trigger manual ingestion from connected sources.
                        </Typography>
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <IngestButton source="Email" icon={Mail} label="Sync Emails" />
                        <IngestButton source="SharePoint" icon={FileText} label="Sync Docs" />
                        <IngestButton source="DevOps" icon={Trello} label="Sync Work Items" />
                    </Stack>

                    <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                        <Typography variant="caption" fontWeight="bold" color="text.secondary" display="block" mb={0.5}>
                            SYSTEM STATUS
                        </Typography>
                        <Typography variant="body2" fontFamily="monospace" color="primary.main">
                            {status}
                        </Typography>
                    </Box>
                </Stack>
            </Paper>
        </Container>
    );
};

export default KnowledgePage;
