import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardActionArea, Typography, Stack, Box, Chip, IconButton, Menu, MenuItem } from '@mui/material';
import { MoreVertical, FileText, Archive, Trash2 } from 'lucide-react';
import StatusChip from './StatusChip';

const WorkspaceCard = ({ workspace, onArchive }) => {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleMenuOpen = (e) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };
  const handleMenuClose = () => setAnchorEl(null);

  const handleArchive = () => {
    handleMenuClose();
    onArchive?.(workspace.id);
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 3,
        borderColor: workspace.status === 'EXTRACTING' ? 'warning.main'
          : workspace.status === 'REVIEW' ? 'secondary.main'
          : workspace.status === 'PROMOTED' ? 'success.main'
          : 'divider',
        '&:hover': { boxShadow: 4 }
      }}
    >
      <CardActionArea onClick={() => navigate(`/workspaces/${workspace.id}`)} sx={{ flex: 1 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1, mr: 1 }}>
              {workspace.name}
            </Typography>
            <IconButton size="small" onClick={handleMenuOpen} sx={{ mt: -0.5 }}>
              <MoreVertical size={16} />
            </IconButton>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5 }}>
            <StatusChip status={workspace.status} />
            {workspace.domain && <Chip label={workspace.domain} size="small" variant="outlined" />}
          </Stack>

          {workspace.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {workspace.description}
            </Typography>
          )}

          <Stack direction="row" spacing={2} sx={{ mt: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <FileText size={14} />
              <Typography variant="caption" color="text.secondary">
                {workspace.sourceCount || 0} sources
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {workspace.draftCount || 0} drafts
            </Typography>
            {workspace.promotedCount > 0 && (
              <Typography variant="caption" color="success.main">
                {workspace.promotedCount} promoted
              </Typography>
            )}
          </Stack>

          <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
            Updated {timeAgo(workspace.updatedAt)}
          </Typography>
        </CardContent>
      </CardActionArea>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={handleArchive}>
          <Archive size={16} style={{ marginRight: 8 }} /> Archive
        </MenuItem>
      </Menu>
    </Card>
  );
};

export default WorkspaceCard;
