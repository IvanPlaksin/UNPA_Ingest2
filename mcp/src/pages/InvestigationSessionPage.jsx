import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, IconButton, CircularProgress, Alert,
  TextField, Chip, Paper, Divider, Tooltip, Button, Badge, Tabs, Tab,
} from '@mui/material';
import {
  ArrowLeft, FlaskConical, GitBranch, AlertTriangle,
  Search, Link2, Network, BookOpen, FileText, Bookmark, StickyNote,
  Cpu, Clock, ScanLine, Braces, User, Bot, GitCommit,
  Send, ExternalLink,
} from 'lucide-react';
import { useInvestigationStore } from '../stores/investigationStore';
import PrimitiveToolbar from '../components/Investigation/PrimitiveToolbar';
import InvestigationGraph from '../components/Investigation/InvestigationGraph';
import VersionTimeline from '../components/Investigation/VersionTimeline';
import DiffViewer from '../components/Investigation/DiffViewer';
import SnapshotBanner from '../components/Investigation/SnapshotBanner';
import SubsessionList from '../components/Investigation/SubsessionList';
import DriftPanel from '../components/Investigation/DriftPanel';
import ArtifactLibrary from '../components/Investigation/ArtifactLibrary';
import { ArtifactRenderer } from '../components/Investigation/renderers';
import ClarificationBubble from '../components/Investigation/ClarificationBubble';
import EntityPickerBubble from '../components/Investigation/EntityPickerBubble';
import ArtifactPreviewDialog from '../components/Investigation/ArtifactPreviewDialog';
import InvestigationChat from '../components/Investigation/InvestigationChat';

// ─── Primitive type metadata ─────────────────────────────────────────────────

const PRIMITIVE_META = {
  LOCATE:    { icon: Search,    color: '#3b82f6', label: 'Locate' },
  CONNECT:   { icon: Link2,     color: '#8b5cf6', label: 'Connect' },
  EXPAND:    { icon: Network,   color: '#06b6d4', label: 'Expand' },
  PROFILE:   { icon: BookOpen,  color: '#f59e0b', label: 'Profile' },
  MATRIX:    { icon: Braces,    color: '#10b981', label: 'Matrix' },
  STRUCTURE: { icon: Cpu,       color: '#ec4899', label: 'Structure' },
  TIMELINE:  { icon: Clock,     color: '#f97316', label: 'Timeline' },
  RESOLVE:   { icon: ScanLine,  color: '#84cc16', label: 'Resolve' },
  SYNTHESIZE:{ icon: FileText,  color: '#a78bfa', label: 'Synthesize' },
  TEXT:      { icon: StickyNote, color: '#64748b', label: 'Note' },
  FREEFORM:  { icon: Bot,       color: '#94a3b8', label: 'Chat' },
};

function PrimitiveChip({ type }) {
  const meta = PRIMITIVE_META[type] || PRIMITIVE_META.FREEFORM;
  const Icon = meta.icon;
  return (
    <Chip
      size="small"
      icon={<Icon size={11} />}
      label={meta.label}
      sx={{ bgcolor: meta.color + '22', color: meta.color, borderColor: meta.color + '44', fontSize: '0.68rem' }}
      variant="outlined"
    />
  );
}

function ArtifactDetailPanel({ artifact, diffResult, diffLoading, onCloseDiff }) {
  if (diffResult !== undefined) {
    // Diff mode: show DiffViewer instead of artifact detail
    return (
      <Box sx={{ p: 1.5, height: '100%', overflow: 'auto' }}>
        <DiffViewer diff={diffResult} loading={diffLoading} onClose={onCloseDiff} />
      </Box>
    );
  }

  if (!artifact) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.3, px: 2 }}>
        <Bookmark size={32} />
        <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
          Click an artifact node in the graph to inspect it
        </Typography>
      </Box>
    );
  }

  const { content, primitiveType, createdAt } = artifact;
  const meta = PRIMITIVE_META[primitiveType] || PRIMITIVE_META.FREEFORM;
  const Icon = meta.icon;

  const Renderer = <ArtifactRenderer artifact={artifact} compact={false} />;

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Icon size={18} style={{ color: meta.color }} />
        <Typography variant="subtitle2" fontWeight={700}>{meta.label}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {new Date(createdAt).toLocaleTimeString()}
        </Typography>
      </Stack>
      <Divider sx={{ mb: 1.5 }} />
      {Renderer}
    </Box>
  );
}

