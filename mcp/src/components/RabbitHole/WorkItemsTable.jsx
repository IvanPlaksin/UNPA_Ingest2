import { ChevronLeft, ChevronRight, ExternalLink, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Button,
    Typography,
    Box,
    Chip,
    Stack,
    Tooltip
} from '@mui/material';

const WorkItemsTable = ({ items, page, pageSize, onNextPage, onPrevPage, visibleColumns, fieldDefinitions }) => {
    return (
        <Paper variant="outlined" sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <TableContainer sx={{ flex: 1, maxHeight: 'calc(100vh - 300px)' }}> {/* Adjust height as needed or let flex handle it */}
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            {visibleColumns.map(col => (
                                <TableCell key={col} sx={{ whiteSpace: 'nowrap', fontWeight: 'bold', bgcolor: 'background.default' }}>
                                    {fieldDefinitions[col]?.label || col}
                                </TableCell>
                            ))}
                            <TableCell align="right" sx={{ width: 180, fontWeight: 'bold', bgcolor: 'background.default' }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.id} hover>
                                {visibleColumns.map(col => (
                                    <TableCell key={col} sx={{ maxWidth: 300 }}>
                                        {col === 'HasLinks' ? (
                                            <Box display="flex" justifyContent="center">
                                                {item.relations && item.relations.length > 0 && (
                                                    <Tooltip title={`${item.relations.length} Relations`}>
                                                        <Link2 size={16} color="#6b7280" />
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        ) : col === 'System.Title' ? (
                                            <Typography variant="body2" noWrap title={item.fields[col]}>
                                                {item.fields[col]}
                                            </Typography>
                                        ) : col === 'System.State' ? (
                                            <Chip
                                                label={item.fields[col]}
                                                size="small"
                                                className={`status-chip ${item.fields[col]?.replace(/\s+/g, '-').toLowerCase()}`} // Keep class for possible specific color overrides or move to sx function
                                                sx={{
                                                    height: 20,
                                                    fontSize: '0.75rem',
                                                    ...(item.fields[col] === 'Active' && { bgcolor: 'primary.light', color: 'primary.dark' }),
                                                    ...(item.fields[col] === 'Closed' && { bgcolor: 'success.light', color: 'success.dark' }),
                                                    ...(item.fields[col] === 'New' && { bgcolor: 'grey.200', color: 'text.primary' }),
                                                    ...(item.fields[col] === 'Resolved' && { bgcolor: 'warning.light', color: 'warning.dark' }),
                                                }}
                                            />
                                        ) : (
                                            <Typography variant="body2">
                                                {typeof item.fields[col] === 'object' && item.fields[col] !== null ? (
                                                    item.fields[col].displayName || JSON.stringify(item.fields[col])
                                                ) : (
                                                    item.fields[col]
                                                )}
                                            </Typography>
                                        )}
                                    </TableCell>
                                ))}
                                <TableCell align="right">
                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                        <Button
                                            component={Link}
                                            to={`/nexus/workitem/${item.id}`}
                                            size="small"
                                            endIcon={<ExternalLink size={14} />}
                                            sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 'auto', p: '2px 8px' }}
                                        >
                                            Nexus
                                        </Button>
                                        <Button
                                            component={Link}
                                            to={`/singularity/workitem/${item.id}`}
                                            size="small"
                                            color="secondary"
                                            sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 'auto', p: '2px 8px' }}
                                        >
                                            Singularity
                                        </Button>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Pagination Controls */}
            <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: 1,
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: 'background.default'
            }}>
                <Typography variant="caption" color="text.secondary">
                    Page {page}
                </Typography>
                <Stack direction="row" spacing={1}>
                    <IconButton
                        onClick={onPrevPage}
                        disabled={page === 1}
                        size="small"
                    >
                        <ChevronLeft size={16} />
                    </IconButton>
                    <IconButton
                        onClick={onNextPage}
                        disabled={items.length < pageSize}
                        size="small"
                    >
                        <ChevronRight size={16} />
                    </IconButton>
                </Stack>
            </Box>
        </Paper>
    );
};

export default WorkItemsTable;
