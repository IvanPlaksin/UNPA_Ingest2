import React, { useState } from 'react';
import { Columns, ChevronDown, ChevronUp } from 'lucide-react';
import {
    Paper,
    Box,
    Typography,
    Stack,
    Collapse,
    FormControlLabel,
    Checkbox,
    IconButton
} from '@mui/material';

const ColumnSelector = ({ visibleColumns, onToggleColumn, fieldDefinitions }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Group fields by type or just list them? Listing for now.
    const allFields = Object.keys(fieldDefinitions);

    return (
        <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
            <Box
                onClick={() => setIsExpanded(!isExpanded)}
                sx={{
                    p: 1.5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    bgcolor: isExpanded ? 'background.default' : 'transparent'
                }}
            >
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Columns size={16} className="text-gray-500" />
                    <Typography variant="subtitle2" fontWeight={600}>
                        Columns ({visibleColumns.length})
                    </Typography>
                </Stack>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Box>

            <Collapse in={isExpanded}>
                <Box sx={{
                    p: 2,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: 1,
                    borderTop: 1,
                    borderColor: 'divider'
                }}>
                    {allFields.map(field => (
                        <FormControlLabel
                            key={field}
                            control={
                                <Checkbox
                                    checked={visibleColumns.includes(field)}
                                    onChange={() => onToggleColumn(field)}
                                    size="small"
                                    sx={{ p: 0.5 }}
                                />
                            }
                            label={
                                <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                                    {fieldDefinitions[field].label}
                                </Typography>
                            }
                            sx={{ ml: 0, mr: 1, alignItems: 'center' }}
                        />
                    ))}
                </Box>
            </Collapse>
        </Paper>
    );
};

export default ColumnSelector;
