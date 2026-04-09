/**
 * SuggestionsPanel (WS3-005)
 *
 * Shows actionable suggestions from cross-source analysis:
 *   - Potential links: pairs of similar drafts that should be linked
 *   - Isolated entities: drafts with no edges
 *   - Orphan sources: sources with no extracted drafts
 *
 * Each suggestion has Link/Ignore/Delete/Find/Extract actions.
 * Ignored suggestions are persisted in localStorage per workspace.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Stack, Typography, IconButton, Tooltip, CircularProgress, Alert,
  Chip, Button, Divider, Collapse
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Link as LinkIcon,
  VisibilityOff as IgnoreIcon,
  Delete as DeleteIcon,
  Search as FindIcon,
  CloudUpload as ExtractIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Lightbulb as IdeaIcon
} from '@mui/icons-material';
import {
  getAnalysisSuggestions,
  createEdge,
  deleteDraft
} from '../../../services/workspace.service';

const STORAGE_KEY = (wsId) => `workspace:${wsId}:ignored-suggestions`;

const loadIgnored = (wsId) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(wsId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
};

const saveIgnored = (wsId, set) => {
  try {
    localStorage.setItem(STORAGE_KEY(wsId), JSON.stringify([...set]));
  } catch { /* quota exceeded etc — ignore */ }
};

const linkKey = (a, b) => [a, b].sort().join('|');

