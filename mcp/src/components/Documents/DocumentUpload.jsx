/**
 * DocumentUpload
 *
 * Drag-and-drop file upload zone for UN documents.
 * Accepts PDF, DOCX, TXT, MD files up to 50 MB.
 * Calls POST /api/v1/documents/upload and reports status via onUploadComplete.
 *
 * Props:
 *   namespace        string   — target namespace (default 'DEFAULT')
 *   onUploadComplete (doc) => void  — called after successful upload
 *   onError          (err) => void  — called on failure
 */
import React, { useState, useRef, useCallback } from 'react';
import { Box, Typography, LinearProgress, Chip, Stack, Alert } from '@mui/material';
import { UploadCloud, File as FileIcon } from 'lucide-react';
import { uploadDocument } from '../../services/documentProcessing.service';

const ACCEPTED_TYPES = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv'];
const MAX_SIZE_MB = 50;

function isAccepted(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return ACCEPTED_TYPES.includes(ext);
}

export default function DocumentUpload({ namespace = 'DEFAULT', onUploadComplete, onError }) {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    const handleFiles = useCallback(async (files) => {
        setError(null);
        const valid = Array.from(files).filter(f => {
            if (!isAccepted(f)) { setError(`Unsupported file type: ${f.name}`); return false; }
            if (f.size > MAX_SIZE_MB * 1024 * 1024) { setError(`File too large (max ${MAX_SIZE_MB} MB): ${f.name}`); return false; }
            return true;
        });
        if (!valid.length) return;

        setUploading(true);
        for (let i = 0; i < valid.length; i++) {
            const file = valid[i];
            setProgress({ filename: file.name, current: i + 1, total: valid.length });
            try {
                const doc = await uploadDocument(file, namespace);
                onUploadComplete?.(doc);
            } catch (e) {
                const msg = e.response?.data?.error || e.message;
                setError(`Upload failed for ${file.name}: ${msg}`);
                onError?.(e);
            }
        }
        setUploading(false);
        setProgress(null);
    }, [namespace, onUploadComplete, onError]);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = () => setDragging(false);
    const onInputChange = (e) => handleFiles(e.target.files);
    const openPicker = () => inputRef.current?.click();

    return (
        <Box>
            <Box
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={openPicker}
                sx={{
                    border: '2px dashed',
                    borderColor: dragging ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    p: 4,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: dragging ? 'action.selected' : 'action.hover',
                    transition: 'border-color 0.2s, background-color 0.2s',
                    '&:hover': { borderColor: 'primary.main', bgcolor: 'action.selected' }
                }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_TYPES.join(',')}
                    onChange={onInputChange}
                    style={{ display: 'none' }}
                />
                <UploadCloud size={40} style={{ marginBottom: 12, opacity: 0.6 }} />
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    Drag & Drop UN Documents Here
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    or click to browse
                </Typography>
                <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" sx={{ mt: 1 }}>
                    {ACCEPTED_TYPES.map(t => (
                        <Chip key={t} label={t.toUpperCase().replace('.', '')} size="small" variant="outlined" />
                    ))}
                </Stack>
                <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
                    Maximum file size: {MAX_SIZE_MB} MB
                </Typography>
            </Box>

            {uploading && progress && (
                <Box sx={{ mt: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <FileIcon size={16} />
                        <Typography variant="caption">
                            Uploading {progress.filename} ({progress.current}/{progress.total})…
                        </Typography>
                    </Stack>
                    <LinearProgress />
                </Box>
            )}

            {error && (
                <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}
        </Box>
    );
}
