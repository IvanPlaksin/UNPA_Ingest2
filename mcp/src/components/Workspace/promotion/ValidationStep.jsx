/**
 * ValidationStep (WS3-003)
 *
 * First step of the Promotion Wizard.
 * Auto-runs `validateGraph` on mount and prevents proceeding if there are
 * BLOCKING issues. ERROR-severity issues are shown but do not block (user
 * can choose to continue at their own risk).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Chip, List, ListItem, ListItemText, ListItemIcon,
  CircularProgress, Alert, Button, Divider, Collapse, IconButton
} from '@mui/material';
import {
  CheckCircle as PassIcon,
  Warning as WarnIcon,
  Error as ErrorIcon,
  Block as BlockIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../../../config/api.config';

const STATUS_ICONS = {
  PASS: { icon: PassIcon, color: 'success.main' },
  WARN: { icon: WarnIcon, color: 'warning.main' },
  FAIL: { icon: ErrorIcon, color: 'error.main' },
  SKIP: { icon: WarnIcon, color: 'text.disabled' }
};

const SeverityChip = ({ severity }) => {
  const colorMap = { BLOCKING: 'error', ERROR: 'error', WARNING: 'warning', INFO: 'info' };
  return (
    <Chip
      size="small"
      label={severity}
      color={colorMap[severity] || 'default'}
      sx={{ height: 18, fontSize: '0.65rem', ml: 0.5 }}
    />
  );
};

const RuleResult = ({ result }) => {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, color } = STATUS_ICONS[result.status] || STATUS_ICONS.SKIP;
  const hasDetails = result.affectedNodes && result.affectedNodes.length > 0;

  return (
    <>
      <ListItem
        sx={{ py: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
        secondaryAction={hasDetails ? (
          <IconButton size="small" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        ) : null}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          <Icon sx={{ color, fontSize: 18 }} />
        </ListItemIcon>
        <ListItemText
          primary={
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{result.ruleName}</Typography>
              <SeverityChip severity={result.severity} />
            </Stack>
          }
          secondary={
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              {result.message}
            </Typography>
          }
        />
      </ListItem>
      {hasDetails && (
        <Collapse in={expanded}>
          <Box sx={{ pl: 5, pr: 2, py: 0.5, mb: 1 }}>
            <List dense disablePadding>
              {result.affectedNodes.slice(0, 10).map((n, i) => (
                <ListItem key={i} sx={{ py: 0 }}>
                  <ListItemText
                    primary={n.name || n.id}
                    secondary={n.issue}
                    primaryTypographyProps={{ fontSize: '0.7rem', fontFamily: 'monospace' }}
                    secondaryTypographyProps={{ fontSize: '0.65rem' }}
                  />
                </ListItem>
              ))}
              {result.affectedNodes.length > 10 && (
                <Typography variant="caption" color="text.disabled" sx={{ pl: 2 }}>
                  …and {result.affectedNodes.length - 10} more
                </Typography>
              )}
            </List>
          </Box>
        </Collapse>
      )}
    </>
  );
};

const ValidationStep = ({ workspaceId, onValidationChange }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [validation, setValidation] = useState(null);

  const validate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.post(`${API_BASE_URL}/workspaces/${workspaceId}/validate`, {});
      const data = resp.data?.data;
      setValidation(data);
      onValidationChange?.(data);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      setError(msg);
      onValidationChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onValidationChange]);

  useEffect(() => { validate(); }, [validate]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
        <CircularProgress />
        <Typography variant="caption" sx={{ mt: 2, color: 'text.secondary' }}>
          Running 10 validation rules…
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={
        <Button size="small" onClick={validate} startIcon={<RefreshIcon fontSize="small" />}>Retry</Button>
      }>
        {error}
      </Alert>
    );
  }

  if (!validation) return null;

  const { summary, results, blockers, errors, warnings, canPromote, valid } = validation;

  return (
    <Box>
      {/* Headline alert */}
      {canPromote ? (
        valid ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            All validation checks passed. Ready to promote.
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {summary.errors} error(s) found, but no blockers. You may proceed at your own risk.
          </Alert>
        )
      ) : (
        <Alert
          severity="error"
          icon={<BlockIcon />}
          sx={{ mb: 2 }}
          action={
            <Button size="small" onClick={validate} startIcon={<RefreshIcon fontSize="small" />}>
              Re-validate
            </Button>
          }
        >
          <strong>Cannot promote.</strong> {blockers.length} blocker(s) must be resolved first.
        </Alert>
      )}

      {/* Summary chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Chip
          size="small"
          icon={<PassIcon />}
          label={`${summary.passed} passed`}
          color="success"
          variant={summary.passed > 0 ? 'filled' : 'outlined'}
        />
        <Chip
          size="small"
          icon={<WarnIcon />}
          label={`${summary.warnings} warnings`}
          color="warning"
          variant={summary.warnings > 0 ? 'filled' : 'outlined'}
        />
        <Chip
          size="small"
          icon={<ErrorIcon />}
          label={`${summary.errors} errors`}
          color="error"
          variant={summary.errors > 0 ? 'filled' : 'outlined'}
        />
        <Chip
          size="small"
          icon={<BlockIcon />}
          label={`${summary.blocking} blocking`}
          color="error"
          variant={summary.blocking > 0 ? 'filled' : 'outlined'}
        />
      </Stack>

      {/* Show blockers first */}
      {blockers.length > 0 && (
        <>
          <Typography variant="overline" color="error.main" sx={{ display: 'block', mt: 1, fontWeight: 700 }}>
            BLOCKERS (must resolve)
          </Typography>
          <List dense disablePadding>
            {blockers.map(r => <RuleResult key={r.ruleId} result={r} />)}
          </List>
          <Divider sx={{ my: 1.5 }} />
        </>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <>
          <Typography variant="overline" color="error.main" sx={{ display: 'block', fontWeight: 700 }}>
            Errors
          </Typography>
          <List dense disablePadding>
            {errors.map(r => <RuleResult key={r.ruleId} result={r} />)}
          </List>
          <Divider sx={{ my: 1.5 }} />
        </>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <>
          <Typography variant="overline" color="warning.main" sx={{ display: 'block', fontWeight: 700 }}>
            Warnings
          </Typography>
          <List dense disablePadding>
            {warnings.map(r => <RuleResult key={r.ruleId} result={r} />)}
          </List>
          <Divider sx={{ my: 1.5 }} />
        </>
      )}

      {/* Passed (collapsed by default at the bottom) */}
      {results.filter(r => r.status === 'PASS').length > 0 && (
        <>
          <Typography variant="overline" color="success.main" sx={{ display: 'block', fontWeight: 700 }}>
            Passed ({results.filter(r => r.status === 'PASS').length})
          </Typography>
          <List dense disablePadding>
            {results.filter(r => r.status === 'PASS').map(r => <RuleResult key={r.ruleId} result={r} />)}
          </List>
        </>
      )}
    </Box>
  );
};

export default ValidationStep;