const Section = ({ title, count, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ mb: 1 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        sx={{ cursor: 'pointer', px: 1.25, py: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ flex: 1 }}>
          {title}
        </Typography>
        <Chip size="small" label={count} sx={{ height: 16, fontSize: '0.6rem' }} />
      </Stack>
      <Collapse in={open}>
        <Box sx={{ pl: 1.25, pr: 1, pt: 0.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
};

const SuggestionsPanel = ({ workspaceId }) => {
  const [data, setData] = useState({ isolatedEntities: [], potentialLinks: [], orphanSources: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // ID of action being executed
  const [ignored, setIgnored] = useState(() => loadIgnored(workspaceId));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getAnalysisSuggestions(workspaceId, { limit: 50 });
      setData(resp?.data || { isolatedEntities: [], potentialLinks: [], orphanSources: [] });
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);
  // Reload ignored set when workspace changes
  useEffect(() => { setIgnored(loadIgnored(workspaceId)); }, [workspaceId]);

  // Filter out ignored suggestions for rendering
  const visible = useMemo(() => {
    const filteredLinks = data.potentialLinks.filter(l => !ignored.has(linkKey(l.entity1.id, l.entity2.id)));
    const filteredIsolated = data.isolatedEntities.filter(e => !ignored.has(`isolated:${e.id}`));
    const filteredOrphan = data.orphanSources.filter(s => !ignored.has(`orphan:${s.id}`));
    return { potentialLinks: filteredLinks, isolatedEntities: filteredIsolated, orphanSources: filteredOrphan };
  }, [data, ignored]);

  const totalCount = visible.potentialLinks.length + visible.isolatedEntities.length + visible.orphanSources.length;

  // ───── Actions ─────

  const handleIgnore = useCallback((key) => {
    setIgnored(prev => {
      const next = new Set(prev);
      next.add(key);
      saveIgnored(workspaceId, next);
      return next;
    });
  }, [workspaceId]);

  const handleLinkPair = useCallback(async (link) => {
    const id = `link:${link.entity1.id}`;
    setBusy(id);
    try {
      await createEdge(workspaceId, {
        sourceId: link.entity1.id,
        targetId: link.entity2.id,
        edgeType: 'RELATES_TO',
        confidence: link.similarity || 0.8
      });
      // Mark as ignored so it disappears from the list (now it's linked)
      handleIgnore(linkKey(link.entity1.id, link.entity2.id));
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setBusy(null);
    }
  }, [workspaceId, handleIgnore]);

  const handleDeleteIsolated = useCallback(async (entity) => {
    if (!window.confirm(`Delete isolated draft "${entity.name}"?`)) return;
    setBusy(`del:${entity.id}`);
    try {
      await deleteDraft(workspaceId, entity.id);
      // Remove from local state
      setData(prev => ({
        ...prev,
        isolatedEntities: prev.isolatedEntities.filter(e => e.id !== entity.id)
      }));
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setBusy(null);
    }
  }, [workspaceId]);

  const handleFindLinks = useCallback((entity) => {
    // Cross-panel: ask the agent to find links for this entity
    window.dispatchEvent(new CustomEvent('workspace:agent:prefill', {
      detail: {
        workspaceId,
        message: `Find potential connections for the draft entity "${entity.name}" (id: ${entity.id}). Search the workspace and KB for related concepts and suggest links.`
      }
    }));
  }, [workspaceId]);

  const handleExtractSource = useCallback((source) => {
    // Cross-panel: nudge the agent to extract this source
    window.dispatchEvent(new CustomEvent('workspace:agent:prefill', {
      detail: {
        workspaceId,
        message: `Extract entities and rules from the source "${source.name}" (id: ${source.id}). It currently has no extracted drafts.`
      }
    }));
  }, [workspaceId]);

  const handleResetIgnored = useCallback(() => {
    setIgnored(new Set());
    try { localStorage.removeItem(STORAGE_KEY(workspaceId)); } catch { /* */ }
  }, [workspaceId]);

  // ───── Render ─────

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ p: 1.25, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IdeaIcon fontSize="small" sx={{ color: 'warning.main' }} />
          <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ flex: 1 }}>
            SUGGESTIONS ({totalCount})
          </Typography>
          <Tooltip title="Reload">
            <IconButton size="small" onClick={load}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {ignored.size > 0 && (
            <Tooltip title={`Reset ${ignored.size} ignored`}>
              <IconButton size="small" onClick={handleResetIgnored}>
                <RefreshIcon fontSize="small" sx={{ color: 'text.disabled' }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0, fontSize: '0.7rem' }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={18} />
        </Box>
      ) : totalCount === 0 ? (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', py: 2, fontStyle: 'italic' }}>
          No suggestions
        </Typography>
      ) : (
        <Box sx={{ overflowY: 'auto', minHeight: 0 }}>
          {visible.potentialLinks.length > 0 && (
            <Section title="POTENTIAL LINKS" count={visible.potentialLinks.length}>
              {visible.potentialLinks.map((link) => {
                const key = linkKey(link.entity1.id, link.entity2.id);
                const id = `link:${link.entity1.id}`;
                const isBusy = busy === id;
                return (
                  <Box key={key} sx={{ borderLeft: 3, borderColor: 'info.main', pl: 1, py: 0.5, mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontSize: '0.7rem', display: 'block', fontWeight: 500 }}>
                      {link.entity1.name} ↔ {link.entity2.name}
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                      <Chip
                        label={`${Math.round((link.similarity || 0) * 100)}%`}
                        size="small"
                        sx={{ height: 14, fontSize: '0.55rem' }}
                      />
                      <Box sx={{ flex: 1 }} />
                      <Tooltip title="Link">
                        <span>
                          <IconButton size="small" onClick={() => handleLinkPair(link)} disabled={isBusy}>
                            {isBusy ? <CircularProgress size={12} /> : <LinkIcon sx={{ fontSize: 14 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Ignore">
                        <IconButton size="small" onClick={() => handleIgnore(key)}>
                          <IgnoreIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                );
              })}
            </Section>
          )}

          {visible.isolatedEntities.length > 0 && (
            <Section title="ISOLATED ENTITIES" count={visible.isolatedEntities.length}>
              {visible.isolatedEntities.slice(0, 20).map((entity) => {
                const id = `del:${entity.id}`;
                const isBusy = busy === id;
                return (
                  <Box key={entity.id} sx={{ borderLeft: 3, borderColor: 'warning.main', pl: 1, py: 0.5, mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontSize: '0.7rem', display: 'block', fontWeight: 500 }}>
                      {entity.name}
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                      <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', flex: 1 }}>
                        {entity.type}
                      </Typography>
                      <Tooltip title="Find links via agent">
                        <IconButton size="small" onClick={() => handleFindLinks(entity)}>
                          <FindIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <span>
                          <IconButton size="small" onClick={() => handleDeleteIsolated(entity)} disabled={isBusy}>
                            {isBusy ? <CircularProgress size={12} /> : <DeleteIcon sx={{ fontSize: 14 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Ignore">
                        <IconButton size="small" onClick={() => handleIgnore(`isolated:${entity.id}`)}>
                          <IgnoreIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                );
              })}
              {visible.isolatedEntities.length > 20 && (
                <Typography variant="caption" color="text.disabled" sx={{ pl: 1, fontSize: '0.65rem' }}>
                  …and {visible.isolatedEntities.length - 20} more
                </Typography>
              )}
            </Section>
          )}

          {visible.orphanSources.length > 0 && (
            <Section title="ORPHAN SOURCES" count={visible.orphanSources.length}>
              {visible.orphanSources.map((source) => (
                <Box key={source.id} sx={{ borderLeft: 3, borderColor: 'error.main', pl: 1, py: 0.5, mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', display: 'block', fontWeight: 500, wordBreak: 'break-all' }}>
                    {source.name}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                    <Chip
                      label={source.status || 'PENDING'}
                      size="small"
                      sx={{ height: 14, fontSize: '0.55rem' }}
                    />
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title="Extract via agent">
                      <IconButton size="small" onClick={() => handleExtractSource(source)}>
                        <ExtractIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Ignore">
                      <IconButton size="small" onClick={() => handleIgnore(`orphan:${source.id}`)}>
                        <IgnoreIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              ))}
            </Section>
          )}
        </Box>
      )}
    </Box>
  );
};

export default SuggestionsPanel;
