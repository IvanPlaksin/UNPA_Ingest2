/**
 * Predicted Links Overlay Component
 * Визуализация предсказанных связей на графе
 */
import React, { useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Slider,
  FormControlLabel,
  Switch,
  Badge,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';

/**
 * Convert predictions to graph edges format
 */
export const predictionsToEdges = (predictions, options = {}) => {
  const {
    color = '#ff9800',
    dashArray = '5,5',
    opacity = 0.7,
    width = 2,
  } = options;

  return predictions.map((pred) => ({
    source: pred.source_id,
    target: pred.target_id,
    type: 'predicted',
    confidence: pred.confidence,
    style: {
      stroke: color,
      strokeDasharray: dashArray,
      strokeOpacity: opacity * pred.confidence,
      strokeWidth: width,
    },
    label: `${(pred.confidence * 100).toFixed(0)}%`,
  }));
};

/**
 * Get color based on confidence level
 */
const getConfidenceColor = (confidence) => {
  if (confidence >= 0.9) return '#4caf50'; // Green
  if (confidence >= 0.7) return '#ff9800'; // Orange
  return '#f44336'; // Red
};

const PredictedLinksOverlay = ({
  predictions = [],
  visible = true,
  onVisibilityChange,
  confidenceThreshold = 0.5,
  onThresholdChange,
  selectedPrediction,
  onSelectPrediction,
  maxDisplay = 100,
}) => {
  // Filter predictions by threshold
  const filteredPredictions = useMemo(() => {
    return predictions
      .filter((p) => p.confidence >= confidenceThreshold)
      .slice(0, maxDisplay);
  }, [predictions, confidenceThreshold, maxDisplay]);

  // Group by confidence level
  const groupedByConfidence = useMemo(() => {
    const groups = {
      high: [], // >= 0.9
      medium: [], // 0.7-0.9
      low: [], // < 0.7
    };

    filteredPredictions.forEach((pred) => {
      if (pred.confidence >= 0.9) groups.high.push(pred);
      else if (pred.confidence >= 0.7) groups.medium.push(pred);
      else groups.low.push(pred);
    });

    return groups;
  }, [filteredPredictions]);

  // Handle prediction click
  const handlePredictionClick = useCallback(
    (prediction) => {
      onSelectPrediction?.(prediction);
    },
    [onSelectPrediction]
  );

  if (!predictions || predictions.length === 0) {
    return null;
  }

  return (
    <Paper
      sx={{
        position: 'absolute',
        top: 16,
        right: 16,
        p: 2,
        maxWidth: 300,
        maxHeight: 400,
        overflow: 'auto',
        zIndex: 1000,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Typography variant="subtitle1" fontWeight="bold">
          Predicted Links
        </Typography>
        <Box>
          <Badge badgeContent={filteredPredictions.length} color="primary">
            <IconButton
              size="small"
              onClick={() => onVisibilityChange?.(!visible)}
            >
              {visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
            </IconButton>
          </Badge>
        </Box>
      </Box>

      {/* Confidence Filter */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="textSecondary">
          Min Confidence: {(confidenceThreshold * 100).toFixed(0)}%
        </Typography>
        <Slider
          value={confidenceThreshold}
          onChange={(e, v) => onThresholdChange?.(v)}
          min={0.1}
          max={0.99}
          step={0.05}
          size="small"
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${(v * 100).toFixed(0)}%`}
        />
      </Box>

      {/* Statistics */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label={`High: ${groupedByConfidence.high.length}`}
          size="small"
          sx={{ backgroundColor: '#4caf50', color: 'white' }}
        />
        <Chip
          label={`Medium: ${groupedByConfidence.medium.length}`}
          size="small"
          sx={{ backgroundColor: '#ff9800', color: 'white' }}
        />
        <Chip
          label={`Low: ${groupedByConfidence.low.length}`}
          size="small"
          sx={{ backgroundColor: '#f44336', color: 'white' }}
        />
      </Box>

      {/* Predictions List */}
      {visible && (
        <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
          {filteredPredictions.slice(0, 20).map((pred, idx) => (
            <Box
              key={`${pred.source_id}-${pred.target_id}-${idx}`}
              sx={{
                p: 1,
                mb: 0.5,
                borderRadius: 1,
                cursor: 'pointer',
                backgroundColor:
                  selectedPrediction === pred ? 'action.selected' : 'transparent',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
                borderLeft: `3px solid ${getConfidenceColor(pred.confidence)}`,
              }}
              onClick={() => handlePredictionClick(pred)}
            >
              <Typography variant="body2" noWrap>
                {pred.source_id}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                ↓
              </Typography>
              <Typography variant="body2" noWrap>
                {pred.target_id}
              </Typography>
              <Chip
                label={`${(pred.confidence * 100).toFixed(1)}%`}
                size="small"
                sx={{
                  mt: 0.5,
                  backgroundColor: getConfidenceColor(pred.confidence),
                  color: 'white',
                  height: 20,
                  fontSize: '0.7rem',
                }}
              />
            </Box>
          ))}

          {filteredPredictions.length > 20 && (
            <Typography
              variant="caption"
              color="textSecondary"
              sx={{ display: 'block', textAlign: 'center', mt: 1 }}
            >
              +{filteredPredictions.length - 20} more predictions
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default PredictedLinksOverlay;