// ─── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({ messages, sending, onSend, onRunTool, onAddArtifact, onPreviewArtifact, disabled, sessionId }) {
  const [text, setText] = useState('');
  const [entityContext, setEntityContext] = useState([]); // [{id, label, type, namespace}]
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSetEntityContext = useCallback((entities) => {
    setEntityContext(entities);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && entityContext.length === 0) || sending || disabled) return;

    let finalText = trimmed;
    if (!finalText) finalText = `Use entities: ${entityContext.map(e => e.label).join(', ')}`;

    // Append entity names as context hint for the LLM to extract
    const contextSuffix = entityContext.length > 0
      ? ` [${entityContext.map(e => e.label).join(', ')}]`
      : '';

    onSend(finalText + contextSuffix, entityContext);
    setText('');
    setEntityContext([]);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 5, opacity: 0.35 }}>
            <FlaskConical size={28} />
            <Typography variant="body2" sx={{ mt: 1, fontSize: '0.8rem' }}>
              Type a query or use the toolbar buttons above
            </Typography>
          </Box>
        )}
        {messages.map((msg, i) => (
          <ChatBubble
            key={i}
            msg={msg}
            sessionId={sessionId}
            onRunTool={onRunTool}
            onAddArtifact={onAddArtifact}
            onSetEntityContext={handleSetEntityContext}
            onPreviewArtifact={onPreviewArtifact}
          />
        ))}
        {sending && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 1, opacity: 0.7 }}>
            <CircularProgress size={12} />
            <Typography variant="caption">Investigating…</Typography>
          </Box>
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Entity context strip — pinned entities from LOCATE picker */}
      {entityContext.length > 0 && (
        <Box sx={{ px: 1.5, py: 0.6, borderTop: 1, borderColor: 'primary.light', bgcolor: 'primary.50' }}>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.4 }}>
            <Typography variant="caption" sx={{ fontSize: '0.62rem', color: 'primary.main', fontWeight: 700, flexShrink: 0 }}>
              Context:
            </Typography>
            {entityContext.map(e => (
              <Chip
                key={e.id}
                label={e.label}
                size="small"
                onDelete={() => setEntityContext(ctx => ctx.filter(c => c.id !== e.id))}
                sx={{ fontSize: '0.65rem', height: 18 }}
                color="primary"
                variant="outlined"
              />
            ))}
          </Stack>
        </Box>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={0.75}>
          <TextField
            fullWidth size="small"
            placeholder={
              disabled ? 'Session closed'
              : entityContext.length > 0 ? 'Describe operation with selected entities…'
              : 'Ask or investigate…'
            }
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={sending || disabled}
            autoComplete="off"
            sx={{ bgcolor: 'background.default' }}
          />
          <IconButton
            type="submit" color="primary"
            disabled={(!text.trim() && entityContext.length === 0) || sending || disabled}
            sx={{
              bgcolor: 'primary.main', color: 'white', width: 36, height: 36,
              '&:hover': { bgcolor: 'primary.dark' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
            }}
          >
            <Send size={16} />
          </IconButton>
        </Stack>
      </Box>
    </Box>
  );
}

