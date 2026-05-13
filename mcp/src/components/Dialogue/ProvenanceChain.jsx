/**
 * ProvenanceChain — visualize SUPERSEDES (decision) and CONTINUES_FROM (session) chains.
 *
 * type='decision' shows how architectural decisions evolved (what was superseded).
 * type='session'  shows the conversation thread (which sessions continue from each other).
 */
import React from 'react';
import {
  Box, Typography, Stack, Chip, CircularProgress, Alert,
  Paper, Tooltip,
} from '@mui/material';
import {
  ArrowDownward, AccountTree, Chat, CheckCircle, Cancel, HelpOutline,
  RadioButtonUnchecked, RadioButtonChecked,
} from '@mui/icons-material';
import { useProvenanceChain } from '../../hooks/useDialogue';
import { parseSmartTitle, parseTopics, inferSessionType, SESSION_TYPE_STYLE } from './session-meta';

// ── Decision node card ────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  architecture: 'primary',
  technology: 'info',
  pattern: 'secondary',
  convention: 'default',
  rejection: 'error',
};

const STATUS_ICON = {
  accepted: <CheckCircle fontSize="inherit" color="success" />,
  rejected: <Cancel fontSize="inherit" color="error" />,
  proposed: <HelpOutline fontSize="inherit" color="warning" />,
};

function DecisionNodeCard({ node, isCurrent, onClick }) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        cursor: onClick ? 'pointer' : 'default',
        borderColor: isCurrent ? 'primary.main' : 'divider',
        borderWidth: isCurrent ? 2 : 1,
        bgcolor: isCurrent ? 'primary.50' : 'background.paper',
        '&:hover': onClick ? { bgcolor: 'action.hover' } : {},
        transition: 'background-color 0.15s',
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
        {isCurrent
          ? <RadioButtonChecked fontSize="small" color="primary" />
          : <RadioButtonUnchecked fontSize="small" color="disabled" />
        }
        <Box sx={{ fontSize: '0.85rem' }}>{STATUS_ICON[node.status] || STATUS_ICON.proposed}</Box>
        <Chip
          label={node.category || 'other'}
          size="small"
          color={CATEGORY_COLORS[node.category] || 'default'}
          sx={{ fontSize: '0.7rem', height: 18 }}
        />
        {node.confidence != null && (
          <Typography variant="caption" color="text.disabled">
            {Math.round(node.confidence * 100)}%
          </Typography>
        )}
        {isCurrent && (
          <Chip label="current" size="small" color="primary" sx={{ fontSize: '0.7rem', height: 18 }} />
        )}
      </Stack>
      <Typography variant="body2" fontWeight={isCurrent ? 600 : 400} sx={{ lineHeight: 1.3 }}>
        {node.title || 'Untitled decision'}
      </Typography>
      {node.createdAt && (
        <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.25 }}>
          {new Date(node.createdAt).toLocaleDateString()}
        </Typography>
      )}
    </Paper>
  );
}

// ── Session node card ─────────────────────────────────────────────────────────

const PLATFORM_LABELS = { claude_code: 'Claude Code', claude_ai: 'Claude.ai' };
const PLATFORM_COLORS = { claude_code: 'primary', claude_ai: 'secondary' };

