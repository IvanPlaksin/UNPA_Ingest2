/**
 * ModelSelector Component
 * Unified AI model selector with MCP Tools settings button
 * Used in GXE and other AI-powered components
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Tooltip,
  Chip,
  Typography,
  CircularProgress,
  Badge
} from '@mui/material';
import {
  Brain,
  Settings,
  Zap,
  Sparkles,
  Cpu
} from 'lucide-react';
import { getModels, loadMcpSettings } from '../../services/gxe.service';
import MCPToolsPanel from './MCPToolsPanel';

// Model icons
const MODEL_ICONS = {
  'claude-sonnet': Sparkles,
  'claude-haiku': Zap,
  'claude-opus': Brain
};

// Model colors
const MODEL_COLORS = {
  'claude-sonnet': '#8b5cf6',
  'claude-haiku': '#22c55e',
  'claude-opus': '#f59e0b'
};

const ModelSelector = ({
  value,
  onChange,
  disabled = false,
  showToolsButton = true,
  onToolsChange,
  settingsId = 'default',
  compact = false,
  sx = {}
}) => {
  // State
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enabledTools, setEnabledTools] = useState([]);
  const [totalTools, setTotalTools] = useState(0);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false);

  // Load models on mount
  useEffect(() => {
    loadModelsAndSettings();
  }, [settingsId]);

  const loadModelsAndSettings = async () => {
    setLoading(true);
    try {
      const [modelsResult, settingsResult] = await Promise.all([
        getModels(),
        showToolsButton ? loadMcpSettings(settingsId) : Promise.resolve(null)
      ]);

      if (modelsResult.success) {
        setModels(modelsResult.data);
        // Set default if not already set
        if (!value && modelsResult.data.length > 0) {
          const defaultModel = modelsResult.data.find(m => m.isDefault) || modelsResult.data[0];
          onChange?.(defaultModel.id);
        }
      }

      if (settingsResult?.success) {
        setEnabledTools(settingsResult.data.enabledTools);
        // Calculate total tools from the settings response
        if (settingsResult.data.isDefault) {
          setTotalTools(settingsResult.data.enabledTools.length);
        } else {
          // If we have saved settings, we need to get total from somewhere
          // For now, use enabledCount as baseline
          setTotalTools(settingsResult.data.enabledCount || settingsResult.data.enabledTools.length);
        }
      }
    } catch (error) {
      console.error('Failed to load models/settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle tools settings saved
  const handleToolsSaved = useCallback((newEnabledTools) => {
    setEnabledTools(newEnabledTools);
    onToolsChange?.(newEnabledTools);
  }, [onToolsChange]);

  // Get selected model info
  const selectedModel = models.find(m => m.id === value);
  const ModelIcon = selectedModel ? MODEL_ICONS[selectedModel.id] || Cpu : Cpu;
  const modelColor = selectedModel ? MODEL_COLORS[selectedModel.id] || '#8b949e' : '#8b949e';

  // Calculate tools badge color
  const toolsEnabled = enabledTools.length;
  const toolsBadgeColor = toolsEnabled === 0 ? '#ef4444' :
                          toolsEnabled < totalTools / 2 ? '#f59e0b' :
                          toolsEnabled < totalTools ? '#3b82f6' : '#22c55e';

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ...sx }}>
        <CircularProgress size={20} />
        <Typography variant="body2" sx={{ color: '#8b949e' }}>
          Loading...
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ...sx }}>
        {/* Model Selector */}
        <FormControl size="small" sx={{ minWidth: compact ? 140 : 180 }}>
          {!compact && (
            <InputLabel sx={{ color: '#8b949e' }}>
              AI Model
            </InputLabel>
          )}
          <Select
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            label={compact ? undefined : "AI Model"}
            disabled={disabled}
            sx={{
              bgcolor: '#0d1117',
              color: '#e6edf3',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#30363d'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: '#58a6ff'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: modelColor
              }
            }}
          >
            {models.map((model) => {
              const Icon = MODEL_ICONS[model.id] || Cpu;
              const color = MODEL_COLORS[model.id] || '#8b949e';
              return (
                <MenuItem key={model.id} value={model.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Icon size={16} style={{ color }} />
                    <span>{model.name}</span>
                    {model.isDefault && (
                      <Chip
                        label="Default"
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.6rem',
                          bgcolor: '#238636',
                          color: '#fff',
                          ml: 1
                        }}
                      />
                    )}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>

        {/* MCP Tools Button */}
        {showToolsButton && (
          <Tooltip
            title={
              <Box>
                <Typography variant="body2">MCP Tools Settings</Typography>
                <Typography variant="caption" sx={{ color: '#8b949e' }}>
                  {toolsEnabled} of {totalTools || '?'} tools enabled
                </Typography>
              </Box>
            }
          >
            <Badge
              badgeContent={toolsEnabled < totalTools ? `${toolsEnabled}` : null}
              sx={{
                '& .MuiBadge-badge': {
                  bgcolor: toolsBadgeColor,
                  color: '#fff',
                  fontSize: '0.65rem',
                  minWidth: 18,
                  height: 18
                }
              }}
            >
              <Button
                variant="outlined"
                size="small"
                onClick={() => setToolsPanelOpen(true)}
                disabled={disabled}
                sx={{
                  minWidth: compact ? 36 : 'auto',
                  px: compact ? 1 : 2,
                  borderColor: '#30363d',
                  color: '#e6edf3',
                  '&:hover': {
                    borderColor: '#58a6ff',
                    bgcolor: 'rgba(88, 166, 255, 0.1)'
                  }
                }}
              >
                <Settings size={16} />
                {!compact && (
                  <Typography variant="caption" sx={{ ml: 0.5 }}>
                    Tools
                  </Typography>
                )}
              </Button>
            </Badge>
          </Tooltip>
        )}
      </Box>

      {/* MCP Tools Panel */}
      <MCPToolsPanel
        open={toolsPanelOpen}
        onClose={() => setToolsPanelOpen(false)}
        onSettingsSaved={handleToolsSaved}
        settingsId={settingsId}
      />
    </>
  );
};

export default ModelSelector;