function ChatBubble({ msg, sessionId, onRunTool, onAddArtifact, onSetEntityContext, onPreviewArtifact }) {
  const isUser = msg.role === 'user';
  const isError = msg.role === 'error';
  if (isError) {
    return <Alert severity="error" sx={{ mb: 0.5 }}><Typography variant="caption">{msg.text}</Typography></Alert>;
  }

  const isClarification = !isUser && msg.type === 'CLARIFICATION';
  const locateResults = !isUser && msg.primitiveType === 'LOCATE' ? msg.artifact?.content?.results : null;
  const showPicker = locateResults?.length > 1;
  const hasArtifact = !isUser && !!msg.artifact;

  return (
    <Box sx={{ mb: 1.25, display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && msg.primitiveType && msg.primitiveType !== 'FREEFORM' && (
        <Box sx={{ mb: 0.25 }}><PrimitiveChip type={msg.primitiveType} /></Box>
      )}
      <Paper
        elevation={0}
        sx={{
          px: 1.25, py: 0.6, maxWidth: '92%',
          bgcolor: isUser ? 'primary.main' : isClarification ? 'warning.50' : 'action.hover',
          color: isUser ? 'primary.contrastText' : 'text.primary',
          borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
          border: isClarification ? 1 : 0,
          borderColor: 'warning.light',
        }}
      >
        <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {msg.text}
        </Typography>
      </Paper>

      {/* Preview button for artifact messages */}
      {hasArtifact && !isClarification && (
        <Button
          size="small"
          variant="outlined"
          onClick={() => onPreviewArtifact?.(msg.artifact)}
          sx={{ mt: 0.5, fontSize: '0.65rem', py: 0.2, px: 0.75, height: 22, alignSelf: 'flex-start' }}
        >
          {msg.artifact.status === 'PROPOSED' ? 'Preview & Commit' : 'View Result'}
        </Button>
      )}

      {/* Entity clarification selector (AMBIGUOUS / NOT_FOUND issues from AI) */}
      {isClarification && (msg.clarificationIssues?.length > 0 || msg.clarificationOptions?.length > 0) && (
        <ClarificationBubble
          msg={msg}
          sessionId={sessionId}
          onRunTool={onRunTool}
          onAddArtifact={onAddArtifact}
        />
      )}

      {/* Entity picker after LOCATE with multiple results */}
      {showPicker && (
        <EntityPickerBubble
          results={locateResults}
          onSetEntityContext={onSetEntityContext}
        />
      )}
    </Box>
  );
}

// ─── Version & Drift meta strip ───────────────────────────────────────────────

function SessionMetaStrip({ versions, currentVersion, driftInfo, sessionId, onCheckpoint, onOpenDrift }) {
  const [saving, setSaving] = useState(false);
  const handleCheckpoint = async () => {
    setSaving(true);
    try { await onCheckpoint(sessionId, 'checkpoint'); }
    finally { setSaving(false); }
  };

  const driftCount = driftInfo?.driftedArtifacts?.length || 0;
  const vLabel = currentVersion
    ? `${currentVersion.type || 'v'} · ${currentVersion.versionId?.slice(0, 6)}`
    : 'No versions';

  return (
    <Stack
      direction="row" spacing={1.5} alignItems="center"
      sx={{ px: 2, py: 0.75, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap', rowGap: 0.5 }}
    >
      <GitBranch size={13} style={{ opacity: 0.5 }} />
      <Chip size="small" icon={<GitCommit size={10} />} label={vLabel} sx={{ fontSize: '0.68rem', height: 22 }} title="Current version" />
      <Chip size="small" label={`${versions.length} version${versions.length !== 1 ? 's' : ''}`} sx={{ fontSize: '0.68rem', height: 22 }} variant="outlined" />
      {driftCount > 0 && (
        <Tooltip title="Click to view drift details and refresh options">
          <Chip
            size="small"
            icon={<AlertTriangle size={10} />}
            label={`${driftCount} drift`}
            color="warning"
            sx={{ fontSize: '0.68rem', height: 22, cursor: 'pointer' }}
            onClick={onOpenDrift}
          />
        </Tooltip>
      )}
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Save a logical checkpoint version">
        <Button
          size="small" variant="outlined"
          startIcon={saving ? <CircularProgress size={10} /> : <GitCommit size={13} />}
          onClick={handleCheckpoint}
          disabled={saving}
          sx={{ fontSize: '0.72rem', height: 26, px: 1.25 }}
        >
          Checkpoint
        </Button>
      </Tooltip>
    </Stack>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InvestigationSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [rightTab, setRightTab] = useState(0); // 0 = Detail, 1 = Library, 2 = Subsessions
  const [previewArtifact, setPreviewArtifact] = useState(null);

  const {
    activeSession, sessionLoading, sessionError,
    messages, artifacts, versions, currentVersion,
    selectedArtifactId, chatSending, driftInfo,
    // snapshot / diff state
    viewingVersionId, isSnapshotMode, snapshotState, snapshotLoading,
    isDiffMode, diffResult, diffLoading,
    // subsessions
    subsessions,
    // drift
    driftPanelOpen,
    // actions
    fetchSession, sendMessage, selectArtifact, cutCheckpoint, resetSession,
    viewVersionSnapshot, exitSnapshot, loadDiff, closeDiff, refreshVersions,
    checkDrift, openDriftPanel, closeDriftPanel, refreshArtifact, refreshAllDriftedArtifacts,
    runTool, commitArtifact, discardArtifact, rerunArtifact, appendArtifact,
  } = useInvestigationStore();

  useEffect(() => {
    fetchSession(sessionId);
    return () => resetSession();
  }, [sessionId]);

  // Refresh version list and drift after new artifacts arrive
  const artifactCount = artifacts.length;
  useEffect(() => {
    if (artifactCount > 0) {
      refreshVersions(sessionId);
      checkDrift(sessionId);
    }
  }, [artifactCount]);

  const sessionClosed = activeSession?.status !== 'ACTIVE';

  // Graph shows snapshot artifacts when in snapshot mode, else live artifacts
  const graphArtifacts = isSnapshotMode && snapshotState
    ? snapshotState.artifacts
    : artifacts;

  const selectedArtifact = graphArtifacts.find(a => a.artifactId === selectedArtifactId) || null;

  const handleSend = useCallback(async (text, resolvedEntities = []) => {
    await sendMessage(sessionId, text, resolvedEntities);
    // Refresh versions shortly after for evidentiary version updates
    setTimeout(() => refreshVersions(sessionId), 800);
  }, [sessionId, sendMessage, refreshVersions]);

  const handleViewSnapshot = useCallback((versionId) => {
    closeDiff();
    viewVersionSnapshot(sessionId, versionId);
  }, [sessionId, viewVersionSnapshot, closeDiff]);

  const handleDiff = useCallback((fromId, toId) => {
    exitSnapshot();
    loadDiff(sessionId, fromId, toId);
  }, [sessionId, loadDiff, exitSnapshot]);

  // ── Loading / Error states ────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (sessionError && !activeSession) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{sessionError}</Alert>
        <Button onClick={() => navigate('/investigation')} sx={{ mt: 2 }}>Back to sessions</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ══ HEADER ═════════════════════════════════════════════════════════════ */}
      <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 0.75 }}>
          <Tooltip title="Back to sessions">
            <IconButton size="small" onClick={() => navigate('/investigation')}>
              <ArrowLeft size={17} />
            </IconButton>
          </Tooltip>
          <FlaskConical size={16} style={{ opacity: 0.5, flexShrink: 0 }} />
          <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ flex: 1, minWidth: 0 }}>
            {activeSession?.name || '…'}
          </Typography>
          {activeSession && (
            <Chip
              size="small"
              label={activeSession.status}
              color={activeSession.status === 'ACTIVE' ? 'success' : 'default'}
              sx={{ fontSize: '0.7rem', height: 20 }}
            />
          )}
          <Typography variant="caption" color="text.secondary" sx={{ pr: 0.5 }}>
            {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
          </Typography>
        </Stack>

        {/* Subsession indicator — shown when this session has a parent */}
        {activeSession?.parentSessionId && (
          <Stack direction="row" alignItems="center" sx={{ px: 1.5, pb: 0.5 }}>
            <Chip
              size="small"
              icon={<GitBranch size={10} />}
              label={`Subsession`}
              color="secondary"
              variant="outlined"
              onClick={() => navigate(`/investigation/${activeSession.parentSessionId}`)}
              sx={{ fontSize: '0.68rem', height: 20, cursor: 'pointer' }}
              deleteIcon={<ExternalLink size={10} />}
              onDelete={() => navigate(`/investigation/${activeSession.parentSessionId}`)}
              title="Click to go to parent session"
            />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1, fontSize: '0.68rem' }}>
              Parent session context is available to the agent
            </Typography>
          </Stack>
        )}

        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, pb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
          <Typography variant="overline" sx={{ color: 'text.disabled', fontSize: '0.65rem', mr: 0.5 }}>
            Run:
          </Typography>
          <PrimitiveToolbar
            sessionId={sessionId}
            disabled={sessionClosed || chatSending || isSnapshotMode}
            onRunTool={runTool}
            onCommit={commitArtifact}
            onDiscard={discardArtifact}
          />
          {isSnapshotMode && (
            <Chip size="small" label="Snapshot: primitives disabled" color="warning" sx={{ fontSize: '0.65rem', height: 20 }} />
          )}
        </Stack>
      </Box>

      {/* ══ VERSION / DRIFT META STRIP ════════════════════════════════════════ */}
      <SessionMetaStrip
        versions={versions}
        currentVersion={currentVersion}
        driftInfo={driftInfo}
        sessionId={sessionId}
        onCheckpoint={cutCheckpoint}
        onOpenDrift={openDriftPanel}
      />

      {/* ══ BODY — 3-column layout ════════════════════════════════════════════ */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Chat panel */}
        <Box sx={{ width: 320, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Typography variant="overline" sx={{ px: 2, pt: 1, color: 'text.disabled', fontSize: '0.65rem', flexShrink: 0 }}>
            Chat
          </Typography>
          <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <InvestigationChat
              messages={messages}
              sending={chatSending}
              onSend={handleSend}
              onRunTool={runTool}
              onAddArtifact={appendArtifact}
              onViewResult={setPreviewArtifact}
              sessionId={sessionId}
              disabled={sessionClosed || isSnapshotMode}
            />
          </Box>
        </Box>

        {/* Investigation Graph (center) */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
          <Typography variant="overline" sx={{ px: 2, pt: 1, color: 'text.disabled', fontSize: '0.65rem', flexShrink: 0 }}>
            {isSnapshotMode ? 'Investigation Graph · Snapshot' : 'Investigation Graph'}
          </Typography>

          {/* Snapshot banner */}
          {isSnapshotMode && (
            <SnapshotBanner
              versionState={snapshotState}
              onExit={exitSnapshot}
            />
          )}
          {snapshotLoading && (
            <Box sx={{ px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={12} />
              <Typography variant="caption" color="text.secondary">Loading snapshot…</Typography>
            </Box>
          )}

          <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
            <InvestigationGraph
              artifacts={graphArtifacts}
              selectedArtifactId={selectedArtifactId}
              onSelectArtifact={isSnapshotMode ? undefined : selectArtifact}
            />
          </Box>
        </Box>

        {/* Right panel — tabbed: Detail | Subsessions */}
        <Box sx={{ width: 300, flexShrink: 0, borderLeft: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Tabs
            value={isDiffMode ? 0 : rightTab}
            onChange={(_, v) => { setRightTab(v); if (isDiffMode) closeDiff(); }}
            sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 34, px: 0.5 }}
            TabIndicatorProps={{ sx: { height: 2 } }}
          >
            <Tab label={isDiffMode ? 'Diff' : 'Detail'} sx={{ fontSize: '0.68rem', minHeight: 34, px: 1.25, py: 0 }} />
            <Tab
              label={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>Library</span>
                  {artifacts.filter(a => a.status === 'PROPOSED').length > 0 && (
                    <Chip size="small" label={artifacts.filter(a => a.status === 'PROPOSED').length}
                      color="warning" sx={{ height: 13, fontSize: '0.52rem', pointerEvents: 'none' }} />
                  )}
                </Stack>
              }
              sx={{ fontSize: '0.68rem', minHeight: 34, px: 1.25, py: 0 }}
            />
            <Tab
              label={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <span>Sub</span>
                  {subsessions.length > 0 && (
                    <Chip size="small" label={subsessions.length} sx={{ height: 13, fontSize: '0.52rem', pointerEvents: 'none' }} />
                  )}
                </Stack>
              }
              sx={{ fontSize: '0.68rem', minHeight: 34, px: 1.25, py: 0 }}
            />
          </Tabs>
          <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            {(isDiffMode || rightTab === 0) && (
              <ArtifactDetailPanel
                artifact={isDiffMode ? null : selectedArtifact}
                diffResult={isDiffMode ? diffResult : undefined}
                diffLoading={isDiffMode ? diffLoading : false}
                onCloseDiff={closeDiff}
              />
            )}
            {!isDiffMode && rightTab === 1 && (
              <ArtifactLibrary
                sessionId={sessionId}
                artifacts={graphArtifacts}
                selectedArtifactId={selectedArtifactId}
                onSelectArtifact={selectArtifact}
                onPreviewArtifact={setPreviewArtifact}
                onCommit={commitArtifact}
                onDiscard={discardArtifact}
                loading={false}
              />
            )}
            {!isDiffMode && rightTab === 2 && (
              <SubsessionList
                sessionId={sessionId}
                sessionName={activeSession?.name}
                sessionStatus={activeSession?.status}
              />
            )}
          </Box>
        </Box>

      </Box>

      {/* ══ VERSION TIMELINE (bottom) ════════════════════════════════════════ */}
      <VersionTimeline
        versions={versions}
        currentVersionId={currentVersion?.versionId}
        viewingVersionId={viewingVersionId}
        onViewVersion={handleViewSnapshot}
        onDiff={handleDiff}
      />

      {/* ══ DRIFT PANEL (slide-out drawer) ═══════════════════════════════════ */}
      <DriftPanel
        open={driftPanelOpen}
        onClose={closeDriftPanel}
        driftData={driftInfo}
        driftLoading={false}
        onRefreshArtifact={(artifactId) => refreshArtifact(sessionId, artifactId)}
        onRefreshAll={() => refreshAllDriftedArtifacts(sessionId)}
      />

      {/* ══ ARTIFACT PREVIEW DIALOG ══════════════════════════════════════════ */}
      <ArtifactPreviewDialog
        artifact={previewArtifact}
        sessionId={sessionId}
        open={!!previewArtifact}
        onClose={() => setPreviewArtifact(null)}
        onCommit={async (sid, artifactId) => {
          await commitArtifact(sid, artifactId);
          setPreviewArtifact(null);
        }}
        onDiscard={async (artifactId) => {
          await discardArtifact(artifactId);
          setPreviewArtifact(null);
        }}
        onRerun={async (artifact) => {
          await rerunArtifact(sessionId, artifact.artifactId);
          setPreviewArtifact(null);
        }}
      />

    </Box>
  );
}