function SessionNodeCard({ node, isCurrent, score, onClick }) {
  const smart = parseSmartTitle(node.title, node.summary);
  const topics = parseTopics(node.summary, 32, 2);
  const type = inferSessionType(node.title, node.summary);
  const typeStyle = SESSION_TYPE_STYLE[type];

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        cursor: onClick ? 'pointer' : 'default',
        borderColor: isCurrent ? 'primary.main' : 'divider',
        borderWidth: isCurrent ? 2 : 1,
        bgcolor: isCurrent ? 'primary.50' : 'background.paper',
        '&:hover': onClick ? { bgcolor: 'action.hover' } : {},
        transition: 'background-color 0.15s',
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" gap={0.5}>
        <Chat fontSize="small" color={isCurrent ? 'primary' : 'disabled'} />
        <Chip
          label={PLATFORM_LABELS[node.platform] || node.platform || 'unknown'}
          size="small"
          color={PLATFORM_COLORS[node.platform] || 'default'}
          sx={{ fontSize: '0.7rem', height: 18 }}
        />
        <Chip
          label={type}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.7rem', height: 18, borderColor: typeStyle.border, color: typeStyle.color }}
        />
        {topics.map(t => (
          <Chip key={t} label={t} size="small" variant="outlined"
            sx={{ fontSize: '0.7rem', height: 18, color: 'text.secondary' }} />
        ))}
        {score != null && (
          <Tooltip title={`Similarity score: ${score.toFixed(2)}`}>
            <Chip
              label={`${Math.round(score * 100)}%`}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 18 }}
            />
          </Tooltip>
        )}
        {isCurrent && (
          <Chip label="current" size="small" color="primary" sx={{ fontSize: '0.7rem', height: 18 }} />
        )}
      </Stack>
      <Typography variant="body2" fontWeight={isCurrent ? 600 : 400}
        sx={{ lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
      >
        {smart}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        {node.startedAt && (
          <Typography variant="caption" color="text.disabled">
            {new Date(node.startedAt).toLocaleDateString()}
          </Typography>
        )}
        {node.messageCount > 0 && (
          <Typography variant="caption" color="text.disabled">
            {node.messageCount} msgs
          </Typography>
        )}
        {node.gitBranch && (
          <Typography variant="caption" color="text.disabled" noWrap>
            {node.gitBranch}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

// ── Arrow divider ─────────────────────────────────────────────────────────────

function ChainArrow({ label }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ py: 0.5, pl: 1 }}>
      <ArrowDownward sx={{ fontSize: 16, color: 'text.disabled' }} />
      {label && (
        <Typography variant="caption" color="text.disabled">{label}</Typography>
      )}
    </Stack>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProvenanceChain({ type, nodeId, onDecisionClick, onSessionClick }) {
  const { chain, loading, error } = useProvenanceChain(type, nodeId);

  if (!nodeId) return null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>;
  }

  if (!chain) return null;

  const { current, ancestors, descendants, edges } = chain;

  const isEmpty = ancestors.length === 0 && descendants.length === 0;

  if (isEmpty) {
    return (
      <Box sx={{ py: 1 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
          <AccountTree fontSize="small" color="disabled" />
          <Typography variant="caption" color="text.secondary">
            {type === 'decision' ? 'Decision chain' : 'Conversation chain'}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.disabled">
          {type === 'decision'
            ? 'No SUPERSEDES links — this decision stands alone'
            : 'No CONTINUES_FROM links — this session is standalone'}
        </Typography>
      </Box>
    );
  }

  // Build score lookup for session edges
  const scoreMap = {};
  if (type === 'session' && edges) {
    edges.forEach(e => { scoreMap[`${e.from}→${e.to}`] = e.score; });
  }

  const renderDecisionNode = (node, isCurrent) => (
    <DecisionNodeCard
      key={node.decisionId}
      node={node}
      isCurrent={isCurrent}
      onClick={onDecisionClick ? () => onDecisionClick(node.decisionId) : undefined}
    />
  );

  const renderSessionNode = (node, isCurrent, prevId) => {
    const score = prevId ? scoreMap[`${prevId}→${node.sessionId}`] ?? scoreMap[`${node.sessionId}→${prevId}`] : null;
    return (
      <SessionNodeCard
        key={node.sessionId}
        node={node}
        isCurrent={isCurrent}
        score={score}
        onClick={onSessionClick ? () => onSessionClick(node.sessionId) : undefined}
      />
    );
  };

  return (
    <Box>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1.5 }}>
        <AccountTree fontSize="small" color="action" />
        <Typography variant="caption" color="text.secondary" fontWeight={500}>
          {type === 'decision' ? 'Decision evolution chain' : 'Conversation chain'}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          ({ancestors.length + 1 + descendants.length} nodes)
        </Typography>
      </Stack>

      <Stack spacing={0}>
        {/* Ancestors (oldest first — reverse the array) */}
        {[...ancestors].reverse().map((node, i, arr) => (
          <React.Fragment key={node.decisionId || node.sessionId}>
            {type === 'decision'
              ? renderDecisionNode(node, false)
              : renderSessionNode(node, false, i > 0 ? arr[i - 1].sessionId : null)
            }
            <ChainArrow label={type === 'decision' ? 'superseded by' : null} />
          </React.Fragment>
        ))}

        {/* Current node */}
        {type === 'decision'
          ? renderDecisionNode(current, true)
          : renderSessionNode(current, true, ancestors.length > 0 ? ancestors[0].sessionId : null)
        }

        {/* Descendants */}
        {descendants.map((node, i) => (
          <React.Fragment key={node.decisionId || node.sessionId}>
            <ChainArrow label={type === 'decision' ? 'superseded by' : null} />
            {type === 'decision'
              ? renderDecisionNode(node, false)
              : renderSessionNode(node, false, i === 0 ? current.sessionId : descendants[i - 1].sessionId)
            }
          </React.Fragment>
        ))}
      </Stack>
    </Box>
  );
}
