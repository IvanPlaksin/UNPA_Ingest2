/**
 * MCPToolsPanel Component
 * Floating panel for managing MCP tools settings
 * Allows enabling/disabling tools for AI generation to reduce token usage
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Switch,
  Collapse,
  IconButton,
  Chip,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Badge,
  Divider,
  FormControlLabel,
  Stack
} from '@mui/material';
import {
  Settings,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Save,
  RotateCcw,
  Zap,
  Shield,
  AlertTriangle,
  Check,
  Layers,
  Code,
  Database,
  Brain,
  GitBranch,
  Cpu,
  Terminal,
  FileText,
  Filter,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  getMcpToolsList,
  saveMcpSettings,
  loadMcpSettings
} from '../../services/gxe.service';

// Category icons mapping
const CATEGORY_ICONS = {
  primitive: Terminal,
  text: FileText,
  extraction: Filter,
  vector: Database,
  graph: GitBranch,
  ai: Brain,
  control: Cpu,
  pattern: Layers,
  meta: Code
};

// Category colors
const CATEGORY_COLORS = {
  primitive: '#6366f1',
  text: '#22c55e',
  extraction: '#f59e0b',
  vector: '#3b82f6',
  graph: '#8b5cf6',
  ai: '#ec4899',
  control: '#14b8a6',
  pattern: '#f97316',
  meta: '#06b6d4'
};

// Safety level badges
const SAFETY_BADGES = {
  AUTO: { color: '#22c55e', icon: Check, label: 'Auto' },
  REQUIRES_APPROVAL: { color: '#f59e0b', icon: AlertTriangle, label: 'Approval' },
  GOD_MODE: { color: '#ef4444', icon: Shield, label: 'God Mode' }
};

// Level descriptions
const LEVEL_NAMES = {
  1: 'Primitives',
  2: 'Domain Tools',
  3: 'Patterns',
  4: 'Meta-Tools'
};

const MCPToolsPanel = ({
  open,
  onClose,
  onSettingsSaved,
  settingsId = 'default'
}) => {
  // Data state
  const [allTools, setAllTools] = useState([]);
  const [enabledTools, setEnabledTools] = useState(new Set());
  const [originalEnabled, setOriginalEnabled] = useState(new Set());
  const [stats, setStats] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(new Set());

  // Load tools and settings on open
  useEffect(() => {
    if (open) {
      loadToolsAndSettings();
    }
  }, [open, settingsId]);

  const loadToolsAndSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load tools list and settings in parallel
      const [toolsResult, settingsResult] = await Promise.all([
        getMcpToolsList(),
        loadMcpSettings(settingsId)
      ]);

      if (toolsResult.success) {
        setAllTools(toolsResult.data.tools);
        setStats(toolsResult.data.stats);
        // Expand all categories by default
        const categories = new Set(toolsResult.data.tools.map(t => t.category));
        setExpandedCategories(categories);
      }

      if (settingsResult.success) {
        const enabled = new Set(settingsResult.data.enabledTools);
        setEnabledTools(enabled);
        setOriginalEnabled(new Set(enabled));
      }
    } catch (err) {
      console.error('Failed to load MCP tools:', err);
      setError('Failed to load tools. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle single tool
  const toggleTool = useCallback((toolId) => {
    setEnabledTools(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolId)) {
        newSet.delete(toolId);
      } else {
        newSet.add(toolId);
      }
      return newSet;
    });
  }, []);

  // Toggle all tools in a category
  const toggleCategory = useCallback((category, tools) => {
    const categoryToolIds = tools.filter(t => t.category === category).map(t => t.id);
    const allEnabled = categoryToolIds.every(id => enabledTools.has(id));

    setEnabledTools(prev => {
      const newSet = new Set(prev);
      categoryToolIds.forEach(id => {
        if (allEnabled) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      });
      return newSet;
    });
  }, [enabledTools]);

  // Toggle all tools
  const toggleAll = useCallback((enable) => {
    if (enable) {
      setEnabledTools(new Set(allTools.map(t => t.id)));
    } else {
      setEnabledTools(new Set());
    }
  }, [allTools]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveMcpSettings(
        Array.from(enabledTools),
        settingsId,
        { name: 'MCP Tools Settings', description: 'Tool filtering for AI generation' }
      );

      if (result.success) {
        setOriginalEnabled(new Set(enabledTools));
        onSettingsSaved?.(Array.from(enabledTools));
        onClose();
      }
    } catch (err) {
      console.error('Failed to save MCP settings:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Reset to original
  const handleReset = useCallback(() => {
    setEnabledTools(new Set(originalEnabled));
  }, [originalEnabled]);

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (enabledTools.size !== originalEnabled.size) return true;
    for (const id of enabledTools) {
      if (!originalEnabled.has(id)) return true;
    }
    return false;
  }, [enabledTools, originalEnabled]);

  // Filter tools by search query
  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return allTools;
    const query = searchQuery.toLowerCase();
    return allTools.filter(tool =>
      tool.id.toLowerCase().includes(query) ||
      tool.name.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query) ||
      tool.category.toLowerCase().includes(query)
    );
  }, [allTools, searchQuery]);

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const grouped = {};
    filteredTools.forEach(tool => {
      if (!grouped[tool.category]) {
        grouped[tool.category] = [];
      }
      grouped[tool.category].push(tool);
    });
    return grouped;
  }, [filteredTools]);

  // Category stats
  const categoryStats = useMemo(() => {
    const stats = {};
    Object.entries(toolsByCategory).forEach(([category, tools]) => {
      const enabled = tools.filter(t => enabledTools.has(t.id)).length;
      stats[category] = { total: tools.length, enabled };
    });
    return stats;
  }, [toolsByCategory, enabledTools]);

  // Render tool item
  const renderToolItem = (tool) => {
    const isEnabled = enabledTools.has(tool.id);
    const SafetyIcon = SAFETY_BADGES[tool.safetyLevel]?.icon || Check;
    const CategoryIcon = CATEGORY_ICONS[tool.category] || Code;

    return (
      <Box
        key={tool.id}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          p: 1.5,
          borderRadius: 1,
          bgcolor: isEnabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.02)',
          border: '1px solid',
          borderColor: isEnabled ? 'rgba(34, 197, 94, 0.3)' : '#30363d',
          mb: 1,
          transition: 'all 0.2s',
          '&:hover': {
            borderColor: isEnabled ? 'rgba(34, 197, 94, 0.5)' : '#58a6ff',
            bgcolor: isEnabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(88, 166, 255, 0.05)'
          }
        }}
      >
        <Switch
          checked={isEnabled}
          onChange={() => toggleTool(tool.id)}
          size="small"
          sx={{
            mr: 1.5,
            mt: 0.5,
            '& .MuiSwitch-switchBase.Mui-checked': {
              color: '#22c55e'
            },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
              backgroundColor: '#22c55e'
            }
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#e6edf3' }}>
              {tool.name}
            </Typography>
            <Chip
              label={`L${tool.level}`}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.65rem',
                bgcolor: '#30363d',
                color: '#8b949e'
              }}
            />
            <Tooltip title={SAFETY_BADGES[tool.safetyLevel]?.label || tool.safetyLevel}>
              <SafetyIcon
                size={14}
                style={{ color: SAFETY_BADGES[tool.safetyLevel]?.color || '#8b949e' }}
              />
            </Tooltip>
          </Box>
          <Typography
            variant="caption"
            sx={{
              color: '#8b949e',
              display: 'block',
              fontFamily: 'monospace',
              mb: 0.5
            }}
          >
            {tool.id}
          </Typography>
          <Typography variant="body2" sx={{ color: '#8b949e', fontSize: '0.8rem' }}>
            {tool.description}
          </Typography>
          {tool.sideEffects?.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
              {tool.sideEffects.map(effect => (
                <Chip
                  key={effect}
                  label={effect}
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: '0.6rem',
                    bgcolor: effect === 'WRITE' || effect === 'DELETE'
                      ? 'rgba(239, 68, 68, 0.2)'
                      : 'rgba(59, 130, 246, 0.2)',
                    color: effect === 'WRITE' || effect === 'DELETE'
                      ? '#ef4444'
                      : '#3b82f6'
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#161b22',
          color: '#e6edf3',
          border: '1px solid #30363d',
          maxHeight: '85vh'
        }
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderBottom: '1px solid #30363d',
        pb: 2
      }}>
        <Settings size={20} className="text-blue-400" />
        <span>MCP Tools Settings</span>
        <Box sx={{ flexGrow: 1 }} />
        {stats && (
          <Chip
            label={`${enabledTools.size} / ${stats.total} enabled`}
            size="small"
            sx={{
              bgcolor: enabledTools.size === stats.total ? '#238636' : '#1f6feb',
              color: '#fff'
            }}
          />
        )}
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: '#8b949e' }}
        >
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {error && (
          <Alert
            severity="error"
            sx={{ m: 2, bgcolor: '#3d1f1f', color: '#f85149' }}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        {/* Search and Quick Actions */}
        <Box sx={{ p: 2, borderBottom: '1px solid #30363d', bgcolor: '#0d1117' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="small"
              sx={{ flex: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} style={{ color: '#8b949e' }} />
                  </InputAdornment>
                ),
                sx: { bgcolor: '#161b22', color: '#e6edf3' }
              }}
            />
            <Button
              size="small"
              startIcon={<CheckSquare size={14} />}
              onClick={() => toggleAll(true)}
              sx={{ color: '#22c55e', borderColor: '#22c55e' }}
              variant="outlined"
            >
              All
            </Button>
            <Button
              size="small"
              startIcon={<Square size={14} />}
              onClick={() => toggleAll(false)}
              sx={{ color: '#8b949e', borderColor: '#30363d' }}
              variant="outlined"
            >
              None
            </Button>
          </Stack>

          {/* Token usage estimate */}
          <Box sx={{ mt: 2, p: 1.5, bgcolor: '#161b22', borderRadius: 1, border: '1px solid #30363d' }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Zap size={16} style={{ color: '#f59e0b' }} />
              <Typography variant="body2" sx={{ color: '#8b949e' }}>
                Estimated token reduction:
              </Typography>
              <Chip
                label={`~${Math.round((1 - enabledTools.size / (stats?.total || 1)) * 100)}%`}
                size="small"
                sx={{
                  bgcolor: enabledTools.size < (stats?.total || 0) / 2 ? '#238636' : '#1f6feb',
                  color: '#fff'
                }}
              />
              <Typography variant="caption" sx={{ color: '#6e7681' }}>
                ({stats?.total - enabledTools.size} tools disabled)
              </Typography>
            </Stack>
          </Box>
        </Box>

        {/* Tools List */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={40} />
          </Box>
        ) : (
          <Box sx={{ p: 2, maxHeight: 'calc(85vh - 280px)', overflow: 'auto' }}>
            {Object.entries(toolsByCategory).map(([category, tools]) => {
              const CategoryIcon = CATEGORY_ICONS[category] || Code;
              const categoryColor = CATEGORY_COLORS[category] || '#8b949e';
              const stats = categoryStats[category];
              const isExpanded = expandedCategories.has(category);
              const allCategoryEnabled = stats.enabled === stats.total;

              return (
                <Accordion
                  key={category}
                  expanded={isExpanded}
                  onChange={() => {
                    setExpandedCategories(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(category)) {
                        newSet.delete(category);
                      } else {
                        newSet.add(category);
                      }
                      return newSet;
                    });
                  }}
                  sx={{
                    bgcolor: '#0d1117',
                    border: '1px solid #30363d',
                    mb: 1,
                    '&:before': { display: 'none' },
                    '&.Mui-expanded': { margin: '0 0 8px 0' }
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ChevronDown size={18} style={{ color: '#8b949e' }} />}
                    sx={{
                      '& .MuiAccordionSummary-content': {
                        alignItems: 'center',
                        gap: 1
                      }
                    }}
                  >
                    <CategoryIcon size={18} style={{ color: categoryColor }} />
                    <Typography variant="subtitle2" sx={{ color: '#e6edf3', textTransform: 'capitalize' }}>
                      {category}
                    </Typography>
                    <Badge
                      badgeContent={`${stats.enabled}/${stats.total}`}
                      sx={{
                        ml: 1,
                        '& .MuiBadge-badge': {
                          bgcolor: allCategoryEnabled ? '#238636' : '#30363d',
                          color: '#fff',
                          fontSize: '0.65rem'
                        }
                      }}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={allCategoryEnabled}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleCategory(category, allTools);
                          }}
                          size="small"
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: categoryColor
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              backgroundColor: categoryColor
                            }
                          }}
                        />
                      }
                      label=""
                      onClick={(e) => e.stopPropagation()}
                      sx={{ m: 0 }}
                    />
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    {tools.map(renderToolItem)}
                  </AccordionDetails>
                </Accordion>
              );
            })}

            {filteredTools.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" sx={{ color: '#8b949e' }}>
                  No tools found matching "{searchQuery}"
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #30363d', gap: 1 }}>
        {hasChanges && (
          <Button
            onClick={handleReset}
            startIcon={<RotateCcw size={16} />}
            sx={{ color: '#8b949e', mr: 'auto' }}
          >
            Reset
          </Button>
        )}
        <Button
          onClick={onClose}
          sx={{ color: '#8b949e' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          startIcon={saving ? <CircularProgress size={16} /> : <Save size={16} />}
          sx={{
            bgcolor: '#238636',
            '&:hover': { bgcolor: '#2ea043' },
            '&:disabled': { bgcolor: '#21262d', color: '#484f58' }
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MCPToolsPanel;
